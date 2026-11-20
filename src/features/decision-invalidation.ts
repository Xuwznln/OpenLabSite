/**
 * 人工决策面板的失效通知：`station.error_handling.changed`（`/api/v1/events`，`data.station_id`）。
 *
 * 调度器把失败作业标成「等待决策」时，在同一事务里开出工作流干预与工站错误并发这个事件；作业恢复或
 * 结束时工站错误收口，再发一次。所以动作异常（`/error-decisions`）与干预列表在事件到达时重读即可，
 * 不必等下一轮轮询。listener 不读事件 data，正文一律重新经 HTTP 读取。
 *
 * 轮询退为兜底（ARCHITECTURE「通知 + 慢轮询」）：通知流不在线时按原 5 s 节奏读，在线时只做低频校准。
 */
import { STATION_ERROR_HANDLING_CHANGED_EVENT } from "@openlab/protocol";
import type { WorkflowInvalidationSource } from "./workflow-invalidation";

export const DECISION_INVALIDATION_EVENT_TYPES = [STATION_ERROR_HANDLING_CHANGED_EVENT] as const;

/** 通知流在线时动作异常的兜底重读间隔。 */
export const ERROR_DECISION_SAFETY_POLL_MS = 30_000;

export function bindDecisionInvalidations(
  source: WorkflowInvalidationSource,
  invalidate: () => void,
): () => void {
  const listener: EventListener = () => invalidate();
  for (const eventType of DECISION_INVALIDATION_EVENT_TYPES) source.addEventListener(eventType, listener);
  return () => {
    for (const eventType of DECISION_INVALIDATION_EVENT_TYPES) source.removeEventListener(eventType, listener);
  };
}

/**
 * 轮询节拍上是否重读动作异常：通知流不在线（断开 / 重连中 / 浏览器不支持）时每拍都读；在线时
 * 由通知驱动，只在距上次读取超过兜底间隔时读一次。
 */
export function errorDecisionPollDue(
  streamLive: boolean,
  lastReadAt: number,
  now: number,
  safetyMs = ERROR_DECISION_SAFETY_POLL_MS,
): boolean {
  return !streamLive || now - lastReadAt >= safetyMs;
}
