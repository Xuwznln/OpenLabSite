import { describe, expect, it } from "vitest";
import { describeLoopSpec } from "./workflow-loops";
import {
  describeStructuralNode,
  nodeTypeLabel,
  resourceScopeLabels,
  sourceOnlyFeatures,
  structuralKind,
} from "./workflow-node-kinds";

describe("工作流节点种类（源码写出的结构节点）", () => {
  it("类型名与结构节点识别", () => {
    expect(nodeTypeLabel("material_io")).toBe("人工物料");
    expect(nodeTypeLabel("condition")).toBe("条件");
    expect(nodeTypeLabel("device_action")).toBe("设备动作");
    expect(nodeTypeLabel("custom_kind")).toBe("custom_kind");
    expect(structuralKind("LOOP")).toBe("loop");
    expect(structuralKind("device_action")).toBeNull();
  });

  it("循环摘要：入口参数定轮数、条件表达式 while 与携带变量", () => {
    expect(describeLoopSpec({ mode: "for", count: 3 })).toBe("重复 ×3");
    expect(describeLoopSpec({ mode: "for", count: { kind: "workflow_input", parameter: "rounds" } })).toBe("重复 ×rounds（入口参数）");
    expect(describeLoopSpec({ mode: "for", count: 4, start: 1 })).toBe("重复 ×4（从 1 起）");
    expect(describeLoopSpec({ mode: "while", expression: { not: { lit: true } }, carry: { measured: {} } })).toBe("条件表达式为真时重复（携带 measured）");
    expect(describeLoopSpec({ mode: "while", condition: { source: "device_state", device_id: "reactor", field: "t", op: "<", value: 80 } }))
      .toBe("当 reactor.t < 80 时重复");
  });

  it("结构节点摘要：条件、人工物料、分组", () => {
    expect(describeStructuralNode({ type: "condition", param: { version: 1, expression: { lit: true } } })).toBe("条件：恒为真");
    expect(describeStructuralNode({ type: "condition", param: { version: 1, expression: { op: "eq", args: [] } } })).toBe("条件分支（表达式）");
    expect(describeStructuralNode({ type: "material_io", param: { mode: "load", mount: "deck", site: "A1", resource_template: "t" } })).toBe("装入 · deck / A1 · t");
    expect(describeStructuralNode({ type: "group", meta_data: { group_mode: "parallel" } })).toBe("并行分组");
    expect(describeStructuralNode({ type: "device_action" })).toBe("");
  });

  it("ctx.lock 作用域：节点 uuid → 作用域名与资源", () => {
    const meta = { unilab: { resource_scopes: [
      { kind: "with", scope_id: "独占", resources: ["host_node"], node_uuids: ["n1", "n2"] },
      { kind: "with", scope_id: "", resources: ["pump", "reactor"], node_uuids: ["n2"] },
    ] } };
    const labels = resourceScopeLabels(meta);
    expect(labels.get("n1")).toEqual(["独占（host_node）"]);
    expect(labels.get("n2")).toEqual(["独占（host_node）", "锁（pump、reactor）"]);
    expect(resourceScopeLabels(undefined).size).toBe(0);
  });

  it("画布不能无损编辑的写法：条件、守卫、表达式 / 携带 / 入口参数循环、步骤结果引用、ctx.lock", () => {
    expect(sourceOnlyFeatures([{ type: "device_action", param: { volume: 5 } }, { type: "loop", param: { mode: "for", count: 2 } }])).toEqual([]);
    expect(sourceOnlyFeatures([{ type: "material_io", param: { mode: "load", mount: "deck", site: "A1", resource_template: "t" } }])).toEqual([]);
    expect(sourceOnlyFeatures([
      { type: "condition", param: {} },
      { type: "device_action", execution_policy: { condition_guards: [{ node_uuid: "c", equals: true }] } },
      { type: "loop", param: { mode: "while", expression: {}, carry: { m: {} } } },
      { type: "loop", param: { mode: "for", count: { kind: "workflow_input", parameter: "n" } } },
      { type: "device_action", param: { box: { kind: "node_output", workflow_node_uuid: "x", data_key: "material" } } },
    ], [{ scope_id: "s" }])).toEqual([
      "条件分支（if）",
      "条件表达式 while 循环",
      "跨轮携带变量的循环",
      "按入口参数定轮数的循环",
      "引用上游步骤结果的参数",
      "资源锁 ctx.lock",
    ]);
  });
});
