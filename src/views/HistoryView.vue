<script setup lang="ts">
/**
 * 执行历史：history.v1 统一 append-only 事件流（job 状态迁移、反馈、结果、
 * 日志、错误快照、决策审计）。支持按类型 / 设备 / 作业过滤，按全局序列分页，
 * 并可展开事件引用的 payload（inline Base64 解码为文本）。
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
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RefreshOutline } from "@vicons/ionicons5";
import type {
  BackendWorkflowTask,
  HistoryV1Event,
  HistoryV1EventType,
  HistoryV1Payload,
} from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import StatusPill from "../components/StatusPill.vue";
import { describeError } from "../features/errors";
import { describeNodeJob, describeTask, parseIsoMs } from "../features/task-jobs";
import { useConnectionStore } from "../stores/connection";
import { useDevicesStore } from "../stores/devices";
import { useSchedulerStore } from "../stores/scheduler";

const conn = useConnectionStore();
const devices = useDevicesStore();
const sched = useSchedulerStore();
const router = useRouter();
const message = useMessage();

// ── 任务归档：Workflow Authority 的已结束任务（本机调度模式下 history.db 可能为空） ──

const TERMINAL_TASK_STATUSES = new Set(["succeeded", "failed", "canceled", "timeout"]);

const finishedTasks = computed(() =>
  sched.tasks
    .filter((task) => TERMINAL_TASK_STATUSES.has(task.status))
    .sort((a, b) => (parseIsoMs(b.finished_at) ?? 0) - (parseIsoMs(a.finished_at) ?? 0)),
);

function fmtIsoShort(iso?: string | null): string {
  const ms = parseIsoMs(iso ?? undefined);
  return ms ? new Date(ms).toLocaleString("zh-CN", { hour12: false }) : "—";
}

function taskDuration(task: BackendWorkflowTask): string {
  const start = parseIsoMs(task.started_at) ?? parseIsoMs(task.create_time);
  const end = parseIsoMs(task.finished_at);
  if (!start || !end) return "—";
  const s = Math.max(Math.round((end - start) / 1000), 0);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return m < 60 ? `${m} min ${s % 60} s` : `${Math.floor(m / 60)} h ${m % 60} min`;
}

function taskDevices(task: BackendWorkflowTask): string {
  const jobs = sched.jobsByTask[task.uuid] ?? [];
  const ids = new Set(jobs.map((job) => describeNodeJob(task, job).deviceId).filter(Boolean));
  return ids.size ? [...ids].join(", ") : "—";
}

const archiveColumns: DataTableColumns<BackendWorkflowTask> = [
  {
    title: "任务",
    key: "name",
    minWidth: 220,
    render: (row) =>
      h("div", { class: "archive-name" }, [
        h("span", { class: "archive-title-text" }, describeTask(row)),
        h("span", { class: "mono dim archive-uuid" }, row.uuid.slice(0, 8)),
      ]),
  },
  { title: "状态", key: "status", width: 110, render: (row) => h(StatusPill, { status: row.status, size: "small" }) },
  { title: "模式", key: "run_mode", width: 90, render: (row) => row.run_mode },
  { title: "设备", key: "devices", minWidth: 160, render: (row) => h("span", { class: "mono" }, taskDevices(row)) },
  {
    title: "作业",
    key: "jobs",
    width: 90,
    render: (row) => {
      const jobs = sched.jobsByTask[row.uuid] ?? [];
      const failed = jobs.filter((job) => job.status === "failed" || job.status === "timeout").length;
      return failed ? h("span", { class: "err" }, `${jobs.length} · 失败 ${failed}`) : `${jobs.length}`;
    },
  },
  { title: "用时", key: "duration", width: 110, render: (row) => taskDuration(row) },
  { title: "结束", key: "finished_at", width: 170, render: (row) => h("span", { class: "mono" }, fmtIsoShort(row.finished_at)) },
];

const EVENT_TYPES: { value: HistoryV1EventType; label: string; tone: string }[] = [
  { value: "job_transition", label: "状态迁移", tone: "info" },
  { value: "job_feedback", label: "反馈", tone: "default" },
  { value: "job_result", label: "结果", tone: "success" },
  { value: "job_log", label: "日志", tone: "default" },
  { value: "error_snapshot", label: "错误快照", tone: "error" },
  { value: "decision_audit", label: "决策审计", tone: "warning" },
  { value: "action_availability", label: "动作可用性", tone: "default" },
];
const TYPE_META = new Map(EVENT_TYPES.map((item) => [item.value, item]));

const events = ref<HistoryV1Event[]>([]);
const loading = ref(false);
const loaded = ref(false);
const lastError = ref("");
const selectedTypes = ref<HistoryV1EventType[]>([]);
const deviceFilter = ref<string | null>(null);
const jobFilter = ref("");
const keyword = ref("");
const PAGE = 200;
let cursor = 0;
let exhausted = false;

const deviceOptions = computed(() =>
  devices.instruments.map((device) => ({ label: `${device.displayName} · ${device.id}`, value: device.id })),
);

async function load(reset = true) {
  if (!conn.online) return;
  if (reset) {
    cursor = 0;
    exhausted = false;
    events.value = [];
  }
  loading.value = true;
  try {
    const rows = await conn.api.domains.historyV1.events({
      after_sequence: cursor,
      limit: PAGE,
      event_types: selectedTypes.value.length ? selectedTypes.value : undefined,
      device_uuid: deviceFilter.value ?? undefined,
      job_uuid: jobFilter.value.trim() || undefined,
    });
    events.value = reset ? rows : [...events.value, ...rows];
    cursor = rows.length ? rows[rows.length - 1]!.sequence ?? cursor : cursor;
    exhausted = rows.length < PAGE;
    lastError.value = "";
  } catch (error) {
    lastError.value = describeError(error);
  } finally {
    loading.value = false;
    loaded.value = true;
  }
}

/** 追到最新：从当前游标继续读，直到读完。 */
async function loadNewer() {
  await load(false);
}

const visible = computed(() => {
  const text = keyword.value.trim().toLowerCase();
  const rows = text
    ? events.value.filter((event) =>
        [event.event_type, event.device_uuid, event.action_name, event.event_key, JSON.stringify(event.summary)]
          .join(" ")
          .toLowerCase()
          .includes(text),
      )
    : events.value;
  return [...rows].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0));
});

const typeCounts = computed(() => {
  const counts = new Map<string, number>();
  for (const event of events.value) counts.set(event.event_type, (counts.get(event.event_type) ?? 0) + 1);
  return counts;
});

function fmtMs(value: number): string {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function summaryText(summary: Record<string, unknown>): string {
  const preferred = ["status", "to_status", "from_status", "message", "error_summary", "outcome", "feedback_type"];
  const parts: string[] = [];
  for (const key of preferred) {
    if (key in summary && summary[key] !== null && summary[key] !== undefined) parts.push(`${key}=${String(summary[key])}`);
  }
  if (!parts.length) {
    const text = JSON.stringify(summary);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
  return parts.join(" · ");
}

// ── 详情抽屉 ──
const detailOpen = ref(false);
const detail = ref<HistoryV1Event | null>(null);
const payload = ref<HistoryV1Payload | null>(null);
const payloadText = ref("");
const payloadLoading = ref(false);
const chain = ref<HistoryV1Event[]>([]);

function decodePayload(item: HistoryV1Payload): string {
  if (item.storage_kind === "external") return `外部对象：${item.external_uri ?? "—"}`;
  if (!item.inline_payload) return "";
  try {
    const binary = atob(item.inline_payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const text = new TextDecoder("utf-8").decode(bytes);
    if (item.media_type.includes("json")) {
      try {
        return JSON.stringify(JSON.parse(text), null, 2);
      } catch {
        return text;
      }
    }
    return text;
  } catch {
    return "（二进制内容，无法以文本展示）";
  }
}

async function openDetail(event: HistoryV1Event) {
  detail.value = event;
  payload.value = null;
  payloadText.value = "";
  chain.value = [];
  detailOpen.value = true;
  if (event.payload_uuid) {
    payloadLoading.value = true;
    try {
      payload.value = await conn.api.domains.historyV1.payload(event.payload_uuid);
      payloadText.value = decodePayload(payload.value);
    } catch (error) {
      payloadText.value = `payload 读取失败：${describeError(error)}`;
    } finally {
      payloadLoading.value = false;
    }
  }
  if (event.supersedes_event_uuid || event.event_type === "job_result") {
    try {
      chain.value = await conn.api.domains.historyV1.replacementChain(event.event_uuid);
    } catch {
      chain.value = [];
    }
  }
}

async function copyJson(value: unknown) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(value, null, 2));
    message.success("已复制");
  } catch {
    message.error("剪贴板不可用");
  }
}

const columns: DataTableColumns<HistoryV1Event> = [
  { title: "#", key: "sequence", width: 70, render: (row) => h("span", { class: "mono dim" }, String(row.sequence ?? "")) },
  { title: "时间", key: "occurred_at_ms", width: 170, render: (row) => fmtMs(row.occurred_at_ms) },
  {
    title: "类型",
    key: "event_type",
    width: 120,
    render: (row) => {
      const meta = TYPE_META.get(row.event_type);
      return h(NTag, { size: "small", bordered: false, type: (meta?.tone as "info" | "success" | "error" | "warning" | "default") ?? "default" }, { default: () => meta?.label ?? row.event_type });
    },
  },
  { title: "设备", key: "device_uuid", width: 150, ellipsis: { tooltip: true }, render: (row) => row.device_uuid ?? "—" },
  { title: "动作", key: "action_name", width: 150, ellipsis: { tooltip: true }, render: (row) => row.action_name ?? "—" },
  {
    title: "作业",
    key: "job_uuid",
    width: 110,
    render: (row) => (row.job_uuid ? h("span", { class: "mono" }, row.job_uuid.slice(0, 8)) : "—"),
  },
  { title: "摘要", key: "summary", minWidth: 260, ellipsis: { tooltip: true }, render: (row) => summaryText(row.summary) },
  { title: "严重度", key: "severity", width: 90, render: (row) => row.severity ?? "—" },
];

watch([selectedTypes, deviceFilter], () => void load(true));
watch(() => conn.online, (online) => online && void load(true));
watch(() => conn.workflowNoticeRevision, () => void loadNewer());

onMounted(() => {
  devices.startPolling(15000);
  void load(true);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="执行历史"
      :subtitle="`history.v1 统一事件流 · 已载入 ${events.length} 条${exhausted ? '' : '（可继续加载）'}`"
    >
      <template #actions>
        <NButton size="small" :loading="loading" @click="load(true)">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接微后端</span>
      连接后可查看执行历史。
    </div>

    <template v-else>
      <NAlert v-if="lastError" type="error" closable @close="lastError = ''">{{ lastError }}</NAlert>

      <div class="toolbar">
        <div class="chips">
          <button
            v-for="item in EVENT_TYPES"
            :key="item.value"
            class="chip"
            :class="{ active: selectedTypes.includes(item.value) }"
            @click="selectedTypes = selectedTypes.includes(item.value) ? selectedTypes.filter((t) => t !== item.value) : [...selectedTypes, item.value]"
          >
            {{ item.label }}
            <span class="chip-count mono">{{ typeCounts.get(item.value) ?? 0 }}</span>
          </button>
        </div>
        <NSpace align="center" size="small">
          <NSelect v-model:value="deviceFilter" size="small" clearable filterable :options="deviceOptions" placeholder="设备" style="width: 220px" />
          <NInput v-model:value="jobFilter" size="small" clearable placeholder="作业 UUID" style="width: 190px" @keyup.enter="load(true)" />
          <NInput v-model:value="keyword" size="small" clearable placeholder="搜索已载入" style="width: 180px" />
        </NSpace>
      </div>

      <div v-if="loaded && !events.length" class="empty-note">
        <span class="empty-title">history.v1 事件流暂无记录</span>
        <span class="dim">设备执行动作后，状态迁移、反馈、结果与错误快照会在这里逐条归档；下方「任务归档」来自 Workflow Authority，始终可用。</span>
      </div>
      <template v-else>
        <NDataTable
          :columns="columns"
          :data="visible"
          :loading="loading && !events.length"
          size="small"
          :scroll-x="1200"
          :max-height="620"
          :row-key="(row: HistoryV1Event) => row.event_uuid"
          :row-props="(row: HistoryV1Event) => ({ style: 'cursor: pointer', onClick: () => openDetail(row) })"
        />
        <div class="footer">
          <span class="dim">按全局序列升序读取；点击行查看 summary、payload 与替换链。</span>
          <NButton v-if="!exhausted" size="small" :loading="loading" @click="loadNewer">加载更多</NButton>
        </div>
      </template>

      <section class="archive">
        <div class="archive-head">
          <div>
            <span class="archive-title">任务归档</span>
            <span class="dim">已结束的 Workflow Task（Workflow Authority 投影），按结束时间倒序</span>
          </div>
          <span class="dim mono">{{ finishedTasks.length }} 条</span>
        </div>
        <NEmpty v-if="!finishedTasks.length" description="还没有已结束的任务" style="padding: 28px 0" />
        <NDataTable
          v-else
          :columns="archiveColumns"
          :data="finishedTasks"
          size="small"
          :max-height="420"
          :row-key="(row: BackendWorkflowTask) => row.uuid"
          :row-props="(row: BackendWorkflowTask) => ({ style: 'cursor: pointer', onClick: () => router.push(`/workflow-tasks/${encodeURIComponent(row.uuid)}`) })"
        />
      </section>
    </template>

    <NDrawer v-model:show="detailOpen" :width="520" placement="right">
      <NDrawerContent v-if="detail" :title="`${TYPE_META.get(detail.event_type)?.label ?? detail.event_type} · #${detail.sequence ?? ''}`" closable>
        <div class="kv-list">
          <div class="kv"><span>事件</span><b class="mono">{{ detail.event_uuid }}</b></div>
          <div class="kv"><span>发生</span><b>{{ fmtMs(detail.occurred_at_ms) }}</b></div>
          <div class="kv"><span>记录</span><b>{{ fmtMs(detail.recorded_at_ms) }}</b></div>
          <div class="kv"><span>设备</span><b>{{ detail.device_uuid ?? "—" }}</b></div>
          <div class="kv"><span>动作</span><b>{{ detail.action_name ?? "—" }}</b></div>
          <div class="kv">
            <span>作业</span>
            <b class="mono">{{ detail.job_uuid ?? "—" }}</b>
          </div>
          <div class="kv"><span>执行节点</span><b class="mono">{{ detail.endpoint_uuid ?? "—" }}</b></div>
          <div class="kv"><span>event_key</span><b class="mono">{{ detail.event_key ?? "—" }}</b></div>
          <div class="kv"><span>actor</span><b>{{ detail.actor_type ?? "—" }} {{ detail.actor_uuid ?? "" }}</b></div>
          <div v-if="detail.supersedes_event_uuid" class="kv"><span>替换自</span><b class="mono">{{ detail.supersedes_event_uuid }}</b></div>
        </div>

        <div class="block-title">
          summary
          <NButton size="tiny" quaternary @click="copyJson(detail.summary)">复制</NButton>
        </div>
        <pre class="code">{{ JSON.stringify(detail.summary, null, 2) }}</pre>

        <template v-if="detail.payload_uuid">
          <div class="block-title">
            payload
            <span v-if="payload" class="dim">{{ payload.media_type }} · {{ payload.byte_length }} B</span>
          </div>
          <pre class="code">{{ payloadLoading ? "读取中…" : payloadText || "（空）" }}</pre>
        </template>

        <template v-if="chain.length > 1">
          <div class="block-title">替换链（{{ chain.length }}）</div>
          <ol class="chain">
            <li v-for="item in chain" :key="item.event_uuid">
              <span class="mono">{{ item.event_uuid.slice(0, 8) }}</span>
              · {{ fmtMs(item.occurred_at_ms) }} · {{ item.actor_type ?? "system" }}
            </li>
          </ol>
        </template>

        <NSpace style="margin-top: 16px">
          <NButton v-if="detail.job_uuid" size="small" @click="router.push({ path: '/timeline' })">在时间线中查看</NButton>
        </NSpace>
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

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--hairline);
  background: var(--panel);
  font-size: 12px;
  cursor: pointer;
  color: #3d4650;
}

.chip.active {
  border-color: var(--domain-accent);
  background: var(--domain-accent-soft);
  color: var(--domain-accent);
}

.chip-count {
  font-size: 10.5px;
  color: #8b929c;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.empty-note {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 18px 20px;
  border: 1px dashed var(--hairline);
  border-radius: 12px;
  background: var(--panel-soft);
  font-size: 12.5px;
}

.empty-title {
  font-weight: 700;
  color: #3d4650;
}

.archive {
  border: 1px solid var(--hairline);
  border-radius: 14px;
  background: var(--panel);
  padding: 14px 16px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.archive-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.archive-head > div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
}

.archive-title {
  font-weight: 700;
  font-size: 13.5px;
  color: #101418;
}

.archive :deep(.archive-name) {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.archive :deep(.archive-title-text) {
  font-weight: 600;
}

.archive :deep(.archive-uuid) {
  font-size: 11px;
}

.archive :deep(.err) {
  color: #b91c1c;
}

.kv-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 12.5px;
}

.kv {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr);
  gap: 10px;
}

.kv span {
  color: #8b929c;
}

.kv b {
  font-weight: 600;
  word-break: break-all;
}

.block-title {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 16px 0 6px;
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
}

.code {
  margin: 0;
  padding: 10px 12px;
  background: #f7f8f9;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  max-height: 320px;
  overflow: auto;
  white-space: pre-wrap;
  word-break: break-all;
}

.chain {
  margin: 0;
  padding-left: 18px;
  font-size: 12px;
  color: #3d4650;
}

.mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.dim {
  color: #8b929c;
  font-weight: 400;
}
</style>
