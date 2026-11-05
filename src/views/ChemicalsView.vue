<script setup lang="ts">
/**
 * 化学品库（chemicals-v1）：化学品身份定义的检索、登记、编辑与软删除。
 *
 * 物料内容物通过 `chemical_uuid` 引用这里的定义（按名称 / 英文名 / 别名 / CAS 唯一匹配自动关联，
 * 也可在物料详情里手动关联）。`/chemicals/:id` 打开详情抽屉，内容物上的链接指向这里。
 */
import { computed, h, onMounted, ref, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NIcon,
  NInput,
  NPagination,
  NPopconfirm,
  NSelect,
  NSpace,
  NSpin,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { AddOutline, RefreshOutline } from "@vicons/ionicons5";
import { ApiError, BackendBusinessError, type Chemical, type ChemicalPhysicalState } from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import ChemicalFormDialog from "../components/ChemicalFormDialog.vue";
import { describeError } from "../features/errors";
import {
  PHYSICAL_STATE_OPTIONS,
  chemicalPath,
  describeChemicalError,
  fmtMs,
  formatNumber,
  physicalStateLabel,
} from "../features/chemicals";
import { substanceReferences, type SubstanceReference } from "../features/substance-chemicals";
import { useConnectionStore } from "../stores/connection";

const PAGE_SIZE = 20;

const route = useRoute();
const router = useRouter();
const message = useMessage();
const conn = useConnectionStore();
const api = () => conn.api.domains.chemicalsV1;

const items = shallowRef<Chemical[]>([]);
const total = ref(0);
const page = ref(1);
const loading = ref(false);
const loaded = ref(false);
const unsupported = ref(false);
const lastError = ref("");

const q = ref("");
const cas = ref("");
const physicalState = ref<ChemicalPhysicalState | null>(null);

async function load(resetPage = false) {
  if (!conn.online) return;
  if (resetPage) page.value = 1;
  loading.value = true;
  try {
    const result = await api().chemicals({
      q: q.value.trim(),
      cas: cas.value.trim(),
      physical_state: physicalState.value ?? "",
      page: page.value,
      page_size: PAGE_SIZE,
    });
    items.value = result.items;
    total.value = result.total;
    unsupported.value = false;
    lastError.value = "";
    loaded.value = true;
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) unsupported.value = true;
    else lastError.value = describeError(error);
  } finally {
    loading.value = false;
  }
}

watch(physicalState, () => void load(true));
watch(page, () => void load());

// ── 详情（/chemicals/:id） ──

const detailId = computed(() => String(route.params.id ?? ""));
const detail = shallowRef<Chemical | null>(null);
const detailLoading = ref(false);
const detailError = ref("");
const references = shallowRef<SubstanceReference[] | null>(null);
const referencesLoading = ref(false);

async function loadDetail() {
  detail.value = null;
  detailError.value = "";
  references.value = null;
  const id = detailId.value;
  if (!id || !conn.online) return;
  detailLoading.value = true;
  try {
    const chemical = await api().chemical(id);
    if (id !== detailId.value) return;
    detail.value = chemical;
  } catch (error) {
    if (id !== detailId.value) return;
    detailError.value = error instanceof BackendBusinessError && error.isNotFound
      ? "化学品不存在或已被删除（内容物上的引用仍然保留，只是不再显示属性）"
      : describeError(error);
  } finally {
    detailLoading.value = false;
  }
}

async function loadReferences() {
  const id = detailId.value;
  if (!id) return;
  referencesLoading.value = true;
  try {
    const aggregates = await conn.api.domains.materialsV1.instances();
    if (id === detailId.value) references.value = substanceReferences(aggregates, id);
  } catch (error) {
    message.error(`读取物料失败：${describeError(error)}`);
  } finally {
    referencesLoading.value = false;
  }
}

watch(detailId, () => void loadDetail());

function openDetail(chemical: Chemical) {
  void router.push(chemicalPath(chemical.chemical_uuid));
}

function closeDetail() {
  void router.push("/chemicals");
}

// ── 登记 / 编辑 / 删除 ──

const formOpen = ref(false);
const editing = shallowRef<Chemical | null>(null);

function openCreate() {
  editing.value = null;
  formOpen.value = true;
}

function openEdit(chemical: Chemical) {
  editing.value = chemical;
  formOpen.value = true;
}

function onSaved(chemical: Chemical) {
  message.success(editing.value ? `已保存「${chemical.name}」（版本 ${chemical.version}）` : `已登记「${chemical.name}」`);
  if (detailId.value === chemical.chemical_uuid) detail.value = chemical;
  void load();
}

/** 版本过期 / 已删除：重读列表与详情；编辑中的那条换成最新版本（表单里的改动保留，按新版本只提交改动字段）。 */
async function onStale() {
  void load();
  if (detailId.value) void loadDetail();
  const current = editing.value;
  if (!current) return;
  try {
    editing.value = await api().chemical(current.chemical_uuid);
  } catch {
    formOpen.value = false;
  }
}

const deleting = ref("");

async function remove(chemical: Chemical) {
  deleting.value = chemical.chemical_uuid;
  try {
    await api().deleteChemical(chemical.chemical_uuid, chemical.version);
    message.success(`已删除「${chemical.name}」：CAS / InChIKey 已让出，可以重新登记`);
    if (detailId.value === chemical.chemical_uuid) closeDetail();
  } catch (error) {
    const info = describeChemicalError(error);
    if (info?.conflict) message.warning(info.message, { duration: 8000 });
    else message.error(`删除失败：${info?.message ?? describeError(error)}`);
    if (detailId.value) void loadDetail();
  } finally {
    deleting.value = "";
    void load();
  }
}

const DELETE_HINT = "软删除：CAS / InChIKey 让出、可重新登记；已关联的物料内容物保留引用，但不再显示化学品属性。确认删除？";

const columns = computed<DataTableColumns<Chemical>>(() => [
  {
    title: "名称",
    key: "name",
    minWidth: 180,
    render: (row) => h("div", { class: "name-cell" }, [
      h("span", { class: "name" }, row.name),
      row.name_en ? h("span", { class: "dim" }, row.name_en) : null,
    ]),
  },
  { title: "CAS", key: "cas", width: 120, render: (row) => h("span", { class: "mono" }, row.cas ?? "—") },
  { title: "分子式", key: "molecular_formula", width: 110, render: (row) => h("span", { class: "mono" }, row.molecular_formula ?? "—") },
  { title: "分子量", key: "molecular_weight", width: 96, render: (row) => (row.molecular_weight ? `${formatNumber(row.molecular_weight)}` : "—") },
  { title: "密度 g/mL", key: "density_g_per_ml", width: 96, render: (row) => formatNumber(row.density_g_per_ml) },
  {
    title: "物态",
    key: "physical_state",
    width: 72,
    render: (row) => h(NTag, { size: "small", bordered: false }, () => physicalStateLabel(row.physical_state)),
  },
  {
    title: "别名",
    key: "aliases",
    minWidth: 140,
    render: (row) => (row.aliases.length ? row.aliases.join("、") : h("span", { class: "dim" }, "—")),
  },
  { title: "更新", key: "updated_at_ms", width: 140, render: (row) => h("span", { class: "dim" }, fmtMs(row.updated_at_ms)) },
  {
    title: "",
    key: "actions",
    width: 120,
    render: (row) => h("div", { class: "row-actions", onClick: (event: MouseEvent) => event.stopPropagation() }, [
      h(NButton, { size: "tiny", quaternary: true, onClick: () => openEdit(row) }, () => "编辑"),
      h(NPopconfirm, { onPositiveClick: () => remove(row) }, {
        trigger: () => h(NButton, { size: "tiny", quaternary: true, type: "error", loading: deleting.value === row.chemical_uuid }, () => "删除"),
        default: () => DELETE_HINT,
      }),
    ]),
  },
]);

const subtitle = computed(() =>
  loaded.value ? `${total.value} 条化学品定义 · 物料内容物按名称 / 别名 / CAS 自动关联，也可在物料详情里手动关联` : "化学品身份定义（CAS / InChIKey 唯一）",
);

onMounted(() => {
  void load();
  void loadDetail();
});

watch(() => conn.online, (online) => {
  if (!online) return;
  void load();
  void loadDetail();
});
</script>

<template>
  <div class="page">
    <PageHeader overline="Chemicals" title="化学品库" :subtitle="subtitle">
      <template #actions>
        <NButton size="small" :loading="loading" :disabled="!conn.online" @click="load()">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
        <NButton size="small" type="primary" :disabled="!conn.online || unsupported" @click="openCreate">
          <template #icon><NIcon><AddOutline /></NIcon></template>
          登记化学品
        </NButton>
      </template>
    </PageHeader>

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接后端</span>
      连接后可检索和登记化学品定义。
    </div>
    <div v-else-if="unsupported" class="degraded">
      <span class="degraded-title">当前后端不提供化学品库</span>
      需要带 <code>/api/v1/chemicals</code> 的 Uni-Lab-OS（materials.db v2 及以上）。物料内容物仍按名称显示。
    </div>

    <template v-else>
      <NAlert v-if="lastError" type="error" closable @close="lastError = ''">{{ lastError }}</NAlert>
      <div class="toolbar">
        <NInput v-model:value="q" size="small" clearable placeholder="名称 / 别名 / CAS / 分子式" style="width: 260px" @keyup.enter="load(true)" @clear="q = ''; load(true)" />
        <NInput v-model:value="cas" size="small" clearable placeholder="CAS 精确匹配" style="width: 160px" class="mono" @keyup.enter="load(true)" @clear="cas = ''; load(true)" />
        <NSelect v-model:value="physicalState" size="small" clearable :options="PHYSICAL_STATE_OPTIONS" placeholder="物态" style="width: 120px" />
        <NButton size="small" secondary @click="load(true)">搜索</NButton>
      </div>

      <div v-if="loaded && !items.length && !loading" class="empty-note">
        <NEmpty :description="q || cas || physicalState ? '没有符合条件的化学品' : '还没有登记化学品：点右上角「登记化学品」'" />
      </div>
      <template v-else>
        <NDataTable
          :columns="columns"
          :data="items"
          :loading="loading"
          size="small"
          :scroll-x="1100"
          :row-key="(row: Chemical) => row.chemical_uuid"
          :row-props="(row: Chemical) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
        />
        <div class="footer">
          <span class="dim">点击行查看详情与引用它的物料</span>
          <NPagination v-model:page="page" :page-size="PAGE_SIZE" :item-count="total" size="small" />
        </div>
      </template>
    </template>

    <NDrawer :show="Boolean(detailId)" :width="520" placement="right" @update:show="!$event && closeDetail()">
      <NDrawerContent :title="detail ? detail.name : '化学品详情'" closable>
        <NSpin v-if="detailLoading" />
        <NAlert v-else-if="detailError" type="warning" :bordered="false">{{ detailError }}</NAlert>
        <template v-else-if="detail">
          <div class="detail-head">
            <span v-if="detail.name_en" class="dim">{{ detail.name_en }}</span>
            <NTag size="small" :bordered="false">{{ physicalStateLabel(detail.physical_state) }}</NTag>
            <span class="dim">版本 {{ detail.version }}</span>
          </div>
          <div class="kv-list">
            <div class="kv"><span>CAS</span><b class="mono">{{ detail.cas ?? "—" }}</b></div>
            <div class="kv"><span>InChIKey</span><b class="mono">{{ detail.inchi_key ?? "—" }}</b></div>
            <div class="kv"><span>分子式</span><b class="mono">{{ detail.molecular_formula ?? "—" }}</b></div>
            <div class="kv"><span>SMILES</span><b class="mono">{{ detail.smiles ?? "—" }}</b></div>
            <div class="kv"><span>分子量</span><b>{{ detail.molecular_weight ? `${formatNumber(detail.molecular_weight)} g/mol` : "—" }}</b></div>
            <div class="kv"><span>密度</span><b>{{ detail.density_g_per_ml ? `${formatNumber(detail.density_g_per_ml)} g/mL` : "—" }}</b></div>
            <div class="kv">
              <span>别名</span>
              <b>
                <template v-if="detail.aliases.length">
                  <NTag v-for="alias in detail.aliases" :key="alias" size="small" :bordered="false" class="alias">{{ alias }}</NTag>
                </template>
                <template v-else>—</template>
              </b>
            </div>
            <div class="kv"><span>UUID</span><b class="mono">{{ detail.chemical_uuid }}</b></div>
            <div class="kv"><span>登记</span><b>{{ fmtMs(detail.created_at_ms) }}</b></div>
            <div class="kv"><span>更新</span><b>{{ fmtMs(detail.updated_at_ms) }}</b></div>
          </div>
          <p v-if="detail.description" class="desc">{{ detail.description }}</p>
          <NSpace style="margin-top: 12px">
            <NButton size="small" @click="openEdit(detail)">编辑</NButton>
            <NPopconfirm @positive-click="remove(detail)">
              <template #trigger>
                <NButton size="small" type="error" secondary :loading="deleting === detail.chemical_uuid">删除</NButton>
              </template>
              {{ DELETE_HINT }}
            </NPopconfirm>
          </NSpace>

          <div class="block-title">
            引用它的物料内容物
            <NButton size="tiny" quaternary :loading="referencesLoading" @click="loadReferences">{{ references ? "刷新" : "查找" }}</NButton>
          </div>
          <div v-if="references === null" class="dim">点「查找」扫描当前物料的内容物（只读）。</div>
          <div v-else-if="!references.length" class="dim">当前没有物料内容物引用这条定义。</div>
          <div v-for="item in references ?? []" :key="`${item.materialUuid}-${item.substanceName}`" class="ref-row">
            <RouterLink :to="{ path: '/inventory', query: { material: item.materialUuid } }">{{ item.materialName }}</RouterLink>
            <span>{{ item.substanceName }}</span>
            <span class="mono dim">{{ item.quantity }} {{ item.unit }}</span>
          </div>
        </template>
      </NDrawerContent>
    </NDrawer>

    <ChemicalFormDialog v-model:show="formOpen" :chemical="editing" @saved="onSaved" @stale="onStale" />
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
}

.footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}

.dim {
  color: #8b929c;
  font-size: 12px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

:deep(.name-cell) {
  display: flex;
  flex-direction: column;
}

:deep(.name-cell .name) {
  font-weight: 600;
}

:deep(.row-actions) {
  display: flex;
  gap: 2px;
}

.empty-note {
  padding: 40px 0;
}

.detail-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.kv-list {
  display: grid;
  gap: 6px;
}

.kv {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 8px;
  font-size: 13px;
}

.kv span {
  color: #8b929c;
}

.kv b {
  font-weight: 500;
  overflow-wrap: anywhere;
}

.alias {
  margin: 0 4px 4px 0;
}

.desc {
  margin-top: 10px;
  font-size: 13px;
  color: #3b4652;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 20px 0 8px;
  font-weight: 600;
  font-size: 13px;
}

.ref-row {
  display: grid;
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr) auto;
  gap: 8px;
  padding: 4px 0;
  border-bottom: 1px solid var(--hairline);
  font-size: 13px;
}
</style>
