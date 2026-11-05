import { describe, expect, it } from "vitest";
import { BackendBusinessError, type BackendWorkflowGraph, type BackendWorkflowNode } from "@openlab/protocol";
import {
  collectNodeInputBindings,
  compositeDataFromGraph,
  compositeEntryReferences,
  compositeLeafSteps,
  compositeWriteNodes,
  describeCompositeArgument,
  describeCompositeError,
  stripCompositeSubtrees,
  topLevelInvocations,
} from "./composite-nodes";

const INV = "a0000000-0000-4000-8000-000000000001";
const LEAF = "a0000000-0000-4000-8000-000000000002";
const NESTED = "a0000000-0000-4000-8000-000000000003";
const DEEP = "a0000000-0000-4000-8000-000000000004";
const AFTER = "a0000000-0000-4000-8000-000000000005";
const ref = (parameter: string) => ({ kind: "workflow_input", parameter });

function node(uuid: string, overrides: Partial<BackendWorkflowNode> = {}): BackendWorkflowNode {
  return {
    uuid, workflow_uuid: "wf", name: uuid.slice(-1), type: "device_action", create_time: "t", update_time: "t",
    pose: { x: 0, y: 0 }, param: {}, execution_policy: {}, disabled: false, minimized: false, meta_data: {},
    ...overrides,
  } as BackendWorkflowNode;
}

const invocation = node(INV, {
  name: "加样子流程", type: "workflow", workflow_node_template_uuid: "tpl", param: { volume: ref("amount") },
  execution_policy: { depends_on: ["old"] },
  meta_data: { unilab: { composite: { child_workflow_uuid: "child", child_workflow_revision: 3 } } },
});
const graph = {
  nodes: [
    invocation,
    node(LEAF, { name: "加样", parent_uuid: INV, action_name: "dose", param: { volume: ref("amount") }, execution_policy: { depends_on: [DEEP] },
      meta_data: { target_device_id: "pump-1", unilab: { input_bindings: { h1: { parameter: "amount" } } } } }),
    node(NESTED, { name: "内层", type: "workflow", parent_uuid: INV, meta_data: { unilab: { composite: { child_workflow_uuid: "x" } } } }),
    node(DEEP, { name: "深层", parent_uuid: NESTED, action_name: "mix", meta_data: { target_device_id: "mixer" } }),
    node(AFTER, { name: "后", execution_policy: { depends_on: [INV], always_free: true } }),
  ],
  edges: [
    { uuid: "e1", source_node_uuid: LEAF, target_node_uuid: DEEP, source_handle_uuid: "s", target_handle_uuid: "t", create_time: "", update_time: "", meta_data: {} },
    { uuid: "e2", source_node_uuid: LEAF, target_node_uuid: AFTER, source_handle_uuid: "s", target_handle_uuid: "t", create_time: "", update_time: "", meta_data: {} },
  ],
} as unknown as BackendWorkflowGraph;

describe("组合调用子树", () => {
  it("只有顶层调用成画布节点；子树含嵌套调用与内部边", () => {
    expect(topLevelInvocations(graph).map((item) => item.uuid)).toEqual([INV]);
    const data = compositeDataFromGraph(graph, INV)!;
    expect(data).toMatchObject({ uuid: INV, name: "加样子流程", childWorkflowUuid: "child", childRevision: 3 });
    expect(data.nodes.map((item) => item.uuid)).toEqual([INV, LEAF, NESTED, DEEP]);
    expect(data.edges.map((item) => item.uuid)).toEqual(["e1"]);
    // 加样依赖深层：按 depends_on 排序
    expect(compositeLeafSteps(data).map((item) => `${item.name}@${item.device}/${item.action}`)).toEqual(["深层@mixer/mix", "加样@pump-1/dose"]);
    expect([...compositeEntryReferences(data)]).toEqual(["amount"]);
    expect(compositeDataFromGraph(graph, LEAF)).toBeNull();
  });

  it("写回：调用节点换成画布的位置 / 依赖 / 禁用，展开节点原样，去掉 meta_data.unilab", () => {
    const data = compositeDataFromGraph(graph, INV)!;
    const written = compositeWriteNodes(data, { pose: { x: 5, y: 6 }, dependsOn: ["before"], disabled: false, editorNodeId: INV });
    expect(written.map((item) => item.uuid)).toEqual([INV, LEAF, NESTED, DEEP]);
    expect(written[0]).toMatchObject({
      type: "workflow", workflow_node_template_uuid: "tpl", pose: { x: 5, y: 6 },
      execution_policy: { depends_on: ["before"] }, param: { volume: ref("amount") },
      meta_data: { editor_node_id: INV },
    });
    expect(written[0].meta_data).not.toHaveProperty("unilab");
    expect(written[1]).toMatchObject({ parent_uuid: INV, action_name: "dose", meta_data: { target_device_id: "pump-1" } });
    expect(written[1].meta_data).not.toHaveProperty("unilab");
    expect(written[1]).not.toHaveProperty("create_time");
    const free = compositeWriteNodes(data, { pose: {}, dependsOn: [], disabled: true, editorNodeId: INV })[0];
    expect(free.execution_policy).toEqual({});
    expect(free.disabled).toBe(true);
  });

  it("PUT /io 的 node_input_bindings 从节点保留字段原样收集", () => {
    expect(collectNodeInputBindings(graph.nodes)).toEqual({ [LEAF]: { h1: { parameter: "amount" } } });
  });

  it("克隆时去掉调用子树，并清理指向它的依赖与边", () => {
    const { graph: stripped, removed } = stripCompositeSubtrees(graph);
    expect(removed).toEqual(["加样子流程"]);
    expect(stripped.nodes.map((item) => item.uuid)).toEqual([AFTER]);
    expect(stripped.nodes[0].execution_policy).toEqual({ depends_on: [], always_free: true });
    expect(stripped.edges).toEqual([]);
  });

  it("实参与错误的人话", () => {
    expect(describeCompositeArgument("volume", ref("amount"))).toBe("volume ← 入口参数 amount");
    expect(describeCompositeArgument("volume", 5)).toBe("volume = 5");
    const error = (code: number, msg: string) => new BackendBusinessError({ code, error: { msg } });
    expect(describeCompositeError(error(3002, "对象不存在"))).toContain("还没有发布");
    expect(describeCompositeError(error(1000, "提交内容格式不正确：composite_recursive_reference（/composite/child_workflow_uuid）")))
      .toContain("循环引用");
    expect(describeCompositeError(error(1000, "提交内容格式不正确：composite_boundary_mapping_invalid（/boundary/volume）")))
      .toContain("必填输入都要给值");
    expect(describeCompositeError(error(1000, "Site 不对"))).toBeNull();
  });
});
