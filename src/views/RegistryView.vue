<script setup lang="ts">
/**
 * 注册表（Registry Authority）：条目级注册表版本管理。
 *
 * 只在 `--role backend` 调度权威进程可用：Edge 每次刷新全量上报模板定义，
 * 字段变化的条目自增版本；被活跃 workflow 节点引用的 action 删除/变化时挂起
 * 为 pending，在这里「升级」或「忽略」；也可以把历史版本还原为新的生效版本。
 * 纯 Host 进程没有本域（404），页面给出明确降级说明。
 */
import { computed, h, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NDataTable,
  NDrawer,
  NDrawerContent,
  NEmpty,
  NIcon,
  NInput,
  NPopconfirm,
  NSpace,
  NTabPane,
  NTabs,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RefreshOutline } from "@vicons/ionicons5";
import {
  ApiError,
  type RegistryEntryDetail,
  type RegistryEntryStatus,
  type RegistryEntrySummary,
  type RegistryEntryVersion,
  type RegistryPendingImpact,
  type RegistryReport,
} from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import { describeError } from "../features/errors";
import { useConnectionStore } from "../stores/connection";

const conn = useConnectionStore();
const router = useRouter();
const message = useMessage();

const entries = ref<RegistryEntrySummary[]>([]);
const impacts = ref<RegistryPendingImpact[]>([]);
const reports = ref<RegistryReport[]>([]);
const loading = ref(false);
const loaded = ref(false);
const lastError = ref("");
const statusFilter = ref<RegistryEntryStatus | "">("");
const keyword = ref("");
const tab = ref("entries");

const unsupported = computed(() => conn.online && conn.registrySupport === "unsupported");

const describe = describeError;

async function refresh() {
  if (!conn.online || unsupported.value) return;
  loading.value = true;
  const api = conn.api.domains.registry;
  const [entryResult, impactResult, reportResult] = await Promise.allSettled([
    api.entries(statusFilter.value ? { status: statusFilter.value } : {}),
    api.pendingImpacts(),
    api.reports({ page: 1, page_size: 20 }),
  ]);
  if (entryResult.status === "fulfilled") {
    entries.value = entryResult.value.entries;
    lastError.value = "";
  } else if (entryResult.reason instanceof ApiError && entryResult.reason.isUnsupported) {
    conn.registrySupport = "unsupported";
  } else {
    lastError.value = describe(entryResult.reason);
  }
  if (impactResult.status === "fulfilled") impacts.value = impactResult.value.impacts;
  if (reportResult.status === "fulfilled") reports.value = reportResult.value.reports;
  loading.value = false;
  loaded.value = true;
}

const visibleEntries = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  const rows = text ? entries.value.filter((entry) => entry.name.toLowerCase().includes(text)) : entries.value;
  return [...rows].sort((a, b) => {
    const ap = a.status.includes("pending") ? 0 : 1;
    const bp = b.status.includes("pending") ? 0 : 1;
    return ap - bp || a.name.localeCompare(b.name);
  });
});

const counts = computed(() => ({
  total: entries.value.length,
  pending: entries.value.filter((entry) => entry.status.includes("pending")).length,
  removed: entries.value.filter((entry) => entry.status.includes("removed")).length,
  unusable: entries.value.filter((entry) => entry.status.includes("unusable")).length,
}));

function fmtMs(value?: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

const STATUS_TYPE: Record<RegistryEntryStatus, "success" | "warning" | "default" | "error"> = {
  active: "success",
  pending: "warning",
  removed: "default",
  unusable: "error",
};
const STATUS_LABEL: Record<RegistryEntryStatus, string> = {
  active: "生效",
  pending: "挂起",
  removed: "已移除",
  unusable: "不可用",
};

// ── 条目操作 ──
const busy = ref("");

async function apply(name: string) {
  busy.value = `apply:${name}`;
  try {
    await conn.api.domains.registry.applyEntry(name);
    message.success(`已升级 ${name}`);
    await refresh();
  } catch (error) {
    message.error(`升级失败：${describe(error)}`);
  } finally {
    busy.value = "";
  }
}

async function dismiss(name: string) {
  busy.value = `dismiss:${name}`;
  try {
    await conn.api.domains.registry.dismissEntry(name);
    message.success(`已忽略 ${name} 的挂起版本`);
    await refresh();
  } catch (error) {
    message.error(`忽略失败：${describe(error)}`);
  } finally {
    busy.value = "";
  }
}

// ── 详情抽屉 ──
const detailOpen = ref(false);
const detail = ref<RegistryEntryDetail | null>(null);
const versions = ref<RegistryEntryVersion[]>([]);
const detailLoading = ref(false);
const versionPayload = ref<{ version: number; text: string } | null>(null);

async function openDetail(name: string) {
  detailOpen.value = true;
  detailLoading.value = true;
  detail.value = null;
  versions.value = [];
  versionPayload.value = null;
  try {
    const [entry, versionList] = await Promise.all([
      conn.api.domains.registry.entry(name),
      conn.api.domains.registry.entryVersions(name),
    ]);
    detail.value = entry;
    versions.value = versionList.versions;
  } catch (error) {
    message.error(describe(error));
  } finally {
    detailLoading.value = false;
  }
}

async function showVersion(version: number) {
  if (!detail.value) return;
  try {
    const payload = await conn.api.domains.registry.entryVersion(detail.value.name, version);
    versionPayload.value = { version, text: JSON.stringify(payload, null, 2) };
  } catch (error) {
    message.error(describe(error));
  }
}

async function restore(version: number) {
  if (!detail.value) return;
  busy.value = `restore:${version}`;
  try {
    await conn.api.domains.registry.restoreEntry(detail.value.name, version);
    message.success(`已把 v${version} 还原为生效版本`);
    await Promise.all([refresh(), openDetail(detail.value.name)]);
  } catch (error) {
    message.error(`还原失败：${describe(error)}`);
  } finally {
    busy.value = "";
  }
}

const entryColumns: DataTableColumns<RegistryEntrySummary> = [
  {
    title: "条目",
    key: "name",
    minWidth: 220,
    render: (row) => h("a", { class: "link mono", onClick: () => openDetail(row.name) }, row.name),
  },
  {
    title: "状态",
    key: "status",
    width: 190,
    render: (row) =>
      h(NSpace, { size: 4 }, {
        default: () => row.status.map((status) => h(NTag, { size: "small", bordered: false, type: STATUS_TYPE[status] }, { default: () => STATUS_LABEL[status] })),
      }),
  },
  { title: "生效版本", key: "active_version", width: 90, render: (row) => (row.active_version === null ? "—" : `v${row.active_version}`) },
  { title: "挂起版本", key: "pending_version", width: 90, render: (row) => (row.pending_version === null ? "—" : `v${row.pending_version}`) },
  {
    title: "冲突",
    key: "pending_conflicts",
    minWidth: 200,
    render: (row) =>
      row.pending_conflicts.length
        ? h("span", { class: "conflicts" }, row.pending_conflicts.map((c) => `${c.action}（${c.reason === "action-removed" ? "动作被删除" : "动作定义变化"}）`).join("，"))
        : h("span", { class: "dim" }, row.unusable_reason || "—"),
  },
  { title: "更新", key: "updated_at_ms", width: 170, render: (row) => fmtMs(row.updated_at_ms) },
  {
    title: "操作",
    key: "ops",
    width: 150,
    render: (row) =>
      row.pending_version === null
        ? h("span", { class: "dim" }, "—")
        : h(NSpace, { size: 4 }, {
            default: () => [
              h(NButton, { size: "tiny", type: "primary", loading: busy.value === `apply:${row.name}`, onClick: () => apply(row.name) }, { default: () => "升级" }),
              h(NPopconfirm, { onPositiveClick: () => dismiss(row.name) }, {
                trigger: () => h(NButton, { size: "tiny", loading: busy.value === `dismiss:${row.name}` }, { default: () => "忽略" }),
                default: () => "忽略后生效版本不变，挂起版本保留在历史中。",
              }),
            ],
          }),
  },
];

const reportColumns: DataTableColumns<RegistryReport> = [
  { title: "批次", key: "report_id", width: 80 },
  { title: "时间", key: "created_at_ms", width: 170, render: (row) => fmtMs(row.created_at_ms) },
  { title: "Edge", key: "edge_uuid", width: 160, ellipsis: { tooltip: true }, render: (row) => row.edge_uuid || "—" },
  { title: "总数", key: "total", width: 70, render: (row) => row.summary.counts.total },
  { title: "新增", key: "added", width: 70, render: (row) => row.summary.counts.added },
  { title: "更新", key: "updated", width: 70, render: (row) => row.summary.counts.updated },
  { title: "挂起", key: "pending", width: 70, render: (row) => h("span", { class: row.summary.counts.pending ? "warn" : "" }, String(row.summary.counts.pending)) },
  { title: "移除", key: "removed", width: 70, render: (row) => row.summary.counts.removed },
  { title: "复活", key: "revived", width: 70, render: (row) => row.summary.counts.revived },
  { title: "不可用", key: "unusable", width: 80, render: (row) => h("span", { class: row.summary.counts.unusable ? "err" : "" }, String(row.summary.counts.unusable)) },
  { title: "未变化", key: "unchanged", width: 80, render: (row) => row.summary.counts.unchanged },
];

watch(statusFilter, () => void refresh());
watch(() => conn.registrySupport, (support) => support === "available" && void refresh());
onMounted(() => void refresh());
</script>

<template>
  <div class="page">
    <PageHeader
      title="注册表"
      :subtitle="unsupported ? 'Registry Authority 仅在 --role backend 调度权威进程提供' : `${counts.total} 个条目 · ${counts.pending} 个挂起 · ${counts.removed} 个已移除 · ${counts.unusable} 个不可用`"
    >
      <template #actions>
        <NInput v-model:value="keyword" size="small" clearable placeholder="搜索条目" style="width: 200px" />
        <NButton size="small" :loading="loading" :disabled="unsupported" @click="refresh">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接微后端</span>
      连接调度权威进程后可管理注册表版本。
    </div>
    <div v-else-if="unsupported" class="degraded">
      <span class="degraded-title">当前进程没有 Registry Authority</span>
      你连接的是设备执行进程（Host）。注册表版本、挂起冲突与升级确认由
      <code>unilab --role backend</code> 进程持有；把连接地址切到该进程即可使用本页。
      Edge 上报的模板定义在 Host 上仍可在「物料 → 模板目录」中查看。
    </div>

    <template v-else>
      <NAlert v-if="lastError" type="error" closable @close="lastError = ''">{{ lastError }}</NAlert>

      <NAlert v-if="impacts.length" type="warning" :bordered="false" title="有挂起的注册表变更影响到已保存的工作流节点">
        以下条目的动作定义发生变化或被删除，受影响的节点在升级前会保持旧定义。请逐条确认「升级」或「忽略」。
      </NAlert>

      <NTabs v-model:value="tab" type="line" size="small">
        <NTabPane name="entries" :tab="`条目（${entries.length}）`">
          <NSpace style="margin-bottom: 10px" size="small">
            <NButton v-for="option in [['', '全部'], ['active', '生效'], ['pending', '挂起'], ['removed', '已移除'], ['unusable', '不可用']] as const" :key="option[0]" size="tiny" :type="statusFilter === option[0] ? 'primary' : 'default'" :secondary="statusFilter !== option[0]" @click="statusFilter = option[0]">
              {{ option[1] }}
            </NButton>
          </NSpace>
          <NEmpty v-if="loaded && !entries.length" description="尚无注册表条目：Edge 启动后会全量上报模板定义" style="padding: 48px 0" />
          <NDataTable v-else :columns="entryColumns" :data="visibleEntries" :loading="loading" size="small" :scroll-x="1100" :row-key="(row: RegistryEntrySummary) => row.name" />
        </NTabPane>
        <NTabPane name="impacts" :tab="`挂起影响（${impacts.length}）`">
          <NEmpty v-if="!impacts.length" description="没有挂起条目影响到工作流节点" style="padding: 48px 0" />
          <div v-else class="impacts">
            <div v-for="impact in impacts" :key="impact.name" class="impact">
              <div class="impact-head">
                <a class="link mono" @click="openDetail(impact.name)">{{ impact.name }}</a>
                <NTag size="small" type="warning" :bordered="false">v{{ impact.active_version ?? "—" }} → v{{ impact.pending_version }}</NTag>
                <span class="spacer" />
                <NButton size="tiny" type="primary" :loading="busy === `apply:${impact.name}`" @click="apply(impact.name)">升级</NButton>
                <NButton size="tiny" :loading="busy === `dismiss:${impact.name}`" @click="dismiss(impact.name)">忽略</NButton>
              </div>
              <div class="impact-conflicts">
                <span v-for="conflict in impact.conflicts" :key="conflict.action" class="conflict">
                  {{ conflict.action }} · {{ conflict.reason === "action-removed" ? "动作被删除" : "动作定义变化" }}
                </span>
              </div>
              <ul class="affected">
                <li v-for="node in impact.affected_nodes" :key="node.node_uuid">
                  <a class="link" @click="router.push(`/workflows/${encodeURIComponent(node.workflow_uuid)}`)">{{ node.workflow_name }}</a>
                  · 节点 {{ node.node_name }} · 动作 <span class="mono">{{ node.action }}</span>
                </li>
              </ul>
            </div>
          </div>
        </NTabPane>
        <NTabPane name="reports" :tab="`上报批次（${reports.length}）`">
          <NEmpty v-if="!reports.length" description="尚无上报批次" style="padding: 48px 0" />
          <NDataTable v-else :columns="reportColumns" :data="reports" size="small" :scroll-x="1000" :row-key="(row: RegistryReport) => row.report_id" />
        </NTabPane>
      </NTabs>
    </template>

    <NDrawer v-model:show="detailOpen" :width="560" placement="right">
      <NDrawerContent :title="detail?.name ?? '条目详情'" closable>
        <NEmpty v-if="!detail && !detailLoading" description="读取失败" />
        <template v-else-if="detail">
          <NSpace size="small" style="margin-bottom: 12px">
            <NTag v-for="status in detail.status" :key="status" size="small" :bordered="false" :type="STATUS_TYPE[status]">{{ STATUS_LABEL[status] }}</NTag>
            <span class="dim">template_uuid <span class="mono">{{ detail.template_uuid }}</span></span>
          </NSpace>
          <div v-if="detail.pending_conflicts.length" class="block">
            <div class="block-title">挂起冲突</div>
            <ul class="affected">
              <li v-for="c in detail.pending_conflicts" :key="c.action"><span class="mono">{{ c.action }}</span> · {{ c.reason === "action-removed" ? "动作被删除" : "动作定义变化" }}</li>
            </ul>
          </div>
          <div class="block">
            <div class="block-title">版本历史（新在前）</div>
            <table class="versions">
              <tbody>
                <tr v-for="version in versions" :key="version.version">
                  <td class="mono">v{{ version.version }}</td>
                  <td>{{ fmtMs(version.created_at_ms) }}</td>
                  <td class="dim">{{ version.source }}{{ version.restored_from !== null ? ` · 还原自 v${version.restored_from}` : "" }}</td>
                  <td class="right">
                    <NButton size="tiny" quaternary @click="showVersion(version.version)">查看</NButton>
                    <NPopconfirm v-if="version.version !== detail.active_version" @positive-click="restore(version.version)">
                      <template #trigger>
                        <NButton size="tiny" quaternary type="primary" :loading="busy === `restore:${version.version}`">还原</NButton>
                      </template>
                      把 v{{ version.version }} 的内容作为新的生效版本（版本号继续自增）？
                    </NPopconfirm>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="versionPayload" class="block">
            <div class="block-title">v{{ versionPayload.version }} 全文</div>
            <pre class="code">{{ versionPayload.text }}</pre>
          </div>
          <div v-else-if="detail.active_payload" class="block">
            <div class="block-title">生效 payload</div>
            <pre class="code">{{ JSON.stringify(detail.active_payload, null, 2) }}</pre>
          </div>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.link {
  color: var(--domain-accent);
  cursor: pointer;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dim {
  color: #8b929c;
}

.warn {
  color: #b45309;
  font-weight: 700;
}

.err {
  color: #b91c1c;
  font-weight: 700;
}

.conflicts {
  color: #b45309;
  font-size: 12px;
}

.impacts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.impact {
  border: 1px solid #f3d9a4;
  background: #fffaf0;
  border-radius: 12px;
  padding: 12px 14px;
}

.impact-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.spacer {
  flex: 1;
}

.impact-conflicts {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 8px 0;
}

.conflict {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: #fde68a;
  color: #78350f;
}

.affected {
  margin: 0;
  padding-left: 18px;
  font-size: 12.5px;
  color: #3d4650;
}

.block {
  margin-top: 14px;
}

.block-title {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
  margin-bottom: 6px;
}

.versions {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.versions td {
  padding: 6px 6px;
  border-top: 1px solid var(--hairline);
}

.versions td.right {
  text-align: right;
  white-space: nowrap;
}

.code {
  margin: 0;
  padding: 10px 12px;
  background: #f7f8f9;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  max-height: 360px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
