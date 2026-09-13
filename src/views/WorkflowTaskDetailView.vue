<script setup lang="ts">
/**
 * Workflow 任务运行时详情（workflow-backend 域，Backend {code,data} 信封）。
 *
 * 消费 backend 9dd16db1 的 4 个只读运行时端点（spec §6）：
 * - manual-confirmations：确认卡片（每 job 至多一条，task 维度聚合）
 * - interventions：干预记录 revision 序列 + resume_control_status
 * - per-job results / feedback-history：attempt 时间线
 *
 * §6.3 渲染路径红线：「多 attempt」= 同一节点运行下的多个 job 行（attempt_no）；
 * 顺序取 node-runs 的 topological_index。attempt 的返回值 / 异常在 job 行上
 * （return_info / error_info / error_resolution）；`results` 是 Backend ↔ Edge 的结果信封，
 * 本机调度不产生，只在接入云端 Backend 时作为附加信息展示（每 job 至多一条，取 rows[0]）。
 *
 * 降级：旧基座无这些路由（HTTP 404）→ 显示「后端版本不支持」；
 * code=3002 → task 不存在或已删；code=1000 → 非法 uuid。
 */
import { computed, onMounted, onUnmounted, ref, shallowReactive, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NInput,
  NProgress,
  NSelect,
  NSpin,
  NTag,
  NTooltip,
} from "naive-ui";
import { ArrowBackOutline } from "@vicons/ionicons5";
import {
  ApiError,
  BackendBusinessError,
  type BackendIntervention,
  type BackendManualConfirmation,
  type BackendManualConfirmationDecisionInput,
  type BackendNodeJobFeedback,
  type BackendNodeJobResult,
  type BackendWorkflowNodeJob,
  type BackendWorkflowNodeRun,
  type BackendWorkflowTask,
} from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import ActionResult from "../components/ActionResult.vue";
import StatusPill from "../components/StatusPill.vue";
import TaskGraphCanvas from "../components/TaskGraphCanvas.vue";
import { describeError } from "../features/errors";
import { stepExecutionControl } from "../features/workflow-execution";
import { createRefreshQueue } from "../features/refresh-queue";
import {
  describeJobTrigger,
  describeNodeJob,
  describeTask,
  parseIsoMs,
  snapshotNodes,
  snapshotWorkflowName,
} from "../features/task-jobs";
import { describeLoopProgress } from "../features/workflow-loops";
import type { BackendLoopProgress } from "@openlab/protocol";
import { beginWorkflowPrint } from "../features/workflow-print";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";

const route = useRoute();
const router = useRouter();
const conn = useConnectionStore();
const domain = useDomainThemeStore();

const taskUuid = String(route.params.id ?? "");
const wb = () => conn.api.domains.workflowBackend;

const loading = ref(true);
/** ""=正常；unsupported=端点缺失；not-found=code 3002；bad-uuid=code 1000 */
const degraded = ref<"" | "unsupported" | "not-found" | "bad-uuid">("");
const lastError = ref("");

// shallowRef：DTO 内含递归 JSON 类型，深层 ref 解包会让 vue-tsc 爆栈；
// 加载后整体替换引用即可触发更新
const task = shallowRef<BackendWorkflowTask | null>(null);
const jobs = shallowRef<BackendWorkflowNodeJob[]>([]);
/** 节点运行视图（每节点一条、拓扑序），与任务控制状态一并读取。 */
const runs = shallowRef<BackendWorkflowNodeRun[]>([]);
const confirmations = shallowRef<BackendManualConfirmation[]>([]);
const interventions = shallowRef<BackendIntervention[]>([]);
/** 每张确认单各自的确认人：有指派名单时只能从名单里选，否则自由填写。 */
const manualDecisionActor = shallowReactive<Record<string, string>>({});
const manualDecisionBusy = shallowReactive<Record<string, boolean>>({});
const manualDecisionError = shallowReactive<Record<string, string>>({});
/** 画布里点中的节点，用来高亮并滚到对应作业组。 */
const activeNodeUuid = ref("");
const controlBusy = ref(false);
const controlError = ref("");
const controlErrorType = ref<"warning" | "error">("error");
const controlBaseUrl = ref("");
const stepControl = computed(() => stepExecutionControl(task.value, runs.value));

async function commandTask(type: "step" | "resume") {
  const current = task.value;
  if (!current || current.control_revision === undefined || controlBusy.value || loading.value || !conn.schedulerLocal || controlBaseUrl.value !== conn.baseUrl) return;
  if (!(type === "step" ? stepControl.value.canStep : stepControl.value.canResume)) return;
  controlBusy.value = true;
  controlError.value = "";
  try {
    await wb().commandTask(current.uuid, {
      type, expected_revision: current.control_revision, idempotency_key: crypto.randomUUID(),
    });
  } catch (err) {
    const conflict = err instanceof BackendBusinessError && err.isConflict;
    controlErrorType.value = conflict ? "warning" : "error";
    controlError.value = conflict
      ? "任务状态已变化或已有单步在执行，已重新读取状态；本次没有额外放行动作。"
      : describeError(err);
  } finally {
    // 包括 revision 过期/另一页面已操作的情况都重拉，不在浏览器自行推进节点或修改控制态。
    await refresh();
    controlBusy.value = false;
  }
}

function classifyError(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 404) {
    degraded.value = "unsupported";
    return true;
  }
  if (err instanceof BackendBusinessError) {
    if (err.code === 3002) degraded.value = "not-found";
    else if (err.code === 1000) degraded.value = "bad-uuid";
    else lastError.value = err.message;
    return true;
  }
  lastError.value = describeError(err);
  return false;
}

async function refreshOnce() {
  const baseUrl = conn.baseUrl;
  const api = wb();
  loading.value = true;
  controlBaseUrl.value = "";
  degraded.value = "";
  lastError.value = "";
  try {
    const [nextTask, nextJobs, nextConfirmations, nextInterventions, nextRuns] = await Promise.all([
      api.task(taskUuid), api.taskJobs(taskUuid), api.taskManualConfirmations(taskUuid),
      api.taskInterventions(taskUuid), api.taskNodeRuns(taskUuid),
    ]);
    if (baseUrl !== conn.baseUrl) return;
    task.value = nextTask;
    jobs.value = nextJobs;
    confirmations.value = nextConfirmations;
    interventions.value = nextInterventions;
    runs.value = nextRuns;
    controlBaseUrl.value = baseUrl;
  } catch (err) {
    if (baseUrl === conn.baseUrl) classifyError(err);
    return;
  } finally {
    loading.value = false;
  }
  for (const confirmation of confirmations.value) {
    if (confirmation.status === "pending" && !manualDecisionActor[confirmation.uuid]) {
      manualDecisionActor[confirmation.uuid] = confirmation.assignee_user_ids[0] ?? "operator";
    }
  }
}
const refresh = createRefreshQueue(refreshOnce);

async function decideManualConfirmation(
  confirmation: BackendManualConfirmation,
  action: BackendManualConfirmationDecisionInput["action"],
) {
  if (confirmation.status !== "pending" || manualDecisionBusy[confirmation.uuid]) return;
  const actor = (manualDecisionActor[confirmation.uuid] ?? "").trim() || "operator";
  if (confirmation.assignee_user_ids.length && !confirmation.assignee_user_ids.includes(actor)) {
    manualDecisionError[confirmation.uuid] = `只有被指派的用户（${confirmation.assignee_user_ids.join("、")}）可以确认`;
    return;
  }
  manualDecisionBusy[confirmation.uuid] = true;
  manualDecisionError[confirmation.uuid] = "";
  try {
    await wb().decideManualConfirmation(confirmation.uuid, {
      action,
      confirmed_by: actor,
      decision_idempotency_key: `openlab-manual:${confirmation.uuid}:${action}`,
    });
    await refresh();
  } catch (err) {
    // 后端给的是具体原因（不在指派名单 / 已被处理 / 幂等键冲突），贴在卡片上而不是页顶
    manualDecisionError[confirmation.uuid] = describeError(err);
    if (!(err instanceof BackendBusinessError)) classifyError(err);
  } finally {
    manualDecisionBusy[confirmation.uuid] = false;
  }
}

// ── 人工确认倒计时：有 pending 单时每秒走表 ──

const now = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;
const pendingConfirmations = computed(() => confirmations.value.filter((c) => c.status === "pending"));
watch(
  () => pendingConfirmations.value.length > 0,
  (active) => {
    if (active && clock === null) clock = setInterval(() => (now.value = Date.now()), 1000);
    if (!active && clock !== null) {
      clearInterval(clock);
      clock = null;
    }
  },
  { immediate: true },
);
onUnmounted(() => {
  if (clock !== null) clearInterval(clock);
});

/** 距截止的剩余时间；到期后显示"已到期，等待调度器收敛为超时"。 */
function confirmRemaining(c: BackendManualConfirmation): { text: string; percent: number; overdue: boolean } | null {
  const deadline = parseIsoMs(c.deadline_at);
  if (!deadline) return null;
  const opened = parseIsoMs(c.opened_at) ?? deadline;
  const total = Math.max(deadline - opened, 1);
  const left = deadline - now.value;
  if (left <= 0) return { text: "已到期，等待调度器收敛为超时", percent: 100, overdue: true };
  const s = Math.floor(left / 1000);
  const text =
    s >= 3600
      ? `剩余 ${Math.floor(s / 3600)} 小时 ${Math.floor((s % 3600) / 60)} 分`
      : s >= 60
        ? `剩余 ${Math.floor(s / 60)} 分 ${s % 60} 秒`
        : `剩余 ${s} 秒`;
  return { text, percent: Math.min(100, Math.round(((total - left) / total) * 100)), overdue: false };
}

/** job → 挂在它上面的待确认单（有则该 job 实际处于"等待人工确认"，不是"等待依赖"）。 */
const pendingConfirmationByJob = computed(() => new Map(pendingConfirmations.value.map((c) => [c.workflow_node_job_uuid, c])));

function jobDisplayStatus(job: BackendWorkflowNodeJob): { status: string; label?: string } {
  if (pendingConfirmationByJob.value.has(job.uuid)) return { status: "running", label: "等待人工确认" };
  return { status: job.status };
}

function focusNode(nodeUuid: string) {
  activeNodeUuid.value = nodeUuid;
  document.getElementById(`node-${nodeUuid}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
}

// ── attempt 时间线：同 node 的 job 行按 attempt 分组（§6.3） ──

const nodeGroups = computed(() => {
  const groups = new Map<string, BackendWorkflowNodeJob[]>();
  for (const job of jobs.value) {
    const list = groups.get(job.workflow_node_uuid) ?? [];
    list.push(job);
    groups.set(job.workflow_node_uuid, list);
  }
  // 顺序：节点运行的 topological_index（调度器实际的 DAG 序）；没有 node-runs 时退回快照节点顺序
  const runOrder = new Map(runs.value.map((run) => [run.workflow_node_uuid, run.topological_index]));
  const snapshotOrder = new Map(snapshotNodes(task.value).map((node, index) => [node.uuid, index]));
  const orderOf = (nodeUuid: string) => runOrder.get(nodeUuid) ?? (snapshotOrder.get(nodeUuid) ?? 1e9) + 10_000;
  const runByNode = new Map(runs.value.map((run) => [run.workflow_node_uuid, run]));
  return [...groups.entries()]
    .map(([nodeUuid, list]) => {
      const sorted = [...list].sort((a, b) => a.attempt_no - b.attempt_no);
      const info = describeNodeJob(task.value, sorted[0]!);
      const run = runByNode.get(nodeUuid) ?? null;
      // 循环容器：节点头上显示轮次进度（control_data.loop），循环体节点每轮一个 attempt
      const loopProgress =
        run?.executor_kind === "loop"
          ? describeLoopProgress(
              (run.control_data as Record<string, unknown> | undefined)?.loop as Partial<BackendLoopProgress> | undefined,
              run.status,
            )
          : "";
      return { nodeUuid, jobs: sorted, run, loopProgress, ...info };
    })
    .sort((a, b) => orderOf(a.nodeUuid) - orderOf(b.nodeUuid));
});

// ── 任务摘要（标题 / 时间 / 用时 / 计数） ──

const title = computed(() => (task.value ? describeTask(task.value) : `task ${shortId(taskUuid)}`));
const workflowName = computed(() => snapshotWorkflowName(task.value));

const EXECUTION_KIND_LABEL: Record<string, string> = {
  workflow: "整图运行",
  ad_hoc_device_action: "单点设备动作",
};

const RUN_MODE_LABEL: Record<string, string> = {
  normal: "自动执行",
  dry_run: "试运行",
  step: "逐步执行",
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(Math.round(ms), 0)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const elapsedText = computed(() => {
  const start = parseIsoMs(task.value?.started_at) ?? parseIsoMs(task.value?.create_time);
  if (!start) return "—";
  const end = parseIsoMs(task.value?.finished_at) ?? Date.now();
  return `${fmtDuration(end - start)}${task.value?.finished_at ? "" : "（进行中）"}`;
});

function jobDuration(job: BackendWorkflowNodeJob): string {
  const start = parseIsoMs(job.started_at);
  if (!start) return "";
  return fmtDuration((parseIsoMs(job.finished_at) ?? Date.now()) - start);
}

const jobCounts = computed(() => {
  const counts = { total: jobs.value.length, done: 0, failed: 0 };
  for (const job of jobs.value) {
    if (job.status === "succeeded" || job.status === "skipped") counts.done += 1;
    else if (job.status === "failed" || job.status === "timeout") counts.failed += 1;
  }
  return counts;
});

// ── 每 job 的 result / feedback（展开时按需加载） ──

interface JobRuntime {
  loading: boolean;
  loaded: boolean;
  unsupported: boolean;
  error: string;
  /** 当前 schema 每 job 至多一条（列表形状仅为归档扩展留余量）。 */
  result: BackendNodeJobResult | null;
  feedback: BackendNodeJobFeedback[];
}

const expanded = ref<Set<string>>(new Set());
// shallowReactive + 整体替换条目：JobRuntime 内含递归 JSON 类型，深层
// reactive 会让 vue-tsc 类型实例化爆栈
const runtime = shallowReactive<Record<string, JobRuntime>>({});

async function toggleJob(jobUuid: string) {
  const next = new Set(expanded.value);
  if (next.has(jobUuid)) {
    next.delete(jobUuid);
    expanded.value = next;
    return;
  }
  next.add(jobUuid);
  expanded.value = next;
  if (runtime[jobUuid]?.loaded) return;
  const idle: JobRuntime = {
    loading: true,
    loaded: false,
    unsupported: false,
    error: "",
    result: null,
    feedback: [],
  };
  runtime[jobUuid] = idle;
  try {
    const rows = await wb().jobResults(jobUuid);
    const feedback = await wb().jobFeedbackHistory(jobUuid);
    runtime[jobUuid] = {
      ...idle,
      loading: false,
      loaded: true,
      // §6.3：渲染按至多一条处理，不假设多条
      result: rows[0] ?? null,
      feedback,
    };
  } catch (err) {
    const failed = { ...idle, loading: false };
    if (err instanceof ApiError && err.status === 404) failed.unsupported = true;
    else if (err instanceof BackendBusinessError && err.code === 3002)
      failed.error = "job 不存在或已删除";
    else failed.error = describeError(err);
    runtime[jobUuid] = failed;
  }
}

// ── 展示辅助 ──

const CONFIRM_STATUS_LABEL: Record<BackendManualConfirmation["status"], string> = {
  pending: "待确认",
  approved: "已批准",
  rejected: "已拒绝",
  timed_out: "已超时",
  canceled: "已取消",
};

const INTERVENTION_STATUS_LABEL: Record<BackendIntervention["status"], string> = {
  open: "待决策",
  selected: "已选择",
  superseded: "已被取代",
};

function tagType(value: string): "success" | "error" | "warning" | "info" | "default" {
  if (["approved", "succeeded", "selected", "active"].includes(value)) return "success";
  if (["rejected", "failed", "timeout", "timed_out"].includes(value)) return "error";
  if (["pending", "open", "paused"].includes(value)) return "warning";
  if (["canceled", "superseded"].includes(value)) return "default";
  return "info";
}

function fmtIso(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function shortId(uuid: string): string {
  return uuid.length > 8 ? uuid.slice(0, 8) : uuid;
}

function jsonPreview(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function prettyJson(value: unknown): string {
  const text = JSON.stringify(value, null, 2) ?? "";
  return text.length > 4000 ? `${text.slice(0, 4000)}\n…` : text;
}

function hasEntries(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return true;
}

const TERMINAL_JOB = new Set<BackendWorkflowNodeJob["status"]>(["succeeded", "failed", "skipped", "canceled", "timeout"]);

function jobIsTerminal(job: BackendWorkflowNodeJob): boolean {
  return TERMINAL_JOB.has(job.status);
}

function printTask() {
  if (!task.value) return;
  const session = beginWorkflowPrint();
  if (!session) {
    lastError.value = "浏览器拦截了打印窗口，请允许本站打开弹窗后重试";
    return;
  }
  session.complete({
    domainName: domain.config.name,
    workflowName: title.value,
    workflowUuid: task.value.workflow_uuid ?? "ad-hoc",
    taskUuid: task.value.uuid,
    runMode: task.value.run_mode,
    status: task.value.status,
    nodeCount: jobs.value.length,
    createdAt: task.value.create_time,
  });
}

onMounted(() => void refresh());
// 失效通知或断线恢复时重拉
watch(
  () => [conn.workflowNoticeRevision, conn.online] as const,
  ([, online]) => {
    if (online) void refresh();
  },
);
</script>

<template>
  <div class="task-detail">
    <NCard size="small">
      <div class="head-row">
        <NButton size="small" @click="router.back()">
          <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
          返回
        </NButton>
        <div class="head-title">
          <span class="title-text">{{ title }}</span>
          <span class="mono head-id">{{ taskUuid }}</span>
        </div>
        <StatusPill v-if="task" :status="task.status" />
        <NTag v-if="task && task.control_status !== 'active'" size="small" type="warning" :bordered="false">
          {{ task.control_status === 'paused' && task.run_mode === 'step' ? '等待下一步' : `控制态 ${task.control_status}` }}
        </NTag>
        <NButton size="small" secondary style="margin-left: auto" @click="refresh()">
          刷新
        </NButton>
        <NButton v-if="task" size="small" type="primary" secondary @click="printTask">
          打印实验单
        </NButton>
      </div>
      <NAlert v-if="stepControl.visible" type="info" title="逐步执行" style="margin-top: 12px">
        <p>{{ stepControl.hint }}</p>
        <div class="head-row">
          <NButton type="primary" size="small" :loading="controlBusy"
            :disabled="!conn.schedulerLocal || !conn.online || controlBaseUrl !== conn.baseUrl || loading || controlBusy || !stepControl.canStep"
            @click="commandTask('step')">执行下一步</NButton>
          <NButton size="small"
            :disabled="!conn.schedulerLocal || !conn.online || controlBaseUrl !== conn.baseUrl || loading || controlBusy || !stepControl.canResume"
            @click="commandTask('resume')">切换自动执行</NButton>
        </div>
      </NAlert>
      <NAlert v-if="controlError" :type="controlErrorType" style="margin-top: 8px">{{ controlError }}</NAlert>
      <div v-if="task" class="summary-grid">
        <div class="summary-item">
          <span class="summary-k">类型</span>
          <span class="summary-v">{{ EXECUTION_KIND_LABEL[task.execution_kind] ?? task.execution_kind }} · {{ RUN_MODE_LABEL[task.run_mode] ?? task.run_mode }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">流程定义</span>
          <span class="summary-v">
            <EntityRef v-if="task.workflow_uuid" :uuid="task.workflow_uuid" :label="workflowName || undefined" />
            <span v-else class="dim">无（单点动作）</span>
          </span>
        </div>
        <div class="summary-item">
          <span class="summary-k">提交</span>
          <span class="summary-v mono">{{ fmtIso(task.create_time) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">开始 / 结束</span>
          <span class="summary-v mono">{{ fmtIso(task.started_at) }} → {{ fmtIso(task.finished_at) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">用时</span>
          <span class="summary-v">{{ elapsedText }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">节点作业</span>
          <span class="summary-v">
            {{ jobCounts.total }} 条 · 完成 {{ jobCounts.done }}
            <span v-if="jobCounts.failed" class="err">· 失败 {{ jobCounts.failed }}</span>
          </span>
        </div>
        <div v-if="task.description" class="summary-item summary-wide">
          <span class="summary-k">描述</span>
          <span class="summary-v">{{ task.description }}</span>
        </div>
      </div>
    </NCard>

    <div v-if="!task && !conn.online" class="degraded">
      <span class="degraded-title">等待后端连接</span>
      连接恢复后会自动载入任务、节点作业与运行记录。
    </div>

    <NSpin v-else-if="loading && !task" style="margin: 48px auto; display: block" />

    <!-- 端点缺失要明确报错，不改用 jobs 推导权威运行状态。 -->
    <NAlert v-else-if="degraded === 'unsupported'" type="info">
      当前进程不提供任务运行时读取端点（manual-confirmations / interventions /
      results / feedback-history）；请连接带 Workflow Authority 的进程后重试。
    </NAlert>
    <NAlert v-else-if="degraded === 'not-found'" type="warning">
      任务不存在或已被删除（code=3002）。
    </NAlert>
    <NAlert v-else-if="degraded === 'bad-uuid'" type="error">
      任务 UUID 非法（code=1000）：{{ taskUuid }}
    </NAlert>

    <template v-else>
      <NAlert
        v-if="lastError && conn.online"
        type="error"
        closable
        @close="lastError = ''"
      >
        {{ lastError }}
      </NAlert>

      <!-- ── 只读画布：快照图 + 节点运行状态着色 ── -->
      <NCard v-if="task && snapshotNodes(task).length" size="small" title="流程画布">
        <template #header-extra>
          <span class="dim">任务提交时固化的图，只读；点节点定位到下方作业</span>
        </template>
        <TaskGraphCanvas :task="task" :runs="runs" :confirmations="confirmations" :active-node-uuid="activeNodeUuid" @select="focusNode" />
      </NCard>

      <!-- ── attempt 时间线（§6.3 红线：多 attempt = 同 node 多 job 行） ── -->
      <NCard size="small" title="节点作业">
        <template #header-extra>
          <span class="dim">按流程拓扑顺序；同一节点的多次 attempt 依次列出</span>
        </template>
        <NEmpty v-if="nodeGroups.length === 0" description="本任务尚未产生节点作业" size="small" />
        <div
          v-for="group in nodeGroups"
          :id="`node-${group.nodeUuid}`"
          :key="group.nodeUuid"
          class="node-group"
          :class="{ 'node-active': group.nodeUuid === activeNodeUuid }"
          @click="activeNodeUuid = group.nodeUuid"
        >
          <div class="node-head">
            <span class="node-name">{{ group.nodeName }}</span>
            <span v-if="group.deviceId" class="node-meta mono">{{ group.deviceId }} · {{ group.actionName }}</span>
            <span class="node-meta mono dim">node {{ shortId(group.nodeUuid) }}</span>
            <span v-if="group.run" class="node-meta mono dim">#{{ group.run.topological_index + 1 }}</span>
            <span v-if="group.run?.executor_kind === 'loop'" class="node-meta loop-chip">
              循环{{ group.loopProgress ? ` · ${group.loopProgress}` : "" }}
            </span>
          </div>
          <div v-for="job in group.jobs" :key="job.uuid" class="job-row">
            <div class="row-head clickable" @click="toggleJob(job.uuid)">
              <span class="attempt-chip">attempt {{ job.attempt_no }}</span>
              <span v-if="describeJobTrigger(job.trigger)" class="dim small">{{ describeJobTrigger(job.trigger) }}</span>
              <StatusPill :status="jobDisplayStatus(job).status" :label="jobDisplayStatus(job).label" size="small" />
              <span class="mono dim">job {{ shortId(job.uuid) }}</span>
              <span v-if="job.started_at" class="dim">{{ fmtIso(job.started_at) }}<template v-if="job.finished_at"> → {{ fmtIso(job.finished_at) }}</template></span>
              <span v-if="jobDuration(job)" class="dim">用时 {{ jobDuration(job) }}</span>
              <span v-if="job.error_info && Object.keys(job.error_info).length" class="err small">
                {{ jsonPreview(job.error_info) }}
              </span>
              <span class="expand-hint">{{ expanded.has(job.uuid) ? "收起" : "结果 / 反馈" }}</span>
            </div>

            <div v-if="expanded.has(job.uuid)" class="job-runtime">
              <NSpin v-if="runtime[job.uuid]?.loading" size="small" />
              <template v-else-if="runtime[job.uuid]?.unsupported">
                <span class="err">results / feedback-history 端点不存在，请检查服务部署及当前协议。</span>
              </template>
              <template v-else-if="runtime[job.uuid]?.error">
                <span class="err">{{ runtime[job.uuid]?.error }}</span>
              </template>
              <template v-else>
                <!-- result：每 job 至多一条 -->
                <!--
                  attempt 的结果就在 job 行上（return_info / error_info / error_resolution，
                  record_job_terminal 写入）；`results` 端点是 Backend ↔ Edge 的结果信封，
                  本机调度的 Host 不产生这张表，只有接入云端 Backend 时才有行。
                -->
                <div class="rt-block">
                  <div class="rt-title">执行结果</div>
                  <div v-if="!jobIsTerminal(job)" class="dim small">
                    attempt 尚未结束，结束后返回值会写在这里。
                  </div>
                  <template v-else>
                    <ActionResult :info="job.return_info" :errors="job.error_info" />
                    <div v-if="hasEntries(job.error_resolution)" class="small">
                      <span class="dim">异常处置（error_resolution）</span>
                      <span class="mono">{{ jsonPreview(job.error_resolution) }}</span>
                    </div>
                  </template>
                  <div v-if="runtime[job.uuid]?.result" class="small result-envelope">
                    <NTag size="small" :type="tagType(runtime[job.uuid]!.result!.outcome)" :bordered="false">
                      Backend 结果信封 · {{ runtime[job.uuid]!.result!.outcome }}
                    </NTag>
                    <span class="dim">提交 {{ fmtIso(runtime[job.uuid]!.result!.committed_at) }}</span>
                    <span v-if="runtime[job.uuid]!.result!.consumed_at" class="dim">
                      · 已消费 {{ fmtIso(runtime[job.uuid]!.result!.consumed_at) }}
                    </span>
                  </div>
                </div>
                <!-- feedback：归档流按 sequence；本机调度只有 job 行上的最新一次 feedback_data -->
                <div class="rt-block">
                  <div class="rt-title">反馈</div>
                  <div v-if="runtime[job.uuid]?.feedback.length === 0 && !hasEntries(job.feedback_data)" class="dim small">
                    动作执行期间没有上报反馈。
                  </div>
                  <div v-else-if="runtime[job.uuid]?.feedback.length === 0" class="small">
                    <span class="dim">最新反馈（feedback_data，序号 {{ job.feedback_sequence }}）</span>
                    <pre class="mono json-block">{{ prettyJson(job.feedback_data) }}</pre>
                  </div>
                  <div
                    v-for="fb in runtime[job.uuid]?.feedback ?? []"
                    :key="fb.uuid"
                    class="fb-row small"
                  >
                    <span class="mono seq">#{{ fb.sequence }}</span>
                    <span class="mono">{{ fb.feedback_type }}</span>
                    <span class="mono dim">{{ jsonPreview(fb.data) }}</span>
                    <span class="dim">观测 {{ fmtIso(fb.observed_at) }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </NCard>

      <div class="secondary-row">
        <!-- ── 人工确认卡片（§6.1） ── -->
        <NCard size="small" title="人工确认">
          <template #header-extra>
            <span class="dim">{{ confirmations.length ? `${confirmations.length} 条` : "无" }}</span>
          </template>
          <div v-if="confirmations.length === 0" class="dim small">
            本任务没有需要人工确认的节点。
          </div>
          <div
            v-for="c in confirmations"
            :key="c.uuid"
            class="confirm-card"
            :class="{ settled: c.status !== 'pending' }"
          >
            <div class="row-head">
              <NTag size="small" :type="tagType(c.status)" :bordered="false">
                {{ CONFIRM_STATUS_LABEL[c.status] }}
              </NTag>
              <span class="mono dim">job {{ shortId(c.workflow_node_job_uuid) }}</span>
              <span class="dim">开启 {{ fmtIso(c.opened_at) }}</span>
              <span v-if="c.deadline_at" class="dim">截止 {{ fmtIso(c.deadline_at) }}</span>
            </div>
            <div v-if="c.status === 'pending' && confirmRemaining(c)" class="confirm-countdown" :class="{ overdue: confirmRemaining(c)!.overdue }">
              <span class="countdown-text">{{ confirmRemaining(c)!.text }}</span>
              <NProgress
                type="line"
                :percentage="confirmRemaining(c)!.percent"
                :show-indicator="false"
                :height="4"
                :status="confirmRemaining(c)!.overdue ? 'error' : confirmRemaining(c)!.percent > 80 ? 'warning' : 'default'"
              />
            </div>
            <div v-if="c.description" class="desc">{{ c.description }}</div>
            <div class="mono small">param: {{ jsonPreview(c.param) }}</div>
            <div v-if="c.assignee_user_ids.length" class="small dim">
              指派：{{ c.assignee_user_ids.join("、") }}（只有名单中的用户可以确认）
            </div>
            <div v-else-if="c.status === 'pending'" class="small confirm-unrestricted">
              未指派：任何已登录操作员均可确认
            </div>
            <div v-if="c.decided_at" class="small">
              {{ c.confirmed_by ?? "—" }} 于 {{ fmtIso(c.decided_at) }} 决策
              <span v-if="c.comment" class="dim">：{{ c.comment }}</span>
            </div>
            <div v-if="manualDecisionError[c.uuid]" class="small err">{{ manualDecisionError[c.uuid] }}</div>
            <div v-if="c.status === 'pending'" class="confirm-actions">
              <NSelect
                v-if="c.assignee_user_ids.length"
                v-model:value="manualDecisionActor[c.uuid]"
                size="small"
                class="confirm-actor"
                :options="c.assignee_user_ids.map((id) => ({ label: id, value: id }))"
                placeholder="以谁的身份确认"
                @click.stop
              />
              <NInput
                v-else
                v-model:value="manualDecisionActor[c.uuid]"
                size="small"
                class="confirm-actor"
                placeholder="确认人 ID（可留空，记为 operator）"
                @click.stop
              />
              <NButton
                size="small"
                type="primary"
                :loading="manualDecisionBusy[c.uuid]"
                @click.stop="decideManualConfirmation(c, 'approve')"
              >
                确认放行
              </NButton>
              <NButton
                size="small"
                secondary
                :disabled="manualDecisionBusy[c.uuid]"
                @click.stop="decideManualConfirmation(c, 'skip')"
              >
                跳过
              </NButton>
              <NButton
                size="small"
                tertiary
                type="error"
                :disabled="manualDecisionBusy[c.uuid]"
                @click.stop="decideManualConfirmation(c, 'reject')"
              >
                拒绝
              </NButton>
            </div>
          </div>
        </NCard>

        <!-- ── 干预记录（§6.2） ── -->
        <NCard size="small" title="干预记录">
          <template #header-extra>
            <span class="dim">{{ interventions.length ? `${interventions.length} 条` : "无" }}</span>
          </template>
          <div v-if="interventions.length === 0" class="dim small">
            没有发生过人工干预（动作异常经「异常审批」处理后会在此留痕）。
          </div>
          <div v-for="iv in interventions" :key="iv.uuid" class="intervention-row">
            <div class="row-head">
              <span class="mono rev">rev {{ iv.revision }}</span>
              <NTag size="small" :type="tagType(iv.status)" :bordered="false">
                {{ INTERVENTION_STATUS_LABEL[iv.status] }}
              </NTag>
              <NTooltip>
                <template #trigger>
                  <NTag
                    size="small"
                    :type="iv.resume_control_status === 'paused' ? 'warning' : 'success'"
                    :bordered="false"
                  >
                    恢复后 {{ iv.resume_control_status === "paused" ? "保持暂停" : "继续执行" }}
                  </NTag>
                </template>
                resume_control_status = {{ iv.resume_control_status }}
              </NTooltip>
              <span class="mono dim">job {{ shortId(iv.workflow_node_job_uuid) }}</span>
              <span class="dim">开启 {{ fmtIso(iv.opened_at) }}</span>
            </div>
            <div class="small">
              选项：
              <span v-for="(opt, i) in iv.options" :key="i" class="mono opt">
                {{ jsonPreview(opt) }}
              </span>
            </div>
            <div v-if="iv.status === 'selected'" class="small">
              已选 <b class="mono">{{ iv.selected_option_id ?? "—" }}</b>
              <span v-if="iv.decided_at" class="dim">（{{ fmtIso(iv.decided_at) }}）</span>
              <span class="mono dim">{{ jsonPreview(iv.selected_option) }}</span>
            </div>
          </div>
        </NCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.head-title {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.title-text {
  font-weight: 700;
  font-size: 15px;
  color: #101418;
}

.head-id {
  font-size: 11px;
  color: #8b929c;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 18px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-wide {
  grid-column: 1 / -1;
}

.summary-k {
  font-size: 11px;
  color: #8b929c;
  letter-spacing: 0.02em;
}

.summary-v {
  font-size: 13px;
  color: #1f262e;
  overflow: hidden;
  text-overflow: ellipsis;
}

.secondary-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .secondary-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.mono {
  font-family: var(--font-mono);
}

.small {
  font-size: 12px;
}

.dim {
  color: #9aa3ab;
  font-size: 12px;
}

.err {
  color: #b91c1c;
}

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.confirm-card {
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.confirm-card.settled {
  border-color: #e8e6e1;
  background: #fafaf8;
}

.confirm-unrestricted {
  color: #5c786d;
}

.confirm-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
  padding-top: 7px;
  border-top: 1px solid rgba(217, 180, 73, 0.28);
}

.confirm-actor {
  width: 170px;
}

.confirm-countdown {
  display: flex;
  flex-direction: column;
  gap: 3px;
  margin: 2px 0 4px;
}

.countdown-text {
  font-size: 12.5px;
  font-weight: 650;
  color: #b45309;
}

.confirm-countdown.overdue .countdown-text {
  color: #b42318;
}

.desc {
  font-size: 13px;
}

.intervention-row {
  border-bottom: 1px solid #f0eee9;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.intervention-row:last-child {
  border-bottom: none;
}

.rev {
  font-size: 12px;
  font-weight: 700;
  color: #6e7580;
}

.opt {
  display: inline-block;
  background: #f5f4f0;
  border-radius: 6px;
  padding: 1px 6px;
  margin-right: 6px;
  font-size: 11.5px;
}

.node-group {
  margin-bottom: 12px;
  padding: 4px 6px;
  margin-left: -6px;
  margin-right: -6px;
  border-radius: 8px;
  transition: background 0.2s;
}

.node-group.node-active {
  background: #eaf0ff;
}

.node-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.node-name {
  font-size: 13.5px;
  font-weight: 700;
  color: #1f262e;
}

.node-meta {
  font-size: 11.5px;
  color: #6e7580;
}

.job-row {
  border: 1px solid #ececea;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
}

.clickable {
  cursor: pointer;
}

.attempt-chip {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #1e40af;
  background: #dbeafe;
  font-family: var(--font-mono);
}

.loop-chip {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 600;
  color: #5b21b6;
  background: #ede9fe;
}

.expand-hint {
  margin-left: auto;
  font-size: 12px;
  color: #2563eb;
}

.job-runtime {
  margin-top: 8px;
  border-top: 1px dashed #ececea;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
  margin-bottom: 3px;
}

.fb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.json-block {
  margin: 4px 0 0;
  padding: 8px 10px;
  max-height: 240px;
  overflow: auto;
  background: #f7f8f9;
  border-radius: 8px;
  font-size: 11.5px;
  line-height: 1.45;
  color: #3d4650;
  white-space: pre-wrap;
  word-break: break-all;
}

.json-block.err {
  background: #fff5f5;
  color: #b42318;
}

.result-envelope {
  margin-top: 6px;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.seq {
  color: #6e7580;
  font-weight: 700;
}
</style>
