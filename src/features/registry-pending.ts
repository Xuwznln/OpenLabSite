/**
 * 注册表挂起变更的文案（Registry Authority 接受规则）。
 *
 * 新增 / 变化 / Host 不再上报的条目先挂起；规则 B（上报 Host 与权威同机、且没有跨机器 Slave）或
 * 规则 A（驱动包版本升高）成立时自动生效，否则等用户在注册表页接受或忽略。
 */
import type {
  RegistryAcceptance,
  RegistryPendingBatchResult,
  RegistryPendingChange,
  RegistryPendingReason,
} from "@openlab/protocol";

const CHANGE_LABELS: Record<Exclude<RegistryPendingChange, "">, string> = {
  add: "新增",
  update: "更新",
  remove: "待移除",
};

/** 挂起的是哪种变化；没有挂起（空串 / 旧后端缺字段）时为空串。 */
export function pendingChangeLabel(change: RegistryPendingChange | string | undefined): string {
  return change ? (CHANGE_LABELS[change as keyof typeof CHANGE_LABELS] ?? change) : "";
}

const REASON_LABELS: Record<Exclude<RegistryPendingReason, "">, string> = {
  "cross-machine-reporter": "上报的 Host 不在调度权威这台机器上",
  "cross-machine-slave": "调度权威记着跨机器的 Slave",
};

/** 为什么没有自动接受。 */
export function pendingReasonLabel(reason: RegistryPendingReason | string | undefined): string {
  if (!reason) return "等待确认";
  return REASON_LABELS[reason as keyof typeof REASON_LABELS] ?? reason;
}

export interface AcceptanceSummary {
  tone: "ok" | "warn";
  title: string;
  detail: string;
  /** 挂起提示条里的一句原因。 */
  pendingHint: string;
}

/** 规则 B 判定 → 状态卡文案。 */
export function acceptanceSummary(acceptance: RegistryAcceptance): AcceptanceSummary {
  if (acceptance.single_machine) {
    return {
      tone: "ok",
      title: "单机部署：变更自动接受",
      detail: "Host 与 Slave 都在调度权威这台机器上",
      pendingHint: "这些变更来自之前的跨机器上报，或未满足自动接受条件。",
    };
  }
  const slaves = acceptance.remote_slaves.length ? `（${acceptance.remote_slaves.join("、")}）` : "";
  const reason = pendingReasonLabel(acceptance.reason) + slaves;
  return {
    tone: "warn",
    title: "跨机器部署：变更需要确认",
    detail: `${reason}；驱动包版本升高的变更仍自动接受`,
    pendingHint: `${reason}，注册表变更不会自动生效。`,
  };
}

/** 批量接受 / 忽略的结果提示。 */
export function pendingBatchMessage(action: "apply" | "dismiss", result: RegistryPendingBatchResult): string {
  const verb = action === "apply" ? "接受" : "忽略";
  const done = `已${verb} ${result.entries.length} 个变更`;
  if (!result.failed.length) return done;
  const failed = result.failed.slice(0, 3).map((item) => `${item.name}：${item.error}`).join("；");
  return `${done}，${result.failed.length} 个失败（${failed}${result.failed.length > 3 ? "…" : ""}）`;
}
