<script setup lang="ts">
/**
 * 组框节点：模板插入后包住成员节点的可见边界，标题栏放组名 / 描述 / 操作。
 *
 * Vue Flow 父节点：宽高在节点 style 上，成员节点以它为 parentNode；拖标题栏整组一起动。
 * 操作经编辑器 provide 的 GROUP_ACTIONS_KEY 注入（运行画布没有 provide → 只展示）。
 */
import { computed, inject } from "vue";
import { NButton } from "naive-ui";
import { GROUP_ACTIONS_KEY, type GroupNodeData } from "../features/canvas-groups";

const props = defineProps<{
  id: string;
  data: GroupNodeData;
  selected?: boolean;
}>();

const actions = inject(GROUP_ACTIONS_KEY, undefined);
const templateId = computed(() => String(props.data.templateId ?? ""));
const guideAvailable = computed(
  () => Boolean(templateId.value && actions?.hasGuide(templateId.value)),
);
</script>

<template>
  <div class="group-node" :class="{ selected: props.selected }">
    <div class="group-header">
      <div class="group-title-block">
        <div class="group-title-row">
          <span class="group-badge">模板</span>
          <span class="group-name">{{ props.data.groupName || "未命名分组" }}</span>
        </div>
        <div v-if="props.data.groupDescription" class="group-desc" :title="props.data.groupDescription">
          {{ props.data.groupDescription }}
        </div>
      </div>
      <div v-if="actions" class="group-actions nodrag">
        <NButton
          v-if="guideAvailable"
          size="tiny"
          quaternary
          type="primary"
          @click.stop="actions!.showGuide(templateId)"
        >
          流程说明
        </NButton>
        <NButton size="tiny" quaternary title="保留成员节点，只去掉组框" @click.stop="actions!.ungroup(props.id)">
          解组
        </NButton>
        <NButton
          size="tiny"
          quaternary
          type="error"
          title="删除组框和里面的全部节点"
          @click.stop="actions!.removeGroup(props.id)"
        >
          删除整组
        </NButton>
      </div>
    </div>
  </div>
</template>

<style scoped>
.group-node {
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  border: 1.5px dashed #94a3b8;
  border-radius: 14px;
  background: rgba(241, 245, 249, 0.55);
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
}

.group-node:hover {
  border-color: #64748b;
  background: rgba(241, 245, 249, 0.72);
}

.group-node.selected {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.14);
}

.group-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  height: 58px;
  padding: 9px 12px 0;
  cursor: grab;
}

.group-title-block {
  min-width: 0;
  flex: 1;
}

.group-title-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.group-badge {
  flex-shrink: 0;
  padding: 1px 6px;
  border-radius: 999px;
  background: #e0e7ff;
  color: #3730a3;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
}

.group-name {
  overflow: hidden;
  color: #1e293b;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-desc {
  margin-top: 2px;
  overflow: hidden;
  color: #64748b;
  font-size: 11px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.group-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 2px;
  cursor: default;
}
</style>
