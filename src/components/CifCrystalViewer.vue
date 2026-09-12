<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { NAlert, NButton, NCard, NInput, NSlider, NSwitch, NTag } from "naive-ui";
import {
  expandBoundaryAtoms,
  fractionalToCartesian,
  parseCif,
  type CifAtom,
} from "../features/cif";
import { calculateCifRenderViewport } from "../features/cif-render";

const SAMPLE_CIF = `data_NaCl
_cell_length_a 5.6402
_cell_length_b 5.6402
_cell_length_c 5.6402
_cell_angle_alpha 90
_cell_angle_beta 90
_cell_angle_gamma 90

loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
Na1 Na 0.0000 0.0000 0.0000
Na2 Na 0.5000 0.5000 0.0000
Na3 Na 0.5000 0.0000 0.5000
Na4 Na 0.0000 0.5000 0.5000
Cl1 Cl 0.5000 0.5000 0.5000
Cl2 Cl 0.0000 0.0000 0.5000
Cl3 Cl 0.0000 0.5000 0.0000
Cl4 Cl 0.5000 0.0000 0.0000`;

interface Point3 {
  x: number;
  y: number;
  z: number;
}

interface GeometryAtom extends CifAtom {
  cartesian: Point3;
  sceneKey: string;
}

const cifText = ref(SAMPLE_CIF);
const yaw = ref(35);
const pitch = ref(24);
const zoom = ref(1);
const showLabels = ref(true);
const loadedFileName = ref("内置 NaCl 示例");
const fileError = ref("");
const draggingFile = ref(false);
const crystalSvg = ref<SVGSVGElement | null>(null);
const svgWidth = ref(640);
const clipPathId = useId();

let svgResizeObserver: ResizeObserver | null = null;

onMounted(() => {
  const updateWidth = () => {
    const width = crystalSvg.value?.getBoundingClientRect().width;
    if (width && Number.isFinite(width)) svgWidth.value = width;
  };
  updateWidth();
  if (typeof ResizeObserver !== "undefined" && crystalSvg.value) {
    svgResizeObserver = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width && Number.isFinite(width)) svgWidth.value = width;
    });
    svgResizeObserver.observe(crystalSvg.value);
  }
});

onBeforeUnmount(() => svgResizeObserver?.disconnect());

const svgViewport = computed(() => calculateCifRenderViewport(svgWidth.value));

const parsed = computed(() => {
  try {
    return { structure: parseCif(cifText.value), error: "" };
  } catch (error) {
    return { structure: null, error: error instanceof Error ? error.message : String(error) };
  }
});

const ELEMENT_COLORS: Record<string, string> = {
  H: "#f8fafc", He: "#dbeafe", Li: "#c084fc", Be: "#84cc16", B: "#f59e0b",
  C: "#475569", N: "#2563eb", O: "#dc2626", F: "#22c55e", Ne: "#67e8f9",
  Na: "#8b5cf6", Mg: "#22c55e", Al: "#94a3b8", Si: "#d97706", P: "#f97316",
  S: "#eab308", Cl: "#16a34a", K: "#7c3aed", Ca: "#65a30d", Fe: "#b45309",
  Co: "#2563eb", Ni: "#16a34a", Cu: "#c2410c", Zn: "#64748b", Br: "#991b1b",
  Ag: "#cbd5e1", I: "#6d28d9", Au: "#eab308", Pb: "#475569",
};

const COVALENT_RADII: Record<string, number> = {
  H: 0.31, B: 0.84, C: 0.76, N: 0.71, O: 0.66, F: 0.57, Si: 1.11, P: 1.07,
  S: 1.05, Cl: 1.02, Br: 1.2, I: 1.39, Li: 1.28, Na: 1.66, K: 2.03, Mg: 1.41,
  Ca: 1.76, Al: 1.21, Fe: 1.24, Co: 1.18, Ni: 1.17, Cu: 1.32, Zn: 1.22,
};

const geometry = computed(() => {
  const structure = parsed.value.structure;
  if (!structure) return { atoms: [] as GeometryAtom[], corners: [] as Point3[], bonds: [] as [number, number][], truncated: false };
  const expanded = expandBoundaryAtoms(structure.atoms);
  const truncated = expanded.length > 2_500;
  const atoms: GeometryAtom[] = expanded.slice(0, 2_500).map((atom, index) => ({
    ...atom,
    cartesian: fractionalToCartesian(structure.cell, atom),
    sceneKey: `${atom.element}-${atom.label}-${atom.x.toFixed(6)}-${atom.y.toFixed(6)}-${atom.z.toFixed(6)}-${index}`,
  }));
  const fractions = [
    [0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0],
    [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1],
  ] as const;
  const corners = fractions.map(([x, y, z]) => fractionalToCartesian(structure.cell, { x, y, z }));
  const bonds: [number, number][] = [];
  if (atoms.length <= 600) {
    for (let first = 0; first < atoms.length; first += 1) {
      for (let second = first + 1; second < atoms.length; second += 1) {
        const a = atoms[first];
        const b = atoms[second];
        const dx = a.cartesian.x - b.cartesian.x;
        const dy = a.cartesian.y - b.cartesian.y;
        const dz = a.cartesian.z - b.cartesian.z;
        const distance = Math.hypot(dx, dy, dz);
        const cutoff = (COVALENT_RADII[a.element] ?? 0.9) + (COVALENT_RADII[b.element] ?? 0.9) + 0.42;
        if (distance > 0.2 && distance <= cutoff) bonds.push([first, second]);
      }
    }
  }
  return { atoms, corners, bonds, truncated };
});

function rotate(point: Point3, center: Point3): Point3 {
  const x = point.x - center.x;
  const y = point.y - center.y;
  const z = point.z - center.z;
  const yr = (yaw.value * Math.PI) / 180;
  const pr = (pitch.value * Math.PI) / 180;
  const yawX = x * Math.cos(yr) + z * Math.sin(yr);
  const yawZ = -x * Math.sin(yr) + z * Math.cos(yr);
  return {
    x: yawX,
    y: y * Math.cos(pr) - yawZ * Math.sin(pr),
    z: y * Math.sin(pr) + yawZ * Math.cos(pr),
  };
}

const scene = computed(() => {
  const structure = parsed.value.structure;
  if (!structure || !geometry.value.corners.length) return { atoms: [], edges: [], bonds: [], axisLabels: [] };
  const center = fractionalToCartesian(structure.cell, { x: 0.5, y: 0.5, z: 0.5 });
  const rotatedCorners = geometry.value.corners.map((point) => rotate(point, center));
  const rotatedAtoms = geometry.value.atoms.map((atom) => ({ atom, point: rotate(atom.cartesian, center) }));
  const fitPoints = [...rotatedCorners, ...rotatedAtoms.map(({ point }) => point)];
  const xs = fitPoints.map((point) => point.x);
  const ys = fitPoints.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const viewport = svgViewport.value;
  const drawingWidth = Math.max(4, viewport.width - viewport.horizontalPadding * 2);
  const drawingHeight = Math.max(80, viewport.height - viewport.verticalPadding * 2);
  const scale = Math.min(
    drawingWidth / Math.max(maxX - minX, 0.001),
    drawingHeight / Math.max(maxY - minY, 0.001),
  ) * zoom.value;
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;
  const project = (point: Point3) => ({
    x: viewport.width / 2 + (point.x - midX) * scale,
    y: viewport.height / 2 - (point.y - midY) * scale,
    depth: point.z,
  });
  const corners = rotatedCorners.map(project);
  const edgePairs = [[0,1],[0,2],[1,3],[2,3],[4,5],[4,6],[5,7],[6,7],[0,4],[1,5],[2,6],[3,7]] as const;
  const edges = edgePairs.map(([a, b]) => ({ a: corners[a], b: corners[b] }));
  const atoms = rotatedAtoms.map(({ atom, point }, index) => ({
    ...atom,
    fractX: atom.x,
    fractY: atom.y,
    fractZ: atom.z,
    ...project(point),
    color: ELEMENT_COLORS[atom.element] ?? "#ec4899",
    radius: Math.max(7, Math.min(15, (COVALENT_RADII[atom.element] ?? 0.9) * 7.2)),
    geometryIndex: index,
  })).sort((a, b) => a.depth - b.depth);
  const projectedByIndex = new Map(atoms.map((atom) => [atom.geometryIndex, atom]));
  const bonds = geometry.value.bonds.map(([a, b]) => ({ a: projectedByIndex.get(a)!, b: projectedByIndex.get(b)! }))
    .filter((bond) => bond.a && bond.b)
    .sort((a, b) => (a.a.depth + a.b.depth) - (b.a.depth + b.b.depth));
  const axisLabels = [
    { label: "a", ...corners[1] },
    { label: "b", ...corners[2] },
    { label: "c", ...corners[4] },
  ];
  return { atoms, edges, bonds, axisLabels };
});

function resetView() {
  yaw.value = 35;
  pitch.value = 24;
  zoom.value = 1;
}

function resetSample() {
  cifText.value = SAMPLE_CIF;
  loadedFileName.value = "内置 NaCl 示例";
  fileError.value = "";
  resetView();
}

function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("浏览器无法读取该文件"));
    reader.readAsText(file, "utf-8");
  });
}

async function loadCifFile(file: File | undefined) {
  if (!file) return;
  fileError.value = "";
  try {
    if (file.size > 10 * 1024 * 1024) throw new Error("CIF 文件不能超过 10 MB");
    const text = await readFileAsText(file);
    parseCif(text);
    cifText.value = text;
    loadedFileName.value = file.name;
    resetView();
  } catch (error) {
    fileError.value = error instanceof Error ? error.message : String(error);
  }
}

async function handleFileChange(event: Event) {
  const input = event.currentTarget as HTMLInputElement;
  try {
    await loadCifFile(input.files?.[0]);
  } finally {
    input.value = "";
  }
}

async function handleDrop(event: DragEvent) {
  draggingFile.value = false;
  await loadCifFile(event.dataTransfer?.files?.[0]);
}

let pointerDrag: { id: number; x: number; y: number; yaw: number; pitch: number } | null = null;

function pointerDown(event: PointerEvent) {
  (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
  pointerDrag = { id: event.pointerId, x: event.clientX, y: event.clientY, yaw: yaw.value, pitch: pitch.value };
}

function pointerMove(event: PointerEvent) {
  if (!pointerDrag || pointerDrag.id !== event.pointerId) return;
  yaw.value = pointerDrag.yaw + (event.clientX - pointerDrag.x) * 0.55;
  pitch.value = Math.max(-85, Math.min(85, pointerDrag.pitch - (event.clientY - pointerDrag.y) * 0.45));
}

function pointerUp(event: PointerEvent) {
  if (pointerDrag?.id === event.pointerId) pointerDrag = null;
}
</script>

<template>
  <div
    class="cif-workbench"
    :class="{ 'is-dragging-file': draggingFile }"
    @dragenter.prevent="draggingFile = true"
    @dragover.prevent="draggingFile = true"
    @dragleave.prevent="draggingFile = false"
    @drop.prevent="handleDrop"
  >
    <div class="cif-toolbar">
      <label class="native-file-button">
        <input
          type="file"
          accept=".cif,.mcif,.res,text/plain,chemical/x-cif"
          @change="handleFileChange"
        />
        <span>选择 CIF 文件</span>
      </label>
      <NButton size="small" secondary @click="resetSample">恢复示例</NButton>
      <span class="loaded-file mono" :title="loadedFileName">{{ loadedFileName }}</span>
      <span class="drop-hint">也可以把文件拖到此区域</span>
    </div>

    <NAlert v-if="fileError" type="error" :bordered="false" closable @close="fileError = ''">
      {{ fileError }}
    </NAlert>

    <div class="cif-grid">
      <NCard title="CIF 数据" :bordered="false" class="cif-input-card">
        <template #header-extra>
          <NTag v-if="parsed.structure" size="small" :bordered="false" type="success">解析成功</NTag>
        </template>
        <NInput v-model:value="cifText" type="textarea" :rows="18" class="cif-editor" />
        <NAlert v-if="parsed.error" type="error" :bordered="false" style="margin-top: 12px">
          {{ parsed.error }}
        </NAlert>
      </NCard>

      <NCard :bordered="false" class="viewer-card">
        <div v-if="parsed.structure" class="viewer-head">
          <div>
            <span class="overline">CRYSTAL PREVIEW · DRAG TO ROTATE</span>
            <h3>{{ parsed.structure.name }}</h3>
          </div>
          <div class="viewer-tags">
            <NTag :bordered="false" round>{{ parsed.structure.atoms.length }} unique</NTag>
            <NTag :bordered="false" round type="info">{{ geometry.atoms.length }} displayed</NTag>
          </div>
        </div>
        <svg
          ref="crystalSvg"
          :viewBox="svgViewport.viewBox"
          :style="{ height: `${svgViewport.height}px` }"
          class="crystal-svg"
          role="img"
          aria-label="CIF 晶体结构交互预览"
          tabindex="0"
          @pointerdown="pointerDown"
          @pointermove="pointerMove"
          @pointerup="pointerUp"
          @pointercancel="pointerUp"
          @dblclick="resetView"
        >
          <defs>
            <clipPath :id="clipPathId">
              <rect x="0" y="0" :width="svgViewport.width" :height="svgViewport.height" />
            </clipPath>
          </defs>
          <g :clip-path="`url(#${clipPathId})`">
            <g class="cell-edges">
              <line v-for="(edge, index) in scene.edges" :key="index" vector-effect="non-scaling-stroke" :x1="edge.a.x" :y1="edge.a.y" :x2="edge.b.x" :y2="edge.b.y" />
            </g>
            <g class="bonds">
              <line v-for="(bond, index) in scene.bonds" :key="index" vector-effect="non-scaling-stroke" :x1="bond.a.x" :y1="bond.a.y" :x2="bond.b.x" :y2="bond.b.y" />
            </g>
            <text v-for="axis in scene.axisLabels" :key="axis.label" class="axis-label" :x="axis.x" :y="axis.y">{{ axis.label }}</text>
            <g v-for="atom in scene.atoms" :key="atom.sceneKey">
              <circle class="atom-shell" vector-effect="non-scaling-stroke" :cx="atom.x" :cy="atom.y" :r="atom.radius" :fill="atom.color" />
              <circle class="atom-highlight" :cx="atom.x - atom.radius * .28" :cy="atom.y - atom.radius * .3" :r="Math.max(1.8, atom.radius * .22)" />
              <text v-if="showLabels && scene.atoms.length <= 120" class="atom-label" :x="atom.x" :y="atom.y + atom.radius + 13" text-anchor="middle">{{ atom.element }}</text>
              <title>{{ atom.label }} · {{ atom.element }} · fractional ({{ atom.fractX.toFixed(4) }}, {{ atom.fractY.toFixed(4) }}, {{ atom.fractZ.toFixed(4) }})</title>
            </g>
          </g>
        </svg>
        <NAlert v-if="geometry.truncated" type="warning" :bordered="false" style="margin-bottom: 12px">
          结构过大，预览仅显示前 2500 个晶胞内位点。
        </NAlert>
        <div v-if="parsed.structure" class="cell-meta mono">
          <span>a {{ parsed.structure.cell.a.toFixed(3) }} Å</span>
          <span>b {{ parsed.structure.cell.b.toFixed(3) }} Å</span>
          <span>c {{ parsed.structure.cell.c.toFixed(3) }} Å</span>
          <span>α {{ parsed.structure.cell.alpha.toFixed(2) }}°</span>
          <span>β {{ parsed.structure.cell.beta.toFixed(2) }}°</span>
          <span>γ {{ parsed.structure.cell.gamma.toFixed(2) }}°</span>
          <span>{{ parsed.structure.asymmetricAtomCount }} asymmetric</span>
          <span>{{ parsed.structure.symmetryOperationCount }} symops</span>
        </div>
        <div class="view-controls">
          <label>水平 {{ Math.round(yaw) }}°<NSlider v-model:value="yaw" :min="-180" :max="180" /></label>
          <label>俯仰 {{ Math.round(pitch) }}°<NSlider v-model:value="pitch" :min="-85" :max="85" /></label>
          <label>缩放 {{ zoom.toFixed(1) }}×<NSlider v-model:value="zoom" :min="0.65" :max="1.8" :step="0.05" /></label>
          <label class="switch-control">原子标签 <NSwitch v-model:value="showLabels" size="small" /></label>
        </div>
        <div class="viewer-footer">
          <span>单指拖动旋转 · 双击恢复视角</span>
          <NButton size="tiny" tertiary @click="resetView">重置视角</NButton>
        </div>
      </NCard>
    </div>
  </div>
</template>

<style scoped>
.cif-workbench { display: flex; flex-direction: column; gap: 12px; position: relative; }
.cif-workbench.is-dragging-file::after { content: "释放以载入 CIF"; position: absolute; inset: 0; z-index: 20; display: grid; place-items: center; border: 2px dashed var(--domain-accent); border-radius: 18px; background: rgba(255,255,255,.9); color: var(--domain-accent); font: 700 18px var(--font-display); pointer-events: none; }
.cif-toolbar { display: flex; align-items: center; gap: 9px; min-width: 0; padding: 10px 12px; border: 1px solid rgba(var(--domain-accent-rgb), .14); border-radius: 14px; background: rgba(255,255,255,.8); }
.native-file-button { position: relative; display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto; min-height: 32px; padding: 0 14px; overflow: hidden; border-radius: 7px; background: var(--domain-accent); color: #fff; font-size: 12px; font-weight: 700; cursor: pointer; }
.native-file-button:hover { filter: brightness(1.06); }
.native-file-button:focus-within { outline: 3px solid rgba(var(--domain-accent-rgb), .25); outline-offset: 2px; }
.native-file-button input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
.loaded-file { min-width: 0; max-width: 320px; overflow: hidden; color: #47515c; font-size: 11px; text-overflow: ellipsis; white-space: nowrap; }
.drop-hint { margin-left: auto; color: #8a929c; font-size: 11px; }
.cif-grid { display: grid; grid-template-columns: minmax(320px, .82fr) minmax(440px, 1.18fr); grid-template-areas: "input viewer"; gap: 16px; }
.cif-input-card { grid-area: input; }
.viewer-card { grid-area: viewer; background: linear-gradient(145deg, #14191e, #090c0f) !important; color: #fff; }
.cif-editor :deep(textarea) { font: 11px/1.55 var(--font-mono); tab-size: 2; }
.viewer-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
.viewer-head h3 { margin: 4px 0 0; color: #fff; font-size: 20px; }
.viewer-tags { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 6px; }
.overline { color: #75808d; font: 700 9px var(--font-mono); letter-spacing: .15em; }
.crystal-svg { display: block; width: 100%; margin-top: 4px; overflow: hidden; contain: paint; border-radius: 13px; background: radial-gradient(circle at 52% 44%, rgba(var(--domain-accent-rgb), .14), transparent 52%); cursor: grab; touch-action: none; user-select: none; shape-rendering: geometricPrecision; text-rendering: optimizeLegibility; }
.crystal-svg:active { cursor: grabbing; }
.cell-edges line { stroke: rgba(229,237,245,.62); stroke-width: 1.25; stroke-linecap: round; }
.bonds line { stroke: rgba(215,225,235,.68); stroke-width: 2.5; stroke-linecap: round; }
.atom-shell { stroke: rgba(255,255,255,.72); stroke-width: 1.1; }
.atom-highlight { fill: rgba(255,255,255,.7); pointer-events: none; }
.crystal-svg text { fill: #d3dce6; font: 600 10px/1 var(--font-mono); pointer-events: none; }
.crystal-svg .atom-label { stroke: rgba(7,10,13,.95); stroke-width: 3px; paint-order: stroke fill; }
.crystal-svg .axis-label { fill: #fff; font: 800 13px/1 var(--font-mono); stroke: rgba(7,10,13,.9); stroke-width: 3px; paint-order: stroke fill; }
.cell-meta { display: flex; flex-wrap: wrap; gap: 7px 14px; color: #8e99a5; font-size: 10px; }
.view-controls { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-top: 16px; }
.view-controls label { color: #9ca6b1; font-size: 11px; }
.view-controls .switch-control { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.viewer-footer { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 8px; color: #65717e; font-size: 10px; }
@media (max-width: 1020px) {
  .cif-grid { grid-template-columns: 1fr; grid-template-areas: "viewer" "input"; }
}
@media (max-width: 560px) {
  .cif-toolbar { align-items: stretch; flex-wrap: wrap; }
  .native-file-button { flex: 1 1 150px; }
  .loaded-file { order: 3; flex: 1 0 100%; max-width: none; }
  .drop-hint { display: none; }
  .viewer-head { align-items: stretch; flex-direction: column; }
  .viewer-tags { justify-content: flex-start; }
  .viewer-card :deep(.n-card__content) { padding: 16px 14px; }
  .crystal-svg text { font-size: 11px; }
  .view-controls { grid-template-columns: 1fr; }
}
</style>
