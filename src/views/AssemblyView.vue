<script setup lang="ts">
/**
 * 组合 2.5D 装配视图（等距投影 SVG，无第三方 3D 依赖）。
 *
 * 数据源 materials.v1 的 material tree：root（deck/rack/plate）→ children（按 site）
 * → grandchildren（如 rack 里的试管）。等距画法（连续 yaw 可旋转）：
 *   sx = (rx - ry) * ISO_X, sy = (rx + ry) * ISO_Y - z，(rx,ry) = yaw 旋转后的世界坐标
 * 盒体 = 顶面 + 按法线剔除的可见侧面；画家算法先按场景层级、同层按深度排序。
 */
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NIcon,
  NSpace,
  NSpin,
  NTag,
} from "naive-ui";
import { ArrowBackOutline } from "@vicons/ionicons5";
import { ApiError, type EdgeApi, type MaterialsV1Tree } from "@openlab/protocol";
import { assemblyFromMaterials, findAssemblyNode, type AssemblyNode, type LabAssembly } from "../features/material-assembly";
import { createRefreshQueue } from "../features/refresh-queue";
import { TERMS } from "../features/terminology";
import { useConnectionStore } from "../stores/connection";
import { describeError } from "../features/errors";

const route = useRoute();
const router = useRouter();
const conn = useConnectionStore();

const loading = ref(true);
const error = ref("");
const assembly = shallowRef<LabAssembly | null>(null);
const selected = shallowRef<AssemblyNode | null>(null);
const hoverUuid = ref("");

const subjectId = computed(() => String(route.params.id ?? ""));

// ── 等距投影（连续 yaw 旋转：拖动画布任意角度，按钮为吸附预设） ──
const ISO_X = 0.866;
const ISO_Y = 0.5;

const VIEW_OPTIONS: { value: number; label: string }[] = [
  { value: 180, label: "西北视角" },
  { value: 90, label: "东北视角" },
  { value: 0, label: "东南视角" },
  { value: 270, label: "西南视角" },
];

/** 相机偏航角（度）。0=东南（历史默认），逆时针增加。 */
const yawDeg = ref(0);

const yawNorm = computed(() => ((yawDeg.value % 360) + 360) % 360);

const viewLabel = computed(() => {
  const preset = VIEW_OPTIONS.find(
    (option) => Math.round(yawNorm.value) === option.value,
  );
  return preset ? preset.label : `自由视角 ${Math.round(yawNorm.value)}°`;
});

function setYaw(deg: number) {
  yawDeg.value = deg;
}

const yawRad = computed(() => (yawNorm.value * Math.PI) / 180);
const yawSin = computed(() => Math.sin(yawRad.value));
const yawCos = computed(() => Math.cos(yawRad.value));

function rotateForView(x: number, y: number): { x: number; y: number } {
  return {
    x: x * yawCos.value - y * yawSin.value,
    y: x * yawSin.value + y * yawCos.value,
  };
}

function iso(x: number, y: number, z: number): { sx: number; sy: number } {
  const rotated = rotateForView(x, y);
  return {
    sx: (rotated.x - rotated.y) * ISO_X,
    sy: (rotated.x + rotated.y) * ISO_Y - z,
  };
}

function depthForView(x: number, y: number): number {
  const rotated = rotateForView(x, y);
  return rotated.x + rotated.y;
}

// ── 拖拽旋转 ──

const svgRef = ref<SVGSVGElement | null>(null);
const dragPointerId = ref<number | null>(null);
let dragStartX = 0;
let dragStartYaw = 0;
let dragMoved = false;
/** 拖拽刚结束时吞掉一次 click，避免旋转松手误选部件。 */
let suppressClickUntil = 0;

function onSvgPointerDown(event: PointerEvent) {
  if (event.button !== 0) return;
  dragPointerId.value = event.pointerId;
  dragStartX = event.clientX;
  dragStartYaw = yawDeg.value;
  dragMoved = false;
  svgRef.value?.setPointerCapture(event.pointerId);
}

function onSvgPointerMove(event: PointerEvent) {
  if (dragPointerId.value !== event.pointerId) return;
  const dx = event.clientX - dragStartX;
  if (Math.abs(dx) > 3) dragMoved = true;
  if (dragMoved) yawDeg.value = dragStartYaw - dx * 0.5;
}

function onSvgPointerUp(event: PointerEvent) {
  if (dragPointerId.value !== event.pointerId) return;
  dragPointerId.value = null;
  if (dragMoved) suppressClickUntil = Date.now() + 150;
  dragMoved = false;
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

interface IsoFace {
  points: string;
  fill: string;
}

interface IsoBox {
  uuid: string;
  node: AssemblyNode | null;
  top: string;
  sides: IsoFace[];
  color: string;
  /** 场景层级：0=台面 1=子件 2=孙件。子件永远叠在台面上，层级优先于深度排序。 */
  level: number;
  order: number;
  labelAt: { sx: number; sy: number };
  label?: string;
  /** 空槽位轮廓：虚线描边、不可选中。 */
  slot?: boolean;
}

function boxFaces(
  x: number, y: number, z: number, w: number, d: number, h: number,
  color: string, uuid: string, node: AssemblyNode | null, level: number, label?: string,
): IsoBox {
  const p = (px: number, py: number, pz: number) => {
    const { sx, sy } = iso(px, py, pz);
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  };
  const topZ = z + h;

  // 四个竖直侧面 + 各自的世界外法线；旋转后按可见性剔除、按光照连续着色。
  const SIDES: { normal: [number, number]; corners: [number, number][] }[] = [
    { normal: [0, 1], corners: [[x, y + d], [x + w, y + d]] },
    { normal: [1, 0], corners: [[x + w, y + d], [x + w, y]] },
    { normal: [0, -1], corners: [[x + w, y], [x, y]] },
    { normal: [-1, 0], corners: [[x, y], [x, y + d]] },
  ];
  const sides: IsoFace[] = [];
  for (const side of SIDES) {
    const n = rotateForView(side.normal[0], side.normal[1]);
    // 观察方向：法线朝屏幕下方（rx+ry 增大侧）才可见
    const facing = n.x + n.y;
    if (facing <= 0.02) continue;
    // 固定光源偏向 (0,1)：与旧版 se 视角的 0.72/0.55 双色调保持一致
    const brightness = 0.55 + 0.17 * Math.max(0, n.y);
    const [a, b] = side.corners;
    sides.push({
      points: [
        p(a[0], a[1], topZ), p(b[0], b[1], topZ),
        p(b[0], b[1], z), p(a[0], a[1], z),
      ].join(" "),
      fill: shade(color, brightness),
    });
  }

  return {
    uuid,
    node,
    label,
    level,
    top: [p(x, y, topZ), p(x + w, y, topZ), p(x + w, y + d, topZ), p(x, y + d, topZ)].join(" "),
    sides,
    color,
    order: depthForView(x + w / 2, y + d / 2) + z * 0.001,
    labelAt: (() => {
      const { sx, sy } = iso(x + w / 2, y + d / 2, topZ);
      return { sx, sy: sy - 4 };
    })(),
  };
}

const CATEGORY_COLORS: Record<string, string> = {
  deck: "#94a3b8",
  rack: "#a78bfa",
  plate: "#60a5fa",
  tube: "#34d399",
  bottle: "#fbbf24",
};

/** 每层都绘制空位点与子件；设备 → 台面 → 板 → 孔不再被三层上限截断。 */
const boxes = computed<IsoBox[]>(() => {
  const root = assembly.value?.root;
  if (!root) return [];
  const out: IsoBox[] = [];

  const visit = (node: AssemblyNode, x: number, y: number, z: number, level: number) => {
    const { w, d, h } = node.geometry;
    const fill = fillRatio(node);
    const color = fill !== null && fill < 0.34 ? "#f87171" : CATEGORY_COLORS[node.category] ?? "#94a3b8";
    const label = node.children.length || node.emptySites.length ? undefined : node.slot_id || node.template_name;
    out.push(boxFaces(x, y, z, w, d, h, color, node.edge_uuid, node, level, label));
    for (const site of node.emptySites) {
      out.push({ ...boxFaces(x + site.x, y + site.y, z + h, site.w, site.h, 1.2,
        "#e5e9f0", site.key, null, level + 1, site.site.label), slot: true });
    }
    for (const child of node.children) {
      visit(child, x + child.geometry.x, y + child.geometry.y, z + h + child.geometry.z, level + 1);
    }
  };
  visit(root, 0, 0, 0, 0);

  return out.sort((a, b) => a.level - b.level || a.order - b.order);
});

const viewBox = computed(() => {
  if (!boxes.value.length) return "-100 -100 200 200";
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const b of boxes.value) {
    for (const poly of [b.top, ...b.sides.map((face) => face.points)]) {
      for (const pt of poly.split(" ")) {
        const [px, py] = pt.split(",").map(Number);
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
    }
  }
  const pad = 30;
  return `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`;
});

function fillRatio(node: AssemblyNode): number | null {
  const cap = node.spec?.volume_ml;
  const vol = node.content?.volume_ml;
  if (typeof cap === "number" && cap > 0 && typeof vol === "number") {
    return Math.max(0, Math.min(1, vol / cap));
  }
  return null;
}

function selectNode(node: AssemblyNode | null) {
  selected.value = node;
}

const STATUS_LABEL: Record<string, string> = {
  active: "可用",
  warehouse: "在库",
  reserved: "已预留",
  bench: "在台面",
  in_use: "使用中",
  consumed: "已消耗",
  discarded: "已废弃",
  quarantined: "隔离中",
  retired: "已退役",
};

async function loadMaterialTree(subject: string, api: EdgeApi): Promise<MaterialsV1Tree> {
  try {
    return await api.domains.materialsV1.tree(subject);
  } catch (treeError) {
    if (!(treeError instanceof ApiError) || treeError.status !== 404) throw treeError;
    try {
      const aggregate = await api.domains.materialsV1.byResourceId(subject);
      return await api.domains.materialsV1.tree(aggregate.material.material_uuid);
    } catch {
      throw treeError;
    }
  }
}

let disposed = false;
const load = createRefreshQueue(async () => {
  if (!conn.online || disposed) return;
  const api = conn.api;
  const subject = subjectId.value;
  loading.value = assembly.value === null;
  try {
    const tree = await loadMaterialTree(subject, api);
    if (disposed || api !== conn.api || subject !== subjectId.value) return;
    const selection = selected.value?.edge_uuid ?? "";
    assembly.value = assemblyFromMaterials(tree);
    selected.value = findAssemblyNode(assembly.value.root, selection) ?? assembly.value.root;
    error.value = "";
  } catch (err) {
    if (!disposed && api === conn.api && subject === subjectId.value) {
      error.value = describeError(err);
      if (err instanceof ApiError && err.status === 404) {
        assembly.value = null;
        selected.value = null;
      }
    }
  } finally {
    loading.value = false;
  }
});

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void load();
  timer = setInterval(() => void load(), 8000);
});
onUnmounted(() => {
  disposed = true;
  if (timer !== null) clearInterval(timer);
});
watch(() => conn.materialsNoticeRevision, () => void load());
watch(() => conn.online, (online) => { if (online) void load(); });
watch([() => conn.baseUrl, subjectId], () => {
  assembly.value = null;
  selected.value = null;
  error.value = "";
  void load();
});
</script>

<template>
  <NSpace vertical :size="16">
    <NCard :bordered="false">
      <NSpace align="center" justify="space-between">
        <NSpace align="center">
          <NButton size="small" quaternary @click="router.push('/lab')">
            <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
            返回地图
          </NButton>
          <span class="asm-title">
            {{ assembly?.root.template_name || subjectId }}
          </span>
          <NTag size="small" :bordered="false" type="info">2.5D 装配视图</NTag>
        </NSpace>
        <NSpace align="center" :size="10">
          <div class="view-switch" role="group" aria-label="装配视角">
            <button
              v-for="option in VIEW_OPTIONS"
              :key="option.value"
              class="view-button"
              :class="{ active: Math.round(yawNorm) === option.value }"
              :title="option.label"
              :aria-label="option.label"
              :aria-pressed="Math.round(yawNorm) === option.value"
              @click="setYaw(option.value)"
            >
              {{ option.label.slice(0, 2) }}
            </button>
          </div>
          <NButton size="small" quaternary @click="load">刷新</NButton>
        </NSpace>
      </NSpace>
    </NCard>

    <div v-if="!conn.online" class="degraded">尚未连接微后端，装配状态将在连接恢复后重新校准。</div>
    <NSpin v-else-if="loading" style="margin: 64px auto; display: block" />
    <NEmpty v-else-if="error" :description="error" style="margin: 64px 0" />

    <div v-else class="asm-layout">
      <NCard :bordered="false" class="asm-canvas-card">
        <svg
          ref="svgRef"
          :viewBox="viewBox"
          class="asm-svg"
          :class="{ rotating: dragPointerId !== null }"
          @pointerdown="onSvgPointerDown"
          @pointermove="onSvgPointerMove"
          @pointerup="onSvgPointerUp"
          @pointercancel="onSvgPointerUp"
        >
          <g
            v-for="b in boxes"
            :key="b.uuid"
            :data-material-uuid="b.node?.edge_uuid"
            class="iso-box"
            :class="{ dim: hoverUuid && hoverUuid !== b.uuid && !b.slot, slot: b.slot }"
            @click="b.slot || Date.now() < suppressClickUntil || selectNode(b.node)"
            @mouseenter="b.slot || (hoverUuid = b.uuid)"
            @mouseleave="b.slot || (hoverUuid = '')"
          >
            <polygon
              v-for="(face, fi) in b.sides"
              :key="fi"
              :points="face.points"
              :fill="face.fill"
            />
            <polygon
              :points="b.top"
              :fill="b.color"
              :stroke="b.slot ? 'rgba(71, 85, 105, 0.55)' : selected?.edge_uuid === b.uuid ? '#1d4ed8' : 'rgba(0,0,0,0.15)'"
              :stroke-width="selected?.edge_uuid === b.uuid ? 2 : 0.75"
              :stroke-dasharray="b.slot ? '3 2' : undefined"
            />
            <text
              v-if="b.label"
              :x="b.labelAt.sx"
              :y="b.labelAt.sy"
              text-anchor="middle"
              class="iso-label"
              :class="{ 'slot-label': b.slot }"
            >
              {{ b.label }}
            </text>
            <title>{{ b.slot ? `空位点 ${b.label}` : b.node?.template_name || b.uuid }}</title>
          </g>
        </svg>
        <div class="asm-hint">
          当前 {{ viewLabel }} · <b>按住画布左右拖动可旋转视角</b>，按钮为四个吸附方位；
          点击部件查看详情；红色管表示液量低于 1/3。
        </div>
      </NCard>

      <NCard title="部件详情" :bordered="false" class="asm-detail-card">
        <NEmpty v-if="!selected" description="点击左侧部件" />
        <template v-else>
          <NDescriptions :column="1" size="small" label-placement="left">
            <NDescriptionsItem label="名称">
              {{ selected.template_name || selected.template_id || "（无模板）" }}
            </NDescriptionsItem>
            <NDescriptionsItem label="UUID">
              <span class="mono">{{ selected.edge_uuid }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem v-if="selected.barcode" label="条码">
              <span class="mono">{{ selected.barcode }}</span>
            </NDescriptionsItem>
            <NDescriptionsItem label="状态">
              <NTag size="small" :bordered="false">
                {{ STATUS_LABEL[selected.status] ?? selected.status }}
              </NTag>
            </NDescriptionsItem>
            <!-- slot_id 是 PLR Site 名投影；UI 统一称「库位」（terminology.ts） -->
            <NDescriptionsItem v-if="selected.slot_id" :label="TERMS.siteIndex">
              {{ selected.slot_id }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="selected.category" label="类别">
              {{ selected.category }}
            </NDescriptionsItem>
            <NDescriptionsItem v-if="selected.content?.substance" label="内容物">
              {{ selected.content.substance }}
            </NDescriptionsItem>
            <NDescriptionsItem
              v-if="typeof selected.content?.volume_ml === 'number'"
              label="体积"
            >
              {{ selected.content.volume_ml }} mL
              <template v-if="fillRatio(selected) !== null">
                （{{ Math.round(fillRatio(selected)! * 100) }}%）
              </template>
            </NDescriptionsItem>
            <NDescriptionsItem v-if="selected.children.length" label="子件数">
              {{ selected.children.length }}
            </NDescriptionsItem>
          </NDescriptions>

          <div v-if="fillRatio(selected) !== null" class="fill-bar-wrap">
            <div class="fill-bar" :style="{ width: `${fillRatio(selected)! * 100}%` }" />
          </div>
        </template>
      </NCard>
    </div>
  </NSpace>
</template>

<style scoped>
.asm-title {
  font-size: 16px;
  font-weight: 700;
  color: #18181b;
}

.view-switch {
  display: inline-flex;
  padding: 3px;
  border: 1px solid #deddd8;
  border-radius: 9px;
  background: #f7f7f5;
}

.view-button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  height: 28px;
  padding: 0 9px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: #6e7580;
  font: 11px var(--font-sans);
  cursor: pointer;
}

.view-button:hover {
  color: #101418;
}

.view-button.active {
  color: #fff;
  background: #101418;
  box-shadow: 0 1px 3px rgba(16, 20, 24, 0.18);
}

.asm-layout {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 16px;
  align-items: start;
}

.asm-svg {
  width: 100%;
  max-height: 560px;
  display: block;
  background: linear-gradient(180deg, #fafafa 0%, #f4f4f5 100%);
  border: 1px solid #e4e4e7;
  border-radius: 10px;
  cursor: grab;
  touch-action: none; /* 移动端拖旋转不触发页面滚动 */
  user-select: none;
}

.asm-svg.rotating {
  cursor: grabbing;
}

.iso-box {
  cursor: pointer;
  transition: opacity 0.12s;
}

.iso-box.dim {
  opacity: 0.55;
}

.iso-box.slot {
  cursor: default;
}

.iso-label {
  font-size: 9px;
  fill: #3f3f46;
  font-weight: 600;
  pointer-events: none;
}

.iso-label.slot-label {
  fill: #64748b;
  font-weight: 500;
}

.asm-hint {
  margin-top: 8px;
  font-size: 12px;
  color: #a1a1aa;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.fill-bar-wrap {
  margin-top: 12px;
  height: 8px;
  background: #f4f4f5;
  border-radius: 4px;
  overflow: hidden;
}

.fill-bar {
  height: 100%;
  background: linear-gradient(90deg, #34d399, #10b981);
}

@media (max-width: 900px) {
  .asm-layout {
    grid-template-columns: 1fr;
  }

  .view-button {
    width: 30px;
    padding: 0;
    justify-content: center;
    font-size: 0;
  }

  .view-button span {
    font-size: 13px;
  }
}
</style>
