<script setup lang="ts">
/**
 * 运行总览（首页）：一屏看清「连接到什么、设备怎么样、谁在跑、谁在等人」。
 *
 * - 顶部遥测带：时钟、进程角色、子系统状态灯、关键计数；
 * - 左主区：进行中的运行（进度 + 当前节点）、设备实时状态；
 * - 右侧栏：待处理事项、HostLink 组网、收藏指标、实时动态。
 * 所有数据来自 store 的 HTTP 投影；轮询由外壳与各 store 持有。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { NButton, NEmpty, NIcon, NProgress, NTag } from "naive-ui";
import {
  AlertCircleOutline,
  ArrowForwardOutline,
  ColorWandOutline,
  HardwareChipOutline,
  PauseCircleOutline,
  ScanOutline,
  SparklesOutline,
  TerminalOutline,
} from "@vicons/ionicons5";
import { hostlinkPeerState, type BackendWorkflowTask } from "@openlab/protocol";
import StatusPill from "../components/StatusPill.vue";
import { ACTIVE_JOB_STATUSES, describeNodeJob, describeTask } from "../features/task-jobs";
import { useActivityStore } from "../stores/activity";
import { useConnectionStore } from "../stores/connection";
import { useDecisionsStore } from "../stores/decisions";
import { useDevicesStore } from "../stores/devices";
import { useDomainThemeStore } from "../stores/domain-theme";
import { useLabStore } from "../stores/lab";
import { usePinnedMetricsStore } from "../stores/pinned-metrics";
import { useSchedulerStore } from "../stores/scheduler";

const router = useRouter();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const lab = useLabStore();
const sched = useSchedulerStore();
const activity = useActivityStore();
const decisions = useDecisionsStore();
const devices = useDevicesStore();
const pinned = usePinnedMetricsStore();

// ── 时钟 ──
const now = ref(new Date());
let clockTimer: ReturnType<typeof setInterval> | null = null;
const pad = (n: number) => String(n).padStart(2, "0");
const clockText = computed(
  () => `${pad(now.value.getHours())}:${pad(now.value.getMinutes())}:${pad(now.value.getSeconds())}`,
);
const dateText = computed(
  () => `${now.value.getFullYear()}-${pad(now.value.getMonth() + 1)}-${pad(now.value.getDate())}`,
);

// ── 子系统状态灯 ──
type Light = { key: string; label: string; state: "on" | "off" | "na"; hint: string };
const lights = computed<Light[]>(() => {
  const online = conn.online;
  const hostlink = devices.hostlink;
  return [
    { key: "api", label: "微后端", state: online ? "on" : "off", hint: conn.baseUrl },
    {
      key: "scheduler",
      label: "调度权威",
      state: !online ? "off" : conn.schedulerLocal ? "on" : "na",
      hint: conn.schedulerLocal ? "本进程持有 Workflow Authority" : "调度权威在远端 Backend",
    },
    {
      key: "execution",
      label: "执行面",
      state: !online ? "off" : conn.executionReady ? "on" : "na",
      hint: conn.executionReady ? "HostNode 与设备执行就绪" : "纯调度权威进程，无设备",
    },
    {
      key: "hostlink",
      label: "HostLink",
      state: !online || !hostlink ? "off" : hostlink.role === "disabled" ? "na" : "on",
      hint: hostlink ? `角色 ${hostlink.role} · ${hostlink.peers.filter((p) => p.online).length} 个在线 peer` : "未读取",
    },
    {
      key: "registry",
      label: "注册表",
      state: !online ? "off" : conn.registrySupport === "available" ? "on" : "na",
      hint: conn.registrySupport === "available" ? "Registry Authority 已挂载" : "仅 --role backend 进程提供",
    },
  ];
});

// ── 运行态 ──
const activeRuns = computed(() => sched.activeTasks);
const recentFinished = computed(() =>
  sched.tasks
    .filter((task) => !["pending", "running", "canceling"].includes(task.status))
    .sort((a, b) => (b.finished_at ?? b.update_time).localeCompare(a.finished_at ?? a.update_time))
    .slice(0, 6),
);

function progressOf(taskUuid: string): number {
  const jobs = sched.jobsByTask[taskUuid] ?? [];
  if (!jobs.length) return 0;
  return Math.round(
    (jobs.filter((job) => ["succeeded", "skipped"].includes(job.status)).length / jobs.length) * 100,
  );
}

function jobSummary(taskUuid: string): string {
  const jobs = sched.jobsByTask[taskUuid] ?? [];
  const done = jobs.filter((job) => ["succeeded", "skipped"].includes(job.status)).length;
  return jobs.length ? `${done}/${jobs.length} 节点完成` : "等待展开节点";
}

function currentNodeOf(taskUuid: string): string {
  const job = (sched.jobsByTask[taskUuid] ?? []).find((item) => ACTIVE_JOB_STATUSES.has(item.status));
  if (!job) return "等待调度…";
  const task = sched.tasks.find((item) => item.uuid === taskUuid) ?? null;
  const info = describeNodeJob(task, job);
  const where = info.deviceId && info.deviceId !== info.nodeName ? ` @ ${info.deviceId}` : "";
  return `${info.nodeName}${where} · attempt ${job.attempt_no}${job.status === "intervention_required" ? " · 等待干预" : ""}`;
}

function taskName(task: BackendWorkflowTask): string {
  return describeTask(task);
}

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id;
}

function fmtTime(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function fmtIso(value?: string): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmtAgo(unixS: number): string {
  const delta = Math.max(0, Math.round(Date.now() / 1000 - unixS));
  if (delta < 60) return `${delta}s 前`;
  if (delta < 3600) return `${Math.floor(delta / 60)}m 前`;
  return `${Math.floor(delta / 3600)}h 前`;
}

// ── 设备实时状态 ──
const PROP_PRIORITY = ["status", "phase", "state", "operation_mode", "current_temperature", "temperature", "progress"];

function headlineProp(deviceId: string): { name: string; value: string } | null {
  const snapshot = devices.byId(deviceId)?.telemetry;
  if (!snapshot) return null;
  const merged: Record<string, unknown> = { ...snapshot.state, ...snapshot.properties };
  const keys = Object.keys(merged).sort((a, b) => {
    const ia = PROP_PRIORITY.indexOf(a);
    const ib = PROP_PRIORITY.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
  const name = keys[0];
  if (!name) return null;
  return { name, value: fmtValue(merged[name]) };
}

function fmtValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(2);
  if (typeof value === "boolean") return value ? "ON" : "OFF";
  if (typeof value === "object") {
    const wrapped = value as Record<string, unknown>;
    if ("value" in wrapped) return fmtValue(wrapped.value);
    return JSON.stringify(value).slice(0, 14);
  }
  const text = String(value);
  return text.length > 14 ? `${text.slice(0, 14)}…` : text;
}

// ── 收藏指标 ──
interface PinnedReading {
  deviceId: string;
  deviceName: string;
  prop: string;
  value: string;
  updatedAt: number;
  /** 设备离线或该属性没有任何读数。 */
  stale: boolean;
}

const pinnedReadings = computed<PinnedReading[]>(() =>
  pinned.pins.map(({ deviceId, prop }) => {
    const device = devices.byId(deviceId);
    const snapshot = device?.telemetry;
    const merged: Record<string, unknown> = snapshot ? { ...snapshot.state, ...snapshot.properties } : {};
    const raw = merged[prop];
    const wrapped = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
    const hasValue = raw !== undefined && raw !== null;
    return {
      deviceId,
      deviceName: device?.displayName ?? deviceId,
      prop,
      value: hasValue ? fmtValue(wrapped && "value" in wrapped ? wrapped.value : raw) : "—",
      updatedAt: Number(wrapped?.updated_at_ms ?? snapshot?.observed_at_ms ?? 0),
      stale: !device?.online || !hasValue,
    };
  }),
);

// ── HostLink ──
const PEER_STATE_LABEL: Record<ReturnType<typeof hostlinkPeerState>, string> = {
  online: "在线",
  stale: "心跳超时",
  disconnected: "已断连",
};

const hostSelfName = computed(
  () => devices.hostlink?.host_node_id || devices.hostlink?.host_id || "本机 Host",
);

// ── 待处理 ──
const attention = computed(() => [
  {
    key: "errors",
    label: "动作异常",
    count: decisions.pendingErrorCount,
    to: "/error-decisions",
    icon: AlertCircleOutline,
    tone: "danger",
  },
  {
    key: "interventions",
    label: "工作流干预",
    count: decisions.openInterventionCount,
    to: "/error-decisions",
    icon: SparklesOutline,
    tone: "warn",
  },
  {
    key: "incidents",
    label: "状态告警",
    count: decisions.activeIncidentCount,
    to: "/status-incidents",
    icon: PauseCircleOutline,
    tone: "warn",
  },
]);

onMounted(() => {
  devices.startPolling(6000);
  clockTimer = setInterval(() => (now.value = new Date()), 1000);
});
onUnmounted(() => {
  devices.stopPolling();
  if (clockTimer !== null) clearInterval(clockTimer);
});

watch(
  () => conn.online,
  (online) => {
    if (online) void devices.refresh();
  },
);

function openPalette() {
  window.dispatchEvent(new CustomEvent("unilab:open-palette"));
}

function openScan() {
  window.dispatchEvent(new CustomEvent("unilab:open-scan"));
}
</script>

<template>
  <div class="console">
    <!-- ── 遥测带 ── -->
    <header class="band">
      <div class="band-clock">
        <span class="clock display-num">{{ clockText }}</span>
        <span class="date mono">{{ dateText }}</span>
      </div>
      <div class="band-lab">
        <span class="lab-name">{{ lab.displayName }}</span>
        <span class="lab-sub">{{ conn.roleLabel }} · {{ domain.config.name }}模式</span>
      </div>
      <div class="lights">
        <div v-for="light in lights" :key="light.key" class="light" :title="light.hint">
          <span class="light-dot" :class="light.state" />
          <span class="light-label">{{ light.label }}</span>
        </div>
      </div>
      <div class="band-kpis">
        <button class="kpi" @click="router.push('/devices')">
          <span class="kpi-num display-num">{{ devices.onlineCount }}<small>/{{ devices.instruments.length }}</small></span>
          <span class="kpi-label">设备在线</span>
        </button>
        <button class="kpi" @click="router.push('/workflows')">
          <span class="kpi-num display-num">{{ activeRuns.length }}</span>
          <span class="kpi-label">运行中</span>
        </button>
        <button class="kpi" :class="{ alert: decisions.attentionCount }" @click="router.push('/error-decisions')">
          <span class="kpi-num display-num">{{ decisions.attentionCount }}</span>
          <span class="kpi-label">待处理</span>
        </button>
      </div>
    </header>

    <div v-if="!conn.online" class="offline-note">
      <NIcon size="18"><TerminalOutline /></NIcon>
      <div>
        <strong>尚未连接微后端。</strong>
        在右上角连接设置中填写 Uni-Lab-OS 管理端地址（默认 <code>http://127.0.0.1:8002</code>），
        连接后总览会自动刷新。
        <span v-if="conn.lastError" class="mono err">{{ conn.lastError }}</span>
      </div>
    </div>

    <div class="grid">
      <!-- ── 左主区 ── -->
      <main class="main">
        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">进行中的运行</span>
            <NButton size="tiny" quaternary @click="router.push('/workflows')">
              全部运行 <NIcon size="12"><ArrowForwardOutline /></NIcon>
            </NButton>
          </div>
          <div v-if="!activeRuns.length" class="runs-empty">
            <p class="runs-empty-title">当前没有正在执行的任务</p>
            <p class="runs-empty-sub">
              从编排画布提交工作流，或在设备页直接运行单点动作；也可以按 <kbd>Ctrl</kbd><kbd>K</kbd> 打开命令面板。
            </p>
            <div class="runs-empty-actions">
              <NButton size="small" type="primary" @click="router.push('/editor')">
                <template #icon><NIcon><ColorWandOutline /></NIcon></template>
                打开编排画布
              </NButton>
              <NButton size="small" @click="router.push('/devices')">
                <template #icon><NIcon><HardwareChipOutline /></NIcon></template>
                设备动作
              </NButton>
              <NButton size="small" quaternary @click="openPalette">命令面板</NButton>
              <NButton size="small" quaternary @click="openScan">
                <template #icon><NIcon><ScanOutline /></NIcon></template>
                扫码
              </NButton>
            </div>
          </div>
          <div v-else class="runs">
            <button
              v-for="task in activeRuns"
              :key="task.uuid"
              class="run"
              @click="router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`)"
            >
              <div class="run-head">
                <span class="run-name">{{ taskName(task) }}</span>
                <StatusPill :status="task.status" size="small" />
                <NTag v-if="task.control_status !== 'active'" size="tiny" type="warning" :bordered="false">
                  {{ task.control_status }}
                </NTag>
                <span class="run-id mono">{{ shortId(task.uuid) }}</span>
              </div>
              <NProgress
                type="line"
                :percentage="progressOf(task.uuid)"
                :show-indicator="false"
                :height="6"
                :border-radius="3"
                :processing="task.status === 'running'"
              />
              <div class="run-foot">
                <span>{{ currentNodeOf(task.uuid) }}</span>
                <span class="dim">{{ jobSummary(task.uuid) }} · 提交于 {{ fmtIso(task.create_time) }}</span>
              </div>
            </button>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">设备实时状态</span>
            <NButton size="tiny" quaternary @click="router.push('/devices')">
              设备目录 <NIcon size="12"><ArrowForwardOutline /></NIcon>
            </NButton>
          </div>
          <div v-if="!devices.instruments.length" class="devices-empty">
            <NEmpty
              size="small"
              :description="conn.online && !conn.executionReady ? '当前是调度权威进程，设备在 Host 进程上' : '尚未发现设备'"
            />
          </div>
          <div v-else class="device-grid">
            <button
              v-for="device in devices.instruments"
              :key="device.id"
              class="device"
              :class="{ off: !device.online, busy: device.busyActions > 0 }"
              @click="router.push('/devices')"
            >
              <span class="device-dot" />
              <div class="device-text">
                <span class="device-name">{{ device.displayName }}</span>
                <span class="device-sub mono">{{ device.className || device.id }}</span>
              </div>
              <div v-if="headlineProp(device.id)" class="device-prop">
                <span class="device-prop-name">{{ headlineProp(device.id)!.name }}</span>
                <span class="device-prop-value mono">{{ headlineProp(device.id)!.value }}</span>
              </div>
              <span v-else class="device-prop dim">{{ device.online ? (device.busyActions ? `${device.busyActions} 个动作执行中` : "空闲") : "离线" }}</span>
            </button>
          </div>
        </section>

        <section v-if="recentFinished.length" class="panel">
          <div class="panel-head">
            <span class="panel-title">最近完成</span>
          </div>
          <table class="table">
            <tbody>
              <tr v-for="task in recentFinished" :key="task.uuid" @click="router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`)">
                <td class="name">{{ taskName(task) }}</td>
                <td><StatusPill :status="task.status" size="small" /></td>
                <td class="mono dim">{{ task.execution_kind === "ad_hoc_device_action" ? "单点动作" : "工作流" }}</td>
                <td class="dim right">{{ fmtIso(task.finished_at ?? task.update_time) }}</td>
              </tr>
            </tbody>
          </table>
        </section>
      </main>

      <!-- ── 右侧栏 ── -->
      <aside class="side">
        <section class="panel">
          <div class="panel-head"><span class="panel-title">需要处理</span></div>
          <div class="attention">
            <button v-for="item in attention" :key="item.key" class="attention-row" :class="[item.tone, { zero: !item.count }]" @click="router.push(item.to)">
              <NIcon size="16"><component :is="item.icon" /></NIcon>
              <span class="attention-label">{{ item.label }}</span>
              <span class="attention-count display-num">{{ item.count }}</span>
            </button>
          </div>
          <p v-if="!conn.executionReady && conn.online" class="dim tiny">
            当前进程没有执行面，动作异常与状态告警在 Host 进程上。
          </p>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">HostLink 组网</span>
            <NButton size="tiny" quaternary @click="router.push('/system')">诊断</NButton>
          </div>
          <div v-if="!devices.hostlink" class="dim tiny">未读取到组网状态。</div>
          <div v-else-if="devices.hostlink.role === 'disabled'" class="dim tiny">该进程未启用 HostLink。</div>
          <div v-else class="peers">
            <div class="peer host">
              <span class="peer-dot online" />
              <span class="peer-name">{{ hostSelfName }}</span>
              <span class="peer-meta">{{ devices.hostlink.role }} · 本机</span>
            </div>
            <div v-for="peer in devices.hostlink.peers" :key="peer.node_id ?? peer.addr" class="peer">
              <span class="peer-dot" :class="hostlinkPeerState(peer)" />
              <span class="peer-name">{{ peer.node_id ?? peer.addr }}</span>
              <span class="peer-meta">
                {{ peer.machine_name }} · {{ (peer.device_ids ?? []).length }} 设备 · {{ PEER_STATE_LABEL[hostlinkPeerState(peer)] }}
                <template v-if="!peer.online"> · {{ fmtAgo(peer.last_seen) }}</template>
              </span>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head">
            <span class="panel-title">收藏指标</span>
            <RouterLink v-if="pinnedReadings.length" to="/devices" class="panel-link">设备页管理 →</RouterLink>
          </div>
          <div v-if="!pinnedReadings.length" class="dim tiny">
            在「设备」页打开某台设备的详情，属性行右侧点 ★ 收藏，实时值会汇总到这里。
          </div>
          <div v-else class="pins">
            <div
              v-for="reading in pinnedReadings"
              :key="`${reading.deviceId}::${reading.prop}`"
              class="pin"
              :class="{ stale: reading.stale }"
              :title="`${reading.deviceId} · ${reading.prop}${reading.updatedAt ? ` · 更新于 ${fmtTime(reading.updatedAt)}` : ''}${reading.stale ? ' · 设备离线或暂无读数' : ''}`"
            >
              <span class="pin-value display-num">{{ reading.value }}</span>
              <span class="pin-label">
                <b>{{ reading.deviceName }}</b> · {{ reading.prop }}
              </span>
              <button type="button" class="pin-remove" title="取消收藏" @click="pinned.remove(reading.deviceId, reading.prop)">×</button>
            </div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><span class="panel-title">实时动态</span></div>
          <div v-if="!activity.events.length" class="dim tiny">任务与节点状态变化会在这里滚动。</div>
          <ul v-else class="feed">
            <li v-for="event in activity.events.slice(0, 14)" :key="event.id" class="feed-item" :class="event.kind">
              <span class="feed-time mono">{{ fmtTime(event.ts) }}</span>
              <span class="feed-text">{{ event.text }}</span>
            </li>
          </ul>
        </section>
      </aside>
    </div>
  </div>
</template>

<style scoped>
.console {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ── 遥测带 ── */
.band {
  display: flex;
  align-items: center;
  gap: 24px;
  padding: 14px 20px;
  background: #0c1014;
  color: #e6ebf0;
  border-radius: 16px;
}

.band-clock {
  display: flex;
  flex-direction: column;
  line-height: 1;
}

.clock {
  font-size: 30px;
  font-weight: 700;
  letter-spacing: 0.02em;
}

.date {
  margin-top: 6px;
  font-size: 11px;
  color: #7d8b99;
}

.band-lab {
  display: flex;
  flex-direction: column;
  padding-left: 20px;
  border-left: 1px solid rgba(255, 255, 255, 0.1);
}

.lab-name {
  font-weight: 700;
  font-size: 14px;
}

.lab-sub {
  font-size: 11.5px;
  color: #7d8b99;
}

.lights {
  display: flex;
  gap: 16px;
  margin-left: auto;
}

.light {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #a7b3bf;
}

.light-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #3a4552;
}

.light-dot.on {
  background: #04aa65;
  box-shadow: 0 0 8px rgba(4, 170, 101, 0.8);
}

.light-dot.off {
  background: #de3b3b;
}

.light-dot.na {
  background: #6b7684;
}

.band-kpis {
  display: flex;
  gap: 8px;
}

.kpi {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  padding: 6px 14px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.04);
  color: inherit;
  cursor: pointer;
  line-height: 1.1;
}

.kpi:hover {
  border-color: rgba(255, 255, 255, 0.25);
}

.kpi.alert {
  border-color: rgba(220, 38, 38, 0.6);
}

.kpi-num {
  font-size: 22px;
  font-weight: 700;
}

.kpi-num small {
  font-size: 12px;
  color: #7d8b99;
  font-weight: 600;
}

.kpi-label {
  font-size: 10.5px;
  color: #7d8b99;
  letter-spacing: 0.06em;
}

.offline-note {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 14px 18px;
  border: 1px solid #f3d9a4;
  background: #fff8e8;
  border-radius: 12px;
  font-size: 13px;
  color: #6b4a00;
}

.offline-note .err {
  display: block;
  margin-top: 4px;
  font-size: 11px;
  color: #b91c1c;
}

/* ── 布局 ── */
.grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(300px, 1fr);
  gap: 14px;
  align-items: start;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .lights {
    display: none;
  }
}

.main,
.side {
  display: flex;
  flex-direction: column;
  gap: 14px;
  min-width: 0;
}

.panel {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 14px 16px;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-title {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6e7580;
}

/* ── 运行 ── */
.runs-empty {
  padding: 22px 6px 8px;
}

.runs-empty-title {
  margin: 0;
  font-weight: 700;
  color: #101418;
}

.runs-empty-sub {
  margin: 6px 0 14px;
  font-size: 12.5px;
  color: #6e7580;
}

.runs-empty-sub kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  border: 1px solid #dedbd4;
  border-radius: 4px;
  padding: 0 4px;
  background: #fff;
}

.runs-empty-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.runs {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.run {
  text-align: left;
  border: 1px solid var(--hairline);
  background: #fff;
  border-radius: 12px;
  padding: 12px 14px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: inherit;
}

.run:hover {
  border-color: var(--domain-accent);
}

.run-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.run-name {
  flex: 1;
  font-weight: 700;
  color: #101418;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-id {
  font-size: 11px;
  color: #8b929c;
}

.run-foot {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  font-size: 12px;
  color: #3d4650;
}

/* ── 设备 ── */
.device-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 8px;
}

.device {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background: #fff;
  cursor: pointer;
  text-align: left;
  color: inherit;
  min-width: 0;
}

.device:hover {
  border-color: var(--domain-accent);
}

.device.off {
  background: #fbfbf9;
  color: #8b929c;
}

.device-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #04aa65;
  flex-shrink: 0;
}

.device.busy .device-dot {
  background: #d97706;
  box-shadow: 0 0 0 4px rgba(217, 119, 6, 0.15);
}

.device.off .device-dot {
  background: #b8bec6;
}

.device-text {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  line-height: 1.25;
}

.device-name {
  font-weight: 700;
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-sub {
  font-size: 10.5px;
  color: #8b929c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.device-prop {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  font-size: 11px;
  flex-shrink: 0;
}

.device-prop-name {
  color: #8b929c;
}

.device-prop-value {
  font-weight: 700;
  color: #101418;
}

/* ── 表格 ── */
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.table tr {
  cursor: pointer;
}

.table tr:hover td {
  background: var(--panel-soft);
}

.table td {
  padding: 7px 8px;
  border-top: 1px solid var(--hairline);
}

.table td.name {
  font-weight: 600;
}

.table td.right {
  text-align: right;
}

/* ── 右栏 ── */
.attention {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.attention-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 10px;
  border: 1px solid var(--hairline);
  background: #fff;
  cursor: pointer;
  color: #101418;
  text-align: left;
}

.attention-row.danger:not(.zero) {
  border-color: #f2b8b5;
  background: #fef2f2;
  color: #991b1b;
}

.attention-row.warn:not(.zero) {
  border-color: #f3d9a4;
  background: #fff8e8;
  color: #92400e;
}

.attention-row.zero {
  color: #8b929c;
}

.attention-label {
  flex: 1;
  font-size: 13px;
  font-weight: 600;
}

.attention-count {
  font-size: 18px;
  font-weight: 700;
}

.peers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.peer {
  display: grid;
  grid-template-columns: 8px 1fr;
  gap: 4px 10px;
  align-items: center;
  font-size: 12.5px;
}

.peer-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #b8bec6;
  grid-row: span 2;
}

.peer-dot.online {
  background: #04aa65;
}

.peer-dot.stale {
  background: #d97706;
}

.peer-name {
  font-weight: 700;
  font-family: var(--font-mono);
  font-size: 12px;
}

.peer-meta {
  font-size: 11px;
  color: #6e7580;
}

.pins {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.pin {
  position: relative;
  display: flex;
  flex-direction: column;
  padding: 8px 26px 8px 10px;
  border-radius: 10px;
  background: #fffbea;
  border: 1px solid #f2d27a;
}

.pin.stale {
  background: var(--panel-soft);
  border-color: var(--hairline);
}

.pin.stale .pin-value {
  color: #9aa1aa;
}

.pin-value {
  font-size: 20px;
  font-weight: 700;
  color: #101418;
}

.pin-label {
  font-size: 10.5px;
  color: #6e7580;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pin-label b {
  color: #3d4650;
  font-weight: 600;
}

.pin-remove {
  position: absolute;
  top: 4px;
  right: 6px;
  border: 0;
  background: none;
  color: #b8bec6;
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.12s ease;
}

.pin:hover .pin-remove {
  opacity: 1;
}

.pin-remove:hover {
  color: #b91c1c;
}

.panel-link {
  font-size: 11px;
  color: var(--domain-accent);
  text-decoration: none;
  font-weight: 600;
}

.feed {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.feed-item {
  display: flex;
  gap: 10px;
  font-size: 12px;
  color: #3d4650;
  padding-left: 8px;
  border-left: 2px solid #d9dde3;
}

.feed-item.run {
  border-left-color: #2e5bff;
}

.feed-item.ok {
  border-left-color: #0e9f6e;
}

.feed-item.err {
  border-left-color: #dc2626;
}

.feed-time {
  color: #8b929c;
  font-size: 11px;
  flex-shrink: 0;
}

.dim {
  color: #8b929c;
}

.tiny {
  font-size: 12px;
  margin: 0;
}

.mono {
  font-family: var(--font-mono);
}
</style>
