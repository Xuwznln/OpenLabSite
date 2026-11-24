import { describe, expect, it } from "vitest";
import { materialDataCount, materialDataRows, type MaterialDataRow } from "./material-data";

const brief = (rows: MaterialDataRow[]) => rows.map((row) => [row.depth, row.kind, row.label, row.text]);

describe("物料自身数据的展示行", () => {
  it("加热样品：标量逐项列出，嵌套对象缩进展开，键名与取值原样", () => {
    const data = {
      temperature_c: 65,
      target_temperature_c: 65,
      temperature_source: { device_id: "virtual-heater", property: "site_2_temperature_c" },
      serialized_state: { temperature_c: 65, state: "heating" },
    };
    expect(brief(materialDataRows(data))).toEqual([
      [0, "value", "temperature_c", "65"],
      [0, "value", "target_temperature_c", "65"],
      [0, "group", "temperature_source", "2 项"],
      [1, "value", "device_id", "virtual-heater"],
      [1, "value", "property", "site_2_temperature_c"],
      [0, "group", "serialized_state", "2 项"],
      [1, "value", "temperature_c", "65"],
      [1, "value", "state", "heating"],
    ]);
    expect(materialDataCount(data)).toBe(4);
    expect(materialDataRows(data)[3]!.path).toBe("temperature_source.device_id");
  });

  it("孔位 / 枪头：volume 等数字原样，只去浮点尾差", () => {
    const rows = materialDataRows({ thing: "A1_volume_tracker", max_volume: 360, volume: 25.000000000000004, mass: 0 });
    expect(brief(rows)).toEqual([
      [0, "value", "thing", "A1_volume_tracker"],
      [0, "value", "max_volume", "360"],
      [0, "value", "volume", "25"],
      [0, "value", "mass", "0"],
    ]);
    expect(rows.map((row) => row.tone)).toEqual(["text", "number", "number", "number"]);
  });

  it("布尔、空值、空串、空对象与空数组有可读的文本", () => {
    expect(brief(materialDataRows({ ok: true, off: false, none: null, blank: "", obj: {}, list: [] }))).toEqual([
      [0, "value", "ok", "是"],
      [0, "value", "off", "否"],
      [0, "value", "none", "—"],
      [0, "value", "blank", "（空字符串）"],
      [0, "value", "obj", "（空对象）"],
      [0, "value", "list", "（空数组）"],
    ]);
  });

  it("标量数组合成一行；对象数组逐项展开；混合数组退回 JSON", () => {
    const rows = materialDataRows({
      wells: ["A1", "B1", 3],
      readings: [{ t: 1, v: 0.5 }, { t: 2, v: 0.75 }],
      mixed: [1, { a: 1 }],
    });
    expect(brief(rows)).toEqual([
      [0, "value", "wells", "A1, B1, 3"],
      [0, "group", "readings", "数组 · 2 项"],
      [1, "group", "#1", "2 项"],
      [2, "value", "t", "1"],
      [2, "value", "v", "0.5"],
      [1, "group", "#2", "2 项"],
      [2, "value", "t", "2"],
      [2, "value", "v", "0.75"],
      [0, "json", "mixed", '[1,{"a":1}]'],
    ]);
    expect(rows[3]!.path).toBe("readings[0].t");
  });

  it("超过层级上限的部分退回紧凑 JSON；长的对象数组只展开前 20 项", () => {
    const deep = materialDataRows({ a: { b: { c: { d: { e: 1 } } } } });
    expect(brief(deep)).toEqual([
      [0, "group", "a", "1 项"],
      [1, "group", "b", "1 项"],
      [2, "group", "c", "1 项"],
      [3, "json", "d", '{"e":1}'],
    ]);
    const many = materialDataRows({ items: Array.from({ length: 23 }, (_, i) => ({ i })) });
    expect(many.filter((row) => row.depth === 1 && row.kind === "group")).toHaveLength(20);
    expect(many.at(-1)).toMatchObject({ depth: 1, text: "另有 3 项未展开" });
  });

  it("没有数据时为空；不是对象时整体一行", () => {
    expect(materialDataRows({})).toEqual([]);
    expect(materialDataRows(undefined)).toEqual([]);
    expect(materialDataCount({})).toBe(0);
    expect(brief(materialDataRows([1, 2]))).toEqual([[0, "json", "data", "[1,2]"]]);
  });
});
