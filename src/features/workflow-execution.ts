import type { BackendWorkflowNodeRun, BackendWorkflowTask } from "@openlab/protocol";

export type WorkflowExecutionMode = "normal" | "step";
export const WORKFLOW_RUN_OPTIONS = [
  { label: "自动执行", value: "normal" },
  { label: "逐步执行（每次一个动作）", value: "step" },
];

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "skipped", "failed", "timeout", "canceled"]);

/** UI 只解释权威状态；许可与依赖选择均由后端负责。 */
export function stepExecutionControl(task: BackendWorkflowTask | null, runs: BackendWorkflowNodeRun[]) {
  const visible = task?.run_mode === "step";
  const controlReady = Number.isSafeInteger(task?.control_revision) && (task?.control_revision ?? -1) >= 0;
  const active = task?.status === "pending" || task?.status === "running";
  const blocked = runs.some((run) => [
    "intervention_required", "execution_unknown", "cancel_requested", "failed", "timeout", "canceled",
  ].includes(run.status));
  const controllable = visible && controlReady && active && !blocked
    && (task?.control_status === "paused" || task?.control_status === "active");
  // 暂停 = 转逐步并停止派发新动作；与后端一致：自动运行中、或逐步执行中那一步还没跑完时可用，
  // 等待执行状态核对时也可用（裁决后停在暂停）。
  const unfinished = runs.length === 0 || runs.some((item) => !TERMINAL_RUN_STATUSES.has(item.status));
  const canPause = controlReady && active && unfinished
    && (task?.execution_kind ?? "workflow") === "workflow"
    && !(task?.run_mode === "step" && task?.control_status === "paused")
    && (task?.control_status === "active" || task?.control_status === "waiting_reconciliation");
  return {
    visible, controlReady,
    canStep: controllable && task?.control_status === "paused",
    canResume: controllable,
    canPause,
    hint: !controlReady ? "任务控制状态不完整，无法安全放行；请重新读取并检查接口响应。"
      : !active ? "本次运行已结束。"
      : blocked || !controllable ? "请先处理当前异常或执行状态核对，再继续运行。"
      : task?.control_status === "paused" ? "等待下一步：每次只执行一个可执行动作，完成后再次等待。"
      : "当前单步正在执行或等待资源，完成后可执行下一步。",
  };
}
