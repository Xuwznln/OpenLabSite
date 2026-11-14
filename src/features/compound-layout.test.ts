import dagre from "@dagrejs/dagre";
import { describe, expect, it } from "vitest";
import { compoundLayoutEdges, type CompoundLayoutEdge, type CompoundLayoutNode } from "./compound-layout";

function layout(nodes: CompoundLayoutNode[], edges: CompoundLayoutEdge[]) {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: "LR" });
  g.setDefaultEdgeLabel(() => ({}));
  for (const node of nodes) g.setNode(node.id, { width: 220, height: 72 });
  for (const node of nodes) if (node.parent) g.setParent(node.id, node.parent);
  for (const edge of edges) g.setEdge(edge.source, edge.target);
  dagre.layout(g);
  return g;
}

// ComplexWorkflowDemo「循环演示：嵌套板孔」：外层循环 step-1 套内层循环 step-3，连线直接连到循环节点上
const nested: CompoundLayoutNode[] = [
  { id: "step-0" },
  { id: "step-1" },
  { id: "step-2", parent: "step-1" },
  { id: "step-3", parent: "step-1" },
  { id: "step-4", parent: "step-3" },
  { id: "step-5" },
];
const nestedEdges = [
  { source: "step-0", target: "step-1" },
  { source: "step-2", target: "step-3" },
  { source: "step-1", target: "step-5" },
];

describe("循环框（dagre 复合节点）布局连线", () => {
  it("原样把连线连到有成员的循环节点会让 dagre 抛错；改写后可以布局", () => {
    expect(() => layout(nested, nestedEdges)).toThrow();
    const g = layout(nested, compoundLayoutEdges(nested, nestedEdges));
    expect(g.node("step-1").width).toBeGreaterThan(0);
    expect(g.node("step-5").x).toBeGreaterThan(g.node("step-0").x);
  });

  it("进循环接入口成员、出循环从出口成员出发，嵌套循环逐层展开；没有成员的循环保持原样", () => {
    expect(compoundLayoutEdges(nested, nestedEdges)).toEqual([
      { source: "step-0", target: "step-2" },
      { source: "step-2", target: "step-4" },
      { source: "step-4", target: "step-5" },
    ]);
    const empty = [{ id: "a" }, { id: "wait" }, { id: "b" }];
    const edges = [{ source: "a", target: "wait" }, { source: "wait", target: "b" }];
    expect(compoundLayoutEdges(empty, edges)).toEqual(edges);
  });
});
