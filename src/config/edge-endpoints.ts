export const DEFAULT_LOCAL_EDGE_URL = "http://127.0.0.1:8002";

const LEGACY_DEMO_ENDPOINTS = new Set([
  "https://edge.whalent.com",
  "http://140.143.251.219:28005",
  "http://140.143.251.219:38005",
  "http://bj.wznln.com:28005",
  "http://bj.wznln.com:38005",
]);

/** 只迁移一次旧公共演示地址；之后用户主动选择的远程地址仍然保留。 */
export function initialBackendUrl(stored: string | null, fallback: string, migrated: boolean): string {
  const normalized = (stored ?? "").trim().replace(/\/+$/, "");
  if (!migrated && LEGACY_DEMO_ENDPOINTS.has(normalized)) return fallback;
  return normalized || fallback;
}
