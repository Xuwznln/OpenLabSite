import { describe, expect, it } from "vitest";
import type { DeviceActionSchemaDetail } from "@openlab/protocol";
import {
  detectCycleNodes,
  dryRunWorkflow,
  mappedPathsByTarget,
  outputKeysFromSchema,
  type DryRunEdgeInput,
  type DryRunNodeInput,
} from "./graph-dry-run";

function node(id: string, extra: Partial<DryRunNodeInput> = {}): DryRunNodeInput {
  return {
    id,
    type: "action",
    deviceId: "dev-1",
    actionName: `act-${id}`,
    paramJson: JSON.stringify({ speed: 100 }),
    requirementsJson: "[]",
    ...extra,
  };
}

function edge(
  id: string,
  source: string,
  target: string,
  mappings: DryRunEdgeInput["mappings"] = [],
): DryRunEdgeInput {
  return { id, source, target, mappings };
}

const NO_SCHEMAS = new Map<string, DeviceActionSchemaDetail | null>();

function sourceSchemaWith(outputs: string[]): DeviceActionSchemaDetail {
  return {
    device_id: "dev-1",
    action_name: "act-a",
    schema: {
      properties: {
        goal: { type: "object", properties: {} },
        result: {
          type: "object",
          properties: Object.fromEntries(outputs.map((key) => [key, {}])),
        },
      },
    },
    goal_default: null,
    action_type: "goal",
    is_busy: false,
  };
}

describe("detectCycleNodes", () => {
  it("无环返回空；有环列出环上节点", () => {
    const nodes = [{ id: "a" }, { id: "b" }, { id: "c" }];
    expect(
      detectCycleNodes(nodes, [
        { source: "a", target: "b" },
        { source: "b", target: "c" },
      ]),
    ).toEqual([]);
    const cycle = detectCycleNodes(nodes, [
      { source: "a", target: "b" },
      { source: "b", target: "c" },
      { source: "c", target: "a" },
    ]);
    expect(cycle.sort()).toEqual(["a", "b", "c"]);
  });
});

describe("mappedPathsByTarget", () => {
  it("取 targetKey 最后一段作为写入路径", () => {
    const map = mappedPathsByTarget([
      edge("e1", "a", "b", [
        { sourceKey: "result", targetKey: "volume_ml" },
        { sourceKey: "result", targetKey: "data@@@vessel.id" },
      ]),
    ]);
    expect(map.get("b")).toEqual(["volume_ml", "vessel.id"]);
  });
});

describe("outputKeysFromSchema", () => {
  it("合并 handles.output data_key 与 result 属性名；schema 缺失返回 null", () => {
    const detail = sourceSchemaWith(["yield_mg"]);
    detail.handles = { output: [{ data_key: "purity", label: "纯度" }] };
    expect([...outputKeysFromSchema(detail)!].sort()).toEqual([
      "purity",
      "yield_mg",
    ]);
    expect(outputKeysFromSchema(null)).toBeNull();
  });
});

describe("dryRunWorkflow", () => {
  it("环检测计 error 并可定位节点", () => {
    const report = dryRunWorkflow({
      nodes: [node("a"), node("b")],
      edges: [edge("e1", "a", "b"), edge("e2", "b", "a")],
      schemas: NO_SCHEMAS,
      lots: [],
    });
    const cycle = report.issues.filter((issue) => issue.kind === "cycle");
    expect(cycle).toHaveLength(1);
    expect(cycle[0].level).toBe("error");
    expect(cycle[0].nodeId).toBeTruthy();
    expect(report.errorCount).toBeGreaterThan(0);
  });

  it("孤立节点计 warning（单节点画布不算孤立）", () => {
    const single = dryRunWorkflow({
      nodes: [node("a")],
      edges: [],
      schemas: NO_SCHEMAS,
      lots: [],
    });
    expect(single.issues.filter((issue) => issue.kind === "isolated")).toEqual([]);

    const report = dryRunWorkflow({
      nodes: [node("a"), node("b"), node("c")],
      edges: [edge("e1", "a", "b")],
      schemas: NO_SCHEMAS,
      lots: [],
    });
    const isolated = report.issues.filter((issue) => issue.kind === "isolated");
    expect(isolated).toHaveLength(1);
    expect(isolated[0]).toMatchObject({ level: "warning", nodeId: "c" });
  });

  it("未填参数逐项列出为 error（与徽标口径同源）", () => {
    const report = dryRunWorkflow({
      nodes: [node("a", { paramJson: JSON.stringify({ volume_ml: "", speed: 1 }) })],
      edges: [],
      schemas: NO_SCHEMAS,
      lots: [],
    });
    const missing = report.issues.filter((issue) => issue.kind === "missing-param");
    expect(missing).toHaveLength(1);
    expect(missing[0]).toMatchObject({ level: "error", nodeId: "a" });
    expect(missing[0].message).toContain("volume_ml");
  });

  it("映射校验：空段/来源节点缺失为 error，上游输出找不到字段为 warning", () => {
    const schemas = new Map<string, DeviceActionSchemaDetail | null>([
      ["dev-1|act-a", sourceSchemaWith(["yield_mg"])],
    ]);
    const report = dryRunWorkflow({
      nodes: [node("a"), node("b")],
      edges: [
        edge("e1", "a", "b", [
          { sourceKey: "yield_mg", targetKey: "volume_ml" }, // 合法
          { sourceKey: "unknown_key", targetKey: "volume_ml" }, // warning
          { sourceKey: "return_value", targetKey: "volume_ml" }, // 包装名也 warning
          { sourceKey: "yield_mg", targetKey: "data@@@@@@x" }, // 空段 error
          { sourceKey: "", targetKey: "volume_ml" }, // 空源 error
        ]),
        edge("e2", "ghost", "b", [{ sourceKey: "result", targetKey: "y" }]), // 来源节点不存在
      ],
      schemas,
      lots: [],
    });
    const mapping = report.issues.filter((issue) => issue.kind === "mapping");
    expect(mapping.filter((issue) => issue.level === "error")).toHaveLength(3);
    const warnings = mapping.filter((issue) => issue.level === "warning");
    expect(warnings).toHaveLength(2);
    expect(warnings[0].message).toContain("unknown_key");
    // 取值根是上游返回值本身，return_value / result 等包装名不再视为可信
    expect(warnings[1].message).toContain("return_value");
  });

  it("物料粗检：模板查不到为 warning，全图累计不足为 error，列表不可用记 notes", () => {
    const requirementsJson = JSON.stringify([
      { template_id: "reagent-naoh", quantity: 500, unit: "g" },
      { template_id: "reagent-missing", quantity: 1, unit: "g" },
    ]);
    const report = dryRunWorkflow({
      nodes: [node("a", { requirementsJson })],
      edges: [],
      schemas: NO_SCHEMAS,
      lots: [
        { template_id: "reagent-naoh", quantity_available: 200, unit: "g" },
        { template_id: "reagent-naoh", quantity_available: 100, unit: "g" },
      ],
    });
    const material = report.issues.filter((issue) => issue.kind === "material");
    expect(material).toHaveLength(2);
    const missing = material.find((issue) => issue.message.includes("reagent-missing"));
    expect(missing?.level).toBe("warning");
    const short = material.find((issue) => issue.message.includes("累计需求"));
    expect(short?.level).toBe("error");
    expect(short?.message).toContain("缺 200g");

    const unavailable = dryRunWorkflow({
      nodes: [node("a", { requirementsJson })],
      edges: [],
      schemas: NO_SCHEMAS,
      lots: null,
    });
    expect(unavailable.issues.filter((issue) => issue.kind === "material")).toEqual([]);
    expect(unavailable.notes).toHaveLength(1);
    expect(unavailable.deductions.map((row) => row.status)).toEqual(["unknown", "unknown"]);
  });

  it("扣减台账：跨节点累加、排除隔离/过期批次、单位不一致单独标记", () => {
    const naoh = (quantity: number) => JSON.stringify([{ template_id: "reagent-naoh", quantity, unit: "g" }]);
    const report = dryRunWorkflow({
      nodes: [node("a", { requirementsJson: naoh(120) }), node("b", { requirementsJson: naoh(100) })],
      edges: [edge("e1", "a", "b", [])],
      schemas: NO_SCHEMAS,
      nowMs: 1_000_000,
      lots: [
        { template_id: "reagent-naoh", quantity_available: 150, unit: "g", template_name: "氢氧化钠" },
        { template_id: "reagent-naoh", quantity_available: 100, unit: "g", quarantined: true },
        { template_id: "reagent-naoh", quantity_available: 100, unit: "g", expiry_at_ms: 999_999 },
        { template_id: "reagent-naoh", quantity_available: 90, unit: "g", expiry_at_ms: 2_000_000 },
      ],
    });
    expect(report.deductions).toHaveLength(1);
    const row = report.deductions[0]!;
    expect(row.template_name).toBe("氢氧化钠");
    expect(row.required).toBe(220);
    expect(row.available).toBe(240);
    expect(row.remaining).toBe(20);
    expect(row.lotCount).toBe(2);
    expect(row.excludedLots).toBe(2);
    expect(row.status).toBe("ok");
    expect(row.nodes).toEqual(["act-a", "act-b"]);
    expect(report.errorCount).toBe(0);

    const mismatch = dryRunWorkflow({
      nodes: [node("a", { requirementsJson: naoh(10) })],
      edges: [],
      schemas: NO_SCHEMAS,
      lots: [{ template_id: "reagent-naoh", quantity_available: 50, unit: "mL" }],
    });
    expect(mismatch.deductions[0]?.status).toBe("unit-mismatch");
  });

  it("空位节点计 error；全部通过时零 error 零 warning", () => {
    const slot = dryRunWorkflow({
      nodes: [node("s1", { type: "slot" })],
      edges: [],
      schemas: NO_SCHEMAS,
      lots: [],
    });
    expect(slot.errorCount).toBe(1);

    const pass = dryRunWorkflow({
      nodes: [node("a"), node("b")],
      edges: [edge("e1", "a", "b", [{ sourceKey: "result", targetKey: "speed" }])],
      schemas: NO_SCHEMAS,
      lots: [],
    });
    expect(pass.errorCount).toBe(0);
    expect(pass.warningCount).toBe(0);
  });
});
