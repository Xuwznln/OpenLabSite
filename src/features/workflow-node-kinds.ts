/**
 * 工作流图里的节点种类（Uni-Lab-OS 统一核心）与只读展示用的摘要。
 *
 * 除设备动作外，源码（`@workflow`，AST 编译）还会写出这些结构节点：
 * - `loop`：循环容器（`for i in range(n)` / 原生 `while <条件>:` / `ctx.loop_for` / `ctx.loop_while`），
 *   循环体 `parent_uuid` 指向它；原生 while 的条件是表达式（`expression`），跨轮携带的变量在 `carry`；
 * - `condition`：调度器本地求值的条件（源码 `if`），分支节点在 `execution_policy.condition_guards` 引用它；
 * - `material_io`：人工装入 / 取走 / 补量（见 `material-io.ts`）；
 * - `group`：只做展示的分组（`ctx.group` / `ctx.parallel`，`meta_data.group_mode=parallel`），不执行、没有节点运行。
 *
 * `with ctx.lock(...)` 不是节点：它写在工作流 `meta_data.unilab.resource_scopes`（作用域名 + 资源 + 成员节点）。
 */
import { describeMaterialIo } from "./material-io";
import { describeLoopSpec } from "./workflow-loops";

export const NODE_TYPE_LABELS: Record<string, string> = {
  device_action: "设备动作",
  workflow: "子流程",
  manual_confirm: "人工确认",
  control: "控制",
  loop: "循环",
  condition: "条件",
  material_io: "人工物料",
  group: "分组",
};

export function nodeTypeLabel(type: string | undefined | null): string {
  const key = String(type ?? "");
  return NODE_TYPE_LABELS[key.toLowerCase()] ?? key;
}

export type StructuralKind = "loop" | "condition" | "material_io" | "group";

export function structuralKind(type: string | undefined | null): StructuralKind | null {
  const key = String(type ?? "").toLowerCase();
  return key === "loop" || key === "condition" || key === "material_io" || key === "group" ? key : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 条件节点摘要：恒真 / 恒假的字面量直接说，其余是表达式。 */
export function describeCondition(param: Record<string, unknown> | undefined): string {
  const expression = asRecord(param?.expression);
  if (expression && Object.keys(expression).length === 1 && "lit" in expression) {
    return expression.lit === true ? "条件：恒为真" : expression.lit === false ? "条件：恒为假" : "条件";
  }
  return "条件分支（表达式）";
}

interface NodeLike {
  type?: string;
  name?: string;
  param?: Record<string, unknown> | unknown;
  meta_data?: Record<string, unknown> | unknown;
}

/** 结构节点的一句话摘要；设备动作等非结构节点返回空串。 */
export function describeStructuralNode(node: NodeLike): string {
  const param = asRecord(node.param) ?? {};
  switch (structuralKind(node.type)) {
    case "loop":
      return describeLoopSpec(param);
    case "condition":
      return describeCondition(param);
    case "material_io":
      return describeMaterialIo(param);
    case "group":
      return asRecord(node.meta_data)?.group_mode === "parallel" ? "并行分组" : "分组";
    default:
      return "";
  }
}

export interface ResourceScope {
  scope_id: string;
  resources: string[];
  node_uuids: string[];
}

/** 工作流 `meta_data.unilab.resource_scopes`（`with ctx.lock(...)`）。 */
export function resourceScopes(workflowMeta: unknown): ResourceScope[] {
  const scopes = asRecord(asRecord(workflowMeta)?.unilab)?.resource_scopes;
  if (!Array.isArray(scopes)) return [];
  return scopes.flatMap((item): ResourceScope[] => {
    const record = asRecord(item);
    if (!record) return [];
    return [{
      scope_id: String(record.scope_id ?? ""),
      resources: Array.isArray(record.resources) ? record.resources.map(String) : [],
      node_uuids: Array.isArray(record.node_uuids) ? record.node_uuids.map(String) : [],
    }];
  });
}

/** 节点 uuid → 它所在的锁作用域文案（`🔒 名称（资源…）`）。 */
export function resourceScopeLabels(workflowMeta: unknown): Map<string, string[]> {
  const labels = new Map<string, string[]>();
  for (const scope of resourceScopes(workflowMeta)) {
    const text = `${scope.scope_id || "锁"}（${scope.resources.join("、") || "—"}）`;
    for (const uuid of scope.node_uuids) labels.set(uuid, [...(labels.get(uuid) ?? []), text]);
  }
  return labels;
}

/** 参数里是否有指向其他步骤结果的引用（`{kind: "node_output", ...}`），画布表单不能承载。 */
export function hasNodeOutputReference(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(hasNodeOutputReference);
  const record = asRecord(value);
  if (!record) return false;
  if (record.kind === "node_output") return true;
  return Object.values(record).some(hasNodeOutputReference);
}

/** 能否搬进画布要看的节点字段（后端图节点与设备包模板步骤共用）。 */
export interface SourceFeatureNode {
  type?: string;
  param?: unknown;
  execution_policy?: unknown;
  /** 设备包模板步骤把守卫写在顶层 */
  condition_guards?: unknown;
}

/**
 * 画布不能无损编辑的源码写法：条件节点 / 条件守卫、表达式或携带变量的循环、按入口参数定轮数的循环、
 * 参数里的步骤结果引用、`ctx.lock` 资源作用域（`scopes` 非空）。返回人话原因（去重）；空数组 = 可以搬进画布。
 */
export function sourceOnlyFeatures(nodes: SourceFeatureNode[], scopes: unknown[] = []): string[] {
  const reasons = new Set<string>();
  for (const node of nodes) {
    const kind = structuralKind(node.type);
    const param = asRecord(node.param) ?? {};
    if (kind === "condition") reasons.add("条件分支（if）");
    const guards = asRecord(node.execution_policy)?.condition_guards ?? node.condition_guards;
    if (Array.isArray(guards) && guards.length) reasons.add("条件分支（if）");
    if (kind === "loop") {
      if (param.expression !== undefined) reasons.add("条件表达式 while 循环");
      if (param.carry !== undefined || param.carry_next !== undefined) reasons.add("跨轮携带变量的循环");
      if (asRecord(param.count)) reasons.add("按入口参数定轮数的循环");
      if (typeof param.start === "number" && param.start !== 0) reasons.add("range(start, stop) 循环");
    }
    if (kind !== "loop" && hasNodeOutputReference(param)) reasons.add("引用上游步骤结果的参数");
  }
  if (scopes.length) reasons.add("资源锁 ctx.lock");
  return [...reasons];
}
