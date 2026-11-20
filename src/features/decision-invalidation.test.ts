import { describe, expect, it, vi } from "vitest";
import {
  bindDecisionInvalidations,
  DECISION_INVALIDATION_EVENT_TYPES,
  ERROR_DECISION_SAFETY_POLL_MS,
  errorDecisionPollDue,
} from "./decision-invalidation";
import type { WorkflowInvalidationSource } from "./workflow-invalidation";

class NoticeMock implements WorkflowInvalidationSource {
  private readonly listeners = new Map<string, Set<EventListener>>();
  addEventListener(type: string, listener: EventListener) {
    this.listeners.set(type, new Set([...(this.listeners.get(type) ?? []), listener]));
  }
  removeEventListener(type: string, listener: EventListener) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener({ type } as Event);
  }
}

describe("异常决策经 SSE 失效", () => {
  it("订阅 station.error_handling.changed；工作流运行态事件不触发决策重读；解绑后不再触发", () => {
    expect(DECISION_INVALIDATION_EVENT_TYPES).toEqual(["station.error_handling.changed"]);
    const source = new NoticeMock();
    const invalidate = vi.fn();
    const unbind = bindDecisionInvalidations(source, invalidate);
    source.emit("station.error_handling.changed");
    source.emit("workflow.runtime.changed");
    expect(invalidate).toHaveBeenCalledTimes(1);
    unbind();
    source.emit("station.error_handling.changed");
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it("轮询只做兜底：流不在线时每拍都读，在线时只在超过兜底间隔后读", () => {
    const now = 1_000_000;
    expect(errorDecisionPollDue(false, now - 1_000, now)).toBe(true);
    expect(errorDecisionPollDue(true, now - 5_000, now)).toBe(false);
    expect(errorDecisionPollDue(true, now - ERROR_DECISION_SAFETY_POLL_MS, now)).toBe(true);
  });
});
