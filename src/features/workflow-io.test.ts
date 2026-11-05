import { describe, expect, it } from "vitest";
import { BackendBusinessError, type BackendWorkflowInputParameter, type BackendWorkflowTask } from "@openlab/protocol";
import {
  buildEntryInput,
  describeEntryInputError,
  describeEntryParameter,
  describeInputEditConflict,
  entryFieldKind,
  entryReferencesOf,
  initialEntryValues,
  parseEntryValue,
  taskDeclaredIo,
  workflowEntryParameters,
} from "./workflow-io";

const VOLUME: BackendWorkflowInputParameter = { name: "volume", title: "体积", schema: { type: "number" }, required: true };
const SPEED: BackendWorkflowInputParameter = { name: "speed", schema: { type: "integer" }, default: 300 };
const MODE: BackendWorkflowInputParameter = { name: "mode", schema: { type: "string", enum: ["fast", "slow"] } };
const DRY: BackendWorkflowInputParameter = { name: "dry", schema: { type: "boolean" } };
const WELLS: BackendWorkflowInputParameter = { name: "wells", schema: { type: "array", items: { type: "string" } } };
const NOTE: BackendWorkflowInputParameter = { name: "note", schema: { type: "string" } };
const PARAMS = [VOLUME, SPEED, MODE, DRY, WELLS, NOTE];

const business = (code: number, msg: string) => new BackendBusinessError({ code, error: { msg } });

describe("入口参数表单", () => {
  it("Schema → 控件种类：enum 优先，不认识的形状走 JSON", () => {
    expect(PARAMS.map((item) => entryFieldKind(item.schema))).toEqual(["number", "integer", "enum", "boolean", "json", "string"]);
    expect(entryFieldKind({ anyOf: [{ type: "number" }, { type: "null" }] })).toBe("json");
    expect(describeEntryParameter(VOLUME)).toBe("体积（volume） · 数字 · 必填");
    expect(describeEntryParameter(SPEED)).toBe("speed · 整数 · 默认 300");
  });

  it("初始值：已有值优先，其次默认值；JSON 存文本", () => {
    expect(initialEntryValues(PARAMS)).toEqual({ volume: null, speed: 300, mode: null, dry: null, wells: null, note: null });
    const values = initialEntryValues(PARAMS, { volume: 3, wells: ["A1"], dry: false });
    expect(values.volume).toBe(3);
    expect(values.dry).toBe(false);
    expect(JSON.parse(String(values.wells))).toEqual(["A1"]);
  });

  it("提交运行：必填缺失报错，空的可选 / 有默认值的不传", () => {
    const empty = buildEntryInput(PARAMS, initialEntryValues(PARAMS));
    expect(empty.errors).toEqual({ volume: "必填" });
    const built = buildEntryInput(PARAMS, { ...initialEntryValues(PARAMS), volume: 2.5, mode: "slow", wells: '["A1","B2"]', note: "  " });
    expect(built.errors).toEqual({});
    expect(built.input).toEqual({ volume: 2.5, speed: 300, mode: "slow", wells: ["A1", "B2"] });
  });

  it("逐项校验：整数、选项、JSON 形状", () => {
    expect(parseEntryValue(SPEED, 1.5)).toEqual({ error: "请输入整数" });
    expect(parseEntryValue(VOLUME, "abc")).toEqual({ error: "请输入数字" });
    expect(parseEntryValue(MODE, "medium")).toMatchObject({ error: expect.stringContaining("fast / slow") });
    expect(parseEntryValue(WELLS, "{}")).toEqual({ error: "应为 JSON 数组" });
    expect(parseEntryValue(WELLS, "[oops")).toEqual({ error: "不是合法 JSON" });
    expect(parseEntryValue(DRY, true)).toEqual({ value: true });
  });

  it("暂停修改：只提交与当前值不同的参数，空着视为不改", () => {
    const current = { volume: 1, speed: 300, mode: "fast" };
    const values = { ...initialEntryValues(PARAMS, current), mode: "slow", volume: null };
    const built = buildEntryInput(PARAMS, values, { baseline: current });
    expect(built.errors).toEqual({});
    expect(built.changed).toEqual(["mode"]);
    expect(built.input).toEqual({ mode: "slow" });
    expect(buildEntryInput(PARAMS, initialEntryValues(PARAMS, current), { baseline: current }).changed).toEqual([]);
  });
});

describe("入口参数的后端错误", () => {
  it("合同诊断码译成人话并指回字段", () => {
    expect(describeEntryInputError(business(1000, "参数无效：workflow_input_required（/input/volume）"), PARAMS))
      .toEqual({ field: "volume", message: "入口参数「体积（volume）」必填" });
    expect(describeEntryInputError(business(1000, "参数无效：workflow_value_invalid（/input/mode）"), PARAMS))
      .toEqual({ field: "mode", message: "入口参数「mode」的值不符合要求：应为 fast / slow 之一" });
    expect(describeEntryInputError(business(1000, "参数无效：workflow_value_invalid（/input/wells/1）"), PARAMS)?.message)
      .toContain("位置 1");
    expect(describeEntryInputError(business(1000, "参数无效：workflow_input_unknown（/input/extra）"), PARAMS))
      .toMatchObject({ field: "extra", message: expect.stringContaining("刷新") });
  });

  it("不是入口参数诊断的错误交给通用处理", () => {
    expect(describeEntryInputError(business(1000, "Site T1 匹配到 2 项"), PARAMS)).toBeNull();
    expect(describeEntryInputError(business(3003, "workflow_input_required（/input/volume）"), PARAMS)).toBeNull();
    expect(describeEntryInputError(new Error("boom"), PARAMS)).toBeNull();
  });

  it("暂停修改的 3003：冻结参数 / 不在暂停 / 状态变化", () => {
    expect(describeInputEditConflict(business(3003, "状态冲突：入口参数 'volume' 已被已下发的节点使用，不能修改")))
      .toContain("「volume」已被已下发的节点使用");
    expect(describeInputEditConflict(business(3003, "状态冲突：入口参数只能在任务暂停时修改"))).toContain("暂停");
    expect(describeInputEditConflict(business(3003, "状态冲突"))).toContain("状态已变化");
    expect(describeInputEditConflict(business(1000, "参数无效"))).toBeNull();
  });
});

describe("合同与引用的读取", () => {
  it("定义与任务快照上读合同", () => {
    const workflow = { meta_data: { unilab: { input_contract: { version: 1, parameters: [VOLUME] } } } };
    expect(workflowEntryParameters(workflow).map((item) => item.name)).toEqual(["volume"]);
    const task = { workflow_snapshot: { workflow } } as unknown as BackendWorkflowTask;
    expect(taskDeclaredIo(task).input_contract.parameters).toHaveLength(1);
    expect(taskDeclaredIo(null).input_contract.parameters).toEqual([]);
  });

  it("只认 param 顶层的引用", () => {
    const refs = entryReferencesOf({
      volume: { kind: "workflow_input", parameter: "amount" },
      nested: { inner: { kind: "workflow_input", parameter: "x" } },
      speed: 3,
    });
    expect([...refs]).toEqual([["volume", "amount"]]);
  });
});
