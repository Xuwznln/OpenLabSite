<script setup lang="ts">
/**
 * 系统诊断：进程角色与健康、HostLink 组网、调度资源、安静点重启、
 * runtime.v1 控制面队列（Backend 会话 / 命令 inbox / adapter outbox / 事件 outbox）。
 */
import { computed, h, onMounted, onUnmounted, ref } from "vue";
import {
  NAlert,
  NButton,
  NCard,
  NDataTable,
  NEmpty,
  NIcon,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RefreshOutline } from "@vicons/ionicons5";
import {
  ApiError,
  hostlinkPeerState,
  type RestartMode,
  type RestartScope,
  type RestartStatus,
  type RuntimeAdapterCommand,
  type RuntimeBackendEvent,
  type RuntimeBackendSession,
  type RuntimeCommand,
  type RuntimeExecutorEndpoint,
  type SchedulerResourceSnapshot,
} from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import StatusPill from "../components/StatusPill.vue";
import { useConnectionStore } from "../stores/connection";
import { useDevicesStore } from "../stores/devices";
import { useLabStore } from "../stores/lab";
import { describeError } from "../features/errors";

const conn = useConnectionStore();
const devices = useDevicesStore();
const lab = useLabStore();
const message = useMessage();

const resources = ref<SchedulerResourceSnapshot | null>(null);
const resourcesRemote = ref(false);
const restart = ref<RestartStatus | null>(null);
const sessions = ref<RuntimeBackendSession[]>([]);
const commands = ref<RuntimeCommand[]>([]);
const adapterCommands = ref<RuntimeAdapterCommand[]>([]);
const backendEvents = ref<RuntimeBackendEvent[]>([]);
const endpoints = ref<RuntimeExecutorEndpoint[]>([]);
const loading = ref(false);
const lastError = ref("");

async function refresh() {
  if (!conn.online) return;
  loading.value = true;
  const api = conn.api.domains;
  const results = await Promise.allSettled([
    api.system.schedulerResources(),
    api.system.restartStatus(),
    api.runtimeV1.sessions({ limit: 50 }),
    api.runtimeV1.commands({ limit: 100 }),
    api.runtimeV1.adapterCommands({ limit: 100 }),
    api.runtimeV1.backendEvents({ limit: 100 }),
    api.runtimeV1.endpoints({ limit: 100 }),
    devices.refresh(),
  ]);
  const [resourceResult, restartResult, sessionResult, commandResult, adapterResult, eventResult, endpointResult] = results;
  if (resourceResult.status === "fulfilled") {
    resources.value = resourceResult.value;
    resourcesRemote.value = false;
  } else if (resourceResult.reason instanceof ApiError && resourceResult.reason.status === 503) {
    resources.value = null;
    resourcesRemote.value = true;
  }
  if (restartResult.status === "fulfilled") restart.value = restartResult.value;
  if (sessionResult.status === "fulfilled") sessions.value = sessionResult.value;
  if (commandResult.status === "fulfilled") commands.value = [...commandResult.value].sort((a, b) => b.received_at_ms - a.received_at_ms);
  if (adapterResult.status === "fulfilled") adapterCommands.value = [...adapterResult.value].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0));
  if (eventResult.status === "fulfilled") backendEvents.value = [...eventResult.value].sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0));
  if (endpointResult.status === "fulfilled") endpoints.value = endpointResult.value;
  const failures = results.filter((result): result is PromiseRejectedResult => result.status === "rejected" && !(result.reason instanceof ApiError && result.reason.status === 503));
  lastError.value = failures.length ? failures.map((item) => String(item.reason?.message ?? item.reason)).join("；") : "";
  loading.value = false;
}

// ── 重启 ──
const restartMode = ref<RestartMode>("quiescent");
const restartScope = ref<RestartScope>("auto");
const restarting = ref(false);

async function requestRestart() {
  restarting.value = true;
  try {
    restart.value = await conn.api.domains.system.requestRestart({ mode: restartMode.value, scope: restartScope.value });
    message.success("已登记重启：暂停新派发，active job 清空后按作用域重启");
  } catch (error) {
    message.error(describeError(error));
  } finally {
    restarting.value = false;
  }
}

async function cancelRestart() {
  try {
    restart.value = await conn.api.domains.system.cancelRestart();
    message.success("已取消重启并恢复派发");
  } catch (error) {
    message.error(describeError(error));
  }
}

function fmtMs(value?: number | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function fmtAgo(unixS: number): string {
  const delta = Math.max(0, Math.round(Date.now() / 1000 - unixS));
  if (delta < 60) return `${delta}s 前`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m 前`;
  return `${Math.floor(delta / 3600)}h 前`;
}

const PEER_STATE_LABEL: Record<ReturnType<typeof hostlinkPeerState>, string> = {
  online: "在线",
  stale: "心跳超时",
  disconnected: "已断连",
};

const queueSummary = computed(() => ({
  commandsPending: commands.value.filter((item) => item.status === "received" || item.status === "applying").length,
  commandsRejected: commands.value.filter((item) => item.status === "rejected").length,
  adapterPending: adapterCommands.value.filter((item) => item.status === "pending" || item.status === "sent").length,
  adapterFailed: adapterCommands.value.filter((item) => item.status === "failed").length,
  eventsPending: backendEvents.value.filter((item) => item.status === "pending" || item.status === "sent").length,
  eventsDead: backendEvents.value.filter((item) => item.status === "dead_letter").length,
}));

const sessionColumns: DataTableColumns<RuntimeBackendSession> = [
  { title: "会话", key: "session_uuid", width: 120, render: (row) => h("span", { class: "mono" }, row.session_uuid.slice(0, 8)) },
  { title: "状态", key: "state", width: 110, render: (row) => h(StatusPill, { status: row.state, size: "small", label: row.state }) },
  { title: "Backend", key: "backend_uri", minWidth: 200, ellipsis: { tooltip: true } },
  { title: "Edge", key: "edge_uuid", width: 160, ellipsis: { tooltip: true } },
  { title: "命令游标", key: "command_cursor", width: 90 },
  { title: "事件游标", key: "event_send_cursor", width: 90, render: (row) => `${row.event_ack_sequence}/${row.event_send_cursor}` },
  { title: "最近", key: "last_seen_at_ms", width: 170, render: (row) => fmtMs(row.last_seen_at_ms) },
];

const commandColumns: DataTableColumns<RuntimeCommand> = [
  { title: "序号", key: "backend_sequence", width: 70 },
  { title: "类型", key: "command_type", width: 130 },
  { title: "状态", key: "status", width: 100, render: (row) => h(StatusPill, { status: row.status, size: "small", label: row.status }) },
  { title: "作业", key: "job_uuid", width: 110, render: (row) => (row.job_uuid ? h("span", { class: "mono" }, row.job_uuid.slice(0, 8)) : "—") },
  { title: "收到", key: "received_at_ms", width: 170, render: (row) => fmtMs(row.received_at_ms) },
  { title: "应用", key: "applied_at_ms", width: 170, render: (row) => fmtMs(row.applied_at_ms) },
  { title: "错误", key: "error_message", minWidth: 160, ellipsis: { tooltip: true }, render: (row) => row.error_message ?? "—" },
];

const adapterColumns: DataTableColumns<RuntimeAdapterCommand> = [
  { title: "#", key: "sequence", width: 60 },
  { title: "类型", key: "command_type", width: 130 },
  { title: "状态", key: "status", width: 110, render: (row) => h(StatusPill, { status: row.status, size: "small", label: row.status }) },
  { title: "执行节点", key: "endpoint_uuid", width: 190, ellipsis: { tooltip: true } },
  { title: "作业", key: "job_uuid", width: 110, render: (row) => (row.job_uuid ? h("span", { class: "mono" }, row.job_uuid.slice(0, 8)) : "—") },
  { title: "投递次数", key: "delivery_attempt_count", width: 90 },
  { title: "创建", key: "created_at_ms", width: 170, render: (row) => fmtMs(row.created_at_ms) },
  { title: "错误", key: "last_error", minWidth: 160, ellipsis: { tooltip: true }, render: (row) => row.last_error ?? "—" },
];

const eventColumns: DataTableColumns<RuntimeBackendEvent> = [
  { title: "#", key: "sequence", width: 60 },
  { title: "事件", key: "event_type", width: 190, ellipsis: { tooltip: true } },
  { title: "状态", key: "status", width: 120, render: (row) => h(StatusPill, { status: row.status, size: "small", label: row.status }) },
  { title: "聚合", key: "aggregate_type", width: 120 },
  { title: "对象", key: "aggregate_uuid", width: 120, render: (row) => h("span", { class: "mono" }, row.aggregate_uuid.slice(0, 8)) },
  { title: "版本", key: "aggregate_version", width: 70 },
  { title: "创建", key: "created_at_ms", width: 170, render: (row) => fmtMs(row.created_at_ms) },
];

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 8000);
});
onUnmounted(() => {
  if (timer !== null) clearInterval(timer);
});
</script>

<template>
  <div class="page">
    <PageHeader title="系统诊断" :subtitle="`${conn.baseUrl} · ${conn.roleLabel}`">
      <template #actions>
        <NButton size="small" :loading="loading" @click="refresh">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接微后端</span>
      {{ conn.lastError || "在右上角连接设置中填写管理端地址。" }}
    </div>

    <template v-else>
      <NAlert v-if="lastError" type="warning" closable @close="lastError = ''">{{ lastError }}</NAlert>

      <div class="page-grid page-grid-3">
        <NCard size="small" title="进程">
          <div class="kv"><span>健康</span><b>{{ conn.health?.status ?? "—" }}</b></div>
          <div class="kv"><span>调度权威</span><b>{{ conn.health?.scheduler === "local" ? "本进程（local）" : "远端 Backend（remote）" }}</b></div>
          <div class="kv"><span>执行面</span><b>{{ conn.health?.execution === "ready" ? "就绪（HostNode 在本进程）" : "无（纯调度权威）" }}</b></div>
          <div class="kv"><span>注册表域</span><b>{{ conn.registrySupport === "available" ? "已挂载" : conn.registrySupport === "unsupported" ? "未挂载（Host 进程）" : "探测中" }}</b></div>
          <div class="kv"><span>SSE</span><b>workflow {{ conn.workflowNoticeState }} · materials {{ conn.materialsNoticeState }}</b></div>
          <div class="kv"><span>实验室铭牌</span><b>{{ lab.displayName }}</b></div>
          <div class="kv"><span>最近探测</span><b>{{ fmtMs(conn.lastCheckedAt) }}</b></div>
        </NCard>

        <NCard size="small" title="HostLink 组网">
          <template v-if="devices.hostlink && devices.hostlink.role !== 'disabled'">
            <div class="kv"><span>角色</span><b>{{ devices.hostlink.role }}</b></div>
            <div class="kv"><span>Host</span><b class="mono">{{ devices.hostlink.host_node_id ?? devices.hostlink.host_id ?? "—" }}</b></div>
            <div class="kv"><span>协议</span><b>v{{ devices.hostlink.protocol_version ?? "—" }}</b></div>
            <div class="kv"><span>ROS 下发</span><b>{{ devices.hostlink.ros ? `domain ${devices.hostlink.ros.domain_id ?? "—"} · ${devices.hostlink.ros.discovery_server || "无发现服务"}` : "未配置" }}</b></div>
            <div class="peers">
              <div v-for="peer in devices.hostlink.peers" :key="peer.node_id ?? peer.addr" class="peer">
                <span class="peer-dot" :class="hostlinkPeerState(peer)" />
                <div class="peer-text">
                  <span class="mono">{{ peer.node_id ?? peer.addr }}</span>
                  <span class="dim">{{ peer.machine_name }} · {{ peer.addr }} · {{ (peer.device_ids ?? []).join(", ") || "无设备" }}</span>
                </div>
                <NTag size="tiny" :bordered="false" :type="peer.online ? 'success' : 'default'">{{ PEER_STATE_LABEL[hostlinkPeerState(peer)] }}{{ peer.online ? "" : ` · ${fmtAgo(peer.last_seen)}` }}</NTag>
              </div>
              <p v-if="!devices.hostlink.peers.length" class="dim small">没有 Slave 接入。</p>
            </div>
          </template>
          <p v-else class="dim small">该进程未启用 HostLink。</p>
        </NCard>

        <NCard size="small" title="安静点重启">
          <template v-if="restart">
            <div class="kv"><span>状态</span><b>{{ restart.restarting ? "重启中" : restart.pending ? "等待安静点" : "空闲" }}</b></div>
            <div class="kv"><span>派发</span><b>{{ restart.dispatch_paused ? "已暂停" : "正常" }}</b></div>
            <div class="kv"><span>作用域</span><b>{{ restart.effective_scope }}</b></div>
            <div class="kv"><span>活跃作业</span><b>{{ restart.active_jobs.length }}</b></div>
          </template>
          <NSpace vertical size="small" style="margin-top: 10px">
            <NSpace size="small">
              <NSelect v-model:value="restartMode" size="small" style="width: 150px" :options="[{ label: '等待安静点', value: 'quiescent' }, { label: '立即', value: 'immediate' }]" />
              <NSelect v-model:value="restartScope" size="small" style="width: 190px" :options="[{ label: '自动（默认重启 Host）', value: 'auto' }, { label: 'Host 执行进程', value: 'edge' }]" />
            </NSpace>
            <NSpace size="small">
              <NPopconfirm @positive-click="requestRestart">
                <template #trigger>
                  <NButton size="small" type="warning" secondary :loading="restarting" :disabled="restart?.pending">登记重启</NButton>
                </template>
                登记后暂停新派发，等 active job 清空后按作用域重启并自动恢复。确认？
              </NPopconfirm>
              <NButton size="small" :disabled="!restart?.pending" @click="cancelRestart">取消重启</NButton>
            </NSpace>
            <p class="dim small">调试用：设备驱动改动后无需手动重开进程；等待中的任务由调度恢复链路继续。</p>
          </NSpace>
        </NCard>
      </div>

      <NCard size="small" title="执行节点（HostNode）">
        <NEmpty v-if="!endpoints.length" size="small" description="没有执行节点（纯调度权威进程，或 Host 尚未上报能力快照）" />
        <div v-else class="endpoints">
          <div v-for="endpoint in endpoints" :key="endpoint.endpoint_uuid" class="endpoint">
            <StatusPill :status="endpoint.state" size="small" :label="endpoint.state" />
            <span class="mono">{{ endpoint.endpoint_uuid }}</span>
            <span class="dim">{{ endpoint.transport }} · {{ endpoint.instance_name }} · {{ endpoint.device_routes.length }} 路由 · {{ endpoint.action_capabilities.length }} 动作 · 最近 {{ fmtMs(endpoint.last_seen_at_ms) }}</span>
          </div>
        </div>
      </NCard>

      <NCard size="small" title="调度资源">
        <div v-if="resourcesRemote" class="degraded inline">
          <span class="degraded-title">调度权威在远端</span>
          <code>/api/v1/scheduler/resources</code> 返回 503：该 Host 已接入云端 Backend，资源申请与占有由远端调度器维护，这不是故障。
        </div>
        <template v-else-if="resources">
          <div class="kv"><span>序列</span><b>{{ resources.sequence }}</b></div>
          <div class="res-grid">
            <div class="res-block">
              <div class="res-title">资源申请（{{ resources.requests.length }}）</div>
              <pre v-if="resources.requests.length" class="code">{{ JSON.stringify(resources.requests, null, 1) }}</pre>
              <p v-else class="dim small">无待处理申请。</p>
            </div>
            <div class="res-block">
              <div class="res-title">占有（{{ resources.ownerships.length }}）</div>
              <pre v-if="resources.ownerships.length" class="code">{{ JSON.stringify(resources.ownerships, null, 1) }}</pre>
              <p v-else class="dim small">没有设备/物料被锁定。</p>
            </div>
            <div class="res-block">
              <div class="res-title">交接（{{ resources.handoffs.length }}）</div>
              <pre v-if="resources.handoffs.length" class="code">{{ JSON.stringify(resources.handoffs, null, 1) }}</pre>
              <p v-else class="dim small">无进行中的交接。</p>
            </div>
          </div>
        </template>
        <p v-else class="dim small">尚未读取。</p>
      </NCard>

      <NCard size="small" title="runtime.v1 控制面队列">
        <div class="queue-summary">
          <span>命令 inbox 待处理 <b>{{ queueSummary.commandsPending }}</b> · 拒绝 <b class="err">{{ queueSummary.commandsRejected }}</b></span>
          <span>adapter outbox 待投递 <b>{{ queueSummary.adapterPending }}</b> · 失败 <b class="err">{{ queueSummary.adapterFailed }}</b></span>
          <span>事件 outbox 待确认 <b>{{ queueSummary.eventsPending }}</b> · 死信 <b class="err">{{ queueSummary.eventsDead }}</b></span>
        </div>
        <div class="queue-section">
          <div class="res-title">Backend 会话（{{ sessions.length }}）</div>
          <NEmpty v-if="!sessions.length" size="small" description="本机调度模式没有 Backend 会话" />
          <NDataTable v-else :columns="sessionColumns" :data="sessions" size="small" :scroll-x="1000" :row-key="(row: RuntimeBackendSession) => row.session_uuid" />
        </div>
        <div class="queue-section">
          <div class="res-title">命令 inbox（最近 {{ commands.length }}）</div>
          <NEmpty v-if="!commands.length" size="small" description="暂无命令" />
          <NDataTable v-else :columns="commandColumns" :data="commands" size="small" :scroll-x="1000" :max-height="300" :row-key="(row: RuntimeCommand) => row.command_uuid" />
        </div>
        <div class="queue-section">
          <div class="res-title">adapter outbox（最近 {{ adapterCommands.length }}）</div>
          <NEmpty v-if="!adapterCommands.length" size="small" description="暂无 adapter 命令" />
          <NDataTable v-else :columns="adapterColumns" :data="adapterCommands" size="small" :scroll-x="1000" :max-height="300" :row-key="(row: RuntimeAdapterCommand) => row.adapter_command_uuid" />
        </div>
        <div class="queue-section">
          <div class="res-title">Backend 事件 outbox（最近 {{ backendEvents.length }}）</div>
          <NEmpty v-if="!backendEvents.length" size="small" description="暂无事件" />
          <NDataTable v-else :columns="eventColumns" :data="backendEvents" size="small" :scroll-x="1000" :max-height="300" :row-key="(row: RuntimeBackendEvent) => row.event_uuid" />
        </div>
      </NCard>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.kv {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 5px 0;
  font-size: 12.5px;
  border-bottom: 1px dashed var(--hairline);
}

.kv:last-of-type {
  border-bottom: 0;
}

.kv span {
  color: #8b929c;
  flex-shrink: 0;
}

.kv b {
  font-weight: 600;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.peers {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 10px;
}

.peer {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
}

.peer-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b8bec6;
  flex-shrink: 0;
}

.peer-dot.online {
  background: #04aa65;
}

.peer-dot.stale {
  background: #d97706;
}

.peer-text {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.endpoints {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.endpoint {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 12.5px;
}

.degraded.inline {
  text-align: left;
  padding: 16px 18px;
}

.res-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
  margin-top: 8px;
}

@media (max-width: 1000px) {
  .res-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.res-title {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
  margin-bottom: 6px;
}

.code {
  margin: 0;
  padding: 10px;
  background: #f7f8f9;
  border-radius: 8px;
  font-family: var(--font-mono);
  font-size: 11px;
  max-height: 240px;
  overflow: auto;
}

.queue-summary {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  font-size: 12.5px;
  color: #3d4650;
  margin-bottom: 12px;
}

.queue-summary b {
  color: #101418;
}

.queue-summary .err {
  color: #b91c1c;
}

.queue-section {
  margin-top: 14px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dim {
  color: #8b929c;
}

.small {
  font-size: 12px;
  margin: 4px 0 0;
}
</style>
