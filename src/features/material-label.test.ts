import { describe, expect, it } from "vitest";
import { compareMaterialLabels, materialLabel, materialMatches } from "./material-label";

const uuid = "2db3f939-f623-42a9-85b4-a06633fa6e3a";

describe("物料人读标签（name = uuid）", () => {
  it("显示 display_name，不显示 name（uuid）；缺失时回退 resource_id", () => {
    expect(materialLabel({ name: uuid, material_uuid: uuid, display_name: "枪头盒 1", resource_id: "tips_01" })).toBe("枪头盒 1");
    expect(materialLabel({ name: uuid, material_uuid: uuid, display_name: "", resource_id: "tips_01" })).toBe("tips_01");
    expect(materialLabel({ name: uuid, material_uuid: uuid })).toBe(uuid);
    expect(materialLabel(null)).toBe("");
  });

  it("按标签自然序排序，孔位 A2 在 A10 前", () => {
    const wells = ["A10", "A2", "A1"].map((label, index) => ({ display_name: label, material_uuid: `u${index}`, name: `u${index}` }));
    expect([...wells].sort(compareMaterialLabels).map(materialLabel)).toEqual(["A1", "A2", "A10"]);
  });

  it("搜索按标签 / resource_id / 条码 / 类名 / uuid，不按 name", () => {
    const material = { display_name: "反应瓶", resource_id: "vial_3", class_name: "Vial", barcode: "BC-7", material_uuid: uuid, name: uuid };
    expect(materialMatches(material, "反应")).toBe(true);
    expect(materialMatches(material, "vial_3")).toBe(true);
    expect(materialMatches(material, "bc-7")).toBe(true);
    expect(materialMatches(material, uuid.slice(0, 8))).toBe(true);
    expect(materialMatches(material, "nothing")).toBe(false);
  });
});
