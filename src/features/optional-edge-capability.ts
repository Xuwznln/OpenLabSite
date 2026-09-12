import { ApiError } from "@openlab/protocol";

export type OptionalCapabilitySupport = "unknown" | "available" | "unsupported";

/**
 * 可选兼容域只在明确的“路由不存在”响应后停止轮询。
 * 网络错误与 5xx 仍允许下次健康周期重试，避免把短暂故障固化为永久降级。
 */
export function isUnsupportedCapability(error: unknown): boolean {
  return error instanceof ApiError && [404, 405, 501].includes(error.status);
}
