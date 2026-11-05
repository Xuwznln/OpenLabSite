<script setup lang="ts">
/**
 * 子工作流（组合调用）画布节点：一次插入的已发布工作流收成一张只读卡片，列出它展开出的步骤。
 * 展开节点由服务端按发布快照生成，画布上不能改；连线只决定它在父流程里的先后。
 * 数据形状见 features/composite-nodes.ts（保存时整棵子树原样写回）。
 */
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { NIcon } from "naive-ui";
import { GitNetworkOutline, LockClosedOutline } from "@vicons/ionicons5";
import { compositeLeafSteps, describeCompositeArgument, type CompositeNodeData } from "../features/composite-nodes";

const props = defineProps<{
  id: string;
  data: CompositeNodeData;
  selected?: boolean;
}>();

const MAX_STEPS = 5;
const steps = computed(() => compositeLeafSteps(props.data));
const argumentsText = computed(() =>
  Object.entries(props.data.arguments ?? {}).map(([name, value]) => describeCompositeArgument(name, value)),
);
</script>

<template>
  <div class="composite-node" :class="{ selected: props.selected }">
    <Handle id="in" type="target" :position="Position.Left" class="composite-handle" />
    <div class="composite-head">
      <div class="composite-icon"><NIcon :size="15"><GitNetworkOutline /></NIcon></div>
      <div class="composite-title-block">
        <div class="composite-title" :title="props.data.name">{{ props.data.name || "子工作流" }}</div>
        <div class="composite-sub">子工作流 · 版本 {{ props.data.childRevision || "?" }} · {{ steps.length }} 步</div>
      </div>
      <span class="composite-lock" title="展开节点按发布快照生成，只读；要修改请编辑子工作流并重新发布、重新插入">
        <NIcon :size="12"><LockClosedOutline /></NIcon>只读
      </span>
    </div>
    <ol class="composite-steps">
      <li v-for="step in steps.slice(0, MAX_STEPS)" :key="step.uuid" :title="`${step.device}/${step.action}`">
        <span class="step-name">{{ step.name }}</span>
        <span v-if="step.device" class="step-meta">{{ step.device }}</span>
      </li>
      <li v-if="steps.length > MAX_STEPS" class="more">还有 {{ steps.length - MAX_STEPS }} 步…</li>
    </ol>
    <div v-if="argumentsText.length" class="composite-args">
      <span v-for="text in argumentsText" :key="text" class="arg-chip" :title="text">{{ text }}</span>
    </div>
    <Handle id="out" type="source" :position="Position.Right" class="composite-handle" />
  </div>
</template>

<style scoped>
.composite-node {
  position: relative;
  width: 240px;
  padding: 10px 12px;
  background: #f5f3ff;
  border: 1.5px dashed #7c3aed;
  border-radius: 12px;
  cursor: grab;
  transition: box-shadow 0.15s;
}

.composite-node:hover {
  box-shadow: 0 4px 12px rgba(124, 58, 237, 0.18);
}

.composite-node.selected {
  box-shadow: 0 0 0 3px rgba(124, 58, 237, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08);
}

.composite-head {
  display: flex;
  align-items: center;
  gap: 8px;
}

.composite-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #7c3aed;
  color: #fff;
}

.composite-title-block {
  flex: 1;
  min-width: 0;
}

.composite-title {
  overflow: hidden;
  color: #4c1d95;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composite-sub {
  color: #7c6aa8;
  font-size: 10.5px;
}

.composite-lock {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  padding: 1px 6px;
  border-radius: 999px;
  background: #ede9fe;
  color: #6d28d9;
  font-size: 10px;
  white-space: nowrap;
}

.composite-steps {
  margin: 8px 0 0;
  padding: 6px 8px 6px 22px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.7);
  font-size: 11px;
  color: #3b2f63;
}

.composite-steps li {
  display: flex;
  justify-content: space-between;
  gap: 6px;
  line-height: 1.6;
}

.composite-steps li.more {
  color: #8b80ad;
}

.step-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.step-meta {
  flex-shrink: 0;
  color: #8b80ad;
  font-family: var(--font-mono);
  font-size: 10px;
}

.composite-args {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}

.arg-chip {
  max-width: 100%;
  overflow: hidden;
  padding: 1px 6px;
  border-radius: 6px;
  background: #ede9fe;
  color: #5b21b6;
  font-family: var(--font-mono);
  font-size: 10px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.composite-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #7c3aed;
}
</style>
