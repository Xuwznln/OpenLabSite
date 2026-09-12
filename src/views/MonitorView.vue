<script setup lang="ts">
/**
 * 监控中心：调度、动作与物料事件的实时视图。
 * 数据按周期快照同步，物料失效通知到达时立即增量刷新。
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { NButton, NIcon, NInput, NSelect } from "naive-ui";
import {
  CubeOutline,
  FlashOutline,
  GitNetworkOutline,
  HardwareChipOutline,
  RefreshOutline,
} from "@vicons/ionicons5";
import type { BackendWorkflowNodeJob, BackendWorkflowTask } from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import { actorTypeLabel } from "../features/actor-type";
import { ACTIVE_JOB_STATUSES, declaredTimeoutS, describeNodeJob, describeTask, parseIsoMs } from "../features/task-jobs";
import { useSchedulerStore } from "../stores/scheduler";

/**
 * 页面内视图模型：把 workflow / telemetry / history / materials 投影
 * 归一为按通道分流的事件。字段命名沿用监控中心既有模板。
 */
type MonitorChannel = "material" | "device" | "action" | "scheduler" | "status";

interface MonitorEvent {
  seq: number;
  /** epoch 秒。 */
  ts: number;
  channel: MonitorChannel;
  type: string;
  data: Record<string, unknown>;
}

interface MonitorDeviceStatus {
  device_id: string;
  status: "busy" | "idle";
  action_name?: string;
  job_id?: string;
  workflow_id?: string;
  /** epoch 秒。 */
  started_at?: number;
  elapsed_s?: number;
  estimated_s?: number;
  last_action?: string;
  last_state?: string;
  /** epoch 秒。 */
  last_seen?: number;
}

interface LedgerEntry {
  ledger_id: number;
  occurred_at: number;
  op_type: string;
  aggregate_type: string;
  aggregate_id: string;
  delta_json: string;
  actor: string;
  reason: string;
  causation_id: string;
}
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";

const conn = useConnectionStore();
const domain = useDomainThemeStore();
const route = useRoute();
const sched = useSchedulerStore();

// ── 事件流状态 ──

// status 通道由 /status-incidents 面板独占消费（stores/status.ts），监控中心不重复渲染
type FeedChannel = Exclude<MonitorChannel, "device" | "status">;
const FEED_CAP = 60;

const feeds = reactive<Record<FeedChannel, MonitorEvent[]>>({
  material: [],
  action: [],
  scheduler: [],
});
const devices = reactive<Map<string, MonitorDeviceStatus>>(new Map());
const schedStats = ref({ workflow_states: {} as Record<string, number>, inflight: 0, reschedule_count: 0 });

const seenSeqs = new Set<string>();
const eventCount = ref(0);
const nowMs = ref(Date.now());

/** 当前数据同步状态；沿用字段名以减少模板噪音。 */
const sseState = ref<"connecting" | "live" | "retry" | "off">("off");

function jobErrorText(errorInfo: unknown): string | null {
  if (!errorInfo || typeof errorInfo !== "object" || Array.isArray(errorInfo)) return null;
  const record = errorInfo as Record<string, unknown>;
  const text = record.message ?? record.error ?? record.type;
  return typeof text === "string" && text ? text : null;
}

function dedupeKey(event: MonitorEvent): string {
  return `${event.channel}|${event.seq}|${event.type}|${String(event.data.job_id ?? event.data.aggregate_id ?? "")}`;
}

function pushFeed(event: MonitorEvent) {
  const key = dedupeKey(event);
  if (seenSeqs.has(key)) return;
  seenSeqs.add(key);
  eventCount.value += 1;
  if (event.channel === "device") {
    applyDeviceEvent(event);
    return;
  }
  const feed = feeds[event.channel as FeedChannel];
  if (!feed) return;
  feed.unshift(event);
  if (feed.length > FEED_CAP) feed.length = FEED_CAP;
  // 实时物料事件到达时提示历史流水区可刷新（不强制自动重拉）
  if (event.channel === "material" && ledgerLoadedOnce) ledgerPendingHint.value = true;
  // 调度事件（提交/终态/重排）即时刷新顶部计数器，不等下一轮周期同步
  if (event.channel === "scheduler") scheduleResync();
  // 动作完成时顺带刷新设备卡的最近状态
  if (event.channel === "action" && event.type === "job_finished") {
    const d = devices.get(String(event.data.device_id ?? ""));
    if (d) {
      d.last_action = String(event.data.action_name ?? "");
      d.last_state = String(event.data.state ?? "");
    }
  }
}

function applyDeviceEvent(event: MonitorEvent) {
  const id = String(event.data.device_id ?? event.data.device_action_key ?? "");
  if (!id) return;
  if (event.type === "device_busy") {
    devices.set(id, {
      device_id: id,
      status: "busy",
      action_name: String(event.data.action_name ?? ""),
      job_id: String(event.data.job_id ?? ""),
      workflow_id: String(event.data.workflow_id ?? ""),
      started_at: event.ts,
    });
  } else if (event.type === "device_idle") {
    const prev = devices.get(id);
    devices.set(id, {
      device_id: id,
      status: "idle",
      last_action: String(event.data.action_name ?? ""),
      last_state: prev?.last_state ?? "",
      last_seen: event.ts,
    });
  }
}

// ── 数据同步生命周期 ──

let resyncTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;
let resyncDebounce: ReturnType<typeof setTimeout> | null = null;

/** 去抖同步：事件密集时合并为一次快照拉取 */
function scheduleResync() {
  if (resyncDebounce) return;
  resyncDebounce = setTimeout(() => {
    resyncDebounce = null;
    void resync();
  }, 400);
}

async function resync() {
  if (!conn.online) return;
  sseState.value = "connecting";
  try {
    const [states, materialChanges, historyEvents, backendEvents] = await Promise.all([
      conn.api.domains.telemetryV1.states(),
      conn.api.domains.materialsV1.changes(0, 500),
      conn.api.domains.historyV1.events({ limit: 500 }),
      conn.api.domains.runtimeV1.backendEvents({ limit: 500 }).catch(() => []),
      sched.refresh(),
    ]);
    // 调度统计与设备忙态来自 Workflow Authority 的 Task / Node Job（本机调度模式下
    // runtime.execution_job 只在 Backend 控制模式写入）。
    const taskByUuid = new Map(sched.tasks.map((task) => [task.uuid, task]));
    const allJobs = Object.entries(sched.jobsByTask).flatMap(([taskUuid, jobs]) =>
      jobs.map((job) => ({ job, task: taskByUuid.get(taskUuid) ?? null })),
    );
    const taskCounts: Record<string, number> = {};
    for (const task of sched.tasks) taskCounts[task.status] = (taskCounts[task.status] ?? 0) + 1;
    schedStats.value = {
      workflow_states: {
        running: taskCounts.running ?? 0,
        waiting_for_material: taskCounts.pending ?? 0,
        success: taskCounts.succeeded ?? 0,
        failed: (taskCounts.failed ?? 0) + (taskCounts.timeout ?? 0),
        canceled: taskCounts.canceled ?? 0,
      },
      inflight: allJobs.filter(({ job }) => ACTIVE_JOB_STATUSES.has(job.status)).length,
      reschedule_count: 0,
    };
    devices.clear();
    const activeByDevice = new Map<string, { job: BackendWorkflowNodeJob; task: BackendWorkflowTask | null; actionName: string }>();
    for (const entry of allJobs) {
      if (!ACTIVE_JOB_STATUSES.has(entry.job.status)) continue;
      const info = describeNodeJob(entry.task, entry.job);
      if (!activeByDevice.has(info.deviceId)) activeByDevice.set(info.deviceId, { ...entry, actionName: info.actionName });
    }
    for (const state of states) {
      const active = activeByDevice.get(state.device_uuid);
      const startedMs = active ? parseIsoMs(active.job.started_at) : null;
      devices.set(state.device_uuid, {
        device_id: state.device_uuid,
        status: active ? "busy" : "idle",
        action_name: active?.actionName,
        job_id: active?.job.uuid,
        workflow_id: active?.task?.uuid,
        started_at: startedMs ? startedMs / 1000 : undefined,
        estimated_s: active ? declaredTimeoutS(active.task, active.job) || undefined : undefined,
        last_state: state.connection_state === "unknown" ? "" : state.connection_state,
        last_seen: state.observed_at_ms / 1000,
      });
    }
    for (const change of materialChanges) {
      pushFeed({
        seq: change.sequence * 4,
        ts: change.occurred_at_ms / 1000,
        channel: "material",
        type: change.operation,
        data: {
          aggregate_id: change.aggregate_uuid,
          aggregate_type: change.aggregate_type,
          payload: change.delta,
          actor_type: change.actor_type,
          actor_uuid: change.actor_uuid ?? null,
          job_uuid: change.job_uuid ?? null,
          command_uuid: change.command_uuid ?? null,
        },
      });
    }
    for (const event of historyEvents) {
      pushFeed({
        seq: (event.sequence ?? 0) * 4 + 1,
        ts: event.occurred_at_ms / 1000,
        channel: "action",
        type: event.event_type,
        data: {
          ...event.summary,
          device_id: event.device_uuid ?? null,
          action_name: event.action_name ?? null,
          job_id: event.job_uuid ?? null,
        },
      });
    }
    for (const event of backendEvents) {
      pushFeed({
        seq: (event.sequence ?? 0) * 4 + 2,
        ts: event.created_at_ms / 1000,
        channel: "scheduler",
        type: event.event_type,
        data: {
          ...event.summary,
          aggregate_id: event.aggregate_uuid ?? null,
          job_id: event.job_uuid ?? null,
        },
      });
    }
    // 本机调度模式没有 history / backend-event 流水：用 Task / Node Job 投影的
    // 时间戳合成「提交 / 终态」「下发 / 完成」事件，保证监控面在两种模式都有内容。
    for (const task of sched.tasks) {
      const createdMs = parseIsoMs(task.create_time);
      if (createdMs) {
        pushFeed({
          seq: createdMs * 4 + 3,
          ts: createdMs / 1000,
          channel: "scheduler",
          type: "task_submitted",
          data: { workflow_id: task.uuid, name: describeTask(task), run_mode: task.run_mode },
        });
      }
      const finishedMs = parseIsoMs(task.finished_at);
      if (finishedMs) {
        pushFeed({
          seq: finishedMs * 4 + 3,
          ts: finishedMs / 1000,
          channel: "scheduler",
          type: `task_${task.status}`,
          data: { workflow_id: task.uuid, name: describeTask(task), state: task.status },
        });
      }
    }
    for (const { job, task } of allJobs) {
      const info = describeNodeJob(task, job);
      const startedMs = parseIsoMs(job.started_at);
      if (startedMs) {
        pushFeed({
          seq: startedMs * 4 + 3,
          ts: startedMs / 1000,
          channel: "action",
          type: "job_started",
          data: { device_id: info.deviceId, action_name: info.actionName, job_id: job.uuid, workflow_id: task?.uuid ?? null, attempt: job.attempt_no },
        });
      }
      const finishedMs = parseIsoMs(job.finished_at);
      if (finishedMs) {
        pushFeed({
          seq: finishedMs * 4 + 3,
          ts: finishedMs / 1000,
          channel: "action",
          type: "job_finished",
          data: {
            device_id: info.deviceId,
            action_name: info.actionName,
            job_id: job.uuid,
            workflow_id: task?.uuid ?? null,
            attempt: job.attempt_no,
            state: job.status,
            elapsed_s: startedMs ? (finishedMs - startedMs) / 1000 : null,
            error: jobErrorText(job.error_info),
          },
        });
      }
    }
    for (const channel of ["material", "action", "scheduler"] as FeedChannel[]) {
      feeds[channel].sort((a, b) => b.ts - a.ts || b.seq - a.seq);
    }
    sseState.value = "live";
  } catch {
    sseState.value = "retry";
    /* 接口未就绪时保留现状，等下一轮同步。 */
  }
}

onMounted(() => {
  void resync();
  resyncTimer = setInterval(() => void resync(), 5000);
  clockTimer = setInterval(() => (nowMs.value = Date.now()), 1000);
  // 仓储页「查看物料流水 →」经路由 query 直达历史流水并预置过滤
  if (String(route.query.material ?? "") === "ledger") {
    materialView.value = "ledger";
    const agg = String(route.query.aggregate ?? "");
    if (agg) ledgerAggFilter.value = agg;
    const op = String(route.query.op ?? "");
    if (op) ledgerOpFilter.value = op;
  }
});

onUnmounted(() => {
  sseState.value = "off";
  if (resyncTimer) clearInterval(resyncTimer);
  if (clockTimer) clearInterval(clockTimer);
  if (resyncDebounce) clearTimeout(resyncDebounce);
});

watch(
  () => conn.baseUrl,
  () => {
    seenSeqs.clear();
    feeds.material.length = feeds.action.length = feeds.scheduler.length = 0;
    devices.clear();
    void resync();
  },
);

// 物料失效通知到达时立即同步（走去抖合并，通知不可用时由周期轮询兜底）
watch(
  () => conn.materialsNoticeRevision,
  () => scheduleResync(),
);

// ── 展示派生 ──

const deviceList = computed(() =>
  [...devices.values()].sort((a, b) => {
    if (a.status !== b.status) return a.status === "busy" ? -1 : 1;
    return a.device_id.localeCompare(b.device_id);
  }),
);

const runningWf = computed(() => schedStats.value.workflow_states["running"] ?? 0);
const waitingWf = computed(
  () => schedStats.value.workflow_states["waiting_for_material"] ?? 0,
);
const doneWf = computed(
  () =>
    (schedStats.value.workflow_states["success"] ?? 0) +
    (schedStats.value.workflow_states["failed"] ?? 0) +
    (schedStats.value.workflow_states["canceled"] ?? 0),
);

function hhmmss(ts: number): string {
  return new Date(ts * 1000).toLocaleTimeString("zh-CN", { hour12: false });
}

function elapsedOf(d: MonitorDeviceStatus): number {
  const started = d.started_at ?? 0;
  return started ? Math.max(0, nowMs.value / 1000 - started) : (d.elapsed_s ?? 0);
}

function progressOf(d: MonitorDeviceStatus): number {
  const est = d.estimated_s ?? 0;
  if (est <= 0) return 0;
  return Math.min(1, elapsedOf(d) / est);
}

function fmtDur(s: number): string {
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  return `${m}m${Math.round(s - m * 60)}s`;
}

function relTime(ts?: number): string {
  if (!ts) return "";
  const diff = Math.max(0, nowMs.value / 1000 - ts);
  if (diff < 60) return `${Math.round(diff)}s 前`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m 前`;
  return `${Math.floor(diff / 3600)}h 前`;
}

// 事件 → 面板行文案

const MATERIAL_LABELS: Record<string, string> = {
  create: "创建",
  move: "移动",
  occupy: "占位",
  vacate: "腾空",
  patch: "更新",
  delete: "删除",
  "lot.created": "批次建档",
  "lot.inbound": "入库",
  "lot.consumed": "消耗",
  "lot.released": "释放",
  "lot.adjusted": "盘点调整",
  "lot.quarantined": "隔离",
  "reservation.created": "预留",
  "reservation.consumed": "预留消耗",
  "reservation.released": "预留释放",
  "reservation.quarantined": "预留隔离",
  "instance.registered": "器材登记",
  "instance.deployed": "部署",
  "instance.moved": "移动",
  "instance.consumed": "用毕",
  "instance.discarded": "废弃",
  "content.updated": "内容物更新",
};

function materialLabel(event: MonitorEvent): string {
  return MATERIAL_LABELS[event.type] ?? event.type;
}

/** 变更来源标签：与物料页「来源」列同一口径（features/actor-type.ts）。 */
function actorLabel(actorType: string): string {
  return actorType ? actorTypeLabel(actorType) : "";
}

/** 数量与原因摘要（物料名称由 EntityRef 单独渲染）。 */
function materialDetail(event: MonitorEvent): string {
  const payload = (event.data.payload ?? {}) as Record<string, unknown>;
  const qty = payload.quantity as number | undefined;
  const total = payload.quantity_total as number | undefined;
  const parts: string[] = [];
  if (qty !== undefined) parts.push(`Δ${qty}`);
  if (total !== undefined) parts.push(`余 ${total}`);
  const reason = String((event.data.reason as string) ?? "");
  if (reason) parts.push(reason);
  return parts.filter(Boolean).join(" · ");
}

/** feed 行说明文本：数量摘要 + 变更来源。 */
function materialMeta(event: MonitorEvent): string {
  const actor = actorLabel(String(event.data.actor_type ?? ""));
  return [materialDetail(event), actor].filter(Boolean).join(" · ");
}

function materialTone(type: string): string {
  if (type.includes("consumed") || type.includes("discarded")) return "warn";
  if (type.includes("quarantine")) return "bad";
  if (type.includes("inbound") || type.includes("created") || type.includes("registered"))
    return "good";
  return "";
}

// ── 物料流水（历史）：materials.v1 change sequence 游标分页 ──

const materialView = ref<"live" | "ledger">("live");
const ledgerEntries = ref<LedgerEntry[]>([]);
const ledgerLoading = ref(false);
const ledgerVisible = ref(50);
const ledgerPendingHint = ref(false);
const ledgerOpFilter = ref<string | null>(null);
const ledgerTypeFilter = ref<string | null>(null);
const ledgerAggFilter = ref("");
let ledgerCursor = 0; // 已拉取的最大 sequence，增量刷新复用
let ledgerLoadedOnce = false;
const LEDGER_PAGE = 500;
const LEDGER_CAP = 3000;

/** after_sequence 游标推进到尾部：首次全量、之后增量补新。 */
async function loadLedger(): Promise<void> {
  if (ledgerLoading.value) return;
  ledgerLoading.value = true;
    try {
    for (let page = 0; page < 20; page++) {
      const rows = await conn.api.domains.materialsV1.changes(ledgerCursor, LEDGER_PAGE);
      if (!rows.length) break;
      const entries: LedgerEntry[] = rows.map((row) => ({
        ledger_id: row.sequence,
        occurred_at: row.occurred_at_ms,
        op_type: row.operation,
        aggregate_type: row.aggregate_type,
        aggregate_id: row.aggregate_uuid,
        delta_json: JSON.stringify(row.delta),
        actor: row.actor_type,
        reason: "",
        causation_id: row.command_uuid ?? row.job_uuid ?? "",
      }));
      ledgerEntries.value.push(...entries);
      ledgerCursor = rows[rows.length - 1].sequence;
      if (rows.length < LEDGER_PAGE) break;
    }
    if (ledgerEntries.value.length > LEDGER_CAP) {
      ledgerEntries.value.splice(0, ledgerEntries.value.length - LEDGER_CAP);
    }
    ledgerLoadedOnce = true;
    ledgerPendingHint.value = false;
  } catch {
    /* 仓储能力不可用时保持空列表 */
  } finally {
    ledgerLoading.value = false;
  }
}

watch(materialView, (view) => {
  if (view === "ledger" && !ledgerLoadedOnce) void loadLedger();
});

const ledgerOpOptions = computed(() => {
  const ops = new Set<string>();
  for (const entry of ledgerEntries.value) ops.add(entry.op_type);
  return [...ops].sort().map((op) => ({
    label: MATERIAL_LABELS[op] ? `${MATERIAL_LABELS[op]} (${op})` : op,
    value: op,
  }));
});

/** 对象类型维度（批次/实例/预留…）：物料库+仓储库变更同屏，不按库拆面板。 */
const LEDGER_TYPE_LABELS: Record<string, string> = {
  lot: "批次",
  instance: "实例",
  reservation: "预留",
  content: "内容物",
  template: "品类模板",
  zone: "库位",
};

const ledgerTypeOptions = computed(() => {
  const types = new Set<string>();
  for (const entry of ledgerEntries.value) types.add(entry.aggregate_type);
  return [...types].sort().map((t) => ({
    label: LEDGER_TYPE_LABELS[t] ?? t,
    value: t,
  }));
});

const filteredLedger = computed(() => {
  const agg = ledgerAggFilter.value.trim().toLowerCase();
  const op = ledgerOpFilter.value;
  const type = ledgerTypeFilter.value;
  const rows = ledgerEntries.value.filter((entry) => {
    if (op && entry.op_type !== op) return false;
    if (type && entry.aggregate_type !== type) return false;
    if (agg && !String(entry.aggregate_id ?? "").toLowerCase().includes(agg))
      return false;
    return true;
  });
  rows.sort((a, b) => b.ledger_id - a.ledger_id); // 时间倒序（ledger_id 单调）
  return rows;
});

const visibleLedger = computed(() => filteredLedger.value.slice(0, ledgerVisible.value));

function ledgerTime(entry: LedgerEntry): string {
  const n = Number(entry.occurred_at);
  if (!Number.isFinite(n) || n <= 0) return "";
  const d = new Date(n);
  return `${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")} ${d.toLocaleTimeString("zh-CN", { hour12: false })}`;
}

/** 流水行说明：变更内容 + 来源（对象名称由 EntityRef 单独渲染）。 */
function ledgerDetail(entry: LedgerEntry): string {
  const parts: string[] = [];
  const delta = String(entry.delta_json ?? "");
  if (delta && delta !== "{}") parts.push(delta.length > 80 ? `${delta.slice(0, 80)}…` : delta);
  if (entry.actor) parts.push(`来源 ${actorLabel(entry.actor)}`);
  return parts.filter(Boolean).join(" · ");
}

function actionTone(event: MonitorEvent): string {
  if (event.type === "job_dispatched" || event.type === "job_started") return "run";
  const state = String(event.data.state ?? "");
  if (state === "success" || state === "succeeded" || state === "skipped") return "good";
  if (state === "failed" || state === "timeout") return "bad";
  return "warn";
}

function actionTitle(event: MonitorEvent): string {
  const dev = String(event.data.device_id ?? "");
  const act = String(event.data.action_name ?? "");
  return `${dev} · ${act}`;
}

const JOB_STATE_LABELS: Record<string, string> = {
  success: "完成",
  succeeded: "完成",
  failed: "失败",
  timeout: "超时",
  canceled: "取消",
  skipped: "跳过",
};

function actionDetail(event: MonitorEvent): string {
  const est = Number(event.data.estimated_s ?? 0);
  const src = String(event.data.estimate_source ?? "");
  const srcMark = src === "declared" ? "D" : src === "historical" ? "H" : "—";
  if (event.type === "job_dispatched") {
    return `节点 ${event.data.node_id} 下发 · 预估 ${fmtDur(est)} (${srcMark})`;
  }
  if (event.type === "job_started") {
    return `开始执行 · attempt ${event.data.attempt ?? 1}`;
  }
  if (event.type === "job_finished") {
    const state = String(event.data.state ?? "");
    const elapsed = event.data.elapsed_s === null || event.data.elapsed_s === undefined ? null : Number(event.data.elapsed_s);
    const actual = Number(event.data.actual_s ?? 0);
    const error = String(event.data.error ?? "");
    const label = JOB_STATE_LABELS[state] ?? state;
    if (elapsed !== null) return `${label} · 用时 ${fmtDur(elapsed)}${error ? ` · ${error}` : ""}`;
    const suc = String(event.data.suc_type ?? "normal");
    const sucMark = suc === "skip" ? " · 跳过" : suc === "operator_intervention" ? " · 人工干预" : "";
    return `${label} ${fmtDur(actual)} / 预估 ${fmtDur(est)}${sucMark}`;
  }
  return event.type;
}

const TASK_STATE_TONES: Record<string, string> = {
  succeeded: "good",
  failed: "bad",
  timeout: "bad",
  canceled: "warn",
};

function schedulerText(event: MonitorEvent): { title: string; detail: string; tone: string } {
  const d = event.data;
  if (event.type === "task_submitted") {
    return { title: String(d.name ?? d.workflow_id), detail: `提交任务 · ${d.run_mode ?? "normal"} 模式`, tone: "run" };
  }
  if (event.type.startsWith("task_")) {
    const state = event.type.slice("task_".length);
    return {
      title: String(d.name ?? d.workflow_id),
      detail: `任务${JOB_STATE_LABELS[state] ?? state}`,
      tone: TASK_STATE_TONES[state] ?? "",
    };
  }
  switch (event.type) {
    case "workflow_submitted":
      return {
        title: `提交 ${d.workflow_id}`,
        detail: `${d.nodes} 节点 · 优先级 ${d.priority} · ${d.state}`,
        tone: "run",
      };
    case "reschedule":
      return {
        title: `重排 #${d.round}`,
        detail: `就绪 ${d.ready} → 派发 ${d.dispatched}`,
        tone: "",
      };
    case "workflow_state": {
      const state = String(d.state ?? "");
      return {
        title: `${d.workflow_id} → ${state}`,
        detail: state === "success" ? "全部节点完成" : state === "failed" ? "存在失败节点" : "已取消",
        tone: state === "success" ? "good" : state === "failed" ? "bad" : "warn",
      };
    }
    case "workflow_resumed":
      return { title: `${d.workflow_id} 恢复运行`, detail: "物料预留就绪", tone: "good" };
    default:
      return { title: event.type, detail: JSON.stringify(d), tone: "" };
  }
}
</script>

<template>
  <div class="deck">
    <!-- 顶部状态条 -->
    <div class="strip">
      <div class="strip-left">
        <span class="strip-domain">{{ domain.config.shortName }}</span>
        <span class="live-dot" :class="sseState" />
        <span class="live-text">
          {{
            sseState === "live"
              ? "实时同步中"
              : sseState === "retry"
                ? "连接重试中"
                : sseState === "connecting"
                  ? "正在同步…"
                  : "离线"
          }}
        </span>
        <span class="strip-sep" />
        <span class="strip-sub">调度、动作与物料事件的实时视图</span>
        <span class="strip-sep" />
        <span class="strip-mono">{{ eventCount }} 条事件</span>
      </div>
      <div class="strip-counters">
        <span class="counter"><b>{{ runningWf }}</b> 运行中</span>
        <span class="counter"><b>{{ waitingWf }}</b> 等待物料</span>
        <span class="counter"><b>{{ schedStats.inflight }}</b> 执行中 job</span>
        <span class="counter"><b>{{ schedStats.reschedule_count }}</b> 重排轮次</span>
        <span class="counter"><b>{{ doneWf }}</b> 已完结</span>
      </div>
    </div>

    <!-- 四面板 -->
    <div class="grid">
      <!-- 平台调度 -->
      <section class="panel">
        <header class="panel-head">
          <NIcon size="14" class="panel-ico"><GitNetworkOutline /></NIcon>
          <span class="panel-label">平台调度</span>
          <span class="panel-count">{{ feeds.scheduler.length }}</span>
        </header>
        <TransitionGroup tag="div" name="feed" class="feed">
          <article
            v-for="event in feeds.scheduler"
            :key="event.seq"
            class="row"
            :class="schedulerText(event).tone"
          >
            <time class="row-time">{{ hhmmss(event.ts) }}</time>
            <div class="row-body">
              <span class="row-title">{{ schedulerText(event).title }}</span>
              <span class="row-detail">{{ schedulerText(event).detail }}</span>
            </div>
          </article>
        </TransitionGroup>
        <div v-if="!feeds.scheduler.length" class="empty">等待调度事件…</div>
      </section>

      <!-- 设备状态 -->
      <section class="panel">
        <header class="panel-head">
          <NIcon size="14" class="panel-ico"><HardwareChipOutline /></NIcon>
          <span class="panel-label">设备状态</span>
          <span class="panel-count">
            {{ deviceList.filter((d) => d.status === "busy").length }}/{{ deviceList.length }} 运行中
          </span>
        </header>
        <div class="dev-grid">
          <article
            v-for="d in deviceList"
            :key="d.device_id"
            class="dev-card"
            :class="d.status"
          >
            <div class="dev-top">
              <span class="dev-dot" :class="d.status" />
              <span class="dev-id">{{ d.device_id }}</span>
              <span class="dev-status">{{ d.status === "busy" ? "运行中" : "空闲" }}</span>
            </div>
            <template v-if="d.status === 'busy'">
              <div class="dev-action">{{ d.action_name }}</div>
              <div class="dev-meta">
                {{ fmtDur(elapsedOf(d)) }}
                <template v-if="(d.estimated_s ?? 0) > 0"> / 预估 {{ fmtDur(d.estimated_s!) }}</template>
              </div>
              <div class="dev-bar">
                <div
                  class="dev-bar-fill"
                  :class="{ over: progressOf(d) >= 1 }"
                  :style="{ width: `${Math.max(4, progressOf(d) * 100)}%` }"
                />
              </div>
            </template>
            <template v-else>
              <div class="dev-action muted">
                {{ d.last_action ? `最近 ${d.last_action}` : "暂无记录" }}
                <span v-if="d.last_state" class="dev-laststate" :class="d.last_state">
                  {{ d.last_state === "success" ? "成功" : d.last_state === "failed" ? "失败" : d.last_state }}
                </span>
              </div>
              <div class="dev-meta muted">{{ relTime(d.last_seen) }}</div>
            </template>
          </article>
        </div>
        <div v-if="!deviceList.length" class="empty">尚无设备活动</div>
      </section>

      <!-- 动作执行 -->
      <section class="panel">
        <header class="panel-head">
          <NIcon size="14" class="panel-ico"><FlashOutline /></NIcon>
          <span class="panel-label">动作执行</span>
          <span class="panel-count">{{ feeds.action.length }}</span>
        </header>
        <TransitionGroup tag="div" name="feed" class="feed">
          <article
            v-for="event in feeds.action"
            :key="event.seq"
            class="row"
            :class="actionTone(event)"
          >
            <time class="row-time">{{ hhmmss(event.ts) }}</time>
            <div class="row-body">
              <span class="row-title">
                <span class="row-mark">{{ event.type === "job_dispatched" ? "▸" : "●" }}</span>
                {{ actionTitle(event) }}
              </span>
              <span class="row-detail">{{ actionDetail(event) }}</span>
            </div>
          </article>
        </TransitionGroup>
        <div v-if="!feeds.action.length" class="empty">等待动作下发…</div>
      </section>

      <!-- materials.v1 change feed + 历史流水同屏 -->
      <section class="panel">
        <header class="panel-head">
          <NIcon size="14" class="panel-ico"><CubeOutline /></NIcon>
          <span class="panel-label">物料变更</span>
          <span class="panel-count">
            {{ materialView === "live" ? feeds.material.length : filteredLedger.length }}
          </span>
          <span class="material-toggle">
            <button
              type="button"
              :class="{ active: materialView === 'live' }"
              @click="materialView = 'live'"
            >
              实时
            </button>
            <button
              type="button"
              :class="{ active: materialView === 'ledger' }"
              @click="materialView = 'ledger'"
            >
              历史流水
              <i v-if="ledgerPendingHint" class="hint-dot" />
            </button>
          </span>
        </header>

        <template v-if="materialView === 'live'">
          <TransitionGroup tag="div" name="feed" class="feed">
            <article
              v-for="event in feeds.material"
              :key="event.seq"
              class="row"
              :class="materialTone(event.type)"
            >
              <time class="row-time">{{ hhmmss(event.ts) }}</time>
              <div class="row-body">
                <span class="row-title">
                  <span class="row-badge">{{ materialLabel(event) }}</span>
                  <span class="row-entity">
                    <EntityRef :uuid="String(event.data.aggregate_id ?? '')" />
                  </span>
                </span>
                <span class="row-detail">
                  {{ materialMeta(event) }}
                  <template v-if="event.data.job_uuid">
                    <span class="row-sep">·</span>
                    <EntityRef :uuid="String(event.data.job_uuid)" mono />
                  </template>
                </span>
              </div>
            </article>
          </TransitionGroup>
          <div v-if="!feeds.material.length" class="empty">等待物料事件…</div>
        </template>

        <template v-else>
          <div class="ledger-filters">
            <NSelect
              v-model:value="ledgerTypeFilter"
              :options="ledgerTypeOptions"
              size="tiny"
              clearable
              placeholder="对象类型"
              style="width: 108px"
            />
            <NSelect
              v-model:value="ledgerOpFilter"
              :options="ledgerOpOptions"
              size="tiny"
              clearable
              filterable
              placeholder="操作类型"
              style="width: 150px"
            />
            <NInput
              v-model:value="ledgerAggFilter"
              size="tiny"
              clearable
              placeholder="批次 / 实例 ID"
              style="flex: 1; min-width: 110px"
            />
          </div>
          <div
            v-if="ledgerPendingHint"
            class="ledger-refresh"
            role="button"
            @click="loadLedger"
          >
            <NIcon size="13"><RefreshOutline /></NIcon>
            有新的物料变更，点击刷新历史流水
          </div>
          <div class="feed">
            <article
              v-for="entry in visibleLedger"
              :key="entry.ledger_id"
              class="row"
              :class="materialTone(entry.op_type)"
            >
              <time class="row-time">{{ ledgerTime(entry) }}</time>
              <div class="row-body">
                <span class="row-title">
                  <span class="row-badge">
                    {{ MATERIAL_LABELS[entry.op_type] ?? entry.op_type }}
                  </span>
                  <span class="row-type">
                    {{ LEDGER_TYPE_LABELS[entry.aggregate_type] ?? entry.aggregate_type }}
                  </span>
                  <span class="row-entity">
                    <EntityRef :uuid="String(entry.aggregate_id ?? '')" />
                  </span>
                </span>
                <span class="row-detail">{{ ledgerDetail(entry) }}</span>
              </div>
            </article>
            <div v-if="ledgerLoading" class="empty">读取流水…</div>
            <div v-else-if="!visibleLedger.length" class="empty">
              暂无匹配的物料流水
            </div>
            <NButton
              v-if="filteredLedger.length > ledgerVisible"
              size="tiny"
              quaternary
              block
              @click="ledgerVisible += 50"
            >
              加载更多（还有 {{ filteredLedger.length - ledgerVisible }} 条）
            </NButton>
          </div>
        </template>
      </section>
    </div>
  </div>
</template>

<style scoped>
.deck {
  height: calc(100vh - 152px);
  min-height: 520px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* ── 顶部状态条 ── */
.strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 8px 14px;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 12px;
}

.strip-left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.strip-domain {
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--domain-accent-soft);
  color: var(--domain-accent);
  font: 700 10px var(--font-mono);
  letter-spacing: 0.08em;
}

.live-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #a6acb5;
}
.live-dot.live {
  background: #0e9f6e;
  animation: pulse 1.6s ease-in-out infinite;
}
.live-dot.retry,
.live-dot.connecting {
  background: #d97706;
  animation: pulse 0.9s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(14, 159, 110, 0.35); }
  50% { box-shadow: 0 0 0 5px rgba(14, 159, 110, 0); }
}

.live-text {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #101418;
}

.strip-sep {
  width: 1px;
  height: 14px;
  background: #e8e6e1;
}

.strip-sub {
  font-size: 11px;
  color: #6e7580;
}

.strip-mono {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #6e7580;
}

.strip-counters {
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
}

.counter {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #6e7580;
}
.counter b {
  font-family: var(--font-display);
  font-size: 15px;
  font-weight: 600;
  color: #101418;
  margin-right: 3px;
}

/* ── 面板网格 ── */
.grid {
  flex: 1;
  min-height: 0;
  display: grid;
  grid-template-columns: 1fr 1fr;
  grid-template-rows: 1fr 1fr;
  gap: 10px;
}

@media (max-width: 1100px) {
  .deck { height: auto; }
  .grid {
    grid-template-columns: 1fr;
    grid-template-rows: none;
  }
  .panel { min-height: 300px; max-height: 420px; }
}

.panel {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 14px;
  overflow: hidden;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 14px;
  border-bottom: 1px solid #f0eee9;
  background: #fbfaf8;
}

.panel-ico { color: #2e5bff; }

.panel-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: #101418;
}

.panel-count {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #6e7580;
}

/* ── 事件流 ── */
.feed {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 6px 0;
}

.row {
  display: flex;
  gap: 10px;
  padding: 6px 14px;
  border-left: 2px solid transparent;
}
.row.run { border-left-color: #2e5bff; }
.row.good { border-left-color: #0e9f6e; }
.row.bad { border-left-color: #dc2626; }
.row.warn { border-left-color: #d97706; }

.row-time {
  flex: none;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #a6acb5;
  padding-top: 2px;
  width: 58px;
}

.row-body {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.row-title {
  font-size: 12.5px;
  font-weight: 600;
  color: #101418;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-mark { color: #2e5bff; margin-right: 2px; }
.row.good .row-mark { color: #0e9f6e; }
.row.bad .row-mark { color: #dc2626; }
.row.warn .row-mark { color: #d97706; }

.row-badge {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 1px 6px;
  border-radius: 4px;
  background: #f0eee9;
  color: #101418;
}
.row.good .row-badge { background: rgba(14, 159, 110, 0.12); color: #0e9f6e; }
.row.bad .row-badge { background: rgba(220, 38, 38, 0.1); color: #dc2626; }
.row.warn .row-badge { background: rgba(217, 119, 6, 0.12); color: #d97706; }

.row-detail {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #6e7580;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.row-entity {
  margin-left: 6px;
}

.row-sep {
  margin: 0 4px;
  color: #a6acb5;
}

/* 新事件进入动画 */
.feed-enter-active { transition: all 0.35s ease; }
.feed-enter-from { opacity: 0; transform: translateY(-8px); }
.feed-move { transition: transform 0.25s ease; }

/* ── 设备卡 ── */
.dev-grid {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
  gap: 8px;
  padding: 10px 12px;
  align-content: start;
}

.dev-card {
  border: 1px solid #eceae5;
  border-radius: 10px;
  padding: 9px 11px;
  background: #fff;
}
.dev-card.busy {
  border-color: rgba(46, 91, 255, 0.35);
  background: linear-gradient(180deg, rgba(46, 91, 255, 0.04), transparent 60%);
}

.dev-top {
  display: flex;
  align-items: center;
  gap: 6px;
}

.dev-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #c9cdd3;
}
.dev-dot.busy {
  background: #2e5bff;
  animation: pulse 1.4s ease-in-out infinite;
}

.dev-id {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 600;
  color: #101418;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dev-status {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 10px;
  color: #6e7580;
}
.dev-card.busy .dev-status { color: #2e5bff; }

.dev-action {
  margin-top: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #101418;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.dev-action.muted { color: #6e7580; font-weight: 500; }

.dev-laststate { font-size: 10px; margin-left: 4px; }
.dev-laststate.success { color: #0e9f6e; }
.dev-laststate.failed { color: #dc2626; }

.dev-meta {
  margin-top: 2px;
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: #6e7580;
}
.dev-meta.muted { color: #a6acb5; }

.dev-bar {
  margin-top: 6px;
  height: 3px;
  border-radius: 2px;
  background: #f0eee9;
  overflow: hidden;
}

.dev-bar-fill {
  height: 100%;
  border-radius: 2px;
  background: #2e5bff;
  transition: width 0.9s linear;
}
.dev-bar-fill.over { background: #d97706; }

/* ── 空态 ── */
.empty {
  position: absolute;
  inset: 42px 0 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-mono);
  font-size: 11px;
  color: #a6acb5;
  pointer-events: none;
}

/* ── 物料变更：实时/历史切换与流水过滤 ── */
.material-toggle {
  display: inline-flex;
  border: 1px solid var(--hairline, #e8e6e1);
  border-radius: 999px;
  overflow: hidden;
}

.material-toggle button {
  position: relative;
  border: none;
  background: transparent;
  padding: 2px 10px;
  font-size: 10.5px;
  color: #6e7580;
  cursor: pointer;
}

.material-toggle button.active {
  background: #eef3ff;
  color: #2e5bff;
}

.hint-dot {
  position: absolute;
  top: 2px;
  right: 3px;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #ef4444;
}

.ledger-filters {
  display: flex;
  gap: 6px;
  padding: 6px 10px 4px;
}

.ledger-refresh {
  display: flex;
  align-items: center;
  gap: 5px;
  margin: 0 10px 4px;
  padding: 4px 10px;
  border-radius: 8px;
  background: #eef3ff;
  color: #2e5bff;
  font-size: 11px;
  cursor: pointer;
}

.row-type {
  margin-left: 6px;
  color: #9aa1aa;
  font-size: 10px;
}
</style>
