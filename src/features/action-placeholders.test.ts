import { describe, expect, it } from "vitest";
import { resourceRefLabel, resourceRefUuid, resourceRefValue } from "./action-placeholders";

const uuid = "2db3f939-f623-42a9-85b4-a06633fa6e3a";

describe("物料引用（ResourceSlot）写回形状", () => {
  it("写 uuid 与 resource_id，保留原对象其余字段；不知道 resource_id 时 id 用 uuid", () => {
    expect(resourceRefValue({ sample_id: "s", id: "old" }, { uuid, resourceId: "tips_01" })).toEqual({ sample_id: "s", id: "tips_01", uuid });
    expect(resourceRefValue(undefined, { uuid })).toEqual({ id: uuid, uuid });
    expect(resourceRefValue({ id: "x", uuid: "y" }, { uuid: "" })).toEqual({ id: "", uuid: "" });
  });

  it("显示名跳过与 uuid 相同的字段（物料 name 现在就是 uuid）", () => {
    expect(resourceRefLabel({ id: "tips_01", uuid })).toBe("tips_01");
    expect(resourceRefLabel({ name: uuid, id: uuid, uuid })).toBe("");
    expect(resourceRefLabel({ name: "flask", id: "flask_1", uuid })).toBe("flask");
    expect(resourceRefUuid({ id: "tips_01", uuid })).toBe(uuid);
  });
});
