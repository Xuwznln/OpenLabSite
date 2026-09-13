<script setup lang="ts">
/**
 * 可安装的驱动包目录。
 *
 * 主来源是 awesome-lab-devices 索引（浏览器直接读 index.json，与 Edge 是否出网无关），
 * 补充来源是后端 GET /driver-packages/catalog（Edge 侧内网镜像 + 本地 catalog 文件）。
 * 点「安装」把 spec + name 交给父组件走安装流程（POST /driver-packages/install）。
 */
import { computed, onMounted, ref, shallowRef, watch } from "vue";
import { NButton, NEmpty, NInput, NPopover, NPopconfirm, NTag, NTooltip } from "naive-ui";
import type { DriverPackageCatalog } from "@openlab/protocol";
import {
  DEFAULT_DEVICE_INDEX_URL,
  DEVICE_INDEX_REPO_URL,
  deviceIndexRepoUrl,
  fetchDeviceIndex,
  filterRows,
  mergeCatalog,
  normalizePackageName,
  readDeviceIndexUrl,
  saveDeviceIndexUrl,
  type CatalogRow,
  type DeviceIndex,
} from "../features/device-index";
import { describeError } from "../features/errors";
import { useConnectionStore } from "../stores/connection";

const props = defineProps<{
  /** 后端台账里的包名，用来标「已登记」。 */
  installedNames: string[];
  /** 父组件正在启动的包名（台账名），对应行的「启动」按钮转圈。 */
  launching?: string | null;
}>();
const emit = defineEmits<{
  (e: "install", spec: string, upgrade: boolean, name: string): void;
  /** 已登记的包：把随包设备图作为受管进程启动；参数是台账里的包名。 */
  (e: "launch", name: string): void;
  (e: "uninstall", name: string): void;
}>();

const conn = useConnectionStore();

const indexUrl = ref(readDeviceIndexUrl());
const index = shallowRef<DeviceIndex | null>(null);
const indexError = ref("");
const indexLoading = ref(false);

const edgeCatalog = shallowRef<DriverPackageCatalog | null>(null);
const edgeError = ref("");

const query = ref("");
const urlEditorOpen = ref(false);
const urlDraft = ref("");

async function loadIndex() {
  indexLoading.value = true;
  indexError.value = "";
  try {
    index.value = await fetchDeviceIndex(indexUrl.value);
  } catch (error) {
    index.value = null;
    indexError.value = error instanceof Error ? error.message : String(error);
  } finally {
    indexLoading.value = false;
  }
}

async function loadEdgeCatalog() {
  if (!conn.online) return;
  try {
    edgeCatalog.value = await conn.api.domains.driverPackages.catalog();
    edgeError.value = "";
  } catch (error) {
    // 老版本后端没有这个接口：目录只剩索引，不算故障
    edgeCatalog.value = null;
    edgeError.value = describeError(error);
  }
}

async function refresh() {
  await Promise.all([loadIndex(), loadEdgeCatalog()]);
}

const merged = computed(() => mergeCatalog(index.value, edgeCatalog.value, props.installedNames));
const visible = computed(() => filterRows(merged.value.rows, query.value));
const edgeRemote = computed(() => merged.value.sources.find((item) => item.kind === "edge-remote"));
const edgeLocal = computed(() => merged.value.sources.find((item) => item.kind === "edge-local"));
const repoUrl = computed(() => deviceIndexRepoUrl(indexUrl.value));
const isDefaultIndex = computed(() => indexUrl.value === DEFAULT_DEVICE_INDEX_URL);
const indexLabel = computed(() => {
  if (index.value?.name) return index.value.name;
  try {
    return new URL(indexUrl.value).host;
  } catch {
    return "索引";
  }
});

function openUrlEditor() {
  urlDraft.value = indexUrl.value;
  urlEditorOpen.value = true;
}

function applyUrl(value: string) {
  indexUrl.value = saveDeviceIndexUrl(value);
  urlEditorOpen.value = false;
  void loadIndex();
}

function sourceLabel(row: CatalogRow): string {
  if (row.source === "index") return row.official ? "官方" : "社区";
  if (row.source === "edge-remote") return "Edge 镜像";
  return "本地目录";
}

function install(row: CatalogRow) {
  // 已登记的条目再点就是"重装 / 升级"：重新下载源码树并升级依赖
  emit("install", row.spec, row.installed, row.name);
}

/** 索引名与台账名只在大小写 / -_ 上可能不同：启动要用台账里的名字。 */
function ledgerName(row: CatalogRow): string {
  const key = normalizePackageName(row.name);
  return props.installedNames.find((name) => normalizePackageName(name) === key) ?? row.name;
}

function launch(row: CatalogRow) {
  emit("launch", ledgerName(row));
}

function isLaunching(row: CatalogRow): boolean {
  return !!props.launching && normalizePackageName(props.launching) === normalizePackageName(row.name);
}

watch(
  () => conn.online,
  (online) => {
    if (online && !edgeCatalog.value) void loadEdgeCatalog();
  },
);

onMounted(() => void refresh());
defineExpose({ refresh });
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div class="head-text">
        <span class="card-title">可安装的驱动包</span>
        <span class="dim small source-line">
          <span>索引</span>
          <a :href="repoUrl" target="_blank" rel="noreferrer" class="link">{{ indexLabel }}</a>
          <template v-if="indexLoading">· 读取中…</template>
          <template v-else-if="indexError">· <span class="err">不可达：{{ indexError }}</span></template>
          <template v-else-if="index">
            · {{ index.packages.length }} 个包<template v-if="index.updatedAt">，更新于 {{ index.updatedAt }}</template>
          </template>
          <NPopover trigger="click" :show="urlEditorOpen" placement="bottom-start" @update:show="(v) => (urlEditorOpen = v)">
            <template #trigger>
              <a class="link small" href="#" @click.prevent="openUrlEditor">{{ isDefaultIndex ? "更换地址" : "自定义地址" }}</a>
            </template>
            <div class="url-editor">
              <div class="dim small">索引 JSON 地址（内网镜像 / fork）。留空恢复默认。</div>
              <NInput v-model:value="urlDraft" size="small" placeholder="https://…/index.json" @keydown.enter="applyUrl(urlDraft)" />
              <div class="url-actions">
                <NButton size="tiny" quaternary @click="applyUrl('')">恢复默认</NButton>
                <NButton size="tiny" type="primary" @click="applyUrl(urlDraft)">使用</NButton>
              </div>
            </div>
          </NPopover>
          <template v-if="edgeRemote">
            <span>· Edge 镜像 {{ edgeRemote.ok ? `${edgeRemote.count} 项` : "不可达" }}</span>
          </template>
          <template v-if="edgeLocal && !edgeLocal.missing">
            <span>· 本地目录 {{ edgeLocal.count }} 项</span>
          </template>
        </span>
      </div>
      <div class="head-actions">
        <NInput v-model:value="query" size="small" clearable placeholder="搜索名称 / 设备 / 标签" style="width: 200px" />
        <NButton size="small" :loading="indexLoading" @click="refresh">刷新</NButton>
      </div>
    </div>

    <NEmpty v-if="!visible.length" style="padding: 20px 0">
      <template #default>
        <div v-if="merged.rows.length" class="dim small">没有匹配的包</div>
        <div v-else class="dim small empty-hint">
          <template v-if="indexError">
            索引读不到（{{ indexError }}）。可以换成内网镜像地址，或在右侧直接按 GitHub 仓库地址 / 本机目录安装。
          </template>
          <template v-else>
            索引为空。给 <a :href="DEVICE_INDEX_REPO_URL" target="_blank" rel="noreferrer" class="link">awesome-lab-devices</a>
            提 PR 收录你的包，或在 Edge 的 unilabos_data/driver_package_catalog.json 登记实验室自用包。
          </template>
        </div>
      </template>
    </NEmpty>
    <ul v-else class="catalog">
      <li v-for="row in visible" :key="`${row.source}:${row.name}`" class="entry">
        <div class="entry-main">
          <div class="entry-title">
            <span class="entry-name">{{ row.name }}</span>
            <NTag size="tiny" :type="row.source === 'index' && row.official ? 'success' : 'default'" :bordered="false">{{ sourceLabel(row) }}</NTag>
            <NTag v-if="row.category && row.category !== 'device'" size="tiny" :bordered="false" type="warning">{{ row.category }}</NTag>
            <span v-if="row.version" class="mono dim small">v{{ row.version }}</span>
          </div>
          <div v-if="row.description" class="entry-desc">{{ row.description }}</div>
          <div class="entry-meta">
            <span v-for="device in row.devices.slice(0, 6)" :key="device" class="mono chip">{{ device }}</span>
            <span v-if="row.devices.length > 6" class="dim small">+{{ row.devices.length - 6 }}</span>
            <a v-if="row.homepage" :href="row.homepage" target="_blank" rel="noreferrer" class="link small">主页</a>
            <NTooltip trigger="hover">
              <template #trigger><span class="mono dim small spec">{{ row.spec }}</span></template>
              来源 {{ row.spec }}（下载源码树到 unilabos_data，不 pip install）
            </NTooltip>
          </div>
        </div>
        <div class="entry-actions">
          <NTag v-if="row.installed" size="small" :bordered="false" type="info">已登记</NTag>
          <NButton
            v-if="row.installed"
            size="small"
            type="primary"
            :loading="isLaunching(row)"
            :disabled="!conn.online"
            title="把随包设备图作为受管设备进程启动（不需要重启 Host）"
            @click="launch(row)"
          >
            启动
          </NButton>
          <NButton
            size="small"
            :type="row.installed ? 'default' : 'primary'"
            :secondary="row.installed"
            :disabled="!conn.online"
            :title="conn.online ? '' : '先连接后端'"
            @click="install(row)"
          >
            {{ row.installed ? "重装 / 升级" : "安装到 Edge" }}
          </NButton>
          <NPopconfirm v-if="row.installed" @positive-click="emit('uninstall', ledgerName(row))">
            <template #trigger>
              <NButton size="small" type="error" secondary :disabled="!conn.online">卸载</NButton>
            </template>
            卸载 {{ ledgerName(row) }}？请先停止使用它的设备进程。下载的源码会被移除，本机原地登记目录不删文件；不清除物料和历史。
          </NPopconfirm>
        </div>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.source-line {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.head-actions {
  display: flex;
  gap: 6px;
}

.card-title {
  font-weight: 700;
  font-size: 13.5px;
  color: #101418;
}

.url-editor {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 360px;
}

.url-actions {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
}

.catalog {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 420px;
  overflow: auto;
}

.entry {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
}

.entry-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.entry-title {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.entry-name {
  font-weight: 600;
}

.entry-desc {
  font-size: 12px;
  color: #3d4650;
}

.entry-meta {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.spec {
  max-width: 320px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.chip {
  font-size: 10.5px;
  padding: 0 6px;
  border-radius: 999px;
  background: #eef0f3;
  color: #3d4650;
}

.entry-actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.empty-hint {
  max-width: 420px;
  text-align: center;
}

.link {
  color: var(--domain-accent);
}

.err {
  color: #c0392b;
}

.mono {
  font-family: var(--font-mono);
}

.small {
  font-size: 11.5px;
}

.dim {
  color: #8b929c;
}
</style>
