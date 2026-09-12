<script setup lang="ts">
/**
 * 数据库浏览：微后端四库（runtime / materials / telemetry / history）的只读行浏览。
 *
 * 数据源是 `/api/v1/debug/databases`：表清单来自实时 sqlite_master，行按 rowid
 * 倒序分页；没有 SQL 入口、没有写路径。这是排障与核对权威数据的窗口，
 * 不是业务操作面——业务写入请回到对应页面走领域 API。
 */
import { computed, h, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NDataTable,
  NEmpty,
  NIcon,
  NInput,
  NPagination,
  NSelect,
  NSwitch,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RefreshOutline, ServerOutline } from "@vicons/ionicons5";
import {
  ApiError,
  type DebugDatabaseSummary,
  type DebugRow,
  type DebugTablePage,
} from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import { useConnectionStore } from "../stores/connection";
import { describeError } from "../features/errors";

const conn = useConnectionStore();
const route = useRoute();
const router = useRouter();
const message = useMessage();

const DATABASE_META: Record<string, { label: string; hint: string }> = {
  runtime: { label: "runtime.db", hint: "Backend 会话、执行 endpoint、命令 inbox、执行 job、outbox、Workflow 定义 / 任务 / 作业、注册表版本" },
  materials: { label: "materials.db", hint: "资源模板、物料聚合、位点、拓扑边、图快照、库存批次 / 预留、变更账本" },
  telemetry: { label: "telemetry.db", hint: "设备最新状态与追加遥测事件" },
  history: { label: "history.db", hint: "payload 对象与统一 append-only 历史事件流" },
};

const databases = ref<DebugDatabaseSummary[]>([]);
const root = ref("");
const loadingDatabases = ref(false);
const unsupported = ref(false);
const lastError = ref("");

const selectedDatabase = ref(String(route.query.db ?? "runtime"));
const selectedTable = ref(String(route.query.table ?? ""));
const page = ref<DebugTablePage | null>(null);
const loadingTable = ref(false);
const pageSize = ref(50);
const pageIndex = ref(1);
const descending = ref(true);
const orderColumn = ref<string | null>(null);
const rowFilter = ref("");

const currentDatabase = computed(() => databases.value.find((item) => item.database === selectedDatabase.value) ?? null);
const tables = computed(() => currentDatabase.value?.tables ?? []);
const totalRows = computed(() => tables.value.reduce((total, table) => total + table.rows, 0));

async function loadDatabases() {
  if (!conn.online) return;
  loadingDatabases.value = true;
  try {
    const result = await conn.api.domains.debug.databases();
    databases.value = result.databases;
    root.value = result.root;
    unsupported.value = false;
    lastError.value = "";
    if (!tables.value.some((table) => table.name === selectedTable.value)) {
      selectedTable.value = tables.value.find((table) => table.rows > 0)?.name ?? tables.value[0]?.name ?? "";
    }
  } catch (error) {
    if (error instanceof ApiError && error.isUnsupported) unsupported.value = true;
    else lastError.value = describeError(error);
  } finally {
    loadingDatabases.value = false;
  }
}

async function loadTable() {
  if (!conn.online || !selectedDatabase.value || !selectedTable.value) {
    page.value = null;
    return;
  }
  loadingTable.value = true;
  try {
    page.value = await conn.api.domains.debug.table(selectedDatabase.value, selectedTable.value, {
      limit: pageSize.value,
      offset: (pageIndex.value - 1) * pageSize.value,
      order: orderColumn.value ?? undefined,
      descending: descending.value,
    });
    lastError.value = "";
  } catch (error) {
    page.value = null;
    lastError.value = describeError(error);
  } finally {
    loadingTable.value = false;
  }
}

function selectDatabase(key: string) {
  selectedDatabase.value = key;
  selectedTable.value = tables.value.find((table) => table.rows > 0)?.name ?? tables.value[0]?.name ?? "";
  pageIndex.value = 1;
  orderColumn.value = null;
}

function selectTable(name: string) {
  selectedTable.value = name;
  pageIndex.value = 1;
  orderColumn.value = null;
}

watch([selectedDatabase, selectedTable, pageIndex, pageSize, descending, orderColumn], () => {
  void router.replace({ query: { db: selectedDatabase.value, table: selectedTable.value || undefined } });
  void loadTable();
});
watch(() => conn.online, (online) => online && void loadDatabases());
watch(() => conn.baseUrl, () => {
  databases.value = [];
  page.value = null;
});

onMounted(() => void loadDatabases());

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

const filteredRows = computed<DebugRow[]>(() => {
  const rows = page.value?.rows ?? [];
  const keyword = rowFilter.value.trim().toLowerCase();
  if (!keyword) return rows;
  return rows.filter((row) => Object.values(row).some((value) => cellText(value).toLowerCase().includes(keyword)));
});

const columns = computed<DataTableColumns<DebugRow>>(() =>
  (page.value?.columns ?? []).map((column) => ({
    title: () =>
      h("span", { class: "col-head" }, [
        column.pk ? h(NTag, { size: "tiny", type: "primary", bordered: false }, { default: () => "PK" }) : null,
        h("span", column.name),
        h("small", { class: "col-type" }, column.type || "any"),
      ]),
    key: column.name,
    minWidth: 140,
    ellipsis: { tooltip: true },
    sorter: false,
    render: (row: DebugRow) => {
      const value = row[column.name];
      const text = cellText(value);
      const isJson = text.startsWith("{") || text.startsWith("[");
      return h("span", { class: ["cell", { mono: isJson || column.pk }], title: text }, text.length > 160 ? `${text.slice(0, 160)}…` : text);
    },
  })),
);

const orderOptions = computed(() => [
  { label: "写入顺序（rowid）", value: "" },
  ...(page.value?.columns ?? []).map((column) => ({ label: column.name, value: column.name })),
]);

async function copyRow(row: DebugRow) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(row, null, 2));
    message.success("已复制该行 JSON");
  } catch {
    message.error("剪贴板不可用");
  }
}

function fmtBytes(size?: number): string {
  if (!size) return "—";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}
</script>

<template>
  <div class="page app-fill">
    <PageHeader
      title="数据库浏览"
      :subtitle="root ? `只读浏览微后端四库 · ${root}` : '只读浏览微后端 runtime / materials / telemetry / history 四库'"
    >
      <template #actions>
        <NButton size="small" :loading="loadingDatabases" @click="loadDatabases(); loadTable()">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接微后端</span>
      连接后可浏览四库的表清单与行数据。
    </div>
    <div v-else-if="unsupported" class="degraded">
      <span class="degraded-title">该进程没有挂载调试路由</span>
      <code>/api/v1/debug/databases</code> 返回 404/503。请确认微后端版本，或连接带四库的进程。
    </div>

    <template v-else>
      <NAlert v-if="lastError" type="error" closable style="margin-bottom: 4px" @close="lastError = ''">{{ lastError }}</NAlert>

      <div class="db-tabs">
        <button
          v-for="db in databases"
          :key="db.database"
          class="db-tab"
          :class="{ active: db.database === selectedDatabase, missing: !db.exists }"
          @click="selectDatabase(db.database)"
        >
          <NIcon size="15"><ServerOutline /></NIcon>
          <span class="db-name">{{ DATABASE_META[db.database]?.label ?? db.database }}</span>
          <span class="db-meta mono">{{ db.exists ? `${db.tables?.length ?? 0} 表 · ${fmtBytes(db.size_bytes)}` : "文件不存在" }}</span>
        </button>
      </div>
      <p v-if="currentDatabase" class="db-hint">{{ DATABASE_META[currentDatabase.database]?.hint }} · 合计 {{ totalRows }} 行</p>

      <div class="layout">
        <aside class="tables">
          <div class="tables-title">表（{{ tables.length }}）</div>
          <NEmpty v-if="!tables.length" size="small" description="该库暂无表" />
          <button
            v-for="table in tables"
            :key="table.name"
            class="table-row"
            :class="{ active: table.name === selectedTable, empty: !table.rows }"
            @click="selectTable(table.name)"
          >
            <span class="table-name mono">{{ table.name }}</span>
            <span class="table-rows mono">{{ table.rows }}</span>
          </button>
        </aside>

        <section class="rows">
          <div class="rows-toolbar">
            <div class="rows-title">
              <span class="mono">{{ selectedTable || "—" }}</span>
              <span v-if="page" class="dim">共 {{ page.total_rows }} 行 · {{ page.columns.length }} 列</span>
            </div>
            <div class="rows-controls">
              <NInput v-model:value="rowFilter" size="small" clearable placeholder="过滤本页" style="width: 180px" />
              <NSelect
                :value="orderColumn ?? ''"
                size="small"
                :options="orderOptions"
                style="width: 190px"
                @update:value="(value: string) => (orderColumn = value || null)"
              />
              <span class="dim small">倒序</span>
              <NSwitch v-model:value="descending" size="small" />
            </div>
          </div>
          <div class="rows-table">
            <NDataTable
              :columns="columns"
              :data="filteredRows"
              :loading="loadingTable"
              size="small"
              flex-height
              :scroll-x="Math.max(800, (page?.columns.length ?? 0) * 160)"
              :row-key="(row: DebugRow) => JSON.stringify(row)"
              :row-props="(row: DebugRow) => ({ ondblclick: () => copyRow(row), title: '双击复制该行 JSON' })"
            />
          </div>
          <div class="rows-footer">
            <NPagination
              v-model:page="pageIndex"
              v-model:page-size="pageSize"
              :item-count="page?.total_rows ?? 0"
              :page-sizes="[25, 50, 100, 200]"
              show-size-picker
              size="small"
            />
          </div>
        </section>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* app-fill：页面锁满可视高度，滚动只发生在表清单与行表格内部 */
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
}

.page :deep(.page-header) {
  position: static;
  margin-bottom: 0;
}

.db-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}

@media (max-width: 900px) {
  .db-tabs {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.db-tab {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border: 1px solid var(--hairline);
  background: var(--panel);
  border-radius: 12px;
  cursor: pointer;
  text-align: left;
  color: #101418;
}

.db-tab.active {
  border-color: var(--domain-accent);
  background: var(--domain-accent-soft);
}

.db-tab.missing {
  opacity: 0.6;
}

.db-name {
  font-weight: 700;
  flex: 1;
}

.db-meta {
  font-size: 11px;
  color: #6e7580;
}

.db-hint {
  margin: -4px 0 0;
  font-size: 12px;
  color: #6e7580;
}

.layout {
  flex: 1;
  min-height: 320px;
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: minmax(0, 1fr);
    grid-template-rows: 200px minmax(0, 1fr);
  }
}

.tables {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-height: 0;
  overflow: auto;
}

.tables-title {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
  padding: 4px 8px 8px;
}

.table-row {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  padding: 7px 10px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  cursor: pointer;
  text-align: left;
  color: #101418;
}

.table-row:hover,
.table-row.active {
  background: var(--panel-soft);
}

.table-row.active .table-name {
  color: var(--domain-accent);
  font-weight: 700;
}

.table-row.empty .table-name {
  color: #8b929c;
}

.table-name {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.table-rows {
  font-size: 11px;
  color: #6e7580;
}

.rows {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  padding: 12px;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rows-table {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.rows-table :deep(.n-data-table) {
  flex: 1;
  min-height: 0;
}

.rows-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 10px;
}

.rows-title {
  display: flex;
  align-items: baseline;
  gap: 10px;
  font-weight: 700;
}

.rows-controls {
  display: flex;
  align-items: center;
  gap: 8px;
}

.rows-footer {
  display: flex;
  justify-content: flex-end;
  padding-top: 10px;
}

:deep(.col-head) {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

:deep(.col-type) {
  font-family: var(--font-mono);
  font-weight: 400;
  color: #a6acb5;
}

:deep(.cell.mono) {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.mono {
  font-family: var(--font-mono);
}

.dim {
  color: #8b929c;
  font-weight: 400;
}

.small {
  font-size: 12px;
}
</style>
