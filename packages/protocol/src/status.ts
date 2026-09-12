/**
 * 人工决策（decisions 域，unilabos/server/api/runtime/diagnostics.py）。
 *
 * 两类需要操作员介入的执行端事件，都是 FastAPI 直出 DTO（无 Backend 信封），
 * REST 快照为权威，页面以轮询收敛：
 *
 * - 状态联锁（status-incidents）：设备属性触发策略后压住调度的 incident；
 *   前端只能提交 Host 返回的 `options[].action`，不能自行拼装设备动作。
 * - 动作异常（error-decisions）：动作失败后等待人工放行 / 替换结果 / 中止。
 *
 * 不可用语义：
 * - GET 503 → 本进程没有执行端（`--role backend` 纯调度权威），整面板置灰；
 * - GET 200 + host_ready=false + 空数组 → HostNode 启动中；
 * - POST 404 → incident 不存在/已终态/已被他人处理，重新 GET 收敛；
 * - POST 409 → 已有决策在执行。
 */
import type { HttpTransport, JsonObject, JsonValue } from "./common.js";

// ---------------------------------------------------------------------------
// 契约 §8 类型（冻结，字段名/枚举值照用不改）
// ---------------------------------------------------------------------------

export type Scalar = string | number | boolean;

/** 触发/恢复条件：单键对象，键为运算符（契约 §4.1 Condition）。 */
export type Condition =
  | { eq: Scalar }
  | { ne: Scalar }
  | { in: Scalar[] }
  | { gt: number }
  | { gte: number }
  | { lt: number }
  | { lte: number };

export type StatusIncidentOption = {
  action: "execute_recovery" | "resume";
  label: string;
  description?: string;
  /** 只读说明：由 Host 经 ActionClient 执行，浏览器不得调用或改参（红线）。 */
  recovery_action?: {
    device_id: string;
    action_name: string;
    params: Record<string, unknown>;
  };
};

/** 状态机完整枚举（契约 §4.2 冻结）；resolved / cleared 为终态。 */
export type StatusIncidentState =
  | "awaiting_decision"
  | "recovering"
  | "resolved"
  | "cleared";

export type StatusIncident = {
  incident_id: string;
  policy_id: string;
  device_id: string;
  property_name: string;
  observed_value: Scalar;
  when: Condition;
  clear_when: Condition;
  state: StatusIncidentState;
  scope: "device" | "global";
  mode: "interlock" | "notify";
  hold: { new_dispatch: boolean; running: "continue" };
  hold_token: string; // mode=notify 时为 ""
  message: string;
  options: StatusIncidentOption[];
  retry: { max_attempts: number; backoff_seconds: number; attempts_used: number };
  decision_timeout_seconds: number;
  default_on_timeout: "hold";
  created_at: number;
  updated_at: number;
  expires_at: null;
  require_confirmation: true;
};

/** 「谁在压着调度」的元素；生命周期与 incident 严格绑定，终态同刻释放。 */
export type SchedulerHold = {
  hold_token: string;
  incident_id: string;
  policy_id: string;
  device_id: string;
  property_name: string;
  /** 实际支持的完整枚举就这两个（没有 site/workflow 级）。 */
  scope: "device" | "global";
  reason: string;
  created_at: number;
};

export type StatusIncidentDecisionIn = {
  action?: "execute_recovery" | "resume"; // 与 option 二选一，同给以 action 为准
  option?: StatusIncidentOption;
  reason?: string;
};

export type StatusMonitorEvent = {
  seq: number;
  ts: number;
  channel: "status";
  type:
    | "status_incident_required" // data: StatusIncident
    | "status_incident_resolved" // data: StatusIncidentResolvedData
    | "status_incident_cleared"; // data: StatusIncidentClearedData
  data: Record<string, unknown>;
  trace_id: string;
  span_id: string;
};

// ---------------------------------------------------------------------------
// REST 响应形状（契约 §2/§3/§7）
// ---------------------------------------------------------------------------

export interface StatusIncidentsResponse {
  /** false 时 incidents/holds 必为空数组（HostNode 启动早期）。 */
  host_ready: boolean;
  incidents: StatusIncident[];
  holds: SchedulerHold[];
}

/** POST 成功回执：delivered 只表示 Host 已接受选择，不表示恢复已成功。 */
export interface StatusIncidentDecisionAck {
  incident_id: string;
  status: "delivered";
  /** execute_recovery → "recovering"；resume → "resolved"。 */
  state: "recovering" | "resolved";
}

export interface StatusIncidentResolvedData {
  incident_id: string;
  policy_id: string;
  device_id: string;
  property_name: string;
  state: "resolved";
  selected_action: "execute_recovery" | "resume";
  reason: string;
  hold_token: string;
  resolved_at: number;
}

export interface StatusIncidentClearedData {
  incident_id: string;
  policy_id: string;
  device_id: string;
  property_name: string;
  state: "cleared";
  observed_value: Scalar;
  hold_token: string;
  cleared_at: number;
}

// ---------------------------------------------------------------------------
// 动作异常决策（error-decisions）：动作失败后由微后端持有、等待人工放行。
// ---------------------------------------------------------------------------

/** Host 允许的决策动作；`options[].action` 是该 decision 的合法子集。 */
export type ErrorDecisionAction =
  | "retry"
  | "skip"
  | "abort"
  | "operator_intervention"
  | (string & {});

export interface ErrorDecisionOption {
  action: ErrorDecisionAction;
  label?: string;
  description?: string;
  /** operator_intervention 可携带替换结果。 */
  result?: JsonValue;
  return_value?: JsonValue;
}

/** GET /api/v1/error-decisions 的 items[] 条目（执行端 report）。 */
export interface ErrorDecision {
  decision_id: string;
  device_id: string;
  action_name: string;
  task_id: string;
  job_id: string;
  node_id: string;
  exception_type: string;
  error_message: string;
  traceback: string;
  options: ErrorDecisionOption[];
  retry_count: number;
  max_retries: number;
  /** epoch 秒。 */
  created_at: number;
  decision_timeout_seconds: number;
  /** epoch 秒；到期后按 default_on_decision_timeout 处理。 */
  expires_at: number;
  default_on_decision_timeout: ErrorDecisionAction;
  require_confirmation: boolean;
  category?: string;
  severity?: string;
}

export interface ErrorDecisionsResponse {
  items: ErrorDecision[];
}

export interface ErrorDecisionInput {
  /** 必须是该 decision `options[].action` 之一；与 option 二选一。 */
  action?: ErrorDecisionAction;
  option?: ErrorDecisionOption;
  reason?: string;
  /** operator_intervention 的人工替换结果。 */
  result?: JsonValue;
  extra?: JsonObject;
}

export interface ErrorDecisionAck {
  decision_id: string;
  status: "resolved";
}

// ---------------------------------------------------------------------------
// 客户端（decisions 域）
// ---------------------------------------------------------------------------

export function createDecisionsApi(http: HttpTransport) {
  return {
    /** GET /api/v1/status-incidents */
    incidents: (
      params: { device_id?: string; include_terminal?: boolean } = {},
    ) =>
      http.request<StatusIncidentsResponse>({
        method: "GET",
        path: "/api/v1/status-incidents",
        params: {
          device_id: params.device_id,
          include_terminal: params.include_terminal ? "true" : undefined,
        },
      }),
    /**
     * POST /api/v1/status-incidents/{incident_id}
     *
     * body.action 必须等于该 incident 当前 options[].action 之一（不在 options →
     * 422）。404=不存在/已终态；409=recovering 决策在执行。
     */
    resolveIncident: (incidentId: string, body: StatusIncidentDecisionIn) =>
      http.request<StatusIncidentDecisionAck>({
        method: "POST",
        path: `/api/v1/status-incidents/${encodeURIComponent(incidentId)}`,
        body,
      }),
    /** GET /api/v1/error-decisions —— 微后端持有的待决动作失败 */
    errorDecisions: () =>
      http.request<ErrorDecisionsResponse>({
        method: "GET",
        path: "/api/v1/error-decisions",
      }),
    /**
     * POST /api/v1/error-decisions/{decision_id}
     *
     * 请求体必须回带该 decision 的 job_id 与 device_id（微后端以此校验放行目标），
     * 并声明 scheduler_updated=true。409 = 已被处理或不再挂起；成功后以 GET 收敛。
     */
    resolveErrorDecision: (
      decision: Pick<ErrorDecision, "decision_id" | "job_id" | "device_id">,
      body: ErrorDecisionInput,
    ) =>
      http.request<ErrorDecisionAck>({
        method: "POST",
        path: `/api/v1/error-decisions/${encodeURIComponent(decision.decision_id)}`,
        body: {
          scheduler_updated: true,
          job_id: decision.job_id,
          device_id: decision.device_id,
          ...body,
        },
      }),
  };
}

export type DecisionsApi = ReturnType<typeof createDecisionsApi>;

// ---------------------------------------------------------------------------
// 状态通道事件 reducer（框架无关；用于把增量事件合并进面板状态）
// ---------------------------------------------------------------------------

/** 面板状态：incidents 以 incident_id 为唯一键，holds 以 hold_token 为唯一键。 */
export interface StatusIncidentPanelState {
  incidents: StatusIncident[];
  holds: SchedulerHold[];
}

function isStatusIncident(value: unknown): value is StatusIncident {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as StatusIncident).incident_id === "string" &&
    Array.isArray((value as StatusIncident).options)
  );
}

/** interlock 非终态 incident 对应的 hold 投影（字段与契约 §5 一一对应）。 */
function holdOf(incident: StatusIncident): SchedulerHold {
  return {
    hold_token: incident.hold_token,
    incident_id: incident.incident_id,
    policy_id: incident.policy_id,
    device_id: incident.device_id,
    property_name: incident.property_name,
    scope: incident.scope,
    reason: incident.message,
    created_at: incident.created_at,
  };
}

/**
 * 应用一条 status 通道事件，返回新的面板状态（纯函数，不就地修改）。
 *
 * - `status_incident_required`：按 incident_id upsert（首建/重试失败回落/超时
 *   提醒共用同一 incident_id）；mode=interlock 时同步 upsert hold 投影，
 *   mode=notify（hold_token=""）不产生 hold。
 * - `status_incident_resolved` / `status_incident_cleared`：移除该 incident 的
 *   面板项，并按事件里的 hold_token 增量移除 hold（§10.5）。
 */
export function applyStatusMonitorEvent(
  state: StatusIncidentPanelState,
  event: StatusMonitorEvent,
): StatusIncidentPanelState {
  if (event.type === "status_incident_required") {
    if (!isStatusIncident(event.data)) return state;
    const incident = event.data;
    const incidents = [
      ...state.incidents.filter((item) => item.incident_id !== incident.incident_id),
      incident,
    ];
    let holds = state.holds;
    if (incident.mode === "interlock" && incident.hold_token) {
      holds = [
        ...state.holds.filter((hold) => hold.hold_token !== incident.hold_token),
        holdOf(incident),
      ];
    }
    return { incidents, holds };
  }
  const data = event.data as Partial<StatusIncidentResolvedData>;
  const incidentId = typeof data.incident_id === "string" ? data.incident_id : "";
  const holdToken = typeof data.hold_token === "string" ? data.hold_token : "";
  return {
    incidents: state.incidents.filter((item) => item.incident_id !== incidentId),
    holds: holdToken
      ? state.holds.filter((hold) => hold.hold_token !== holdToken)
      : state.holds,
  };
}

/**
 * seq 连续性检查（§10.6）：跳号 / 回绕即应重拉 snapshot 收敛。
 * 返回 true 表示事件可按增量应用；false 表示调用方必须整体重拉。
 */
export function isConsecutiveStatusSeq(
  lastSeq: number | null,
  event: StatusMonitorEvent,
): boolean {
  return lastSeq === null || event.seq === lastSeq + 1;
}

// ---------------------------------------------------------------------------
// Mock fixtures（离线测试与 UI mock 模式共用；值取自契约 §4/§5 示例）
// ---------------------------------------------------------------------------

export function createMockStatusIncidentState(
  nowS = 1_786_440_000,
): StatusIncidentsResponse {
  const interlock: StatusIncident = {
    incident_id: "9c2f4a1e-77aa-4a7d-9c33-0e2b8f6d1a55",
    policy_id: "over_temperature",
    device_id: "heater-1",
    property_name: "status",
    observed_value: "ALARM",
    when: { eq: "ALARM" },
    clear_when: { eq: "OK" },
    state: "awaiting_decision",
    scope: "device",
    mode: "interlock",
    hold: { new_dispatch: true, running: "continue" },
    hold_token: "1f0c2b3a-8d4e-4f5a-9b6c-7d8e9f0a1b2c",
    message: "heater-1.status = ALARM (policy over_temperature)",
    options: [
      {
        action: "execute_recovery",
        label: "执行恢复动作",
        description: "复位加热器报警后自动确认状态恢复",
        recovery_action: {
          device_id: "heater-1",
          action_name: "reset_alarm",
          params: {},
        },
      },
      {
        action: "resume",
        label: "人工确认并恢复调度",
        description: "现场已处理，直接释放 hold；status 仍告警时会按冷却期重新触发",
      },
    ],
    retry: { max_attempts: 3, backoff_seconds: 5.0, attempts_used: 0 },
    decision_timeout_seconds: 300.0,
    default_on_timeout: "hold",
    created_at: nowS,
    updated_at: nowS,
    expires_at: null,
    require_confirmation: true,
  };
  const notify: StatusIncident = {
    ...interlock,
    incident_id: "5b8d0e2a-11cc-4f6e-8a21-9c3d7e5f0b44",
    policy_id: "low_pressure_notice",
    device_id: "pump-2",
    property_name: "pressure_state",
    observed_value: "LOW",
    when: { in: ["LOW", "CRITICAL"] },
    clear_when: { eq: "NORMAL" },
    mode: "notify",
    hold_token: "",
    message: "pump-2.pressure_state = LOW (policy low_pressure_notice)",
    options: [
      {
        action: "resume",
        label: "人工确认并恢复调度",
      },
    ],
    retry: { max_attempts: 3, backoff_seconds: 5.0, attempts_used: 3 },
  };
  return {
    host_ready: true,
    incidents: [interlock, notify],
    holds: [holdOf(interlock)],
  };
}
