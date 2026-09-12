/**
 * Workflow Task / Node Job 的展示解析。
 *
 * Node Job DTO 只带 `workflow_node_uuid`；设备与动作要从任务提交时固化的
 * `workflow_snapshot.nodes[]` 反查：graph 节点与 ad-hoc 节点都把目标设备写在
 * `meta_data.target_device_id`（旧图可能在 `param.device_id`）。
 */
import type { BackendWorkflowNodeJob, BackendWorkflowTask } from "@openlab/protocol";

export interface SnapshotNode {
  uuid: string;
  name?: string;
  action_name?: string;
  action_type?: string;
  type?: string;
  meta_data?: Record<string, unknown>;
  param?: Record<string, unknown>;
  execution_policy?: Record<string, unknown>;
  execution_timeout_seconds?: number;
}

export interface NodeJobDescription {
  deviceId: string;
  actionName: string;
  nodeName: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function snapshotNodes(task: BackendWorkflowTask | null | undefined): SnapshotNode[] {
  const nodes = asRecord(task?.workflow_snapshot)?.nodes;
  return Array.isArray(nodes) ? (nodes.filter((node) => asRecord(node)) as SnapshotNode[]) : [];
}

export function snapshotWorkflowName(task: BackendWorkflowTask | null | undefined): string {
  const workflow = asRecord(asRecord(task?.workflow_snapshot)?.workflow);
  return text(workflow?.name);
}

/** 解析一个节点作业属于哪台设备、哪个动作。缺失时回退为快照节点类型 / 短 uuid。 */
export function describeNodeJob(
  task: BackendWorkflowTask | null | undefined,
  job: BackendWorkflowNodeJob,
): NodeJobDescription {
  const node = snapshotNodes(task).find((item) => item.uuid === job.workflow_node_uuid);
  const meta = asRecord(node?.meta_data);
  const param = asRecord(node?.param) ?? asRecord(job.param);
  const nodeType = text(node?.action_type) || text(node?.type);
  const deviceId =
    text(meta?.target_device_id) || text(param?.device_id) || text(param?.target_device_id) || job.edge_uuid || nodeType;
  const actionName = text(node?.action_name) || text(param?.action_name) || nodeType;
  const nodeName = text(node?.name) || actionName || job.workflow_node_uuid.slice(0, 8);
  return { deviceId, actionName, nodeName };
}

/**
 * 节点在任务里的顺序：优先用快照 `nodes[]` 的位置（任务提交时固化的拓扑序），
 * 找不到时退回 job 创建时间。job DTO 本身不再带 `topological_index`（它在节点运行上）。
 */
export function jobOrderKey(task: BackendWorkflowTask | null | undefined, job: BackendWorkflowNodeJob): number {
  const index = snapshotNodes(task).findIndex((item) => item.uuid === job.workflow_node_uuid);
  if (index >= 0) return index;
  return 10_000 + (parseIsoMs(job.create_time) ?? 0) / 1000;
}

/** 节点声明的执行超时（秒），来自任务快照里的节点；没有声明时为 0。 */
export function declaredTimeoutS(task: BackendWorkflowTask | null | undefined, job: BackendWorkflowNodeJob): number {
  const node = snapshotNodes(task).find((item) => item.uuid === job.workflow_node_uuid);
  const value = node?.execution_timeout_seconds ?? asRecord(node?.execution_policy)?.timeout_seconds;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/** 任务标题：流程名 → ad-hoc「设备/动作」→ 描述 → 短 uuid。 */
export function describeTask(task: BackendWorkflowTask): string {
  const name = snapshotWorkflowName(task);
  if (name) return name;
  if (task.execution_kind === "ad_hoc_device_action") {
    const node = snapshotNodes(task)[0];
    const device = text(asRecord(node?.meta_data)?.target_device_id);
    return `单点动作 ${device}${device && node?.action_name ? " / " : ""}${text(node?.action_name)}`.trim();
  }
  return task.description || task.uuid.slice(0, 8);
}

export const ACTIVE_JOB_STATUSES = new Set<BackendWorkflowNodeJob["status"]>([
  "dispatched",
  "running",
  "intervention_required",
  "cancel_requested",
  "execution_unknown",
]);

export const TERMINAL_JOB_STATUSES = new Set<BackendWorkflowNodeJob["status"]>([
  "succeeded",
  "failed",
  "skipped",
  "canceled",
  "timeout",
]);

export function parseIsoMs(value?: string): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
