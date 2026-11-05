<script setup lang="ts">
/**
 * 化学品登记 / 编辑。CAS 与 InChIKey 先做本地格式检查（即时提示），最终以后端校验为准：
 * 后端的拒绝（校验位、重复登记、版本过期）贴回对应字段。编辑只提交改动过的字段并带 expected_version。
 */
import { computed, ref, watch } from "vue";
import { NAlert, NButton, NDynamicTags, NForm, NFormItem, NGrid, NGridItem, NInput, NInputNumber, NModal, NSelect, NSpace } from "naive-ui";
import type { Chemical } from "@openlab/protocol";
import { describeError } from "../features/errors";
import {
  PHYSICAL_STATE_OPTIONS,
  checkChemicalForm,
  chemicalForm,
  chemicalPatchFromForm,
  chemicalWriteFromForm,
  describeChemicalError,
  type ChemicalField,
  type ChemicalForm,
} from "../features/chemicals";
import { useConnectionStore } from "../stores/connection";

const props = defineProps<{
  /** null = 新建；否则编辑这一条。 */
  chemical: Chemical | null;
  /** 新建时预填的名称（如从内容物「登记新化学品」进来）。 */
  defaultName?: string;
}>();
const show = defineModel<boolean>("show", { required: true });
const emit = defineEmits<{
  saved: [chemical: Chemical];
  /** 版本过期 / 已删除：调用方重新读取。 */
  stale: [];
}>();

const conn = useConnectionStore();
const form = ref<ChemicalForm>(chemicalForm(null));
const fieldErrors = ref<Partial<Record<ChemicalField, string>>>({});
const formError = ref("");
const busy = ref(false);
const editing = computed(() => Boolean(props.chemical));
/** 打开表单时的快照：改动按它比较；版本过期后父组件换上新版本，只取新的 expected_version。 */
let opened: Chemical | null = null;

watch(show, (open) => {
  if (!open) return;
  opened = props.chemical;
  form.value = chemicalForm(props.chemical);
  if (!props.chemical && props.defaultName) form.value.name = props.defaultName;
  fieldErrors.value = {};
  formError.value = "";
});

function feedback(field: ChemicalField) {
  return fieldErrors.value[field];
}

function status(field: ChemicalField) {
  return fieldErrors.value[field] ? ("error" as const) : undefined;
}

async function submit() {
  if (busy.value) return;
  const check = checkChemicalForm(form.value);
  fieldErrors.value = check.errors;
  if (Object.keys(check.errors).length) {
    formError.value = "请先修正标红的字段";
    return;
  }
  formError.value = "";
  const api = conn.api.domains.chemicalsV1;
  busy.value = true;
  try {
    let saved: Chemical;
    if (props.chemical) {
      const patch = chemicalPatchFromForm(opened ?? props.chemical, form.value, props.chemical.version);
      if (!patch) {
        show.value = false;
        return;
      }
      saved = await api.updateChemical(props.chemical.chemical_uuid, patch);
    } else {
      saved = await api.createChemical(chemicalWriteFromForm(form.value));
    }
    emit("saved", saved);
    show.value = false;
  } catch (error) {
    const info = describeChemicalError(error);
    if (info?.field) fieldErrors.value = { [info.field]: info.message };
    formError.value = info?.message ?? describeError(error);
    // 版本过期 / 已删除：不是改字段能解决的，让列表重读
    if (info?.conflict && !info.field) emit("stale");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <NModal
    v-model:show="show"
    preset="card"
    :title="editing ? `编辑化学品 · ${props.chemical?.name}` : '登记化学品'"
    :mask-closable="!busy"
    style="width: min(720px, 96vw)"
  >
    <NForm label-placement="top" size="small">
      <NGrid :cols="2" :x-gap="16">
        <NGridItem>
          <NFormItem label="名称" required :feedback="feedback('name')" :validation-status="status('name')">
            <NInput v-model:value="form.name" placeholder="如 乙醇" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="英文名" :feedback="feedback('name_en')" :validation-status="status('name_en')">
            <NInput v-model:value="form.name_en" placeholder="Ethanol" />
          </NFormItem>
        </NGridItem>
        <NGridItem :span="2">
          <NFormItem label="别名（内容物按名称 / 别名 / CAS 自动关联到这条定义）" :feedback="feedback('aliases')" :validation-status="status('aliases')">
            <NDynamicTags v-model:value="form.aliases" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="CAS 登记号" :feedback="feedback('cas')" :validation-status="status('cas')">
            <NInput v-model:value="form.cas" placeholder="64-17-5" class="mono" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="InChIKey" :feedback="feedback('inchi_key')" :validation-status="status('inchi_key')">
            <NInput v-model:value="form.inchi_key" placeholder="LFQSCWFLJHTTHZ-UHFFFAOYSA-N" class="mono" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="分子式" :feedback="feedback('molecular_formula')" :validation-status="status('molecular_formula')">
            <NInput v-model:value="form.molecular_formula" placeholder="C2H6O" class="mono" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="SMILES" :feedback="feedback('smiles')" :validation-status="status('smiles')">
            <NInput v-model:value="form.smiles" placeholder="CCO" class="mono" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="分子量（g/mol）" :feedback="feedback('molecular_weight')" :validation-status="status('molecular_weight')">
            <NInputNumber v-model:value="form.molecular_weight" :min="0" clearable placeholder="46.07" style="width: 100%" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="密度（g/mL）" :feedback="feedback('density_g_per_ml')" :validation-status="status('density_g_per_ml')">
            <NInputNumber v-model:value="form.density_g_per_ml" :min="0" clearable placeholder="0.789" style="width: 100%" />
          </NFormItem>
        </NGridItem>
        <NGridItem>
          <NFormItem label="物态" :feedback="feedback('physical_state')" :validation-status="status('physical_state')">
            <NSelect v-model:value="form.physical_state" :options="PHYSICAL_STATE_OPTIONS" />
          </NFormItem>
        </NGridItem>
        <NGridItem :span="2">
          <NFormItem label="说明" :feedback="feedback('description')" :validation-status="status('description')">
            <NInput v-model:value="form.description" type="textarea" :autosize="{ minRows: 2, maxRows: 5 }" />
          </NFormItem>
        </NGridItem>
      </NGrid>
    </NForm>
    <NAlert v-if="formError" type="error" :bordered="false">{{ formError }}</NAlert>
    <template #footer>
      <NSpace justify="end">
        <NButton :disabled="busy" @click="show = false">取消</NButton>
        <NButton type="primary" :loading="busy" @click="submit">{{ editing ? "保存修改" : "登记" }}</NButton>
      </NSpace>
    </template>
  </NModal>
</template>

<style scoped>
.mono :deep(input) {
  font-family: var(--font-mono);
}
</style>
