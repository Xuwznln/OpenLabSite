<script setup lang="ts">
/**
 * 条件分支节点（编辑器概念，提交时消失）：按参数表变量在**提交时**求值，
 * 走真分支、假分支整段标 disabled（协议原生跳过），本节点被拼接掉。
 * 右侧两个出口 handle：out-true（真）/ out-false（假）。
 */
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { NIcon } from "naive-ui";
import { ArrowForwardOutline, GitBranchOutline } from "@vicons/ionicons5";

const props = defineProps<{
  id: string;
  data: {
    variableId?: string;
    op?: string;
    value?: string;
  };
  selected?: boolean;
}>();

const summary = computed(() => {
  if (!props.data.variableId) return "点击配置条件";
  return `${props.data.variableId} ${props.data.op || "=="} ${props.data.value ?? ""}`;
});
</script>

<template>
  <div class="branch-node" :class="{ selected: props.selected }">
    <Handle id="in" type="target" :position="Position.Left" class="branch-handle" />
    <div class="branch-body">
      <div class="branch-icon"><NIcon :size="17"><GitBranchOutline /></NIcon></div>
      <div class="branch-text">
        <div class="branch-title">条件分支 if</div>
        <div class="branch-sub">{{ summary }}</div>
      </div>
    </div>
    <div class="branch-outs">
      <span class="out-label true-label">真 <NIcon :size="10"><ArrowForwardOutline /></NIcon></span>
      <span class="out-label false-label">假 <NIcon :size="10"><ArrowForwardOutline /></NIcon></span>
    </div>
    <Handle
      id="out-true"
      type="source"
      :position="Position.Right"
      class="branch-handle out-true"
      :style="{ top: '38%' }"
    />
    <Handle
      id="out-false"
      type="source"
      :position="Position.Right"
      class="branch-handle out-false"
      :style="{ top: '78%' }"
    />
  </div>
</template>

<style scoped>
.branch-node {
  position: relative;
  width: 220px;
  padding: 10px 12px;
  background: #ecfeff;
  border: 1.5px solid #06b6d4;
  border-radius: 12px;
  cursor: grab;
  transition: box-shadow 0.15s;
}

.branch-node:hover {
  box-shadow: 0 4px 12px rgba(6, 182, 212, 0.2);
}

.branch-node.selected {
  box-shadow: 0 0 0 3px rgba(6, 182, 212, 0.2), 0 4px 12px rgba(0, 0, 0, 0.08);
}

.branch-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.branch-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #06b6d4;
  color: #fff;
  font-size: 17px;
  font-weight: 700;
}

.branch-text {
  min-width: 0;
  flex: 1;
}

.branch-title {
  color: #155e75;
  font-size: 13px;
  font-weight: 600;
}

.branch-sub {
  overflow: hidden;
  color: #4ba3b5;
  font: 10.5px var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.branch-outs {
  display: grid;
  gap: 2px;
  margin-top: 6px;
  justify-items: end;
}

.out-label {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 9.5px;
  font-weight: 600;
}

.true-label {
  color: #16a34a;
}

.false-label {
  color: #dc2626;
}

.branch-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #06b6d4;
}

.branch-handle.out-true {
  border-color: #16a34a;
}

.branch-handle.out-false {
  border-color: #dc2626;
}
</style>
