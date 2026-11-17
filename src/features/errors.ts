/**
 * 统一的错误文案：把传输层 / V1 信封错误翻译成操作员能读懂的一句话。
 *
 * - 网络不可达：传输层只给网络错误，这里明确指向后端进程；
 * - 404 / 503 / 业务码 5001：多数是进程角色不同（Host vs --role backend）或 Host 正在启动 / 重启，
 *   不是程序缺陷；
 * - 其他业务码（1000 / 1001 / 3002 / 3003 / 4001 / 6xxx …）：后端 message 已经是人话，加上类别透出。
 */
import { ApiError, BACKEND_BUSINESS_CODES, BackendBusinessError, isCapabilityUnavailable } from "@openlab/protocol";

const BUSINESS_CODE_LABELS: Record<number, string> = {
  [BACKEND_BUSINESS_CODES.invalidInput]: "参数无效",
  [BACKEND_BUSINESS_CODES.operationNotAllowed]: "操作不允许",
  [BACKEND_BUSINESS_CODES.notFound]: "对象不存在",
  [BACKEND_BUSINESS_CODES.resourceNotFound]: "资源不存在",
  [BACKEND_BUSINESS_CODES.conflict]: "状态冲突",
  [BACKEND_BUSINESS_CODES.resourceDataConflict]: "数据冲突",
  [BACKEND_BUSINESS_CODES.databaseConflict]: "数据库冲突",
  [BACKEND_BUSINESS_CODES.serviceUnavailable]: "暂不可用",
};

export function describeError(error: unknown): string {
  if (error instanceof BackendBusinessError) {
    const label =
      BUSINESS_CODE_LABELS[error.code] ??
      (error.code >= 6000 && error.code < 7000 ? "物料约束" : error.isConflict ? "冲突" : error.isNotFound ? "不存在" : "");
    return label && !error.message.includes(label) ? `${label}：${error.message}` : error.message;
  }
  if (error instanceof ApiError) {
    if (error.isNetwork) return "无法连接后端：进程未启动、地址不对或网络不可达";
    if (error.status === 404) return "当前进程不提供该接口（Host 与 --role backend 角色不同）";
    if (error.status === 503) return "该能力在当前进程暂不可用（执行面或调度权威未就绪）";
    if (error.status === 409) return `操作与当前状态冲突：${error.message}`;
    return `HTTP ${error.status}：${error.message}`;
  }
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/** 网络层不可达（与 404/503/5001 的「角色不支持」区分开）。 */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetwork;
}

/** 当前进程不提供该能力：404 / 503，或信封 5001（Host 不在线、--role backend）。 */
export function isUnsupportedError(error: unknown): boolean {
  return isCapabilityUnavailable(error);
}
