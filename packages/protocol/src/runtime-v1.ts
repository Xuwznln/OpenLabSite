/**
 * UniLabOS `runtime.v1` / `runtime.db` 的浏览器只读投影
 * （unilabos/server/api/runtime/data.py）。
 *
 * 浏览器只消费 GET 端点：写端点（命令 receive、job transition、outbox claim/ack）
 * 属于 Backend ↔ Edge 控制面，不在前端目录登记。
 *
 * `endpoints` 是设备目录的权威来源：每个在线 endpoint 携带 `device_routes`
 * （哪些设备由它执行）与 `action_capabilities`（每个动作的 registry 定义、
 * 并发模式和当前可用性）。
 */
import type { HttpTransport, JsonObject } from "./common.js";
import type { ActionDescriptor } from "./device-actions.js";

export type RuntimeTransport = "hostlink" | "ros2";
export type RuntimeCommandType =
  | "execute_job"
  | "cancel_job"
  | "release_failed"
  | "replace_result"
  | "inventory_apply"
  | "reconcile";

export interface RuntimeDeviceRoute {
  route_uuid: string;
  device_uuid: string;
  driver_key: string;
  priority: number;
  enabled: boolean;
  selected: boolean;
  config_hash: string;
  config: JsonObject;
}

export interface RuntimeActionCapability {
  device_uuid: string;
  action_name: string;
  action_type?: string | null;
  concurrency_mode: "exclusive" | "unbounded";
  state: "active" | "retired";
  availability: "free" | "busy" | "unknown";
  active_job_uuid?: string | null;
  /** registry 动作定义（goal / goal_default / schema / handles / placeholder_keys…）。 */
  descriptor: ActionDescriptor;
  descriptor_hash: string;
  observed_at_ms: number;
}

export interface RuntimeMaterialBinding {
  key: string;
  role: string;
  material_uuid?: string;
  site_uuid?: string;
  reservation_uuid?: string;
  quantity?: number;
  unit?: string;
  snapshot: JsonObject;
  snapshot_hash: string;
}

export interface RuntimeBackendSession {
  session_uuid: string;
  edge_uuid: string;
  backend_uri: string;
  authority_epoch: string;
  connection_epoch: string;
  state: "connecting" | "active" | "reconciling" | "disconnected";
  command_cursor: number;
  event_send_cursor: number;
  event_ack_sequence: number;
  connected_at_ms?: number;
  disconnected_at_ms?: number;
  last_seen_at_ms: number;
  version: number;
}

export interface RuntimeExecutorEndpoint {
  endpoint_uuid: string;
  transport: RuntimeTransport;
  host_uuid: string;
  instance_name: string;
  authority_epoch: string;
  adapter_epoch?: string;
  adapter_event_cursor: number;
  reconciliation_generation: number;
  state: "online" | "offline" | "reconciling";
  device_routes: RuntimeDeviceRoute[];
  action_capabilities: RuntimeActionCapability[];
  config: JsonObject;
  snapshot_hash: string;
  registered_at_ms: number;
  last_seen_at_ms: number;
  reconciled_at_ms?: number;
  version: number;
}

export interface RuntimeCommand {
  command_uuid: string;
  session_uuid: string;
  backend_sequence: number;
  command_type: RuntimeCommandType;
  job_uuid?: string;
  payload_uuid?: string;
  payload_sha256: string;
  command_fingerprint: string;
  summary: JsonObject;
  traceparent?: string;
  status: "received" | "applying" | "applied" | "rejected";
  received_at_ms: number;
  applied_at_ms?: number;
  error_code?: string;
  error_message?: string;
  version: number;
}

export type RuntimeJobStatus =
  | "accepted"
  | "dispatch_pending"
  | "dispatched"
  | "running"
  | "failure_waiting"
  | "terminal_waiting"
  | "succeeded"
  | "failed"
  | "canceled"
  | "execution_unknown"
  | "rejected";

export interface RuntimeExecutionJob {
  job_uuid: string;
  task_uuid: string;
  node_uuid: string;
  attempt_group_uuid: string;
  retry_of_job_uuid?: string;
  attempt_no: number;
  execute_command_uuid: string;
  device_uuid: string;
  action_name: string;
  action_payload_uuid: string;
  route_uuid?: string;
  endpoint_uuid?: string;
  transport?: RuntimeTransport;
  material_bindings: RuntimeMaterialBinding[];
  scheduler_revision: number;
  scheduler_status_version: number;
  status: RuntimeJobStatus;
  feedback_sequence: number;
  result_uuid?: string;
  error_code?: string;
  error_summary?: string;
  terminal_gate_state:
    | "none"
    | "waiting_backend"
    | "backend_confirmed"
    | "released_failed"
    | "result_replaced"
    | "canceled";
  terminal_error_uuid?: string;
  terminal_required_scheduler_revision?: number;
  terminal_confirmed_scheduler_revision?: number;
  terminal_request_event_uuid?: string;
  terminal_decision_command_uuid?: string;
  terminal_decision: JsonObject;
  terminal_opened_at_ms?: number;
  terminal_resolved_at_ms?: number;
  accepted_at_ms: number;
  dispatched_at_ms?: number;
  started_at_ms?: number;
  finished_at_ms?: number;
  version: number;
}

export interface RuntimeAdapterCommand {
  sequence?: number;
  adapter_command_uuid: string;
  job_uuid?: string;
  endpoint_uuid: string;
  source_command_uuid?: string;
  trigger_event_uuid?: string;
  target_adapter_epoch?: string;
  command_type: "execute" | "cancel" | "release_failed" | "replace_result" | "reconcile_state";
  payload_uuid?: string;
  status: "pending" | "sent" | "acknowledged" | "failed";
  delivery_attempt_count: number;
  created_at_ms: number;
  available_at_ms: number;
  last_sent_at_ms?: number;
  acked_at_ms?: number;
  ack_event_uuid?: string;
  last_error?: string;
}

export interface RuntimeBackendEvent {
  sequence?: number;
  event_uuid: string;
  event_type: string;
  aggregate_type: string;
  aggregate_uuid: string;
  aggregate_version: number;
  job_uuid?: string;
  summary: JsonObject;
  detail_payload_uuid?: string;
  traceparent?: string;
  tracestate?: string;
  status: "pending" | "sent" | "acknowledged" | "dead_letter";
  created_at_ms: number;
  available_at_ms: number;
  last_sent_at_ms?: number;
  acked_at_ms?: number;
  delivery_attempt_count: number;
  last_error?: string;
}

export function createRuntimeV1Api(http: HttpTransport) {
  return {
    sessions: (params: { edge_uuid?: string; state?: string; limit?: number } = {}) =>
      http.request<RuntimeBackendSession[]>({ method: "GET", path: "/api/v1/runtime/sessions", params }),
    session: (sessionUuid: string) =>
      http.request<RuntimeBackendSession>({ method: "GET", path: `/api/v1/runtime/sessions/${encodeURIComponent(sessionUuid)}` }),
    endpoints: (params: { transport?: RuntimeTransport; state?: string; host_uuid?: string; limit?: number } = {}) =>
      http.request<RuntimeExecutorEndpoint[]>({ method: "GET", path: "/api/v1/runtime/endpoints", params }),
    endpoint: (endpointUuid: string) =>
      http.request<RuntimeExecutorEndpoint>({ method: "GET", path: `/api/v1/runtime/endpoints/${encodeURIComponent(endpointUuid)}` }),
    commands: (params: { session_uuid?: string; status?: string; job_uuid?: string; command_type?: string; after_sequence?: number; limit?: number } = {}) =>
      http.request<RuntimeCommand[]>({ method: "GET", path: "/api/v1/runtime/commands", params }),
    command: (commandUuid: string) =>
      http.request<RuntimeCommand>({ method: "GET", path: `/api/v1/runtime/commands/${encodeURIComponent(commandUuid)}` }),
    jobs: (params: { status?: string; device_uuid?: string; endpoint_uuid?: string; retry_of_job_uuid?: string; attempt_group_uuid?: string; limit?: number } = {}) =>
      http.request<RuntimeExecutionJob[]>({ method: "GET", path: "/api/v1/runtime/jobs", params }),
    job: (jobUuid: string) =>
      http.request<RuntimeExecutionJob>({ method: "GET", path: `/api/v1/runtime/jobs/${encodeURIComponent(jobUuid)}` }),
    adapterCommands: (params: { endpoint_uuid?: string; status?: string; job_uuid?: string; after_sequence?: number; limit?: number } = {}) =>
      http.request<RuntimeAdapterCommand[]>({ method: "GET", path: "/api/v1/runtime/adapter-commands", params }),
    adapterCommand: (commandUuid: string) =>
      http.request<RuntimeAdapterCommand>({ method: "GET", path: `/api/v1/runtime/adapter-commands/${encodeURIComponent(commandUuid)}` }),
    backendEvents: (params: { status?: string; job_uuid?: string; aggregate_type?: string; aggregate_uuid?: string; after_sequence?: number; limit?: number } = {}) =>
      http.request<RuntimeBackendEvent[]>({ method: "GET", path: "/api/v1/runtime/backend-events", params }),
    backendEvent: (eventUuid: string) =>
      http.request<RuntimeBackendEvent>({ method: "GET", path: `/api/v1/runtime/backend-events/${encodeURIComponent(eventUuid)}` }),
  };
}

export type RuntimeV1Api = ReturnType<typeof createRuntimeV1Api>;
