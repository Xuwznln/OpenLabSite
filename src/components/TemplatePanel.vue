<script setup lang="ts">
/**
 * 模板库面板：设备包模板（驱动包 @workflow，随注册表上报）+ 本地保存的用户模板。
 * panel 模式带「存为模板」入口；picker 模式（填充空位弹窗内）只做点选。
 * 只有用户模板可删除：设备包模板随包安装 / 卸载出现或消失。
 * 带操作指引（guide / 步骤说明）的模板有「流程说明」入口，弹窗展示全流程。
 */
import { computed, ref } from "vue";
import { NButton, NEmpty, NModal, NTag } from "naive-ui";
import { setDragPayload } from "../features/canvas-dnd";
import {
  hasTemplateGuide,
  templateSource,
  templateStats,
  type WorkflowTemplate,
} from "../features/workflow-templates";
import TemplateGuide from "./TemplateGuide.vue";

const props = defineProps<{
  templates: WorkflowTemplate[];
  registry: Map<string, WorkflowTemplate>;
  mode?: "panel" | "picker";
}>();

const emit = defineEmits<{
  (e: "pick", templateId: string): void;
  (e: "save-current"): void;
  (e: "remove", templateId: string): void;
}>();

const rows = computed(() =>
  props.templates.map((tpl) => ({
    tpl,
    source: templateSource(tpl),
    stats: templateStats(tpl.id, props.registry),
    guided: hasTemplateGuide(tpl),
  })),
);

const guideTemplate = ref<WorkflowTemplate | null>(null);

function openGuide(tpl: WorkflowTemplate) {
  guideTemplate.value = tpl;
}
</script>

<template>
  <div class="tpl-panel" :class="{ picker: props.mode === 'picker' }">
    <div v-if="props.mode !== 'picker'" class="tpl-head">
      <span>工作流模板</span>
      <NButton size="tiny" secondary @click="emit('save-current')">
        存为模板
      </NButton>
    </div>

    <NEmpty
      v-if="!rows.length"
      size="small"
      description="暂无模板"
      style="margin-top: 24px"
    />

    <div
      v-for="row in rows"
      :key="row.tpl.id"
      class="tpl-card"
      draggable="true"
      title="点击插入，或拖到画布 / 空位上"
      @dragstart="setDragPayload($event, { kind: 'template', templateId: row.tpl.id })"
      @click="emit('pick', row.tpl.id)"
    >
      <div class="tpl-title-row">
        <span class="tpl-name">{{ row.tpl.name }}</span>
        <span class="tpl-title-actions">
          <NButton
            v-if="row.guided"
            size="tiny"
            quaternary
            type="primary"
            title="运行前准备 / 每一步做什么 / 预期效果"
            @click.stop="openGuide(row.tpl)"
          >
            流程说明
          </NButton>
          <NButton
            v-if="row.source === 'user' && props.mode !== 'picker'"
            size="tiny"
            quaternary
            type="error"
            @click.stop="emit('remove', row.tpl.id)"
          >
            删除
          </NButton>
        </span>
      </div>
      <div class="tpl-desc">{{ row.tpl.description }}</div>
      <div class="tpl-badges">
        <NTag size="tiny" :bordered="false">{{ row.stats.actions }} 动作</NTag>
        <NTag v-if="row.stats.slots" size="tiny" :bordered="false" type="warning">
          {{ row.stats.slots }} 空位
        </NTag>
        <NTag v-if="row.stats.nested" size="tiny" :bordered="false" type="info">
          嵌套
        </NTag>
        <NTag
          v-if="row.source === 'registry'"
          size="tiny"
          :bordered="false"
          type="primary"
          :title="`驱动包 ${row.tpl.packageName || ''} 里 @workflow 声明的模板，随包安装 / 卸载出现或消失`"
        >
          设备包<template v-if="row.tpl.packageName"> · {{ row.tpl.packageName }}</template>
        </NTag>
        <NTag v-if="row.source === 'user'" size="tiny" :bordered="false" type="success">
          我的
        </NTag>
      </div>
    </div>

    <!-- 全流程说明：运行前准备 → 执行步骤 → 预期效果 → 注意事项 -->
    <NModal
      :show="guideTemplate !== null"
      preset="card"
      :title="guideTemplate ? `${guideTemplate.name} · 流程说明` : ''"
      style="width: 560px; max-height: min(720px, calc(100vh - 48px))"
      content-style="overflow-y: auto"
      @update:show="(show: boolean) => { if (!show) guideTemplate = null }"
    >
      <TemplateGuide v-if="guideTemplate" :template="guideTemplate" />
      <template #footer>
        <div class="guide-footer">
          <NButton size="small" @click="guideTemplate = null">关闭</NButton>
          <NButton
            size="small"
            type="primary"
            @click="
              () => {
                const id = guideTemplate!.id;
                guideTemplate = null;
                emit('pick', id);
              }
            "
          >
            {{ props.mode === 'picker' ? '用它填充空位' : '插入画布' }}
          </NButton>
        </div>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.tpl-panel {
  display: grid;
  gap: 8px;
  align-content: start;
}

.tpl-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: #18181b;
  font-size: 13px;
  font-weight: 600;
}

.tpl-card {
  padding: 10px 11px;
  border: 1px solid #e8e6e1;
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.tpl-card:hover {
  border-color: #bdcdfd;
  box-shadow: 0 3px 10px rgba(46, 91, 255, 0.1);
}

.tpl-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
}

.tpl-name {
  font-size: 12.5px;
  font-weight: 600;
  color: #26282d;
}

.tpl-desc {
  margin-top: 3px;
  color: #8d949d;
  font-size: 11px;
  line-height: 1.55;
}

.tpl-badges {
  display: flex;
  gap: 5px;
  margin-top: 7px;
  flex-wrap: wrap;
}

.tpl-title-actions {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  flex-shrink: 0;
}

.guide-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
