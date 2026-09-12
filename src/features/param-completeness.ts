/**
 * 节点参数完整度统计（画布卡片「还差 N 项」徽标与试运行报告的同源口径）：
 *
 * - placeholder 类字段（unilabos_* 标记 + legacy Resource 结构识别）未选择
 *   计一项；resource 引用以 uuid 或 id/name 任一存在视为已选（对齐后端
 *   `_resource_lookup_identity` 优先 uuid、回退 id 的解析语义）；
 * - 必填字段为空计一项：schema goal.required 存在时只统计 required 顶层参数
 *   下的空叶子（含 required 参数整体缺失）；schema 不可用时参数模板里的空
 *   叶子全部视为待填（模板留空即待填语义）；
 * - 被上游 @@@ 映射覆盖的参数路径不算未填（提交前调度器会写回）：映射
 *   targetKey 的最后一段是 sjson 写入路径，与参数路径按前缀双向匹配；
 * - 参数 JSON 不合法时整体计一项（invalid-json）。
 *
 * 本模块保持纯函数（无网络/无组件依赖），供单测与画布/试运行共用。
 */
import type { ComputedRef, InjectionKey } from "vue";
import type { DeviceActionSchemaDetail } from "@openlab/protocol";
import {
  detectPlaceholderFields,
  placeholderLabel,
  resourceRefLabel,
  resourceRefUuid,
} from "./action-placeholders";
import { flattenParameterFields, parseNodeParam } from "./workflow-variables";

export interface MissingParamEntry {
  /** 参数 dot 路径（placeholder 为顶层参数名；invalid-json 为 "$"）。 */
  path: string;
  /** 展示用说明（placeholder 类型中文名 / 字段路径）。 */
  label: string;
  reason: "placeholder-unselected" | "empty-required" | "invalid-json";
}

export interface MissingParamInput {
  /** 动作 schema（不可用传 null，走参数形状兜底识别）。 */
  detail: DeviceActionSchemaDetail | null;
  paramJson: string;
  /** 上游 @@@ 映射的写入路径（targetKey 最后一段）。 */
  mappedPaths: readonly string[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 映射写入路径与参数路径按 dot 前缀双向覆盖（写 vessel 覆盖 vessel.id，反之亦然）。 */
export function pathCoveredByMappings(
  path: string,
  mappedPaths: readonly string[],
): boolean {
  return mappedPaths.some(
    (mapped) =>
      mapped === path ||
      mapped.startsWith(`${path}.`) ||
      path.startsWith(`${mapped}.`),
  );
}

/** schema goal.required 顶层参数名集合；schema 不可用返回 null。 */
function requiredGoalParams(
  detail: DeviceActionSchemaDetail | null,
): Set<string> | null {
  const goal = asRecord(
    asRecord(asRecord(detail?.schema)?.properties)?.goal,
  );
  if (!goal) return null;
  const required = goal.required;
  if (!Array.isArray(required)) return null;
  return new Set(required.map((item) => String(item)));
}

/** 空值口径：""、null、undefined、空数组视为空；数字 0 / false 视为已填。 */
function isEmptyValue(value: unknown): boolean {
  if (value === "" || value === null || value === undefined) return true;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** placeholder 字段是否已选择（与共享参数表单 placeholderCurrentValue 同源）。 */
function placeholderSelected(
  field: { kind: string; multiple: boolean; param: string },
  value: unknown,
): boolean {
  // deduct（物料出库）产物同为 resource 引用形状：uuid/id 任一存在即已出库
  if (field.kind === "resource" || field.kind === "deduct") {
    if (field.multiple) {
      return (
        Array.isArray(value) &&
        value.some((item) => resourceRefUuid(item) || resourceRefLabel(item))
      );
    }
    return Boolean(resourceRefUuid(value) || resourceRefLabel(value));
  }
  if (field.kind === "confirm" && field.multiple) {
    // 指派人列表：给了列表就是明确决定——空列表 = 不指派（任何人可确认），
    // 与后端 goal_default `[]` 同义；只有键缺失 / 不是列表才算未选择。
    return Array.isArray(value);
  }
  return typeof value === "string" && value.trim().length > 0;
}

/** 未填参数清单（徽标 N = entries.length；试运行逐项列出）。 */
export function missingParamEntries(input: MissingParamInput): MissingParamEntry[] {
  let param: Record<string, unknown>;
  try {
    param = parseNodeParam(input.paramJson);
  } catch {
    return [{ path: "$", label: "参数不是合法 JSON 对象", reason: "invalid-json" }];
  }

  const entries: MissingParamEntry[] = [];
  const placeholders = detectPlaceholderFields(input.detail, param);
  // unsupported placeholder 回退原始字段编辑（与共享表单 placeholderUsable 一致），
  // 其空值走下方叶子统计；其余 placeholder 由选择器接管，不再计叶子。
  const handledParams = new Set(
    placeholders
      .filter((field) => field.kind !== "unsupported")
      .map((field) => field.param),
  );

  const required = requiredGoalParams(input.detail);

  for (const field of placeholders) {
    if (field.kind === "unsupported") continue;
    // SiteSlot 可选语义：空串 = 由父级默认排布；schema 未声明必填时不计未填。
    if (field.kind === "site" && required !== null && !required.has(field.param)) {
      continue;
    }
    if (pathCoveredByMappings(field.param, input.mappedPaths)) continue;
    if (placeholderSelected(field, param[field.param])) continue;
    entries.push({
      path: field.param,
      label: `${field.param}（${placeholderLabel(field)}）未选择`,
      reason: "placeholder-unselected",
    });
  }
  const leaves = flattenParameterFields(param).filter(
    (leaf) => !handledParams.has(leaf.path.split(".")[0]),
  );
  for (const leaf of leaves) {
    if (!isEmptyValue(leaf.value)) continue;
    const topLevel = leaf.path.split(".")[0];
    if (required !== null && !required.has(topLevel)) continue;
    if (pathCoveredByMappings(leaf.path, input.mappedPaths)) continue;
    entries.push({
      path: leaf.path,
      label: `${leaf.path} 为空`,
      reason: "empty-required",
    });
  }

  // schema 声明 required 但参数对象里整个键都不存在（模板未铺开）也计未填。
  if (required !== null) {
    for (const name of required) {
      if (name in param) continue;
      if (handledParams.has(name)) continue;
      if (pathCoveredByMappings(name, input.mappedPaths)) continue;
      entries.push({
        path: name,
        label: `${name} 缺失（schema 必填）`,
        reason: "empty-required",
      });
    }
  }

  return entries;
}

/**
 * 画布节点徽标数据源：EditorView provide、ActionNode inject。
 * 运行画布（MonitorView 等）没有 provide → inject 得 undefined → 徽标隐藏。
 */
export const MISSING_PARAM_COUNTS_KEY: InjectionKey<
  ComputedRef<Map<string, number>>
> = Symbol("missing-param-counts");
