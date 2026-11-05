import { describe, expect, it } from "vitest";
import { declaredWorkflowIo, type BackendWorkflowInputParameter } from "@openlab/protocol";
import {
  bindParamToEntry,
  declarationOf,
  editorIoFromDeclared,
  entryUsage,
  inferEntryKind,
  normalizeEditorIo,
  planIoSave,
  referencedEntryNames,
  sameDeclaration,
  schemaOfKind,
  suggestEntryName,
  unbindParamFromEntry,
  validateEditorIo,
  type EditorWorkflowIo,
} from "./editor-workflow-io";

const VOLUME: BackendWorkflowInputParameter = { name: "volume", schema: { type: "number" }, required: true, title: "体积" };
const SPEED: BackendWorkflowInputParameter = { name: "speed", schema: { type: "integer" }, default: 300 };
const io: EditorWorkflowIo = {
  inputs: [VOLUME, SPEED],
  outputs: [{ name: "total", title: "总量", schema: { type: "number" }, nodeId: "n2", dataKey: " result.total " }],
};

describe("画布入口参数的引用", () => {
  it("设为入口参数写顶层引用，解除时写回静态值", () => {
    const bound = bindParamToEntry('{"volume": 1, "speed": 2}', "volume", "volume");
    expect(JSON.parse(bound)).toEqual({ volume: { kind: "workflow_input", parameter: "volume" }, speed: 2 });
    expect(JSON.parse(unbindParamFromEntry(bound, "volume", 5))).toEqual({ volume: 5, speed: 2 });
    expect(() => bindParamToEntry("[1]", "x", "y")).toThrow();
  });

  it("名字建议去重、类型按 schema 与当前值推断", () => {
    expect(suggestEntryName("volume", new Set(["volume", "volume_2"]))).toBe("volume_3");
    expect(suggestEntryName("2nd-step", new Set())).toBe("p_2nd_step");
    expect(suggestEntryName("体积", new Set())).toBe("体积");
    expect(inferEntryKind(3, { type: "integer" })).toBe("integer");
    expect(inferEntryKind(1.5)).toBe("number");
    expect(inferEntryKind(true)).toBe("boolean");
    expect(inferEntryKind("A1")).toBe("string");
    expect(schemaOfKind("enum", ["fast", " slow ", "fast", ""])).toEqual({ type: "string", enum: ["fast", "slow"] });
  });

  it("使用处：节点参数与子工作流实参", () => {
    const usage = entryUsage(
      [
        { id: "n1", label: "pump/dose", paramJson: '{"volume": {"kind": "workflow_input", "parameter": "volume"}}' },
        { id: "n2", label: "bad", paramJson: "{oops" },
        { id: "g", label: "group" },
      ],
      [{ label: "子工作流 加样", names: ["volume"] }],
    );
    expect(usage.get("volume")).toEqual(["pump/dose · volume", "子工作流 加样"]);
    expect([...referencedEntryNames(['{"a": {"kind": "workflow_input", "parameter": "x"}}', "{oops", 3], ["y"])]).toEqual(["y", "x"]);
  });
});

describe("声明与校验", () => {
  it("本地校验：名字、重复、默认值类型、未声明的引用、输出来源", () => {
    const errors = validateEditorIo(
      {
        inputs: [VOLUME, { ...VOLUME }, { name: "1bad", schema: { type: "number" } }, { name: "n", schema: { type: "integer" }, default: 1.5 }],
        outputs: [{ name: "o", schema: { type: "number" }, nodeId: "gone", dataKey: "" }],
      },
      { nodeIds: new Set(["n1"]), referenced: new Set(["volume", "missing"]) },
    );
    expect(errors.join("\n")).toMatch(/重复/);
    expect(errors.join("\n")).toMatch(/1bad/);
    expect(errors.join("\n")).toMatch(/默认值不符合类型/);
    expect(errors.join("\n")).toMatch(/未声明的入口参数「missing」/);
    expect(errors.join("\n")).toMatch(/输出「o」没有选择来源节点/);
    expect(validateEditorIo(io, { nodeIds: new Set(["n2"]), referenced: new Set(["volume"]) })).toEqual([]);
  });

  it("声明：节点 id 换权威 uuid，data_key 去空白；读回时反向映射", () => {
    const declaration = declarationOf(io, (id) => (id === "n2" ? "uuid-2" : undefined));
    expect(declaration.output_bindings).toEqual({ total: { kind: "node_output", workflow_node_uuid: "uuid-2", data_key: "result.total" } });
    expect(declaration.output_contract.outputs).toEqual([{ name: "total", schema: { type: "number" }, title: "总量" }]);
    expect(declarationOf(io, () => undefined).output_contract.outputs).toEqual([]);

    const declared = declaredWorkflowIo({ meta_data: { unilab: { ...declaration } } });
    const { io: back, droppedOutputs } = editorIoFromDeclared(declared, (uuid) => (uuid === "uuid-2" ? "n2" : undefined));
    expect(droppedOutputs).toEqual([]);
    expect(back.outputs[0]).toMatchObject({ name: "total", nodeId: "n2", dataKey: "result.total" });
    expect(normalizeEditorIo(JSON.parse(JSON.stringify(back)))).toEqual(back);
    expect(normalizeEditorIo("x")).toBeNull();
  });

  it("比较时按服务端规范化口径（required 缺省 false、data_key 去空白）", () => {
    const declaration = declarationOf(io, () => "uuid-2");
    const server = declaredWorkflowIo({
      meta_data: {
        unilab: {
          input_contract: { version: 1, parameters: [{ ...VOLUME }, { ...SPEED, required: false }] },
          output_contract: { version: 1, outputs: [{ name: "total", schema: { type: "number" }, title: "总量", implicit: false }] },
          output_bindings: { total: { kind: "node_output", workflow_node_uuid: "uuid-2", data_key: "result.total" } },
        },
      },
    });
    expect(sameDeclaration(server, declaration)).toBe(true);
    expect(sameDeclaration(declaredWorkflowIo({ meta_data: {} }), declaration)).toBe(false);
  });

  it("存图前：图里有新引用才先声明并集合同（输出清空），否则直接存图", () => {
    const current = declaredWorkflowIo({ meta_data: { unilab: { input_contract: { version: 1, parameters: [{ name: "old", schema: { type: "string" } }, VOLUME] } } } });
    const desired = declarationOf(io, () => "uuid-2");
    expect(planIoSave(current, desired, new Set(["volume"])).before).toBeNull();
    const plan = planIoSave(current, desired, new Set(["volume", "speed"]));
    expect(plan.before?.input_contract.parameters.map((item) => item.name)).toEqual(["volume", "speed", "old"]);
    expect(plan.before?.output_contract.outputs).toEqual([]);
    expect(plan.before?.output_bindings).toEqual({});
  });
});
