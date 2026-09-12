import { describe, expect, it } from "vitest";
import { materialMap } from "./material-map";
import { materialFixture, siteFixture } from "./material-fixture";

describe("物料全树 → 实验室地图", () => {
  it("没有自有位点的 Slave 展开子台面和 T1–T4，仍然只有一个根设备", () => {
    const bench = materialFixture("bench");
    const deck = materialFixture("bench_deck", "deck", "bench");
    deck.sites = ["T1", "T2", "T3", "T4"].map((label) => siteFixture("bench_deck", label));
    const scene = materialMap([bench, deck]);
    expect(scene).toHaveLength(1);
    expect(scene[0].childCount).toBe(1);
    expect(scene[0].sites.map((s) => s.site.label)).toEqual(["T1", "T2", "T3", "T4"]);
    expect(scene[0].sites.every((s) => s.site.owner_material_uuid === "bench_deck")).toBe(true);
    expect(scene[0].surfaces.map((s) => s.uuid)).toEqual(["bench", "bench_deck"]);
  });

  it("按同一快照映射创建、上台、跨设备转移、卸载和删除，不残留占用者", () => {
    const a = materialFixture("a"), b = materialFixture("b");
    const deck = materialFixture("deck", "deck", "a");
    deck.sites = [siteFixture("deck", "T1")];
    b.sites = [siteFixture("b", "A1")];
    const plate = materialFixture("plate", "plate");
    const aggregates = [a, b, deck, plate];
    expect(materialMap(aggregates)).toHaveLength(3); // 初建未上台，在库根物料
    plate.material.parent_material_uuid = "deck";
    deck.sites[0].occupied_material_uuid = "plate";
    let scene = materialMap(aggregates);
    expect(scene).toHaveLength(2);
    expect(scene[0].sites[0].occupant?.material.name).toBe("plate");
    expect(scene[0].surfaces.map((s) => s.uuid)).not.toContain("plate"); // 不重复绘制占用者
    plate.material.parent_material_uuid = "b";
    deck.sites[0].occupied_material_uuid = null;
    b.sites[0].occupied_material_uuid = "plate";
    scene = materialMap(aggregates);
    expect(scene[0].sites[0].occupant).toBeUndefined();
    expect(scene[1].sites[0].occupant?.material.material_uuid).toBe("plate");
    plate.material.parent_material_uuid = null;
    b.sites[0].occupied_material_uuid = null;
    expect(materialMap(aggregates)).toHaveLength(3);
    expect(materialMap(aggregates.slice(0, -1))).toHaveLength(2);
  });

  it("保留多层局部坐标，忽略隐藏位点，不把 T1 名称当作行坐标", () => {
    const device = materialFixture("a"), frame = materialFixture("frame", "deck", "a");
    frame.position.position_x = 10;
    frame.position.rotation_z = 90;
    const deck = materialFixture("deck", "deck", "frame");
    deck.position.position_y = 20;
    deck.sites = [siteFixture("deck", "T1"), { ...siteFixture("deck", "T2"), visible: false }];
    const scene = materialMap([device, frame, deck])[0];
    expect(scene.surfaces[2].transform).toContain("translate(10 0) rotate(90) translate(0 20)");
    expect(scene.sites).toHaveLength(1);
    expect(scene.sites[0]).toMatchObject({ x: 40, y: 60, w: 120, h: 80 });
  });

  it("空集合、非有限尺寸与悬空节点不会制造假设备或非法 SVG", () => {
    expect(materialMap([])).toEqual([]);
    const device = materialFixture("a");
    device.position.size_width = Number.NaN;
    expect(materialMap([device, materialFixture("orphan", "deck", "missing")])[0].w).toBe(320);
    expect(materialMap([materialFixture("orphan", "deck", "missing")])).toEqual([]);
  });
});
