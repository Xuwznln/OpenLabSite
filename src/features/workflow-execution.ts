import type { BackendWorkflowNodeRun, BackendWorkflowTask } from "@openlab/protocol";

export type WorkflowExecutionMode = "normal" | "step";
export const WORKFLOW_RUN_OPTIONS = [
  { label: "自动执行", value: "normal" },
  { label: "逐步执行（每次一个动作）", value: "step" },
];

const TERMINAL_RUN_STATUSES = new Set(["succeeded", "skipped", "failed", "timeout", "canceled"]);

/**
 * UI 只解释权威状态；许可与依赖选择均由后端负责（V1 任务控制命令）。
 *
 * - 自动模式：`pause` 暂停派发（`dispatch_gate=paused`，control_status 也变 paused，已下发的动作照常跑完），
 *   暂停后可 `resume` 继续自动、或 `step` 先转逐步再只放行一个动作；`switch_to_step` 直接转逐步。
 * - 逐步模式：暂停中可 `step` 放行一个动作；`resume` 转为自动执行（单步在飞时也可以）。V1 的 pause 只在自动模式有效。
 */
export function stepExecutionControl(task: BackendWorkflowTask | null, runs: BackendWorkflowNodeRun[]) {
  const stepMode = task?.run_mode === "step";
  const paused = task?.control_status === "paused";
  const normalPaused = !stepMode && task?.run_mode !== undefined && (paused || task?.dispatch_gate === "paused");
  const visible = stepMode || normalPaused;
  const controlReady = Number.isSafeInteger(task?.control_revision) && (task?.control_revision ?? -1) >= 0;
  const active = task?.status === "pending" || task?.status === "running";
  const blocked = runs.some((run) => [
    "intervention_required", "execution_unknown", "cancel_requested", "failed", "timeout", "canceled",
  ].includes(run.status));
  const controllable = visible && controlReady && active && !blocked
    && (task?.control_status === "paused" || task?.control_status === "active");
  const workflowTask = (task?.execution_kind ?? "workflow") === "workflow";
  // 暂停 = 停止派发新动作（V1 只在自动模式）；等待执行状态核对时也可用（裁决后停在暂停）。
  const unfinished = runs.length === 0 || runs.some((item) => !TERMINAL_RUN_STATUSES.has(item.status));
  const canPause = controlReady && active && unfinished && workflowTask && !stepMode
    && task?.dispatch_gate !== "paused"
    && (task?.control_status === "active" || task?.control_status === "waiting_reconciliation");
  // 转逐步：自动运行中直接切到逐步（dev 原来的「暂停」语义）
  const canSwitchToStep = controlReady && active && unfinished && workflowTask && !stepMode
    && task?.control_status === "active" && task?.dispatch_gate !== "paused";
  // 取消对整图与单点动作都适用，暂停中也可以；取消中（canceling）不能再取消
  const canCancel = controlReady && active;
  const canceling = task?.status === "canceling";
  return {
    visible, controlReady,
    /** 自动模式暂停派发中（V1 pause 之后），面板文案与逐步模式区分。 */
    normalPaused,
    canStep: controllable && paused,
    canResume: stepMode ? controllable : controllable && paused,
    canPause,
    canSwitchToStep,
    canCancel,
    canceling,
    cancelHint: canceling
      ? "正在取消：不再派发新动作；正在执行的动作已收到取消请求，设备返回后任务结束。"
      : "",
    hint: !controlReady ? "任务控制状态不完整，无法安全放行；请重新读取并检查接口响应。"
      : !active ? "本次运行已结束。"
      : blocked || !controllable ? "请先处理当前异常或执行状态核对，再继续运行。"
      : normalPaused ? "已暂停派发：在途动作照常完成。可以继续自动执行，或执行下一步（转为逐步，每次一个动作）。"
      : paused ? "等待下一步：每次只执行一个可执行动作，完成后再次等待。"
      : "当前单步正在执行或等待资源，完成后可执行下一步。",
  };
}
