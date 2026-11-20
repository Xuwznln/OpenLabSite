/**
 * 物料选择器的选项（节点参数浮层的 ResourceSlot 选择器与运行时入口参数的物料字段同源）：
 * 来自 `inventory.instances()`，按显示标签自然序，标签是 `display_name`（回退 resource_id），
 * 值是物料 uuid；写回参数时用 `resourceRefValue` 拼 `{id: resource_id, uuid}`。
 */
import type { MaterialsV1Aggregate } from "@openlab/protocol";
import { compareMaterialLabels, materialLabel } from "./material-label";

/** type 别名（不是 interface）：要能直接交给 naive-ui NSelect 的 `options`。 */
export type MaterialOption = {
  label: string;
  value: string;
};

/** 物料 uuid → 人读标签与 resource_id（写回引用的 `id` 用 resource_id；物料 name 是 uuid）。 */
export interface MaterialRefInfo {
  label: string;
  resourceId: string;
}

export interface MaterialOptions {
  options: MaterialOption[];
  refs: Map<string, MaterialRefInfo>;
}

/**
 * @param allowedTemplates 物料入口参数 Schema 的 `allowed_resource_template_uuids`：非空时只列这些
 *   模板的物料（只用于筛选提示，最终以后端校验为准）。
 */
export function materialOptionsFrom(
  items: readonly Pick<MaterialsV1Aggregate, "material">[],
  allowedTemplates: readonly string[] = [],
): MaterialOptions {
  const allowed = new Set(allowedTemplates);
  const refs = new Map<string, MaterialRefInfo>();
  const options = items
    .filter(({ material }) => material.deleted_at_ms == null)
    .filter(({ material }) => !allowed.size || allowed.has(material.template_uuid))
    .sort((a, b) => compareMaterialLabels(a.material, b.material))
    .map(({ material }) => {
      const label = materialLabel(material);
      refs.set(material.material_uuid, { label, resourceId: material.resource_id });
      return {
        label: material.resource_type ? `${label} · ${material.resource_type}` : label,
        value: material.material_uuid,
      };
    });
  return { options, refs };
}
