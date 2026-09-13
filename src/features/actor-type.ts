/**
 * 物料变更来源（materials.v1 `actor_type`）的展示名。
 *
 * 取值即后端 `KNOWN_ACTOR_TYPES`；展示口径按后端指南：`edge` 是"未细分的 Edge 进程内写点"，
 * 显示为「Edge 上报」而不是「本地权威」（权威本来就是本进程，这个词区分不了来源）；
 * `human` 是浏览器 / 操作员直接编辑。未知取值原样显示。
 */
const ACTOR_TYPE_LABELS: Record<string, string> = {
  human: "手动编辑",
  graph: "开机图 / 模板",
  registry: "注册表",
  device: "设备",
  virtual_device: "虚拟设备",
  scheduler: "调度器",
  workflow: "工作流",
  backend: "云端",
  edge: "Edge 上报",
};

export function actorTypeLabel(actorType: string | null | undefined): string {
  const key = String(actorType ?? "").trim();
  if (!key) return "—";
  return ACTOR_TYPE_LABELS[key] ?? key;
}
