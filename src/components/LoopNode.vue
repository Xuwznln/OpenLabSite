<script setup lang="ts">
/**
 * 循环容器节点：框住循环体的 Vue Flow 父节点，标题栏放模式摘要（重复 ×N / 当 … 时重复）与操作。
 *
 * 与组框不同，循环是**图结构**：有入口 / 出口 handle，提交为 `type="loop"` 节点，成员以
 * `parent_uuid` 归属它，运行时逐轮执行。宽高在节点 style 上，成员 position 相对于它。
 * 操作经编辑器 provide 的 LOOP_ACTIONS_KEY 注入（运行画布不 provide → 只展示）。
 */
import { computed, inject } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { NButton, NIcon } from "naive-ui";
import { RepeatOutline } from "@vicons/ionicons5";
import { LOOP_ACTIONS_KEY, describeLoopNode, type LoopNodeData } from "../features/workflow-loops";

const props = defineProps<{
  id: string;
  data: LoopNodeData;
  selected?: boolean;
}>();

const actions = inject(LOOP_ACTIONS_KEY, undefined);
const summary = computed(() => describeLoopNode(props.data));
const memberCount = computed(() => actions?.memberCount(props.id) ?? -1);
const incomplete = computed(
  () =>
    props.data.mode === "while" &&
    (props.data.conditionSource === "node_output"
      ? !props.data.conditionNodeId
      : !props.data.deviceId || !props.data.field),
);
</script>

<template>
  <div class="loop-node" :class="{ selected: props.selected, incomplete }">
    <Handle id="in" type="target" :position="Position.Left" class="loop-handle" :style="{ top: '29px' }" />
    <div class="loop-header">
      <div class="loop-title-block">
        <div class="loop-title-row">
          <span class="loop-badge"><NIcon :size="12"><RepeatOutline /></NIcon> 循环</span>
          <span class="loop-name">{{ props.data.label || summary }}</span>
        </div>
        <div class="loop-summary" :title="summary">
          {{ incomplete ? "点击「编辑」配置条件" : summary }}
          <span v-if="props.data.mode === 'while' && props.data.intervalSeconds > 0" class="loop-interval">
            · 每 {{ props.data.intervalSeconds }}s 判定
          </span>
        </div>
      </div>
      <div v-if="actions" class="loop-actions nodrag">
        <NButton size="tiny" quaternary type="primary" @click.stop="actions!.edit(props.id)">编辑</NButton>
        <NButton size="tiny" quaternary title="保留成员节点，只去掉循环框" @click.stop="actions!.dissolve(props.id)">
          解开
        </NButton>
        <NButton size="tiny" quaternary type="error" title="删除循环框和里面的全部节点" @click.stop="actions!.remove(props.id)">
          删除
        </NButton>
      </div>
    </div>
    <div v-if="memberCount === 0" class="loop-empty nodrag">
      {{ props.data.mode === "while" ? "空循环体：按间隔反复判定条件，直到不成立（等到某状态）" : "循环体为空：把节点拖进来，或选中节点右键「放入循环」" }}
    </div>
    <Handle id="out" type="source" :position="Position.Right" class="loop-handle" :style="{ top: '29px' }" />
  </div>
</template>

<style scoped>
.loop-node {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 1.5px solid #c084fc;
  border-radius: 14px;
  background: rgba(250, 245, 255, 0.6);
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.loop-node:hover {
  border-color: #a855f7;
  background: rgba(250, 245, 255, 0.78);
}

.loop-node.selected {
  border-color: #7c3aed;
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.16);
}

.loop-node.incomplete {
  border-style: dashed;
  border-color: #f59e0b;
}

.loop-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  height: 58px;
  padding: 9px 12px 0;
  cursor: grab;
}

.loop-title-block {
  min-width: 0;
  flex: 1;
}

.loop-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.loop-badge {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  gap: 3px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.loop-name {
  overflow: hidden;
  color: #1e293b;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loop-summary {
  margin-top: 2px;
  overflow: hidden;
  color: #6b21a8;
  font: 11px var(--font-mono);
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.loop-interval {
  color: #8b5cf6;
}

.loop-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  cursor: default;
}

.loop-empty {
  position: absolute;
  top: 58px;
  right: 16px;
  bottom: 0;
  left: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 8px;
  color: #8b5cf6;
  font-size: 11.5px;
  text-align: center;
  line-height: 1.5;
  pointer-events: none;
}

.loop-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #a855f7;
}
</style>
