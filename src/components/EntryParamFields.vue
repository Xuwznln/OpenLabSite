<script setup lang="ts">
/**
 * 按入口参数合同生成的表单：数字 / 整数 / 文本 / 是否 / 选项 / 物料 / 设备 / 库位，不认识的 Schema 走 JSON 文本。
 * 物料（`$slot: ResourceSlot`）用与节点参数浮层同源的物料选择器（features/material-options.ts），
 * 值写成 `{id: resource_id, uuid}`；物料目录读不到时退回 JSON 文本。
 * 设备（`$slot: DeviceSlot`）选在线设备 id，库位（`$slot: SiteSlot`）选物料树上的 Site uuid，数据源与节点参数浮层相同；
 * 读不到目录时退回文本输入。
 * 表单值语义见 features/workflow-io.ts（null = 未填；JSON 存文本）。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { NInput, NInputNumber, NSelect } from "naive-ui";
import type { BackendWorkflowInputParameter, MaterialsV1Aggregate } from "@openlab/protocol";
import { useConnectionStore } from "../stores/connection";
import { resourceRefLabel, resourceRefUuid, resourceRefValue } from "../features/action-placeholders";
import { materialOptionsFrom, type MaterialOption } from "../features/material-options";
import { SiteIndex } from "../features/site-bindings";
import {
  allowedResourceTemplates,
  entryFieldKind,
  entryValueText,
  enumOptions,
  isResourceEntryKind,
  isSlotEntryKind,
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

// ── 物料入口参数：与节点参数浮层同源的物料选择器 ──

const conn = useConnectionStore();
const materials = shallowRef<readonly MaterialsV1Aggregate[]>([]);
const materialsLoading = ref(false);
const materialsError = ref("");
// 库位选项来自同一份物料聚合（sites），所以库位参数也要读物料目录
const needsMaterials = computed(() =>
  props.parameters.some((parameter) => {
    const kind = entryFieldKind(parameter.schema);
    return isResourceEntryKind(kind) || kind === "site";
  }),
);

async function loadMaterials() {
  materialsLoading.value = true;
  try {
    materials.value = await conn.api.domains.inventory.instances();
    materialsError.value = "";
  } catch {
    materials.value = [];
    materialsError.value = "物料列表拉取失败，请按 JSON 填写，如 {\"uuid\": \"…\"}";
  } finally {
    materialsLoading.value = false;
  }
}

watch(needsMaterials, (need) => {
  if (need) void loadMaterials();
}, { immediate: true });

function resourceValues(name: string): unknown[] {
  const value = values.value[name];
  return Array.isArray(value) ? value : value === null || value === undefined ? [] : [value];
}

/** 选项：按 Schema 的模板 allowlist 筛选；当前值不在目录里时补一条「（当前值）」。 */
function resourceOptions(parameter: BackendWorkflowInputParameter): MaterialOption[] {
  const options = [...materialOptionsFrom(materials.value, allowedResourceTemplates(parameter.schema)).options];
  for (const value of resourceValues(parameter.name)) {
    const uuid = resourceRefUuid(value);
    if (uuid && !options.some((option) => option.value === uuid)) {
      options.unshift({ label: `${resourceRefLabel(value) || uuid}（当前值）`, value: uuid });
    }
  }
  return options;
}

function resourceSelection(parameter: BackendWorkflowInputParameter): string | string[] | null {
  const uuids = resourceValues(parameter.name).map(resourceRefUuid).filter(Boolean);
  if (entryFieldKind(parameter.schema) === "resources") return uuids;
  return uuids[0] ?? null;
}

function setResource(parameter: BackendWorkflowInputParameter, selected: unknown) {
  const refs = materialOptionsFrom(materials.value).refs;
  const previous = new Map(resourceValues(parameter.name).map((value) => [resourceRefUuid(value), value]));
  // 引用形状与节点参数一致：{id: resource_id, uuid}；目录里没有的（当前值）原样保留
  const toRef = (value: unknown) => {
    const uuid = String(value);
    return refs.has(uuid) ? resourceRefValue({}, { uuid, resourceId: refs.get(uuid)?.resourceId }) : (previous.get(uuid) ?? { uuid });
  };
  if (Array.isArray(selected)) set(parameter.name, selected.length ? selected.map(toRef) : null);
  else set(parameter.name, selected === null || selected === undefined || selected === "" ? null : toRef(selected));
}

function resourceText(name: string): string {
  const value = values.value[name];
  if (value === null || value === undefined) return "";
  return typeof value === "string" ? value : JSON.stringify(value);
}

// ── 设备 / 库位入口参数：值是字符串（设备 id / Site uuid），选项与节点参数浮层同源 ──

const devices = shallowRef<string[]>([]);
const devicesLoading = ref(false);
const devicesError = ref("");
const needsDevices = computed(() => props.parameters.some((parameter) => entryFieldKind(parameter.schema) === "device"));

async function loadDevices() {
  devicesLoading.value = true;
  try {
    const endpoints = await conn.api.domains.runtimeV1.endpoints();
    devices.value = [
      ...new Set(
        endpoints
          .filter((endpoint) => endpoint.state === "online")
          .flatMap((endpoint) => endpoint.device_routes)
          .filter((route) => route.enabled && route.selected)
          .map((route) => route.device_uuid),
      ),
    ].sort();
    devicesError.value = "";
  } catch {
    devices.value = [];
    devicesError.value = "在线设备拉取失败，请直接填写设备 id";
  } finally {
    devicesLoading.value = false;
  }
}

watch(needsDevices, (need) => {
  if (need) void loadDevices();
}, { immediate: true });

const siteIndex = computed(() => new SiteIndex(materials.value));

function slotValue(name: string): string | null {
  const value = values.value[name];
  return typeof value === "string" && value.trim() ? value : null;
}

/** 选项：设备 = 在线设备 id；库位 = 物料树上的 Site（「物料 · 标签」）。当前值不在目录里时补一条「（当前值）」。 */
function slotOptions(parameter: BackendWorkflowInputParameter): { label: string; value: string }[] {
  const options =
    entryFieldKind(parameter.schema) === "device"
      ? devices.value.map((id) => ({ label: id, value: id }))
      : siteIndex.value.sites.map((site) => ({ label: site.label, value: site.value }));
  const current = slotValue(parameter.name);
  if (current && !options.some((option) => option.value === current)) options.unshift({ label: `${current}（当前值）`, value: current });
  return options;
}

function slotError(parameter: BackendWorkflowInputParameter): string {
  return entryFieldKind(parameter.schema) === "device" ? devicesError.value : materialsError.value ? "库位目录拉取失败，请直接填写 Site uuid" : "";
}

function slotLoading(parameter: BackendWorkflowInputParameter): boolean {
  return entryFieldKind(parameter.schema) === "device" ? devicesLoading.value : materialsLoading.value;
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
      <template v-else-if="isResourceEntryKind(entryFieldKind(parameter.schema))">
        <NInput
          v-if="materialsError"
          :value="resourceText(parameter.name)"
          type="textarea"
          class="mono"
          :autosize="{ minRows: 1, maxRows: 4 }"
          :placeholder="`JSON · ${placeholderOf(parameter)}`"
          :disabled="props.disabled"
          size="small"
          @update:value="set(parameter.name, $event)"
        />
        <NSelect
          v-else
          class="entry-resource"
          :value="resourceSelection(parameter)"
          :options="resourceOptions(parameter)"
          :loading="materialsLoading"
          :multiple="entryFieldKind(parameter.schema) === 'resources'"
          :placeholder="`选择物料 · ${placeholderOf(parameter)}`"
          :disabled="props.disabled"
          filterable
          clearable
          size="small"
          @update:value="setResource(parameter, $event)"
        />
      </template>
      <template v-else-if="isSlotEntryKind(entryFieldKind(parameter.schema))">
        <NInput
          v-if="slotError(parameter)"
          :value="String(values[parameter.name] ?? '')"
          :placeholder="placeholderOf(parameter)"
          :disabled="props.disabled"
          size="small"
          @update:value="set(parameter.name, $event)"
        />
        <NSelect
          v-else
          class="entry-resource"
          :value="slotValue(parameter.name)"
          :options="slotOptions(parameter)"
          :loading="slotLoading(parameter)"
          :placeholder="`${entryFieldKind(parameter.schema) === 'device' ? '选择设备' : '选择库位'} · ${placeholderOf(parameter)}`"
          :disabled="props.disabled"
          filterable
          clearable
          size="small"
          @update:value="set(parameter.name, $event ?? null)"
        />
      </template>
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
      <div v-else-if="isResourceEntryKind(entryFieldKind(parameter.schema)) && materialsError" class="entry-hint">{{ materialsError }}</div>
      <div v-else-if="isSlotEntryKind(entryFieldKind(parameter.schema)) && slotError(parameter)" class="entry-hint">{{ slotError(parameter) }}</div>
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
