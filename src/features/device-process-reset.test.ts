import { describe, expect, it, vi } from "vitest";
import { resetManagedProcesses } from "./device-process-reset";

const idle = async () => ({ active_jobs: [], pending: false, restarting: false });
describe("受管设备重置", () => {
  it("只删除指定进程且去重", async () => {
    const remove = vi.fn().mockResolvedValue(undefined);
    expect(await resetManagedProcesses({ remove }, ["a", "a", "b"], idle)).toEqual({ removed: ["a", "b"], failed: [] });
    expect(remove.mock.calls).toEqual([["a"], ["b"]]);
  });
  it("有活跃作业时不删除", async () => {
    const remove = vi.fn();
    await expect(resetManagedProcesses({ remove }, ["a"], async () => ({ ...await idle(), active_jobs: [1] }))).rejects.toThrow("活跃作业");
    expect(remove).not.toHaveBeenCalled();
  });
  it("记录部分失败，不宣称全部成功", async () => {
    const remove = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(undefined);
    const result = await resetManagedProcesses({ remove }, ["a", "b"], idle);
    expect(result.removed).toEqual(["b"]);
    expect(result.failed.map((item) => item.id)).toEqual(["a"]);
  });
});
