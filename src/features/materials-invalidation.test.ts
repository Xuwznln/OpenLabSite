import { describe, expect, it, vi } from "vitest";
import {
  bindMaterialsInvalidations,
  createLedgerEpochTracker,
  MATERIALS_INVALIDATION_EVENT_TYPES,
} from "./materials-invalidation";

function emit(source: EventTarget, type: string, lastEventId = "") {
  source.dispatchEvent(new MessageEvent(type, { data: "{}", lastEventId }));
}

describe("物料流账本纪元", () => {
  it("第一次记录不算变化，同一纪元不变化，换了纪元只报一次", () => {
    const tracker = createLedgerEpochTracker();
    expect(tracker.observe("41:aaaa")).toBe(false);
    expect(tracker.observe("42:aaaa")).toBe(false);
    expect(tracker.observe("3:bbbb")).toBe(true);
    expect(tracker.observe("4:bbbb")).toBe(false);
  });

  it("没有纪元的 id（空账本、旧后端纯数字）不改变判断", () => {
    const tracker = createLedgerEpochTracker();
    expect(tracker.observe("7")).toBe(false);
    expect(tracker.observe(undefined)).toBe(false);
    expect(tracker.observe("8:aaaa")).toBe(false);
    expect(tracker.observe("9")).toBe(false);
    expect(tracker.observe("10:aaaa")).toBe(false);
  });

  it("重置帧采用新纪元，之后的通知不再重复触发；重置到空账本后第一条带纪元的通知也不触发", () => {
    const tracker = createLedgerEpochTracker();
    tracker.observe("41:aaaa");
    tracker.adopt("300:bbbb");
    expect(tracker.observe("301:bbbb")).toBe(false);
    tracker.adopt("0");
    expect(tracker.observe("1:cccc")).toBe(false);
  });

  it("换后端地址后从头记录", () => {
    const tracker = createLedgerEpochTracker();
    tracker.observe("41:aaaa");
    tracker.clear();
    expect(tracker.observe("1:bbbb")).toBe(false);
  });
});

describe("物料流失效通知", () => {
  it("订阅 materials.changed 与 stream.reset", () => {
    expect([...MATERIALS_INVALIDATION_EVENT_TYPES]).toEqual(["materials.changed", "stream.reset"]);
  });

  it("变更只让物料页面重读；纪元变了再整体重读一次", () => {
    const source = new EventTarget();
    const invalidate = vi.fn();
    const resync = vi.fn();
    bindMaterialsInvalidations(source, invalidate, createLedgerEpochTracker(), resync);
    emit(source, "materials.changed", "41:aaaa");
    emit(source, "materials.changed", "42:aaaa");
    expect(invalidate).toHaveBeenCalledTimes(2);
    expect(resync).not.toHaveBeenCalled();
    // 新建的连接没带旧游标，服务端不发重置：第一条新库的通知暴露了纪元变化
    emit(source, "materials.changed", "3:bbbb");
    emit(source, "materials.changed", "4:bbbb");
    expect(invalidate).toHaveBeenCalledTimes(4);
    expect(resync).toHaveBeenCalledTimes(1);
  });

  it("stream.reset 整体重读一次，之后同一新库的通知不再重复触发；解绑后不再响应", () => {
    const source = new EventTarget();
    const invalidate = vi.fn();
    const resync = vi.fn();
    const unbind = bindMaterialsInvalidations(source, invalidate, createLedgerEpochTracker(), resync);
    emit(source, "materials.changed", "41:aaaa");
    emit(source, "stream.reset", "300:bbbb");
    emit(source, "materials.changed", "301:bbbb");
    expect(resync).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
    unbind();
    emit(source, "stream.reset", "0");
    emit(source, "materials.changed", "1:cccc");
    expect(resync).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledTimes(2);
  });
});
