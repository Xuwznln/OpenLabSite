/**
 * 参数表 ↔ workflow 定义 meta_data.parameter_table 序列化/恢复单测。
 */
import { describe, expect, it } from "vitest";
import {
  buildParameterTableMeta,
  parseParameterTableMeta,
  type WorkflowVariable,
} from "./workflow-variables";

const VARIABLES: WorkflowVariable[] = [
  {
    id: "n1_temp",
    label: "temp",
    nodeId: "n1",
    path: "temp",
    type: "number",
    value: 60,
  },
  {
    id: "n1_volumes",
    label: "volumes",
    nodeId: "n1",
    path: "volumes",
    type: "list:number",
    group: "default",
    value: [1, 2, 3],
  },
];

describe("parameter_table 序列化与恢复", () => {
  it("build → parse 往返保持变量不变", () => {
    const meta = buildParameterTableMeta(VARIABLES);
    expect(meta.version).toBe(1);
    const restored = parseParameterTableMeta(
      JSON.parse(JSON.stringify(meta)),
    );
    expect(restored).toEqual(VARIABLES);
  });

  it("build 产物是深拷贝，不共享引用", () => {
    const meta = buildParameterTableMeta(VARIABLES);
    expect(meta.variables).not.toBe(VARIABLES);
    expect(meta.variables[1].value).not.toBe(VARIABLES[1].value);
    expect(meta.variables).toEqual(VARIABLES);
  });

  it("非法 meta 形状返回空数组", () => {
    expect(parseParameterTableMeta(undefined)).toEqual([]);
    expect(parseParameterTableMeta(null)).toEqual([]);
    expect(parseParameterTableMeta("x")).toEqual([]);
    expect(parseParameterTableMeta([])).toEqual([]);
    expect(parseParameterTableMeta({})).toEqual([]);
    expect(parseParameterTableMeta({ version: 1, variables: "bad" })).toEqual(
      [],
    );
  });

  it("缺关键字段的坏变量条目被丢弃，等长列表组自动对齐", () => {
    const restored = parseParameterTableMeta({
      version: 1,
      variables: [
        { id: "ok", label: "ok", nodeId: "n1", path: "p", type: "string" },
        { id: "no_node", path: "p" },
        "garbage",
      ],
    });
    expect(restored).toHaveLength(1);
    expect(restored[0].id).toBe("ok");
    expect(restored[0].value).toBe("");
  });
});
