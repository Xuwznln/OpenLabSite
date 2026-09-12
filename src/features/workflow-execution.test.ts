import { describe, expect, it } from "vitest";
import type { BackendWorkflowNodeRun, BackendWorkflowTask } from "@openlab/protocol";
import { stepExecutionControl } from "./workflow-execution";

const task = (overrides: Partial<BackendWorkflowTask> = {}) => ({
  uuid: "task", run_mode: "step", control_status: "paused", control_revision: 0, status: "pending",
  ...overrides,
}) as BackendWorkflowTask;
const run = (status: BackendWorkflowNodeRun["status"]) => ({ status }) as BackendWorkflowNodeRun;

describe("逐步执行控制", () => {
  it("提交后等待，一个动作完成后再次可单点放行", () => {
    expect(stepExecutionControl(task(), []).canStep).toBe(true);
    expect(stepExecutionControl(task({ status: "running" }), [run("succeeded"), run("pending")]).canStep).toBe(true);
  });
  it("在飞期间不能连点，但允许转自动", () => {
    const controls = stepExecutionControl(task({ status: "running", control_status: "active" }), [run("running")]);
    expect(controls.canStep).toBe(false);
    expect(controls.canResume).toBe(true);
  });
  it.each(["execution_unknown", "intervention_required", "failed", "cancel_requested"] as const)("%s 不能越过异常继续", (status) => {
    const controls = stepExecutionControl(task(), [run(status)]);
    expect(controls.canStep).toBe(false);
    expect(controls.canResume).toBe(false);
  });
  it("控制状态缺失与终态明确禁用，自动模式不显示步进面板", () => {
    expect(stepExecutionControl(task({ control_revision: undefined }), []).canStep).toBe(false);
    expect(stepExecutionControl(task({ control_revision: -1 }), []).canStep).toBe(false);
    expect(stepExecutionControl(task({ status: "succeeded" }), []).canResume).toBe(false);
    expect(stepExecutionControl(task({ run_mode: "normal" }), []).visible).toBe(false);
  });
});
