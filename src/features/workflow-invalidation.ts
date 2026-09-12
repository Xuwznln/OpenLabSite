/**
 * Workflow Authority 的浏览器通知只负责失效；正文始终重新经 HTTP 读取。
 * 本模块不解析 EventSource.data，也不认识 control.v1 特权 WebSocket。
 */

import type {
  BackendWorkflow,
  BackendWorkflowNodeJob,
  BackendWorkflowTask,
} from "@openlab/protocol";

export const WORKFLOW_INVALIDATION_EVENT_TYPES = [
  "workflow.task.changed",
  "workflow.node_job.changed",
  "workflow.authoring.changed",
] as const;

export interface WorkflowInvalidationSource {
  addEventListener(type: string, listener: EventListener): void;
  removeEventListener(type: string, listener: EventListener): void;
}

export interface WorkflowSnapshotApi {
  workflows(params: { page: number; page_size: number }): Promise<{
    items: BackendWorkflow[];
  }>;
  tasks(params: { page: number; page_size: number }): Promise<{
    items: BackendWorkflowTask[];
  }>;
  taskJobs(taskUuid: string): Promise<BackendWorkflowNodeJob[]>;
}

export interface WorkflowHttpSnapshot {
  definitions: BackendWorkflow[];
  tasks: BackendWorkflowTask[];
  jobsByTask: Record<string, BackendWorkflowNodeJob[]>;
}

const ACTIVE_TASK_STATES = new Set<BackendWorkflowTask["status"]>([
  "pending",
  "running",
  "canceling",
]);

/**
 * 绑定浏览器可认证的 SSE 失效事件。listener 故意不读取事件 data：通知中的
 * 任意 payload/URL 都不可能成为业务正文或重定向 HTTP 的依据。
 */
export function bindWorkflowInvalidations(
  source: WorkflowInvalidationSource,
  invalidate: () => void,
): () => void {
  const listener: EventListener = () => invalidate();
  for (const eventType of WORKFLOW_INVALIDATION_EVENT_TYPES) {
    source.addEventListener(eventType, listener);
  }
  return () => {
    for (const eventType of WORKFLOW_INVALIDATION_EVENT_TYPES) {
      source.removeEventListener(eventType, listener);
    }
  };
}

/** 读取完整 HTTP 投影；notice 只触发本函数，不能提供 URL 或正文。 */
export async function loadWorkflowHttpSnapshot(
  api: WorkflowSnapshotApi,
  nowMs = Date.now(),
): Promise<WorkflowHttpSnapshot> {
  const [definitionPage, taskPage] = await Promise.all([
    api.workflows({ page: 1, page_size: 200 }),
    api.tasks({ page: 1, page_size: 200 }),
  ]);

  const recentCutoff = nowMs - 12 * 60 * 60 * 1000;
  const visibleTasks = taskPage.items.filter((task) => {
    if (ACTIVE_TASK_STATES.has(task.status)) return true;
    const finishedAt = Date.parse(task.finished_at ?? "");
    return Number.isFinite(finishedAt) && finishedAt >= recentCutoff;
  });
  const jobEntries = await Promise.all(
    visibleTasks.map(async (task) => [task.uuid, await api.taskJobs(task.uuid)] as const),
  );

  return {
    definitions: definitionPage.items,
    tasks: taskPage.items,
    jobsByTask: Object.fromEntries(jobEntries),
  };
}
