/**
 * dagre 复合节点（循环框）布局的连线改写。
 *
 * dagre 的 compound 布局不支持连线直接连到「有成员的复合节点」上（`rank` 阶段会抛
 * `Cannot set properties of undefined (setting 'rank')`）。设备包 @workflow 模板与任务快照里，
 * 循环节点本身就是上下游连线的端点（`复位 → 加样 ×3 → 汇总报告`），所以布局前把这类端点换成
 * 循环里的成员：连进循环的线接到循环的入口成员（循环内没有上游的成员），从循环出去的线从出口成员
 * （循环内没有下游的成员）出发；嵌套循环逐层展开。只影响布局，不改写画布上的真实连线。
 */

export interface CompoundLayoutNode {
  id: string;
  /** 所属复合节点（循环框）；顶层为空。 */
  parent?: string | null;
}

export interface CompoundLayoutEdge {
  source: string;
  target: string;
}

export function compoundLayoutEdges(nodes: CompoundLayoutNode[], edges: CompoundLayoutEdge[]): CompoundLayoutEdge[] {
  const children = new Map<string, string[]>();
  for (const node of nodes) {
    if (!node.parent) continue;
    children.set(node.parent, [...(children.get(node.parent) ?? []), node.id]);
  }
  const parentOf = new Map(nodes.map((node) => [node.id, node.parent ?? null] as const));
  const memberEdges = edges.filter((edge) => parentOf.get(edge.source) === parentOf.get(edge.target) && parentOf.get(edge.source));

  /** 复合节点的入口 / 出口成员（叶子），嵌套时逐层展开；没有成员时就是它自己。 */
  function boundary(id: string, side: "entry" | "exit", seen: Set<string> = new Set()): string[] {
    const members = children.get(id);
    if (!members?.length || seen.has(id)) return [id];
    seen.add(id);
    const memberSet = new Set(members);
    const inner = memberEdges.filter((edge) => memberSet.has(edge.source) && memberSet.has(edge.target));
    const picked = members.filter((member) =>
      side === "entry" ? !inner.some((edge) => edge.target === member) : !inner.some((edge) => edge.source === member),
    );
    return (picked.length ? picked : members).flatMap((member) => boundary(member, side, seen));
  }

  const result: CompoundLayoutEdge[] = [];
  const keys = new Set<string>();
  for (const edge of edges) {
    for (const source of boundary(edge.source, "exit")) {
      for (const target of boundary(edge.target, "entry")) {
        const key = `${source}->${target}`;
        if (source === target || keys.has(key)) continue;
        keys.add(key);
        result.push({ source, target });
      }
    }
  }
  return result;
}
