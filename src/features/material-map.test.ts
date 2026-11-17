import { describe, expect, it } from "vitest";
import { mapSites } from "./material-map";
import { materialFixture, siteFixture } from "./material-fixture";

describe("物料位点几何", () => {
  it("按 pose 摆放位点，忽略隐藏位点，不把 T1 名称当作行坐标", () => {
    const deck = materialFixture("deck", "deck");
    deck.sites = [siteFixture("deck", "T1"), { ...siteFixture("deck", "T2"), visible: false }];
    const sites = mapSites(deck, new Map(), 400, 320);
    expect(sites).toHaveLength(1);
    expect(sites[0]).toMatchObject({ key: "deck:deck-T1", ownerName: "deck", x: 40, y: 60, w: 120, h: 80 });
  });

  it("占用者取自同一快照；没有 pose 时自动排列，尺寸不合法时回退", () => {
    const deck = materialFixture("deck", "deck");
    const plate = materialFixture("plate", "plate", "deck");
    deck.sites = [{ ...siteFixture("deck", "A1", "plate"), pose: {} }, { ...siteFixture("deck", "A2"), pose: { size: { width: Number.NaN } } }];
    const sites = mapSites(deck, new Map([["plate", plate]]), 200, 100);
    expect(sites[0].occupant?.material.material_uuid).toBe("plate");
    expect(sites[1].occupant).toBeUndefined();
    expect(sites.every((site) => Number.isFinite(site.x) && Number.isFinite(site.y) && site.w > 0 && site.h > 0)).toBe(true);
    expect(sites[1].x).toBeGreaterThan(sites[0].x);
  });
});
