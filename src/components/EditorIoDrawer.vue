<script setup lang="ts">
/**
 * 编排画布的「入口参数与输出」：声明每次运行要填写的入口参数，以及任务成功后对外给出的输出
 * （绑定到某个节点返回值里的路径）。随草稿保存，「保存为定义 / 更新定义 / 运行」时经 PUT /io 写入。
 * 节点参数在节点浮层里「设为入口参数」引用这里的名字。
 */
import { computed } from "vue";
import {
  NAlert,
  NButton,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NTag,
  NTooltip,
} from "naive-ui";
import type { BackendWorkflowInputParameter, JsonObject, JsonValue } from "@openlab/protocol";
import {
  ENTRY_KIND_OPTIONS,
  editorKindOf,
  schemaOfKind,
  suggestEntryName,
  type EditorEntryKind,
  type EditorOutput,
  type EditorWorkflowIo,
} from "../features/editor-workflow-io";
import { enumOptions } from "../features/workflow-io";

const props = defineProps<{
  nodeOptions: { label: string; value: string }[];
  /** 入口参数名 → 使用它的位置 */
  usage: Map<string, string[]>;
  errors: string[];
  bound: boolean;
}>();
const show = defineModel<boolean>("show", { required: true });
const io = defineModel<EditorWorkflowIo>("io", { required: true });

const OUTPUT_KIND_OPTIONS = ENTRY_KIND_OPTIONS.filter((item) => item.value !== "enum");

function patchInput(index: number, patch: Partial<BackendWorkflowInputParameter>, dropDefault = false) {
  const inputs = io.value.inputs.map((item, i) => {
    if (i !== index) return item;
    const next = { ...item, ...patch };
    if (dropDefault) delete next.default;
    return next;
  });
  io.value = { ...io.value, inputs };
}

function addInput() {
  const name = suggestEntryName("param", new Set(io.value.inputs.map((item) => item.name)));
  io.value = { ...io.value, inputs: [...io.value.inputs, { name, schema: { type: "number" }, required: true }] };
}

function removeInput(index: number) {
  io.value = { ...io.value, inputs: io.value.inputs.filter((_, i) => i !== index) };
}

function renameInput(index: number, name: string) {
  patchInput(index, { name: name.trim() });
}

function setKind(index: number, kind: EditorEntryKind) {
  const current = io.value.inputs[index];
  const enumValues = kind === "enum" ? enumOptions(current.schema).map(String) : [];
  // 换类型后旧默认值多半不再合法，直接清掉
  patchInput(index, { schema: schemaOfKind(kind, enumValues) }, true);
}

function enumText(parameter: BackendWorkflowInputParameter): string {
  return enumOptions(parameter.schema).map(String).join("，");
}

function setEnumValues(index: number, text: string) {
  const values = text.split(/[,，\n]/);
  patchInput(index, { schema: schemaOfKind("enum", values) }, true);
}

function setDefault(index: number, value: JsonValue | null) {
  if (value === null || value === "") patchInput(index, {}, true);
  else patchInput(index, { default: value });
}

function defaultOf(parameter: BackendWorkflowInputParameter): JsonValue | null {
  return Object.prototype.hasOwnProperty.call(parameter, "default") ? (parameter.default ?? null) : null;
}

function enumSelectOptions(parameter: BackendWorkflowInputParameter) {
  return enumOptions(parameter.schema).map((value) => ({ label: String(value), value: String(value) }));
}

const BOOLEAN_DEFAULT_OPTIONS = [
  { label: "是", value: "true" },
  { label: "否", value: "false" },
];

function patchOutput(index: number, patch: Partial<EditorOutput>) {
  io.value = { ...io.value, outputs: io.value.outputs.map((item, i) => (i === index ? { ...item, ...patch } : item)) };
}

function addOutput() {
  const name = suggestEntryName("result", new Set(io.value.outputs.map((item) => item.name)));
  io.value = {
    ...io.value,
    outputs: [...io.value.outputs, { name, schema: { type: "number" }, nodeId: props.nodeOptions[0]?.value ?? "", dataKey: "" }],
  };
}

function removeOutput(index: number) {
  io.value = { ...io.value, outputs: io.value.outputs.filter((_, i) => i !== index) };
}

function outputKind(output: EditorOutput): EditorEntryKind | "json" {
  return editorKindOf(output.schema as JsonObject);
}

const unusedCount = computed(() => io.value.inputs.filter((item) => !props.usage.get(item.name)?.length).length);
</script>

<template>
  <NDrawer v-model:show="show" :width="720" placement="right">
    <NDrawerContent title="入口参数与输出" closable>
      <NAlert type="info" :bordered="false" style="margin-bottom: 12px">
        入口参数是每次运行时填写的值：在节点参数浮层里点「设为入口参数」，节点就引用这里的名字。
        输出取自某个节点返回值里的路径（留空 = 整个返回值），任务成功后显示在任务详情里，也是发布后给父流程用的接口。
        {{ props.bound ? "保存定义或运行时一起写入权威。" : "第一次保存为定义时一起写入。" }}
      </NAlert>

      <div class="section-head">
        <strong>入口参数</strong>
        <span v-if="unusedCount" class="dim">{{ unusedCount }} 个未被任何节点使用（允许）</span>
        <NButton size="small" secondary type="primary" style="margin-left: auto" @click="addInput">新增入口参数</NButton>
      </div>
      <NEmpty v-if="!io.inputs.length" size="small" description="还没有入口参数" />
      <div v-for="(item, index) in io.inputs" :key="index" class="io-row">
        <div class="io-grid">
          <label>名称<NInput :value="item.name" size="small" placeholder="volume" @update:value="renameInput(index, $event)" /></label>
          <label>显示名<NInput :value="item.title ?? ''" size="small" placeholder="体积 mL" @update:value="patchInput(index, { title: $event || undefined })" /></label>
          <label>
            类型
            <NSelect
              v-if="editorKindOf(item.schema) !== 'json'"
              :value="editorKindOf(item.schema)"
              :options="ENTRY_KIND_OPTIONS"
              size="small"
              @update:value="setKind(index, $event)"
            />
            <NInput v-else value="JSON（保留原样）" size="small" disabled />
          </label>
          <label class="inline">必填<NSwitch :value="Boolean(item.required)" size="small" @update:value="patchInput(index, { required: $event })" /></label>
        </div>
        <div class="io-grid">
          <label v-if="editorKindOf(item.schema) === 'enum'" class="wide">
            选项（逗号分隔）
            <NInput :value="enumText(item)" size="small" placeholder="fast，slow" @change="setEnumValues(index, $event)" />
          </label>
          <label>
            默认值
            <NInputNumber
              v-if="editorKindOf(item.schema) === 'number' || editorKindOf(item.schema) === 'integer'"
              :value="typeof defaultOf(item) === 'number' ? (defaultOf(item) as number) : null"
              :precision="editorKindOf(item.schema) === 'integer' ? 0 : undefined"
              size="small"
              clearable
              placeholder="无默认值"
              @update:value="setDefault(index, $event)"
            />
            <NSelect
              v-else-if="editorKindOf(item.schema) === 'boolean'"
              :value="typeof defaultOf(item) === 'boolean' ? String(defaultOf(item)) : null"
              :options="BOOLEAN_DEFAULT_OPTIONS"
              size="small"
              clearable
              placeholder="无默认值"
              @update:value="setDefault(index, $event === null ? null : $event === 'true')"
            />
            <NSelect
              v-else-if="editorKindOf(item.schema) === 'enum'"
              :value="typeof defaultOf(item) === 'string' ? (defaultOf(item) as string) : null"
              :options="enumSelectOptions(item)"
              size="small"
              clearable
              placeholder="无默认值"
              @update:value="setDefault(index, $event)"
            />
            <NInput
              v-else-if="editorKindOf(item.schema) === 'string'"
              :value="typeof defaultOf(item) === 'string' ? (defaultOf(item) as string) : ''"
              size="small"
              placeholder="无默认值"
              @update:value="setDefault(index, $event)"
            />
            <NInput v-else :value="JSON.stringify(defaultOf(item))" size="small" disabled />
          </label>
          <div class="usage">
            <NTooltip v-if="props.usage.get(item.name)?.length">
              <template #trigger>
                <NTag size="small" type="success" :bordered="false">{{ props.usage.get(item.name)!.length }} 处使用</NTag>
              </template>
              <div v-for="where in props.usage.get(item.name)" :key="where">{{ where }}</div>
            </NTooltip>
            <NTag v-else size="small" :bordered="false">未使用</NTag>
            <NButton
              size="tiny"
              quaternary
              type="error"
              :disabled="Boolean(props.usage.get(item.name)?.length)"
              :title="props.usage.get(item.name)?.length ? '还有节点引用它：先在节点浮层里解除引用' : '删除这个入口参数'"
              @click="removeInput(index)"
            >
              删除
            </NButton>
          </div>
        </div>
      </div>

      <div class="section-head" style="margin-top: 20px">
        <strong>输出</strong>
        <NButton size="small" secondary type="primary" style="margin-left: auto" :disabled="!props.nodeOptions.length" @click="addOutput">
          新增输出
        </NButton>
      </div>
      <NEmpty v-if="!io.outputs.length" size="small" description="还没有声明输出：任务结果按节点逐条查看" />
      <div v-for="(item, index) in io.outputs" :key="`out-${index}`" class="io-row">
        <div class="io-grid">
          <label>名称<NInput :value="item.name" size="small" @update:value="patchOutput(index, { name: $event.trim() })" /></label>
          <label>显示名<NInput :value="item.title ?? ''" size="small" @update:value="patchOutput(index, { title: $event || undefined })" /></label>
          <label>
            类型
            <NSelect
              v-if="outputKind(item) !== 'json' && outputKind(item) !== 'enum'"
              :value="outputKind(item)"
              :options="OUTPUT_KIND_OPTIONS"
              size="small"
              @update:value="patchOutput(index, { schema: schemaOfKind($event) })"
            />
            <NInput v-else value="保留原样" size="small" disabled />
          </label>
          <div class="usage">
            <NButton size="tiny" quaternary type="error" @click="removeOutput(index)">删除</NButton>
          </div>
        </div>
        <div class="io-grid">
          <label class="wide">
            来源节点
            <NSelect :value="item.nodeId || null" :options="props.nodeOptions" size="small" filterable placeholder="选择产出它的节点"
              @update:value="patchOutput(index, { nodeId: $event ?? '' })" />
          </label>
          <label class="wide">
            返回值路径
            <NInput :value="item.dataKey" size="small" placeholder="如 result.total；留空 = 整个返回值" @update:value="patchOutput(index, { dataKey: $event })" />
          </label>
        </div>
      </div>

      <NAlert v-if="props.errors.length" type="warning" :bordered="false" style="margin-top: 16px" title="保存前需要处理">
        <div v-for="error in props.errors" :key="error">{{ error }}</div>
      </NAlert>
    </NDrawerContent>
  </NDrawer>
</template>

<style scoped>
.section-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.dim {
  color: #8b929c;
  font-size: 12px;
}

.io-row {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: var(--panel);
}

.io-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 10px;
  align-items: end;
}

.io-grid label {
  display: grid;
  gap: 3px;
  font-size: 11px;
  color: #6b7480;
}

.io-grid label.wide {
  grid-column: span 2;
}

.io-grid label.inline {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-bottom: 6px;
}

.usage {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding-bottom: 4px;
}
</style>
