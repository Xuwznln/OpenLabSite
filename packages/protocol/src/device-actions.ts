/**
 * 设备动作描述（registry `action_value_mappings` 条目）的类型与纯函数。
 *
 * 微后端没有独立的「设备 / 动作」路由：动作目录来自 runtime.v1 的 executor
 * endpoint 快照（`action_capabilities[].descriptor`），Slave 侧同一份定义也随
 * HostLink peers 的 `devices[].action_value_mappings` 报送。两处形状一致，都是
 * Uni-Lab-OS registry 导出的动作定义；本模块给它们一个统一的类型与解析入口。
 */
import type { JsonObject, JsonValue } from "./common.js";

/**
 * 后端 placeholder_keys 的取值全集：标注某个动作参数在前端应以何种选择器填入。
 * 与 Uni-Lab-OS `unilabos/registry/placeholder_type.py` 的常量一一对应。
 */
export const ACTION_PLACEHOLDER_TYPES = [
  /** 物料引用（ResourceSlot）——写回 `{id, uuid}` 资源引用对象。 */
  "unilabos_resources",
  /** 设备引用（DeviceSlot）——写回设备 id 字符串。 */
  "unilabos_devices",
  /** Site 位点（SiteSlot）——写回权威 ResourceSite 的 uuid 字符串。 */
  "unilabos_sites",
  /** 资源树节点（挂载目标/台面节点）——写回 `{id, uuid}`。 */
  "unilabos_nodes",
  /** 资源注册表类型名——写回类型名字符串。 */
  "unilabos_class",
  /** 人工确认指派（用户列表）。 */
  "unilabos_manual_confirm",
  /** 物料出库：选资源类 + 实例名，由微后端实例化后回传 `{id, uuid}`。 */
  "unilabos_deduct_resource",
  /** 试剂扣减（set_substance 等内容物设置）。 */
  "unilabos_deduct_reagent",
] as const;

export type ActionPlaceholderType = (typeof ACTION_PLACEHOLDER_TYPES)[number];

/** goal 参数名 → placeholder 类型。 */
export type ActionPlaceholderKeys = Record<string, ActionPlaceholderType | string>;

/**
 * 注册表导出的 goal schema 节点还可能带 `_unilabos_placeholder_info`
 * （registry 在 `schema.properties.goal` 上注入，内容同 placeholder_keys）。
 */
export interface ActionGoalSchemaNode {
  type?: string;
  properties?: Record<string, unknown>;
  required?: string[];
  _unilabos_placeholder_info?: ActionPlaceholderKeys;
  [key: string]: unknown;
}

/** registry 动作 JSON Schema：`properties.goal` 是参数表单的唯一来源。 */
export interface ActionSchema {
  title?: string;
  description?: string;
  type?: string;
  properties?: {
    goal?: ActionGoalSchemaNode;
    feedback?: unknown;
    result?: unknown;
    [key: string]: unknown;
  };
  required?: string[];
  [key: string]: unknown;
}

/** 动作 handle（画布连线端口）声明。 */
export interface ActionHandleSpec {
  handler_key: string;
  label: string;
  io_type: "source" | "target" | (string & {});
  data_key?: string;
  data_source?: string;
  data_type?: string;
  [key: string]: unknown;
}

/**
 * registry 动作定义（`action_value_mappings[action]`）。
 * runtime endpoint 快照的 `descriptor` 与 HostLink peers 的映射值都是这个形状。
 */
export interface ActionDescriptor {
  type?: string;
  display_name?: string;
  goal?: JsonObject;
  goal_default?: JsonObject;
  feedback?: JsonObject;
  result?: JsonObject;
  schema?: ActionSchema | null;
  handles?: { input?: ActionHandleSpec[]; output?: ActionHandleSpec[] } | JsonObject;
  placeholder_keys?: ActionPlaceholderKeys;
  /** true = 不占设备锁，可与其它动作并发。 */
  always_free?: boolean;
  feedback_interval?: number;
  error_policy?: JsonObject;
  /** 执行前需要锁定的物料参数名。 */
  materials_need_lock?: string[];
  [key: string]: JsonValue | undefined | ActionSchema | null | ActionHandleSpec[] | { input?: ActionHandleSpec[]; output?: ActionHandleSpec[] };
}

/**
 * 参数表单 / 干跑校验共用的动作 schema 视图。
 * 由 runtime endpoint 能力或 HostLink 设备档案投影而来；`handles` /
 * `placeholder_keys` 可能缺失，消费方需回退到
 * `schema.properties.goal._unilabos_placeholder_info`。
 */
export interface DeviceActionSchemaDetail {
  device_id: string;
  action_name: string;
  schema: ActionSchema | null;
  goal_default: unknown;
  action_type: string | null;
  is_busy: boolean;
  current_job_id?: string | null;
  handles?: Record<string, unknown>;
  placeholder_keys?: ActionPlaceholderKeys;
  display_name?: string;
  always_free?: boolean;
}

/** 某台设备的动作能力行（runtime.v1 `action_capabilities[]` 的浏览器视图）。 */
export interface DeviceActionCapabilityLike {
  device_uuid: string;
  action_name: string;
  action_type?: string | null;
  availability?: "free" | "busy" | "unknown";
  active_job_uuid?: string | null;
  descriptor: ActionDescriptor | JsonObject;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 把 runtime 能力行投影成参数表单可消费的 schema 视图。 */
export function actionSchemaDetailFromCapability(
  capability: DeviceActionCapabilityLike,
): DeviceActionSchemaDetail {
  const descriptor = (asObject(capability.descriptor) ?? {}) as ActionDescriptor;
  const schema = asObject(descriptor.schema) as ActionSchema | null;
  const placeholder =
    asObject(descriptor.placeholder_keys) ??
    asObject(asObject(asObject(schema?.properties)?.goal)?._unilabos_placeholder_info);
  return {
    device_id: capability.device_uuid,
    action_name: capability.action_name,
    schema,
    goal_default: descriptor.goal_default ?? null,
    action_type: capability.action_type ?? (typeof descriptor.type === "string" ? descriptor.type : null),
    is_busy: capability.availability === "busy",
    current_job_id: capability.active_job_uuid ?? null,
    handles: asObject(descriptor.handles) ?? undefined,
    placeholder_keys: placeholder ? (placeholder as ActionPlaceholderKeys) : undefined,
    display_name: typeof descriptor.display_name === "string" ? descriptor.display_name : undefined,
    always_free: descriptor.always_free === true,
  };
}

/** HostLink 设备档案（`action_value_mappings`）→ 同一 schema 视图。 */
export function actionSchemaDetailFromMapping(
  deviceId: string,
  actionName: string,
  mapping: unknown,
): DeviceActionSchemaDetail {
  return actionSchemaDetailFromCapability({
    device_uuid: deviceId,
    action_name: actionName,
    descriptor: (asObject(mapping) ?? {}) as ActionDescriptor,
  });
}

/** 动作展示名：registry display_name 优先，缺省回退动作名。 */
export function actionDisplayName(
  actionName: string,
  descriptor: ActionDescriptor | JsonObject | null | undefined,
): string {
  const name = asObject(descriptor)?.display_name;
  return typeof name === "string" && name.trim() ? name.trim() : actionName;
}

/** goal schema 的参数名列表（表单字段顺序）。 */
export function actionGoalKeys(detail: Pick<DeviceActionSchemaDetail, "schema">): string[] {
  const goal = asObject(asObject(detail.schema?.properties)?.goal);
  const properties = asObject(goal?.properties);
  return properties ? Object.keys(properties) : [];
}

/**
 * 动作默认参数：goal_default 优先，缺省按 goal schema 的类型给出空值模板。
 * 这是 ad-hoc 设备动作与画布节点新建时的初始 param。
 */
export function actionParameterTemplate(
  detail: Pick<DeviceActionSchemaDetail, "schema" | "goal_default">,
): Record<string, unknown> {
  const goalDefault = asObject(detail.goal_default);
  if (goalDefault && Object.keys(goalDefault).length) return { ...goalDefault };
  const goal = asObject(asObject(detail.schema?.properties)?.goal);
  const properties = asObject(goal?.properties) ?? {};
  const template: Record<string, unknown> = {};
  for (const [key, raw] of Object.entries(properties)) {
    const prop = asObject(raw);
    if (prop && "default" in prop) {
      template[key] = prop.default;
      continue;
    }
    template[key] = emptyValueForSchema(prop);
  }
  return template;
}

function emptyValueForSchema(prop: Record<string, unknown> | null): unknown {
  const type = Array.isArray(prop?.type) ? prop?.type[0] : prop?.type;
  switch (type) {
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "array":
      return [];
    case "object":
      return {};
    case "null":
      return null;
    default:
      return "";
  }
}
