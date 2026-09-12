/**
 * Workflow Authority（workflow 域，unilabos/server/api/runtime/workflow.py）。
 *
 * 本机调度（默认）时 Host 进程挂载 Workflow 写入口：`/workflows` 是定义与
 * Graph，`/workflow-tasks` 是一次运行，`/workflow-node-jobs` 是节点作业。
 * 接入云端 Backend 后本域不在 Edge 进程挂载，前端应连接调度权威地址。
 *
 * - 响应使用 Backend `{code,data,error}` 信封；HTTP 200 且 code!=0 是业务失败，
 *   经 common.ts 的唯一解包器抛 BackendBusinessError。
 * - 状态词汇是 canonical（任务终态 `succeeded`），页面禁止自行改写字符串。
 * - 单点设备动作也走本域：`createTask({execution_kind: "ad_hoc_device_action"})`
 *   生成单 job 任务并复用整图的调度 / 历史 / 异常链路。
 * - 编排画布的节点模板（node_templates / handle_templates）随 graph hydration
 *   返回；新建节点时的动作定义来自 runtime.v1 endpoint 能力。
 */
import {
  backendRequest,
  backendVoid,
  createHttpTransport,
  type HttpTransport,
  type HttpTransportOptions,
  type JsonObject,
  type JsonValue,
} from "./common.js";

/** Backend Base 字段：软删除行不出现在公共 DTO；description 为空时省略。 */
export interface BackendWorkflowBase {
  uuid: string;
  create_time: string;
  update_time: string;
  meta_data: JsonObject;
  description?: string;
}

/** `workflow` 表 DTO：定义域权威，revision 是 Graph 写入的乐观锁。 */
export interface BackendWorkflow extends BackendWorkflowBase {
  name: string;
  tags: JsonValue[];
  revision: number;
}

/**
 * `workflow_node_template` 表 DTO。Edge 私有 `authority_id` 不进入公共 DTO；
 * `schema` 保持原始 JSON 字符串（解析用 workflow.ts 的
 * parseWorkflowNodeTemplateSchema，不在传输层展开）。
 */
export interface BackendWorkflowNodeTemplate extends BackendWorkflowBase {
  resource_template_uuid: string;
  name: string;
  display_name: string;
  goal: JsonObject;
  goal_default: JsonObject;
  feedback: JsonObject;
  result: JsonObject;
  type: string;
  node_type: string;
  class?: string;
  schema?: string;
  icon?: string;
  header?: string;
  footer?: string;
}

/** `workflow_handle_template` 表 DTO；`handle_key` 是模板内端口语义键。 */
export interface BackendWorkflowHandleTemplate extends BackendWorkflowBase {
  workflow_node_template_uuid: string;
  handle_key: string;
  io_type: "source" | "target" | (string & {});
  display_name: string;
  type: string;
  required: boolean;
  data_source?: string;
  data_key?: string;
}

/**
 * `workflow_node` 表 DTO。SQLite 兼容列 `status`（Backend migration 42 已删）
 * 被服务端从公共 DTO 剥除，客户端不得依赖。
 */
export interface BackendWorkflowNode extends BackendWorkflowBase {
  workflow_uuid: string;
  name: string;
  type: string;
  pose: JsonObject;
  param: JsonObject;
  execution_policy: JsonObject;
  disabled: boolean;
  minimized: boolean;
  workflow_node_template_uuid?: string;
  parent_uuid?: string;
  material_uuid?: string;
  icon?: string;
  footer?: string;
  action_name?: string;
  action_type?: string;
  script?: string;
}

/** `workflow_edge` 表 DTO：以 handle uuid 四元组为规范引用。 */
export interface BackendWorkflowEdge extends BackendWorkflowBase {
  source_node_uuid: string;
  target_node_uuid: string;
  source_handle_uuid: string;
  target_handle_uuid: string;
}

/** GET /workflows/{uuid}/graph 的整图 hydration。 */
export interface BackendWorkflowGraph {
  workflow: BackendWorkflow;
  nodes: BackendWorkflowNode[];
  edges: BackendWorkflowEdge[];
  node_templates: BackendWorkflowNodeTemplate[];
  handle_templates: BackendWorkflowHandleTemplate[];
}

/** Backend canonical 任务终态是 succeeded。 */
export type BackendWorkflowTaskStatus =
  | "pending"
  | "running"
  | "canceling"
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";

export type BackendWorkflowTaskControlStatus =
  | "active"
  | "paused"
  | "waiting_intervention"
  | "waiting_reconciliation";

export type BackendWorkflowTaskCleanupStatus =
  | "none"
  | "pending"
  | "canceling"
  | "settled"
  | "requires_attention";

export type BackendWorkflowRunMode = "normal" | "step" | "single_node";

/**
 * `workflow_task` 表 DTO。SQLite 兼容列 `input/output`（Backend migration
 * 000037/000040 已删）被服务端从公共 DTO 剥除；ad-hoc 设备动作任务的
 * `workflow_uuid` 为空。
 */
export interface BackendWorkflowTask extends BackendWorkflowBase {
  workflow_uuid: string | null;
  execution_kind: "workflow" | "ad_hoc_device_action";
  status: BackendWorkflowTaskStatus;
  workflow_snapshot: JsonObject;
  execution_plan: JsonObject;
  run_mode: BackendWorkflowRunMode;
  control_status: BackendWorkflowTaskControlStatus;
  cleanup_status: BackendWorkflowTaskCleanupStatus;
  trace_context: JsonObject;
  error_info: JsonValue[];
  target_node_uuid?: string;
  timeout_at?: string;
  attention_reason?: string;
  terminal_ghost_detected_at?: string;
  reconciliation_resume_control_status?: string;
  started_at?: string;
  finished_at?: string;
}

export type BackendWorkflowNodeJobStatus =
  | "pending"
  | "dispatched"
  | "running"
  | "intervention_required"
  | "cancel_requested"
  | "execution_unknown"
  | "succeeded"
  | "failed"
  | "skipped"
  | "canceled"
  | "timeout";

export type BackendWorkflowExecutorKind =
  | "device_action"
  | "compute"
  | "condition"
  | "script"
  | "tool_call"
  | "manual_confirm";

/**
 * `workflow_node_job` 表 DTO —— 一次 **attempt**（物理执行）。
 *
 * 节点级的静态信息（拓扑序、executor_kind、执行策略、超时）在节点运行
 * {@link BackendWorkflowNodeRun} 上；job 只带本次尝试的序号、触发原因与结果。
 * 行内 `job_access_token_hash` 不进入公共 DTO；SQLite 列 `edge_agent_uuid` 输出为 `edge_uuid`。
 */
export interface BackendWorkflowNodeJob extends BackendWorkflowBase {
  workflow_node_run_uuid: string;
  workflow_task_uuid: string;
  workflow_node_uuid: string;
  /** 同一节点运行内从 1 递增。 */
  attempt_no: number;
  /** 本次尝试为何产生：`initial`（首次派发）/ `retry_decision`（决策链 retry）等。 */
  trigger: "initial" | "retry_decision" | (string & {});
  feedback_sequence: number;
  status: BackendWorkflowNodeJobStatus;
  param: JsonObject;
  feedback_data: JsonObject;
  return_info: JsonObject;
  error_resolution: JsonObject;
  control_data: JsonObject;
  error_info: JsonValue[];
  /** 该尝试是对哪一次 job 的重试。 */
  retry_of_job_uuid?: string;
  edge_uuid?: string;
  edge_command_uuid?: string;
  dispatch_deadline_at?: string;
  execution_deadline_at?: string;
  cancel_command_uuid?: string;
  cancel_ack_deadline_at?: string;
  cancel_complete_deadline_at?: string;
  uncertainty_reason?: string;
  started_at?: string;
  finished_at?: string;
}

/**
 * `workflow_node_run` 表 DTO —— 一个任务里 **每个节点一条** 的运行视图：`status /
 * return_info` 是当前（重试后的）attempt 的结果，`attempts` 是该节点全部 job 的历史
 * （按 `attempt_no` 升序）。画布节点状态与结果读取用它；`jobs` 端点是 attempt 平铺视图。
 */
export interface BackendWorkflowNodeRun extends BackendWorkflowBase {
  workflow_task_uuid: string;
  workflow_node_uuid: string;
  topological_index: number;
  executor_kind: BackendWorkflowExecutorKind;
  execution_policy: JsonObject;
  execution_timeout_seconds: number;
  param: JsonObject;
  status: BackendWorkflowNodeJobStatus;
  /** 当前 attempt 的 job uuid；尚未派发时为 null。 */
  current_job_uuid: string | null;
  attempt_count: number;
  return_info: JsonObject;
  error_info: JsonValue[];
  feedback_data: JsonObject;
  control_data: JsonObject;
  attempts: BackendWorkflowNodeJob[];
  material_uuid?: string;
  started_at?: string;
  finished_at?: string;
}

export interface BackendPage<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
}

// ---------------------------------------------------------------------------
// Workflow 运行时只读读取端点（backend 9dd16db1，spec §6）
//
// 读 workflow_history.db 运行时内部表的官方领域 API 读取面（这些表在
// table_contracts.py 中仍是「运行时内部表」，不进 /entities 目录，也不等于
// 开放通用 SQL）。通用语义（4 端点一致，spec §6 冻结）：
// - envelope 同 workflow-backend 域其余接口：HTTP 恒 200 + {code,data}；
//   code=1000 路径 uuid 非法 / limit·offset 非法；code=3002 父资源
//   （task/job）不存在或已软删；父存在但无记录 → code=0 + 空列表。
// - 软删行（deleted_at 非空）一律不返回。
// - 时间戳 UTC ISO-8601；「可选」字段 = DB NULL 时整个键缺席（不是 null），
//   TS 一律 `?:`，消费方不得用空串覆盖缺席键。
// ---------------------------------------------------------------------------

/** 4 个运行时读取端点共用的分页参数：limit 不传 = 全量；offset 默认 0。 */
export type BackendRuntimeReadParams = {
  limit?: number;
  offset?: number;
};

export type BackendManualConfirmationStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "timed_out"
  | "canceled";

/** 人工确认决策写入；动作别名由 Backend 规范化并持久化。 */
export interface BackendManualConfirmationDecisionInput {
  action: "approve" | "confirm" | "skip" | "reject" | "cancel" | "timeout" | (string & {});
  confirmed_by?: string;
  comment?: string;
  decision_idempotency_key?: string;
}

/**
 * `workflow_manual_confirmation` 行 DTO（spec §6.1）。
 * 每个 job 至多一条确认记录，task 维度跨 job 聚合；排序 create_time ASC, uuid ASC。
 */
export interface BackendManualConfirmation extends BackendWorkflowBase {
  workflow_task_uuid: string;
  workflow_node_job_uuid: string;
  status: BackendManualConfirmationStatus;
  assignee_user_ids: string[];
  param: JsonObject;
  opened_at: string;
  confirmed_by?: string;
  comment?: string;
  decision_idempotency_key?: string;
  deadline_at?: string;
  decided_at?: string;
}

export type BackendInterventionStatus = "open" | "selected" | "superseded";

/**
 * `workflow_intervention` 行 DTO（spec §6.2）。
 * 同一 job 可有多个 revision（≥1，job 内唯一），至多一条 open；
 * 排序 opened_at ASC, uuid ASC。
 */
export interface BackendIntervention extends BackendWorkflowBase {
  workflow_task_uuid: string;
  workflow_node_job_uuid: string;
  edge_agent_uuid: string;
  revision: number;
  status: BackendInterventionStatus;
  options: JsonObject[];
  resume_control_status: "active" | "paused";
  /** 已选项内容；未决策时为空对象 {}（不是键缺席）。 */
  selected_option: JsonObject;
  opened_at: string;
  /** status=selected 时必有。 */
  selected_option_id?: string;
  decision_idempotency_key?: string;
  edge_command_uuid?: string;
  decided_at?: string;
}

export type BackendNodeJobResultOutcome =
  | "succeeded"
  | "failed"
  | "canceled"
  | "timeout";

/**
 * `workflow_node_job_result` 行 DTO（spec §6.3）。
 *
 * 当前 schema 每 job **至多一条** result（唯一索引
 * ux_workflow_node_job_result_job）；「多 attempt」体现为同 task+node 的多个
 * job 行（job 根字段 `attempt`）——按 attempt 渲染必须先
 * GET /workflow-tasks/{task}/jobs 再逐 job 取 results，响应保持列表形状只是
 * 为归档扩展留余量，UI 按至多一条处理、不得假设多条。排序
 * committed_at ASC, uuid ASC。
 *
 * ⚠️ DB 列 `job_access_token_hash`（执行凭据摘要）有意不输出，本类型任何
 * 时候不得加回该字段（契约测试锁定）。
 */
export interface BackendNodeJobResult extends BackendWorkflowBase {
  workflow_node_job_uuid: string;
  edge_command_uuid: string;
  idempotency_key: string;
  outcome: BackendNodeJobResultOutcome;
  return_info: JsonObject;
  error_info: JsonValue[];
  committed_at: string;
  consumed_at?: string;
}

/**
 * `workflow_node_job_feedback_history` 行 DTO（spec §6.4）。
 * 每 job 多条，sequence 从 1 递增且 job 内唯一；排序 sequence ASC。
 */
export interface BackendNodeJobFeedback extends BackendWorkflowBase {
  workflow_node_job_uuid: string;
  sequence: number;
  /** 自由字符串（如 "progress"），不是封闭枚举。 */
  feedback_type: string;
  data: JsonObject;
  observed_at: string;
  received_at: string;
  idempotency_key: string;
  /** 已发布到前端事件流的时间。 */
  published_at?: string;
}

export interface BackendWorkflowWriteInput {
  name: string;
  tags?: JsonValue[];
  description?: string | null;
  meta_data?: JsonObject;
}

export interface BackendWorkflowNodeWrite {
  uuid: string;
  name: string;
  type: string;
  pose?: JsonObject;
  param?: JsonObject;
  execution_policy?: JsonObject;
  disabled?: boolean;
  minimized?: boolean;
  workflow_node_template_uuid?: string | null;
  parent_uuid?: string | null;
  material_uuid?: string | null;
  icon?: string | null;
  footer?: string | null;
  action_name?: string | null;
  action_type?: string | null;
  script?: string | null;
  description?: string | null;
  meta_data?: JsonObject;
}

export interface BackendWorkflowEdgeWrite {
  uuid: string;
  source_node_uuid: string;
  target_node_uuid: string;
  source_handle_uuid: string;
  target_handle_uuid: string;
  description?: string | null;
  meta_data?: JsonObject;
}

export interface BackendGraphWriteInput {
  revision: number;
  nodes: BackendWorkflowNodeWrite[];
  edges: BackendWorkflowEdgeWrite[];
}

/** execution_kind=workflow（默认）：按 Workflow 定义整图运行。 */
export interface BackendWorkflowTaskCreateInput {
  execution_kind?: "workflow";
  workflow_uuid: string;
  run_mode?: BackendWorkflowRunMode;
  target_node_uuid?: string | null;
  description?: string | null;
  meta_data?: JsonObject;
}

/**
 * execution_kind=ad_hoc_device_action：单点设备动作（设备页 / 画布节点直发）。
 * 服务端生成单 job 任务并复用整图调度/历史/异常链路；`idempotency_key`
 * 缺省由服务端生成，同键同参重复提交幂等返回既有任务。
 */
export interface BackendAdHocDeviceActionTaskCreateInput {
  execution_kind: "ad_hoc_device_action";
  device_id: string;
  action_name: string;
  action_type?: string;
  param: JsonObject;
  /** registry 动作元数据（如 {always_free: true}），决定调度并发模式。 */
  execution_policy?: JsonObject;
  execution_timeout_seconds?: number;
  idempotency_key?: string;
  description?: string | null;
  meta_data?: JsonObject;
}

export type BackendWorkflowTaskSubmitInput =
  | BackendWorkflowTaskCreateInput
  | BackendAdHocDeviceActionTaskCreateInput;

/**
 * Authoring 状态机聚合（Draft/Candidate/Apply/Writeback）。这是域 API 专属
 * 表面而非行浏览实体：`workflow_authoring` 行内的 hash、writeback 游标由
 * 服务端聚合后输出，客户端只消费该聚合。
 */
export interface BackendWorkflowAuthoring extends JsonObject {
  workflow_uuid: string;
  workflow_revision: number;
  state: string;
}

export interface BackendAuthoringDraftInput {
  python_source: string;
  expected_draft_hash: string | null;
  expected_workflow_revision: number;
}

export interface BackendAuthoringApplyInput {
  expected_draft_hash: string;
  expected_workflow_revision: number;
  expected_candidate_hash: string;
}

export function createWorkflowBackendApi(http: HttpTransport) {
  return {
    /** POST /api/v1/workflows —— 创建 Workflow 定义 */
    createWorkflow: (body: BackendWorkflowWriteInput) =>
      backendRequest<BackendWorkflow>(http, {
        method: "POST",
        path: "/api/v1/workflows",
        body,
      }),
    /** GET /api/v1/workflows —— 定义分页列表 */
    workflows: (params: { page?: number; page_size?: number; name?: string } = {}) =>
      backendRequest<BackendPage<BackendWorkflow>>(http, {
        method: "GET",
        path: "/api/v1/workflows",
        params,
      }),
    /** GET /api/v1/workflows/{workflow_uuid} */
    workflow: (workflowUuid: string) =>
      backendRequest<BackendWorkflow>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}`,
      }),
    /** PUT /api/v1/workflows/{workflow_uuid} */
    updateWorkflow: (workflowUuid: string, body: BackendWorkflowWriteInput) =>
      backendRequest<BackendWorkflow>(http, {
        method: "PUT",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}`,
        body,
      }),
    /** DELETE /api/v1/workflows/{workflow_uuid} —— 软删除并级联 node/edge */
    deleteWorkflow: (workflowUuid: string) =>
      backendVoid(http, {
        method: "DELETE",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}`,
      }),
    /** GET /api/v1/workflows/{workflow_uuid}/graph —— 整图 hydration */
    graph: (workflowUuid: string) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/graph`,
      }),
    /** PUT /api/v1/workflows/{workflow_uuid}/graph —— revision 乐观锁全量协调 */
    saveGraph: (workflowUuid: string, body: BackendGraphWriteInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "PUT",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/graph`,
        body,
      }),
    /** POST /api/v1/workflow-tasks —— 提交运行（整图 / 单点设备动作） */
    createTask: (body: BackendWorkflowTaskSubmitInput) =>
      backendRequest<BackendWorkflowTask>(http, {
        method: "POST",
        path: "/api/v1/workflow-tasks",
        body,
      }),
    /** GET /api/v1/workflow-tasks —— 运行分页列表 */
    tasks: (
      params: {
        page?: number;
        page_size?: number;
        workflow_uuid?: string;
        status?: BackendWorkflowTaskStatus | "";
        cleanup_status?: BackendWorkflowTaskCleanupStatus | "";
      } = {},
    ) =>
      backendRequest<BackendPage<BackendWorkflowTask>>(http, {
        method: "GET",
        path: "/api/v1/workflow-tasks",
        params,
      }),
    /** GET /api/v1/workflow-tasks/{task_uuid} */
    task: (taskUuid: string) =>
      backendRequest<BackendWorkflowTask>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}`,
      }),
    /** GET /api/v1/workflow-tasks/{task_uuid}/jobs */
    taskJobs: (taskUuid: string) =>
      backendRequest<BackendWorkflowNodeJob[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/jobs`,
      }),
    /** GET /api/v1/workflow-node-jobs/{job_uuid} */
    job: (jobUuid: string) =>
      backendRequest<BackendWorkflowNodeJob>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}`,
      }),
    /** GET /api/v1/workflow-tasks/{task_uuid}/node-runs —— 每节点一条（拓扑序），内嵌 attempts */
    taskNodeRuns: (taskUuid: string) =>
      backendRequest<BackendWorkflowNodeRun[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/node-runs`,
      }),
    /** GET /api/v1/workflow-node-runs/{run_uuid} */
    nodeRun: (runUuid: string) =>
      backendRequest<BackendWorkflowNodeRun>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-runs/${encodeURIComponent(runUuid)}`,
      }),
    /** GET /api/v1/workflow-tasks/{task_uuid}/manual-confirmations —— 人工确认待办与历史 */
    taskManualConfirmations: (taskUuid: string, params: BackendRuntimeReadParams = {}) =>
      backendRequest<BackendManualConfirmation[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/manual-confirmations`,
        params,
      }),
    /** GET /api/v1/workflow-manual-confirmations/{confirmation_uuid} */
    manualConfirmation: (confirmationUuid: string) =>
      backendRequest<BackendManualConfirmation>(http, {
        method: "GET",
        path: `/api/v1/workflow-manual-confirmations/${encodeURIComponent(confirmationUuid)}`,
      }),
    /** POST /api/v1/workflow-manual-confirmations/{confirmation_uuid}/decision */
    decideManualConfirmation: (
      confirmationUuid: string,
      body: BackendManualConfirmationDecisionInput,
    ) =>
      backendRequest<BackendManualConfirmation>(http, {
        method: "POST",
        path: `/api/v1/workflow-manual-confirmations/${encodeURIComponent(confirmationUuid)}/decision`,
        body,
      }),
    /** POST /api/v1/workflow-tasks/{task_uuid}/manual-confirmations/{confirmation_uuid}/decision */
    decideTaskManualConfirmation: (
      taskUuid: string,
      confirmationUuid: string,
      body: BackendManualConfirmationDecisionInput,
    ) =>
      backendRequest<BackendManualConfirmation>(http, {
        method: "POST",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/manual-confirmations/${encodeURIComponent(confirmationUuid)}/decision`,
        body,
      }),
    /** GET /api/v1/workflow-tasks/{task_uuid}/interventions —— 干预记录（revision 序列） */
    taskInterventions: (taskUuid: string, params: BackendRuntimeReadParams = {}) =>
      backendRequest<BackendIntervention[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/interventions`,
        params,
      }),
    /** GET /api/v1/workflow-node-jobs/{job_uuid}/results —— 每 job 至多一条（见类型注释） */
    jobResults: (jobUuid: string, params: BackendRuntimeReadParams = {}) =>
      backendRequest<BackendNodeJobResult[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/results`,
        params,
      }),
    /** GET /api/v1/workflow-node-jobs/{job_uuid}/feedback-history —— sequence 自然序 */
    jobFeedbackHistory: (jobUuid: string, params: BackendRuntimeReadParams = {}) =>
      backendRequest<BackendNodeJobFeedback[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/feedback-history`,
        params,
      }),
    /** GET /api/v1/workflows/{workflow_uuid}/authoring —— Authoring 聚合 */
    authoring: (workflowUuid: string) =>
      backendRequest<BackendWorkflowAuthoring>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring`,
      }),
    /** PUT /api/v1/workflows/{workflow_uuid}/authoring/draft */
    saveDraft: (workflowUuid: string, body: BackendAuthoringDraftInput) =>
      backendRequest<BackendWorkflowAuthoring>(http, {
        method: "PUT",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring/draft`,
        body,
      }),
    /** POST /api/v1/workflows/{workflow_uuid}/authoring/apply */
    applyAuthoring: (workflowUuid: string, body: BackendAuthoringApplyInput) =>
      backendRequest<BackendWorkflowAuthoring>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/authoring/apply`,
        body,
      }),
    /**
     * SSE GET /api/v1/events —— `frontend_event` 游标流（Last-Event-ID 续传）。
     * 事件行不作为实体浏览；EventSource 场景用本 URL。
     */
    eventsUrl: () => http.url("/api/v1/events"),
  };
}

/**
 * 只换 base URL 即可指向 Host 微后端（默认 http://127.0.0.1:8002）或
 * 独立调度权威进程，DTO 与信封不变。
 */
export function createWorkflowBackendClient(
  baseUrl: string,
  options: HttpTransportOptions = {},
) {
  return createWorkflowBackendApi(createHttpTransport(baseUrl, options));
}

export type WorkflowBackendApi = ReturnType<typeof createWorkflowBackendApi>;
