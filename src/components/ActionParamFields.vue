<script setup lang="ts">
/**
 * 动作参数表单渲染件（EditorView 节点浮层与 DevicesView 单点动作同源复用）：
 * placeholder 动态下拉（物料/设备/模板/指派人 tags）+ 回退提示 + 平铺字段
 * （数字/开关/文本/list）+「展开全部」次级入口。
 *
 * 编辑器特有的「绑定」「置顶」按钮经 #placeholder-actions / #field-actions
 * 插槽注入；list 参数在编辑器走「在表格中编辑」（list-in-table + @edit-list），
 * 设备页则提示到高级 JSON 中改。
 */
import { h, type VNodeChild } from "vue";
import { NButton, NInput, NInputNumber, NSelect, NSwitch } from "naive-ui";
import type { SelectOption } from "naive-ui";
import {
  placeholderLabel,
  type PlaceholderField,
} from "../features/action-placeholders";
import type { ActionParamForm } from "../features/action-param-form";
import type { PlaceholderOption } from "../features/action-param-form";
import type { ParameterField } from "../features/workflow-variables";

const props = withDefaults(
  defineProps<{
    form: ActionParamForm;
    /** list 参数提供「在表格中编辑」入口（编辑器）；否则提示走高级 JSON。 */
    listInTable?: boolean;
    emptyText?: string;
  }>(),
  {
    listInTable: false,
    emptyText: "当前没有参数字段，可在高级 JSON 中添加。",
  },
);

const emit = defineEmits<{ (e: "edit-list", field: ParameterField): void }>();

/**
 * 按类型自适应布局，压缩纵向空间、提高信息密度：
 * - compact：label 左、控件右同行，窄字段（数字/开关/短字符串）可两列流式；
 * - block：占满整行（list 行、长文本）。
 */
function fieldLayout(field: ParameterField): "compact" | "block" {
  if (field.type === "number" || field.type === "boolean") return "compact";
  if (field.type.startsWith("list:")) return "block";
  return String(field.value ?? "").length <= 24 ? "compact" : "block";
}

const {
  activePlaceholderFields,
  hasFocusConcept,
  placeholderFallbackHints,
  optionStateFor,
  placeholderCurrentValue,
  placeholderHasExplicitValue,
  placeholderSelectOptions,
  updatePlaceholderValue,
  deductDraftFor,
  deductCurrentLabel,
  submitDeduct,
  paramFields,
  showAllParams,
  visibleParamFields,
  collapsedParamCount,
  isFieldFocused,
  fieldMeta,
  updateField,
} = props.form;

/** 字段主标签：驱动 docstring 给的中文名优先，没有就是参数名（路径末段）。 */
function fieldTitle(path: string): string {
  return fieldMeta(path).title || path;
}

/** hover 提示：说明 + 参数路径 · 类型，说明缺失时只剩后者。 */
function fieldTooltip(field: ParameterField): string {
  const description = fieldMeta(field.path).description;
  const identity = `${field.path} · ${field.type}`;
  return description ? `${description}\n${identity}` : identity;
}

function isMultiSelect(field: PlaceholderField): boolean {
  return (
    (field.kind === "resource" || field.kind === "confirm") && field.multiple
  );
}

/** confirm 数据源 allow_free_input：tags 自由输入（404 降级后恒 true）。 */
function allowsTag(field: PlaceholderField): boolean {
  return field.kind === "confirm" && optionStateFor(field.kind).allowFreeInput;
}

function isExplicitEmptyAssignees(field: PlaceholderField): boolean {
  const value = placeholderCurrentValue(field);
  return placeholderHasExplicitValue(field) && Array.isArray(value) && value.length === 0;
}

/** 出库资源类选项列表（收窄为 naive-ui SelectOption 兼容形状）。 */
function deductOptions(field: PlaceholderField): SelectOption[] {
  return optionStateFor(field.kind).options as SelectOption[];
}

/** 出库资源类选项：显示名为主，小字类 id 为次（避免长 id 截断不可读）。 */
function renderDeductOption(option: SelectOption): VNodeChild {
  const item = option as PlaceholderOption;
  if (!item.displayName || !item.registryClass) return String(option.label ?? "");
  if (item.displayName === item.registryClass) {
    return h("span", { class: "deduct-option-name" }, item.registryClass);
  }
  return h("div", { class: "deduct-option" }, [
    h("span", { class: "deduct-option-name" }, item.displayName),
    h("span", { class: "deduct-option-id" }, item.registryClass),
  ]);
}
</script>

<template>
  <div class="action-param-fields">
    <div
      v-if="activePlaceholderFields.length"
      class="parameter-fields placeholder-fields"
    >
      <div
        v-for="field in activePlaceholderFields"
        :key="`ph-${field.param}`"
        class="parameter-field placeholder-field"
      >
        <!-- 中文语义为主（驱动 docstring 的显示名优先，否则选择器类别），参数名为次 -->
        <div class="parameter-field-head">
          <div class="field-id" :title="fieldMeta(field.param).description || undefined">
            <strong>{{ fieldMeta(field.param).title || placeholderLabel(field) }}</strong>
            <span>
              {{ field.param }}
              <template v-if="fieldMeta(field.param).title"> · {{ placeholderLabel(field) }}</template>
            </span>
          </div>
          <slot name="placeholder-actions" :field="field" />
        </div>
        <div
          v-if="fieldMeta(field.param).description"
          class="field-help"
          :title="fieldMeta(field.param).description"
        >
          {{ fieldMeta(field.param).description }}
        </div>
        <!-- 物料出库：资源类 + 实例名 + 数量 + 可选条码 → 微后端实例化并
             权威登记，产物写回参数；数量 >1 时循环出库并自动加序号后缀 -->
        <template v-if="field.kind === 'deduct'">
          <div class="deduct-row">
            <NSelect
              :value="deductDraftFor(field.param).registryClass || null"
              :options="deductOptions(field)"
              :loading="optionStateFor(field.kind).loading"
              :render-label="renderDeductOption"
              :consistent-menu-width="false"
              size="small"
              filterable
              clearable
              class="deduct-class"
              placeholder="选择出库资源类"
              @update:value="
                deductDraftFor(field.param).registryClass = $event ?? ''
              "
            />
            <NInput
              :value="deductDraftFor(field.param).name"
              size="small"
              class="deduct-name"
              placeholder="实例名（留空自动生成）"
              @update:value="deductDraftFor(field.param).name = $event"
            />
          </div>
          <div class="deduct-row">
            <NInputNumber
              :value="deductDraftFor(field.param).quantity"
              size="small"
              class="deduct-quantity"
              :min="1"
              :max="50"
              :precision="0"
              title="出库数量；大于 1 时实例名自动加 -1/-2… 序号后缀"
              @update:value="deductDraftFor(field.param).quantity = $event ?? 1"
            />
            <NInput
              :value="deductDraftFor(field.param).barcode"
              size="small"
              class="deduct-barcode"
              :disabled="deductDraftFor(field.param).quantity > 1"
              :placeholder="
                deductDraftFor(field.param).quantity > 1
                  ? '数量大于 1 时不支持条码'
                  : '条码（可选）'
              "
              @update:value="deductDraftFor(field.param).barcode = $event"
            />
            <NButton
              size="small"
              type="primary"
              secondary
              :loading="deductDraftFor(field.param).busy"
              @click="submitDeduct(field)"
            >
              出库
            </NButton>
          </div>
          <div v-if="deductCurrentLabel(field)" class="deduct-current">
            已出库：{{ deductCurrentLabel(field) }}
          </div>
        </template>
        <NSelect
          v-else
          :value="placeholderCurrentValue(field)"
          :options="placeholderSelectOptions(field)"
          :loading="optionStateFor(field.kind).loading"
          :multiple="isMultiSelect(field)"
          :tag="allowsTag(field)"
          size="small"
          filterable
          clearable
          :placeholder="
            allowsTag(field)
              ? `输入或选择${placeholderLabel(field)}（回车添加；留空 = 不指派，任何人可确认）`
              : `选择${placeholderLabel(field)}`
          "
          @update:value="updatePlaceholderValue(field, $event)"
        />
        <div v-if="field.kind === 'confirm' && field.multiple" class="confirm-assignee-tools">
          <NButton
            size="tiny"
            secondary
            :type="isExplicitEmptyAssignees(field) ? 'success' : 'default'"
            :disabled="isExplicitEmptyAssignees(field)"
            @click="updatePlaceholderValue(field, [])"
          >
            {{
              isExplicitEmptyAssignees(field)
                ? '已明确为空列表'
                : '明确为空列表（不指派）'
            }}
          </NButton>
          <span v-if="!placeholderHasExplicitValue(field)" class="confirm-assignee-warning">
            尚未选择：提交前请明确选择人员，或点击“明确为空列表”。
          </span>
          <span v-else class="confirm-assignee-hint">
            空列表表示任何人可确认；非空列表只允许列出的用户确认。
          </span>
        </div>
      </div>
    </div>
    <div
      v-for="hint in placeholderFallbackHints"
      :key="hint"
      class="placeholder-hint"
    >
      {{ hint }}
    </div>
    <div v-if="visibleParamFields.length" class="parameter-fields flow-fields">
      <div
        v-for="field in visibleParamFields"
        :key="field.path"
        class="parameter-field"
        :class="[fieldLayout(field), { focused: isFieldFocused(field.path) }]"
      >
        <!-- compact：label 左 + 控件右同行，降低心智负担 / 提高信息密度；
             有中文名时中文为主、参数名小字为次，说明另起一行 -->
        <template v-if="fieldLayout(field) === 'compact'">
          <div class="compact-row">
            <span
              class="compact-label"
              :class="{ named: fieldMeta(field.path).title }"
              :title="fieldTooltip(field)"
            >
              {{ fieldTitle(field.path) }}
              <small v-if="fieldMeta(field.path).title">{{ field.path }}</small>
            </span>
            <slot name="field-actions" :field="field" />
            <NInputNumber
              v-if="field.type === 'number'"
              :value="Number(field.value)"
              size="small"
              class="compact-number"
              @update:value="updateField(field, $event)"
            />
            <NSwitch
              v-else-if="field.type === 'boolean'"
              :value="Boolean(field.value)"
              size="small"
              @update:value="updateField(field, $event)"
            />
            <NInput
              v-else
              :value="String(field.value ?? '')"
              size="small"
              class="compact-input"
              @update:value="updateField(field, $event)"
            />
          </div>
          <div
            v-if="fieldMeta(field.path).description"
            class="field-help compact-help"
            :title="fieldMeta(field.path).description"
          >
            {{ fieldMeta(field.path).description }}
          </div>
        </template>
        <template v-else>
          <div class="parameter-field-head">
            <div class="field-id" :title="fieldTooltip(field)">
              <strong :class="{ mono: !fieldMeta(field.path).title }">
                {{ fieldTitle(field.path) }}
              </strong>
              <span>
                <template v-if="fieldMeta(field.path).title">{{ field.path }} · </template>{{ field.type }}
              </span>
            </div>
            <slot name="field-actions" :field="field" />
          </div>
          <div
            v-if="fieldMeta(field.path).description"
            class="field-help"
            :title="fieldMeta(field.path).description"
          >
            {{ fieldMeta(field.path).description }}
          </div>
          <div v-if="field.type.startsWith('list:')" class="list-param">
            <span>{{ Array.isArray(field.value) ? field.value.length : 0 }} 行等长数据</span>
            <NButton
              v-if="listInTable"
              size="tiny"
              type="primary"
              secondary
              @click="emit('edit-list', field)"
            >
              在表格中编辑
            </NButton>
            <span v-else class="list-json-hint">请在下方高级 JSON 中编辑</span>
          </div>
          <NInput
            v-else
            :value="String(field.value ?? '')"
            size="small"
            @update:value="updateField(field, $event)"
          />
        </template>
      </div>
    </div>
    <div
      v-else-if="!paramFields.length && !activePlaceholderFields.length"
      class="parameter-empty"
    >
      {{ emptyText }}
    </div>
    <NButton
      v-if="hasFocusConcept && (collapsedParamCount > 0 || showAllParams)"
      size="tiny"
      quaternary
      class="expand-params"
      @click="showAllParams = !showAllParams"
    >
      {{ showAllParams ? "收起" : `更多参数（${collapsedParamCount}）` }}
    </NButton>
  </div>
</template>

<style scoped>
.parameter-fields {
  display: grid;
  gap: 8px;
}

/* 平铺字段区：窄字段两列流式排布，块字段独占整行 */
.parameter-fields.flow-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 一张 compact 卡至少要装下：参数名（≥ 9 个等宽字符）+ 置顶按钮 + 控件，
   否则退成单列——否则参数名会被挤成 "p..." 只剩一个字 */
.flow-fields .parameter-field.compact {
  flex: 1 1 calc(50% - 3px);
  min-width: 260px;
  padding: 4px 8px;
}

.flow-fields .parameter-field.block {
  flex: 1 1 100%;
}

.parameter-field {
  padding: 9px;
  border: 1px solid #ebe9e4;
  border-radius: 9px;
  background: #fff;
}

.compact-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 26px;
}

/* 参数名按自身宽度占位、有可读下限，只在确实放不下时才省略（hover 看全名）；
   多余空间与控件均分，数字 / 开关行仍靠右对齐 */
.compact-label {
  flex: 1 1 auto;
  min-width: 9ch;
  overflow: hidden;
  color: #3d434c;
  font: 11px var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 有中文名：中文为主（正文字体），参数名小字等宽跟在后面 */
.compact-label.named {
  font: 600 12px/1.4 var(--font-sans);
  color: #23272e;
}

.compact-label small {
  margin-left: 4px;
  color: #9aa1aa;
  font: 9.5px var(--font-mono);
}

/* 参数说明：驱动 docstring 的 Args 注解，单行省略、hover 看全文 */
.field-help {
  margin-top: 4px;
  color: #6e7580;
  font-size: 10.5px;
  line-height: 1.5;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field-help.compact-help {
  margin-top: 1px;
  padding-bottom: 2px;
}

.compact-number {
  flex-shrink: 0;
  width: 118px;
}

.compact-input {
  flex: 1 1 96px;
  min-width: 96px;
}

.parameter-field.focused {
  border-color: #bdcdfd;
  background: #f7f9ff;
}

.placeholder-fields {
  margin-bottom: 8px;
}

.parameter-field.placeholder-field {
  border-color: #d9e2fb;
  background: #f8faff;
}

.deduct-row {
  display: flex;
  align-items: center;
  gap: 6px;
}

.deduct-row + .deduct-row {
  margin-top: 6px;
}

.deduct-class {
  flex: 1.4;
  min-width: 0;
}

.deduct-name {
  flex: 1;
  min-width: 0;
}

.deduct-quantity {
  flex-shrink: 0;
  width: 92px;
}

.deduct-barcode {
  flex: 1;
  min-width: 0;
}


.deduct-current {
  margin-top: 6px;
  color: #067a4b;
  font: 11px var(--font-mono);
}

.placeholder-hint {
  margin: 6px 0;
  padding: 6px 9px;
  border: 1px dashed #e4d9bd;
  border-radius: 8px;
  background: #fdfaf1;
  color: #8a7b52;
  font-size: 11px;
  line-height: 1.6;
}

.confirm-assignee-tools {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.confirm-assignee-warning,
.confirm-assignee-hint {
  color: #8a7b52;
  font-size: 10px;
  line-height: 1.5;
}

.confirm-assignee-hint {
  color: #5c786d;
}

.expand-params {
  margin-top: 6px;
  color: #6e7580;
}

.parameter-field-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 6px;
}

/* 主名 + 次级说明同行 baseline 对齐，超长省略不换行 */
.field-id {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: baseline;
  gap: 6px;
  overflow: hidden;
}

.field-id strong {
  font: 600 12px/1.4 var(--font-sans);
  color: #23272e;
  white-space: nowrap;
}

.field-id strong.mono {
  font: 11px var(--font-mono);
}

.field-id span {
  color: #9aa1aa;
  font: 9.5px var(--font-mono);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.list-param {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: #6e7580;
  font-size: 11px;
}

.list-json-hint {
  color: #9aa1aa;
}

.parameter-empty {
  padding: 18px;
  border: 1px dashed #dedbd4;
  border-radius: 9px;
  color: #9aa1aa;
  text-align: center;
  font-size: 11px;
}
</style>

<style>
/* 出库资源类选项（menu teleport 到 body，需全局样式）：
   显示名为主、小字类 id 为次，配合 consistent-menu-width=false 避免截断 */
.deduct-option {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 2px 0;
  line-height: 1.4;
}

.deduct-option-name {
  font-size: 13px;
}

.deduct-option-id {
  color: #9aa1aa;
  font: 10px var(--font-mono);
}
</style>
