/**
 * 实验流程页的纯计算：把「定义」与「运行记录」两张表串起来，并把
 * 时间 / 时长 / 控制态等原始字段翻译成人能读的文案。
 */
import type {
  BackendWorkflowNodeJob,
  BackendWorkflowRunMode,
  BackendWorkflowTask,
  BackendWorkflowTaskControlStatus,
} from "@openlab/protocol";
import { TERMINAL_JOB_STATUSES, jobOrderKey, parseIsoMs } from "./task-jobs";

export const ACTIVE_TASK_STATUSES = new Set<BackendWorkflowTask["status"]>([
  "pending",
  "running",
  "canceling",
]);

/** 控制态只在偏离 active 时值得提示。 */
export const CONTROL_STATUS_HINT: Record<BackendWorkflowTaskControlStatus, string> = {
  active: "",
  paused: "已暂停",
  waiting_intervention: "等待人工处理",
  waiting_reconciliation: "等待状态对账",
};

export const RUN_MODE_LABEL: Record<BackendWorkflowRunMode, string> = {
  normal: "正常运行",
  step: "逐步运行",
  single_node: "单节点",
};

/** 编排器保存时自动打的标签，对使用者没有信息量，列表里不展示。 */
const HIDDEN_TAGS = new Set(["openlab-editor"]);

export function displayTags(tags: readonly unknown[]): string[] {
  return tags.map(String).filter((tag) => tag && !HIDDEN_TAGS.has(tag));
}

/** 任务时间轴上的排序键：开始时间优先，没开始的按创建时间。 */
export function taskTimeKey(task: BackendWorkflowTask): number {
  return parseIsoMs(task.started_at) ?? parseIsoMs(task.create_time) ?? 0;
}

export function sortTasksLatestFirst(tasks: readonly BackendWorkflowTask[]): BackendWorkflowTask[] {
  return [...tasks].sort((a, b) => taskTimeKey(b) - taskTimeKey(a));
}

export interface WorkflowRunSummary {
  total: number;
  active: number;
  /** 最近一次运行（按开始 / 创建时间）。 */
  latest: BackendWorkflowTask;
}

/** 按定义 uuid 汇总运行记录；ad-hoc 任务没有定义，不计入。 */
export function summarizeRuns(tasks: readonly BackendWorkflowTask[]): Map<string, WorkflowRunSummary> {
  const result = new Map<string, WorkflowRunSummary>();
  for (const task of tasks) {
    if (!task.workflow_uuid) continue;
    const current = result.get(task.workflow_uuid);
    const active = ACTIVE_TASK_STATUSES.has(task.status) ? 1 : 0;
    if (!current) {
      result.set(task.workflow_uuid, { total: 1, active, latest: task });
      continue;
    }
    current.total += 1;
    current.active += active;
    if (taskTimeKey(task) > taskTimeKey(current.latest)) current.latest = task;
  }
  return result;
}

/** 列表展示用的任务状态：把"因取消而失败"的旧记录归到 canceled。 */
export type EffectiveTaskStatus = BackendWorkflowTask["status"];

const CANCELLATION_SUC_TYPE = "cancellation";

/** 每个节点取最后一次 attempt（重试后的结果），按任务快照的节点顺序排列。 */
function latestAttemptsInOrder(
  task: BackendWorkflowTask,
  jobs: readonly BackendWorkflowNodeJob[],
): BackendWorkflowNodeJob[] {
  const latest = new Map<string, BackendWorkflowNodeJob>();
  for (const job of jobs) {
    const current = latest.get(job.workflow_node_uuid);
    if (!current || job.attempt_no > current.attempt_no) latest.set(job.workflow_node_uuid, job);
  }
  return [...latest.values()].sort((a, b) => jobOrderKey(task, a) - jobOrderKey(task, b));
}

/**
 * 任务在列表里的状态。调度器现在把执行面撤单的 attempt 落成 canceled、任务终态 canceled；
 * 更早的记录里同一情形是 failed 且失败节点的 `return_info.suc_type === "cancellation"`，
 * 这里把它识别回 canceled，别把人为中止当设备失败显示。
 */
export function effectiveTaskStatus(
  task: BackendWorkflowTask,
  jobs: readonly BackendWorkflowNodeJob[] | undefined,
): EffectiveTaskStatus {
  if (task.status !== "failed" || !jobs?.length) return task.status;
  const failing = jobs.filter((job) => job.status === "failed" || job.status === "timeout");
  const cancelledOnly =
    failing.length > 0 &&
    failing.every((job) => String(job.return_info?.suc_type ?? "") === CANCELLATION_SUC_TYPE);
  return cancelledOnly ? "canceled" : task.status;
}

export type TaskProgressTone = "running" | "done" | "failed" | "canceled";

export interface TaskProgress {
  /** 已成功 / 跳过的节点数。 */
  done: number;
  /** 节点数（每节点取最后一次 attempt）。 */
  total: number;
  /** 0–1；失败 / 取消时是停止位置的占比。 */
  ratio: number;
  /** 失败 / 取消的任务死在（停在）第几个节点，1 起；其余为 null。 */
  stoppedAt: number | null;
  tone: TaskProgressTone;
}

/**
 * 节点完成度；没有作业数据（历史任务不拉 jobs）时返回 null。
 *
 * 失败 / 取消的任务不显示"全部节点已结束"的 8/8——那只说明 fail-fast 把剩余节点收敛了；
 * 显示的是死在第几个节点（如 1/8），条填到该位置，颜色按失败（红）/ 取消（橙）区分。
 */
export function taskProgress(
  task: BackendWorkflowTask,
  jobs: readonly BackendWorkflowNodeJob[] | undefined,
): TaskProgress | null {
  if (!jobs || !jobs.length) return null;
  const nodes = latestAttemptsInOrder(task, jobs);
  const total = nodes.length;
  const isDone = (job: BackendWorkflowNodeJob) => job.status === "succeeded" || job.status === "skipped";
  const done = nodes.filter(isDone).length;
  const status = effectiveTaskStatus(task, jobs);

  if (status === "failed" || status === "timeout") {
    const index = nodes.findIndex((job) => job.status === "failed" || job.status === "timeout");
    const stoppedAt = Math.min(total, (index >= 0 ? index : done) + 1);
    return { done, total, ratio: stoppedAt / total, stoppedAt, tone: "failed" };
  }
  if (status === "canceled") {
    const index = nodes.findIndex((job) => !isDone(job));
    const stoppedAt = Math.min(total, (index >= 0 ? index : done) + 1);
    return { done, total, ratio: stoppedAt / total, stoppedAt, tone: "canceled" };
  }
  const finished = nodes.filter((job) => TERMINAL_JOB_STATUSES.has(job.status)).length;
  return {
    done,
    total,
    ratio: finished / total,
    stoppedAt: null,
    tone: status === "succeeded" && finished >= total ? "done" : "running",
  };
}

/** 任务耗时：已结束用 finished−started，进行中用 now−started；没开始返回 null。 */
export function taskDurationMs(task: BackendWorkflowTask, nowMs: number): number | null {
  const started = parseIsoMs(task.started_at);
  if (started === null) return null;
  const finished = parseIsoMs(task.finished_at);
  const end = finished ?? (ACTIVE_TASK_STATUSES.has(task.status) ? nowMs : null);
  if (end === null) return null;
  return Math.max(0, end - started);
}

export function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? `${hours} 小时 ${restMinutes} 分` : `${hours} 小时`;
  const days = Math.floor(hours / 24);
  return `${days} 天 ${hours % 24} 小时`;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/**
 * 列表里的时间：今天 / 昨天只给时刻，同年给「月/日 时:分」，跨年才带年份。
 * 完整时间放在 title 里（见 formatFull）。
 */
export function formatWhen(iso: string | undefined, nowMs: number): string {
  const ms = parseIsoMs(iso);
  if (ms === null) return "—";
  const date = new Date(ms);
  const now = new Date(nowMs);
  const clock = `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
  if (sameDay(date, now)) return `今天 ${clock}`;
  const yesterday = new Date(nowMs - 24 * 60 * 60 * 1000);
  if (sameDay(date, yesterday)) return `昨天 ${clock}`;
  const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
  if (date.getFullYear() === now.getFullYear()) return `${monthDay} ${clock}`;
  return `${date.getFullYear()}/${monthDay} ${clock}`;
}

export function formatFull(iso: string | undefined): string {
  const ms = parseIsoMs(iso);
  if (ms === null) return iso ?? "—";
  return new Date(ms).toLocaleString("zh-CN", { hour12: false });
}
