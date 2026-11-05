<script setup lang="ts">
/**
 * 插入已发布的工作流（组合调用）：从每个工作流的最新发布里选一个，为它的每个入口参数给实参——
 * 固定值、绑定到当前流程自己的入口参数，或（可选参数）不传。插入由调用方完成（先保存当前画布，
 * 再 POST composite-invocations）。
 */
import { computed, ref, shallowRef, watch } from "vue";
import { NAlert, NButton, NEmpty, NModal, NSelect, NSpace, NSpin, NTag } from "naive-ui";
import {
  workflowInputReference,
  type BackendCompositeArgument,
  type BackendWorkflowInputParameter,
  type BackendWorkflowPublication,
} from "@openlab/protocol";
import EntryParamFields from "./EntryParamFields.vue";
import { describeError } from "../features/errors";
import {
  buildEntryInput,
  describeEntryParameter,
  describeOutput,
  entryFieldKind,
  initialEntryValues,
  type EntryFormValues,
} from "../features/workflow-io";
import { useConnectionStore } from "../stores/connection";

const props = defineProps<{
  /** 当前流程声明的入口参数（可作为实参绑定的来源）。 */
  parentInputs: BackendWorkflowInputParameter[];
  /** 当前画布绑定的工作流（不能插入自己）。 */
  currentWorkflowUuid: string;
  busy: boolean;
  error: string;
}>();
const show = defineModel<boolean>("show", { required: true });
const emit = defineEmits<{
  insert: [payload: { publication: BackendWorkflowPublication; arguments: Record<string, BackendCompositeArgument> }];
}>();

const conn = useConnectionStore();
const publications = shallowRef<BackendWorkflowPublication[]>([]);
const loading = ref(false);
const loadError = ref("");
const selectedUuid = ref<string | null>(null);
const modes = ref<Record<string, string>>({});
const staticValues = ref<EntryFormValues>({});
const fieldErrors = ref<Record<string, string>>({});
const formError = ref("");

const selected = computed(() => publications.value.find((item) => item.uuid === selectedUuid.value) ?? null);
const candidates = computed(() => publications.value.filter((item) => item.workflow_uuid !== props.currentWorkflowUuid));
const staticInputs = computed(() => (selected.value?.inputs ?? []).filter((item) => modes.value[item.name] === "static"));

async function load() {
  loading.value = true;
  loadError.value = "";
  try {
    publications.value = await conn.api.domains.workflowBackend.latestPublications();
  } catch (error) {
    publications.value = [];
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

watch(show, (open) => {
  if (open) void load();
});

function hasDefault(parameter: BackendWorkflowInputParameter): boolean {
  return Object.prototype.hasOwnProperty.call(parameter, "default");
}

function sameKind(a: BackendWorkflowInputParameter, b: BackendWorkflowInputParameter): boolean {
  return entryFieldKind(a.schema) === entryFieldKind(b.schema);
}

function choose(uuid: string) {
  selectedUuid.value = uuid;
  const publication = publications.value.find((item) => item.uuid === uuid);
  const nextModes: Record<string, string> = {};
  for (const input of publication?.inputs ?? []) {
    // 当前流程有同名同类型的入口参数就默认透传，否则填固定值（有默认值的可不传）
    const parent = props.parentInputs.find((item) => item.name === input.name && sameKind(item, input));
    nextModes[input.name] = parent ? `entry:${parent.name}` : hasDefault(input) || !input.required ? "omit" : "static";
  }
  modes.value = nextModes;
  staticValues.value = initialEntryValues(publication?.inputs ?? []);
  fieldErrors.value = {};
  formError.value = "";
}

function modeOptions(input: BackendWorkflowInputParameter) {
  const options = [{ label: "填写固定值", value: "static" }];
  if (hasDefault(input) || !input.required) options.push({ label: hasDefault(input) ? "不传（用默认值）" : "不传", value: "omit" });
  for (const parent of props.parentInputs) {
    options.push({
      label: `绑定入口参数 ${parent.title ? `${parent.title}（${parent.name}）` : parent.name}${sameKind(parent, input) ? "" : " · 类型不同"}`,
      value: `entry:${parent.name}`,
    });
  }
  return options;
}

function setMode(name: string, value: string) {
  modes.value = { ...modes.value, [name]: value };
}

function confirm() {
  const publication = selected.value;
  if (!publication || props.busy) return;
  const built = buildEntryInput(staticInputs.value, staticValues.value);
  const errors: Record<string, string> = { ...built.errors };
  const args: Record<string, BackendCompositeArgument> = {};
  for (const input of publication.inputs) {
    const mode = modes.value[input.name] ?? "static";
    if (mode.startsWith("entry:")) args[input.name] = workflowInputReference(mode.slice("entry:".length));
    else if (mode === "static") {
      if (Object.prototype.hasOwnProperty.call(built.input, input.name)) args[input.name] = built.input[input.name];
      else if (!errors[input.name] && input.required && !hasDefault(input)) errors[input.name] = "必填";
    } else if (input.required && !hasDefault(input)) errors[input.name] = "必填输入不能不传";
  }
  fieldErrors.value = errors;
  if (Object.keys(errors).length) {
    formError.value = "请先补全标红的实参";
    return;
  }
  formError.value = "";
  emit("insert", { publication, arguments: args });
}

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
</script>

<template>
  <NModal v-model:show="show" preset="card" title="插入已发布的工作流" style="width: min(860px, 96vw)" :mask-closable="!props.busy">
    <div class="insert-layout">
      <section class="pub-list">
        <div class="col-title">已发布的工作流（各取最新发布）</div>
        <NSpin v-if="loading" size="small" />
        <NAlert v-else-if="loadError" type="warning" :bordered="false">读取发布目录失败：{{ loadError }}</NAlert>
        <NEmpty v-else-if="!candidates.length" size="small" description="还没有可插入的工作流：先在流程详情页「发布当前版本」" />
        <button
          v-for="item in candidates"
          :key="item.uuid"
          type="button"
          class="pub-item"
          :class="{ active: item.uuid === selectedUuid }"
          @click="choose(item.uuid)"
        >
          <span class="pub-name">{{ item.name }}</span>
          <span class="pub-meta">版本 {{ item.revision }} · {{ fmtTime(item.create_time) }}</span>
          <span class="pub-meta">输入 {{ item.inputs.length }} · 输出 {{ item.outputs.length }}</span>
        </button>
      </section>
      <section class="pub-form">
        <template v-if="selected">
          <div class="col-title">
            {{ selected.name }} <NTag size="small" :bordered="false">版本 {{ selected.revision }}</NTag>
          </div>
          <div v-if="selected.outputs.length" class="dim">输出：{{ selected.outputs.map(describeOutput).join("；") }}</div>
          <div v-if="!selected.inputs.length" class="dim" style="margin-top: 8px">这个工作流没有入口参数，直接插入即可。</div>
          <div v-for="input in selected.inputs" :key="input.name" class="arg-row">
            <div class="arg-head">
              <span class="arg-name">{{ describeEntryParameter(input) }}</span>
              <NSelect
                :value="modes[input.name]"
                :options="modeOptions(input)"
                size="small"
                class="arg-mode"
                @update:value="setMode(input.name, $event)"
              />
            </div>
            <div v-if="fieldErrors[input.name] && modes[input.name] !== 'static'" class="arg-error">{{ fieldErrors[input.name] }}</div>
          </div>
          <div v-if="staticInputs.length" class="static-block">
            <div class="col-title">固定值</div>
            <EntryParamFields v-model:values="staticValues" :parameters="staticInputs" :field-errors="fieldErrors" :disabled="props.busy" />
          </div>
          <NAlert type="info" :bordered="false" style="margin-top: 12px">
            插入前会先保存当前画布；子工作流按所选发布的快照展开成只读步骤，绑定的入口参数在每次运行时由当前流程的输入传进去。
          </NAlert>
        </template>
        <NEmpty v-else size="small" description="从左侧选一个已发布的工作流" style="margin-top: 40px" />
        <NAlert v-if="formError || props.error" type="error" :bordered="false" style="margin-top: 12px">{{ formError || props.error }}</NAlert>
      </section>
    </div>
    <template #footer>
      <NSpace justify="end">
        <NButton :disabled="props.busy" @click="show = false">取消</NButton>
        <NButton type="primary" :loading="props.busy" :disabled="!selected" @click="confirm">保存画布并插入</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.insert-layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: 16px;
  min-height: 320px;
}

.col-title {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}

.pub-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 460px;
  overflow: auto;
  padding-right: 4px;
  border-right: 1px solid var(--hairline);
}

.pub-item {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--panel);
  text-align: left;
  cursor: pointer;
}

.pub-item.active {
  border-color: #7c3aed;
  background: #f5f3ff;
}

.pub-name {
  font-weight: 600;
  font-size: 13px;
}

.pub-meta,
.dim {
  color: #8b929c;
  font-size: 12px;
}

.arg-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--hairline);
}

.arg-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.arg-name {
  font-size: 13px;
}

.arg-mode {
  width: 260px;
  flex-shrink: 0;
}

.arg-error {
  color: #b91c1c;
  font-size: 12px;
  margin-top: 4px;
}

.static-block {
  margin-top: 12px;
}
</style>
