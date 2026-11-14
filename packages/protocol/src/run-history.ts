/**
 * run-history 域：V1 工作流运行历史（unilabos/server/api/runtime/run_history.py）。
 *
 * 调度权威从 runtime.db 视图回答（`workflow_runs` / `job_runs`），与 history-v1（Host 的事件 /
 * 载荷存储，`/edge/history/*`）是两回事。时间字段是 epoch 秒（V1 原样）。
 */
import type { HttpTransport, JsonObject } from "./common.js";
import type { OpenApiQuery } from "./openapi-types.js";

export type RunHistoryWorkflowQuery = OpenApiQuery<"/api/v1/history/workflows", "get">;
export type RunHistoryJobQuery = OpenApiQuery<"/api/v1/history/jobs", "get">;

/** 一次运行（task）的摘要；字段按 V1 `workflow_runs` 视图。 */
export interface RunHistoryWorkflow extends JsonObject {
  workflow_id: string;
  state: string;
}

export interface RunHistoryWorkflows {
  runs: RunHistoryWorkflow[];
  stats: JsonObject;
}

/** 单次运行：运行元信息 + 提交时整图快照（spec）+ 全部作业记录。 */
export type RunHistoryWorkflowDetail = RunHistoryWorkflow & { jobs: JsonObject[] };

export interface RunHistoryJobs {
  jobs: JsonObject[];
}

export function createRunHistoryApi(http: HttpTransport) {
  return {
    /** GET /history/workflows —— 运行列表 + 统计（state / since 秒 / limit / with_spec）。 */
    workflows: (params: RunHistoryWorkflowQuery = {}) =>
      http.request<RunHistoryWorkflows>({ method: "GET", path: "/api/v1/history/workflows", params }),
    /** GET /history/workflows/{workflow_id} —— 单次运行 + spec + jobs；不存在 3002。 */
    workflow: (workflowId: string) =>
      http.request<RunHistoryWorkflowDetail>({
        method: "GET",
        path: `/api/v1/history/workflows/${encodeURIComponent(workflowId)}`,
      }),
    /** GET /history/jobs —— 作业执行历史（按 workflow_id / device_id 过滤）。 */
    jobs: (params: RunHistoryJobQuery = {}) =>
      http.request<RunHistoryJobs>({ method: "GET", path: "/api/v1/history/jobs", params }),
  };
}

export type RunHistoryApi = ReturnType<typeof createRunHistoryApi>;
