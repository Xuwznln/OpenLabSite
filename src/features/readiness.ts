/**
 * 就绪探针（GET /api/v1/readiness）在连接状态里的口径。
 *
 * `/health` 只说明进程活着；readiness 说明「现在能不能接收并执行任务」：Host 子进程启动 /
 * 安静点重启期间、执行适配器尚未注册时是 not_ready（HTTP 503，SDK 照常返回正文）。
 * 旧后端没有这个路由（404）时记为不支持，连接状态退回只看 health，不报错、不再反复探测。
 */
import type { ReadinessResponse } from "@openlab/protocol";

export type ReadinessSupport = "unknown" | "available" | "unsupported";

export type ReadinessTone = "ready" | "starting" | "restarting" | "not_ready" | "unknown";

export interface ReadinessView {
  tone: ReadinessTone;
  /** 连接状态胶囊上的短文案；ready / 不支持时为空（沿用角色文案）。 */
  badge: string;
  /** 弹层里的一行说明。 */
  detail: string;
  reasons: string[];
  /** 胶囊颜色用的状态键（theme.ts statusMeta）。 */
  pillStatus: "online" | "paused" | "offline";
}

const EXECUTION_TEXT: Record<string, string> = {
  ready: "执行面就绪",
  starting: "设备初始化中：执行适配器尚未注册",
  restarting: "Host 未接入控制面（启动或重启中）",
  disabled: "纯调度权威（执行由远端 Edge 接入）",
};

export function readinessView(
  readiness: ReadinessResponse | null,
  support: ReadinessSupport,
  online: boolean,
): ReadinessView {
  if (!online) return { tone: "unknown", badge: "", detail: "未连接", reasons: [], pillStatus: "offline" };
  if (support === "unsupported") {
    return { tone: "unknown", badge: "", detail: "当前后端不提供就绪探针（旧版本），按 health 判断连接", reasons: [], pillStatus: "online" };
  }
  if (!readiness) return { tone: "unknown", badge: "", detail: "就绪状态读取中…", reasons: [], pillStatus: "online" };
  const reasons = readiness.reasons ?? [];
  const execution = EXECUTION_TEXT[readiness.execution] ?? `execution ${readiness.execution}`;
  if (readiness.status === "ready") {
    return { tone: "ready", badge: "", detail: `已就绪：可以接收并执行任务（${execution}）`, reasons, pillStatus: "online" };
  }
  if (readiness.execution === "starting") {
    return { tone: "starting", badge: "启动中", detail: `未就绪：${execution}`, reasons, pillStatus: "paused" };
  }
  if (readiness.execution === "restarting") {
    return { tone: "restarting", badge: "重启中", detail: `未就绪：${execution}`, reasons, pillStatus: "paused" };
  }
  return { tone: "not_ready", badge: "未就绪", detail: `未就绪：${execution}`, reasons, pillStatus: "paused" };
}
