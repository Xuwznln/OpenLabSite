/**
 * 物料的人读标签。
 *
 * 核心约定（Uni-Lab-OS 统一分支）：物料 `name` 恒等于 `material_uuid`（所有物料，包括设备），不是给人看的；
 * 人读标签是 `display_name`（孔位是 ordering 标识如 "A1"，权威保证非空：缺省依次回退旧名、PLR 键、resource_id），
 * 唯一的人可读键是 `resource_id`。显示 / 排序 / 去重 / 搜索都用这里的标签，不再读 `name`。
 */
interface MaterialIdentityLike {
  display_name?: string | null;
  resource_id?: string | null;
  material_uuid?: string | null;
  name?: string | null;
}

/** 显示标签：display_name → resource_id → uuid（旧数据兜底）。 */
export function materialLabel(material: MaterialIdentityLike | null | undefined): string {
  if (!material) return "";
  return (material.display_name ?? "").trim() || (material.resource_id ?? "").trim() || (material.material_uuid ?? material.name ?? "").trim();
}

/** 排序：按标签自然序（A2 < A10），同标签按 uuid 稳定。 */
export function compareMaterialLabels(a: MaterialIdentityLike, b: MaterialIdentityLike): number {
  return (
    materialLabel(a).localeCompare(materialLabel(b), "zh-CN", { numeric: true }) ||
    String(a.material_uuid ?? "").localeCompare(String(b.material_uuid ?? ""))
  );
}

/** 搜索：标签、resource_id、条码、类名与 uuid 任一包含关键字（关键字已小写）。 */
export function materialMatches(
  material: MaterialIdentityLike & { class_name?: string | null; barcode?: string | null },
  keyword: string,
): boolean {
  return [material.display_name, material.resource_id, material.class_name, material.barcode, material.material_uuid]
    .some((value) => String(value ?? "").toLowerCase().includes(keyword));
}
