<script setup lang="ts">
import { NButton, NButtonGroup, NDropdown, NIcon } from "naive-ui";
import { ChevronDownOutline } from "@vicons/ionicons5";
import { WORKFLOW_RUN_OPTIONS, type WorkflowExecutionMode } from "../features/workflow-execution";

defineProps<{ loading?: boolean; disabled?: boolean }>();
const mode = defineModel<WorkflowExecutionMode>({ default: "normal" });
const emit = defineEmits<{ submit: [] }>();
const options = WORKFLOW_RUN_OPTIONS.map((option) => ({ key: option.value, label: option.label }));
function select(value: string) {
  if (value === "normal" || value === "step") mode.value = value;
}
</script>

<template>
  <NButtonGroup>
    <NButton size="small" type="primary" :loading="loading" :disabled="disabled || loading" @click="emit('submit')">
      {{ mode === "step" ? "提交逐步运行" : "提交运行" }}
    </NButton>
    <NDropdown trigger="click" :options="options" :disabled="disabled || loading" @select="select">
      <NButton size="small" type="primary" aria-label="选择运行方式" :disabled="disabled || loading">
        <NIcon><ChevronDownOutline /></NIcon>
      </NButton>
    </NDropdown>
  </NButtonGroup>
</template>
