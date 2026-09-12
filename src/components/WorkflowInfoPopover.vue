<script setup lang="ts">
/**
 * Workflow 定义信息卡：hover 弹层展示定义基础信息与图谱统计。
 *
 * 图谱统计（节点/设备/边）不在定义列表接口里，弹层首次打开时才懒加载
 * GET /workflows/{uuid}/graph，结果按 uuid 缓存并校验 revision——列表行的
 * revision 与缓存不一致时重拉，避免展示过期统计。
 */
import { computed, ref, shallowRef } from "vue";
import { NIcon, NPopover, NSpin, NTag } from "naive-ui";
import { CopyOutline } from "@vicons/ionicons5";
import type { BackendWorkflow, BackendWorkflowGraph } from "@openlab/protocol";
import { computeWorkflowGraphStats } from "../features/workflow-graph-stats";
import { useConnectionStore } from "../stores/connection";
import { describeError } from "../features/errors";

const props = defineProps<{
  /** Workflow 定义 UUID。 */
  uuid: string;
  /** 列表行已有的定义 DTO；缺省时以 graph.workflow 兜底。 */
  workflow?: BackendWorkflow;
}>();

/** 模块级缓存：uuid → 整图。revision 校验在读取时做，命中即不再请求。 */
const graphCache = new Map<string, BackendWorkflowGraph>();
const inflight = new Map<string, Promise<BackendWorkflowGraph>>();

const conn = useConnectionStore();
const graph = shallowRef<BackendWorkflowGraph | null>(null);
const loading = ref(false);
const loadError = ref("");
const copied = ref(false);

const MAX_DEVICE_ROWS = 6;

const info = computed(() => props.workflow ?? graph.value?.workflow ?? null);

const stats = computed(() =>
  graph.value ? computeWorkflowGraphStats(graph.value.nodes, graph.value.edges) : null,
);

const deviceRows = computed(() => stats.value?.devices.slice(0, MAX_DEVICE_ROWS) ?? []);
const hiddenDeviceCount = computed(() =>
  Math.max(0, (stats.value?.deviceCount ?? 0) - deviceRows.value.length),
);

function fmtIso(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

function cacheUsable(cached: BackendWorkflowGraph | undefined): cached is BackendWorkflowGraph {
  if (!cached) return false;
  // 行内 revision 已知且与缓存不一致 → 定义已更新，需重拉
  return props.workflow == null || cached.workflow.revision === props.workflow.revision;
}

async function ensureGraph() {
  const cached = graphCache.get(props.uuid);
  if (cacheUsable(cached)) {
    graph.value = cached;
    return;
  }
  loading.value = true;
  loadError.value = "";
  try {
    let pending = inflight.get(props.uuid);
    if (!pending) {
      pending = conn.api.domains.workflowBackend.graph(props.uuid);
      inflight.set(props.uuid, pending);
      pending.finally(() => inflight.delete(props.uuid)).catch(() => {});
    }
    const next = await pending;
    graphCache.set(props.uuid, next);
    graph.value = next;
  } catch (err) {
    loadError.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

function onShowChange(show: boolean) {
  if (show) void ensureGraph();
}

async function copyUuid() {
  try {
    await navigator.clipboard.writeText(props.uuid);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}
</script>

<template>
  <NPopover
    trigger="hover"
    :delay="250"
    placement="right-start"
    style="max-width: 380px"
    @update:show="onShowChange"
  >
    <template #trigger>
      <slot />
    </template>
    <div class="wf-pop">
      <div class="wf-name">{{ info?.name ?? uuid }}</div>

      <button class="wf-uuid" type="button" :title="copied ? '已复制' : '点击复制 UUID'" @click="copyUuid">
        <span class="mono">{{ uuid }}</span>
        <span class="copy-mark">
          <NIcon size="12"><CopyOutline /></NIcon>
          {{ copied ? "已复制" : "复制" }}
        </span>
      </button>

      <div v-if="info" class="wf-row">
        <span class="wf-label">版本</span>
        <span>revision {{ info.revision }}</span>
      </div>
      <div v-if="info?.tags.length" class="wf-row">
        <span class="wf-label">标签</span>
        <span class="wf-tags">
          <NTag v-for="(tag, i) in info.tags" :key="i" size="small">{{ String(tag) }}</NTag>
        </span>
      </div>
      <div v-if="info?.description" class="wf-row">
        <span class="wf-label">描述</span>
        <span class="wf-desc">{{ info.description }}</span>
      </div>
      <div v-if="info" class="wf-row">
        <span class="wf-label">创建</span>
        <span>{{ fmtIso(info.create_time) }}</span>
      </div>
      <div v-if="info" class="wf-row">
        <span class="wf-label">更新</span>
        <span>{{ fmtIso(info.update_time) }}</span>
      </div>

      <div class="wf-divider" />

      <div v-if="loading" class="wf-loading">
        <NSpin :size="14" />
        <span>正在读取图谱…</span>
      </div>
      <div v-else-if="loadError" class="wf-error">图谱读取失败：{{ loadError }}</div>
      <template v-else-if="stats">
        <div class="wf-stats">
          <span class="wf-stat"><b>{{ stats.nodeCount }}</b> 节点</span>
          <span class="wf-stat"><b>{{ stats.deviceCount }}</b> 设备</span>
          <span class="wf-stat"><b>{{ stats.edgeCount }}</b> 边</span>
        </div>
        <div v-if="stats.nodeCount === 0" class="wf-empty">该定义尚未保存 Graph</div>
        <template v-else>
          <div v-for="d in deviceRows" :key="d.deviceId" class="wf-device">
            <span class="mono wf-device-id">{{ d.deviceId }}</span>
            <span class="wf-device-count">{{ d.nodeCount }} 个节点</span>
          </div>
          <div v-if="hiddenDeviceCount > 0" class="wf-more">等 {{ hiddenDeviceCount }} 个设备</div>
          <div v-if="stats.deviceCount === 0" class="wf-empty">节点未引用设备</div>
        </template>
      </template>
    </div>
  </NPopover>
</template>

<style scoped>
.wf-pop {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 260px;
}

.wf-name {
  font-size: 13px;
  font-weight: 700;
  color: #101418;
  word-break: break-all;
}

.wf-uuid {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border: 1px solid #e8e6e1;
  background: #fafaf8;
  border-radius: 7px;
  padding: 4px 8px;
  font-size: 10.5px;
  color: #6e7580;
  cursor: pointer;
  text-align: left;
  transition: border-color 0.15s ease;
}

.wf-uuid:hover {
  border-color: var(--domain-accent, #2563eb);
}

.wf-uuid .mono {
  word-break: break-all;
}

.copy-mark {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-weight: 700;
  color: var(--domain-accent, #2563eb);
}

.wf-row {
  display: flex;
  gap: 8px;
  font-size: 11.5px;
  color: #3d4650;
}

.wf-label {
  flex-shrink: 0;
  width: 28px;
  color: #8b929c;
}

.wf-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.wf-desc {
  word-break: break-all;
}

.wf-divider {
  height: 1px;
  background: #ece9e4;
  margin: 2px 0;
}

.wf-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11.5px;
  color: #6e7580;
}

.wf-error {
  font-size: 11.5px;
  color: #b4232c;
}

.wf-stats {
  display: flex;
  gap: 14px;
  font-size: 11.5px;
  color: #3d4650;
}

.wf-stat b {
  font-size: 13px;
  color: #101418;
}

.wf-device {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  font-size: 11.5px;
  color: #3d4650;
}

.wf-device-id {
  word-break: break-all;
}

.wf-device-count {
  flex-shrink: 0;
  color: #8b929c;
}

.wf-more,
.wf-empty {
  font-size: 11.5px;
  color: #8b929c;
}

.mono {
  font-family: var(--font-mono);
  font-size: 0.95em;
}
</style>
