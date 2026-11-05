<script setup lang="ts">
/** 为内容物选一个化学品定义：按名称 / 别名 / CAS / 分子式检索，找不到可当场登记。 */
import { ref, shallowRef, watch } from "vue";
import { NAlert, NButton, NEmpty, NInput, NModal, NSpace, NSpin, NTag } from "naive-ui";
import type { Chemical } from "@openlab/protocol";
import ChemicalFormDialog from "./ChemicalFormDialog.vue";
import { describeError } from "../features/errors";
import { chemicalSummaryText, physicalStateLabel } from "../features/chemicals";
import { useConnectionStore } from "../stores/connection";

const props = defineProps<{
  /** 正在关联的内容物名称（预填检索词与登记名称）。 */
  substanceName: string;
  busy?: boolean;
  error?: string;
}>();
const show = defineModel<boolean>("show", { required: true });
const emit = defineEmits<{ pick: [chemical: Chemical] }>();

const conn = useConnectionStore();
const query = ref("");
const results = shallowRef<Chemical[]>([]);
const loading = ref(false);
const loadError = ref("");
const createOpen = ref(false);

async function search() {
  loading.value = true;
  loadError.value = "";
  try {
    results.value = (await conn.api.domains.chemicalsV1.chemicals({ q: query.value.trim(), page_size: 30 })).items;
  } catch (error) {
    results.value = [];
    loadError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

watch(show, (open) => {
  if (!open) return;
  query.value = props.substanceName;
  void search().then(() => {
    // 内容物名不一定就是化学品名：没命中时退回列出全部，方便直接挑
    if (!results.value.length && query.value) {
      query.value = "";
      void search();
    }
  });
});

function onCreated(chemical: Chemical) {
  emit("pick", chemical);
}
</script>

<template>
  <NModal v-model:show="show" preset="card" :title="`为内容物「${props.substanceName}」关联化学品`" style="width: min(620px, 94vw)" :mask-closable="!props.busy">
    <div class="picker-search">
      <NInput v-model:value="query" size="small" clearable placeholder="名称 / 别名 / CAS / 分子式" @keyup.enter="search" />
      <NButton size="small" secondary :loading="loading" @click="search">搜索</NButton>
    </div>
    <NAlert v-if="loadError" type="warning" :bordered="false">读取化学品库失败：{{ loadError }}</NAlert>
    <NSpin v-else-if="loading && !results.length" size="small" />
    <NEmpty v-else-if="!results.length" size="small" description="没有匹配的化学品" />
    <div class="picker-list">
      <button
        v-for="item in results"
        :key="item.chemical_uuid"
        type="button"
        class="picker-item"
        :disabled="props.busy"
        @click="emit('pick', item)"
      >
        <span class="picker-main">{{ chemicalSummaryText(item) }}</span>
        <span class="picker-meta">
          <NTag size="tiny" :bordered="false">{{ physicalStateLabel(item.physical_state) }}</NTag>
          <span v-if="item.aliases.length">别名 {{ item.aliases.join("、") }}</span>
        </span>
      </button>
    </div>
    <NAlert v-if="props.error" type="error" :bordered="false" style="margin-top: 8px">{{ props.error }}</NAlert>
    <template #footer>
      <NSpace justify="space-between">
        <NButton size="small" quaternary type="primary" :disabled="props.busy" @click="createOpen = true">没有合适的？登记新化学品</NButton>
        <NButton :disabled="props.busy" @click="show = false">取消</NButton>
      </NSpace>
    </template>
    <ChemicalFormDialog v-model:show="createOpen" :chemical="null" :default-name="props.substanceName" @saved="onCreated" />
  </NModal>
</template>

<style scoped>
.picker-search {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.picker-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 360px;
  overflow: auto;
}

.picker-item {
  display: grid;
  gap: 2px;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: 8px;
  background: var(--panel);
  text-align: left;
  cursor: pointer;
}

.picker-item:hover:not(:disabled) {
  border-color: var(--domain-accent);
}

.picker-main {
  font-size: 13px;
  font-weight: 600;
}

.picker-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  color: #8b929c;
  font-size: 12px;
}
</style>
