import { describe, expect, it } from "vitest";
import type { MaterialsV1Aggregate } from "@openlab/protocol";
import { resourceRefValue } from "./action-placeholders";
import { materialOptionsFrom } from "./material-options";

function aggregate(material: Partial<MaterialsV1Aggregate["material"]>): Pick<MaterialsV1Aggregate, "material"> {
  return { material: { resource_type: "", template_uuid: "t-container", deleted_at_ms: null, ...material } as MaterialsV1Aggregate["material"] };
}

const ITEMS = [
  aggregate({ material_uuid: "u-10", resource_id: "well-A10", display_name: "A10", resource_type: "well" }),
  aggregate({ material_uuid: "u-2", resource_id: "well-A2", display_name: "A2", resource_type: "well" }),
  aggregate({ material_uuid: "u-s", resource_id: "sample", display_name: "Sample", template_uuid: "t-sample" }),
  aggregate({ material_uuid: "u-gone", resource_id: "gone", display_name: "已删除", deleted_at_ms: 1 }),
];

describe("物料选择器选项（节点参数与入口参数同源）", () => {
  it("按显示标签自然序，标签带物料类型，值是物料 uuid；已删除的不列", () => {
    const { options, refs } = materialOptionsFrom(ITEMS);
    expect(options).toEqual([
      { label: "A2 · well", value: "u-2" },
      { label: "A10 · well", value: "u-10" },
      { label: "Sample", value: "u-s" },
    ]);
    // 写回参数的引用：{id: resource_id, uuid}
    expect(resourceRefValue({}, { uuid: "u-s", resourceId: refs.get("u-s")?.resourceId })).toEqual({ id: "sample", uuid: "u-s" });
  });

  it("Schema 的模板 allowlist 只列允许模板的物料", () => {
    expect(materialOptionsFrom(ITEMS, ["t-sample"]).options.map((option) => option.value)).toEqual(["u-s"]);
  });
});
