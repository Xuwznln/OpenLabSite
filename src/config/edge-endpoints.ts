export const PUBLIC_DEMO_EDGE_URL = "https://edge.whalent.com";
export const LOCAL_DEMO_EDGE_URL = "http://127.0.0.1:6005";

const LEGACY_DEMO_ENDPOINTS = new Map<string, string>([
  ["http://140.143.251.219:28005", PUBLIC_DEMO_EDGE_URL],
  ["http://140.143.251.219:38005", PUBLIC_DEMO_EDGE_URL],
  ["http://bj.wznln.com:28005", PUBLIC_DEMO_EDGE_URL],
  ["http://bj.wznln.com:38005", PUBLIC_DEMO_EDGE_URL],
  ["http://127.0.0.1:28005", LOCAL_DEMO_EDGE_URL],
  ["http://localhost:28005", LOCAL_DEMO_EDGE_URL],
]);

export function migrateDemoEdgeUrl(value: string): string {
  const normalized = value.trim().replace(/\/+$/, "");
  return LEGACY_DEMO_ENDPOINTS.get(normalized) ?? normalized;
}
