<script setup lang="ts">
/**
 * 按入口参数合同生成的表单：数字 / 整数 / 文本 / 是否 / 选项，不认识的 Schema 走 JSON 文本。
 * 表单值语义见 features/workflow-io.ts（null = 未填；JSON 存文本）。
 */
import { NInput, NInputNumber, NSelect } from "naive-ui";
import type { BackendWorkflowInputParameter } from "@openlab/protocol";
import {
  entryFieldKind,
  entryValueText,
  enumOptions,
  schemaTypeLabel,
  type EntryFormValues,
} from "../features/workflow-io";

const props = withDefaults(
  defineProps<{
    parameters: readonly BackendWorkflowInputParameter[];
    fieldErrors?: Record<string, string>;
    disabled?: boolean;
    /** 每个字段下方的提示（如暂停修改时「已被使用，不能修改」）。 */
    hints?: Record<string, string>;
  }>(),
  { fieldErrors: () => ({}), disabled: false, hints: () => ({}) },
);
const values = defineModel<EntryFormValues>("values", { required: true });

function set(name: string, value: unknown) {
  values.value = { ...values.value, [name]: value };
}

function hasDefault(parameter: BackendWorkflowInputParameter): boolean {
  return Object.prototype.hasOwnProperty.call(parameter, "default");
}

function placeholderOf(parameter: BackendWorkflowInputParameter): string {
  if (hasDefault(parameter)) return `默认 ${entryValueText(parameter.default)}`;
  return parameter.required ? "必填" : "可不填";
}

function numberValue(name: string): number | null {
  const value = values.value[name];
  return typeof value === "number" ? value : null;
}

const BOOLEAN_OPTIONS = [
  { label: "是", value: "true" },
  { label: "否", value: "false" },
];

function booleanValue(name: string): string | null {
  const value = values.value[name];
  return typeof value === "boolean" ? String(value) : null;
}

function enumSelectOptions(parameter: BackendWorkflowInputParameter) {
  return enumOptions(parameter.schema).map((option) => ({ label: entryValueText(option), value: JSON.stringify(option) }));
}

function enumValue(name: string): string | null {
  const value = values.value[name];
  return value === null || value === undefined ? null : JSON.stringify(value);
}

function setEnum(name: string, encoded: string | null) {
  set(name, encoded === null ? null : JSON.parse(encoded));
}
</script>

<template>
  <div class="entry-fields">
    <div
      v-for="parameter in props.parameters"
      :key="parameter.name"
      class="entry-field"
      :class="{ invalid: Boolean(props.fieldErrors[parameter.name]) }"
    >
      <div class="entry-label">
        <span class="entry-title">
          {{ parameter.title || parameter.name }}
          <b v-if="parameter.required && !hasDefault(parameter)" class="required" title="必填">*</b>
        </span>
        <span class="entry-meta">
          <template v-if="parameter.title">{{ parameter.name }} · </template>{{ schemaTypeLabel(parameter.schema) }}
        </span>
      </div>
      <NInputNumber
        v-if="entryFieldKind(parameter.schema) === 'number' || entryFieldKind(parameter.schema) === 'integer'"
        :value="numberValue(parameter.name)"
        :precision="entryFieldKind(parameter.schema) === 'integer' ? 0 : undefined"
        :placeholder="placeholderOf(parameter)"
        :disabled="props.disabled"
        clearable
        size="small"
        @update:value="set(parameter.name, $event)"
      />
      <NSelect
        v-else-if="entryFieldKind(parameter.schema) === 'boolean'"
        :value="booleanValue(parameter.name)"
        :options="BOOLEAN_OPTIONS"
        :placeholder="placeholderOf(parameter)"
        :disabled="props.disabled"
        clearable
        size="small"
        @update:value="set(parameter.name, $event === null ? null : $event === 'true')"
      />
      <NSelect
        v-else-if="entryFieldKind(parameter.schema) === 'enum'"
        :value="enumValue(parameter.name)"
        :options="enumSelectOptions(parameter)"
        :placeholder="placeholderOf(parameter)"
        :disabled="props.disabled"
        clearable
        size="small"
        @update:value="setEnum(parameter.name, $event)"
      />
      <NInput
        v-else-if="entryFieldKind(parameter.schema) === 'string'"
        :value="String(values[parameter.name] ?? '')"
        :placeholder="placeholderOf(parameter)"
        :disabled="props.disabled"
        size="small"
        @update:value="set(parameter.name, $event)"
      />
      <NInput
        v-else
        :value="String(values[parameter.name] ?? '')"
        type="textarea"
        class="mono"
        :autosize="{ minRows: 2, maxRows: 8 }"
        :placeholder="`JSON · ${placeholderOf(parameter)}`"
        :disabled="props.disabled"
        size="small"
        @update:value="set(parameter.name, $event)"
      />
      <div v-if="props.fieldErrors[parameter.name]" class="entry-error">{{ props.fieldErrors[parameter.name] }}</div>
      <div v-else-if="props.hints[parameter.name]" class="entry-hint">{{ props.hints[parameter.name] }}</div>
      <div v-else-if="parameter.description" class="entry-hint">{{ parameter.description }}</div>
    </div>
  </div>
</template>

<style scoped>
.entry-fields {
  display: grid;
  gap: 12px;
}

.entry-field {
  display: grid;
  gap: 4px;
}

.entry-label {
  display: flex;
  align-items: baseline;
  gap: 8px;
  min-width: 0;
}

.entry-title {
  font-weight: 600;
  font-size: 13px;
}

.required {
  color: #b91c1c;
  margin-left: 2px;
}

.entry-meta {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #8b929c;
}

.entry-error {
  font-size: 12px;
  color: #b91c1c;
}

.entry-hint {
  font-size: 12px;
  color: #8b929c;
}

.mono :deep(textarea) {
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
