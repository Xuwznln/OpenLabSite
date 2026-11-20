import { describe, expect, it } from "vitest";
import type { BackendWorkflowGraph, DeviceActionSchemaDetail } from "@openlab/protocol";
import { requireWorkflowReady, workflowReadiness } from "./workflow-readiness";

/** aliquot(source: ResourceSlot, target: ResourceSlot, solvent: dict)：solvent 没有默认值，必填。 */
const ALIQUOT: DeviceActionSchemaDetail = {
  device_id: "reactor",
  action_name: "aliquot",
  schema: {
    properties: {
      goal: {
        type: "object",
        properties: { source: { type: "object" }, target: { type: "object" }, solvent: { type: "object" } },
        required: ["source", "target", "solvent"],
      },
    },
  },
  goal_default: {},
  action_type: "UniLabJsonCommand",
  is_busy: false,
  placeholder_keys: { source: "unilabos_resources", target: "unilabos_resources" },
};

const ref = (parameter: string) => ({ kind: "workflow_input", parameter });

/** 「联合演示：托管分装与补料」从模板创建后的两个分装节点（只取 readiness 用到的字段）。 */
function graphWith(inventory: unknown[] | undefined): BackendWorkflowGraph {
  const node = (uuid: string, name: string, requirements: unknown) => ({
    uuid,
    name,
    action_name: "aliquot",
    parent_uuid: null,
    disabled: false,
    param: { source: ref("source"), target: ref("sample") },
    meta_data: { target_device_id: "reactor", ...(requirements ? { inventory_requirements: requirements } : {}) },
  });
  return {
    workflow: { uuid: "wf-1", revision: 3 },
    nodes: [
      node("n-unselected", "未选分支", inventory),
      node("n-actual", "实际分装", inventory && [{
        ...(inventory[0] as Record<string, unknown>),
        lot_uuid: { kind: "node_output", workflow_node_uuid: "n-select", data_key: "lot" },
        quantity: { kind: "node_output", workflow_node_uuid: "n-select", data_key: "quantity" },
      }]),
    ],
    edges: [],
    handle_templates: [],
  } as unknown as BackendWorkflowGraph;
}

const SCHEMAS = new Map([["reactor|aliquot", ALIQUOT]]);

describe("workflowReadiness", () => {
  it("库存需求注入的 solvent 不算待补全：页面能提交「联合演示：托管分装与补料」", () => {
    const requirement = { key: "solvent", kind: "lot", lot_uuid: "unselected-no-stock", quantity: 1000, unit: "ul" };
    const readiness = workflowReadiness(graphWith([requirement]), SCHEMAS, null);
    expect(readiness).toEqual({ missing: 0, pending: false, issues: [] });
    expect(() => requireWorkflowReady(readiness)).not.toThrow();
  });

  it("没有库存需求时 solvent 仍是必填缺项", () => {
    const readiness = workflowReadiness(graphWith(undefined), SCHEMAS, null);
    expect(readiness.missing).toBe(2);
    expect(readiness.issues.map((issue) => issue.entries.map((entry) => entry.path))).toEqual([["solvent"], ["solvent"]]);
    expect(() => requireWorkflowReady(readiness)).toThrow(/待补全 2 项/);
  });
});
