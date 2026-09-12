/**
 * 界面术语集中表（老板定夺口径，改词只动这里）。
 *
 * - Site → 「库位」（2026-08 定稿；仅 UI 文案，协议字段名/类型名如 Site、
 *   slot_id、site_index 一律不动）。
 * - Handle → 「连接点」（暂译，备选「端口」，等最终定夺；同样只影响 UI 文案）。
 */
export const TERMS = {
  /** Site 概念的统一 UI 称谓。 */
  site: "库位",
  /** Site 占用（occupied_material）。 */
  siteOccupancy: "库位占用",
  /** Site 准入（allowed_resource_template）。 */
  siteAdmission: "库位准入",
  /** Site 编号（site_index / slot_id 投影）。 */
  siteIndex: "库位号",
  /** Handle 概念的统一 UI 称谓（暂译，备选「端口」）。 */
  handle: "连接点",
  /** 编辑器浮层左栏标题：上游输出 Handle/字段。 */
  upstreamOutputs: "上游输出连接点",
} as const;
