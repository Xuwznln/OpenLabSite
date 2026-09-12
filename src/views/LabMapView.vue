<script setup lang="ts">
/**
 * 实验室地图：以 materials.v1 权威中的根物料（设备 / 台面）位置与位点占用
 * 绘制 2D 俯视图。没有独立的布局 API——位置就是物料的 position 字段。
 *
 * - 有坐标的根物料按 position_x/y 与 size 摆放，单位与权威一致；
 * - 没有坐标的根物料自动排成网格，避免漏画；
 * - 位点按 pose.position / pose.size 画在设备内部，占用者高亮；
 * - 点击设备进入 2.5D 装配视图；
 * - 「编辑布局」：按像素格给实验室划分区域、画围墙（features/lab-layout），
 *   叠在设备之下；布局权威在微后端 runtime.db（lab-v1，revision 乐观锁），
 *   老微后端降级到浏览器；可导出 / 导入 JSON 跨 Host 搬运。
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { NButton, NEmpty, NIcon, NInput, NPopconfirm, NSelect, NSwitch, NTag, useMessage } from "naive-ui";
import { CubeOutline, RefreshOutline } from "@vicons/ionicons5";
import type { MaterialsV1Aggregate, MaterialsV1Site } from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import {
  addZone,
  CELL_SIZE_OPTIONS,
  cellAt,
  cellKey,
  cellRect,
  cellsBounds,
  clearLocalLayout,
  emptyLayout,
  fromServerLayout,
  isLayoutEmpty,
  loadLocalLayout,
  paintCell,
  parseLayout,
  removeZone,
  renameZone,
  rescaleLayout,
  saveLocalLayout,
  toServerLayout,
  zoneArea,
  zoneCentroid,
  zoneOfRect,
  type LabLayout,
  type PaintTool,
} from "../features/lab-layout";
import { ApiError } from "@openlab/protocol";
import { describeError } from "../features/errors";
import { useConnectionStore } from "../stores/connection";
import { useDevicesStore } from "../stores/devices";
import { useDomainThemeStore } from "../stores/domain-theme";

const router = useRouter();
const conn = useConnectionStore();
const devices = useDevicesStore();
const domain = useDomainThemeStore();
const message = useMessage();

const showLabels = ref(true);
const hoverKey = ref("");
const selectedUuid = ref("");

interface MapSite {
  key: string;
  site: MaterialsV1Site;
  x: number;
  y: number;
  w: number;
  h: number;
  occupant?: MaterialsV1Aggregate;
}

interface MapBlock {
  uuid: string;
  id: string;
  name: string;
  className: string;
  kind: "device" | "deck" | "material";
  online: boolean;
  busy: boolean;
  x: number;
  y: number;
  w: number;
  h: number;
  placed: boolean;
  sites: MapSite[];
  childCount: number;
}

const roots = computed(() => devices.roots);
const byUuid = computed(() => new Map(devices.roots.map((item) => [item.material.material_uuid, item])));

function num(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function poseValue(pose: Record<string, unknown>, group: string, axis: string): number | undefined {
  const inner = pose[group];
  if (inner && typeof inner === "object") {
    const value = (inner as Record<string, unknown>)[axis];
    if (typeof value === "number") return value;
  }
  return undefined;
}

const DEFAULT_W = 320;
const DEFAULT_H = 240;
const GAP = 40;

const blocks = computed<MapBlock[]>(() => {
  const list = roots.value.filter((item) => item.material.resource_type !== "well");
  const placed: MapBlock[] = [];
  const unplaced: MapBlock[] = [];
  for (const item of list) {
    const record = devices.byId(item.material.resource_id);
    const position = item.position;
    const w = Math.max(60, num(position.size_width, DEFAULT_W) || DEFAULT_W);
    const h = Math.max(60, num(position.size_height, DEFAULT_H) || DEFAULT_H);
    const hasPosition = typeof position.position_x === "number" && typeof position.position_y === "number";
    const sites: MapSite[] = item.sites.map((site, index) => {
      const pose = site.pose ?? {};
      const sw = poseValue(pose, "size", "width") ?? Math.min(w, 80) * 0.8;
      const sh = poseValue(pose, "size", "height") ?? Math.min(h, 80) * 0.8;
      const cols = Math.max(1, Math.floor(w / (sw + 10)));
      const fallbackX = 10 + (index % cols) * (sw + 10);
      const fallbackY = 10 + Math.floor(index / cols) * (sh + 10);
      const occupant = site.occupied_material_uuid ? byUuid.value.get(site.occupied_material_uuid) : undefined;
      return {
        key: site.site_uuid,
        site,
        x: poseValue(pose, "position", "x") ?? fallbackX,
        y: poseValue(pose, "position", "y") ?? fallbackY,
        w: sw,
        h: sh,
        occupant: occupant ?? (site.occupied_material_uuid ? findOccupant(site.occupied_material_uuid) : undefined),
      };
    });
    const block: MapBlock = {
      uuid: item.material.material_uuid,
      id: item.material.resource_id,
      name: item.material.display_name || item.material.name,
      className: item.material.class_name,
      kind: item.material.resource_type === "device" ? "device" : item.material.resource_type === "deck" ? "deck" : "material",
      online: record?.online ?? false,
      busy: (record?.busyActions ?? 0) > 0,
      x: hasPosition ? (position.position_x as number) : 0,
      y: hasPosition ? (position.position_y as number) : 0,
      w,
      h,
      placed: hasPosition,
      sites,
      childCount: devices.roots.filter((child) => child.material.parent_material_uuid === item.material.material_uuid).length,
    };
    (hasPosition ? placed : unplaced).push(block);
  }
  // 未定位的根物料排在已定位区域下方的网格里。
  const bottom = placed.reduce((max, block) => Math.max(max, block.y + block.h), 0);
  const maxRowWidth = Math.max(1000, placed.reduce((max, block) => Math.max(max, block.x + block.w), 0));
  let cursorX = 0;
  let cursorY = bottom ? bottom + GAP * 2 : 0;
  let rowH = 0;
  for (const block of unplaced) {
    if (cursorX + block.w > maxRowWidth && cursorX > 0) {
      cursorX = 0;
      cursorY += rowH + GAP;
      rowH = 0;
    }
    block.x = cursorX;
    block.y = cursorY;
    cursorX += block.w + GAP;
    rowH = Math.max(rowH, block.h);
  }
  return [...placed, ...unplaced];
});

const allAggregates = shallowRef<MaterialsV1Aggregate[]>([]);

function findOccupant(uuid: string): MaterialsV1Aggregate | undefined {
  return allAggregates.value.find((item) => item.material.material_uuid === uuid);
}

// ── 布局（区域 / 围墙）编辑 ────────────────────────────────────
//
// 权威在微后端 runtime.db（lab-v1），一个 Host 一份、所有浏览器共享；这里保存的是
// 当前读到的 revision，写回带上它做乐观锁。老微后端没有该接口时退回 localStorage。

const layoutScope = computed(() => conn.baseUrl);
const layout = ref<LabLayout>(emptyLayout());
const layoutRevision = ref(0);
/** server = 权威在微后端；local = 老微后端（404/503）降级到浏览器；loading = 尚未读到。 */
const layoutBacking = ref<"loading" | "server" | "local">("loading");
const layoutSaving = ref(false);
const layoutSyncedAt = ref(0);
const editing = ref(false);
const tool = ref<PaintTool>({ kind: "wall" });
const newZoneName = ref("");
const hoverCell = ref("");
let painting = false;
let touchedThisStroke = new Set<string>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingSave: LabLayout | null = null;

async function loadServerLayout() {
  if (!conn.online) return;
  const scope = layoutScope.value;
  try {
    const doc = await conn.api.domains.labV1.layout();
    if (scope !== layoutScope.value) return;
    const legacy = loadLocalLayout(scope);
    if (doc.revision === 0 && legacy && !isLayoutEmpty(legacy)) {
      // 旧版本把布局留在浏览器里：一次性搬到微后端，之后所有人共享
      const migrated = await conn.api.domains.labV1.saveLayout(toServerLayout(legacy, 0));
      clearLocalLayout(scope);
      applyServerLayout(migrated);
      message.success("已把本浏览器里的布局同步到微后端，现在所有连接这台 Host 的人都能看到");
      return;
    }
    applyServerLayout(doc);
    if (legacy) clearLocalLayout(scope);
  } catch (error) {
    if (error instanceof ApiError && error.isUnsupported) {
      layoutBacking.value = "local";
      layout.value = loadLocalLayout(scope) ?? emptyLayout();
      return;
    }
    if (layoutBacking.value === "loading") layoutBacking.value = "server";
    message.error(`读取实验室布局失败：${describeError(error)}`);
  }
}

function applyServerLayout(doc: Awaited<ReturnType<typeof conn.api.domains.labV1.layout>>) {
  layout.value = fromServerLayout(doc);
  layoutRevision.value = doc.revision;
  layoutBacking.value = "server";
  layoutSyncedAt.value = Date.now();
}

async function flushLayoutSave() {
  saveTimer = null;
  const next = pendingSave;
  pendingSave = null;
  if (!next || layoutBacking.value !== "server" || !conn.online) return;
  layoutSaving.value = true;
  try {
    const saved = await conn.api.domains.labV1.saveLayout(toServerLayout(next, layoutRevision.value));
    layoutRevision.value = saved.revision;
    layoutSyncedAt.value = Date.now();
    // 保存期间又有新改动：紧接着再存一轮
    if (pendingSave) scheduleLayoutSave();
  } catch (error) {
    if (error instanceof ApiError && error.status === 409) {
      message.warning("布局刚被其他人修改，已刷新为服务端版本；你的这一笔改动请重新绘制");
      pendingSave = null;
      await loadServerLayout();
    } else {
      message.error(`布局保存失败：${describeError(error)}（改动仍在页面上，下一次绘制会重试）`);
      pendingSave = next;
    }
  } finally {
    layoutSaving.value = false;
  }
}

function scheduleLayoutSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => void flushLayoutSave(), 600);
}

function commitLayout(next: LabLayout) {
  layout.value = next;
  if (layoutBacking.value === "local") {
    saveLocalLayout(layoutScope.value, next);
    return;
  }
  pendingSave = next;
  scheduleLayoutSave();
}

watch(layoutScope, () => {
  layout.value = emptyLayout();
  layoutRevision.value = 0;
  layoutBacking.value = "loading";
  pendingSave = null;
  void loadServerLayout();
});
watch(
  () => conn.online,
  (online) => {
    if (online && layoutBacking.value === "loading") void loadServerLayout();
  },
);

const cellSize = computed(() => layout.value.cellSize);
const cellSizeOptions = CELL_SIZE_OPTIONS.map((size) => ({ label: `${size}`, value: size }));

function setCellSize(size: number) {
  commitLayout(rescaleLayout(layout.value, size));
}

function createZone() {
  const result = addZone(layout.value, newZoneName.value);
  commitLayout(result.layout);
  tool.value = { kind: "zone", zoneId: result.zone.id };
  newZoneName.value = "";
}

function deleteZone(zoneId: string) {
  commitLayout(removeZone(layout.value, zoneId));
  if (tool.value.kind === "zone" && tool.value.zoneId === zoneId) tool.value = { kind: "wall" };
}

function setZoneName(zoneId: string, name: string) {
  commitLayout(renameZone(layout.value, zoneId, name));
}

function clearLayout() {
  commitLayout({ ...emptyLayout(layout.value.cellSize), zones: layout.value.zones.map((zone) => ({ ...zone, cells: [] })) });
}

const layoutCellCount = computed(
  () => layout.value.walls.length + layout.value.zones.reduce((sum, zone) => sum + zone.cells.length, 0),
);

/** 编辑态可点的格子范围：覆盖当前视口再向外各留两格，随视口平移自然延伸。 */
const paintableCells = computed(() => {
  if (!editing.value) return [];
  const [vx, vy, vw, vh] = viewBoxNumbers.value;
  const size = cellSize.value;
  const from = cellAt(vx, vy, size);
  const to = cellAt(vx + vw, vy + vh, size);
  const cells: { key: string; x: number; y: number }[] = [];
  for (let row = from.row - 1; row <= to.row + 1; row += 1) {
    for (let col = from.col - 1; col <= to.col + 1; col += 1) {
      cells.push({ key: cellKey(col, row), x: col * size, y: row * size });
    }
  }
  return cells;
});

const zoneCells = computed(() =>
  layout.value.zones.flatMap((zone) =>
    zone.cells
      .map((key) => cellRect(key, cellSize.value))
      .filter((rect): rect is NonNullable<typeof rect> => rect !== null)
      .map((rect) => ({ ...rect, color: zone.color, zoneId: zone.id })),
  ),
);

const wallCells = computed(() =>
  layout.value.walls.map((key) => cellRect(key, cellSize.value)).filter((rect): rect is NonNullable<typeof rect> => rect !== null),
);

/** 区域名标注：放在区域包围盒左上角（平面图惯例），设备块上方仍可读；重心作兜底。 */
const zoneLabels = computed(() =>
  layout.value.zones
    .map((zone) => {
      const bounds = cellsBounds(zone.cells, cellSize.value);
      const at = bounds
        ? { x: bounds.minX + cellSize.value * 0.15, y: bounds.minY + cellSize.value * 0.3 }
        : zoneCentroid(zone, cellSize.value);
      return { zone, at };
    })
    .filter((item): item is { zone: (typeof item)["zone"]; at: { x: number; y: number } } => item.at !== null),
);

function zoneSummary(zoneId: string) {
  const zone = layout.value.zones.find((item) => item.id === zoneId);
  if (!zone) return null;
  const area = zoneArea(zone, cellSize.value);
  const devicesInside = blocks.value.filter((block) => zoneOfRect(layout.value, block)?.id === zoneId);
  return { area, devicesInside };
}

function applyTool(key: string) {
  if (touchedThisStroke.has(key)) return;
  touchedThisStroke.add(key);
  commitLayout(paintCell(layout.value, key, tool.value));
}

function onCellPointerDown(key: string, event: PointerEvent) {
  // 中键留给平移
  if (!editing.value || event.button === 1) return;
  event.preventDefault();
  painting = true;
  touchedThisStroke = new Set();
  // 右键 = 临时橡皮擦
  if (event.button === 2) {
    const saved = tool.value;
    tool.value = { kind: "erase" };
    applyTool(key);
    tool.value = saved;
    painting = false;
    return;
  }
  applyTool(key);
}

function onCellPointerEnter(key: string) {
  hoverCell.value = key;
  if (painting) applyTool(key);
}

function stopPainting() {
  painting = false;
}

function exportLayout() {
  const blob = new Blob([JSON.stringify(layout.value, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `lab-layout-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function importLayout() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    try {
      const parsed = parseLayout(JSON.parse(await file.text()));
      if (!parsed) throw new Error("文件不是有效的布局");
      commitLayout(parsed);
      message.success(`已导入布局：${parsed.zones.length} 个区域 · ${parsed.walls.length} 段围墙`);
    } catch (error) {
      message.error(`导入失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  input.click();
}

const toolLabel = computed(() => {
  if (tool.value.kind === "wall") return "围墙";
  if (tool.value.kind === "erase") return "橡皮擦";
  const zoneId = tool.value.zoneId;
  return `区域 · ${layout.value.zones.find((zone) => zone.id === zoneId)?.name ?? "?"}`;
});

// ── 视口 ─────────────────────────────────────────────────────

type Box = [number, number, number, number];

/** 自动视口：覆盖设备与已画布局；编辑态额外留出空白供继续绘制。 */
const fitBox = computed<Box>(() => {
  const boundsList: { minX: number; minY: number; maxX: number; maxY: number }[] = [];
  if (blocks.value.length) {
    boundsList.push({
      minX: Math.min(...blocks.value.map((b) => b.x)),
      minY: Math.min(...blocks.value.map((b) => b.y)),
      maxX: Math.max(...blocks.value.map((b) => b.x + b.w)),
      maxY: Math.max(...blocks.value.map((b) => b.y + b.h)),
    });
  }
  const painted = cellsBounds([...layout.value.walls, ...layout.value.zones.flatMap((zone) => zone.cells)], cellSize.value);
  if (painted) boundsList.push(painted);
  if (!boundsList.length) return [0, 0, 1000, 600];
  const minX = Math.min(...boundsList.map((b) => b.minX));
  const minY = Math.min(...boundsList.map((b) => b.minY));
  const maxX = Math.max(...boundsList.map((b) => b.maxX));
  const maxY = Math.max(...boundsList.map((b) => b.maxY));
  const pad = editing.value ? Math.max(cellSize.value * 3, 120) : 40;
  return [minX - pad, minY - pad, Math.max(400, maxX - minX + pad * 2), Math.max(300, maxY - minY + pad * 2)];
});

/** 用户手动平移 / 缩放后的视口；为 null 时跟随自动视口。 */
const userBox = ref<Box | null>(null);
const viewBoxNumbers = computed<Box>(() => userBox.value ?? fitBox.value);
const viewBox = computed(() => viewBoxNumbers.value.join(" "));
const svgEl = ref<SVGSVGElement | null>(null);

function resetView() {
  userBox.value = null;
}

/** 一个屏幕像素对应多少图内单位（preserveAspectRatio=meet）。 */
function unitsPerPixel(): number {
  const el = svgEl.value;
  if (!el) return 1;
  const [, , vw, vh] = viewBoxNumbers.value;
  const rect = el.getBoundingClientRect();
  if (!rect.width || !rect.height) return 1;
  return Math.max(vw / rect.width, vh / rect.height);
}

const panPointer = ref<{ id: number; x: number; y: number } | null>(null);

/** 非编辑态左键拖动、任何时候中键拖动都平移地图；编辑态左键留给画笔。 */
function onMapPointerDown(event: PointerEvent) {
  const wantsPan = event.button === 1 || (event.button === 0 && !editing.value);
  if (!wantsPan) return;
  event.preventDefault();
  panMoved = false;
  panPointer.value = { id: event.pointerId, x: event.clientX, y: event.clientY };
  svgEl.value?.setPointerCapture(event.pointerId);
}

/** 拖动过就不当作点击，避免拖完地图误选设备。 */
let panMoved = false;

function selectBlock(uuid: string) {
  if (panMoved) return;
  selectedUuid.value = uuid;
}

function onMapPointerMove(event: PointerEvent) {
  const pan = panPointer.value;
  if (!pan || event.pointerId !== pan.id) return;
  const dx = event.clientX - pan.x;
  const dy = event.clientY - pan.y;
  if (Math.abs(dx) + Math.abs(dy) > 3) panMoved = true;
  const scale = unitsPerPixel();
  const [x, y, w, h] = viewBoxNumbers.value;
  userBox.value = [x - dx * scale, y - dy * scale, w, h];
  panPointer.value = { id: pan.id, x: event.clientX, y: event.clientY };
}

function onMapPointerUp(event: PointerEvent) {
  stopPainting();
  if (panPointer.value && event.pointerId === panPointer.value.id) {
    svgEl.value?.releasePointerCapture(event.pointerId);
    panPointer.value = null;
  }
}

/** 滚轮以光标为锚点缩放，页面本身不滚动。 */
function onMapWheel(event: WheelEvent) {
  event.preventDefault();
  const el = svgEl.value;
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const [x, y, w, h] = viewBoxNumbers.value;
  const scale = unitsPerPixel();
  // meet 模式下内容居中，先算出光标在图内的坐标
  const contentW = w / scale;
  const contentH = h / scale;
  const offsetX = (rect.width - contentW) / 2;
  const offsetY = (rect.height - contentH) / 2;
  const px = x + (event.clientX - rect.left - offsetX) * scale;
  const py = y + (event.clientY - rect.top - offsetY) * scale;
  const factor = Math.exp(event.deltaY * 0.0015);
  const nw = Math.min(50000, Math.max(200, w * factor));
  const nh = h * (nw / w);
  userBox.value = [px - (px - x) * (nw / w), py - (py - y) * (nh / h), nw, nh];
}

const selected = computed(() => blocks.value.find((block) => block.uuid === selectedUuid.value) ?? null);

const stats = computed(() => {
  const sites = blocks.value.flatMap((block) => block.sites);
  return {
    blocks: blocks.value.length,
    online: blocks.value.filter((block) => block.online).length,
    sites: sites.length,
    occupied: sites.filter((site) => site.site.occupied_material_uuid).length,
  };
});

const occupantName = (site: MapSite) =>
  site.occupant ? site.occupant.material.display_name || site.occupant.material.name : site.site.occupied_material_uuid ? "已占用" : "";

async function refresh() {
  await devices.refresh();
  try {
    allAggregates.value = await conn.api.domains.materialsV1.instances();
  } catch {
    /* 树内占用者名称退化为「已占用」 */
  }
}

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void refresh();
  void loadServerLayout();
  timer = setInterval(() => void refresh(), 8000);
});
onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
  // 防抖窗口内离开页面也不丢最后一笔改动
  if (saveTimer) {
    clearTimeout(saveTimer);
    void flushLayoutSave();
  }
});
</script>

<template>
  <div class="page app-fill">
    <PageHeader
      :title="domain.config.nav.lab"
      :subtitle="`${stats.online}/${stats.blocks} 台设备在线 · ${stats.occupied}/${stats.sites} 个位点已占用 · 拖动平移，滚轮缩放`"
    >
      <template #actions>
        <span class="switch-label">标签</span>
        <NSwitch v-model:value="showLabels" size="small" />
        <NButton size="small" :disabled="!userBox" @click="resetView">复位视图</NButton>
        <NButton size="small" :type="editing ? 'primary' : 'default'" :secondary="editing" @click="editing = !editing">
          {{ editing ? "完成编辑" : "编辑布局" }}
        </NButton>
        <NButton size="small" :loading="devices.loading" @click="refresh">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接微后端</span>
      连接后地图会按设备位置自动绘制。
    </div>

    <!-- 已连接就渲染画布；没有设备时也能先划分区域、画围墙 -->
    <div v-else class="layout" :class="{ editing }">
      <div class="canvas-card">
        <div v-if="editing" class="edit-bar">
          <span class="edit-hint">
            当前画笔：<b>{{ toolLabel }}</b> · 在格子上点击 / 拖动绘制，右键擦除，中键拖动平移
          </span>
          <span class="edit-meta mono">格 {{ cellSize }} · 已画 {{ layoutCellCount }} 格</span>
        </div>
        <svg
          ref="svgEl"
          class="map"
          :class="{ paint: editing, panning: !!panPointer }"
          :viewBox="viewBox"
          preserveAspectRatio="xMidYMid meet"
          @pointerdown="onMapPointerDown"
          @pointermove="onMapPointerMove"
          @pointerup="onMapPointerUp"
          @pointercancel="onMapPointerUp"
          @pointerleave="stopPainting"
          @wheel="onMapWheel"
          @contextmenu.prevent
        >
          <defs>
            <pattern id="grid" :width="cellSize" :height="cellSize" patternUnits="userSpaceOnUse">
              <path :d="`M ${cellSize} 0 L 0 0 0 ${cellSize}`" fill="none" stroke="rgba(16,20,24,0.07)" stroke-width="1" />
            </pattern>
          </defs>
          <rect x="-10000" y="-10000" width="20000" height="20000" fill="url(#grid)" />

          <!-- 布局层：区域（半透明色块）与围墙（实心深色），叠在设备之下 -->
          <g class="zones">
            <rect
              v-for="cell in zoneCells"
              :key="`z${cell.zoneId}${cell.key}`"
              :x="cell.x"
              :y="cell.y"
              :width="cell.size"
              :height="cell.size"
              :fill="cell.color"
              class="zone-cell"
              :class="{ active: tool.kind === 'zone' && tool.zoneId === cell.zoneId }"
            />
          </g>
          <g class="walls">
            <rect v-for="cell in wallCells" :key="`w${cell.key}`" :x="cell.x" :y="cell.y" :width="cell.size" :height="cell.size" class="wall-cell" />
          </g>
          <!-- 编辑态：可点击格子层（透明），设备块不再拦截指针 -->
          <g v-if="editing" class="paint-grid">
            <rect
              v-for="cell in paintableCells"
              :key="cell.key"
              :x="cell.x"
              :y="cell.y"
              :width="cellSize"
              :height="cellSize"
              class="paint-cell"
              :class="{ hover: hoverCell === cell.key }"
              @pointerdown="onCellPointerDown(cell.key, $event)"
              @pointerenter="onCellPointerEnter(cell.key)"
              @pointerleave="hoverCell = ''"
            />
          </g>

          <g
            v-for="block in blocks"
            :key="block.uuid"
            class="block"
            :class="{ off: !block.online, busy: block.busy, selected: selectedUuid === block.uuid, dim: hoverKey && hoverKey !== block.uuid, ghost: editing }"
            @mouseenter="hoverKey = block.uuid"
            @mouseleave="hoverKey = ''"
            @click="selectBlock(block.uuid)"
            @dblclick="router.push(`/lab/assembly/${encodeURIComponent(block.uuid)}`)"
          >
            <rect class="block-body" :x="block.x" :y="block.y" :width="block.w" :height="block.h" rx="10" />
            <rect v-if="!block.placed" class="block-unplaced" :x="block.x" :y="block.y" :width="block.w" :height="block.h" rx="10" />
            <g v-for="site in block.sites" :key="site.key" class="site" :class="{ occupied: !!site.site.occupied_material_uuid }">
              <rect :x="block.x + site.x" :y="block.y + site.y" :width="site.w" :height="site.h" rx="5" />
              <text v-if="showLabels" :x="block.x + site.x + site.w / 2" :y="block.y + site.y + 14" class="site-label">{{ site.site.label }}</text>
              <text v-if="showLabels && site.site.occupied_material_uuid" :x="block.x + site.x + site.w / 2" :y="block.y + site.y + site.h / 2 + 8" class="site-occupant">
                {{ occupantName(site).slice(0, 14) }}
              </text>
            </g>
            <text v-if="showLabels" :x="block.x + 12" :y="block.y - 10" class="block-name">{{ block.name }}</text>
            <text v-if="showLabels" :x="block.x + block.w - 12" :y="block.y - 10" class="block-state" text-anchor="end">
              {{ block.busy ? "执行中" : block.online ? "在线" : "离线" }}
            </text>
          </g>

          <!-- 区域名：画在最上层（带白色描边），不被设备块遮住 -->
          <g v-if="showLabels" class="zone-labels">
            <text v-for="item in zoneLabels" :key="item.zone.id" :x="item.at.x" :y="item.at.y" class="zone-label" :style="{ fill: item.zone.color }">
              {{ item.zone.name }}
            </text>
          </g>
        </svg>
        <div class="legend">
          <span><i class="sw device" /> 设备 / 台面</span>
          <span><i class="sw site" /> 空位点</span>
          <span><i class="sw occupied" /> 已占用</span>
          <span><i class="sw off" /> 离线</span>
          <span><i class="sw wall" /> 围墙</span>
          <span v-for="zone in layout.zones" :key="zone.id"><i class="sw" :style="{ background: `${zone.color}33`, borderColor: zone.color }" /> {{ zone.name }}</span>
          <span class="dim">虚线框 = 未设置坐标，自动排列</span>
        </div>
      </div>

      <aside class="side">
        <div v-if="editing" class="side-card edit-card">
          <div class="side-title">布局画笔</div>
          <div class="tool-row">
            <button type="button" class="tool" :class="{ on: tool.kind === 'wall' }" @click="tool = { kind: 'wall' }">
              <i class="sw wall" /> 围墙
            </button>
            <button type="button" class="tool" :class="{ on: tool.kind === 'erase' }" @click="tool = { kind: 'erase' }">
              <i class="sw erase" /> 橡皮擦
            </button>
          </div>
          <div class="zone-list">
            <div v-for="zone in layout.zones" :key="zone.id" class="zone-row" :class="{ on: tool.kind === 'zone' && tool.zoneId === zone.id }">
              <div class="zone-line">
                <button type="button" class="zone-pick" :title="`用「${zone.name}」画笔`" @click="tool = { kind: 'zone', zoneId: zone.id }">
                  <i class="sw" :style="{ background: `${zone.color}55`, borderColor: zone.color }" />
                </button>
                <NInput
                  :value="zone.name"
                  size="tiny"
                  class="zone-name"
                  @update:value="(value: string) => setZoneName(zone.id, value)"
                  @focus="tool = { kind: 'zone', zoneId: zone.id }"
                />
                <NPopconfirm @positive-click="deleteZone(zone.id)">
                  <template #trigger><button type="button" class="zone-del" title="删除区域">×</button></template>
                  删除区域「{{ zone.name }}」及其格子？
                </NPopconfirm>
              </div>
              <div
                class="zone-meta mono"
                :title="zoneSummary(zone.id)?.devicesInside.map((block) => block.name).join('、') || '区域内没有设备'"
              >
                {{ zone.cells.length }} 格 · {{ zoneArea(zone, cellSize).squareMeters.toFixed(2) }} m² · {{ zoneSummary(zone.id)?.devicesInside.length ?? 0 }} 设备
                <span v-if="tool.kind === 'zone' && tool.zoneId === zone.id" class="zone-current">← 当前画笔</span>
              </div>
            </div>
            <div class="zone-add">
              <NInput v-model:value="newZoneName" size="tiny" placeholder="新区域名称，如 样品制备区" @keyup.enter="createZone" />
              <NButton size="tiny" type="primary" @click="createZone">新建区域</NButton>
            </div>
          </div>
          <div class="edit-options">
            <span class="dim small">格子边长</span>
            <NSelect :value="cellSize" size="tiny" :options="cellSizeOptions" style="width: 90px" @update:value="setCellSize" />
            <span class="dim small">（与设备坐标同单位，mm 时 100 = 10 cm）</span>
          </div>
          <div class="side-actions">
            <NButton size="tiny" @click="exportLayout">导出 JSON</NButton>
            <NButton size="tiny" @click="importLayout">导入 JSON</NButton>
            <NPopconfirm @positive-click="clearLayout">
              <template #trigger><NButton size="tiny" quaternary type="error">清空格子</NButton></template>
              清空所有区域格子与围墙（保留区域名称）？
            </NPopconfirm>
          </div>
          <p v-if="layoutBacking === 'server'" class="dim small edit-note">
            区域与围墙保存在微后端（runtime.db），所有连接这台 Host 的人共享，改动约 1 秒后自动写回
            <template v-if="layoutSaving">（正在保存…）</template>
            <template v-else-if="layoutSyncedAt">（revision {{ layoutRevision }}，{{ new Date(layoutSyncedAt).toLocaleTimeString("zh-CN", { hour12: false }) }} 已同步）</template>；
            导出 / 导入用于在不同 Host 之间搬运。
          </p>
          <p v-else-if="layoutBacking === 'local'" class="dim small edit-note">
            当前微后端没有布局接口（版本较旧），区域与围墙暂存在本浏览器；升级 Uni-Lab-OS 后打开本页会自动同步上去。
          </p>
        </div>

        <div class="side-card">
          <div class="side-title">{{ selected ? selected.name : "选择一台设备" }}</div>
          <template v-if="selected">
            <div class="kv"><span>ID</span><b class="mono">{{ selected.id }}</b></div>
            <div class="kv"><span>类</span><b class="mono">{{ selected.className || "—" }}</b></div>
            <div class="kv"><span>状态</span><NTag size="tiny" :bordered="false" :type="selected.online ? 'success' : 'default'">{{ selected.busy ? "执行中" : selected.online ? "在线" : "离线" }}</NTag></div>
            <div class="kv"><span>位置</span><b class="mono">{{ selected.placed ? `${selected.x}, ${selected.y}` : "未定位" }}</b></div>
            <div class="kv"><span>尺寸</span><b class="mono">{{ selected.w }} × {{ selected.h }}</b></div>
            <div class="kv">
              <span>所在区域</span>
              <b v-if="zoneOfRect(layout, selected)" :style="{ color: zoneOfRect(layout, selected)!.color }">{{ zoneOfRect(layout, selected)!.name }}</b>
              <b v-else class="dim">未划分</b>
            </div>
            <div class="kv"><span>位点</span><b>{{ selected.sites.filter((s) => s.site.occupied_material_uuid).length }}/{{ selected.sites.length }} 已占用</b></div>
            <ul v-if="selected.sites.length" class="site-list">
              <li v-for="site in selected.sites" :key="site.key">
                <span class="site-chip" :class="{ occupied: !!site.site.occupied_material_uuid }">{{ site.site.label }}</span>
                <span class="site-text">{{ occupantName(site) || "空" }}</span>
              </li>
            </ul>
            <div class="side-actions">
              <NButton size="small" type="primary" @click="router.push(`/lab/assembly/${encodeURIComponent(selected.uuid)}`)">
                <template #icon><NIcon><CubeOutline /></NIcon></template>
                2.5D 装配视图
              </NButton>
              <NButton size="small" @click="router.push('/inventory')">在物料树中查看</NButton>
            </div>
          </template>
          <NEmpty v-else size="small" description="点击地图上的设备查看位点占用；双击进入装配视图" style="padding: 24px 0" />
        </div>

        <div class="side-card">
          <div class="side-title">设备列表</div>
          <NEmpty v-if="!blocks.length" size="small" description="暂无设备；上传设备图后自动出现" style="padding: 16px 0" />
          <ul v-else class="device-list">
            <li v-for="block in blocks" :key="block.uuid" :class="{ active: selectedUuid === block.uuid }" @click="selectedUuid = block.uuid">
              <span class="dot" :class="{ off: !block.online, busy: block.busy }" />
              <span class="name">{{ block.name }}</span>
              <span class="meta mono">{{ block.sites.filter((s) => s.site.occupied_material_uuid).length }}/{{ block.sites.length }}</span>
            </li>
          </ul>
        </div>
      </aside>
    </div>
  </div>
</template>

<style scoped>
/* app-fill：页面锁满可视高度，地图吃满剩余空间，滚动只发生在侧栏内部 */
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding-bottom: 12px;
}

.page :deep(.page-header) {
  position: static;
  margin-bottom: 0;
}

.switch-label {
  font-size: 12px;
  color: #6e7580;
}

.layout {
  flex: 1;
  min-height: 0;
  min-width: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: 12px;
  align-items: stretch;
}

@media (max-width: 1000px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
  }
}

.canvas-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 10px;
}

.map {
  flex: 1;
  min-height: 240px;
  width: 100%;
  display: block;
  border-radius: 10px;
  background: #fbfbf9;
  cursor: grab;
  touch-action: none;
  user-select: none;
}

.map.panning {
  cursor: grabbing;
}

.block {
  cursor: pointer;
  transition: opacity 0.15s ease;
}

.block.dim {
  opacity: 0.45;
}

.block-body {
  fill: #eef4ff;
  stroke: #2e5bff;
  stroke-width: 2;
}

.block.off .block-body {
  fill: #f1f1ee;
  stroke: #b8bec6;
}

.block.busy .block-body {
  stroke: #d97706;
  fill: #fff5e6;
}

.block.selected .block-body {
  stroke-width: 4;
}

.block-unplaced {
  fill: none;
  stroke: #8b929c;
  stroke-width: 1.5;
  stroke-dasharray: 8 6;
}

.site rect {
  fill: #ffffff;
  stroke: #9aa8bd;
  stroke-width: 1.2;
}

.site.occupied rect {
  fill: #0e9f6e;
  stroke: #0b7a55;
}

.site-label {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: #3d4650;
  text-anchor: middle;
}

.site.occupied .site-label,
.site-occupant {
  fill: #fff;
}

.site-occupant {
  font-size: 11px;
  text-anchor: middle;
  font-weight: 600;
}

.block-name {
  font-size: 15px;
  font-weight: 700;
  fill: #101418;
}

.block-state {
  font-family: var(--font-mono);
  font-size: 11px;
  fill: #6e7580;
}

.legend {
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  padding: 10px 6px 2px;
  font-size: 12px;
  color: #3d4650;
}

.legend .sw {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  margin-right: 5px;
  vertical-align: -2px;
  border: 1px solid #9aa8bd;
  background: #fff;
}

.legend .sw.device {
  background: #eef4ff;
  border-color: #2e5bff;
}

.legend .sw.occupied {
  background: #0e9f6e;
  border-color: #0b7a55;
}

.legend .sw.off {
  background: #f1f1ee;
  border-color: #b8bec6;
}

.sw.wall {
  background: #1f262e;
  border-color: #1f262e;
}

.sw.erase {
  background: repeating-linear-gradient(45deg, #fff 0 3px, #d9dde3 3px 6px);
  border-color: #9aa3ab;
}

/* ── 布局层 ── */
.zone-cell {
  opacity: 0.22;
  stroke: none;
}

.layout.editing .zone-cell.active {
  opacity: 0.34;
}

.wall-cell {
  fill: #1f262e;
  stroke: #0c1014;
  stroke-width: 1;
}

.zone-label {
  font-size: 16px;
  font-weight: 800;
  letter-spacing: 0.04em;
  text-anchor: start;
  dominant-baseline: middle;
  opacity: 0.9;
  pointer-events: none;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.92);
  stroke-width: 5px;
}

/* 编辑态：透明格子层接管指针，设备块只做参照 */
.map.paint {
  cursor: crosshair;
  touch-action: none;
}

.paint-cell {
  fill: transparent;
  stroke: rgba(46, 91, 255, 0);
}

.paint-cell.hover {
  fill: rgba(46, 91, 255, 0.12);
  stroke: rgba(46, 91, 255, 0.7);
  stroke-width: 1.5;
}

.block.ghost {
  pointer-events: none;
  opacity: 0.8;
}

.edit-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin: 0 2px 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: var(--domain-accent-soft);
  font-size: 12px;
  color: #2f3a45;
}

.edit-meta {
  color: #5c6874;
  font-size: 11px;
}

/* ── 侧栏：画笔与区域 ── */
.tool-row {
  display: flex;
  gap: 6px;
  margin-bottom: 10px;
}

.tool {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: #fff;
  font: 600 12px var(--font-sans);
  color: #3d4650;
  cursor: pointer;
}

.tool.on {
  border-color: var(--domain-accent);
  background: var(--domain-accent-soft);
  color: var(--domain-accent);
}

.tool .sw,
.zone-pick .sw {
  display: inline-block;
  width: 12px;
  height: 12px;
  border-radius: 3px;
  border: 1px solid #9aa8bd;
  margin: 0;
}

.zone-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.zone-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 8px;
}

.zone-row.on {
  background: var(--panel-soft);
}

.zone-line {
  display: flex;
  align-items: center;
  gap: 6px;
}

.zone-current {
  color: var(--domain-accent);
  margin-left: 4px;
}

.zone-pick {
  border: 0;
  background: none;
  padding: 2px;
  cursor: pointer;
  display: inline-flex;
}

.zone-name {
  flex: 1;
  min-width: 0;
}

.zone-meta {
  font-size: 10.5px;
  color: #8b929c;
  padding-left: 26px;
}

.zone-del {
  border: 0;
  background: none;
  color: #9aa3ab;
  font-size: 14px;
  cursor: pointer;
  padding: 0 4px;
}

.zone-del:hover {
  color: #b91c1c;
}

.zone-add {
  display: flex;
  gap: 6px;
  margin-top: 6px;
}

.edit-options {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 12px;
}

.edit-note {
  margin: 10px 0 0;
  line-height: 1.5;
}

.small {
  font-size: 11.5px;
}

.side {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
}

.side-card {
  flex-shrink: 0;
}

.side-card {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 14px 16px;
}

.side-title {
  font-weight: 700;
  margin-bottom: 10px;
}

.kv {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 12.5px;
  padding: 4px 0;
}

.kv span {
  color: #8b929c;
}

.kv b {
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-list {
  list-style: none;
  margin: 10px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-height: 220px;
  overflow: auto;
}

.site-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.site-chip {
  font-family: var(--font-mono);
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 999px;
  background: #eef0f3;
  color: #3d4650;
}

.site-chip.occupied {
  background: #e6f7f0;
  color: #0b7a55;
}

.site-text {
  color: #3d4650;
}

.side-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
}

.device-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.device-list li {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12.5px;
}

.device-list li:hover,
.device-list li.active {
  background: var(--panel-soft);
}

.device-list .dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #04aa65;
}

.device-list .dot.off {
  background: #b8bec6;
}

.device-list .dot.busy {
  background: #d97706;
}

.device-list .name {
  flex: 1;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-list .meta {
  font-size: 11px;
  color: #8b929c;
}

.mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.dim {
  color: #8b929c;
}
</style>
