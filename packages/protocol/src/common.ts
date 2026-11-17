export const OPENLAB_PROTOCOL_VERSION = "3.0.0" as const;
export const OPENLAB_API_PREFIX = "/api/v1" as const;
/** V1 进程管理路由（原 Workspace Host 合同）不带 `/api` 前缀，成功是裸 JSON。 */
export const OPENLAB_PROCESS_MANAGEMENT_PREFIX = "/v1" as const;

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

/**
 * 非 2xx 响应的错误体：信封（503 + 5001 / 未匹配路由 404 + 4001）、FastAPI 默认（`detail`）
 * 或 V1 进程管理的 `{error: {code, message}}`。
 */
export interface ProtocolErrorBody {
  detail?: string | ValidationIssue[];
  error?: string | { msg?: string; message?: string; code?: string; details?: JsonObject };
  code?: string | number;
  error_code?: string;
}

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/**
 * 微后端协议域。每个域对应 Uni-Lab-OS `unilabos/server/api/` 下的一组路由：
 *
 * - `system`             health / readiness / hostlink peers / scheduler resources / restart / reset（诊断路由）
 * - `runtime-v1`         runtime.db：Backend 会话、执行 endpoint、命令、执行 job、outbox
 * - `workflow`           runtime.db：Workflow 定义 / Graph / 增量编辑 / Task / Node Job / 干预 / Authoring / SSE
 * - `run-history`        runtime.db：V1 运行历史视图（`/history/workflows|jobs`，调度权威回答）
 * - `scheduler`          调度观测与运维：monitor / timeline / time-plan / reschedule / 排空 / 库存与物理恢复
 * - `registry`           runtime.db：Registry Authority（默认本机调度 Host 与 `--role backend` 均提供；远端受控 Edge 不挂载）
 * - `inventory`          materials.db：V1 Edge 库存操作面 `/inventory/*`，`POST /inventory/commands` 是唯一写入口
 * - `materials-v1`       materials.db：dev 独有物料路由（物料树、registry 资源类、拓扑边、执行结算读、设备通知）
 * - `graphs-v1`          materials.db：设备图（node-link）快照与实时拓扑
 * - `chemicals-v1`       materials.db：化学品定义（CAS / InChIKey 可空唯一键）
 * - `telemetry-v1`       telemetry.db：设备最新状态与追加事件
 * - `device-state`       telemetry.db：V1 设备状态视图（Host）
 * - `history-v1`         history.db：payload 与统一历史事件流（`/edge/history/*`，Host）
 * - `decisions`          执行端人工决策：status-incidents / error-decisions
 * - `driver-packages`    驱动包安装台账、目录、随包图（仅 Host）
 * - `device-processes`   受管本机 Slave 子进程（仅 Host）
 * - `lab-v1`             实验室档案 / 布局网格 / 分区 / 摆放（V1 lab 合同）
 * - `process-management` V1 进程管理（`/v1/snapshot|operations|logs`，裸 JSON）
 * - `debug`              四库 SQLite 只读浏览
 */
export type ProtocolDomain =
  | "system"
  | "runtime-v1"
  | "workflow"
  | "run-history"
  | "scheduler"
  | "registry"
  | "inventory"
  | "materials-v1"
  | "graphs-v1"
  | "chemicals-v1"
  | "telemetry-v1"
  | "device-state"
  | "history-v1"
  | "decisions"
  | "driver-packages"
  | "device-processes"
  | "lab-v1"
  | "process-management"
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
   * - `host`：设备执行进程（默认拓扑里经调度权威端口代理到 Host 子进程）；
   * - `backend`：独立调度权威进程（`unilab --role backend`）；
   * - `any`：两种角色都挂载。
   */
  role: "host" | "backend" | "any";
  /** 按 V1 设计不包信封的路由（探针、库存命令、进程管理）；缺省即 V1 信封。 */
  raw?: true;
}

// ---------------------------------------------------------------------------
// V1 信封：全部 `/api/v1` JSON 路由都是 `{code, data}` / `{code, error: {msg, code?, details?}}`。
//
// - HTTP 200 + code 0：成功，传输层解包返回 `data`（无数据的命令可省略 data）；
// - HTTP 200 + code != 0：业务失败，抛 BackendBusinessError（code / symbol / details）；
// - 例外仍用 HTTP 状态码：全量重置维护闸门 503 + 5001，未挂载的路由 404，服务端缺陷 500，
//   统一抛 ApiError（status + 信封里的业务码）；管理 API 不鉴权，没有 401；
// - 不包信封的路由（`/health`、`/readiness`、`POST /inventory/commands`、`/v1/*` 进程管理、
//   SSE）在请求上标 `raw: true`，原样返回正文。
// ---------------------------------------------------------------------------

export interface BackendErrorPayload {
  msg?: string;
  /** 符号码，只在 V1 同路由也输出时出现（如 `workflow_identity_mismatch`、`preflight_failed`）。 */
  code?: string;
  details?: JsonObject;
  [key: string]: unknown;
}

export interface BackendEnvelope<T = never> {
  code: number;
  data?: T;
  error?: BackendErrorPayload | string;
}

/**
 * V1 业务码（与 Uni-Lab-OS `server/api/envelope.py` 一一对应）。
 * 管理 API 不鉴权：控制面 token 已取消，「未授权」1002 不再出现；dev 时代的 4001 是「资源不存在」。
 */
export const BACKEND_BUSINESS_CODES = {
  ok: 0,
  internalError: 1,
  invalidInput: 1000,
  operationNotAllowed: 1001,
  databaseConflict: 2005,
  /** 工作流或任务不存在。 */
  notFound: 3002,
  /** 状态冲突：修订过期、唯一键重复、状态不允许。 */
  conflict: 3003,
  reagentInfoInUse: 4000,
  resourceNotFound: 4001,
  resourceDataConflict: 4002,
  resourceTemplateNotFound: 5000,
  /** 依赖暂不可用（Host 启动 / 重启中，带 Retry-After）或当前部署不支持。 */
  serviceUnavailable: 5001,
  templateDefinitionInvalid: 5003,
  templateDataConflict: 5004,
  materialNotFound: 6000,
  materialTemplateNotFound: 6001,
  materialTemplateImmutable: 6002,
  materialParentNotFound: 6003,
  materialParentCycle: 6004,
  materialSiteNotFound: 6006,
  materialSiteOccupied: 6007,
  materialSiteTemplateNotAllowed: 6008,
  materialSiteCycle: 6009,
  materialIdentityConflict: 6010,
  materialActiveClaimConflict: 6011,
  /** @deprecated 旧名，等同 serviceUnavailable。 */
  catalogUnavailable: 5001,
} as const;

const NOT_FOUND_CODES: ReadonlySet<number> = new Set([3002, 4001, 5000, 6000, 6001, 6003, 6006]);
const CONFLICT_CODES: ReadonlySet<number> = new Set([2005, 3003, 4000, 4002, 5004, 6002, 6004, 6007, 6008, 6009, 6010, 6011]);

export interface BackendErrorInit {
  /** 携带该信封的 HTTP 状态（业务失败通常是 200）。 */
  status?: number;
  /** 服务端 `Retry-After`（毫秒）；跨源时浏览器读不到这个头，值为 undefined。 */
  retryAfterMs?: number;
}

export class BackendBusinessError extends Error {
  readonly code: number;
  readonly envelope: BackendEnvelope<unknown>;
  /** `error.code` 符号码（如 `preflight_failed`）；没有时为 undefined。 */
  readonly symbol?: string;
  readonly details?: JsonObject;
  readonly httpStatus: number;
  readonly retryAfterMs?: number;

  constructor(envelope: BackendEnvelope<unknown>, init: BackendErrorInit = {}) {
    const message =
      typeof envelope.error === "string"
        ? envelope.error
        : envelope.error?.msg ?? `Backend business error ${envelope.code}`;
    super(message);
    this.name = "BackendBusinessError";
    this.code = envelope.code;
    this.envelope = envelope;
    if (envelope.error && typeof envelope.error === "object") {
      if (typeof envelope.error.code === "string") this.symbol = envelope.error.code;
      if (envelope.error.details && typeof envelope.error.details === "object") this.details = envelope.error.details;
    }
    this.httpStatus = init.status ?? 200;
    this.retryAfterMs = init.retryAfterMs;
  }

  /** 工作流 / 任务 / 资源 / 模板 / 物料不存在（3002 / 4001 / 5000 / 6000 / 6001 / 6003 / 6006）。 */
  get isNotFound(): boolean {
    return NOT_FOUND_CODES.has(this.code);
  }

  /** 状态或数据冲突（3003 / 4002 / 2005 / 6007 / 6010 / 6011 等）。 */
  get isConflict(): boolean {
    return CONFLICT_CODES.has(this.code);
  }

  get isInvalidInput(): boolean {
    return this.code === BACKEND_BUSINESS_CODES.invalidInput;
  }

  /** 1001：只读模式 / 调试不允许 / 设备动作不允许。 */
  get isOperationNotAllowed(): boolean {
    return this.code === BACKEND_BUSINESS_CODES.operationNotAllowed;
  }

  /** 5001：依赖暂不可用（Host 启动或重启中）或部署不支持该能力。 */
  get isUnavailable(): boolean {
    return this.code === BACKEND_BUSINESS_CODES.serviceUnavailable;
  }

  /** 与 ApiError.isUnsupported 同义的鸭子类型入口：页面据此显示「当前进程不提供」降级态。 */
  get isUnsupported(): boolean {
    return this.isUnavailable;
  }
}

// ---------------------------------------------------------------------------
// HTTP 传输层（axios）：所有协议客户端共用一个传输实例。
// ---------------------------------------------------------------------------

import axios from "axios";
import type { AxiosInstance } from "axios";

export class ApiError extends Error {
  readonly status: number;
  readonly body?: ProtocolErrorBody;
  readonly retryAfterMs?: number;

  constructor(status: number, message: string, body?: ProtocolErrorBody, retryAfterMs?: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
    this.retryAfterMs = retryAfterMs;
  }

  /** 正文是信封时的业务码（503 维护闸门 → 5001，未匹配路由 404 → 4001）；其它正文为 undefined。 */
  get businessCode(): number | undefined {
    const code = Number(this.body?.code);
    return this.body?.code !== undefined && Number.isFinite(code) ? code : undefined;
  }

  /** 网络层失败（断连 / 超时 / CORS），没有 HTTP 状态。 */
  get isNetwork(): boolean {
    return this.status === 0;
  }

  /** 该路由未挂载（404）或进程级不可用（503）：应视为「当前进程不支持该能力」。 */
  get isUnsupported(): boolean {
    return this.status === 404 || this.status === 503;
  }
}

/** 页面判定「当前进程 / 部署不提供该能力」：404 / 503，或信封 5001（Host 不在线、--role backend）。 */
export function isCapabilityUnavailable(error: unknown): boolean {
  return (error instanceof ApiError && error.isUnsupported) || (error instanceof BackendBusinessError && error.isUnavailable);
}

/** Host 启动 / 重启期间 Host 专有路由返回 HTTP 200 + 5001 + Retry-After：GET 按此退避重试。 */
export interface UnavailableRetryOptions {
  /** 最多重试几次（不含首个请求），默认 2；0 关闭。 */
  retries?: number;
  /** 读不到 Retry-After（跨源时浏览器不暴露该头）时的等待，默认 1000 ms。 */
  delayMs?: number;
  /** 单次等待上限，默认 3000 ms（Retry-After 更长也按上限等）。 */
  maxDelayMs?: number;
}

export interface HttpTransportOptions {
  /** 默认请求超时（毫秒），默认 10_000。 */
  timeoutMs?: number;
  /** 内部创建 axios 时附加的默认 headers。 */
  headers?: Record<string, string>;
  /** 注入自定义 axios 实例（测试 mock / 自定义拦截器）；默认内部创建。 */
  axios?: AxiosInstance;
  /** GET 遇到 5001（Host 暂不可用）时的退避重试；`false` 关闭。写请求从不自动重试。 */
  unavailableRetry?: UnavailableRetryOptions | false;
  /** 退避等待的实现（测试注入假时钟）；默认 setTimeout。 */
  sleep?: (ms: number) => Promise<void>;
}

export interface RequestConfig {
  method: HttpMethod;
  path: string;
  /** query 参数；undefined 与空串跳过（与后端可选参数语义一致）。 */
  params?: Record<string, string | number | boolean | readonly (string | number)[] | null | undefined>;
  body?: unknown;
  timeoutMs?: number;
  /** 该路由按 V1 设计不包信封：原样返回正文（2xx），非 2xx 仍抛 ApiError。 */
  raw?: boolean;
  /** 额外请求头（如 `Idempotency-Key`）。 */
  headers?: Record<string, string>;
}

export interface HttpTransport {
  readonly base: string;
  /** 发请求并解开 V1 信封（`raw: true` 除外）；业务失败抛 BackendBusinessError，传输失败抛 ApiError。 */
  request<T>(config: RequestConfig): Promise<T>;
  /** 构造完整 URL（EventSource/SSE 等不走 axios 的场景）。 */
  url(path: string, params?: RequestConfig["params"]): string;
}

type CleanParams = Record<string, string | number | readonly (string | number)[]>;

function cleanParams(params?: RequestConfig["params"]): CleanParams | undefined {
  if (!params) return undefined;
  const out: CleanParams = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    out[key] = typeof value === "boolean" ? String(value) : value;
  }
  return Object.keys(out).length ? out : undefined;
}

/** 正文是否为 V1 信封：数字 code，且只有 code / data / error 三个键。 */
export function isBackendEnvelope(value: unknown): value is BackendEnvelope<unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return typeof record.code === "number" && Object.keys(record).every((key) => key === "code" || key === "data" || key === "error");
}

/** `Retry-After`：秒数或 HTTP 日期 → 毫秒；读不到（跨源未暴露）或不合法为 undefined。 */
export function parseRetryAfter(value: unknown, now: number = Date.now()): number | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const text = String(value).trim();
  if (!text) return undefined;
  if (/^\d+(\.\d+)?$/.test(text)) return Math.round(Number(text) * 1000);
  const at = Date.parse(text);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}

function headerValue(headers: unknown, name: string): unknown {
  if (!headers || typeof headers !== "object") return undefined;
  const getter = (headers as { get?: (key: string) => unknown }).get;
  if (typeof getter === "function") {
    const value = getter.call(headers, name);
    if (value !== undefined && value !== null) return value;
  }
  const record = headers as Record<string, unknown>;
  return record[name] ?? record[name.toLowerCase()];
}

function errorMessage(body: unknown, status: number): string {
  if (typeof body === "string" && body) return body;
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : undefined;
  if (record) {
    const error = record.error;
    if (error && typeof error === "object") {
      const nested = error as Record<string, unknown>;
      if (typeof nested.msg === "string" && nested.msg) return nested.msg;
      if (typeof nested.message === "string" && nested.message) return nested.message;
    }
    if (typeof error === "string" && error) return error;
    const detail = record.detail;
    if (typeof detail === "string" && detail) return detail;
    if (Array.isArray(detail) && detail[0] && typeof (detail[0] as ValidationIssue).msg === "string") {
      return (detail[0] as ValidationIssue).msg;
    }
  }
  return `HTTP ${status}`;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createHttpTransport(
  baseUrl: string,
  options: HttpTransportOptions = {},
): HttpTransport {
  const base = baseUrl.replace(/\/+$/, "");
  const defaultTimeout = options.timeoutMs ?? 10_000;
  const retry = options.unavailableRetry === false ? { retries: 0 } : (options.unavailableRetry ?? {});
  const retries = Math.max(0, retry.retries ?? 2);
  const retryDelayMs = retry.delayMs ?? 1_000;
  const retryMaxDelayMs = retry.maxDelayMs ?? 3_000;
  const sleep = options.sleep ?? defaultSleep;
  const instance =
    options.axios ??
    axios.create({
      headers: { ...options.headers },
      validateStatus: () => true,
    });

  /** 单次请求的 headers；都不需要时返回 undefined（读请求不带自定义头，不触发 CORS 预检）。 */
  function requestHeaders(config: RequestConfig): Record<string, string> | undefined {
    const headers: Record<string, string> = { ...config.headers };
    // 只有带正文时才声明 JSON：workflow 路由会解码任何 JSON 类型的请求体，
    // 空体 + application/json 会被判为格式错误。
    if (config.body !== undefined && !Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "application/json";
    }
    return Object.keys(headers).length ? headers : undefined;
  }

  async function once<T>(config: RequestConfig): Promise<T> {
    const headers = requestHeaders(config);
    let response;
    try {
      response = await instance.request({
        method: config.method,
        url: `${base}${config.path}`,
        params: cleanParams(config.params),
        paramsSerializer: { indexes: null },
        data: config.body,
        headers,
        timeout: config.timeoutMs ?? defaultTimeout,
        validateStatus: () => true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new ApiError(0, message);
    }
    const data: unknown = response.data;
    const retryAfterMs = parseRetryAfter(headerValue(response.headers, "retry-after"));
    if (response.status >= 200 && response.status < 300) {
      if (config.raw || !isBackendEnvelope(data)) return data as T;
      if (data.code !== 0) throw new BackendBusinessError(data, { status: response.status, retryAfterMs });
      return data.data as T;
    }
    const body = data && typeof data === "object" ? (data as ProtocolErrorBody) : undefined;
    throw new ApiError(response.status, errorMessage(data, response.status), body, retryAfterMs);
  }

  async function request<T>(config: RequestConfig): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await once<T>(config);
      } catch (error) {
        const retryable =
          config.method === "GET" &&
          attempt < retries &&
          error instanceof BackendBusinessError &&
          error.isUnavailable;
        if (!retryable) throw error;
        await sleep(Math.min(error.retryAfterMs ?? retryDelayMs, retryMaxDelayMs));
      }
    }
  }

  function url(path: string, params?: RequestConfig["params"]): string {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value === undefined || value === null || value === "") continue;
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

/** @deprecated 传输层已统一解包 V1 信封；保留给旧调用方，等同 `http.request`。 */
export function backendRequest<T>(http: HttpTransport, request: RequestConfig): Promise<T> {
  return http.request<T>(request);
}

/** @deprecated 等同 `http.request` 并丢弃 data。 */
export async function backendVoid(http: HttpTransport, request: RequestConfig): Promise<void> {
  await http.request<unknown>(request);
}

// ---------------------------------------------------------------------------
// system 域：健康、HostLink 组网、调度资源、安静点重启
// （unilabos/server/api/runtime/diagnostics.py）
// ---------------------------------------------------------------------------

/** 健康探针里当前 backend 跑不了而没有启动的设备（dev 扩展，只在非空时出现）。 */
export interface UnavailableDevice {
  device_id: string;
  registry_name: string;
  backend: string;
  reason: string;
  supported_backends: string[];
}

/** GET /api/v1/health：存活探针，恒 HTTP 200 的裸 JSON（不包信封）。 */
export interface HealthResponse {
  status: string;
  /** V1：本进程是否承载调度器（`ready`）或纯执行面（`disabled`）。 */
  scheduler: "ready" | "disabled" | (string & {});
  /** dev 扩展：`local` = 本进程持有调度权威；`remote` = 已接入远端调度权威。 */
  scheduler_mode: "local" | "remote" | (string & {});
  /**
   * `ready` = 该地址提供设备执行面（本进程带 Host，或调度权威的 Host 子进程在线）；
   * `restarting` = 调度权威在线但 Host 子进程正在重启；`disabled` = 纯调度权威（--role backend）。
   */
  execution: "ready" | "restarting" | "disabled" | (string & {});
  unavailable_devices?: UnavailableDevice[];
}

/** V1 RuntimeCapabilities（readiness.capabilities）。 */
export interface RuntimeCapabilities {
  can_edit_definitions: boolean;
  can_view_drafts: boolean;
  can_run_unpublished: boolean;
  can_debug: boolean;
  can_execute_device_actions: boolean;
}

/**
 * GET /api/v1/readiness：就绪探针（不包信封）。能接收并执行任务时 HTTP 200，否则 503；两种情况
 * 正文形状相同。V1 字段 `status` / `capabilities` / `phase` / `workflowRuntime`，dev 探针摘要
 * `scheduler` / `execution` / `reasons` 作为扩展字段保留。`/health` 只说明进程存活。
 */
export interface ReadinessResponse {
  status: "ready" | "starting" | "failed" | (string & {});
  capabilities?: RuntimeCapabilities;
  /** `ready` / `execution_starting` / `host_restarting` / `dispatch_paused`。 */
  phase?: string;
  /** 本进程是否承载工作流运行时：调度权威 `ready`，仅执行面的 Host `disabled`。 */
  workflowRuntime?: "ready" | "disabled" | (string & {});
  workflowProgress?: { loaded: number; total: number } | null;
  observability?: { traceUiUrl?: string } | null;
  error?: { code: string; message: string } | null;
  scheduler: "local" | "remote" | (string & {});
  /** `starting` = 执行适配器尚未注册（设备初始化中）；`restarting` = Host 未接入控制面；`disabled` = 纯调度权威。 */
  execution: "ready" | "starting" | "restarting" | "disabled" | (string & {});
  /** 未就绪的原因（人话）；ready 时为空数组。 */
  reasons: string[];
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
    /** GET /api/v1/health —— 裸 JSON，不包信封 */
    health: (options: HealthRequestOptions = {}) =>
      http.request<HealthResponse>({
        method: "GET",
        path: "/api/v1/health",
        timeoutMs: options.timeoutMs ?? 4_000,
        raw: true,
      }),
    /**
     * GET /api/v1/readiness —— 裸 JSON；503 是「尚未就绪」的正常回答，返回同形状正文而不是抛错；
     * 其他非 2xx（含不认识的 503 正文，如全量重置维护闸门的信封）仍抛 ApiError。
     */
    readiness: async (options: HealthRequestOptions = {}): Promise<ReadinessResponse> => {
      try {
        return await http.request<ReadinessResponse>({
          method: "GET",
          path: "/api/v1/readiness",
          timeoutMs: options.timeoutMs ?? 4_000,
          raw: true,
        });
      } catch (error) {
        const body = error instanceof ApiError ? (error.body as Partial<ReadinessResponse> | undefined) : undefined;
        if (error instanceof ApiError && error.status === 503 && typeof body?.status === "string") {
          return {
            ...(body as ReadinessResponse),
            status: body.status,
            scheduler: String(body.scheduler ?? ""),
            execution: String(body.execution ?? ""),
            reasons: Array.isArray(body.reasons) ? body.reasons.map(String) : [],
          };
        }
        throw error;
      }
    },
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
     * 5001 / 503 表示调度权威在远端，不是服务故障。
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
