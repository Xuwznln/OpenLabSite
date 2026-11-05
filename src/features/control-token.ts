/**
 * 控制令牌：微后端要求写请求（POST / PUT / PATCH / DELETE）带 `Authorization: Bearer <token>`，
 * 读请求与 SSE 不需要。令牌由后端保存在 `<working_dir>/control_token`，用户在运行 unilab
 * 的机器上执行 `unilab token` 查看。
 *
 * - 存放：localStorage，按后端地址分开（`openlab.controlToken:<归一化地址>`），令牌只发给它所属的后端；
 * - 链接导入：微后端落地页链接 `#/?backend=<地址>&token=<令牌>`，任意路由都认，导入后立刻从地址栏去掉；
 * - 被拒：HTTP 401 + code 4001，经 describeError 统一上报，连接设置据此提示填写。
 */
import type { LocationQuery, LocationQueryValue } from "vue-router";
import type { ApiError } from "@openlab/protocol";
import { normalizeBaseUrl } from "../config/edge-endpoints";

export const CONTROL_TOKEN_STORAGE_PREFIX = "openlab.controlToken:";

/** describeError 对「令牌缺失 / 不正确」给出的统一文案。 */
export const CONTROL_TOKEN_REJECTED_MESSAGE =
  "写操作被拒绝：控制令牌缺失或不正确。请在右上角「连接设置」填写控制令牌（在运行 unilab 的机器上执行 unilab token 查看）";

export type TokenStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export function controlTokenStorageKey(baseUrl: string): string {
  return `${CONTROL_TOKEN_STORAGE_PREFIX}${normalizeBaseUrl(baseUrl)}`;
}

/**
 * 令牌要放进 HTTP 头：只接受不含空白的可见 ASCII。含中文或空格的值会让浏览器在发请求前就抛错，
 * 页面看到的将是误导性的「无法连接后端」。
 */
export function isValidControlToken(token: string): boolean {
  return /^[\x21-\x7e]{1,1024}$/.test(token);
}

/** 当前后端已保存的令牌；没有、读不到存储或内容不合法时为空串。 */
export function readControlToken(storage: TokenStorage, baseUrl: string): string {
  try {
    const value = (storage.getItem(controlTokenStorageKey(baseUrl)) ?? "").trim();
    return isValidControlToken(value) ? value : "";
  } catch {
    return "";
  }
}

/** 保存令牌；空串即清除。存储不可用（隐私模式）时静默放弃。 */
export function writeControlToken(storage: TokenStorage, baseUrl: string, token: string): void {
  const key = controlTokenStorageKey(baseUrl);
  const value = token.trim();
  try {
    if (value) storage.setItem(key, value);
    else storage.removeItem(key);
  } catch {
    /* 存储不可用时本次会话不带令牌，写请求会收到 401 并提示 */
  }
}

/** 展示用：`••••` + 末 4 位；令牌过短时不露任何一位。 */
export function maskControlToken(token: string): string {
  return token.length > 8 ? `••••${token.slice(-4)}` : "••••";
}

/** 链接里的后端地址：只认 http/https，且不能带账号、query 或 hash（拼接 /api/v1 会出错）。 */
export function parseBackendParam(value: string): string | null {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return null;
  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password || url.search || url.hash) return null;
    return normalized;
  } catch {
    return null;
  }
}

export interface ConnectionLink {
  /** 校验后的后端地址；未给出或不合法为 null。 */
  backend: string | null;
  /** 校验后的令牌；未给出、不合法，或给了 backend 但 backend 不合法时为 null。 */
  token: string | null;
  /** 去掉 backend / token 之后的其余 query，用于替换当前地址。 */
  query: LocationQuery;
}

function firstValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string {
  const item = Array.isArray(value) ? value[0] : value;
  return typeof item === "string" ? item : "";
}

/**
 * 读路由 query 里的 `backend` / `token`。两者都没有时返回 null（不需要处理）；否则无论是否合法
 * 都要把这两个参数从地址里去掉。给了 backend 却不合法时连令牌一起丢弃，免得把它存到别的后端名下。
 */
export function readConnectionLink(query: LocationQuery): ConnectionLink | null {
  if (!("backend" in query) && !("token" in query)) return null;
  const { backend: rawBackend, token: rawToken, ...rest } = query;
  const backendGiven = firstValue(rawBackend).trim() !== "";
  const backend = backendGiven ? parseBackendParam(firstValue(rawBackend)) : null;
  const token = firstValue(rawToken).trim();
  const tokenUsable = isValidControlToken(token) && (!backendGiven || backend !== null);
  return { backend, token: tokenUsable ? token : null, query: rest };
}

// ── 写请求被拒的统一上报（describeError → 连接 store） ─────────────────

type RejectionListener = (error: ApiError) => void;
const rejectionListeners = new Set<RejectionListener>();
/** 同一个错误对象可能被多处 describeError（模板重渲染等），只上报一次。 */
const reportedErrors = new WeakSet<ApiError>();

export function reportControlTokenRejected(error: ApiError): void {
  if (reportedErrors.has(error)) return;
  reportedErrors.add(error);
  for (const listener of rejectionListeners) listener(error);
}

export function onControlTokenRejected(listener: RejectionListener): () => void {
  rejectionListeners.add(listener);
  return () => {
    rejectionListeners.delete(listener);
  };
}
