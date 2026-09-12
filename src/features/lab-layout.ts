/**
 * 实验室布局（区域 / 围墙）——像素格模型。
 *
 * 设备位置是物料权威的事实（materials.v1 position），布局只是叠在其上的
 * 人工标注：把地图按固定边长切成格子，格子归属某个区域或标记为围墙。
 * 权威存放在微后端 runtime.db（lab-v1 域 `GET/PUT /api/v1/lab/layout`，一个 Host 一份，
 * revision 乐观锁）。JSON 导出 / 导入保留用于跨 Host 搬运，不在浏览器建立第二份权威。
 *
 * 坐标系与地图一致（物料权威的 position 单位）；格子键为 `"col,row"`，
 * 允许负数，格子左上角 = (col * cellSize, row * cellSize)。
 */
import type { LabV1Layout, LabV1LayoutWrite } from "@openlab/protocol";

export interface LabZone {
  id: string;
  name: string;
  /** 十六进制颜色，如 #2e5bff。 */
  color: string;
  /** 格子键集合（去重、无序）。 */
  cells: string[];
}

export interface LabLayout {
  version: 1;
  /** 格子边长（与地图坐标同单位）。 */
  cellSize: number;
  zones: LabZone[];
  /** 围墙格子键。 */
  walls: string[];
  updatedAt: number;
}

export const DEFAULT_CELL_SIZE = 100;
export const CELL_SIZE_OPTIONS = [50, 100, 200, 500];

/** 区域配色轮转：新建区域时依次取用。 */
export const ZONE_PALETTE = ["#2e5bff", "#0e9f6e", "#d97706", "#7c3aed", "#db2777", "#0891b2", "#65a30d", "#dc2626"];

export function emptyLayout(cellSize = DEFAULT_CELL_SIZE): LabLayout {
  return { version: 1, cellSize, zones: [], walls: [], updatedAt: Date.now() };
}

export function cellKey(col: number, row: number): string {
  return `${col},${row}`;
}

export function parseCellKey(key: string): { col: number; row: number } | null {
  const [colText, rowText] = key.split(",");
  const col = Number(colText);
  const row = Number(rowText);
  return Number.isInteger(col) && Number.isInteger(row) ? { col, row } : null;
}

/** 地图坐标 → 格子索引（向下取整，负坐标同样正确）。 */
export function cellAt(x: number, y: number, cellSize: number): { col: number; row: number } {
  return { col: Math.floor(x / cellSize), row: Math.floor(y / cellSize) };
}

export interface CellRect {
  key: string;
  col: number;
  row: number;
  x: number;
  y: number;
  size: number;
}

export function cellRect(key: string, cellSize: number): CellRect | null {
  const parsed = parseCellKey(key);
  if (!parsed) return null;
  return { key, col: parsed.col, row: parsed.row, x: parsed.col * cellSize, y: parsed.row * cellSize, size: cellSize };
}

/** 一组格子的包围盒（地图坐标）；空集合返回 null。 */
export function cellsBounds(keys: readonly string[], cellSize: number): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minCol = Infinity;
  let minRow = Infinity;
  let maxCol = -Infinity;
  let maxRow = -Infinity;
  for (const key of keys) {
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    minCol = Math.min(minCol, parsed.col);
    minRow = Math.min(minRow, parsed.row);
    maxCol = Math.max(maxCol, parsed.col);
    maxRow = Math.max(maxRow, parsed.row);
  }
  if (!Number.isFinite(minCol)) return null;
  return { minX: minCol * cellSize, minY: minRow * cellSize, maxX: (maxCol + 1) * cellSize, maxY: (maxRow + 1) * cellSize };
}

/** 区域标签落点：格子重心（不一定落在区域内部，但对矩形/近似矩形足够）。 */
export function zoneCentroid(zone: LabZone, cellSize: number): { x: number; y: number } | null {
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (const key of zone.cells) {
    const parsed = parseCellKey(key);
    if (!parsed) continue;
    sumX += (parsed.col + 0.5) * cellSize;
    sumY += (parsed.row + 0.5) * cellSize;
    count += 1;
  }
  return count ? { x: sumX / count, y: sumY / count } : null;
}

export type PaintTool = { kind: "zone"; zoneId: string } | { kind: "wall" } | { kind: "erase" };

/** 在格子上落笔：区域格子互斥（一个格子只属于一个区域），围墙与区域互斥。返回新布局（不可变）。 */
export function paintCell(layout: LabLayout, key: string, tool: PaintTool): LabLayout {
  const zones = layout.zones.map((zone) => ({ ...zone, cells: zone.cells.filter((cell) => cell !== key) }));
  let walls = layout.walls.filter((cell) => cell !== key);
  if (tool.kind === "zone") {
    const target = zones.find((zone) => zone.id === tool.zoneId);
    if (target) target.cells = [...target.cells, key];
  } else if (tool.kind === "wall") {
    walls = [...walls, key];
  }
  return { ...layout, zones, walls, updatedAt: Date.now() };
}

export function addZone(layout: LabLayout, name: string): { layout: LabLayout; zone: LabZone } {
  const zone: LabZone = {
    id: `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || `区域 ${layout.zones.length + 1}`,
    color: ZONE_PALETTE[layout.zones.length % ZONE_PALETTE.length]!,
    cells: [],
  };
  return { layout: { ...layout, zones: [...layout.zones, zone], updatedAt: Date.now() }, zone };
}

export function removeZone(layout: LabLayout, zoneId: string): LabLayout {
  return { ...layout, zones: layout.zones.filter((zone) => zone.id !== zoneId), updatedAt: Date.now() };
}

export function renameZone(layout: LabLayout, zoneId: string, name: string): LabLayout {
  return {
    ...layout,
    zones: layout.zones.map((zone) => (zone.id === zoneId ? { ...zone, name: name.trim() || zone.name } : zone)),
    updatedAt: Date.now(),
  };
}

/** 改格子边长：按格子中心重投影到新网格（粗→细会稀疏，细→粗会合并）。 */
export function rescaleLayout(layout: LabLayout, cellSize: number): LabLayout {
  if (cellSize === layout.cellSize) return layout;
  const remap = (keys: readonly string[]): string[] => {
    const out = new Set<string>();
    for (const key of keys) {
      const parsed = parseCellKey(key);
      if (!parsed) continue;
      const centerX = (parsed.col + 0.5) * layout.cellSize;
      const centerY = (parsed.row + 0.5) * layout.cellSize;
      const cell = cellAt(centerX, centerY, cellSize);
      out.add(cellKey(cell.col, cell.row));
    }
    return [...out];
  };
  return {
    ...layout,
    cellSize,
    zones: layout.zones.map((zone) => ({ ...zone, cells: remap(zone.cells) })),
    walls: remap(layout.walls),
    updatedAt: Date.now(),
  };
}

/** 一个矩形（如设备块）的中心落在哪个区域。 */
export function zoneOfRect(
  layout: LabLayout,
  rect: { x: number; y: number; w: number; h: number },
): LabZone | null {
  const center = cellAt(rect.x + rect.w / 2, rect.y + rect.h / 2, layout.cellSize);
  const key = cellKey(center.col, center.row);
  return layout.zones.find((zone) => zone.cells.includes(key)) ?? null;
}

/** 校验导入的 JSON；非法返回 null。 */
export function parseLayout(raw: unknown): LabLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;
  const cellSize = Number(record.cellSize);
  if (!Number.isFinite(cellSize) || cellSize <= 0) return null;
  const validKeys = (value: unknown): string[] =>
    Array.isArray(value) ? [...new Set(value.filter((item): item is string => typeof item === "string" && parseCellKey(item) !== null))] : [];
  const zones: LabZone[] = Array.isArray(record.zones)
    ? record.zones
        .map((item, index) => {
          const zone = item as Record<string, unknown>;
          if (!zone || typeof zone !== "object") return null;
          return {
            id: typeof zone.id === "string" && zone.id ? zone.id : `zone-import-${index}`,
            name: typeof zone.name === "string" && zone.name.trim() ? zone.name : `区域 ${index + 1}`,
            color: typeof zone.color === "string" && /^#[0-9a-f]{6}$/i.test(zone.color) ? zone.color : ZONE_PALETTE[index % ZONE_PALETTE.length]!,
            cells: validKeys(zone.cells),
          };
        })
        .filter((zone): zone is LabZone => zone !== null)
    : [];
  return {
    version: 1,
    cellSize,
    zones,
    walls: validKeys(record.walls),
    updatedAt: typeof record.updatedAt === "number" ? record.updatedAt : Date.now(),
  };
}

export function isLayoutEmpty(layout: LabLayout): boolean {
  return layout.walls.length === 0 && layout.zones.every((zone) => zone.cells.length === 0);
}

// ── 与 lab-v1 权威文档互转 ──

/** 权威文档 → 画布模型（snake_case → camelCase；`updated_at_ms` 0 = 从未保存）。 */
export function fromServerLayout(doc: LabV1Layout): LabLayout {
  return {
    version: 1,
    cellSize: doc.cell_size,
    zones: doc.zones.map((zone) => ({ id: zone.id, name: zone.name, color: zone.color, cells: [...zone.cells] })),
    walls: [...doc.walls],
    updatedAt: doc.updated_at_ms || Date.now(),
  };
}

/** 画布模型 → PUT 请求体；`revision` 是读到的权威版本，服务端据此做乐观锁。 */
export function toServerLayout(layout: LabLayout, revision: number): LabV1LayoutWrite {
  return {
    revision,
    cell_size: layout.cellSize,
    zones: layout.zones.map((zone) => ({ id: zone.id, name: zone.name, color: zone.color, cells: [...zone.cells] })),
    walls: [...layout.walls],
  };
}

/** 面积：格子数 × 边长²；单位按物料权威约定为 mm 时换算成 m²。 */
export function zoneArea(zone: LabZone, cellSize: number): { cells: number; squareMeters: number } {
  const cells = zone.cells.length;
  return { cells, squareMeters: (cells * cellSize * cellSize) / 1_000_000 };
}
