<script setup lang="ts">
/**
 * 模板空位节点：虚线卡片占位，点击（EditorView 拦截）弹出填充对话框，
 * 可用设备动作或另一个模板补上。保留 in/out handle，与动作节点同构。
 */
import { Handle, Position } from "@vue-flow/core";
import { NIcon } from "naive-ui";
import { AddOutline } from "@vicons/ionicons5";

const props = defineProps<{
  id: string;
  data: {
    slotLabel?: string;
    slotHint?: string;
  };
  selected?: boolean;
}>();
</script>

<template>
  <div class="slot-node" :class="{ selected: props.selected }">
    <Handle id="in" type="target" :position="Position.Left" class="slot-handle" />
    <div class="slot-body">
      <div class="slot-icon"><NIcon :size="16"><AddOutline /></NIcon></div>
      <div class="slot-text">
        <div class="slot-title">{{ props.data.slotLabel || "空位" }}</div>
        <div class="slot-sub">{{ props.data.slotHint || "点击填充设备动作或模板" }}</div>
      </div>
    </div>
    <div class="slot-cta">点击填充</div>
    <Handle id="out" type="source" :position="Position.Right" class="slot-handle" />
  </div>
</template>

<style scoped>
.slot-node {
  position: relative;
  width: 220px;
  padding: 10px 12px;
  background: #fbf8ff;
  border: 1.5px dashed #a78bfa;
  border-radius: 12px;
  cursor: pointer;
  transition: box-shadow 0.15s, border-color 0.15s, background 0.15s;
}

.slot-node:hover {
  background: #f6f0ff;
  border-color: #7c3aed;
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.14);
}

.slot-node.selected {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.16);
}

.slot-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.slot-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border: 1.5px dashed #a78bfa;
  border-radius: 8px;
  color: #7c3aed;
  font-size: 16px;
  font-weight: 700;
  background: #fff;
}

.slot-text {
  min-width: 0;
  flex: 1;
}

.slot-title {
  overflow: hidden;
  color: #5b21b6;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-sub {
  overflow: hidden;
  color: #8b7bb8;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.slot-cta {
  margin-top: 6px;
  color: #7c3aed;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.slot-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #a78bfa;
}

.slot-handle:hover {
  border-color: #7c3aed;
  box-shadow: 0 0 0 4px rgba(124, 58, 237, 0.13);
}
</style>
