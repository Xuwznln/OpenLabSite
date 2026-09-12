<script setup lang="ts">
/**
 * 实体引用：全局统一的 UUID 展示格式。
 *
 * 行内只显示实体的名称 / id（物料名、流程名、任务标题、设备名、批次号…），
 * hover 弹层再给类型、状态、描述、层级路径、模板 / 分类、资源 ID 与完整 UUID
 * （可一键复制），有页面的实体还能直接跳转。索引未命中时以短码兜底。
 */
import { computed, ref } from "vue";
import { useRouter } from "vue-router";
import { NPopover } from "naive-ui";
import StatusPill from "./StatusPill.vue";
import { entityKindLabel, useEntityCacheStore } from "../stores/entity-cache";

const props = defineProps<{
  /** 实体 UUID（或任意长 ID）。 */
  uuid: string;
  /** 显式名称；缺省时查 entity-cache。 */
  label?: string;
  /** 展示为等宽字体（用于纯 ID 风格的列）。 */
  mono?: boolean;
}>();

const cache = useEntityCacheStore();
const router = useRouter();
const copied = ref(false);

const info = computed(() => (props.uuid ? cache.resolve(props.uuid) : undefined));

function shortCode(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}…` : value;
}

const display = computed(() => {
  if (props.label) return props.label;
  if (info.value) return info.value.name;
  return props.uuid ? shortCode(props.uuid) : "—";
});

const isNamed = computed(() => Boolean(props.label || info.value));

const path = computed(() => {
  if (!info.value) return [] as string[];
  const names = cache.pathOf(props.uuid);
  return names.length > 1 ? names : [];
});

/** 状态是否适合用 StatusPill（任务 / 作业 / 物料生命周期这类枚举值）。 */
const pillStatus = computed(() => {
  const status = info.value?.status;
  if (!status) return "";
  return /^[a-z_]+$/.test(status) ? status : "";
});

async function copyUuid() {
  try {
    await navigator.clipboard.writeText(props.uuid);
    copied.value = true;
    setTimeout(() => (copied.value = false), 1200);
  } catch {
    /* 剪贴板不可用时忽略 */
  }
}

function open() {
  if (info.value?.route) void router.push(info.value.route);
}
</script>

<template>
  <span v-if="!uuid" class="entity-empty">—</span>
  <NPopover v-else trigger="hover" :delay="200" placement="top" style="max-width: 360px">
    <template #trigger>
      <span class="entity-ref" :class="{ mono: mono || !isNamed, deleted: info?.deleted }">{{ display }}</span>
    </template>
    <div class="entity-pop">
      <div class="pop-head">
        <span v-if="info" class="pop-kind">{{ entityKindLabel(info.kind) }}</span>
        <b class="pop-name">{{ display }}</b>
        <span v-if="info?.deleted" class="pop-deleted">已删除</span>
        <StatusPill v-else-if="pillStatus" :status="pillStatus" size="small" />
        <span v-else-if="info?.status" class="pop-status">{{ info.status }}</span>
      </div>
      <div v-if="info?.description" class="pop-desc">{{ info.description }}</div>
      <div v-if="path.length" class="pop-path">
        <template v-for="(seg, i) in path" :key="i">
          <span v-if="i > 0" class="path-sep">›</span>
          <span class="path-seg" :class="{ current: i === path.length - 1 }">{{ seg }}</span>
        </template>
      </div>
      <div v-if="info?.templateName" class="pop-row">
        <span class="pop-label">模板</span><span>{{ info.templateName }}</span>
      </div>
      <div v-if="info?.category" class="pop-row">
        <span class="pop-label">{{ info.kind === "job" ? "设备 · 动作" : info.kind === "workflow" ? "标签" : "分类" }}</span>
        <span>{{ info.category }}</span>
      </div>
      <div v-if="info?.resourceId && info.resourceId !== info.name" class="pop-row">
        <span class="pop-label">ID</span><span class="mono">{{ info.resourceId }}</span>
      </div>
      <button class="pop-uuid" type="button" :title="copied ? '已复制' : '点击复制 UUID'" @click="copyUuid">
        <span class="mono">{{ uuid }}</span>
        <span class="copy-mark">{{ copied ? "已复制" : "复制" }}</span>
      </button>
      <button v-if="info?.route && !info.deleted" class="pop-open" type="button" @click="open">
        打开{{ entityKindLabel(info.kind) }}页 →
      </button>
      <div v-if="!info" class="pop-unknown">索引里没有这个 ID：可能已删除，或属于当前进程之外的对象。</div>
    </div>
  </NPopover>
</template>

<style scoped>
.entity-ref {
  cursor: default;
  border-bottom: 1px dashed rgba(16, 20, 24, 0.22);
  padding-bottom: 1px;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.entity-ref:hover {
  color: var(--domain-accent, #2563eb);
  border-bottom-color: var(--domain-accent, #2563eb);
}

.entity-ref.deleted {
  color: #8b929c;
  text-decoration: line-through;
  text-decoration-color: rgba(139, 146, 156, 0.6);
}

.entity-ref.mono,
.mono {
  font-family: var(--font-mono);
  font-size: 0.92em;
}

.entity-empty {
  color: #a6acb5;
}

.entity-pop {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 240px;
}

.pop-head {
  display: flex;
  align-items: center;
  gap: 7px;
  flex-wrap: wrap;
}

.pop-kind {
  flex-shrink: 0;
  font: 700 10px var(--font-mono);
  color: var(--domain-accent, #2563eb);
  background: var(--domain-accent-soft, #eaf1fe);
  border-radius: 5px;
  padding: 1px 6px;
}

.pop-name {
  font-size: 13px;
  color: #101418;
  word-break: break-all;
}

.pop-deleted {
  font-size: 10.5px;
  font-weight: 700;
  color: #b91c1c;
  background: #fdecec;
  border-radius: 5px;
  padding: 1px 6px;
}

.pop-status {
  font-size: 11px;
  color: #5c6874;
}

.pop-desc {
  font-size: 12px;
  color: #3d4650;
  line-height: 1.5;
}

.pop-path {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 3px;
  font-size: 11.5px;
  color: #6e7580;
}

.path-sep {
  color: #c0c5cc;
}

.path-seg.current {
  font-weight: 700;
  color: #101418;
}

.pop-row {
  display: flex;
  gap: 8px;
  font-size: 11.5px;
  color: #3d4650;
}

.pop-label {
  flex-shrink: 0;
  color: #8b929c;
}

.pop-uuid {
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

.pop-uuid:hover {
  border-color: var(--domain-accent, #2563eb);
}

.pop-uuid .mono {
  word-break: break-all;
}

.copy-mark {
  flex-shrink: 0;
  font-weight: 700;
  color: var(--domain-accent, #2563eb);
}

.pop-open {
  align-self: flex-start;
  border: 0;
  background: none;
  padding: 0;
  font: 600 11.5px var(--font-sans);
  color: var(--domain-accent, #2563eb);
  cursor: pointer;
}

.pop-open:hover {
  text-decoration: underline;
}

.pop-unknown {
  font-size: 11px;
  color: #8b929c;
}
</style>
