import { describe, expect, it, vi } from "vitest";
import { createRefreshQueue } from "./refresh-queue";

describe("快照失效通知队列", () => {
  it("请求中的多次通知不丢失、不并发，调用者等到补拉结束", async () => {
    let finish!: () => void;
    const fetch = vi.fn().mockImplementationOnce(() => new Promise<void>((r) => { finish = r; }))
      .mockResolvedValue(undefined);
    const refresh = createRefreshQueue(fetch);
    const first = refresh();
    await Promise.resolve();
    const second = refresh();
    const third = refresh();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    finish();
    await Promise.all([first, second, third]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("同一轮同步调用合并，完成后可再次刷新", async () => {
    const fetch = vi.fn().mockResolvedValue(undefined);
    const refresh = createRefreshQueue(fetch);
    await Promise.all([refresh(), refresh(), refresh()]);
    expect(fetch).toHaveBeenCalledTimes(1);
    await refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("失败不锁死之后的刷新", async () => {
    const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(undefined);
    const refresh = createRefreshQueue(fetch);
    await expect(refresh()).rejects.toThrow("offline");
    await refresh();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
