import { describe, expect, it } from "vitest";
import { ApiError, type MaterialsV1Aggregate, type MaterialsV1Substance } from "@openlab/protocol";
import { materialFixture } from "./material-fixture";
import {
  aggregatePrecondition,
  dataWriteWithLink,
  describeLinkError,
  substanceLink,
  substanceReferences,
} from "./substance-chemicals";

const SUMMARY = {
  chemical_uuid: "c-water", name: "水", cas: "7732-18-5", inchi_key: null, molecular_formula: "H2O", smiles: "O",
  molecular_weight: 18.015, density_g_per_ml: 1, physical_state: "liquid" as const,
};
const substance = (name: string, extra: Partial<MaterialsV1Substance> = {}): MaterialsV1Substance => ({
  name, quantity: 1, quantity_unit: "mL", physical_state: "liquid", composition: [], meta_data: {}, ...extra,
});

function aggregate(substances: MaterialsV1Substance[]): MaterialsV1Aggregate {
  const item = materialFixture("tube-1", "tube", null);
  item.data = { ...item.data, data: { volume_ml: 5 }, substances, sites_initialized: true, unknown_counter: 2, state_status: "observed" };
  item.state_hash = "hash-1";
  return item;
}

describe("内容物关联状态", () => {
  it("有摘要 = 已关联；有 uuid 无摘要 = 化学品已删除；两键缺席 = 未关联", () => {
    expect(substanceLink(substance("溶剂", { chemical_uuid: "c-water", chemical: SUMMARY }))).toEqual({ kind: "linked", chemicalUuid: "c-water", summary: SUMMARY });
    expect(substanceLink(substance("溶剂", { chemical_uuid: "c-gone", chemical: null }))).toEqual({ kind: "deleted", chemicalUuid: "c-gone" });
    expect(substanceLink(substance("溶剂"))).toEqual({ kind: "unlinked" });
  });
});

describe("关联写入体（PUT data 整份替换）", () => {
  const current = aggregate([
    substance("水", { chemical_uuid: "c-water", chemical: SUMMARY }),
    substance("样品"),
    substance("乙醇", { chemical_uuid: "c-eth", chemical: null }),
  ]);

  it("只有改动那一份带 chemical_uuid，其余省略键、去掉只读摘要；data 等字段原样带回", () => {
    const body = dataWriteWithLink(current.data, 1, "c-new");
    expect(body.substances?.map((item) => Object.prototype.hasOwnProperty.call(item, "chemical_uuid"))).toEqual([false, true, false]);
    expect(body.substances?.[1].chemical_uuid).toBe("c-new");
    expect(body.substances?.some((item) => Object.prototype.hasOwnProperty.call(item, "chemical"))).toBe(false);
    // 权威要求 payload 等于类型化请求体的完整 dump：每个字段都显式给出
    expect(body).toMatchObject({
      data: { volume_ml: 5 }, sites_initialized: true, unknown_counter: 2, state_status: "observed",
      source_event_uuid: null, source_job_uuid: null, source_command_uuid: null,
    });
    expect(Object.keys(body).sort()).toEqual([
      "data", "observed_at_ms", "sites_initialized", "source_command_uuid", "source_event_uuid",
      "source_job_uuid", "state_status", "substances", "unknown_counter",
    ]);
    expect(body.substances?.[0]).toEqual({
      substance_uuid: null, name: "水", quantity: 1, quantity_unit: "mL", physical_state: "liquid", composition: [], meta_data: {},
    });
  });

  it("解除 = 显式 null（与省略是不同的请求）", () => {
    const body = dataWriteWithLink(current.data, 0, null);
    expect(body.substances?.[0]).toHaveProperty("chemical_uuid", null);
    expect(() => dataWriteWithLink(current.data, 3, null)).toThrow(RangeError);
  });

  it("以读到的聚合 state_hash 为前提", () => {
    expect(aggregatePrecondition(current)).toEqual({ aggregate_type: "material", aggregate_uuid: "tube-1", expected_state_hash: "hash-1" });
  });

  it("失败文案：409 冲突要刷新、409 无变化、422 化学品无效", () => {
    expect(describeLinkError(new ApiError(409, "material material tube-1 state changed"))).toMatchObject({ refresh: true });
    expect(describeLinkError(new ApiError(409, "material data is unchanged"))).toEqual({ message: "关联没有变化", refresh: false });
    expect(describeLinkError(new ApiError(422, "化学品 c-x 不存在或已删除"))?.message).toContain("不存在或已删除");
    expect(describeLinkError(new Error("x"))).toBeNull();
  });
});

describe("化学品被哪些内容物引用", () => {
  it("按 chemical_uuid 汇总物料与份量", () => {
    const a = aggregate([substance("水", { chemical_uuid: "c-water", chemical: SUMMARY }), substance("样品")]);
    const b = aggregate([substance("纯水", { chemical_uuid: "c-water", chemical: SUMMARY, quantity: 3 })]);
    b.material = { ...b.material, material_uuid: "tube-2", display_name: "二号管" };
    expect(substanceReferences([a, b], "c-water")).toEqual([
      { materialUuid: "tube-1", materialName: a.material.display_name || a.material.name, substanceName: "水", quantity: 1, unit: "mL" },
      { materialUuid: "tube-2", materialName: "二号管", substanceName: "纯水", quantity: 3, unit: "mL" },
    ]);
  });
});
