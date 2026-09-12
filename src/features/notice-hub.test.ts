import { describe, it, expect, vi } from "vitest";
import { NoticeHub } from "./notice-hub";

function fixture() {
  const sources: (EventTarget & { close: ReturnType<typeof vi.fn>; readyState: number })[] = [];
  const create = vi.fn(() => {
    const source = Object.assign(new EventTarget(), { close: vi.fn(), readyState: 1 });
    sources.push(source);
    return source as unknown as EventSource;
  });
  return { hub: new NoticeHub(create), sources, create };
}

describe("跨标签页通知连接", () => {
  it("转发日志来源索引给两页，复用工作流流且重连通知不带日志正文", () => {
    const { hub, sources, create } = fixture();
    const a = vi.fn(), b = vi.fn();
    const closeA = hub.subscribe("http://backend/events", {}, ["workflow.task.changed", "runtime.logs.changed"], a);
    const closeB = hub.subscribe("http://backend/events", {}, ["runtime.logs.changed"], b);
    const data = JSON.stringify({ source_ids: ["host"], sources_changed: false, all_sources: false });
    sources[0].dispatchEvent(new MessageEvent("runtime.logs.changed", { data }));
    expect(a).toHaveBeenCalledWith("runtime.logs.changed", data);
    expect(b).toHaveBeenCalledWith("runtime.logs.changed", data);
    expect(create).toHaveBeenCalledTimes(1);
    sources[0].dispatchEvent(new Event("open"));
    expect(a).toHaveBeenLastCalledWith("open");
    closeA(); closeB();
  });

  it("同地址只建一次连接，广播给所有页面，最后一个离开才关闭", () => {
    const { hub, sources, create } = fixture();
    const a = vi.fn(), b = vi.fn();
    const closeA = hub.subscribe("http://backend/events", {}, ["changed"], a);
    const closeB = hub.subscribe("http://backend/events", {}, ["changed"], b);
    expect(create).toHaveBeenCalledTimes(1);
    sources[0].dispatchEvent(new Event("changed"));
    expect(a).toHaveBeenCalledWith("changed");
    expect(b).toHaveBeenCalledWith("changed");
    closeA();
    expect(sources[0].close).not.toHaveBeenCalled();
    b.mockClear();
    sources[0].dispatchEvent(new Event("error"));
    expect(b).toHaveBeenCalledWith("error");
    closeB();
    expect(sources[0].close).toHaveBeenCalledTimes(1);
  });

  it("不同后端隔离，已关闭的地址可重新订阅", () => {
    const { hub, sources, create } = fixture();
    const a = vi.fn(), b = vi.fn();
    const release = hub.subscribe("http://a/events", {}, ["changed"], a);
    hub.subscribe("http://b/events", {}, ["changed"], b);
    sources[0].dispatchEvent(new Event("changed"));
    expect(b).not.toHaveBeenCalledWith("changed");
    release();
    hub.subscribe("http://a/events", {}, ["changed"], a);
    expect(create).toHaveBeenCalledTimes(3);
  });
});
