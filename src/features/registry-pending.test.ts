import { describe, expect, it } from "vitest";
import { acceptanceSummary, pendingBatchMessage, pendingChangeLabel, pendingReasonLabel } from "./registry-pending";

describe("注册表挂起变更文案", () => {
  it("变化种类与原因；旧后端缺字段时不显示", () => {
    expect(pendingChangeLabel("add")).toBe("新增");
    expect(pendingChangeLabel("remove")).toBe("待移除");
    expect(pendingChangeLabel("")).toBe("");
    expect(pendingChangeLabel(undefined)).toBe("");
    expect(pendingReasonLabel("cross-machine-slave")).toContain("跨机器");
    expect(pendingReasonLabel("")).toBe("等待确认");
  });

  it("单机部署自动接受；跨机器时说明原因并列出 Slave", () => {
    expect(acceptanceSummary({ single_machine: true, reason: "", reporter_machine_id: "m", remote_slaves: [] })).toMatchObject({
      tone: "ok",
      title: "单机部署：变更自动接受",
    });
    const remote = acceptanceSummary({ single_machine: false, reason: "cross-machine-slave", reporter_machine_id: "m", remote_slaves: ["bench-2"] });
    expect(remote.tone).toBe("warn");
    expect(remote.detail).toContain("bench-2");
    expect(remote.pendingHint).toContain("不会自动生效");
  });

  it("批量结果：失败的逐条列出（最多 3 条）", () => {
    expect(pendingBatchMessage("apply", { entries: [{} as never, {} as never], failed: [] })).toBe("已接受 2 个变更");
    const failed = Array.from({ length: 4 }, (_, i) => ({ name: `e${i}`, error: "no pending version" }));
    const text = pendingBatchMessage("dismiss", { entries: [], failed });
    expect(text).toContain("已忽略 0 个变更，4 个失败");
    expect(text).toContain("e2：no pending version");
    expect(text).not.toContain("e3");
  });
});
