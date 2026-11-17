<script setup lang="ts">
/**
 * 人工物料节点（material_io）：人工装入 / 取走 / 补量。调度器在权威侧锁定库位后停下等人工确认，
 * 确认后改库存；不派发设备动作。双击打开参数表单。
 */
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { NIcon } from "naive-ui";
import { CubeOutline } from "@vicons/ionicons5";
import { describeMaterialIo, materialIoParamError } from "../features/material-io";

const props = defineProps<{
  id: string;
  data: { label?: string; param?: Record<string, unknown> };
  selected?: boolean;
}>();

const summary = computed(() => describeMaterialIo(props.data.param));
/** 参数还不完整（模板插入后 / 新放的节点）：卡片上直接提示，保存时同样拦下。 */
const issue = computed(() => materialIoParamError(props.data.param));
const meta = computed(() => {
  const assignees = Array.isArray(props.data.param?.assignee_user_ids)
    ? (props.data.param!.assignee_user_ids as unknown[]).map(String).filter(Boolean)
    : [];
  return assignees.length ? `指派 ${assignees.join("、")}` : "任何人可确认";
});
</script>

<template>
  <div class="mio-node" :class="{ selected: props.selected, incomplete: Boolean(issue) }" :title="issue ? `参数未完成：${issue}（双击填写）` : '双击编辑参数'">
    <Handle id="in" type="target" :position="Position.Left" class="mio-handle" />
    <div class="mio-body">
      <div class="mio-icon"><NIcon :size="16"><CubeOutline /></NIcon></div>
      <div class="mio-text">
        <div class="mio-title">{{ props.data.label || "人工物料" }}</div>
        <div class="mio-sub">{{ summary }}</div>
        <div class="mio-meta">{{ issue ? "参数未完成，双击填写" : meta }}</div>
      </div>
    </div>
    <Handle id="out" type="source" :position="Position.Right" class="mio-handle" />
  </div>
</template>

<style scoped>
.mio-node {
  position: relative;
  width: 220px;
  padding: 10px 12px;
  background: #f0fdf4;
  border: 1.5px solid #16a34a;
  border-radius: 12px;
  cursor: grab;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.mio-node:hover {
  box-shadow: 0 4px 12px rgba(22, 163, 74, 0.18);
}

.mio-node.selected {
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2), 0 4px 12px rgba(0, 0, 0, 0.08);
}

.mio-node.incomplete {
  border-style: dashed;
}

.mio-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.mio-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #16a34a;
  color: #fff;
}

.mio-text {
  min-width: 0;
  flex: 1;
}

.mio-title {
  overflow: hidden;
  color: #14532d;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mio-sub {
  overflow: hidden;
  color: #3f7a55;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mio-meta {
  overflow: hidden;
  margin-top: 2px;
  color: #15803d;
  font-size: 10px;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mio-node.incomplete .mio-meta {
  color: #b45309;
}

.mio-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #16a34a;
}
</style>
