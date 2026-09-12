import { describe, expect, it } from "vitest";
import {
  addZone,
  cellAt,
  cellKey,
  cellsBounds,
  emptyLayout,
  fromServerLayout,
  isLayoutEmpty,
  paintCell,
  parseLayout,
  rescaleLayout,
  toServerLayout,
  zoneCentroid,
  zoneOfRect,
} from "./lab-layout";

describe("lab-layout", () => {
  it("格子索引对负坐标向下取整", () => {
    expect(cellAt(150, 250, 100)).toEqual({ col: 1, row: 2 });
    expect(cellAt(-1, -1, 100)).toEqual({ col: -1, row: -1 });
    expect(cellAt(0, 0, 100)).toEqual({ col: 0, row: 0 });
  });

  it("区域格子互斥，围墙覆盖区域，橡皮擦清空", () => {
    let layout = emptyLayout(100);
    const a = addZone(layout, "样品制备");
    layout = a.layout;
    const b = addZone(layout, "分析");
    layout = b.layout;
    layout = paintCell(layout, cellKey(0, 0), { kind: "zone", zoneId: a.zone.id });
    layout = paintCell(layout, cellKey(1, 0), { kind: "zone", zoneId: a.zone.id });
    layout = paintCell(layout, cellKey(1, 0), { kind: "zone", zoneId: b.zone.id });
    expect(layout.zones[0]!.cells).toEqual(["0,0"]);
    expect(layout.zones[1]!.cells).toEqual(["1,0"]);

    layout = paintCell(layout, cellKey(0, 0), { kind: "wall" });
    expect(layout.zones[0]!.cells).toEqual([]);
    expect(layout.walls).toEqual(["0,0"]);

    layout = paintCell(layout, cellKey(0, 0), { kind: "erase" });
    expect(layout.walls).toEqual([]);
  });

  it("包围盒、重心与矩形归属", () => {
    let layout = emptyLayout(100);
    const zone = addZone(layout, "z");
    layout = zone.layout;
    for (const key of ["0,0", "1,0", "0,1", "1,1"]) layout = paintCell(layout, key, { kind: "zone", zoneId: zone.zone.id });
    expect(cellsBounds(layout.zones[0]!.cells, 100)).toEqual({ minX: 0, minY: 0, maxX: 200, maxY: 200 });
    expect(zoneCentroid(layout.zones[0]!, 100)).toEqual({ x: 100, y: 100 });
    expect(zoneOfRect(layout, { x: 20, y: 20, w: 100, h: 100 })?.name).toBe("z");
    expect(zoneOfRect(layout, { x: 500, y: 500, w: 100, h: 100 })).toBeNull();
  });

  it("改边长按格心重投影", () => {
    let layout = emptyLayout(100);
    const zone = addZone(layout, "z");
    layout = zone.layout;
    for (const key of ["0,0", "1,0", "2,0", "3,0"]) layout = paintCell(layout, key, { kind: "zone", zoneId: zone.zone.id });
    const coarse = rescaleLayout(layout, 200);
    expect(coarse.zones[0]!.cells.sort()).toEqual(["0,0", "1,0"]);
  });

  it("导入校验：丢弃非法格子键与颜色，保留可用部分", () => {
    const parsed = parseLayout({
      cellSize: 50,
      zones: [{ id: "a", name: "A", color: "red", cells: ["0,0", "bad", 3] }],
      walls: ["1,1", "x"],
    });
    expect(parsed?.cellSize).toBe(50);
    expect(parsed?.zones[0]?.cells).toEqual(["0,0"]);
    expect(parsed?.zones[0]?.color).toMatch(/^#[0-9a-f]{6}$/i);
    expect(parsed?.walls).toEqual(["1,1"]);
    expect(parseLayout({ cellSize: 0 })).toBeNull();
    expect(parseLayout("nope")).toBeNull();
  });

  it("与 lab-v1 权威文档互转：字段名 snake/camel 对应，PUT 体带上读到的 revision", () => {
    const doc = {
      layout_key: "default",
      revision: 4,
      cell_size: 50,
      zones: [{ id: "prep", name: "样品制备区", color: "#2e5bff", cells: ["0,0", "1,0"] }],
      walls: ["3,3"],
      created_at_ms: 1_700_000_000_000,
      updated_at_ms: 1_700_000_500_000,
    };
    const layout = fromServerLayout(doc);
    expect(layout).toEqual({
      version: 1,
      cellSize: 50,
      zones: [{ id: "prep", name: "样品制备区", color: "#2e5bff", cells: ["0,0", "1,0"] }],
      walls: ["3,3"],
      updatedAt: 1_700_000_500_000,
    });
    expect(isLayoutEmpty(layout)).toBe(false);
    expect(isLayoutEmpty(emptyLayout())).toBe(true);
    expect(isLayoutEmpty({ ...emptyLayout(), zones: [{ id: "z", name: "Z", color: "#000000", cells: [] }] })).toBe(true);

    const write = toServerLayout(layout, doc.revision);
    expect(write).toEqual({ revision: 4, cell_size: 50, zones: doc.zones, walls: ["3,3"] });
    // 转出去的是副本：改 write 不影响画布模型
    write.walls.push("9,9");
    expect(layout.walls).toEqual(["3,3"]);
    // 从未保存的文档：updated_at_ms 为 0 时给一个当前时间，避免显示 1970
    expect(fromServerLayout({ ...doc, revision: 0, zones: [], walls: [], updated_at_ms: 0 }).updatedAt).toBeGreaterThan(0);
  });
});
