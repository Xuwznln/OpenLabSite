/**
 * 统一的错误文案：把传输层 / 业务信封错误翻译成操作员能读懂的一句话。
 *
 * - 网络不可达：传输层只给网络错误，这里明确指向微后端进程；
 * - 404 / 503：多数是进程角色不同（Host vs --role backend），不是程序缺陷；
 * - 业务码错误（1000 / 3002 / 3003 / 5001）：后端 message 已经是人话，直接透出。
 */
import { ApiError, BACKEND_BUSINESS_CODES, BackendBusinessError } from "@openlab/protocol";

const BUSINESS_CODE_LABELS: Record<number, string> = {
  [BACKEND_BUSINESS_CODES.invalidInput]: "参数无效",
  [BACKEND_BUSINESS_CODES.notFound]: "对象不存在",
  [BACKEND_BUSINESS_CODES.conflict]: "状态冲突",
  [BACKEND_BUSINESS_CODES.catalogUnavailable]: "注册表目录不可用",
};

export function describeError(error: unknown): string {
  if (error instanceof BackendBusinessError) {
    const label = BUSINESS_CODE_LABELS[error.code];
    return label && !error.message.includes(label) ? `${label}：${error.message}` : error.message;
  }
  if (error instanceof ApiError) {
    if (error.isNetwork) return "无法连接微后端：进程未启动、地址不对或网络不可达";
    if (error.status === 404) return "当前进程不提供该接口（Host 与 --role backend 角色不同）";
    if (error.status === 503) return "该能力在当前进程暂不可用（执行面或调度权威未就绪）";
    if (error.status === 409) return `操作与当前状态冲突：${error.message}`;
    return `HTTP ${error.status}：${error.message}`;
  }
  if (error instanceof Error) return error.message || error.name;
  return String(error);
}

/** 网络层不可达（与 404/503 的「角色不支持」区分开）。 */
export function isOfflineError(error: unknown): boolean {
  return error instanceof ApiError && error.isNetwork;
}
