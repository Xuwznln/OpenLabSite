<script setup lang="ts">
/**
 * 扫码工作台（扫码枪键盘楔 / 手输条码）。两种用法：
 * - 查找物料：按条码在 materials.v1 里找实例，直达装配 / 物料页；
 * - 绑定条码：先选一件实例（默认挑第一件还没有条码的在库物料），扫码后
 *   PATCH barcode 写回物料权威，然后自动跳到下一件未绑定的实例，适合入库后
 *   连续贴标。每次操作都记入浏览器本地台账，可导出 CSV。
 */
import { computed, nextTick, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import { NButton, NIcon, NSelect, NSpin, NTag, type SelectOption } from "naive-ui";
import {
  CheckmarkCircleOutline,
  CloseCircleOutline,
  DownloadOutline,
  ScanOutline,
} from "@vicons/ionicons5";
import type { MaterialsV1Aggregate } from "@openlab/protocol";
import StatusPill from "./StatusPill.vue";
import { useConnectionStore } from "../stores/connection";
import { describeError } from "../features/errors";

const props = defineProps<{ show: boolean; initialCode?: string }>();
const emit = defineEmits<{ (e: "update:show", v: boolean): void }>();

type ScanMode = "lookup" | "bind";

interface ScanEntry {
  id: string;
  action: ScanMode;
  barcode: string;
  materialUuid: string;
  materialName: string;
  status: string;
  resolved: boolean;
  scannedAt: string;
}

const HISTORY_KEY = "openlab:scanner-history:v1";
const router = useRouter();
const conn = useConnectionStore();

const mode = ref<ScanMode>("lookup");
const code = ref("");
const busy = ref(false);
const searched = ref(false);
const hit = shallowRef<MaterialsV1Aggregate | null>(null);
const bound = shallowRef<MaterialsV1Aggregate | null>(null);
const queryError = ref("");
const inputRef = ref<HTMLInputElement | null>(null);
const history = ref<ScanEntry[]>(loadHistory());
const sessionCount = computed(() => history.value.length);

const instances = shallowRef<MaterialsV1Aggregate[]>([]);
const instancesLoading = ref(false);
const bindTarget = ref<string | null>(null);

function loadHistory(): ScanEntry[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? (parsed.slice(0, 100) as Partial<ScanEntry>[]).map((entry) => ({ action: "lookup", ...entry }) as ScanEntry)
      : [];
  } catch {
    return [];
  }
}

function persistHistory() {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.value.slice(0, 100)));
}

function recordScan(action: ScanMode, barcode: string, material: MaterialsV1Aggregate | null) {
  history.value = [
    {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      action,
      barcode,
      materialUuid: material?.material.material_uuid ?? "",
      materialName: material ? displayName(material) : "未匹配",
      status: material?.material.lifecycle_status ?? "unresolved",
      resolved: Boolean(material),
      scannedAt: new Date().toISOString(),
    },
    ...history.value,
  ].slice(0, 100);
  persistHistory();
}

function displayName(item: MaterialsV1Aggregate): string {
  return item.material.display_name || item.material.name || item.material.template_name || "未命名物料";
}

/** 实例所在位置：父物料（设备 / 台面）名，根层 = 在库。 */
function locationOf(item: MaterialsV1Aggregate): string {
  const parentUuid = item.material.parent_material_uuid;
  if (!parentUuid) return item.material.resource_type === "device" ? "设备" : "在库";
  const parent = instances.value.find((entry) => entry.material.material_uuid === parentUuid);
  return parent ? displayName(parent) : "已上台";
}

async function loadInstances() {
  if (!conn.online) return;
  instancesLoading.value = true;
  try {
    instances.value = await conn.api.domains.materialsV1.instances();
  } catch (error) {
    queryError.value = describeError(error);
  } finally {
    instancesLoading.value = false;
  }
}

/** 板孔 / 枪头位这类子结构不贴标签，不进入候选。 */
const NOT_LABELABLE = new Set(["device", "well", "tip_spot", "tip", "site"]);

/** 可绑定的实例：非设备、非子孔位；没条码的排前面（这是贴标场景的主体）。 */
const bindCandidates = computed(() =>
  instances.value
    .filter((item) => !NOT_LABELABLE.has(item.material.resource_type))
    .sort((a, b) => {
      const labeled = Number(Boolean(a.material.barcode)) - Number(Boolean(b.material.barcode));
      if (labeled) return labeled;
      const rootFirst = Number(Boolean(a.material.parent_material_uuid)) - Number(Boolean(b.material.parent_material_uuid));
      return rootFirst || displayName(a).localeCompare(displayName(b));
    }),
);

const unlabeledCount = computed(() => bindCandidates.value.filter((item) => !item.material.barcode).length);

const bindOptions = computed<SelectOption[]>(() =>
  bindCandidates.value.map((item) => ({
    value: item.material.material_uuid,
    label: `${displayName(item)} · ${item.material.class_name || item.material.resource_type} · ${locationOf(item)}${
      item.material.barcode ? ` · 已有条码 ${item.material.barcode}` : ""
    }`,
  })),
);

const bindMaterial = computed(() =>
  bindTarget.value ? instances.value.find((item) => item.material.material_uuid === bindTarget.value) ?? null : null,
);

function pickNextUnlabeled(exclude?: string) {
  const next = bindCandidates.value.find((item) => !item.material.barcode && item.material.material_uuid !== exclude);
  bindTarget.value = next?.material.material_uuid ?? bindCandidates.value[0]?.material.material_uuid ?? null;
}

function close() {
  emit("update:show", false);
}

function resetResult() {
  searched.value = false;
  hit.value = null;
  bound.value = null;
  queryError.value = "";
}

async function setMode(next: ScanMode) {
  mode.value = next;
  resetResult();
  if (next === "bind") {
    if (!instances.value.length) await loadInstances();
    if (!bindTarget.value) pickNextUnlabeled();
  }
  await nextTick();
  inputRef.value?.focus();
}

async function submit() {
  if (mode.value === "bind") await bind();
  else await lookup();
}

async function lookup() {
  const barcode = code.value.trim();
  if (!barcode || busy.value) return;
  busy.value = true;
  resetResult();
  try {
    await loadInstances();
    hit.value = instances.value.find((item) => item.material.barcode === barcode) ?? null;
    recordScan("lookup", barcode, hit.value);
  } catch (error) {
    queryError.value = describeError(error);
    recordScan("lookup", barcode, null);
  } finally {
    busy.value = false;
    searched.value = true;
  }
}

async function bind() {
  const barcode = code.value.trim();
  const target = bindMaterial.value;
  if (!barcode || busy.value) return;
  if (!target) {
    queryError.value = "先选择要绑定的实例";
    searched.value = true;
    return;
  }
  const taken = instances.value.find(
    (item) => item.material.barcode === barcode && item.material.material_uuid !== target.material.material_uuid,
  );
  if (taken) {
    queryError.value = `条码 ${barcode} 已绑定在「${displayName(taken)}」上，请换一张标签`;
    searched.value = true;
    return;
  }
  busy.value = true;
  resetResult();
  try {
    const result = await conn.api.domains.materialsV1.patch(target.material.material_uuid, { barcode });
    bound.value = result.data;
    recordScan("bind", barcode, result.data);
    await loadInstances();
    pickNextUnlabeled(target.material.material_uuid);
  } catch (error) {
    queryError.value = `绑定失败：${describeError(error)}`;
  } finally {
    busy.value = false;
    searched.value = true;
  }
}

async function nextScan() {
  code.value = "";
  resetResult();
  await nextTick();
  inputRef.value?.focus();
}

/** 查找未命中 → 直接切到绑定模式，条码保留。 */
async function bindThisCode() {
  await setMode("bind");
}

function openAssembly(material: MaterialsV1Aggregate) {
  close();
  void router.push(`/lab/assembly/${encodeURIComponent(material.material.material_uuid)}`);
}

function openInventory() {
  close();
  void router.push("/inventory");
}

function csvCell(value: unknown): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

function exportCsv() {
  if (!history.value.length) return;
  const rows = [
    ["scanned_at", "action", "barcode", "resolved", "material_uuid", "material_name", "status"],
    ...history.value.map((entry) => [
      entry.scannedAt,
      entry.action,
      entry.barcode,
      entry.resolved ? "yes" : "no",
      entry.materialUuid,
      entry.materialName,
      entry.status,
    ]),
  ];
  const blob = new Blob(["\ufeff", rows.map((row) => row.map(csvCell).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `openlab-scans-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function clearHistory() {
  history.value = [];
  persistHistory();
}

function fmtTime(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

watch(
  () => props.show,
  async (show) => {
    if (!show) return;
    code.value = props.initialCode ?? "";
    resetResult();
    void loadInstances().then(() => {
      if (mode.value === "bind" && !bindTarget.value) pickNextUnlabeled();
    });
    await nextTick();
    inputRef.value?.focus();
    if (code.value && mode.value === "lookup") void lookup();
  },
);
</script>

<template>
  <Teleport to="body">
    <Transition name="scan">
      <div v-if="show" class="scan-mask" @click.self="close">
        <div class="scan-panel" role="dialog" aria-label="扫码工作台">
          <div class="scan-head">
            <div class="scan-beam" :class="{ idle: !busy }" />
            <NIcon size="20" class="scan-icon"><ScanOutline /></NIcon>
            <div class="scan-heading">
              <span class="scan-title">扫码工作台</span>
              <span>materials.v1 · 本地台账 {{ sessionCount }} 条</span>
            </div>
            <div class="mode-switch" role="tablist">
              <button type="button" class="mode-btn" :class="{ on: mode === 'lookup' }" role="tab" @click="setMode('lookup')">查找物料</button>
              <button type="button" class="mode-btn" :class="{ on: mode === 'bind' }" role="tab" @click="setMode('bind')">
                绑定条码<span v-if="unlabeledCount" class="mode-badge">{{ unlabeledCount }}</span>
              </button>
            </div>
            <kbd class="scan-esc">esc</kbd>
          </div>

          <!-- 绑定模式：先选实例 -->
          <div v-if="mode === 'bind'" class="bind-target">
            <span class="bind-label">绑定到</span>
            <NSelect
              v-model:value="bindTarget"
              size="small"
              filterable
              :loading="instancesLoading"
              :options="bindOptions"
              placeholder="选择要贴标的实例（默认第一件未绑定条码的在库物料）"
              class="bind-select"
            />
            <NButton size="tiny" quaternary :loading="instancesLoading" @click="loadInstances">刷新</NButton>
          </div>
          <div v-if="mode === 'bind' && bindMaterial" class="bind-note">
            <span class="mono">{{ bindMaterial.material.class_name }}</span>
            · {{ locationOf(bindMaterial) }}
            <template v-if="bindMaterial.material.barcode">
              · <span class="warn">已有条码 {{ bindMaterial.material.barcode }}，扫码将覆盖</span>
            </template>
            <template v-else>· 尚无条码</template>
            <span class="dim">· 剩余 {{ unlabeledCount }} 件未绑定</span>
          </div>

          <div class="scan-input-row">
            <input
              ref="inputRef"
              v-model="code"
              class="scan-input mono"
              :placeholder="mode === 'bind' ? (bindMaterial ? `扫描条码，绑定到「${displayName(bindMaterial)}」` : '先选择实例') : '用扫码枪扫描，或输入条码后回车查找'"
              :disabled="mode === 'bind' && !bindMaterial"
              @keydown.enter.prevent="submit"
              @keydown.esc="close"
            />
            <NButton size="small" type="primary" :loading="busy" :disabled="mode === 'bind' && !bindMaterial" @click="submit">
              {{ mode === "bind" ? "绑定" : "查找" }}
            </NButton>
          </div>

          <div class="scan-result">
            <NSpin v-if="busy" size="small" style="margin: 24px auto; display: block" />

            <!-- 绑定成功 -->
            <template v-else-if="searched && bound">
              <div class="hit-head">
                <NIcon size="18" color="#0e9f6e"><CheckmarkCircleOutline /></NIcon>
                <span class="hit-name">已绑定 <b class="mono">{{ bound.material.barcode }}</b> → {{ displayName(bound) }}</span>
              </div>
              <div class="hit-rows mono">
                <div class="hit-row"><span>Material</span><b>{{ bound.material.material_uuid }}</b></div>
                <div class="hit-row"><span>类</span><b>{{ bound.material.class_name }}</b></div>
                <div class="hit-row"><span>位置</span><b>{{ locationOf(bound) }}</b></div>
              </div>
              <div class="hit-actions">
                <NButton size="small" type="primary" secondary @click="nextScan">
                  {{ bindMaterial ? `继续：${displayName(bindMaterial)}` : "继续" }}
                </NButton>
                <NButton size="small" quaternary @click="openInventory">物料页</NButton>
              </div>
            </template>

            <!-- 查找命中 -->
            <template v-else-if="searched && hit">
              <div class="hit-head">
                <NIcon size="18" color="#0e9f6e"><CheckmarkCircleOutline /></NIcon>
                <span class="hit-name">{{ displayName(hit) }}</span>
                <StatusPill :status="hit.material.lifecycle_status" size="small" />
              </div>
              <div class="hit-rows mono">
                <div class="hit-row"><span>条码</span><b>{{ hit.material.barcode }}</b></div>
                <div class="hit-row"><span>Material</span><b>{{ hit.material.material_uuid }}</b></div>
                <div class="hit-row"><span>类</span><b>{{ hit.material.class_name || hit.material.template_name }}</b></div>
                <div class="hit-row"><span>位置</span><b>{{ locationOf(hit) }}</b></div>
                <div v-if="hit.material.lot_uuid" class="hit-row"><span>批次</span><b>{{ hit.material.lot_uuid }}</b></div>
              </div>
              <div class="hit-actions">
                <NButton size="small" type="primary" secondary @click="nextScan">继续查找</NButton>
                <NButton size="small" secondary @click="openAssembly(hit)">查看装配</NButton>
                <NButton size="small" quaternary @click="openInventory">物料页</NButton>
              </div>
            </template>

            <!-- 未命中 / 出错 -->
            <div v-else-if="searched" class="miss">
              <NIcon size="18" color="#dc2626"><CloseCircleOutline /></NIcon>
              <span v-if="queryError">{{ queryError }}</span>
              <span v-else>没有物料带条码 <b class="mono">{{ code }}</b>；如果这是新标签，可以把它绑定到一件实例上。</span>
              <NButton v-if="!queryError && mode === 'lookup'" size="tiny" type="primary" secondary @click="bindThisCode">绑定到实例…</NButton>
              <NButton size="tiny" secondary @click="nextScan">重新扫</NButton>
            </div>

            <div v-else class="scan-tip">
              <template v-if="mode === 'bind'">
                连续贴标：扫一张，写回一件，自动跳到下一件未绑定的实例。条码写入物料权威（PATCH barcode），重复条码会被拦下。
              </template>
              <template v-else>
                支持条码枪 / 二维码枪键盘楔模式。按条码在 <code>/api/v1/materials/instances</code> 里查找实例；未命中可一键转为绑定。
              </template>
            </div>
          </div>

          <section class="scan-history">
            <div class="history-head">
              <div><span>最近操作</span><NTag size="tiny" :bordered="false">最多保留 100 条</NTag></div>
              <div>
                <NButton size="tiny" quaternary :disabled="!history.length" @click="clearHistory">清空</NButton>
                <NButton size="tiny" secondary :disabled="!history.length" @click="exportCsv">
                  <template #icon><NIcon><DownloadOutline /></NIcon></template>导出 CSV
                </NButton>
              </div>
            </div>
            <div v-if="history.length" class="history-list">
              <div v-for="entry in history.slice(0, 6)" :key="entry.id" class="history-row">
                <span class="history-state" :class="{ resolved: entry.resolved }" />
                <div>
                  <b class="mono">{{ entry.barcode }}</b>
                  <span>{{ entry.action === "bind" ? "绑定 → " : "" }}{{ entry.materialName }}</span>
                </div>
                <time>{{ fmtTime(entry.scannedAt) }}</time>
              </div>
            </div>
            <div v-else class="history-empty">本次尚无扫码记录</div>
          </section>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.scan-mask { position: fixed; inset: 0; z-index: 1000; background: rgba(12,16,20,.5); backdrop-filter: blur(4px); display: flex; justify-content: center; padding-top: 9vh; }
.scan-panel { width: min(600px, calc(100vw - 32px)); max-height: 82vh; overflow: auto; align-self: flex-start; background: #fff; border: 1px solid #e8e6e1; border-radius: 18px; box-shadow: 0 28px 80px -20px rgba(12,16,20,.46); }
.scan-head { position: relative; display: flex; align-items: center; gap: 10px; padding: 15px 17px 13px; border-bottom: 1px solid #f0eee9; overflow: hidden; }
.scan-beam { position: absolute; inset-block: 0; width: 54px; background: linear-gradient(90deg,transparent,rgba(var(--domain-accent-rgb),.16),transparent); animation: beam 1.8s linear infinite; pointer-events: none; }
.scan-beam.idle { animation-duration: 3.6s; }
@keyframes beam { from { left: -60px; } to { left: 100%; } }
.scan-icon { color: var(--domain-accent); }
.scan-heading { display: flex; flex: 1; flex-direction: column; gap: 1px; min-width: 0; }
.scan-title { color: #101418; font-size: 14px; font-weight: 750; }
.scan-heading > span:last-child { color: #9098a1; font: 9.5px var(--font-mono); letter-spacing: .06em; text-transform: uppercase; }
.mode-switch { display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: #f1f0eb; border: 1px solid #e4e2dc; }
.mode-btn { border: 0; border-radius: 999px; padding: 4px 10px; background: transparent; color: #5c6874; font: 600 12px var(--font-sans); cursor: pointer; display: inline-flex; align-items: center; gap: 5px; }
.mode-btn.on { background: #fff; color: #101418; box-shadow: 0 1px 4px rgba(16,20,24,.12); }
.mode-badge { min-width: 16px; height: 16px; padding: 0 5px; border-radius: 8px; background: #b45309; color: #fff; font: 700 10px var(--font-mono); display: inline-flex; align-items: center; justify-content: center; }
.scan-esc { padding: 2px 6px; border: 1px solid #dedbd4; border-radius: 5px; background: #f1f0ec; color: #6e7580; font: 10.5px var(--font-mono); }
.bind-target { display: flex; align-items: center; gap: 8px; padding: 12px 17px 0; }
.bind-label { flex-shrink: 0; color: #5c6874; font-size: 12px; font-weight: 600; }
.bind-select { flex: 1; min-width: 0; }
.bind-note { padding: 6px 17px 0; color: #5c6874; font-size: 11.5px; }
.bind-note .warn { color: #b45309; font-weight: 600; }
.bind-note .dim { color: #9aa1a9; }
.scan-input-row { display: flex; gap: 8px; padding: 12px 17px 4px; }
.scan-input { flex: 1; min-width: 0; padding: 9px 12px; border: 1px solid #e2e1dc; border-radius: 9px; outline: none; color: #101418; font-size: 14px; transition: border-color .15s, box-shadow .15s; }
.scan-input:focus { border-color: var(--domain-accent); box-shadow: 0 0 0 3px var(--domain-accent-soft); }
.scan-input:disabled { background: #f7f6f2; color: #9aa1a9; }
.scan-result { min-height: 96px; padding: 12px 17px 16px; }
.hit-head { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.hit-name { flex: 1; color: #101418; font-size: 14px; font-weight: 700; }
.hit-rows { display: flex; flex-direction: column; gap: 6px; padding: 11px 12px; border: 1px solid #efede8; border-radius: 10px; background: #fafaf8; font-size: 11.5px; }
.hit-row { display: flex; justify-content: space-between; gap: 12px; }
.hit-row span { flex-shrink: 0; color: #9aa1a9; }
.hit-row b { overflow: hidden; color: #3d4650; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
.hit-actions { display: flex; flex-wrap: wrap; gap: 7px; margin-top: 12px; }
.miss { display: flex; align-items: center; flex-wrap: wrap; gap: 8px; padding: 12px 0; color: #3d4650; font-size: 12px; line-height: 1.5; }
.miss span { flex: 1; min-width: 200px; }
.scan-tip { padding: 8px 0; color: #939ba3; font-size: 12px; line-height: 1.65; }
.scan-history { border-top: 1px solid #efede9; background: #fafaf8; padding: 14px 17px 17px; }
.history-head, .history-head > div { display: flex; align-items: center; justify-content: space-between; gap: 7px; }
.history-head > div:first-child > span { color: #555f69; font-size: 11px; font-weight: 750; letter-spacing: .08em; text-transform: uppercase; }
.history-list { display: flex; flex-direction: column; margin-top: 10px; }
.history-row { display: grid; grid-template-columns: 7px minmax(0,1fr) auto; align-items: center; gap: 10px; padding: 8px 2px; border-top: 1px solid #edebe6; }
.history-state { width: 6px; height: 6px; border-radius: 50%; background: #d97706; }
.history-state.resolved { background: #0e9f6e; }
.history-row div { display: flex; min-width: 0; gap: 8px; align-items: baseline; }
.history-row b { color: #2e3740; font-size: 10.5px; }
.history-row div span { overflow: hidden; color: #8a929a; font-size: 10.5px; text-overflow: ellipsis; white-space: nowrap; }
.history-row time { color: #a2a8ae; font: 9px var(--font-mono); }
.history-empty { padding: 16px 0 5px; color: #a1a7ad; font-size: 11px; text-align: center; }
.scan-enter-active,.scan-leave-active { transition: opacity .16s ease; }
.scan-enter-from,.scan-leave-to { opacity: 0; }
@media (max-width: 540px) { .scan-mask { padding-top: 3vh; }.scan-panel { max-height: 94vh; }.history-row { grid-template-columns: 7px 1fr; }.history-row time { display: none; } .mode-switch { display: none; } }
</style>
