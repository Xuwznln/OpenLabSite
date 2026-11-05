/**
 * 画布上的「子工作流」（组合调用）：插入一个已发布工作流后，权威图里多出
 *
 * - 一个调用节点：`type="workflow"`，`meta_data.unilab.composite` 记着固定的发布修订与边界映射，
 *   `workflow_node_template_uuid` 指向发布投影出的节点模板，param 是插入时的实参；
 * - 它内联展开的普通节点：`parent_uuid` 链指向调用节点，uuid 由调用 uuid 派生（以及它们之间的边）。
 *
 * 编辑器把整棵子树收成**一个只读画布节点**（type "composite"），原始权威节点存在节点 data 里；
 * 保存整图时原样写回（只更新调用节点的位置 / 依赖 / 禁用），否则 PUT graph 的全量替换会把
 * 展开节点删掉、调用失效。`meta_data.unilab` 是服务端保留字段，写回时不带（服务端保留原值）。
 */
import {
  BackendBusinessError,
  isWorkflowInputReference,
  type BackendCompositeArgument,
  type BackendWorkflowEdge,
  type BackendWorkflowEdgeWrite,
  type BackendWorkflowGraph,
  type BackendWorkflowNode,
  type BackendWorkflowNodeWrite,
  type JsonObject,
} from "@openlab/protocol";

export const COMPOSITE_NODE_TYPE = "composite";

export interface CompositeNodeData {
  /** 调用节点 uuid（= 画布节点 id）。 */
  uuid: string;
  name: string;
  childWorkflowUuid: string;
  childRevision: number;
  /** 插入时的实参：静态值或 `{"kind": "workflow_input", "parameter": 父入口参数}`。 */
  arguments: Record<string, BackendCompositeArgument>;
  /** 调用节点在前，其后是全部展开节点（权威原样，含服务端保留的 meta_data.unilab）。 */
  nodes: BackendWorkflowNode[];
  /** 子树内部的边（画布工作流的子图通常没有）。 */
  edges: BackendWorkflowEdge[];
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function unilabOf(node: { meta_data?: unknown }): Record<string, unknown> {
  return asRecord(asRecord(node.meta_data)?.unilab) ?? {};
}

/** 组合调用节点：type="workflow" 且带 meta_data.unilab.composite。 */
export function isCompositeInvocation(node: BackendWorkflowNode): boolean {
  return String(node.type).toLowerCase() === "workflow" && asRecord(unilabOf(node).composite) !== null;
}

/** 节点是否在某个调用的子树里（自己就是调用节点也算）。 */
function ancestorInvocation(node: BackendWorkflowNode, byUuid: Map<string, BackendWorkflowNode>): BackendWorkflowNode | null {
  let top: BackendWorkflowNode | null = null;
  let current: BackendWorkflowNode | undefined = node;
  const seen = new Set<string>();
  while (current && !seen.has(current.uuid)) {
    seen.add(current.uuid);
    if (isCompositeInvocation(current)) top = current;
    current = current.parent_uuid ? byUuid.get(current.parent_uuid) : undefined;
  }
  return top;
}

/** 顶层调用节点（嵌套组合的内层调用属于外层子树，不单独成画布节点）。 */
export function topLevelInvocations(graph: Pick<BackendWorkflowGraph, "nodes">): BackendWorkflowNode[] {
  const byUuid = new Map(graph.nodes.map((node) => [node.uuid, node]));
  return graph.nodes.filter((node) => isCompositeInvocation(node) && ancestorInvocation(node, byUuid) === node);
}

/** 调用节点 uuid → 子树节点（调用节点在前）与内部边。 */
export function compositeSubtree(
  graph: Pick<BackendWorkflowGraph, "nodes" | "edges">,
  invocationUuid: string,
): { nodes: BackendWorkflowNode[]; edges: BackendWorkflowEdge[] } {
  const byUuid = new Map(graph.nodes.map((node) => [node.uuid, node]));
  const members = graph.nodes.filter((node) => {
    let current: BackendWorkflowNode | undefined = node;
    const seen = new Set<string>();
    while (current && !seen.has(current.uuid)) {
      if (current.uuid === invocationUuid) return true;
      seen.add(current.uuid);
      current = current.parent_uuid ? byUuid.get(current.parent_uuid) : undefined;
    }
    return false;
  });
  members.sort((a, b) => (a.uuid === invocationUuid ? -1 : b.uuid === invocationUuid ? 1 : 0));
  const ids = new Set(members.map((node) => node.uuid));
  return {
    nodes: members,
    edges: graph.edges.filter((edge) => ids.has(edge.source_node_uuid) && ids.has(edge.target_node_uuid)),
  };
}

/** 插入结果（或已有图）里某个调用 → 画布节点 data。 */
export function compositeDataFromGraph(
  graph: Pick<BackendWorkflowGraph, "nodes" | "edges">,
  invocationUuid: string,
): CompositeNodeData | null {
  const subtree = compositeSubtree(graph, invocationUuid);
  const invocation = subtree.nodes[0];
  if (!invocation || invocation.uuid !== invocationUuid || !isCompositeInvocation(invocation)) return null;
  const composite = asRecord(unilabOf(invocation).composite) ?? {};
  return {
    uuid: invocation.uuid,
    name: invocation.name,
    childWorkflowUuid: String(composite.child_workflow_uuid ?? ""),
    childRevision: Number(composite.child_workflow_revision ?? 0),
    arguments: { ...(invocation.param ?? {}) } as Record<string, BackendCompositeArgument>,
    nodes: subtree.nodes,
    edges: subtree.edges,
  };
}

/** 权威节点 → 写入形状：只保留可写字段，去掉服务端保留的 meta_data.unilab。 */
export function toNodeWrite(node: BackendWorkflowNode): BackendWorkflowNodeWrite {
  const { unilab: _unilab, ...meta } = (node.meta_data ?? {}) as JsonObject;
  void _unilab;
  const write: BackendWorkflowNodeWrite = {
    uuid: node.uuid,
    name: node.name,
    type: node.type,
    pose: node.pose ?? {},
    param: node.param ?? {},
    execution_policy: node.execution_policy ?? {},
    disabled: Boolean(node.disabled),
    minimized: Boolean(node.minimized),
    meta_data: meta,
  };
  for (const key of [
    "workflow_node_template_uuid", "parent_uuid", "material_uuid", "icon", "footer",
    "action_name", "action_type", "script", "description",
  ] as const) {
    const value = node[key];
    if (typeof value === "string") write[key] = value;
  }
  return write;
}

export function toEdgeWrite(edge: BackendWorkflowEdge): BackendWorkflowEdgeWrite {
  const { unilab: _unilab, ...meta } = (edge.meta_data ?? {}) as JsonObject;
  void _unilab;
  return {
    uuid: edge.uuid,
    source_node_uuid: edge.source_node_uuid,
    target_node_uuid: edge.target_node_uuid,
    source_handle_uuid: edge.source_handle_uuid,
    target_handle_uuid: edge.target_handle_uuid,
    meta_data: meta,
    ...(edge.description ? { description: edge.description } : {}),
  };
}

/**
 * 写回整棵子树：调用节点用画布上的位置 / 依赖 / 禁用覆盖（父图里依赖调用节点 = 依赖它的全部叶子），
 * 展开节点原样。
 */
export function compositeWriteNodes(
  data: CompositeNodeData,
  override: { pose: JsonObject; dependsOn: string[]; disabled: boolean; editorNodeId: string },
): BackendWorkflowNodeWrite[] {
  return data.nodes.map((node) => {
    const write = toNodeWrite(node);
    if (node.uuid !== data.uuid) return write;
    const { depends_on: _old, ...policy } = (node.execution_policy ?? {}) as JsonObject;
    void _old;
    return {
      ...write,
      pose: override.pose,
      execution_policy: override.dependsOn.length ? { ...policy, depends_on: override.dependsOn } : policy,
      disabled: override.disabled,
      meta_data: { ...(write.meta_data ?? {}), editor_node_id: override.editorNodeId },
    };
  });
}

/** 展开出的可执行步骤（不含调用节点本身与嵌套调用节点），按 depends_on 拓扑序（同层保持原序）。 */
export function compositeLeafSteps(data: CompositeNodeData): { uuid: string; name: string; device: string; action: string }[] {
  const leaves = data.nodes.filter((node) => node.uuid !== data.uuid && String(node.type).toLowerCase() !== "workflow");
  const ids = new Set(leaves.map((node) => node.uuid));
  const upstream = new Map(leaves.map((node) => {
    const deps = asRecord(node.execution_policy)?.depends_on;
    return [node.uuid, (Array.isArray(deps) ? deps.map(String) : []).filter((id) => ids.has(id) && id !== node.uuid)] as const;
  }));
  const ordered: BackendWorkflowNode[] = [];
  const placed = new Set<string>();
  while (ordered.length < leaves.length) {
    const ready = leaves.find((node) => !placed.has(node.uuid) && upstream.get(node.uuid)!.every((id) => placed.has(id)))
      ?? leaves.find((node) => !placed.has(node.uuid))!; // 有环时按原序兜底
    ordered.push(ready);
    placed.add(ready.uuid);
  }
  return ordered
    .map((node) => ({
      uuid: node.uuid,
      name: node.name,
      device: String(asRecord(node.meta_data)?.target_device_id ?? ""),
      action: node.action_name ?? "",
    }));
}

/** 子树里引用的父工作流入口参数名（调用实参与展开节点 param 顶层）。 */
export function compositeEntryReferences(data: CompositeNodeData): Set<string> {
  const names = new Set<string>();
  for (const node of data.nodes) {
    for (const value of Object.values(node.param ?? {})) {
      if (isWorkflowInputReference(value)) names.add(value.parameter);
    }
  }
  return names;
}

/** 模板节点的 Handle → 入口参数绑定（PUT /io 的 node_input_bindings 是完整替换，必须原样带回）。 */
export function collectNodeInputBindings(
  nodes: readonly BackendWorkflowNode[],
): Record<string, Record<string, { parameter: string }>> {
  const result: Record<string, Record<string, { parameter: string }>> = {};
  for (const node of nodes) {
    const bindings = asRecord(unilabOf(node).input_bindings);
    if (!bindings || !Object.keys(bindings).length) continue;
    const entries = Object.entries(bindings).filter(([, binding]) => typeof asRecord(binding)?.parameter === "string");
    if (entries.length) {
      result[node.uuid] = Object.fromEntries(entries.map(([handle, binding]) => [handle, { parameter: String(asRecord(binding)!.parameter) }]));
    }
  }
  return result;
}

/** 实参的人话摘要：`volume ← 入口参数 amount` / `volume = 5`。 */
export function describeCompositeArgument(name: string, value: unknown): string {
  if (isWorkflowInputReference(value)) return `${name} ← 入口参数 ${value.parameter}`;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return `${name} = ${text.length > 40 ? `${text.slice(0, 40)}…` : text}`;
}

/** 克隆到新工作流时去掉组合调用子树（展开节点的 uuid 全局唯一，不能复制到另一条流程）。 */
export function stripCompositeSubtrees<T extends Pick<BackendWorkflowGraph, "nodes" | "edges">>(
  graph: T,
): { graph: T; removed: string[] } {
  const removedIds = new Set<string>();
  const removed: string[] = [];
  for (const invocation of topLevelInvocations(graph)) {
    removed.push(invocation.name);
    for (const node of compositeSubtree(graph, invocation.uuid).nodes) removedIds.add(node.uuid);
  }
  if (!removedIds.size) return { graph, removed };
  const nodes = graph.nodes
    .filter((node) => !removedIds.has(node.uuid))
    .map((node) => {
      const policy = asRecord(node.execution_policy);
      const dependsOn = policy?.depends_on;
      if (!Array.isArray(dependsOn) || !dependsOn.some((item) => removedIds.has(String(item)))) return node;
      return {
        ...node,
        execution_policy: { ...policy, depends_on: dependsOn.filter((item) => !removedIds.has(String(item))) } as JsonObject,
      };
    });
  const edges = graph.edges.filter((edge) => !removedIds.has(edge.source_node_uuid) && !removedIds.has(edge.target_node_uuid));
  return { graph: { ...graph, nodes, edges }, removed };
}

const COMPOSITE_DIAGNOSTICS: Record<string, string> = {
  composite_recursive_reference: "不能插入自己，或插入后会形成循环引用（子工作流里已经包含当前流程）",
  composite_boundary_mapping_invalid: "实参不完整或类型不符：必填输入都要给值，且值要符合子工作流声明的类型",
  composite_contract_stale: "子工作流的发布合同已变化，请重新选择最新发布",
  composite_catalog_mismatch: "子工作流的发布与当前目录不一致，请刷新后重试",
  composite_child_not_found: "子工作流不存在或已删除",
  composite_child_unapplied: "子工作流的发布尚未生效",
};

/** 插入子工作流失败的人话；不认识的错误返回 null 交给通用处理。 */
export function describeCompositeError(error: unknown): string | null {
  if (!(error instanceof BackendBusinessError)) return null;
  if (error.code === 3002) return "子工作流还没有发布（或所选版本不存在），请先在它的详情页发布";
  if (error.code === 3003) return "当前流程在插入前被修改了（版本冲突），已保存的内容不受影响，请重试";
  const code = /(composite_[a-z_]+)（([^）]*)）/.exec(error.message);
  if (code) return `${COMPOSITE_DIAGNOSTICS[code[1]] ?? "子工作流展开失败"}（${code[1]} ${code[2]}）`;
  return null;
}
