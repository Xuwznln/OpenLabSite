/**
 * process-management 域：V1 进程管理（原 Workspace Host 合同；unilabos/server/api/process_management.py）。
 *
 * - 路径不带 `/api` 前缀（`/v1/snapshot`、`/v1/operations`、`/v1/operations/{id}`、`/v1/logs/{component}`）；
 * - 与其它路由一样是 V1 信封：成功 `{code: 0, data}`（提交操作 HTTP 202），失败 HTTP 200 +
 *   `{code, error: {msg, code: <V1 符号码>, details?}}`，抛 BackendBusinessError（`symbol` 是符号码：
 *   `operation_not_found` 4001、`operation_conflict` / `revision_conflict` 3003、`component_unavailable` 5001、
 *   其余 1000）；未知 `/v1/*` 路径 404 + 4001（ApiError）。
 *
 * 组件：`backend`（调度权威本身）、`edge`（Host）、`managed:<process_id>`（Host 的受管设备进程）；
 * `plc` / `renderer` 恒为 idle（dev 不运行）。时间字段是 ISO 8601 UTC 毫秒。
 */
import type { HttpTransport, JsonObject } from "./common.js";
import type { components } from "./generated/openapi.js";

export type ProcessManagementSnapshot = components["schemas"]["WorkspaceSnapshot"];
export type ProcessManagementComponent = components["schemas"]["WorkspaceComponent"];
export type ProcessManagementOperation = components["schemas"]["WorkspaceOperation"];
export type ProcessManagementLogTail = components["schemas"]["WorkspaceLogTail"];

export interface ProcessManagementOperationInput {
  /** 调用方生成的幂等 id；同 id 同请求重放首次结果，不同请求 3003 `operation_conflict`。 */
  operationId: string;
  /** `workspace.start|stop|restart`、`scheduler.drain|resume`、`device-process.*`、`driver-package.*`、`material.layout.*` 等。 */
  command: string;
  parameters?: JsonObject;
  /** 快照 revision 乐观锁；不符 3003 `revision_conflict`。 */
  expectedRevision?: number | null;
}

export function createProcessManagementApi(http: HttpTransport) {
  return {
    snapshot: () => http.request<ProcessManagementSnapshot>({ method: "GET", path: "/v1/snapshot" }),
    /** 受理一个操作（HTTP 202）；用 {@link operation} 轮询到终态。 */
    submitOperation: (body: ProcessManagementOperationInput) =>
      http.request<ProcessManagementOperation>({
        method: "POST",
        path: "/v1/operations",
        body: { parameters: {}, ...body },
      }),
    operation: (operationId: string) =>
      http.request<ProcessManagementOperation>({
        method: "GET",
        path: `/v1/operations/${encodeURIComponent(operationId)}`,
      }),
    /** 组件日志尾部；`maxBytes` 1–4 MiB（读取端单次最多 256 KiB / 1000 行）。 */
    logs: (component: string, maxBytes?: number) =>
      http.request<ProcessManagementLogTail>({
        method: "GET",
        path: `/v1/logs/${encodeURIComponent(component)}`,
        params: { maxBytes },
      }),
  };
}

export type ProcessManagementApi = ReturnType<typeof createProcessManagementApi>;
