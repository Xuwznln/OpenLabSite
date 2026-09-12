<script setup lang="ts">
/**
 * 模板"全流程"说明：运行前准备 → 执行步骤 → 预期效果 → 注意事项。
 *
 * 内容来自设备包 `@workflow(guide=...)` 与每步的 name / description（经注册表模板下发），
 * 用户模板只有步骤清单。准备段给操作员讲清楚在网页上先做什么（物料仓储
 * 出库、把物料挂到哪台设备的哪个位点、确认设备在线），预期段讲跑完该看到什么。
 */
import { computed } from "vue";
import { NTag } from "naive-ui";
import {
  templateProcedure,
  type WorkflowTemplate,
} from "../features/workflow-templates";

const props = defineProps<{ template: WorkflowTemplate }>();

const guide = computed(() => props.template.guide);
const steps = computed(() => templateProcedure(props.template));
</script>

<template>
  <div class="tpl-guide">
    <p v-if="template.description" class="guide-summary">{{ template.description }}</p>

    <section v-if="guide?.preparation.length" class="guide-section">
      <h4>运行前准备</h4>
      <ol>
        <li v-for="(item, index) in guide.preparation" :key="`prep-${index}`">{{ item }}</li>
      </ol>
    </section>

    <section v-if="steps.length" class="guide-section">
      <h4>执行步骤</h4>
      <ol class="guide-steps">
        <li v-for="step in steps" :key="step.index" :style="{ marginLeft: `${step.depth * 16}px` }">
          <div class="step-head">
            <span class="step-title">{{ step.title }}</span>
            <NTag v-if="step.kind === 'slot'" size="tiny" :bordered="false" type="warning">空位</NTag>
            <template v-else-if="step.kind === 'loop'">
              <NTag size="tiny" :bordered="false" type="info">循环</NTag>
              <code class="step-action">{{ step.actionName }}</code>
            </template>
            <code v-else class="step-action">{{ step.roleLabel }} / {{ step.actionName }}</code>
          </div>
          <div v-if="step.description" class="step-desc">{{ step.description }}</div>
        </li>
      </ol>
    </section>

    <section v-if="guide?.expected.length" class="guide-section">
      <h4>预期效果</h4>
      <ul>
        <li v-for="(item, index) in guide.expected" :key="`exp-${index}`">{{ item }}</li>
      </ul>
    </section>

    <section v-if="guide?.notes.length" class="guide-section">
      <h4>注意事项</h4>
      <ul>
        <li v-for="(item, index) in guide.notes" :key="`note-${index}`">{{ item }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.tpl-guide {
  display: grid;
  gap: 14px;
  color: #26282d;
  font-size: 12.5px;
  line-height: 1.65;
}

.guide-summary {
  margin: 0;
  color: #5c636d;
}

.guide-section h4 {
  margin: 0 0 6px;
  font-size: 12px;
  font-weight: 600;
  color: #18181b;
}

.guide-section ol,
.guide-section ul {
  margin: 0;
  padding-left: 20px;
}

.guide-section li + li {
  margin-top: 4px;
}

.guide-steps li + li {
  margin-top: 8px;
}

.step-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.step-title {
  font-weight: 600;
}

.step-action {
  color: #6e7580;
  font: 11px var(--font-mono);
}

.step-desc {
  margin-top: 2px;
  color: #5c636d;
}
</style>
