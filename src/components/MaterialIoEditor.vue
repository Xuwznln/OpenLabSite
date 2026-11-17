<script setup lang="ts">
/**
 * 人工物料节点（material_io）参数表单：模式 + 挂载物料 / 库位 + 各模式字段 + 确认设置。
 *
 * 字段规则与核心 `normalize_material_io_param` 一致，保存前就地校验；物料 / 库位可以写 resource_id、
 * 物料 UUID 或 `{"uuid": …}` / 工作流输入引用（以 `{` 开头按 JSON 原样保存）。
 */
import { computed, ref, watch } from "vue";
import { NAlert, NButton, NDynamicTags, NForm, NFormItem, NInput, NInputNumber, NModal, NSelect, NSpace } from "naive-ui";
import {
  MATERIAL_IO_DEFAULT_NAMES,
  MATERIAL_IO_MODE_LABELS,
  MATERIAL_IO_MODES,
  UNLOAD_DISPOSITION_LABELS,
  UNLOAD_SCOPE_LABELS,
  materialIoForm,
  materialIoParam,
  type MaterialIoForm,
  type MaterialIoMode,
  type MaterialIoNodeData,
} from "../features/material-io";

const props = defineProps<{ show: boolean; data: Partial<MaterialIoNodeData> | null }>();
const emit = defineEmits<{
  (e: "update:show", value: boolean): void;
  (e: "save", value: MaterialIoNodeData): void;
}>();

const form = ref<MaterialIoForm>(materialIoForm({}));
const error = ref("");

watch(
  () => [props.show, props.data] as const,
  ([show]) => {
    if (!show) return;
    form.value = materialIoForm(props.data ?? {});
    error.value = "";
  },
  { immediate: true },
);

const modeOptions = MATERIAL_IO_MODES.map((mode) => ({ label: `${MATERIAL_IO_MODE_LABELS[mode]}（${mode}）`, value: mode }));
const dispositionOptions = Object.entries(UNLOAD_DISPOSITION_LABELS).map(([value, label]) => ({ label, value }));
const scopeOptions = computed(() =>
  Object.entries(UNLOAD_SCOPE_LABELS).map(([value, label]) => ({
    label,
    value,
    disabled: form.value.disposition === "detach" && value !== "material_only",
  })),
);

function changeMode(mode: MaterialIoMode) {
  const previous = form.value.mode;
  // 节点名还是上一个模式的缺省名时跟着换
  if (form.value.label === MATERIAL_IO_DEFAULT_NAMES[previous]) form.value.label = MATERIAL_IO_DEFAULT_NAMES[mode];
  form.value.mode = mode;
}

function save() {
  const built = materialIoParam(form.value);
  if (built.error) {
    error.value = built.error;
    return;
  }
  emit("save", { label: form.value.label.trim() || MATERIAL_IO_DEFAULT_NAMES[form.value.mode], param: built.param });
  emit("update:show", false);
}
</script>

<template>
  <NModal
    :show="props.show"
    preset="card"
    title="人工物料（装入 / 取走 / 补量）"
    style="width: 620px; max-width: calc(100vw - 32px)"
    @update:show="emit('update:show', $event)"
  >
    <p class="mio-hint">
      流程走到这里会锁定库位、停下等人工确认；确认后由物料权威改库存，不派发设备动作。拒绝或超时则节点失败、库存不变。
      确认单出现在「异常审批」页。
    </p>
    <NForm label-placement="top" size="small">
      <div class="mio-row">
        <NFormItem label="节点名" style="flex: 2"><NInput v-model:value="form.label" /></NFormItem>
        <NFormItem label="模式" style="flex: 1">
          <NSelect :value="form.mode" :options="modeOptions" @update:value="changeMode" />
        </NFormItem>
      </div>
      <div class="mio-row">
        <NFormItem label="挂载物料（库位所属）" style="flex: 1">
          <NInput v-model:value="form.mount" placeholder="resource_id、物料 UUID 或 {&quot;uuid&quot;: …}" class="mono" />
        </NFormItem>
        <NFormItem label="库位" style="flex: 1">
          <NInput v-model:value="form.site" placeholder="库位名（如 A1）或库位 UUID" class="mono" />
        </NFormItem>
      </div>

      <template v-if="form.mode === 'load'">
        <div class="mio-row">
          <NFormItem label="资源模板" style="flex: 1">
            <NInput v-model:value="form.resourceTemplate" placeholder="模板名或模板 UUID" class="mono" />
          </NFormItem>
          <NFormItem label="新物料显示名（可选）" style="flex: 1">
            <NInput v-model:value="form.materialName" placeholder="缺省按模板名加时间生成" />
          </NFormItem>
        </div>
        <NFormItem label="条码（可选）"><NInput v-model:value="form.barcode" class="mono" /></NFormItem>
        <div class="mio-row">
          <NFormItem label="装入试剂数量（可选）" style="flex: 1">
            <NInputNumber v-model:value="form.quantity" :min="0" clearable style="width: 100%" />
          </NFormItem>
          <NFormItem label="单位" style="flex: 1"><NInput v-model:value="form.quantityUnit" placeholder="mL" /></NFormItem>
          <NFormItem label="试剂名称" style="flex: 1"><NInput v-model:value="form.reagentName" /></NFormItem>
          <NFormItem label="CAS" style="flex: 1"><NInput v-model:value="form.reagentCas" class="mono" /></NFormItem>
        </div>
      </template>

      <template v-else>
        <NFormItem :label="form.mode === 'unload' ? '要取走的物料（必须在该库位上）' : '要补量的物料（原位容器）'">
          <NInput v-model:value="form.material" placeholder="resource_id、物料 UUID 或 {&quot;uuid&quot;: …}" class="mono" />
        </NFormItem>
        <div v-if="form.mode === 'unload'" class="mio-row">
          <NFormItem label="处置" style="flex: 1">
            <NSelect v-model:value="form.disposition" :options="dispositionOptions" />
          </NFormItem>
          <NFormItem label="范围" style="flex: 1">
            <NSelect v-model:value="form.scope" :options="scopeOptions" />
          </NFormItem>
        </div>
        <div v-else class="mio-row">
          <NFormItem label="补量数量" style="flex: 1">
            <NInputNumber v-model:value="form.quantity" :min="0" style="width: 100%" />
          </NFormItem>
          <NFormItem label="单位" style="flex: 1"><NInput v-model:value="form.quantityUnit" placeholder="mL" /></NFormItem>
        </div>
      </template>

      <div class="mio-row">
        <NFormItem label="确认超时（秒）" style="flex: 1">
          <NInputNumber v-model:value="form.timeoutSeconds" :min="1" :max="86400" style="width: 100%" />
        </NFormItem>
        <NFormItem label="可确认的人（留空 = 任何人）" style="flex: 2">
          <NDynamicTags v-model:value="form.assignees" />
        </NFormItem>
      </div>
    </NForm>
    <NAlert v-if="error" type="warning" :bordered="false" style="margin-bottom: 10px">{{ error }}</NAlert>
    <NSpace justify="end">
      <NButton size="small" @click="emit('update:show', false)">取消</NButton>
      <NButton size="small" type="primary" @click="save">保存</NButton>
    </NSpace>
  </NModal>
</template>

<style scoped>
.mio-hint {
  margin: 0 0 12px;
  color: #5c636d;
  font-size: 12.5px;
  line-height: 1.6;
}

.mio-row {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.mono :deep(input) {
  font-family: var(--font-mono);
  font-size: 12.5px;
}
</style>
