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
  it("自动运行中可以暂停（V1 只停派发）或转逐步；逐步、已暂停、已结束或单点动作不能暂停", () => {
    const auto = stepExecutionControl(task({ run_mode: "normal", control_status: "active", status: "running" }), [run("running"), run("pending")]);
    expect(auto.canPause).toBe(true);
    expect(auto.canSwitchToStep).toBe(true);
    // V1：逐步模式不接受 pause（task_is_not_in_normal_mode）
    expect(stepExecutionControl(task({ status: "running", control_status: "active" }), [run("running")]).canPause).toBe(false);
    expect(stepExecutionControl(task(), [run("pending")]).canPause).toBe(false);
    expect(stepExecutionControl(task({ run_mode: "normal", control_status: "active", status: "succeeded" }), [run("succeeded")]).canPause).toBe(false);
    expect(stepExecutionControl(task({ run_mode: "normal", control_status: "active", status: "running" }), [run("succeeded")]).canPause).toBe(false);
    expect(stepExecutionControl(task({ run_mode: "normal", control_status: "active", execution_kind: "ad_hoc_device_action" }), []).canPause).toBe(false);
    expect(stepExecutionControl(task({ run_mode: "normal", control_status: "waiting_reconciliation", status: "running" }), [run("execution_unknown")]).canPause).toBe(true);
  });
  it("自动模式暂停派发后：显示面板，可以继续自动或执行下一步，不能再暂停", () => {
    const paused = stepExecutionControl(
      task({ run_mode: "normal", control_status: "paused", dispatch_gate: "paused", status: "running" }),
      [run("succeeded"), run("pending")],
    );
    expect(paused.visible).toBe(true);
    expect(paused.normalPaused).toBe(true);
    expect(paused.canResume).toBe(true);
    expect(paused.canStep).toBe(true);
    expect(paused.canPause).toBe(false);
    expect(paused.canSwitchToStep).toBe(false);
    expect(paused.hint).toContain("已暂停派发");
  });
  it("运行中（含暂停）可以取消；取消中与终态不能再取消", () => {
    expect(stepExecutionControl(task({ run_mode: "normal", control_status: "active", status: "running" }), [run("running")]).canCancel).toBe(true);
    expect(stepExecutionControl(task(), [run("pending")]).canCancel).toBe(true);
    expect(stepExecutionControl(task({ execution_kind: "ad_hoc_device_action", run_mode: "normal" }), []).canCancel).toBe(true);
    const canceling = stepExecutionControl(task({ status: "canceling" }), [run("cancel_requested")]);
    expect(canceling.canCancel).toBe(false);
    expect(canceling.canceling).toBe(true);
    expect(canceling.cancelHint).not.toBe("");
    expect(stepExecutionControl(task({ status: "canceled" }), []).canCancel).toBe(false);
    expect(stepExecutionControl(task({ control_revision: undefined }), []).canCancel).toBe(false);
  });
  it("控制状态缺失与终态明确禁用，自动模式不显示步进面板", () => {
    expect(stepExecutionControl(task({ control_revision: undefined }), []).canStep).toBe(false);
    expect(stepExecutionControl(task({ control_revision: -1 }), []).canStep).toBe(false);
    expect(stepExecutionControl(task({ status: "succeeded" }), []).canResume).toBe(false);
    expect(stepExecutionControl(task({ run_mode: "normal", control_status: "active" }), []).visible).toBe(false);
  });
});
