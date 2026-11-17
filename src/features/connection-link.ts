/**
 * 微后端落地页的连接链接：`#/<任意路由>?backend=<地址>`。任意路由都认，导入后立刻从地址栏去掉。
 *
 * 管理 API 不鉴权，链接只带后端地址。
 */
import type { LocationQuery, LocationQueryValue } from "vue-router";
import { normalizeBaseUrl } from "../config/edge-endpoints";

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
  /** 校验后的后端地址；不合法为 null。 */
  backend: string | null;
  /** 去掉 backend 之后的其余 query，用于替换当前地址。 */
  query: LocationQuery;
}

function firstValue(value: LocationQueryValue | LocationQueryValue[] | undefined): string {
  const item = Array.isArray(value) ? value[0] : value;
  return typeof item === "string" ? item : "";
}

/** 读路由 query 里的 `backend`。没有时返回 null（不需要处理）；否则无论是否合法都要从地址里去掉。 */
export function readConnectionLink(query: LocationQuery): ConnectionLink | null {
  if (!("backend" in query)) return null;
  const { backend: rawBackend, ...rest } = query;
  const text = firstValue(rawBackend).trim();
  return { backend: text ? parseBackendParam(text) : null, query: rest };
}
