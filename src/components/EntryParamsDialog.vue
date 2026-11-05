<script setup lang="ts">
/** 提交运行前填写入口参数（控制器见 features/entry-params-prompt.ts）。 */
import { NAlert, NButton, NModal, NSpace } from "naive-ui";
import type { EntryParamsPrompt } from "../features/entry-params-prompt";
import EntryParamFields from "./EntryParamFields.vue";

const props = defineProps<{ prompt: EntryParamsPrompt }>();
</script>

<template>
  <NModal
    :show="props.prompt.state.open"
    preset="card"
    :title="props.prompt.state.title"
    :mask-closable="false"
    style="width: min(520px, 94vw)"
    @update:show="!$event && props.prompt.cancel()"
  >
    <NAlert type="info" :bordered="false" style="margin-bottom: 12px">
      该流程声明了入口参数：每次运行填写一次，引用它的节点用这里的值。留空的可选参数按默认值处理。
    </NAlert>
    <EntryParamFields
      v-model:values="props.prompt.state.values"
      :parameters="props.prompt.state.parameters"
      :field-errors="props.prompt.state.fieldErrors"
      :disabled="props.prompt.state.busy"
    />
    <NAlert v-if="props.prompt.state.error" type="error" :bordered="false" style="margin-top: 12px">
      {{ props.prompt.state.error }}
    </NAlert>
    <template #footer>
      <NSpace justify="end">
        <NButton :disabled="props.prompt.state.busy" @click="props.prompt.cancel()">取消</NButton>
        <NButton type="primary" :loading="props.prompt.state.busy" @click="props.prompt.confirm()">
          {{ props.prompt.state.confirmText }}
        </NButton>
      </NSpace>
    </template>
  </NModal>
</template>
