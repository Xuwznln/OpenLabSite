export const OPENLAB_PROTOCOL_VERSION = "2.0.0" as const;
export const OPENLAB_API_PREFIX = "/api/v1" as const;

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue =
  | JsonPrimitive
  | JsonValue[]
  | { [key: string]: JsonValue };
export type JsonObject = { [key: string]: JsonValue };

export interface ValidationIssue {
  loc: Array<string | number>;
  msg: string;
  type: string;
}

/** FastAPI 直出错误体（HTTPException detail / 422 校验数组）。 */
export interface ProtocolErrorBody {
  detail?: string | ValidationIssue[];
  error?: string;
  code?: string | number;
  error_code?: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * 微后端协议域。每个域对应 Uni-Lab-OS `unilabos/server/api/` 下的一组路由：
 *
 * - `system`         health / hostlink peers / scheduler resources / restart（诊断路由）
 * - `runtime-v1`     runtime.db：Backend 会话、执行 endpoint、命令、执行 job、outbox
 * - `workflow`       runtime.db：Workflow 定义 / Graph / Task / Node Job / Authoring / SSE
 * - `registry`       runtime.db：Registry Authority（默认本机调度 Host 与 `--role backend` 均提供；远端受控 Edge 不挂载）
 * - `materials-v1`   materials.db：模板 / 物料聚合 / 位点 / 批次 / 预留 / 拓扑边 / 变更账本
 * - `graphs-v1`      materials.db：设备图（node-link）快照与实时拓扑
 * - `telemetry-v1`   telemetry.db：设备最新状态与追加事件
 * - `history-v1`     history.db：payload 与统一历史事件流
 * - `decisions`      执行端人工决策：status-incidents / error-decisions
 * - `driver-packages` 驱动包安装台账、目录、随包图（仅 Host）
 * - `device-processes` 受管本机 Slave 子进程（仅 Host）
 * - `lab-v1`         runtime.db：实验室布局（区域 / 围墙像素格）
 * - `debug`          四库 SQLite 只读浏览
 */
export type ProtocolDomain =
  | "system"
  | "runtime-v1"
  | "workflow"
  | "registry"
  | "materials-v1"
  | "graphs-v1"
  | "telemetry-v1"
  | "history-v1"
  | "decisions"
  | "driver-packages"
  | "device-processes"
  | "lab-v1"
  | "debug";

export interface OperationContract {
  id: string;
  domain: ProtocolDomain;
  method: HttpMethod | "SSE";
  path: string;
  summary: string;
  mutates: boolean;
  /**
   * 该操作在哪种进程角色下可用：
   * - `host`：设备执行进程（默认 `unilab -g graph.json`，`:8002`）；
   * - `backend`：独立调度权威进程（`unilab --role backend`）；
   * - `any`：两种角色都挂载。
   */
  role: "host" | "backend" | "any";
}

// ---------------------------------------------------------------------------
// Backend 信封：workflow / registry / graphs 域使用 `{code, data, error}`。
// HTTP 恒 200，code != 0 视为业务失败并抛 BackendBusinessError；
// 传输层 4xx/5xx 仍走 ApiError。
// ---------------------------------------------------------------------------

export interface BackendErrorPayload {
  msg?: string;
  [key: string]: unknown;
}

export interface BackendEnvelope<T = never> {
  code: number;
  data?: T;
  error?: BackendErrorPayload | string;
}

/** 业务码约定：1000 入参非法；3002 资源不存在/已删；3003 并发冲突；5001 目录不可用。 */
export const BACKEND_BUSINESS_CODES = {
  invalidInput: 1000,
  notFound: 3002,
  conflict: 3003,
  catalogUnavailable: 5001,
} as const;

export class BackendBusinessError extends Error {
  readonly code: number;
  readonly envelope: BackendEnvelope<unknown>;

  constructor(envelope: BackendEnvelope<unknown>) {
    const message =
      typeof envelope.error === "string"
        ? envelope.error
        : envelope.error?.msg ?? `Backend business error ${envelope.code}`;
    super(message);
    this.name = "BackendBusinessError";
    this.code = envelope.code;
    this.envelope = envelope;
  }

  get isNotFound(): boolean {
    return this.code === BACKEND_BUSINESS_CODES.notFound;
  }

  get isConflict(): boolean {
    return this.code === BACKEND_BUSINESS_CODES.conflict;
  }
}

// ---------------------------------------------------------------------------
// HTTP 传输层（axios）：所有协议客户端共用一个传输实例。
// JSON 请求/响应；非 2xx 归一为 ApiError（status + 后端错误体）。
// ---------------------------------------------------------------------------

import axios from "axios";
import type { AxiosInstance } from "axios";

export class ApiError extends Error {
  readonly status: number;
  readonly body?: ProtocolErrorBody;

  constructor(status: number, message: string, body?: ProtocolErrorBody) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }

  /** 网络层失败（断连 / 超时 / CORS），没有 HTTP 状态。 */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** 该路由未挂载（404）或服务未装配（503）：应视为「当前进程不支持该能力」。 */
  get isUnsupported(): boolean {
    return this.status === 404 || this.status === 503;
  }
}

export interface HttpTransportOptions {
  /** 默认请求超时（毫秒），默认 10_000。 */
  timeoutMs?: number;
  /** 内部创建 axios 时附加的默认 headers。 */
  headers?: Record<string, string>;
  /** 注入自定义 axios 实例（测试 mock / 自定义拦截器）；默认内部创建。 */
  axios?: AxiosInstance;
}

export interface RequestConfig {
  method: HttpMethod;
  path: string;
  /** query 参数；undefined 与空串跳过（与后端可选参数语义一致）。 */
  params?: Record<string, string | number | readonly (string | number)[] | undefined>;
  body?: unknown;
  timeoutMs?: number;
}

export interface HttpTransport {
  readonly base: string;
  request<T>(config: RequestConfig): Promise<T>;
  /** 构造完整 URL（EventSource/SSE 等不走 axios 的场景）。 */
  url(path: string, params?: RequestConfig["params"]): string;
}

function cleanParams(
  params?: RequestConfig["params"],
): Record<string, string | number | readonly (string | number)[]> | undefined {
  if (!params) return undefined;
  const out: Record<string, string | number | readonly (string | number)[]> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}

export function createHttpTransport(
  baseUrl: string,
  options: HttpTransportOptions = {},
): HttpTransport {
  const base = baseUrl.replace(/\/+$/, "");
  const defaultTimeout = options.timeoutMs ?? 10_000;
  const instance =
    options.axios ??
    axios.create({
      headers: { ...options.headers },
      validateStatus: () => true,
    });

  async function request<T>(config: RequestConfig): Promise<T> {
    let response;
    try {
      response = await instance.request<T>({
        method: config.method,
        url: `${base}${config.path}`,
        params: cleanParams(config.params),
        paramsSerializer: { indexes: null },
        data: config.body,
        // 只有带正文时才声明 JSON：workflow 路由会解码任何 JSON 类型的请求体，
        // 空体 + application/json 会被判为格式错误。
        headers: config.body === undefined ? undefined : { "Content-Type": "application/json" },
        timeout: config.timeoutMs ?? defaultTimeout,
        validateStatus: () => true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(0, message);
    }
    if (response.status >= 200 && response.status < 300) {
      return response.data as T;
    }
    const body = (response.data ?? undefined) as ProtocolErrorBody | undefined;
    const validationMessage =
      body && Array.isArray(body.detail) ? body.detail[0]?.msg : undefined;
    const detail =
      (body &&
        (typeof body.detail === "string"
          ? body.detail
          : validationMessage ?? body.error)) ||
      (typeof response.data === "string" && response.data) ||
      `HTTP ${response.status}`;
    throw new ApiError(response.status, String(detail), body);
  }

  function url(path: string, params?: RequestConfig["params"]): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === "") continue;
      if (Array.isArray(value)) {
        for (const item of value) search.append(key, String(item));
      } else {
        search.set(key, String(value));
      }
    }
    const encoded = search.toString();
    return `${base}${path}${encoded ? `?${encoded}` : ""}`;
  }

  return { base, request, url };
}

/** 唯一的 Backend 信封解包器：code != 0 抛 BackendBusinessError。 */
export async function backendRequest<T>(
  http: HttpTransport,
  request: RequestConfig,
): Promise<T> {
  const envelope = await http.request<BackendEnvelope<T>>(request);
  if (!envelope || typeof envelope !== "object" || envelope.code !== 0) {
    throw new BackendBusinessError(
      envelope ?? { code: -1, error: "Invalid Backend envelope" },
    );
  }
  return envelope.data as T;
}

export async function backendVoid(
  http: HttpTransport,
  request: RequestConfig,
): Promise<void> {
  const envelope = await http.request<BackendEnvelope>(request);
  if (!envelope || typeof envelope !== "object" || envelope.code !== 0) {
    throw new BackendBusinessError(
      envelope ?? { code: -1, error: "Invalid Backend envelope" },
    );
  }
}

// ---------------------------------------------------------------------------
// system 域：健康、HostLink 组网、调度资源、安静点重启
// （unilabos/server/api/runtime/diagnostics.py）
// ---------------------------------------------------------------------------

export interface HealthResponse {
  status: string;
  /** `local` = 本进程持有调度权威；`remote` = 已接入云端/独立 Backend。 */
  scheduler: "local" | "remote" | (string & {});
  /**
   * `ready` = 该地址提供设备执行面（本进程带 Host，或调度权威的 Host 子进程在线）；
   * `restarting` = 调度权威在线但 Host 子进程正在重启；`disabled` = 纯调度权威（--role backend）。
   */
  execution: "ready" | "restarting" | "disabled" | (string & {});
}

export interface HealthRequestOptions {
  /** 能力探测可使用更短的超时；未指定时采用 system 域默认值 4 秒。 */
  timeoutMs?: number;
}

/**
 * Slave 报送的单台设备档案（peers 响应 `devices` 映射的值）。
 * `action_value_mappings` 是 动作名 → registry 动作定义 的大对象，前端只透传。
 */
export interface HostLinkPeerDevice {
  id: string;
  registry_name: string;
  display_name: string;
  actions: string[];
  status_fields: string[];
  action_value_mappings: JsonObject;
  resource_uuid?: string;
}

/** HostLink（host-slave TCP 请求通路）的 peer 状态。 */
export interface HostLinkPeer {
  addr: string;
  /** 稳定的逻辑 Slave 标识（如 "device:material_bench"）；重连更换源端口时保持不变。 */
  node_id?: string;
  device_ids?: string[];
  devices?: Record<string, HostLinkPeerDevice>;
  /** 设备 ID → 最近一次心跳附带的状态字段。 */
  states?: Record<string, JsonObject>;
  machine_name: string;
  role: string;
  protocol_version?: number;
  capabilities?: string[];
  /** epoch 秒。 */
  connected_at: number;
  /** epoch 秒（最近一次心跳/消息）。 */
  last_seen: number;
  /** TCP 连接存活；不是判活依据。 */
  connected: boolean;
  /** 判活唯一依据（= connected && 心跳未超时）；断连 peer 仍会保留在列表里。 */
  online: boolean;
}

export type HostLinkPeerState = "online" | "stale" | "disconnected";

/** peer 三态分类的唯一 adapter：页面禁止自行组合 connected/online。 */
export function hostlinkPeerState(
  peer: Pick<HostLinkPeer, "connected" | "online">,
): HostLinkPeerState {
  if (peer.online) return "online";
  return peer.connected ? "stale" : "disconnected";
}

/** Host 微后端通过 HostLink 下发给全部 Slave 的 ROS 网络策略。 */
export interface HostLinkRosConfig {
  domain_id: number | null;
  automatic_discovery_range: string;
  static_peers: string[];
  discovery_server: string;
  discovery_server_managed?: boolean;
  discovery_server_disabled?: boolean;
}

export interface HostLinkStatus {
  /** host = 本机是 host（peers 有效）；slave = 本机是 slave（client 有效）；disabled = 未启用。 */
  role: "host" | "slave" | "disabled";
  peers: HostLinkPeer[];
  client: {
    online: boolean;
    host: string;
    port: number;
    node_id?: string;
    device_ids?: string[];
    capabilities?: string[];
  } | null;
  owner?: string | null;
  host_id?: string | null;
  host_node_id?: string | null;
  protocol_version?: number | null;
  ros?: HostLinkRosConfig | null;
}

/** GET /api/v1/scheduler/resources：本机调度器的资源申请 / 占有 / 交接快照。 */
export interface SchedulerResourceSnapshot {
  sequence: number;
  requests: JsonObject[];
  ownerships: JsonObject[];
  handoffs: JsonObject[];
}

export type RestartMode = "quiescent" | "immediate";
export type RestartScope = "auto" | "edge" | "devices" | "process";

export interface RestartRequestInput {
  mode?: RestartMode;
  scope?: RestartScope;
}

/** 全量重置预览/受理结果；202 不代表归档已完成，最终结果见服务端备份清单。 */
export interface ResetPreview {
  supported: boolean;
  pending: boolean;
  confirmation_token: string;
  backup_path: string;
  detail: string;
}

export interface RestartStatus {
  pending: boolean;
  mode: RestartMode | (string & {});
  scope: RestartScope | (string & {});
  effective_scope: string;
  requested_at: number | string | null;
  restarting: boolean;
  active_jobs: JsonValue[];
  dispatch_paused: boolean;
  [key: string]: JsonValue | undefined;
}

/** GET /api/v1/ping：回显客户端时间戳 + 服务端时钟（链路时延 / 时钟偏差诊断）。 */
export interface PingResponse {
  client_timestamp: number | null;
  /** 服务端 epoch 秒（浮点）。 */
  server_timestamp: number;
  scheduler: "local" | "remote" | (string & {});
}

/** 日志来源由 Host 提供，source_id 是不透明标识，不能当成本地文件路径。 */
export interface RuntimeLogSource {
  source_id: string;
  name: string;
  role: "host" | "slave";
  machine_name: string;
  node_id: string;
  pid: number | null;
  device_ids: string[];
  online: boolean;
  managed: boolean;
  supported: boolean;
  detail: string;
}

export interface RuntimeLogNotice {
  source_ids: string[];
  sources_changed: boolean;
  all_sources: boolean;
}

export const RUNTIME_LOG_NOTICE_EVENT = "runtime.logs.changed";

export interface RuntimeLogLine { offset: number; text: string }

export interface RuntimeLogBatch {
  source_id: string;
  stream_id: string;
  cursor: string;
  lines: RuntimeLogLine[];
  has_more: boolean;
  reset: boolean;
  truncated: boolean;
  path: string;
  pid: number | null;
}

export function createSystemApi(http: HttpTransport) {
  return {
    resetPreview: () => http.request<ResetPreview>({ method: "GET", path: "/api/v1/reset" }),
    requestReset: (body: { confirmation_token: string; confirmation: string }) =>
      http.request<ResetPreview>({ method: "POST", path: "/api/v1/reset", body, timeoutMs: 150_000 }),
    /** GET /api/v1/health */
    health: (options: HealthRequestOptions = {}) =>
      http.request<HealthResponse>({
        method: "GET",
        path: "/api/v1/health",
        timeoutMs: options.timeoutMs ?? 4_000,
      }),
    /** GET /api/v1/ping —— 浏览器 ↔ 微后端往返时延；host_node 的 test_latency 用同一端点测 Edge ↔ Backend */
    ping: (clientTimestamp: number = Date.now() / 1000) =>
      http.request<PingResponse>({
        method: "GET",
        path: "/api/v1/ping",
        params: { client_timestamp: clientTimestamp },
        timeoutMs: 4_000,
      }),
    /** GET /api/v1/hostlink/peers —— host-slave TCP 组网在线状态 */
    hostlinkPeers: () =>
      http.request<HostLinkStatus>({
        method: "GET",
        path: "/api/v1/hostlink/peers",
        timeoutMs: 4_000,
      }),
    /** Host + 本机受管 Slave + 外部 Slave；不包含独立通信日志。 */
    logSources: () => http.request<{ sources: RuntimeLogSource[] }>({
      method: "GET", path: "/api/v1/hostlink/log-sources",
    }),
    /** 首次读取尾部；之后原样传回 cursor，重启 reset 后重新建立窗口。 */
    logs: (sourceId: string, options: { cursor?: string; limit?: number } = {}) =>
      http.request<RuntimeLogBatch>({
        method: "GET", path: "/api/v1/hostlink/logs",
        params: { source_id: sourceId, cursor: options.cursor, limit: options.limit ?? 300 },
      }),
    /**
     * GET /api/v1/scheduler/resources —— 本机调度资源快照。
     * 503 表示该 Host 已接入云端、调度权威在远端 Backend，不是服务故障。
     */
    schedulerResources: () =>
      http.request<SchedulerResourceSnapshot>({
        method: "GET",
        path: "/api/v1/scheduler/resources",
      }),
    /** GET /api/v1/restart —— 安静点重启等待状态 */
    restartStatus: () =>
      http.request<RestartStatus>({ method: "GET", path: "/api/v1/restart" }),
    /** POST /api/v1/restart —— 登记重启：暂停新派发，active job 清空后按 scope 重启 */
    requestRestart: (body: RestartRequestInput = {}) =>
      http.request<RestartStatus>({ method: "POST", path: "/api/v1/restart", body }),
    /** DELETE /api/v1/restart —— 取消等待中的重启并恢复派发 */
    cancelRestart: () =>
      http.request<RestartStatus>({ method: "DELETE", path: "/api/v1/restart" }),
  };
}

export type SystemApi = ReturnType<typeof createSystemApi>;
