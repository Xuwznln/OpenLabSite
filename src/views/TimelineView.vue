<script setup lang="ts">
/**
 * 调度泳道：全幅时间轴操作台（非「左图右栏」报表布局）。
 *
 * 交互对齐 IDE 线程/协程泳道图与视频剪辑轨道（Premiere/AE）：
 * - 左侧固定轨道头列：设备名 + 状态点（时间轴平移/缩放时不动）
 * - 轨道区斑马底纹分隔；窗口内无任务的空轨道整体淡化
 * - 任务块圆角 clip：内嵌「动作名 · 耗时」标签，太窄自动省略，hover 原生
 *   tooltip 看全量，点击弹出检视卡（实际 vs 预估、来源、直达运行详情）
 * - 执行中块带斜纹进行纹理 + 呼吸效果，虚线幽灵条到预估终点（超时变琥珀）
 * - 播放头式当前时间指针：标尺上把手三角 + 竖线贯穿全部轨道
 * - 顶部时间刻度尺 + 缩放控件（− / + / 预设 / 适配数据范围）
 * - 拖拽平移、滚轮缩放（围绕光标）、触控板横滑；拖回右缘恢复自动跟随
 *
 * 数据来自 Workflow Authority 的 Task / Node Job 投影（stores/scheduler）：每台设备一条
 * 泳道，每个 attempt 一个块；设备与动作从任务快照节点反查（features/task-jobs）。
 * 预估时长按同一「设备/动作」的历史实际耗时中位数计算；通知只触发重新校准。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { NButton, NIcon } from "naive-ui";
import { CloseOutline, FlashOutline, OpenOutline } from "@vicons/ionicons5";
import type { BackendWorkflowNodeJob, BackendWorkflowTask } from "@openlab/protocol";
import { declaredTimeoutS, describeNodeJob, describeTask, jobOrderKey, parseIsoMs, TERMINAL_JOB_STATUSES } from "../features/task-jobs";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";
import { useSchedulerStore } from "../stores/scheduler";

const router = useRouter();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const sched = useSchedulerStore();

// ── 视图模型（时间单位：epoch 秒） ──

type EstimateSource = "history" | "declared" | "default";

interface TimelineJobBase {
  job_id: string;
  workflow_id: string;
  node_id: string;
  device_id: string;
  action_name: string;
  device_action_key: string;
  attempt: number;
}

interface TimelineRunningJob extends TimelineJobBase {
  started_at: number;
  elapsed_s: number;
  estimated_s: number;
  estimate_source: EstimateSource;
}

interface TimelineCompletedJob extends TimelineJobBase {
  started_at: number;
  ended_at: number;
  actual_s: number;
  estimated_s: number;
  estimate_source: EstimateSource;
  state: "success" | "failed" | "canceled";
  suc_type: string;
}

/** 已入队未开始（pending / ready / dispatched 尚无 started_at）：按设备泳道顺序排到 now 之后。 */
interface TimelineQueuedJob extends TimelineJobBase {
  status: string;
  order: number;
  estimated_s: number;
  estimate_source: EstimateSource;
}

interface EstimatorStat {
  device_action_key: string;
  samples: number;
  median_s: number;
}

interface TimelineResponse {
  now: number;
  window_s: number;
  running: TimelineRunningJob[];
  completed: TimelineCompletedJob[];
  queued: TimelineQueuedJob[];
  estimator: { mode: string; default_s: number; stats: EstimatorStat[] };
}

const DEFAULT_ESTIMATE_S = 60;

const data = ref<TimelineResponse | null>(null);
const nowMs = ref(Date.now());

let pollTimer: ReturnType<typeof setInterval> | null = null;
let clockTimer: ReturnType<typeof setInterval> | null = null;

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

interface TaskJobPair {
  task: BackendWorkflowTask;
  job: BackendWorkflowNodeJob;
}

function buildTimeline(laneJobs: TaskJobPair[], nowS: number): TimelineResponse {
  const running: TimelineRunningJob[] = [];
  const completed: TimelineCompletedJob[] = [];
  const queued: TimelineQueuedJob[] = [];
  const durations = new Map<string, number[]>();
  const described = laneJobs.map(({ task, job }) => {
    const info = describeNodeJob(task, job);
    const startedMs = parseIsoMs(job.started_at);
    const finishedMs = parseIsoMs(job.finished_at);
    return { task, job, info, startedMs, finishedMs, key: `${info.deviceId}:${info.actionName}` };
  });

  for (const item of described) {
    if (item.startedMs && item.finishedMs && item.finishedMs >= item.startedMs) {
      (durations.get(item.key) ?? durations.set(item.key, []).get(item.key)!).push((item.finishedMs - item.startedMs) / 1000);
    }
  }
  const stats: EstimatorStat[] = [...durations.entries()].map(([device_action_key, samples]) => ({
    device_action_key,
    samples: samples.length,
    median_s: median(samples),
  }));
  const estimateOf = (key: string, declaredS: number): { estimated_s: number; estimate_source: EstimateSource } => {
    const stat = stats.find((item) => item.device_action_key === key);
    if (stat && stat.samples >= 1) return { estimated_s: Math.max(stat.median_s, 1), estimate_source: "history" };
    if (declaredS > 0) return { estimated_s: declaredS, estimate_source: "declared" };
    return { estimated_s: DEFAULT_ESTIMATE_S, estimate_source: "default" };
  };

  // 排队顺序：任务提交先后 → 任务内拓扑序
  const taskOrder = new Map(
    [...new Set(described.map((item) => item.task))]
      .sort((a, b) => (parseIsoMs(a.create_time) ?? 0) - (parseIsoMs(b.create_time) ?? 0))
      .map((task, index) => [task.uuid, index]),
  );

  for (const item of described) {
    const base: TimelineJobBase = {
      job_id: item.job.uuid,
      workflow_id: item.task.uuid,
      node_id: item.job.workflow_node_uuid,
      device_id: item.info.deviceId,
      action_name: item.info.actionName,
      device_action_key: item.key,
      attempt: item.job.attempt_no,
    };
    const estimate = estimateOf(item.key, declaredTimeoutS(item.task, item.job));
    if (!item.startedMs) {
      // 只对仍在活跃任务里的未开始作业排队（失败/取消任务的 pending 节点不再执行）
      if (TERMINAL_JOB_STATUSES.has(item.job.status)) continue;
      if (!["pending", "running"].includes(item.task.status)) continue;
      queued.push({
        ...base,
        status: item.job.status,
        order: (taskOrder.get(item.task.uuid) ?? 0) * 100_000 + jobOrderKey(item.task, item.job),
        ...estimate,
      });
      continue;
    }
    const startedAt = item.startedMs / 1000;
    if (!TERMINAL_JOB_STATUSES.has(item.job.status)) {
      running.push({ ...base, started_at: startedAt, elapsed_s: Math.max(nowS - startedAt, 0), ...estimate });
      continue;
    }
    if (!item.finishedMs) continue;
    const endedAt = item.finishedMs / 1000;
    completed.push({
      ...base,
      started_at: startedAt,
      ended_at: endedAt,
      actual_s: Math.max(endedAt - startedAt, 0),
      ...estimate,
      state:
        item.job.status === "succeeded" || item.job.status === "skipped"
          ? "success"
          : item.job.status === "canceled"
            ? "canceled"
            : "failed",
      suc_type: item.job.status === "skipped" ? "skipped" : item.job.status === "timeout" ? "timeout" : "normal",
    });
  }
  queued.sort((a, b) => a.order - b.order);
  return {
    now: nowS,
    window_s: 0,
    running,
    completed,
    queued,
    estimator: { mode: stats.length ? "history-median" : "default", default_s: DEFAULT_ESTIMATE_S, stats },
  };
}

function rebuild() {
  const taskByUuid = new Map(sched.tasks.map((task) => [task.uuid, task]));
  const laneJobs: TaskJobPair[] = [];
  for (const [taskUuid, jobs] of Object.entries(sched.jobsByTask)) {
    const task = taskByUuid.get(taskUuid);
    if (!task) continue;
    for (const job of jobs) laneJobs.push({ task, job });
  }
  const built = buildTimeline(laneJobs, Date.now() / 1000);
  built.window_s = spanMs.value / 1000;
  data.value = built;
}

async function refresh() {
  if (!conn.online) return;
  await sched.refresh();
  rebuild();
}

// ── 时间轴状态：span（缩放）+ 跟随/锚定（平移） ──

const spanMs = ref(15 * 60 * 1000);
const autoFollow = ref(true);
const anchorEndMs = ref(Date.now());

const MIN_SPAN = 60 * 1000;
const MAX_SPAN = 12 * 3600 * 1000;

const ZOOM_PRESETS = [
  { label: "5m", value: 5 * 60 * 1000 },
  { label: "15m", value: 15 * 60 * 1000 },
  { label: "1h", value: 3600 * 1000 },
  { label: "6h", value: 6 * 3600 * 1000 },
];

/** 右缘时刻：自动跟随时 = now + 10% 未来区；平移后 = 拖拽锚点 */
const t1 = computed(() =>
  autoFollow.value ? nowMs.value + spanMs.value * 0.1 : anchorEndMs.value,
);
const t0 = computed(() => t1.value - spanMs.value);

function x(tMs: number): number {
  return ((tMs - t0.value) / spanMs.value) * svgW.value;
}

function timeAt(px: number): number {
  return t0.value + (px / svgW.value) * spanMs.value;
}

function clampBar(startMs: number, endMs: number): { x: number; w: number } | null {
  const s = Math.max(startMs, t0.value);
  const e = Math.min(endMs, t1.value);
  if (e <= s) return null;
  return { x: x(s), w: Math.max(x(e) - x(s), 2) };
}

function setSpan(v: number) {
  spanMs.value = v;
  void refresh();
}

// ── 画布尺寸 ──

const RULER_H = 34;
/** 左侧固定轨道头列宽（设备名 + 状态点；平移/缩放时不动）。 */
const HEAD_W = 150;

const canvasEl = ref<HTMLElement | null>(null);
const svgW = ref(800);
const canvasH = ref(480);
let resizeObs: ResizeObserver | null = null;

/** 单行泳道的基准高度：少量泳道时拉伸铺满画布（轨道式），多了回落到紧凑高度 */
const laneH = computed(() => {
  const avail = canvasH.value - RULER_H - 10;
  const n = Math.max(lanes.value.length, 1);
  return Math.min(116, Math.max(46, Math.floor(avail / n)));
});

const barH = computed(() => (laneH.value >= 84 ? 26 : 18));
/** 同泳道多行（重叠作业）时行与行的间距。 */
const ROW_GAP = 6;

// ── 指针交互：拖拽平移 / 滚轮缩放 / 光标扫描线 ──

const cursorX = ref<number | null>(null);
let dragging = false;
let dragStartX = 0;
let dragStartT1 = 0;
let dragMoved = false;

function canvasX(ev: PointerEvent | WheelEvent): number {
  const rect = canvasEl.value?.getBoundingClientRect();
  // 轨道头列固定在左侧，时间坐标系从 HEAD_W 之后开始
  return rect ? ev.clientX - rect.left - HEAD_W : 0;
}

function onPointerDown(ev: PointerEvent) {
  dragging = true;
  dragMoved = false;
  dragStartX = ev.clientX;
  dragStartT1 = t1.value;
  try {
    (ev.currentTarget as HTMLElement).setPointerCapture(ev.pointerId);
  } catch {
    /* 合成事件（测试）无活动 pointer，可忽略 */
  }
}

function onPointerMove(ev: PointerEvent) {
  const px = canvasX(ev);
  cursorX.value = px >= 0 ? px : null; // 指针在轨道头列上时不显示扫描线
  if (!dragging) return;
  const dx = ev.clientX - dragStartX;
  if (Math.abs(dx) > 4) dragMoved = true;
  const msPerPx = spanMs.value / svgW.value;
  const newEnd = dragStartT1 - dx * msPerPx;
  // 拖回右缘（含未来区）自动恢复当前时刻跟随
  if (newEnd >= Date.now() + spanMs.value * 0.08) {
    autoFollow.value = true;
  } else {
    autoFollow.value = false;
    anchorEndMs.value = newEnd;
  }
}

function onPointerUp() {
  dragging = false;
}

function onPointerLeave() {
  cursorX.value = null;
  dragging = false;
}

function onWheel(ev: WheelEvent) {
  const px = canvasX(ev);
  if (Math.abs(ev.deltaX) > Math.abs(ev.deltaY)) {
    // 触控板横滑 = 平移
    const msPerPx = spanMs.value / svgW.value;
    const newEnd = t1.value + ev.deltaX * msPerPx;
    if (newEnd >= Date.now() + spanMs.value * 0.08) {
      autoFollow.value = true;
    } else {
      autoFollow.value = false;
      anchorEndMs.value = newEnd;
    }
    return;
  }
  // 纵向滚轮 = 围绕光标时间缩放
  const factor = Math.exp(ev.deltaY * 0.0016);
  const newSpan = Math.min(MAX_SPAN, Math.max(MIN_SPAN, spanMs.value * factor));
  const ratio = newSpan / spanMs.value;
  if (!autoFollow.value) {
    const cursorT = timeAt(px);
    anchorEndMs.value = cursorT + (t1.value - cursorT) * ratio;
  }
  spanMs.value = newSpan;
}

// ── 泳道分组 ──

interface LaneJob {
  kind: "running" | "done" | "queued";
  running?: TimelineRunningJob;
  done?: TimelineCompletedJob;
  queued?: TimelineQueuedJob & { planned_start: number };
  /** 泳道内的子行：时间上重叠的作业错开排布，不再互相遮盖。 */
  row: number;
}

interface Lane {
  device: string;
  jobs: LaneJob[];
  /** 子行数（≥1）。 */
  rows: number;
}

/** 区间贪心分行：按开始时间排序，放进第一条"上一段已结束"的子行。 */
function packRows(jobs: LaneJob[]): number {
  const ordered = [...jobs].sort((a, b) => (jobRange(a)?.s ?? 0) - (jobRange(b)?.s ?? 0));
  const rowEnds: number[] = [];
  for (const job of ordered) {
    const range = jobRange(job);
    if (!range) {
      job.row = 0;
      continue;
    }
    let row = rowEnds.findIndex((end) => end <= range.s);
    if (row === -1) {
      row = rowEnds.length;
      rowEnds.push(range.e);
    } else {
      rowEnds[row] = range.e;
    }
    job.row = row;
  }
  return Math.max(rowEnds.length, 1);
}

const lanes = computed<Lane[]>(() => {
  const map = new Map<string, LaneJob[]>();
  const laneKey = (deviceId: string, key: string) => deviceId || key || "unknown";
  for (const j of data.value?.completed ?? []) {
    const k = laneKey(j.device_id, j.device_action_key);
    (map.get(k) ?? map.set(k, []).get(k)!).push({ kind: "done", done: j, row: 0 });
  }
  for (const j of data.value?.running ?? []) {
    const k = laneKey(j.device_id, j.device_action_key);
    (map.get(k) ?? map.set(k, []).get(k)!).push({ kind: "running", running: j, row: 0 });
  }
  // 排队块：从 now（或该泳道运行中作业的预估终点）开始顺序排布，只是预估不是承诺
  const nowS = nowMs.value / 1000;
  const laneCursor = new Map<string, number>();
  for (const j of data.value?.running ?? []) {
    const k = laneKey(j.device_id, j.device_action_key);
    laneCursor.set(k, Math.max(laneCursor.get(k) ?? nowS, j.started_at + j.estimated_s, nowS));
  }
  for (const j of data.value?.queued ?? []) {
    const k = laneKey(j.device_id, j.device_action_key);
    const start = laneCursor.get(k) ?? nowS;
    laneCursor.set(k, start + j.estimated_s);
    (map.get(k) ?? map.set(k, []).get(k)!).push({ kind: "queued", queued: { ...j, planned_start: start }, row: 0 });
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([device, jobs]) => ({ device, jobs, rows: packRows(jobs) }));
});

/** 每条泳道的高度：单行取基准高度，多行按 barH 叠加。 */
function laneHeight(lane: Lane): number {
  if (lane.rows <= 1) return laneH.value;
  return Math.max(laneH.value, lane.rows * (barH.value + ROW_GAP) + 16);
}

/** 泳道顶边 y（前面所有泳道高度之和）。 */
const laneTops = computed(() => {
  const tops: number[] = [];
  let y = 0;
  for (const lane of lanes.value) {
    tops.push(y);
    y += laneHeight(lane);
  }
  return tops;
});

/** 作业块的 y：单行泳道垂直居中；多行泳道按子行从上往下排。 */
function barY(li: number, lane: Lane, job: LaneJob): number {
  const top = laneTops.value[li] ?? 0;
  if (lane.rows <= 1) return top + (laneHeight(lane) - barH.value) / 2;
  const block = lane.rows * (barH.value + ROW_GAP) - ROW_GAP;
  const offset = (laneHeight(lane) - block) / 2;
  return top + offset + job.row * (barH.value + ROW_GAP);
}

function barCenterY(li: number, lane: Lane, job: LaneJob): number {
  return barY(li, lane, job) + barH.value / 2 + 3.5;
}

const queuedCount = computed(() => data.value?.queued.length ?? 0);

/** 泳道区总高：不足画布时补满（网格延伸铺满，空轨道也是画布的一部分） */
const lanesH = computed(() =>
  Math.max(
    lanes.value.reduce((sum, lane) => sum + laneHeight(lane), 0) || laneH.value,
    canvasH.value - RULER_H - 2,
  ),
);

/** 任务块与当前时间窗是否相交（空轨道淡化 / 块标签渲染共用）。 */
function jobRange(job: LaneJob): { s: number; e: number } | null {
  if (job.kind === "done" && job.done) {
    return { s: job.done.started_at * 1000, e: job.done.ended_at * 1000 };
  }
  if (job.kind === "queued" && job.queued) {
    return {
      s: job.queued.planned_start * 1000,
      e: (job.queued.planned_start + job.queued.estimated_s) * 1000,
    };
  }
  if (job.running) {
    return {
      s: job.running.started_at * 1000,
      e: Math.max(
        nowMs.value,
        (job.running.started_at + job.running.estimated_s) * 1000,
      ),
    };
  }
  return null;
}

/** 当前窗口内无任务的轨道整体淡化（数据源本身只含近窗任务，平移后可能空）。 */
function laneVisible(lane: Lane): boolean {
  return lane.jobs.some((job) => {
    const r = jobRange(job);
    return r !== null && r.e > t0.value && r.s < t1.value;
  });
}

function laneRunning(lane: Lane): boolean {
  return lane.jobs.some((job) => job.kind === "running");
}

// ── 缩放控件：− / + / 适配数据范围 ──

function zoomBy(factor: number) {
  spanMs.value = Math.min(MAX_SPAN, Math.max(MIN_SPAN, spanMs.value * factor));
}

/** 适配：把窗口缩放平移到覆盖当前已知的全部任务（含运行中预估终点）。 */
function fitToData() {
  let min = Infinity;
  let max = -Infinity;
  for (const lane of lanes.value) {
    for (const job of lane.jobs) {
      const r = jobRange(job);
      if (!r) continue;
      min = Math.min(min, r.s);
      max = Math.max(max, r.e);
    }
  }
  if (!Number.isFinite(min) || !Number.isFinite(max)) return;
  const pad = Math.max((max - min) * 0.08, 30 * 1000);
  spanMs.value = Math.min(MAX_SPAN, Math.max(MIN_SPAN, max - min + pad * 2));
  if (max + pad >= Date.now()) {
    autoFollow.value = true;
  } else {
    autoFollow.value = false;
    anchorEndMs.value = max + pad;
  }
  void refresh();
}

// ── 任务块内嵌标签：动作名 · 耗时（宽度不够时省略号） ──

/** mono 9.5px 大约 5.9px/字符（中文按 1.7 倍估）；按块宽截断。 */
function fitLabel(text: string, widthPx: number): string {
  const budget = Math.floor((widthPx - 10) / 6);
  if (budget <= 2) return "";
  let used = 0;
  let out = "";
  for (const ch of text) {
    used += ch.charCodeAt(0) > 0x2e7f ? 1.7 : 1;
    if (used > budget) return `${out}…`;
    out += ch;
  }
  return out;
}

function barLabel(job: LaneJob, widthPx: number): string {
  if (job.kind === "done" && job.done) {
    return fitLabel(`${job.done.action_name} · ${fmtDur(job.done.actual_s)}`, widthPx);
  }
  if (job.kind === "queued" && job.queued) {
    return fitLabel(`排队 · ${job.queued.action_name}`, widthPx);
  }
  if (job.running) {
    const ranS = nowMs.value / 1000 - job.running.started_at;
    return fitLabel(`${job.running.action_name} · ${fmtDur(Math.max(ranS, 0))}`, widthPx);
  }
  return "";
}

// ── 时间刻度：按像素密度自适应步长 ──

const TICK_STEPS_S = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600];

const tickStepMs = computed(() => {
  const target = 110; // 期望刻度间距 px
  const msPerPx = spanMs.value / Math.max(svgW.value, 1);
  for (const s of TICK_STEPS_S) {
    if ((s * 1000) / msPerPx >= target) return s * 1000;
  }
  return 21600 * 1000;
});

const ticks = computed(() => {
  const step = tickStepMs.value;
  const list: { x: number; label: string }[] = [];
  const first = Math.ceil(t0.value / step) * step;
  for (let t = first; t <= t1.value; t += step) {
    list.push({ x: x(t), label: fmtTick(t, step) });
  }
  return list;
});

function fmtTick(tMs: number, stepMs: number): string {
  const d = new Date(tMs);
  const p = (v: number) => String(v).padStart(2, "0");
  const hm = `${p(d.getHours())}:${p(d.getMinutes())}`;
  return stepMs >= 60000 ? hm : `${hm}:${p(d.getSeconds())}`;
}

// ── 选中检视 ──

interface SelectedJob {
  kind: "running" | "done" | "queued";
  running?: TimelineRunningJob;
  done?: TimelineCompletedJob;
  queued?: LaneJob["queued"];
}

const selected = ref<SelectedJob | null>(null);

function pick(job: LaneJob) {
  if (dragMoved) return; // 拖拽结束的误触
  selected.value = { kind: job.kind, running: job.running, done: job.done, queued: job.queued };
}

const selectedId = computed(
  () => selected.value?.running?.job_id ?? selected.value?.done?.job_id ?? selected.value?.queued?.job_id ?? "",
);

// ── 预估器 HUD ──

const estimatorOpen = ref(false);

// ── 展示辅助 ──

const DONE_COLORS: Record<string, string> = {
  success: "#0e9f6e",
  failed: "#dc2626",
  canceled: "#a6acb5",
};

const SOURCE_BADGE: Record<string, string> = {
  declared: "D",
  history: "H",
  default: "—",
};

const SOURCE_LABEL: Record<string, string> = {
  declared: "动作声明",
  history: "历史耗时中位数",
  default: "默认兜底",
};

const STATE_LABEL: Record<string, string> = {
  success: "成功",
  failed: "失败",
  canceled: "已取消",
};

function fmtDur(s: number): string {
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${Math.round(s % 60)}s`;
  return `${Math.floor(m / 60)}h${m % 60}m`;
}

function fmtClock(tsS: number): string {
  const d = new Date(tsS * 1000);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** 相对今天的日期词：今天 / 昨天 / 明天，其余给 MM-DD。 */
function dayLabel(tMs: number): string {
  const d = new Date(tMs);
  const today = new Date(nowMs.value);
  const startOf = (v: Date) => new Date(v.getFullYear(), v.getMonth(), v.getDate()).getTime();
  const diffDays = Math.round((startOf(d) - startOf(today)) / 86_400_000);
  if (diffDays === 0) return "今天";
  if (diffDays === -1) return "昨天";
  if (diffDays === 1) return "明天";
  const p = (v: number) => String(v).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 非今天的时刻前面带日期词，避免跨天窗口里 00:31 让人误以为是今天。 */
function fmtCursor(tMs: number): string {
  const label = dayLabel(tMs);
  return label === "今天" ? fmtClock(tMs / 1000) : `${label} ${fmtClock(tMs / 1000)}`;
}

function fmtClockWithDay(tsS: number): string {
  return fmtCursor(tsS * 1000);
}

/** 窗口内的零点：画一条日期分隔线并标日期。 */
const dayBoundaries = computed(() => {
  const out: { x: number; label: string }[] = [];
  const first = new Date(t0.value);
  const cursor = new Date(first.getFullYear(), first.getMonth(), first.getDate() + 1).getTime();
  for (let t = cursor; t < t1.value; t += 86_400_000) {
    const d = new Date(t);
    const p = (v: number) => String(v).padStart(2, "0");
    out.push({ x: x(t), label: `${dayLabel(t)} ${p(d.getMonth() + 1)}-${p(d.getDate())}` });
  }
  return out;
});

/** 左缘日期：窗口起点属于哪一天（跨天时和分隔线一起把日期说清楚）。 */
const windowStartDay = computed(() => {
  const d = new Date(t0.value);
  const p = (v: number) => String(v).padStart(2, "0");
  return `${dayLabel(t0.value)} ${p(d.getMonth() + 1)}-${p(d.getDate())}`;
});

// ── 悬浮卡片：谁占着这段时间 ──

const hoverJob = ref<LaneJob | null>(null);
const hoverPos = ref({ x: 0, y: 0 });

function onBarEnter(job: LaneJob, ev: PointerEvent) {
  hoverJob.value = job;
  onBarMove(ev);
}

function onBarMove(ev: PointerEvent) {
  const rect = canvasEl.value?.getBoundingClientRect();
  if (!rect) return;
  hoverPos.value = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function onBarLeave() {
  hoverJob.value = null;
}

const hoverBase = computed(() => hoverJob.value?.done ?? hoverJob.value?.running ?? hoverJob.value?.queued ?? null);

const hoverTask = computed(() => {
  const base = hoverBase.value;
  return base ? sched.tasks.find((task) => task.uuid === base.workflow_id) ?? null : null;
});

const hoverTitle = computed(() => (hoverTask.value ? describeTask(hoverTask.value) : hoverBase.value?.workflow_id ?? ""));

const hoverNodeName = computed(() => {
  const base = hoverBase.value;
  if (!base || !hoverTask.value) return "";
  const job = (sched.jobsByTask[hoverTask.value.uuid] ?? []).find((item) => item.uuid === base.job_id);
  return job ? describeNodeJob(hoverTask.value, job).nodeName : "";
});

const hoverState = computed(() => {
  const job = hoverJob.value;
  if (!job) return { label: "", color: "#6e7580" };
  if (job.done) return { label: STATE_LABEL[job.done.state] ?? job.done.state, color: DONE_COLORS[job.done.state] ?? "#6e7580" };
  if (job.queued) return { label: `排队中 · ${job.queued.status}`, color: "#6e7580" };
  if (job.running) return { label: isOverrun(job.running) ? "执行中 · 已超预估" : "执行中", color: isOverrun(job.running) ? "#d97706" : "#2e5bff" };
  return { label: "", color: "#6e7580" };
});

/** 卡片放在指针右下，靠边时翻到左侧 / 上方。 */
const hoverStyle = computed(() => {
  const width = 300;
  const height = 170;
  const canvasW = HEAD_W + svgW.value;
  const left = hoverPos.value.x + 14 + width > canvasW ? hoverPos.value.x - width - 12 : hoverPos.value.x + 14;
  const top = hoverPos.value.y + 14 + height > canvasH.value ? hoverPos.value.y - height - 8 : hoverPos.value.y + 14;
  return { left: `${Math.max(left, 4)}px`, top: `${Math.max(top, 4)}px`, width: `${width}px` };
});

function isOverrun(j: TimelineRunningJob): boolean {
  return j.estimated_s > 0 && nowMs.value / 1000 > j.started_at + j.estimated_s;
}

const hasAny = computed(
  () =>
    (data.value?.running?.length ?? 0) + (data.value?.completed?.length ?? 0) + (data.value?.queued?.length ?? 0) > 0,
);

const spanLabel = computed(() => fmtDur(spanMs.value / 1000));

// ── 生命周期 ──

// 调度 store 由外壳全局轮询并响应 SSE 通知；这里只在其数据变化时重建泳道。
watch(
  () => [sched.tasks, sched.jobsByTask] as const,
  () => rebuild(),
);

onMounted(() => {
  void refresh();
  pollTimer = setInterval(() => rebuild(), 3000);
  clockTimer = setInterval(() => (nowMs.value = Date.now()), 500);
  resizeObs = new ResizeObserver((entries) => {
    const rect = entries[0]?.contentRect;
    if (rect?.width && rect.width > 100) svgW.value = Math.max(rect.width - HEAD_W, 100);
    if (rect?.height && rect.height > 100) canvasH.value = rect.height;
  });
});

watch(canvasEl, (el, prev) => {
  if (prev && resizeObs) resizeObs.unobserve(prev);
  if (el && resizeObs) {
    resizeObs.observe(el);
    const rect = el.getBoundingClientRect();
    if (rect.width > 100) svgW.value = Math.max(rect.width - HEAD_W, 100);
    if (rect.height > 100) canvasH.value = rect.height;
  }
});

onUnmounted(() => {
  if (pollTimer !== null) clearInterval(pollTimer);
  if (clockTimer !== null) clearInterval(clockTimer);
  resizeObs?.disconnect();
});
</script>

<template>
  <div class="deck">
    <!-- ── 画布：标尺 + 泳道 ── -->
    <div
      ref="canvasEl"
      class="canvas"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerLeave"
      @wheel.prevent="onWheel"
    >
      <!-- 时间标尺（左角 = 轨道头列表头） -->
      <div class="ruler-row">
        <div class="ruler-corner mono" :style="{ width: `${HEAD_W}px` }" :title="queuedCount ? `${queuedCount} 个作业排队中` : ''">
          {{ domain.config.shortName }}设备轨道 × {{ lanes.length }}<span v-if="queuedCount" class="queue-badge">排队 {{ queuedCount }}</span>
        </div>
        <svg :width="svgW" :height="RULER_H" class="ruler">
        <line :x1="0" :y1="RULER_H - 1" :x2="svgW" :y2="RULER_H - 1" class="ruler-base" />
        <!-- 左缘：窗口起点所属日期 -->
        <text :x="6" :y="11" class="ruler-day">{{ windowStartDay }}</text>
        <g v-for="tick in ticks" :key="`r${tick.x}`">
          <line :x1="tick.x" :y1="RULER_H - 9" :x2="tick.x" :y2="RULER_H - 1" class="ruler-tick" />
          <text :x="tick.x + 5" :y="RULER_H - 12" class="ruler-label">{{ tick.label }}</text>
        </g>
        <!-- 零点：日期分隔 -->
        <g v-for="day in dayBoundaries" :key="`d${day.x}`">
          <line :x1="day.x" :y1="0" :x2="day.x" :y2="RULER_H" class="ruler-day-line" />
          <text :x="day.x + 5" :y="11" class="ruler-day">{{ day.label }}</text>
        </g>
        <!-- 播放头把手 + 「现在 HH:MM:SS」标签：当前时刻（竖线在轨道区贯穿） -->
        <template v-if="x(nowMs) >= 0 && x(nowMs) <= svgW">
          <path
            :d="`M ${x(nowMs) - 6} ${RULER_H - 14} h 12 v 7 l -6 6 -6 -6 Z`"
            class="now-caret"
          />
        </template>
        <!-- 光标时刻气泡 -->
        <template v-if="cursorX !== null">
          <rect
            :x="Math.min(Math.max(cursorX - 34, 2), svgW - 70)"
            :y="4"
            width="68"
            height="17"
            rx="5"
            class="scrub-bubble"
          />
          <text
            :x="Math.min(Math.max(cursorX - 34, 2), svgW - 70) + 34"
            :y="16"
            text-anchor="middle"
            class="scrub-text"
          >
            {{ fmtCursor(timeAt(cursorX)) }}
          </text>
        </template>
        </svg>
      </div>

      <!-- 泳道区（纵向滚动）：左侧固定轨道头列 + 右侧时间轨道 -->
      <div class="lanes-scroll">
        <div class="lanes-inner" :style="{ height: `${lanesH}px` }">
          <!-- 轨道头列：设备名 + 状态点（平移/缩放时不动） -->
          <div class="track-heads" :style="{ width: `${HEAD_W}px` }">
            <div
              v-for="(lane, li) in lanes"
              :key="lane.device"
              class="track-head"
              :class="{ striped: li % 2 === 1, dim: !laneVisible(lane) }"
              :style="{ height: `${laneHeight(lane)}px` }"
            >
              <span
                class="track-dot"
                :class="laneRunning(lane) ? 'running' : 'idle'"
              />
              <span class="track-name mono" :title="lane.device">{{ lane.device }}</span>
              <span v-if="lane.rows > 1" class="track-rows mono" :title="`${lane.rows} 个作业时间重叠，已分行`">×{{ lane.rows }}</span>
            </div>
          </div>

          <svg
            :width="svgW"
            :height="lanesH"
            class="lanes-svg"
            :style="{ marginLeft: `${HEAD_W}px` }"
          >
            <defs>
              <!-- 执行中块的进行纹理（斜纹 clip 效果） -->
              <pattern
                id="run-stripes"
                width="10"
                height="10"
                patternUnits="userSpaceOnUse"
                patternTransform="rotate(-45)"
              >
                <rect width="10" height="10" fill="transparent" />
                <rect width="5" height="10" fill="rgba(255, 255, 255, 0.16)" />
              </pattern>
            </defs>

            <!-- 斑马底纹：奇数轨道浅色带 -->
            <rect
              v-for="(lane, li) in lanes"
              v-show="li % 2 === 1"
              :key="`z${lane.device}`"
              :x="0"
              :y="laneTops[li]"
              :width="svgW"
              :height="laneHeight(lane)"
              class="zebra"
            />

            <!-- 日期分隔（零点） -->
            <line
              v-for="day in dayBoundaries"
              :key="`dl${day.x}`"
              :x1="day.x"
              :y1="0"
              :x2="day.x"
              :y2="lanesH"
              class="day-line"
            />

            <!-- 未来区着色（now → 右缘） -->
            <rect
              v-if="x(nowMs) < svgW"
              :x="Math.max(x(nowMs), 0)"
              :y="0"
              :width="svgW - Math.max(x(nowMs), 0)"
              :height="lanesH"
              class="future-zone"
            />

            <!-- 竖向网格 -->
            <line
              v-for="tick in ticks"
              :key="`g${tick.x}`"
              :x1="tick.x"
              :y1="0"
              :x2="tick.x"
              :y2="lanesH"
              class="grid-line"
            />

            <g
              v-for="(lane, li) in lanes"
              :key="lane.device"
              :class="{ 'lane-dim': !laneVisible(lane) }"
            >
              <line
                :x1="0"
                :y1="laneTops[li] + laneHeight(lane)"
                :x2="svgW"
                :y2="laneTops[li] + laneHeight(lane)"
                class="lane-sep"
              />

              <template
                v-for="job in lane.jobs"
                :key="job.done?.job_id ?? job.running?.job_id ?? job.queued?.job_id"
              >
                <!-- 排队中：虚线轮廓块，按泳道顺序排在 now 之后（预估） -->
                <template v-if="job.kind === 'queued' && job.queued">
                  <g
                    v-if="clampBar(job.queued.planned_start * 1000, (job.queued.planned_start + job.queued.estimated_s) * 1000)"
                    @pointerenter="onBarEnter(job, $event)"
                    @pointermove="onBarMove"
                    @pointerleave="onBarLeave"
                  >
                    <rect
                      :x="clampBar(job.queued.planned_start * 1000, (job.queued.planned_start + job.queued.estimated_s) * 1000)!.x"
                      :y="barY(li, lane, job)"
                      :width="clampBar(job.queued.planned_start * 1000, (job.queued.planned_start + job.queued.estimated_s) * 1000)!.w"
                      :height="barH"
                      rx="5"
                      class="bar queued-bar"
                      :class="{ selected: selectedId === job.queued.job_id }"
                      @click.stop="pick(job)"
                    />
                    <text
                      v-if="clampBar(job.queued.planned_start * 1000, (job.queued.planned_start + job.queued.estimated_s) * 1000)!.w > 42"
                      :x="clampBar(job.queued.planned_start * 1000, (job.queued.planned_start + job.queued.estimated_s) * 1000)!.x + 6"
                      :y="barCenterY(li, lane, job)"
                      class="bar-label queued-label"
                    >
                      {{ barLabel(job, clampBar(job.queued.planned_start * 1000, (job.queued.planned_start + job.queued.estimated_s) * 1000)!.w) }}
                    </text>
                  </g>
                </template>
                <!-- 已完结：圆角 clip 块，内嵌「动作名 · 耗时」 -->
                <template v-else-if="job.kind === 'done' && job.done">
                  <g
                    v-if="clampBar(job.done.started_at * 1000, job.done.ended_at * 1000)"
                    @pointerenter="onBarEnter(job, $event)"
                    @pointermove="onBarMove"
                    @pointerleave="onBarLeave"
                  >
                    <rect
                      :x="clampBar(job.done.started_at * 1000, job.done.ended_at * 1000)!.x"
                      :y="barY(li, lane, job)"
                      :width="clampBar(job.done.started_at * 1000, job.done.ended_at * 1000)!.w"
                      :height="barH"
                      rx="5"
                      :fill="DONE_COLORS[job.done.state] ?? '#6e7580'"
                      class="bar"
                      :class="{ selected: selectedId === job.done.job_id }"
                      @click.stop="pick(job)"
                    />
                    <text
                      v-if="clampBar(job.done.started_at * 1000, job.done.ended_at * 1000)!.w > 42"
                      :x="clampBar(job.done.started_at * 1000, job.done.ended_at * 1000)!.x + 6"
                      :y="barCenterY(li, lane, job)"
                      class="bar-label"
                    >
                      {{ barLabel(job, clampBar(job.done.started_at * 1000, job.done.ended_at * 1000)!.w) }}
                    </text>
                  </g>
                </template>

                <!-- 执行中：进行斜纹 + 呼吸；虚线幽灵条到预估终点 -->
                <template v-else-if="job.running">
                  <g @pointerenter="onBarEnter(job, $event)" @pointermove="onBarMove" @pointerleave="onBarLeave">
                    <rect
                      v-if="clampBar(nowMs, (job.running.started_at + job.running.estimated_s) * 1000)"
                      :x="clampBar(nowMs, (job.running.started_at + job.running.estimated_s) * 1000)!.x"
                      :y="barY(li, lane, job)"
                      :width="clampBar(nowMs, (job.running.started_at + job.running.estimated_s) * 1000)!.w"
                      :height="barH"
                      rx="5"
                      class="ghost-bar"
                    />
                    <g v-if="clampBar(job.running.started_at * 1000, nowMs)" class="run-group">
                      <rect
                        :x="clampBar(job.running.started_at * 1000, nowMs)!.x"
                        :y="barY(li, lane, job)"
                        :width="clampBar(job.running.started_at * 1000, nowMs)!.w"
                        :height="barH"
                        rx="5"
                        class="bar run-bar"
                        :class="{
                          overrun: isOverrun(job.running),
                          selected: selectedId === job.running.job_id,
                        }"
                        @click.stop="pick(job)"
                      />
                      <rect
                        :x="clampBar(job.running.started_at * 1000, nowMs)!.x"
                        :y="barY(li, lane, job)"
                        :width="clampBar(job.running.started_at * 1000, nowMs)!.w"
                        :height="barH"
                        rx="5"
                        fill="url(#run-stripes)"
                        class="run-texture"
                      />
                      <text
                        v-if="clampBar(job.running.started_at * 1000, nowMs)!.w > 42"
                        :x="clampBar(job.running.started_at * 1000, nowMs)!.x + 6"
                        :y="barCenterY(li, lane, job)"
                        class="bar-label"
                      >
                        {{ barLabel(job, clampBar(job.running.started_at * 1000, nowMs)!.w) }}
                      </text>
                    </g>
                  </g>
                </template>
              </template>
            </g>

            <!-- now 红线 + 「现在 HH:MM:SS」标签 + 光标扫描线 -->
            <template v-if="x(nowMs) >= 0 && x(nowMs) <= svgW">
              <line :x1="x(nowMs)" :y1="0" :x2="x(nowMs)" :y2="lanesH" class="now-line" />
              <rect
                :x="Math.min(Math.max(x(nowMs) - 96, 2), svgW - 100)"
                :y="6"
                width="94"
                height="17"
                rx="5"
                class="now-bubble"
              />
              <text
                :x="Math.min(Math.max(x(nowMs) - 96, 2), svgW - 100) + 47"
                :y="18"
                text-anchor="middle"
                class="now-text"
              >
                现在 {{ fmtClock(nowMs / 1000) }}
              </text>
            </template>
            <line
              v-if="cursorX !== null"
              :x1="cursorX"
              :y1="0"
              :x2="cursorX"
              :y2="lanesH"
              class="scrub-line"
            />
          </svg>

        </div>
      </div>

      <!-- 空态 -->
      <div v-if="!hasAny" class="empty-hint">
        <span class="empty-title">时间轴空置</span>
        <span class="empty-sub">提交工作流后，任务会以时间条实时落在设备泳道上</span>
        <NButton size="small" secondary @click="router.push('/editor')">去编排一个工作流</NButton>
      </div>

      <!-- 悬浮卡：这段时间被谁占着 -->
      <Transition name="pop">
        <div v-if="hoverJob && hoverBase" class="job-tip" :style="hoverStyle" @pointerdown.stop>
          <div class="tip-head">
            <span class="tip-state" :style="{ color: hoverState.color }">● {{ hoverState.label }}</span>
            <span class="tip-attempt mono">attempt {{ hoverBase.attempt }}</span>
          </div>
          <div class="tip-title">{{ hoverTitle }}</div>
          <div class="tip-sub mono">{{ hoverBase.device_id }} · {{ hoverBase.action_name }}<template v-if="hoverNodeName && hoverNodeName !== hoverBase.action_name"> · {{ hoverNodeName }}</template></div>
          <div class="tip-rows mono">
            <template v-if="hoverJob.done">
              <span>{{ fmtClockWithDay(hoverJob.done.started_at) }} → {{ fmtClockWithDay(hoverJob.done.ended_at) }}</span>
              <span>实际 {{ fmtDur(hoverJob.done.actual_s) }} · 预估 {{ fmtDur(hoverJob.done.estimated_s) }}</span>
            </template>
            <template v-else-if="hoverJob.running">
              <span>{{ fmtClockWithDay(hoverJob.running.started_at) }} 开始 · 已执行 {{ fmtDur(Math.max(nowMs / 1000 - hoverJob.running.started_at, 0)) }}</span>
              <span>预估 {{ fmtDur(hoverJob.running.estimated_s) }}（{{ SOURCE_LABEL[hoverJob.running.estimate_source] }}）{{ isOverrun(hoverJob.running) ? " · 已超时" : "" }}</span>
            </template>
            <template v-else-if="hoverJob.queued">
              <span>预计 {{ fmtClockWithDay(hoverJob.queued.planned_start) }} 开始（按泳道顺序估算）</span>
              <span>预估 {{ fmtDur(hoverJob.queued.estimated_s) }}（{{ SOURCE_LABEL[hoverJob.queued.estimate_source] }}）</span>
            </template>
          </div>
          <div class="tip-foot">点击块可固定检视 · 任务 {{ hoverBase.workflow_id.slice(0, 8) }}</div>
        </div>
      </Transition>

      <!-- 图例 -->
      <div class="hud hud-bl legend" @pointerdown.stop>
        <span><i class="lg done" /> 完成</span>
        <span><i class="lg failed" /> 失败</span>
        <span><i class="lg running" /> 执行中（斜纹，长度 = 已执行）</span>
        <span><i class="lg ghost" /> 预估终点</span>
        <span><i class="lg queued" /> 排队</span>
        <span><i class="lg now" /> 现在</span>
      </div>

      <!-- ── 顶部悬浮工具条：− / + / 预设 / 适配 ── -->
      <div class="hud hud-tr" @pointerdown.stop>
        <span class="span-label mono">{{ spanLabel }}</span>
        <div class="zoom-group">
          <button class="zoom-btn mono" title="放大（缩短时间窗）" @click.stop="zoomBy(0.6)">
            +
          </button>
          <button class="zoom-btn mono" title="缩小（拉长时间窗）" @click.stop="zoomBy(1 / 0.6)">
            −
          </button>
          <button
            v-for="opt in ZOOM_PRESETS"
            :key="opt.value"
            class="zoom-btn mono"
            :class="{ on: Math.abs(spanMs - opt.value) < opt.value * 0.25 }"
            @click.stop="setSpan(opt.value)"
          >
            {{ opt.label }}
          </button>
          <button
            class="zoom-btn mono"
            title="缩放平移到覆盖当前全部任务"
            @click.stop="fitToData"
          >
            适配
          </button>
        </div>
      </div>

      <!-- ── 检视卡 ── -->
      <Transition name="pop">
        <div v-if="selected" class="inspector" @pointerdown.stop @wheel.stop>
          <header class="ins-head">
            <span
              class="ins-state"
              :style="{
                color: selected.done
                  ? DONE_COLORS[selected.done.state]
                  : selected.queued
                    ? '#6e7580'
                    : selected.running && isOverrun(selected.running)
                      ? '#d97706'
                      : '#2e5bff',
              }"
            >
              {{
                selected.done
                  ? (STATE_LABEL[selected.done.state] ?? selected.done.state)
                  : selected.queued
                    ? `排队中 · ${selected.queued.status}`
                    : selected.running && isOverrun(selected.running)
                      ? "执行中 · 已超预估"
                      : "执行中"
              }}
            </span>
            <button class="ins-close" @click="selected = null">
              <NIcon size="14"><CloseOutline /></NIcon>
            </button>
          </header>
          <div class="ins-title mono">
            {{ (selected.done ?? selected.running ?? selected.queued)?.device_id }}.{{
              (selected.done ?? selected.running ?? selected.queued)?.action_name
            }}
          </div>
          <div class="ins-rows mono">
            <template v-if="selected.queued">
              <span>预计 {{ fmtClockWithDay(selected.queued.planned_start) }} 开始（按泳道顺序估算）</span>
              <span>
                预估 {{ fmtDur(selected.queued.estimated_s) }}
                <em>[{{ SOURCE_LABEL[selected.queued.estimate_source] }}]</em>
              </span>
            </template>
            <template v-else-if="selected.done">
              <span>{{ fmtClockWithDay(selected.done.started_at) }} ~ {{ fmtClockWithDay(selected.done.ended_at) }}</span>
              <span>
                实际 {{ fmtDur(selected.done.actual_s) }} · 预估
                {{ fmtDur(selected.done.estimated_s) }}
                <em>[{{ SOURCE_BADGE[selected.done.estimate_source] }}]</em>
              </span>
              <span v-if="selected.done.suc_type !== 'normal'">suc_type: {{ selected.done.suc_type }}</span>
            </template>
            <template v-else-if="selected.running">
              <span>{{ fmtClockWithDay(selected.running.started_at) }} 开始 · 已执行 {{ fmtDur(nowMs / 1000 - selected.running.started_at) }}</span>
              <span>
                预估 {{ fmtDur(selected.running.estimated_s) }}
                <em>[{{ SOURCE_LABEL[selected.running.estimate_source] }}]</em>
              </span>
            </template>
            <span class="ins-dim">node {{ (selected.done ?? selected.running ?? selected.queued)?.node_id }}</span>
          </div>
          <button
            class="ins-link"
            @click="router.push(`/workflow-tasks/${encodeURIComponent((selected.done ?? selected.running ?? selected.queued)!.workflow_id)}`)"
          >
            <NIcon size="13"><OpenOutline /></NIcon>
            查看运行 {{ (selected.done ?? selected.running ?? selected.queued)?.workflow_id }}
          </button>
        </div>
      </Transition>

      <!-- ── 预估器 HUD ── -->
      <div class="hud hud-br" @pointerdown.stop @wheel.stop>
        <Transition name="pop">
          <div v-if="estimatorOpen" class="est-panel">
            <p class="est-note">
              <b>H 历史</b>：同一「设备/动作」已完成 attempt 实际时长的中位数；
              没有样本时兜底 {{ fmtDur(data?.estimator?.default_s ?? 60) }}。
              执行中块的虚线幽灵条画到预估终点，超时后变琥珀色。
            </p>
            <div v-if="data?.estimator?.stats?.length" class="est-list mono">
              <div
                v-for="s in data.estimator.stats"
                :key="s.device_action_key"
                class="est-row"
              >
                <span class="est-key" :title="s.device_action_key">{{ s.device_action_key }}</span>
                <span>{{ fmtDur(s.median_s) }}</span>
                <span class="est-dim">×{{ s.samples }}</span>
              </div>
            </div>
            <div v-else class="est-empty">暂无历史样本，任务正常完成后自动积累</div>
          </div>
        </Transition>
        <button class="est-chip" @click="estimatorOpen = !estimatorOpen">
          <NIcon size="13"><FlashOutline /></NIcon>
          预估 <b class="mono">{{ data?.estimator?.mode ?? "—" }}</b>
          <span class="est-count mono">{{ data?.estimator?.stats?.length ?? 0 }} 动作</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* ── 全幅操作台 ── */
.deck {
  height: calc(100vh - 152px);
  min-height: 460px;
  display: flex;
  flex-direction: column;
}

.canvas {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 16px;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.canvas:active {
  cursor: grabbing;
}

/* ── 标尺 ── */
.ruler-row {
  display: flex;
  flex-shrink: 0;
  border-bottom: 1px solid #e8e6e1;
}

.ruler-corner {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  flex-shrink: 0;
  padding: 0 12px 5px;
  color: #8b939c;
  font-size: 9.5px;
  font-weight: 700;
  letter-spacing: 0.08em;
  background: #f4f3f0;
  border-right: 1px solid #e8e6e1;
  white-space: nowrap;
  overflow: hidden;
}

.queue-badge {
  padding: 1px 6px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #3d4650;
  letter-spacing: 0;
}

.ruler {
  display: block;
  flex-shrink: 0;
  background: #fafaf8;
}

.ruler-base {
  stroke: #e8e6e1;
  stroke-width: 1;
}

.ruler-tick {
  stroke: #c9c5bd;
  stroke-width: 1;
}

.ruler-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  fill: #8b939c;
}

/* 日期：左缘窗口起点 + 每个零点 */
.ruler-day {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  fill: #3d4650;
  paint-order: stroke;
  stroke: #f4f3f0;
  stroke-width: 3px;
}

.ruler-day-line {
  stroke: #3d4650;
  stroke-width: 1.2;
}

.day-line {
  stroke: rgba(61, 70, 80, 0.35);
  stroke-width: 1.2;
  stroke-dasharray: 2 4;
  pointer-events: none;
}

.now-caret {
  fill: #dc2626;
}

.scrub-bubble {
  fill: #101418;
}

.scrub-text {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  fill: #fff;
}

/* ── 泳道 ── */
.lanes-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
}

.lanes-inner {
  position: relative;
}

.lanes-svg {
  display: block;
}

/* ── 固定轨道头列 ── */
.track-heads {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  z-index: 2;
  background: #f8f7f4;
  border-right: 1px solid #e8e6e1;
}

.track-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border-bottom: 1px solid #f0eee9;
  transition: opacity 0.2s ease;
}

.track-head.striped {
  background: rgba(16, 20, 24, 0.025);
}

.track-head.dim {
  opacity: 0.42;
}

.track-dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.track-dot.idle {
  background: #c9c5bd;
}

.track-dot.running {
  background: #2e5bff;
  animation: dot-breathe 1.6s ease-in-out infinite;
}

@keyframes dot-breathe {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(46, 91, 255, 0.35);
  }
  50% {
    box-shadow: 0 0 0 4px rgba(46, 91, 255, 0.12);
  }
}

.track-name {
  overflow: hidden;
  color: #3d4650;
  font-size: 11px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-rows {
  margin-left: auto;
  padding: 0 5px;
  border-radius: 999px;
  background: #e5e7eb;
  color: #3d4650;
  font-size: 9.5px;
  font-weight: 700;
}

/* 斑马底纹 + 空轨道淡化 */
.zebra {
  fill: rgba(16, 20, 24, 0.025);
}

.lane-dim {
  opacity: 0.35;
}

.future-zone {
  fill: rgba(46, 91, 255, 0.028);
}

.grid-line {
  stroke: rgba(16, 20, 24, 0.045);
  stroke-width: 1;
}

.lane-sep {
  stroke: #f0eee9;
  stroke-width: 1;
}

.bar {
  opacity: 0.92;
  cursor: pointer;
}

.bar:hover {
  opacity: 1;
}

.bar.selected {
  stroke: #101418;
  stroke-width: 1.6;
  opacity: 1;
}

.run-bar {
  fill: #2e5bff;
}

.run-bar.overrun {
  fill: #d97706;
}

.ghost-bar {
  fill: rgba(46, 91, 255, 0.08);
  stroke: #8fa4ff;
  stroke-width: 1;
  stroke-dasharray: 4 3;
  pointer-events: none;
}

/* 排队块：中性虚线轮廓，与执行中的蓝色幽灵条区分 */
.queued-bar {
  fill: rgba(110, 117, 128, 0.1);
  stroke: #9aa3ab;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.queued-bar.selected {
  stroke: #101418;
  stroke-width: 1.6;
}

.queued-label {
  fill: #5c6874;
}

.now-bubble {
  fill: #dc2626;
}

.now-text {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 700;
  fill: #fff;
}

/* 块内嵌标签：动作名 · 耗时（fitLabel 已按块宽截断出省略号） */
.bar-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  font-weight: 600;
  fill: #fff;
  pointer-events: none;
}

/* 执行中进行纹理 + 呼吸 */
.run-texture {
  pointer-events: none;
  animation: run-breathe 1.8s ease-in-out infinite;
}

@keyframes run-breathe {
  0%,
  100% {
    opacity: 0.55;
  }
  50% {
    opacity: 1;
  }
}

/* 播放头：标尺把手（now-caret）+ 贯穿轨道的竖线 */
.now-line {
  stroke: #dc2626;
  stroke-width: 1.6;
  pointer-events: none;
}

.scrub-line {
  stroke: rgba(16, 20, 24, 0.35);
  stroke-width: 1;
  stroke-dasharray: 2 3;
  pointer-events: none;
}

/* ── 空态 ── */
.empty-hint {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  pointer-events: none;
}

.empty-hint > * {
  pointer-events: auto;
}

.empty-title {
  font-family: var(--font-display);
  font-size: 17px;
  font-weight: 700;
  color: #3d4650;
}

.empty-sub {
  font-size: 12.5px;
  color: #a6acb5;
  margin-bottom: 6px;
}

/* ── 悬浮 HUD ── */
.hud {
  position: absolute;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 3;
}

.hud-tr {
  top: 3px;
  right: 10px;
}

.hud-br {
  bottom: 12px;
  right: 12px;
  flex-direction: column;
  align-items: flex-end;
}

/* 图例：左下角，说明块的视觉语言 */
.hud-bl {
  left: 162px;
  bottom: 12px;
}

.legend {
  gap: 12px;
  padding: 5px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e8e6e1;
  font-size: 10.5px;
  color: #5c6874;
  pointer-events: none;
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.lg {
  display: inline-block;
  width: 14px;
  height: 8px;
  border-radius: 3px;
}

.lg.done {
  background: #0e9f6e;
}

.lg.failed {
  background: #dc2626;
}

.lg.running {
  background: repeating-linear-gradient(-45deg, #f59e0b 0 3px, #fbbf24 3px 6px);
}

.lg.ghost {
  background: rgba(46, 91, 255, 0.08);
  border: 1px dashed #8fa4ff;
}

.lg.queued {
  background: rgba(110, 117, 128, 0.1);
  border: 1px dashed #9aa3ab;
}

.lg.now {
  width: 2px;
  height: 12px;
  border-radius: 0;
  background: #dc2626;
}

/* 悬浮卡 */
.job-tip {
  position: absolute;
  z-index: 6;
  padding: 10px 12px;
  border-radius: 12px;
  background: #101418;
  color: #e8ecf1;
  box-shadow: 0 14px 36px rgba(16, 20, 24, 0.3);
  pointer-events: none;
  font-size: 12px;
}

.tip-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 4px;
}

.tip-state {
  font-weight: 700;
  font-size: 11.5px;
}

.tip-attempt {
  font-size: 10px;
  color: #9aa3ab;
}

.tip-title {
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tip-sub {
  font-size: 11px;
  color: #b8bec6;
  margin-bottom: 6px;
}

.tip-rows {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: #d5dae0;
}

.tip-foot {
  margin-top: 6px;
  padding-top: 6px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 10px;
  color: #8b929c;
}

.span-label {
  font-size: 10.5px;
  font-weight: 700;
  color: #a6acb5;
}

.zoom-group {
  display: inline-flex;
  background: rgba(255, 255, 255, 0.92);
  border: 1px solid #e8e6e1;
  border-radius: 8px;
  overflow: hidden;
  backdrop-filter: blur(4px);
}

.zoom-btn {
  border: none;
  background: transparent;
  height: 28px;
  padding: 0 11px;
  font-size: 11px;
  font-weight: 700;
  color: #6e7580;
  cursor: pointer;
}

.zoom-btn + .zoom-btn {
  border-left: 1px solid #f0eee9;
}

.zoom-btn.on {
  background: #101418;
  color: #fff;
}

/* ── 检视卡 ── */
.inspector {
  position: absolute;
  left: 12px;
  bottom: 12px;
  z-index: 4;
  width: 300px;
  background: rgba(255, 255, 255, 0.96);
  border: 1px solid #e8e6e1;
  border-radius: 12px;
  padding: 12px 14px;
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 28px rgba(16, 20, 24, 0.1);
  cursor: default;
}

.ins-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 4px;
}

.ins-state {
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.ins-close {
  border: none;
  background: transparent;
  color: #a6acb5;
  cursor: pointer;
  display: flex;
  padding: 2px;
}

.ins-close:hover {
  color: #101418;
}

.ins-title {
  font-size: 13.5px;
  font-weight: 700;
  color: #101418;
  margin-bottom: 8px;
  word-break: break-all;
}

.ins-rows {
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 11px;
  color: #3d4650;
  margin-bottom: 10px;
}

.ins-rows em {
  font-style: normal;
  color: #2e5bff;
}

.ins-dim {
  color: #a6acb5;
}

.ins-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: none;
  background: #101418;
  color: #fff;
  font-size: 11.5px;
  font-weight: 600;
  border-radius: 7px;
  height: 28px;
  padding: 0 11px;
  cursor: pointer;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ins-link:hover {
  background: #2e5bff;
}

/* ── 预估器 HUD ── */
.est-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 28px;
  padding: 0 11px;
  border: 1px solid #e8e6e1;
  background: rgba(255, 255, 255, 0.92);
  border-radius: 8px;
  font-size: 11.5px;
  color: #6e7580;
  cursor: pointer;
  backdrop-filter: blur(4px);
}

.est-chip b {
  color: #2e5bff;
  font-size: 10.5px;
  text-transform: uppercase;
}

.est-count {
  color: #a6acb5;
  font-size: 10.5px;
}

.est-panel {
  width: 280px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid #e8e6e1;
  border-radius: 12px;
  padding: 12px 14px;
  margin-bottom: 8px;
  backdrop-filter: blur(6px);
  box-shadow: 0 8px 28px rgba(16, 20, 24, 0.1);
  cursor: default;
}

.est-note {
  margin: 0 0 10px;
  font-size: 11.5px;
  line-height: 1.65;
  color: #6e7580;
}

.est-note code {
  font-size: 10.5px;
  background: #f1f0ec;
  border-radius: 4px;
  padding: 0 3px;
}

.est-list {
  display: flex;
  flex-direction: column;
  border: 1px solid #efede8;
  border-radius: 8px;
  overflow: hidden;
}

.est-row {
  display: grid;
  grid-template-columns: 1fr 52px 34px;
  gap: 6px;
  padding: 6px 9px;
  font-size: 10.5px;
  color: #3d4650;
  border-top: 1px solid #f5f3ef;
}

.est-row:first-child {
  border-top: none;
}

.est-key {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.est-dim {
  color: #a6acb5;
}

.est-empty {
  font-size: 11.5px;
  color: #a6acb5;
}

/* ── 过渡 ── */
.pop-enter-active,
.pop-leave-active {
  transition: opacity 0.16s ease, transform 0.16s ease;
}

.pop-enter-from,
.pop-leave-to {
  opacity: 0;
  transform: translateY(6px);
}
</style>
