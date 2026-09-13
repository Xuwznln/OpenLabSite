/**
 * 动作参数 placeholder 识别与写回（对应 Uni-Lab-OS registry placeholder 约定）。
 *
 * 后端约定（unilabos/registry/placeholder_type.py + registry.py）：
 * - `placeholder_keys`：goal 参数名 → unilabos_* 选择器类型，随 runtime.v1
 *   endpoint 动作能力的 descriptor 下发，注册表同时注入
 *   `schema.properties.goal._unilabos_placeholder_info`。
 * - legacy ROS 消息动作（如 Stir.goal 的 vessel）没有 placeholder_keys
 *   （yaml 中为空 {}），但 goal 属性形状就是 Resource msg
 *   （id/name/sample_id/children/parent/pose/...），可结构识别。
 * - 写回形状：物料/节点引用统一 `{...原对象, id: 物料名, uuid: 物料uuid}` ——
 *   ResourceSlot 走 dict{id,uuid}（设备侧用 uuid 解析）。
 */
import type { ActionPlaceholderKeys, DeviceActionSchemaDetail } from "@openlab/protocol";

/** 前端选择器类别（多个 unilabos_* 标记映射到同一数据源）。 */
export type PlaceholderKind =
  | "resource"
  | "device"
  | "site"
  | "class"
  | "confirm"
  | "deduct"
  | "unsupported";

export interface PlaceholderField {
  /** 顶层 goal 参数名。 */
  param: string;
  /** 原始标记：unilabos_* 常量，结构识别记 "legacy_resource"。 */
  placeholder: string;
  kind: PlaceholderKind;
  /** goal schema 里该参数是 array（多选物料）。 */
  multiple: boolean;
}

const KIND_BY_PLACEHOLDER: Record<string, PlaceholderKind> = {
  unilabos_resources: "resource",
  unilabos_nodes: "resource",
  unilabos_devices: "device",
  // SiteSlot：值是权威 ResourceSite 的 uuid，选项来自物料聚合的 sites。
  unilabos_sites: "site",
  unilabos_class: "class",
  // 指派人来源 GET /manual-confirm/users（旁支端点；404 降级纯自由输入）。
  unilabos_manual_confirm: "confirm",
  // 物料出库：选 registry 资源类 + 实例名 → POST /materials/instantiate
  // 在后端实例化并权威登记，产物 {id, uuid} 写回参数（ResourceSlot 引用）。
  unilabos_deduct_resource: "deduct",
  // 加试剂目标（set_substance）：值就是「要加入 substance 的物料」引用，
  // 与普通物料选择器同数据源。
  unilabos_deduct_reagent: "resource",
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Resource msg 的特征字段（unilabos_msgs/msg/Resource.msg）。 */
const RESOURCE_SHAPE_KEYS = ["id", "name", "sample_id", "children", "parent", "pose"];

/** goal schema 属性是否为 legacy Resource msg 形状。 */
function isResourceShapeSchema(prop: unknown): boolean {
  const properties = asRecord(asRecord(prop)?.properties);
  if (!properties) return false;
  return RESOURCE_SHAPE_KEYS.every((key) => key in properties);
}

/** 参数当前值是否为 legacy Resource msg 形状（schema 缺失时的兜底识别）。 */
export function isResourceShapeValue(value: unknown): boolean {
  const record = asRecord(value);
  if (!record) return false;
  return (
    RESOURCE_SHAPE_KEYS.filter((key) => key in record).length >= 5
  );
}

function goalSchemaNode(
  detail: DeviceActionSchemaDetail | null,
): Record<string, unknown> | null {
  const properties = asRecord(asRecord(detail?.schema)?.properties);
  return asRecord(properties?.goal);
}

/** 合并 placeholder_keys 与 goal._unilabos_placeholder_info（前者优先）。 */
function mergedPlaceholderKeys(
  detail: DeviceActionSchemaDetail | null,
): ActionPlaceholderKeys {
  const fromGoal = asRecord(goalSchemaNode(detail)?._unilabos_placeholder_info);
  return {
    ...(fromGoal as ActionPlaceholderKeys | null),
    ...(detail?.placeholder_keys ?? {}),
  };
}

/**
 * 识别参数表单里的 placeholder 字段：
 * 1. 显式 placeholder_keys / _unilabos_placeholder_info；
 * 2. goal schema 属性的 Resource msg 结构识别（legacy vessel）；
 * 3. schema 不可用时，按参数当前值形状兜底识别（仅 legacy resource）。
 */
export function detectPlaceholderFields(
  detail: DeviceActionSchemaDetail | null,
  paramValue: Record<string, unknown>,
): PlaceholderField[] {
  const fields = new Map<string, PlaceholderField>();
  const goal = goalSchemaNode(detail);
  const goalProps = asRecord(goal?.properties);

  for (const [param, placeholder] of Object.entries(mergedPlaceholderKeys(detail))) {
    const marker = String(placeholder);
    const prop = asRecord(goalProps?.[param]);
    fields.set(param, {
      param,
      placeholder: marker,
      kind: KIND_BY_PLACEHOLDER[marker] ?? "unsupported",
      multiple: prop?.type === "array",
    });
  }

  if (goalProps) {
    for (const [param, prop] of Object.entries(goalProps)) {
      if (fields.has(param)) continue;
      if (isResourceShapeSchema(prop)) {
        fields.set(param, {
          param,
          placeholder: "legacy_resource",
          kind: "resource",
          multiple: false,
        });
      }
    }
  } else {
    for (const [param, value] of Object.entries(paramValue)) {
      if (fields.has(param)) continue;
      if (isResourceShapeValue(value)) {
        fields.set(param, {
          param,
          placeholder: "legacy_resource",
          kind: "resource",
          multiple: false,
        });
      }
    }
  }

  return [...fields.values()];
}

/** 物料引用写回：保留原对象形状，覆写 id（物料名）与 uuid（物料 uuid）。 */
export function resourceRefValue(
  existing: unknown,
  material: { uuid: string; name: string },
): Record<string, unknown> {
  return {
    ...(asRecord(existing) ?? {}),
    id: material.name,
    uuid: material.uuid,
  };
}

/** 从参数当前值提取物料引用的 uuid（选择器回显）。 */
export function resourceRefUuid(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  return String(record.uuid ?? "").trim();
}

/** 从参数当前值提取物料引用的显示名（uuid 不在选项中时补选项）。 */
export function resourceRefLabel(value: unknown): string {
  const record = asRecord(value);
  if (!record) return "";
  return String(record.name || record.id || "").trim();
}

/** placeholder 类型的中文说明（选择器上方的小标签）。 */
export function placeholderLabel(field: PlaceholderField): string {
  switch (field.placeholder) {
    case "unilabos_resources":
      return field.multiple ? "物料引用（多选）" : "物料引用";
    case "unilabos_nodes":
      return "资源节点";
    case "unilabos_devices":
      return "设备引用";
    case "unilabos_sites":
      return "Site 槽位";
    case "unilabos_class":
      return "资源类型";
    case "unilabos_manual_confirm":
      return "人工确认指派";
    case "unilabos_deduct_resource":
      return "物料出库";
    case "unilabos_deduct_reagent":
      return "加试剂目标物料";
    case "legacy_resource":
      return "物料引用";
    default:
      return field.placeholder;
  }
}
