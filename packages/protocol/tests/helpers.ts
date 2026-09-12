/**
 * 协议测试共享 harness：
 * - mock axios 实例记录每次请求（method/url/params/data），返回可编程响应；
 * - 归一化路径（把具体 id 段替换回 `{}`）后与 catalog 契约逐条比对，
 *   保证「客户端方法 ↔ 后端路由」一一对应（与后端保持一致的机器校验）。
 */
import type { AxiosInstance } from "axios";
import { OPERATIONS } from "../src/catalog";
import { createHttpTransport, type HttpTransport } from "../src/common";

export const DUMMY_ID = "__id__";

export interface RecordedCall {
  method: string;
  url: string;
  params?: Record<string, unknown>;
  paramsSerializer?: unknown;
  data?: unknown;
  timeout?: number;
}

export interface MockHttp {
  http: HttpTransport;
  calls: RecordedCall[];
  /** 下一次响应（默认 200 空对象）；设置后一次性生效。 */
  nextResponse: { status: number; data: unknown } | null;
  /** 下一次直接抛网络错误。 */
  nextNetworkError: Error | null;
}

export function createMockHttp(base = "http://edge.local"): MockHttp {
  const state: MockHttp = {
    http: undefined as unknown as HttpTransport,
    calls: [],
    nextResponse: null,
    nextNetworkError: null,
  };
  const instance = {
    request: async (config: {
      method?: string;
      url?: string;
      params?: Record<string, unknown>;
      paramsSerializer?: unknown;
      data?: unknown;
      timeout?: number;
    }) => {
      if (state.nextNetworkError) {
        const err = state.nextNetworkError;
        state.nextNetworkError = null;
        throw err;
      }
      state.calls.push({
        method: String(config.method ?? "GET").toUpperCase(),
        url: String(config.url ?? ""),
        params: config.params,
        paramsSerializer: config.paramsSerializer,
        data: config.data,
        timeout: config.timeout,
      });
      const response = state.nextResponse ?? { status: 200, data: {} };
      state.nextResponse = null;
      return { status: response.status, data: response.data };
    },
  } as unknown as AxiosInstance;
  state.http = createHttpTransport(base, { axios: instance });
  return state;
}

/** 把记录到的 URL 转成 catalog 形状：去 base、恢复 `{}` 占位。 */
export function normalizeRecordedPath(url: string, base = "http://edge.local"): string {
  const path = url.startsWith(base) ? url.slice(base.length) : url;
  return path
    .split("/")
    .map((seg) => (decodeURIComponent(seg) === DUMMY_ID ? "{}" : seg))
    .join("/");
}

/** catalog 中某域的 HTTP 操作（SSE 除外），路径占位归一为 `{}`。 */
export function catalogOps(domain: string): Set<string> {
  return new Set(
    OPERATIONS.filter((op) => op.domain === domain && op.method !== "SSE").map(
      (op) => `${op.method} ${op.path.replace(/\{[^}]+\}/g, "{}")}`,
    ),
  );
}

/**
 * 断言辅助：把「调用集」与 catalog 契约做双向比对。
 * invocations 的 key 仅作可读标签；每个 thunk 恰好发起一次 HTTP 请求。
 */
export async function collectCalls(
  mock: MockHttp,
  invocations: Record<string, () => Promise<unknown>>,
): Promise<Set<string>> {
  for (const run of Object.values(invocations)) {
    await run();
  }
  return new Set(
    mock.calls.map((c) => `${c.method} ${normalizeRecordedPath(c.url)}`),
  );
}
