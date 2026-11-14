/**
 * Workflow Authority（workflow 域，unilabos/server/api/runtime/workflow.py）。
 *
 * 本机调度（默认）时 Host 进程挂载 Workflow 写入口：`/workflows` 是定义与
 * Graph，`/workflow-tasks` 是一次运行，`/workflow-node-jobs` 是节点作业。
 * 接入云端 Backend 后本域不在 Edge 进程挂载，前端应连接调度权威地址。
 *
 * - 响应使用 V1 `{code,data,error}` 信封；HTTP 200 且 code!=0 是业务失败，
 *   传输层统一解包并抛 BackendBusinessError。
 * - V1 合同：任务命令返回**命令投影**（HTTP 201），业务拒绝是 `status="rejected"` +
 *   `result.reason`（客户端抛 {@link TaskCommandRejectedError}）；`pause` 只暂停派发，
 *   `switch_to_step` 才转逐步；人工确认按 job 提交；干预是全局列表 + 按修订决策；
 *   组合调用按发布合同（`contract_uuid`）插入实验操作并返回父图。
 * - SSE 事件名按 V1：`workflow.runtime.changed`（dev 细粒度种类在 `data.kind`）、
 *   `workflow.authoring.changed`、`station.error_handling.changed`，游标与 `stream.reset` 不变。
 * - 状态词汇是 canonical（任务终态 `succeeded`），页面禁止自行改写字符串。
 * - 单点设备动作也走本域：`createTask({execution_kind: "ad_hoc_device_action"})`
 *   生成单 job 任务并复用整图的调度 / 历史 / 异常链路。
 * - 编排画布的节点模板（node_templates / handle_templates）随 graph hydration
 *   返回；新建节点时的动作定义来自 runtime.v1 endpoint 能力。
 * - 工作流即节点：PUT /io 声明入口参数与输出，POST /publications 冻结一次发布，
 *   POST /composite-invocations 把已发布子工作流内联展开进父图；任务可带 `input`，
 *   暂停时经 PATCH /workflow-tasks/{uuid}/input 修改未被消费的入口参数。
 */
import {
  BackendBusinessError,
  backendRequest,
  backendVoid,
  createHttpTransport,
  type HttpTransport,
  type HttpTransportOptions,
  type JsonObject,
  type JsonValue,
} from "./common.js";
import type { OpenApiBody, OpenApiQuery } from "./openapi-types.js";

// ---------------------------------------------------------------------------
// SSE（GET /api/v1/events）：V1 事件名
// ---------------------------------------------------------------------------

/** 运行态失效通知；dev 细粒度种类放在 `data.kind`（见 {@link WorkflowRuntimeChangeKind}）。 */
export const WORKFLOW_RUNTIME_CHANGED_EVENT = "workflow.runtime.changed" as const;
/** 工作流定义 / 作者态失效通知（`data.kind` 为 `workflow` / `definition`）。 */
export const WORKFLOW_AUTHORING_CHANGED_EVENT = "workflow.authoring.changed" as const;
/** 工站异常处置状态变化（`data.station_id`）。 */
export const STATION_ERROR_HANDLING_CHANGED_EVENT = "station.error_handling.changed" as const;
/** 游标超前（`cursor_ahead`）或过期（`cursor_expired`）：id 为新水位，客户端必须重读 REST。 */
export const STREAM_RESET_EVENT = "stream.reset" as const;
/** `/api/v1/events` 上全部持久通知事件名（不含无 id 的 `runtime.logs.changed`）。 */
export const WORKFLOW_EVENT_NAMES = [
  WORKFLOW_RUNTIME_CHANGED_EVENT,
  WORKFLOW_AUTHORING_CHANGED_EVENT,
  STATION_ERROR_HANDLING_CHANGED_EVENT,
  STREAM_RESET_EVENT,
] as const;

export type WorkflowRuntimeChangeKind = "task" | "node_run" | "node_job" | "manual_confirmation" | "resource";
export type WorkflowAuthoringChangeKind = "workflow" | "definition";

/** Backend Base 字段：软删除行不出现在公共 DTO；description 为空时省略。 */
export interface BackendWorkflowBase {
  uuid: string;
  create_time: string;
  update_time: string;
  meta_data: JsonObject;
  description?: string;
}

/** `workflow` 表 DTO：定义域权威，revision 是 Graph 写入的乐观锁。 */
export type BackendWorkflowType = "normal" | "experiment_operation";

export interface BackendWorkflow extends BackendWorkflowBase {
  name: string;
  tags: JsonValue[];
  revision: number;
  /** V1：普通工作流或实验操作（只有实验操作可以被其他工作流组合引用）；创建后不能改。 */
  workflow_type?: BackendWorkflowType | (string & {});
  /** V1：实验操作类别。 */
  operation_category_uuid?: string | null;
  /** V1：`draft`（当前修订未发布）/ `published`。 */
  status?: "draft" | "published" | (string & {});
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
  /** V1：图级库存需求（dev 把节点级需求放在 meta_data，列表为空）。 */
  inventory_requirements?: JsonObject[];
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
 * `workflow_task` 表 DTO；ad-hoc 设备动作任务的 `workflow_uuid` 为空。
 *
 * `input` 是本次运行的有效入口参数（按 input_contract 校验并补默认值）；`output` 只在
 * 单任务详情里返回：声明了 output_contract 的工作流是 `{输出名: 值}`（取不到的输出省略），
 * 未声明时是逐节点结果映射。列表投影不含 `output`。
 */
export interface BackendWorkflowTask extends BackendWorkflowBase {
  workflow_uuid: string | null;
  execution_kind: "workflow" | "ad_hoc_device_action";
  status: BackendWorkflowTaskStatus;
  workflow_snapshot: JsonObject;
  execution_plan: JsonObject;
  run_mode: BackendWorkflowRunMode;
  control_status: BackendWorkflowTaskControlStatus;
  /** 单任务详情/提交/控制响应必须提供；列表投影不包含此字段。 */
  control_revision?: number;
  cleanup_status: BackendWorkflowTaskCleanupStatus;
  trace_context: JsonObject;
  /** 有效入口参数；没有 input_contract 的工作流是 `{}`。 */
  input?: JsonObject;
  /** 仅单任务详情返回（见类型注释）；每个 attempt 的原始返回值仍读 job.return_info。 */
  output?: JsonObject;
  error_info: JsonValue[];
  target_node_uuid?: string;
  timeout_at?: string;
  attention_reason?: string;
  terminal_ghost_detected_at?: string;
  reconciliation_resume_control_status?: string;
  started_at?: string;
  finished_at?: string;
  /** V1：`normal` / `high`。 */
  priority?: "normal" | "high" | (string & {});
  /** V1：随任务冻结的库存绑定。 */
  inventory_bindings?: JsonObject[];
  /** V1：`normal` / `step`（= run_mode 的执行面视图）。 */
  execution_mode?: "normal" | "step" | (string & {});
  /** V1：派发闸门；`pause` 命令把它置为 `paused`，`resume` 恢复 `active`。 */
  dispatch_gate?: "active" | "paused" | (string & {});
  /** V1：任务在等什么（资源、人工、对账……）。 */
  wait_reason?: string | null;
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
  | "manual_confirm"
  /** 循环容器：循环体 = parent_uuid 指向它的子节点，调度器逐轮执行（每轮循环体追加 attempt） */
  | "loop";

/** 循环节点 `param`：for 固定轮数；while 每轮前判定条件，`max_iterations` 是安全上限。 */
export interface BackendLoopCondition {
  source: "device_state" | "node_output";
  /** device_state：设备 id + 状态字段名 */
  device_id?: string;
  field?: string;
  /** node_output：节点 uuid + 返回值里的路径（空串取整个返回值） */
  node_uuid?: string;
  data_key?: string;
  op: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "exists";
  value?: JsonValue;
}

export interface BackendLoopSpec {
  mode: "for" | "while";
  count?: number | null;
  condition?: BackendLoopCondition | null;
  max_iterations?: number;
  /** 两轮之间的等待秒数；空循环体的 while（"等到某状态"）必须 > 0 */
  interval_seconds?: number;
}

/** 循环节点运行的 `control_data.loop`：当前轮次（0 起）与静态摘要，用于画布进度展示。 */
export interface BackendLoopProgress {
  mode: "for" | "while";
  iteration: number;
  count?: number | null;
  max_iterations?: number | null;
  condition?: string | null;
}

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
  /** 本次尝试为何产生：`initial`（首次派发）/ `retry_decision`（决策链 retry）/ `loop_iteration`（循环下一轮）等。 */
  trigger: "initial" | "retry_decision" | "loop_iteration" | (string & {});
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
  /** V1 工作流 / 任务列表只保证 `has_more`；dev 列表另带 total。 */
  total?: number;
  has_more?: boolean;
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

/** V1 `POST /workflow-node-jobs/{job_uuid}/manual-confirmation`：`approve` / `reject`，其余为 dev 可选扩展。 */
export interface BackendManualConfirmationDecisionInput {
  action: "approve" | "reject";
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
  revision: number;
  status: BackendInterventionStatus;
  options: JsonObject[];
  resume_control_status: "active" | "paused";
  /** 已选项内容；未决策时为空对象 {}（不是键缺席）。 */
  selected_option: JsonObject;
  opened_at: string;
  /** status=selected 时必有。 */
  selected_option_id?: string;
  /** 执行面的 decision_id（稳定投递身份）。 */
  edge_command_uuid?: string;
  /** 决策投递状态：`none` / `pending` / `delivered` 等。 */
  delivery_status?: string;
  delivered_at?: string;
  decided_at?: string;
}

/** V1 `POST /workflow-interventions/{uuid}/decisions`：按修订选择设备提供的方案。 */
export interface BackendInterventionDecisionInput {
  revision: number;
  option_id: string;
  /** operator_intervention 需要服务端补记的结果；普通 retry / skip / abort 不传。 */
  result?: JsonValue;
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
 * `workflow_node_job_feedback_history` 行 DTO（V1 `GET /workflow-node-jobs/{uuid}/feedback` 的 items）。
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
  /** V1：创建时选择 `normal`（缺省）或 `experiment_operation`；更新时不能改（1000）。 */
  workflow_type?: BackendWorkflowType;
  /** V1：省略 = 保持 / 旧标签推导，null = 清除。 */
  operation_category_uuid?: string | null;
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
  /** 程序化导入默认 resolve；浏览器草稿必须 preserve，等待显式 Site 确认。 */
  site_binding_mode?: "resolve" | "preserve";
  revision: number;
  nodes: BackendWorkflowNodeWrite[];
  edges: BackendWorkflowEdgeWrite[];
}

/** execution_kind=workflow（默认）：按 Workflow 定义整图运行。 */
/** V1 任务控制命令类型。 */
export type BackendWorkflowTaskCommandType =
  | "step"
  | "resume"
  | "pause"
  | "switch_to_step"
  | "cancel"
  | "unlock_resources";

export interface BackendWorkflowTaskCommandInput {
  /**
   * - pause：自动运行中暂停派发（`dispatch_gate=paused`，已下发的动作照常跑完）；之后可 resume 或 step；
   * - switch_to_step：自动运行中的任务转为逐步（dev 原来的 pause 语义）；
   * - step：仅放行一个动作 attempt（逐步模式暂停中，或自动模式暂停派发中——后者先转逐步）；
   * - resume：自动模式解除暂停 / 逐步模式转为自动执行；
   * - cancel：任务进入 canceling，不再派发；正在执行的动作收到取消请求，设备锁保持到
   *   它真实返回，全部返回后任务落 canceled；
   * - unlock_resources：异常终态任务人工解除资源（须 `meta_data.confirmed_physical_safe: true` + description）。
   * 暂停时修改入口参数不走本命令，见 {@link BackendWorkflowTaskInputEditInput}（同样推进 control_revision）。
   */
  type: BackendWorkflowTaskCommandType;
  /** V1 可选：给出时按任务 control_revision 校验（不符 3003）。 */
  expected_revision?: number | null;
  /** 1..200 字符；同一次点击的重试复用同一键。 */
  idempotency_key: string;
  /** 只有 step 可以指定目标节点。 */
  target_node_uuid?: string | null;
  description?: string | null;
  meta_data?: JsonObject;
}

/** V1 `WorkflowTaskCommand` 投影：`pending`（单步许可等下一次派发认领）/ `succeeded` / `rejected`。 */
export interface BackendWorkflowTaskCommand {
  uuid: string;
  create_time: string;
  update_time: string;
  meta_data: JsonObject;
  workflow_task_uuid: string;
  type: BackendWorkflowTaskCommandType | (string & {});
  idempotency_key: string;
  status: "pending" | "succeeded" | "rejected" | (string & {});
  /** 拒绝时 `result.reason`（如 `task_is_terminal`、`task_is_not_paused_step`、`step_in_progress`）。 */
  result: JsonObject;
  trace_context: JsonObject;
  description?: string;
  target_node_uuid?: string;
  consumed_at?: string;
}

/** 任务命令拒绝原因 → 操作员可读说明（未列出的原样显示）。 */
export const TASK_COMMAND_REJECT_REASONS: Record<string, string> = {
  task_is_terminal: "任务已结束",
  task_is_not_abnormal_terminal: "只有失败 / 取消 / 超时的任务可以解除资源",
  only_workflow_tasks_accept_execution_control: "单点设备动作任务不接受暂停 / 单步控制",
  task_is_not_in_normal_mode: "任务不在自动执行模式",
  task_is_not_paused: "任务没有暂停",
  task_is_not_paused_step: "任务不在等待下一步的暂停状态",
  step_in_progress: "上一步仍在执行",
  target_node_not_ready: "目标节点还不能执行",
  job_outcome_unsettled: "有作业的结果尚未结算",
  claim_outcome_uncertain: "有资源占用的结果不确定",
};

/** 任务命令被拒（HTTP 201 + `status="rejected"`）：按 3003 状态冲突处理。 */
export class TaskCommandRejectedError extends BackendBusinessError {
  readonly command: BackendWorkflowTaskCommand;
  readonly reason: string;

  constructor(command: BackendWorkflowTaskCommand) {
    const reason = String(command.result?.reason ?? "rejected");
    super({ code: 3003, error: { msg: `任务命令被拒：${TASK_COMMAND_REJECT_REASONS[reason] ?? reason}`, code: reason } });
    this.name = "TaskCommandRejectedError";
    this.command = command;
    this.reason = reason;
  }
}

export interface BackendWorkflowTaskCreateInput {
  execution_kind?: "workflow";
  workflow_uuid: string;
  run_mode?: BackendWorkflowRunMode;
  /** V1：`normal`（缺省）/ `high`。 */
  priority?: "normal" | "high";
  /** V1：库存绑定（随任务冻结；预留由库存域负责）。 */
  inventory_bindings?: OpenApiBody<"/api/v1/workflow-tasks", "post">["inventory_bindings"];
  target_node_uuid?: string | null;
  description?: string | null;
  meta_data?: JsonObject;
  /**
   * 可选幂等键（1..200 字符）：同一次提交重试时复用，同键同语义只建一个任务；
   * 同键但 workflow / run_mode / target 不同按冲突拒绝。不带键时每次提交都是新任务。
   * 指纹包含非空 `input`：同键不同入口参数也按冲突拒绝。
   */
  idempotency_key?: string;
  /**
   * 入口参数：按工作流的 input_contract 校验（未知键 / 缺必填 / 类型不符均 code=1000，
   * 消息含 `workflow_input_unknown` / `workflow_input_required` / `workflow_value_invalid` 与路径），
   * 补默认值后成为任务的有效 `input`。未声明合同的工作流只接受 `{}`（或省略）。
   */
  input?: JsonObject;
}

/**
 * PATCH /workflow-tasks/{uuid}/input：暂停时修改入口参数（部分更新）。
 *
 * 只在 `control_status="paused"` 且任务未结束时允许；`expected_revision` 取任务的
 * control_revision。已被任何已下发 attempt 用过的参数冻结（3003），同值提交是空操作；
 * 未知参数 / 值不符合 Schema 为 1000。成功后 control_revision +1，返回更新后的任务。
 */
export interface BackendWorkflowTaskInputEditInput {
  expected_revision: number;
  input: JsonObject;
  /** 1..200 字符；同一次点击的重试复用同一键。 */
  idempotency_key?: string;
}

// ---------------------------------------------------------------------------
// 工作流即节点：入口参数合同、输出、发布与组合调用
//
// 合同写在服务端保留的 `workflow.meta_data.unilab`（只能经 PUT /io 写入；普通 PUT
// workflow / PUT graph 既不能写也不会清掉）。画布节点在 param **顶层**用
// `{"kind": "workflow_input", "parameter": 名}` 引用入口参数。
// ---------------------------------------------------------------------------

/** 值 Schema：JSON Schema 子集（type / enum / items / properties / required / anyOf / `$slot`）。 */
export type BackendWorkflowValueSchema = JsonObject;

export interface BackendWorkflowInputParameter {
  /** 合法标识符；节点 param 引用的就是它。 */
  name: string;
  schema: BackendWorkflowValueSchema;
  required?: boolean;
  default?: JsonValue;
  title?: string;
  description?: string;
}

export interface BackendWorkflowInputContract {
  version: 1;
  parameters: BackendWorkflowInputParameter[];
}

export interface BackendWorkflowOutputDescriptor {
  name: string;
  schema: BackendWorkflowValueSchema;
  implicit?: boolean;
  title?: string;
  description?: string;
}

export interface BackendWorkflowOutputContract {
  version: 1;
  outputs: BackendWorkflowOutputDescriptor[];
}

/** 节点 param 顶层的入口参数引用。 */
export interface BackendWorkflowInputReference {
  kind: "workflow_input";
  parameter: string;
}

/**
 * 输出绑定：画布节点按返回值路径（`data_key`，空串 = 整个返回值）；模板节点 / 组合调用
 * 用输出 Handle（`source_handle_uuid`）；也可以直接透传一个入口参数。
 */
export type BackendWorkflowOutputBinding =
  | { kind: "node_output"; workflow_node_uuid: string; data_key: string }
  | { kind: "node_output"; workflow_node_uuid: string; source_handle_uuid: string }
  | BackendWorkflowInputReference;

/** `workflow.meta_data.unilab` 里与 I/O 相关的服务端保留字段（只读视图）。 */
export interface BackendWorkflowDeclaredIo {
  input_contract: BackendWorkflowInputContract;
  output_contract: BackendWorkflowOutputContract;
  output_bindings: Record<string, BackendWorkflowOutputBinding>;
}

/** PUT /workflows/{uuid}/io（拒绝未知字段；null 合同视为空合同）。 */
export interface BackendWorkflowIODeclareInput {
  /** 当前 revision；不符 code=3003，成功后 revision +1。 */
  revision: number;
  input_contract?: BackendWorkflowInputContract | null;
  output_contract?: BackendWorkflowOutputContract | null;
  output_bindings?: Record<string, BackendWorkflowOutputBinding>;
  /** 模板节点的 Handle → 入口参数绑定，**完整替换**；画布节点不需要。 */
  node_input_bindings?: Record<string, Record<string, { parameter: string }>>;
  /** 按节点合并进 param（可写入 `workflow_input` 引用，或解绑时给回静态值）。 */
  node_params?: Record<string, JsonObject>;
}

export interface BackendWorkflowPublishInput {
  /** 必须等于工作流当前 revision；同一修订重复发布幂等。 */
  revision: number;
}

/**
 * 一次发布：冻结 `(workflow_uuid, revision)` 的不可变快照（正文不随 DTO 返回）。
 * `node_template.schema` 与 `/graph` 一样是 JSON 文本。
 */
export interface BackendWorkflowPublication {
  /** V1 发布合同 uuid（= contract_uuid，组合调用用它引用这次发布）。 */
  uuid: string;
  workflow_uuid: string;
  revision: number;
  name: string;
  /** V1 合同字段：发布时的工作流修订 / 该工作流第几次发布 / 输入输出合同 / 规模与指纹。 */
  workflow_revision?: number;
  version?: number;
  input_contract?: BackendWorkflowInputContract;
  output_contract?: BackendWorkflowOutputContract;
  executor_requirements?: JsonObject[];
  node_template_uuid?: string | null;
  node_count?: number;
  edge_count?: number;
  revision_fingerprint?: string;
  /** 语义图规范 JSON 的 `sha256:` 摘要。 */
  source_hash: string;
  /** 对外合同（输入 / 输出）摘要；没有单独的 contract_uuid。 */
  contract_digest: string;
  create_time: string;
  inputs: BackendWorkflowInputParameter[];
  outputs: BackendWorkflowOutputDescriptor[];
  node_template: BackendWorkflowNodeTemplate;
  handle_templates: BackendWorkflowHandleTemplate[];
}

/** 组合调用实参：静态 JSON 值，或引用父工作流自己的入口参数。 */
export type BackendCompositeArgument = JsonValue | BackendWorkflowInputReference;

/**
 * POST /workflows/{parent}/composite-invocations（V1 body，拒绝未知字段）。
 * 子工作流必须是实验操作（`workflow_type="experiment_operation"`，否则 1000）且当前修订已发布（否则 3003）。
 */
export interface BackendCompositeInvocationInput {
  /** 父图当前 revision；成功后 +1。 */
  revision: number;
  /** 发布合同 uuid（{@link BackendWorkflowPublication.uuid}）；子修订 = 该发布的修订。 */
  contract_uuid: string;
  /** 缺省由服务端生成；展开节点的 uuid 由它派生。 */
  invocation_uuid?: string | null;
  /** dev 发布没有执行器需求，必须为空对象。 */
  device_bindings?: Record<string, string>;
  pose?: JsonObject;
  /** 入口参数实参（dev 的 arguments）：静态值或引用父工作流入口参数。 */
  param?: Record<string, BackendCompositeArgument>;
}

/** 组合调用固定的子工作流发布（写在调用节点 `meta_data.unilab.composite`）。 */
export interface BackendCompositeContractPin {
  child_workflow_uuid: string;
  child_workflow_revision: number;
  child_applied_source_hash: string;
  contract_digest: string;
  composition_allow_transparent: boolean;
}

export interface BackendCompositeInvocationResult {
  invocation_uuid: string;
  contract_pin: BackendCompositeContractPin;
  /** 插入后的父图：多一个 `type="workflow"` 的调用节点和它内联展开的节点（parent_uuid 链指向调用节点）。 */
  graph: BackendWorkflowGraph;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** `{"kind": "workflow_input", "parameter": 名}` 构造器。 */
export function workflowInputReference(parameter: string): BackendWorkflowInputReference {
  return { kind: "workflow_input", parameter };
}

/** 是否为入口参数引用（与服务端 `entry_reference` 同一判定：kind 精确匹配、parameter 为字符串）。 */
export function isWorkflowInputReference(value: unknown): value is BackendWorkflowInputReference {
  const record = asObject(value);
  return Boolean(record && record.kind === "workflow_input" && typeof record.parameter === "string");
}

/**
 * 读出工作流声明的 I/O（`meta_data.unilab`）。未声明的部分给空合同；形状不认识的
 * 条目跳过，不在客户端补全或改写。
 */
export function declaredWorkflowIo(workflow: { meta_data?: unknown } | null | undefined): BackendWorkflowDeclaredIo {
  const unilab = asObject(asObject(workflow?.meta_data)?.unilab);
  const inputs = asObject(unilab?.input_contract)?.parameters;
  const outputs = asObject(unilab?.output_contract)?.outputs;
  const bindings = asObject(unilab?.output_bindings) ?? {};
  const named = <T>(items: unknown): T[] =>
    (Array.isArray(items) ? items : []).filter((item): item is T => {
      const record = asObject(item);
      return Boolean(record && typeof record.name === "string" && record.name && asObject(record.schema));
    });
  return {
    input_contract: { version: 1, parameters: named<BackendWorkflowInputParameter>(inputs) },
    output_contract: { version: 1, outputs: named<BackendWorkflowOutputDescriptor>(outputs) },
    output_bindings: Object.fromEntries(
      Object.entries(bindings).filter(([, binding]) => asObject(binding)),
    ) as Record<string, BackendWorkflowOutputBinding>,
  };
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

/** V1 `{candidate_hash}`：草稿 hash 与基准修订由服务端从已存候选推导（旧三元 CAS 体 1000）。 */
export interface BackendAuthoringApplyInput {
  candidate_hash: string;
}

/** 注册表工作流模板 → 工作流：角色绑定缺省时类角色单实例自动填、设备角色即其设备 id。 */
export interface BackendWorkflowFromTemplateInput {
  site_binding_mode?: "resolve" | "preserve";
  template_uuid: string;
  bindings?: Record<string, string>;
  name?: string;
}

export interface BackendWorkflowFromTemplateResult {
  workflow: BackendWorkflow;
  template_uuid: string;
  /** 实际生效的 {角色: device_id} */
  bindings: Record<string, string>;
}

// ---------------------------------------------------------------------------
// V1 增量编辑 / 类别 / 节点模板 / 任务观测 / 干预 / 资源占用（V1 合同新增的浏览器路由）
// 响应在 OpenAPI 里多为 Envelope[Any]：常用字段在下面声明，其余按 JsonObject 透传。
// ---------------------------------------------------------------------------

export interface BackendOperationCategory {
  uuid: string;
  name: string;
  sort_order: number;
  create_time?: string;
  update_time?: string;
}

/** V1 任务展示投影（`/workflow-task-presentations`）：紧凑任务 + 内嵌紧凑作业。 */
export interface BackendTaskPresentation extends JsonObject {
  uuid: string;
  status: string;
}

export interface BackendTaskDeleteEligibility {
  can_delete: boolean;
  already_deleted: boolean;
  delete_blockers: JsonObject[];
  status?: string;
  [key: string]: JsonValue | undefined;
}

export interface BackendTaskStepState extends JsonObject {
  in_flight_job_count: number;
  requires_selection: boolean;
  can_step: boolean;
}

/** V1 结构化人工交互请求（choice / text / values / point / corner）。 */
export interface BackendHumanInteraction extends JsonObject {
  uuid: string;
  status: string;
}

export type BackendHumanInteractionReply = OpenApiBody<"/api/v1/workflow-human-interactions/{interaction_uuid}/reply", "post">;
export type BackendWorkflowNodeCreateInput = OpenApiBody<"/api/v1/workflows/{workflow_uuid}/nodes", "post">;
export type BackendWorkflowNodePatchInput = OpenApiBody<"/api/v1/workflow-nodes/{node_uuid}", "patch">;
export type BackendWorkflowEdgeCreateInput = OpenApiBody<"/api/v1/workflows/{workflow_uuid}/edges", "post">;
export type BackendWorkflowBatchDeleteInput = OpenApiBody<"/api/v1/workflows/{workflow_uuid}/batch-delete", "post">;
export type BackendWorkflowDuplicateInput = OpenApiBody<"/api/v1/workflows/{workflow_uuid}/duplicate", "post">;
export type BackendWorkflowImportInput = OpenApiBody<"/api/v1/workflows/import", "post">;
export type BackendTemplateInstanceInput = OpenApiBody<"/api/v1/workflows/template-instances", "post">;
export type BackendRunPreflightInput = OpenApiBody<"/api/v1/workflows/{workflow_uuid}/run-preflight", "post">;
export type BackendResourceScopesInput = OpenApiBody<"/api/v1/workflows/{workflow_uuid}/resource-scopes", "put">;
export type BackendAuthoringCompileInput = OpenApiBody<"/api/v1/authoring/compile", "post">;
export type BackendAuthoringGenerateInput = OpenApiBody<"/api/v1/authoring/generate-python", "post">;
export type BackendAuthoringValidateInput = OpenApiBody<"/api/v1/authoring/validate", "post">;
export type BackendForceReleaseInput = OpenApiBody<"/api/v1/workflow-tasks/{task_uuid}/execution-locks/{lease_uuid}/force-release", "post">;
export type BackendReconcileQuantityInput = OpenApiBody<"/api/v1/workflow-node-jobs/{job_uuid}/reconcile-quantity", "post">;
export type BackendResolveUncertainInput = OpenApiBody<"/api/v1/workflow-node-jobs/{job_uuid}/resolve-uncertain", "post">;
export type BackendSettleMaterialTransferInput = OpenApiBody<"/api/v1/workflow-node-jobs/{job_uuid}/settle-material-transfer", "post">;
export type BackendDeviceActionRunInput = OpenApiBody<"/api/v1/device-action-runs", "post">;
/** 资源区间释放 / 借用归还 / 设备托管释放：记录版本 + 原因（审计）。 */
export interface BackendReleaseInput {
  expected_version: number;
  reason: string;
}
export type BackendIntervalLendInput = OpenApiBody<"/api/v1/workflow-resource-intervals/{owner_uuid}/lend", "post">;
export type BackendTaskPresentationQuery = OpenApiQuery<"/api/v1/workflow-task-presentations", "get">;
export type BackendNodeTemplateQuery = OpenApiQuery<"/api/v1/workflow-node-templates", "get">;
export type BackendResourceIntervalQuery = OpenApiQuery<"/api/v1/workflow-resource-intervals", "get">;
export type BackendResourceLoanQuery = OpenApiQuery<"/api/v1/workflow-resource-loans", "get">;
export type BackendDeviceTenancyQuery = OpenApiQuery<"/api/v1/workflow-device-tenancies", "get">;

export function createWorkflowBackendApi(http: HttpTransport) {
  return {
    /** POST /api/v1/workflows —— 创建 Workflow 定义 */
    createWorkflow: (body: BackendWorkflowWriteInput) =>
      backendRequest<BackendWorkflow>(http, {
        method: "POST",
        path: "/api/v1/workflows",
        body,
      }),
    /** POST /api/v1/workflows/from-template —— 注册表模板实例化（同模板同绑定幂等） */
    createWorkflowFromTemplate: (body: BackendWorkflowFromTemplateInput) =>
      backendRequest<BackendWorkflowFromTemplateResult>(http, {
        method: "POST",
        path: "/api/v1/workflows/from-template",
        body,
      }),
    /** GET /api/v1/workflows —— 定义分页列表（V1 过滤 keyword / name / workflow_type / status / operation_category_uuid） */
    workflows: (params: OpenApiQuery<"/api/v1/workflows", "get"> = {}) =>
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
    /**
     * PUT /api/v1/workflows/{workflow_uuid}/io —— 声明入口参数合同 / 输出 / 绑定（revision 乐观锁）。
     * 校验失败 code=1000（消息含 `workflow_io_invalid（路径）`），revision 不符 code=3003；返回整图。
     */
    declareIo: (workflowUuid: string, body: BackendWorkflowIODeclareInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "PUT",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/io`,
        body,
      }),
    /** POST /api/v1/workflows/{workflow_uuid}/publications —— 发布当前修订（201；同修订幂等，旧修订 3003） */
    publishWorkflow: (workflowUuid: string, body: BackendWorkflowPublishInput) =>
      backendRequest<BackendWorkflowPublication>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/publications`,
        body,
      }),
    /** GET /api/v1/workflows/{workflow_uuid}/publications —— 该工作流全部发布（revision 倒序） */
    workflowPublications: (workflowUuid: string) =>
      backendRequest<BackendWorkflowPublication[]>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/publications`,
      }),
    /** GET /api/v1/workflow-publications —— 每个未删除工作流的最新发布（插入子工作流的调色板） */
    latestPublications: () =>
      backendRequest<BackendWorkflowPublication[]>(http, {
        method: "GET",
        path: "/api/v1/workflow-publications",
      }),
    /**
     * POST /api/v1/workflows/{workflow_uuid}/composite-invocations —— 按发布合同插入实验操作并内联展开，
     * 返回插入后的父图（当前层，HTTP 200）。合同不存在 3002；子工作流不是实验操作 / 递归 / 实参不符 1000；
     * 子工作流当前修订未发布或父图 revision 不符 3003。
     */
    insertCompositeInvocation: (workflowUuid: string, body: BackendCompositeInvocationInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/composite-invocations`,
        body: { device_bindings: {}, ...body },
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
        execution_kind?: "workflow" | "ad_hoc_device_action" | "";
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
    /**
     * POST /api/v1/workflow-tasks/{task_uuid}/commands —— 幂等提交一次控制命令，返回命令投影（HTTP 201）。
     * 业务拒绝（`status="rejected"`）抛 {@link TaskCommandRejectedError}；成功后重读任务拿新的 control_revision。
     */
    commandTask: async (taskUuid: string, body: BackendWorkflowTaskCommandInput) => {
      const command = await backendRequest<BackendWorkflowTaskCommand>(http, {
        method: "POST",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/commands`,
        body,
      });
      if (command?.status === "rejected") throw new TaskCommandRejectedError(command);
      return command;
    },
    /** PATCH /api/v1/workflow-tasks/{task_uuid}/input —— 暂停时修改尚未被消费的入口参数（记为 edit_input 命令） */
    editTaskInput: (taskUuid: string, body: BackendWorkflowTaskInputEditInput) =>
      backendRequest<BackendWorkflowTask>(http, {
        method: "PATCH",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/input`,
        body,
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
    /**
     * POST /api/v1/workflow-node-jobs/{job_uuid}/manual-confirmation —— V1 按作业提交人工确认
     * （`approve` / `reject`；确认记录的 `workflow_node_job_uuid` 即 job_uuid）。返回确认记录。
     */
    decideJobManualConfirmation: (jobUuid: string, body: BackendManualConfirmationDecisionInput) =>
      backendRequest<BackendManualConfirmation>(http, {
        method: "POST",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/manual-confirmation`,
        body,
      }),
    /** GET /api/v1/workflow-node-jobs/{job_uuid}/results —— 每 job 至多一条（见类型注释） */
    jobResults: (jobUuid: string, params: BackendRuntimeReadParams = {}) =>
      backendRequest<BackendNodeJobResult[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/results`,
        params,
      }),
    /** GET /api/v1/workflow-node-jobs/{job_uuid}/feedback —— V1 page / page_size，sequence 自然序 */
    jobFeedback: (jobUuid: string, params: { page?: number; page_size?: number } = {}) =>
      backendRequest<BackendPage<BackendNodeJobFeedback>>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/feedback`,
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
    // ── V1：实验操作类别 ──────────────────────────────────────────
    /** 类别列表（V1 `{items}`，按 sort_order）。 */
    operationCategories: async () =>
      (await backendRequest<{ items: BackendOperationCategory[] }>(http, { method: "GET", path: "/api/v1/experiment-operation-categories" }))
        .items,
    operationCategory: (categoryUuid: string) =>
      backendRequest<BackendOperationCategory>(http, {
        method: "GET",
        path: `/api/v1/experiment-operation-categories/${encodeURIComponent(categoryUuid)}`,
      }),
    createOperationCategory: (body: { name: string; sort_order?: number }) =>
      backendRequest<BackendOperationCategory>(http, { method: "POST", path: "/api/v1/experiment-operation-categories", body }),
    updateOperationCategory: (categoryUuid: string, body: { name?: string; sort_order?: number }) =>
      backendRequest<BackendOperationCategory>(http, {
        method: "PUT",
        path: `/api/v1/experiment-operation-categories/${encodeURIComponent(categoryUuid)}`,
        body,
      }),
    /** 仍被实验操作引用时 3003。 */
    deleteOperationCategory: (categoryUuid: string) =>
      backendVoid(http, {
        method: "DELETE",
        path: `/api/v1/experiment-operation-categories/${encodeURIComponent(categoryUuid)}`,
      }),

    // ── V1：导入 / 复制 / 模板目录 ────────────────────────────────
    /** 旧版 JSON 导入（直接或 `data` 包裹），节点 / 连线身份重建；返回整图（201）。 */
    importWorkflow: (body: BackendWorkflowImportInput) =>
      backendRequest<BackendWorkflowGraph>(http, { method: "POST", path: "/api/v1/workflows/import", body }),
    /** 原始 `.py` 源码导入（只解析不执行）：建工作流 + 托管源码 + 保存草稿并应用；返回整图（201）。 */
    importPythonWorkflow: (source: string, filename: string) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "POST",
        path: "/api/v1/local/workflows/import-python",
        body: source,
        headers: { "Content-Type": "text/x-python; charset=utf-8", "X-Workflow-Filename": filename },
      }),
    duplicateWorkflow: (workflowUuid: string, body: BackendWorkflowDuplicateInput = {}) =>
      backendRequest<BackendWorkflow>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/duplicate`,
        body,
      }),
    /** 引用了该工作流（组合调用）的父工作流。 */
    referencedBy: (workflowUuid: string) =>
      backendRequest<JsonObject[]>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/referenced-by`,
      }),
    /** 注册表 @workflow 模板目录（含角色、可绑定设备）。 */
    templateCatalog: () =>
      backendRequest<JsonObject>(http, { method: "GET", path: "/api/v1/workflows/template-catalog" }),
    /** 模板实例化为工作流（V1 形状的 from-template）。 */
    createTemplateInstance: (body: BackendTemplateInstanceInput) =>
      backendRequest<JsonObject>(http, { method: "POST", path: "/api/v1/workflows/template-instances", body }),

    // ── V1：节点 / 连线增量编辑（全图 CAS 保存的薄封装） ────────────
    workflowNodes: (workflowUuid: string) =>
      backendRequest<BackendWorkflowNode[]>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/nodes`,
      }),
    addWorkflowNode: (workflowUuid: string, body: BackendWorkflowNodeCreateInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/nodes`,
        body,
      }),
    addWorkflowEdge: (workflowUuid: string, body: BackendWorkflowEdgeCreateInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/edges`,
        body,
      }),
    batchDelete: (workflowUuid: string, body: BackendWorkflowBatchDeleteInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/batch-delete`,
        body,
      }),
    workflowNode: (nodeUuid: string) =>
      backendRequest<BackendWorkflowNode>(http, { method: "GET", path: `/api/v1/workflow-nodes/${encodeURIComponent(nodeUuid)}` }),
    /** 只应用显式给出的字段。 */
    patchWorkflowNode: (nodeUuid: string, body: BackendWorkflowNodePatchInput) =>
      backendRequest<BackendWorkflowNode>(http, {
        method: "PATCH",
        path: `/api/v1/workflow-nodes/${encodeURIComponent(nodeUuid)}`,
        body,
      }),
    /** 仍有子节点时 3003。 */
    deleteWorkflowNode: (nodeUuid: string) =>
      backendVoid(http, { method: "DELETE", path: `/api/v1/workflow-nodes/${encodeURIComponent(nodeUuid)}` }),
    duplicateWorkflowNode: (nodeUuid: string, body: BackendWorkflowDuplicateInput = {}) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "POST",
        path: `/api/v1/workflow-nodes/${encodeURIComponent(nodeUuid)}/duplicate`,
        body,
      }),
    deleteWorkflowEdge: (edgeUuid: string) =>
      backendVoid(http, { method: "DELETE", path: `/api/v1/workflow-edges/${encodeURIComponent(edgeUuid)}` }),
    /** 节点模板目录（page / page_size / 过滤）。 */
    nodeTemplates: (params: BackendNodeTemplateQuery = {}) =>
      backendRequest<BackendPage<BackendWorkflowNodeTemplate>>(http, {
        method: "GET",
        path: "/api/v1/workflow-node-templates",
        params,
      }),
    nodeTemplate: (templateUuid: string) =>
      backendRequest<BackendWorkflowNodeTemplate>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-templates/${encodeURIComponent(templateUuid)}`,
      }),
    /** 资源作用域声明（整份替换）。 */
    putResourceScopes: (workflowUuid: string, body: BackendResourceScopesInput) =>
      backendRequest<BackendWorkflowGraph>(http, {
        method: "PUT",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/resource-scopes`,
        body,
      }),

    // ── V1：运行前检查 ────────────────────────────────────────────
    /** 不建任务、不占资源的候选运行检查（无入口参数）。 */
    runPreflight: (workflowUuid: string, params: { run_mode?: string; target_node_uuid?: string } = {}) =>
      backendRequest<JsonObject>(http, {
        method: "GET",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/run-preflight`,
        params,
      }),
    /** 带入口参数 / 库存绑定的运行前检查。 */
    submitRunPreflight: (workflowUuid: string, body: BackendRunPreflightInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflows/${encodeURIComponent(workflowUuid)}/run-preflight`,
        body,
      }),

    // ── V1：作者态转换（源码 ↔ 图） ───────────────────────────────
    compileAuthoring: (body: BackendAuthoringCompileInput) =>
      backendRequest<JsonObject>(http, { method: "POST", path: "/api/v1/authoring/compile", body }),
    generatePython: (body: BackendAuthoringGenerateInput) =>
      backendRequest<JsonObject>(http, { method: "POST", path: "/api/v1/authoring/generate-python", body }),
    validateAuthoring: (body: BackendAuthoringValidateInput) =>
      backendRequest<JsonObject>(http, { method: "POST", path: "/api/v1/authoring/validate", body }),

    // ── V1：任务观测与生命周期 ────────────────────────────────────
    /** 紧凑任务 + 内嵌作业；`view=matrix` 返回活跃 / 需关注任务 + 最近 terminal_limit 个终态任务。 */
    taskPresentations: (params: BackendTaskPresentationQuery = {}) =>
      backendRequest<BackendPage<BackendTaskPresentation>>(http, {
        method: "GET",
        path: "/api/v1/workflow-task-presentations",
        params,
      }),
    taskDeleteEligibility: (taskUuid: string) =>
      backendRequest<BackendTaskDeleteEligibility>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/delete-eligibility`,
      }),
    /** 软删除；有阻塞项 3003，重放返回 already_deleted。 */
    deleteTask: (taskUuid: string) =>
      backendRequest<JsonObject>(http, { method: "DELETE", path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}` }),
    /** 任务事件（after_sequence 游标，按任务分组的持久通知日志）。 */
    taskEvents: (taskUuid: string, params: { after_sequence?: number; limit?: number } = {}) =>
      backendRequest<JsonObject>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/events`,
        params,
      }),
    taskStepState: (taskUuid: string) =>
      backendRequest<BackendTaskStepState>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/step-state`,
      }),
    /** 暂停时把参数合并进某个待执行 attempt（V1 按作业粒度；入口参数仍用 editTaskInput）。 */
    patchTaskJobParam: (taskUuid: string, jobUuid: string, body: { param: JsonObject }) =>
      backendRequest<JsonObject>(http, {
        method: "PATCH",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/jobs/${encodeURIComponent(jobUuid)}/param`,
        body,
      }),
    taskExecutionLocks: (taskUuid: string) =>
      backendRequest<JsonObject[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/execution-locks`,
      }),
    forceReleaseExecutionLock: (taskUuid: string, leaseUuid: string, body: BackendForceReleaseInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/execution-locks/${encodeURIComponent(leaseUuid)}/force-release`,
        body,
      }),
    taskMaterialEvents: (taskUuid: string) =>
      backendRequest<JsonObject[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/material-events`,
      }),
    taskInventoryConsumptions: (taskUuid: string) =>
      backendRequest<JsonObject[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/inventory-consumptions`,
      }),
    jobInventoryConsumptions: (jobUuid: string) =>
      backendRequest<JsonObject[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/inventory-consumptions`,
      }),
    reagentInventoryConsumptions: (reagentUuid: string) =>
      backendRequest<JsonObject[]>(http, {
        method: "GET",
        path: `/api/v1/reagents/${encodeURIComponent(reagentUuid)}/inventory-consumptions`,
      }),

    // ── V1：干预与人工交互 ────────────────────────────────────────
    /** 全局干预列表（`open` / `selected` / `superseded`，limit 1..500）；按任务看用 workflow_task_uuid 过滤。 */
    interventions: (params: { status?: BackendInterventionStatus; limit?: number } = {}) =>
      backendRequest<BackendIntervention[]>(http, { method: "GET", path: "/api/v1/workflow-interventions", params }),
    intervention: (interventionUuid: string) =>
      backendRequest<BackendIntervention>(http, {
        method: "GET",
        path: `/api/v1/workflow-interventions/${encodeURIComponent(interventionUuid)}`,
      }),
    /** 按修订选择方案；201 新决策 / 200 重放，未投递 3003（用同一键重试）。 */
    decideIntervention: (interventionUuid: string, body: BackendInterventionDecisionInput, idempotencyKey: string) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-interventions/${encodeURIComponent(interventionUuid)}/decisions`,
        body,
        headers: { "Idempotency-Key": idempotencyKey },
      }),
    taskHumanInteractions: (taskUuid: string) =>
      backendRequest<BackendHumanInteraction[]>(http, {
        method: "GET",
        path: `/api/v1/workflow-tasks/${encodeURIComponent(taskUuid)}/human-interactions`,
      }),
    replyHumanInteraction: (interactionUuid: string, body: BackendHumanInteractionReply) =>
      backendRequest<BackendHumanInteraction>(http, {
        method: "POST",
        path: `/api/v1/workflow-human-interactions/${encodeURIComponent(interactionUuid)}/reply`,
        body,
      }),

    // ── V1：作业结果核对 ──────────────────────────────────────────
    reconcileJobQuantity: (jobUuid: string, body: BackendReconcileQuantityInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/reconcile-quantity`,
        body,
      }),
    /** 结果未知处置：只接受 `canceled`（经决策台投递 abort），等待边缘确认时 HTTP 202。 */
    resolveUncertainJob: (jobUuid: string, body: BackendResolveUncertainInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/resolve-uncertain`,
        body,
      }),
    /** 失败转运的实际位置结算（作业保持失败主状态，释放已结算占用）。 */
    settleMaterialTransfer: (jobUuid: string, body: BackendSettleMaterialTransferInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-node-jobs/${encodeURIComponent(jobUuid)}/settle-material-transfer`,
        body,
      }),
    /** V1 单点设备动作（按物料 + 节点模板）；201 新建 / 200 重放。 */
    createDeviceActionRun: (body: BackendDeviceActionRunInput) =>
      backendRequest<JsonObject>(http, { method: "POST", path: "/api/v1/device-action-runs", body }),

    // ── 资源区间 / 借还 / 设备托管（dev 独有，V1 信封） ────────────
    resourceIntervals: (params: BackendResourceIntervalQuery = {}) =>
      backendRequest<JsonObject[]>(http, { method: "GET", path: "/api/v1/workflow-resource-intervals", params }),
    releaseResourceInterval: (ownerUuid: string, body: BackendReleaseInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-resource-intervals/${encodeURIComponent(ownerUuid)}/release`,
        body,
      }),
    lendResourceInterval: (ownerUuid: string, body: BackendIntervalLendInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-resource-intervals/${encodeURIComponent(ownerUuid)}/lend`,
        body,
      }),
    resourceLoans: (params: BackendResourceLoanQuery = {}) =>
      backendRequest<JsonObject[]>(http, { method: "GET", path: "/api/v1/workflow-resource-loans", params }),
    returnResourceLoan: (loanUuid: string, body: BackendReleaseInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-resource-loans/${encodeURIComponent(loanUuid)}/return`,
        body,
      }),
    deviceTenancies: (params: BackendDeviceTenancyQuery = {}) =>
      backendRequest<JsonObject[]>(http, { method: "GET", path: "/api/v1/workflow-device-tenancies", params }),
    releaseDeviceTenancy: (tenancyUuid: string, body: BackendReleaseInput) =>
      backendRequest<JsonObject>(http, {
        method: "POST",
        path: `/api/v1/workflow-device-tenancies/${encodeURIComponent(tenancyUuid)}/release`,
        body,
      }),
    /** 资源等待图（等待者 + 活跃占用，Tarjan 环检测）。 */
    waitGraph: () => backendRequest<JsonObject>(http, { method: "GET", path: "/api/v1/workflow-runtime/wait-graph" }),

    /**
     * SSE GET /api/v1/events —— `frontend_event` 游标流（Last-Event-ID 续传；首连从当前水位开始，
     * 游标失效时收到 `stream.reset`）。事件名见 {@link WORKFLOW_EVENT_NAMES}；只作失效通知。
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
