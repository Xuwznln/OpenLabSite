import { describe, expect, it } from "vitest";
import type { MaterialsV1Aggregate, MaterialsV1Tree } from "@openlab/protocol";
import { assemblyFromMaterials, findAssemblyNode } from "./material-assembly";
import { materialFixture, siteFixture } from "./material-fixture";

const tree = (nodes: MaterialsV1Aggregate[]): MaterialsV1Tree => ({
  root_material_uuid: nodes[0].material.material_uuid, nodes, snapshot_sequence: 1, client_ref_map: {}, state_hash: "tree",
});

describe("物料装配投影", () => {
  it("设备下的空台面保留 T1 位点及真实 pose，不按标签猜行列", () => {
    const bench = materialFixture("bench"), deck = materialFixture("deck", "deck", "bench");
    deck.sites = [siteFixture("deck", "T1")];
    const node = assemblyFromMaterials(tree([bench, deck])).root.children[0];
    expect(node.emptySites[0]).toMatchObject({ x: 40, y: 60, w: 120, h: 80 });
    expect(node.geometry).toMatchObject({ w: 400, d: 320, h: 10 });
  });

  it("设备→台面→板→孔完整保留；move 的位点关系优先于滞后的位置快照", () => {
    const bench = materialFixture("bench"), deck = materialFixture("deck", "deck", "bench");
    const plate = materialFixture("plate", "plate", "deck"), well = materialFixture("well", "well", "plate");
    deck.sites = [siteFixture("deck", "T2", "plate")];
    well.data.substances = [{ name: "Water", quantity: 40, quantity_unit: "ml", physical_state: "liquid", composition: [], meta_data: {} }];
    const assembly = assemblyFromMaterials(tree([bench, deck, plate, well]));
    expect(assembly.root.children[0].emptySites).toHaveLength(0);
    expect(findAssemblyNode(assembly.root, "plate")).toMatchObject({ slot_id: "T2", geometry: { x: 40, y: 60 } });
    expect(findAssemblyNode(assembly.root, "well")?.content).toMatchObject({ substance: "Water", volume_ml: 40 });
    expect(findAssemblyNode(assembly.root, "deleted")).toBeUndefined();
  });

  it("重新生成树后同 UUID 的选中项取最新内容，删除后不残留旧对象", () => {
    const bench = materialFixture("bench"), deck = materialFixture("deck", "deck", "bench");
    const first = assemblyFromMaterials(tree([bench, deck]));
    deck.material.display_name = "更新后的台面";
    const next = assemblyFromMaterials(tree([bench, deck]));
    expect(findAssemblyNode(first.root, "deck")?.template_name).toBe("deck");
    expect(findAssemblyNode(next.root, "deck")?.template_name).toBe("更新后的台面");
    expect(findAssemblyNode(assemblyFromMaterials(tree([bench])).root, "deck")).toBeUndefined();
  });

  it("缺根、环形数据明确报错，不无限递归", () => {
    expect(() => assemblyFromMaterials({ ...tree([materialFixture("bench")]), nodes: [] })).toThrow("缺少根物料");
    expect(() => assemblyFromMaterials(tree([materialFixture("a", "deck", "b"), materialFixture("b", "deck", "a")]))).toThrow("存在环");
  });
});
