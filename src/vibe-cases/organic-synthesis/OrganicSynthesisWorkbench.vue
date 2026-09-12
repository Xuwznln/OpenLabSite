<script setup lang="ts">
/**
 * 参考案例：有机合成一体化操作台。
 *
 * 这是可复制的 Vue 页面，不是插件。领域交互（摩尔量换算、反应条件）留在
 * 前端；设备、动作、工作流、遥测与历史全部使用 `@openlab/protocol` 的标准域：
 *
 * - 设备与动作：stores/devices（runtime.v1 endpoints + materials 根物料 + telemetry）
 * - 运行一个动作：workflowBackend.createTask({execution_kind: "ad_hoc_device_action"})
 * - 运行一条流程：workflowBackend.createTask({workflow_uuid})
 * - 进度与历史：stores/scheduler（Task / Node Job）+ historyV1.events
 *
 * 复制到自己的领域时只改本文件的布局、文案与领域算法，不要改协议。
 */
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { NButton, NInput, NInputNumber, NProgress, NSelect, NTag, useMessage } from "naive-ui";
import {
  actionDisplayName,
  actionSchemaDetailFromCapability,
  actionParameterTemplate,
  type HistoryV1Event,
  type JsonObject,
  type RuntimeActionCapability,
} from "@openlab/protocol";
import StatusPill from "../../components/StatusPill.vue";
import { useConnectionStore } from "../../stores/connection";
import { useDevicesStore } from "../../stores/devices";
import { useSchedulerStore } from "../../stores/scheduler";
import { describeError } from "../../features/errors";

const router = useRouter();
const conn = useConnectionStore();
const devices = useDevicesStore();
const sched = useSchedulerStore();
const message = useMessage();

// ── 领域计算：摩尔量与浓度（纯前端逻辑，可自由替换） ──
const experimentName = ref("Suzuki 偶联 · 条件筛选");
const molecularWeight = ref(180.16);
const massG = ref(2.5);
const solventMl = ref(40);
const temperatureC = ref(80);
const reactionMinutes = ref(90);

const amountMmol = computed(() => (molecularWeight.value > 0 ? (massG.value / molecularWeight.value) * 1000 : 0));
const concentrationM = computed(() => (solventMl.value > 0 ? amountMmol.value / solventMl.value : 0));

// ── 设备与动作（标准域） ──
const deviceId = ref("");
const actionName = ref("");
const paramJson = ref("{}");
const submitting = ref(false);

const deviceOptions = computed(() =>
  devices.instruments.map((device) => ({
    label: `${device.displayName}${device.online ? "" : "（离线）"}`,
    value: device.id,
    disabled: !device.online,
  })),
);
const selectedDevice = computed(() => devices.byId(deviceId.value) ?? null);
const actionOptions = computed(() =>
  (selectedDevice.value?.actions ?? []).map((action) => ({
    label: actionDisplayName(action.action_name, action.descriptor),
    value: action.action_name,
    disabled: action.availability === "busy",
  })),
);
const selectedAction = computed<RuntimeActionCapability | null>(
  () => selectedDevice.value?.actions.find((action) => action.action_name === actionName.value) ?? null,
);

watch(deviceId, () => {
  actionName.value = selectedDevice.value?.actions[0]?.action_name ?? "";
});

/** 把领域参数映射进动作模板：同名字段（temperature / minutes / rpm 等）自动填入。 */
watch(selectedAction, (action) => {
  if (!action) {
    paramJson.value = "{}";
    return;
  }
  const template = actionParameterTemplate(actionSchemaDetailFromCapability(action));
  const mapping: Record<string, unknown> = {
    temperature: temperatureC.value,
    target_temperature: temperatureC.value,
    duration: reactionMinutes.value * 60,
    minutes: reactionMinutes.value,
    volume: solventMl.value,
  };
  for (const key of Object.keys(template)) {
    if (key in mapping) template[key] = mapping[key];
  }
  paramJson.value = JSON.stringify(template, null, 2);
});

async function runAction() {
  if (!selectedAction.value) return;
  let param: JsonObject;
  try {
    param = JSON.parse(paramJson.value) as JsonObject;
  } catch {
    message.error("参数不是合法 JSON");
    return;
  }
  submitting.value = true;
  try {
    const task = await conn.api.domains.workflowBackend.createTask({
      execution_kind: "ad_hoc_device_action",
      device_id: deviceId.value,
      action_name: actionName.value,
      action_type: selectedAction.value.action_type ?? "",
      param,
      execution_policy: selectedAction.value.descriptor.always_free ? { always_free: true } : {},
      description: `${experimentName.value} · ${deviceId.value}/${actionName.value}`,
    });
    message.success(`已提交 ${task.uuid.slice(0, 8)}…`);
    void sched.refresh();
  } catch (error) {
    message.error(describeError(error));
  } finally {
    submitting.value = false;
  }
}

// ── 工作流（标准域） ──
const workflowUuid = ref<string | null>(null);
const workflowOptions = computed(() => sched.workflows.map((item) => ({ label: item.name, value: item.uuid })));

async function runWorkflow() {
  if (!workflowUuid.value) return;
  submitting.value = true;
  try {
    const task = await sched.createTask(workflowUuid.value, "normal");
    message.success(`已提交流程运行 ${task.uuid.slice(0, 8)}…`);
  } catch (error) {
    message.error(describeError(error));
  } finally {
    submitting.value = false;
  }
}

// ── 进度与历史 ──
const activeRuns = computed(() => sched.activeTasks.slice(0, 4));

function progressOf(taskUuid: string): number {
  const jobs = sched.jobsByTask[taskUuid] ?? [];
  if (!jobs.length) return 0;
  return Math.round((jobs.filter((job) => ["succeeded", "skipped"].includes(job.status)).length / jobs.length) * 100);
}

const history = ref<HistoryV1Event[]>([]);

async function loadHistory() {
  if (!conn.online) return;
  try {
    const rows = await conn.api.domains.historyV1.events({ limit: 200, event_types: ["job_transition", "job_result"] });
    history.value = rows.sort((a, b) => (b.sequence ?? 0) - (a.sequence ?? 0)).slice(0, 8);
  } catch {
    history.value = [];
  }
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("zh-CN", { hour12: false });
}

const telemetryRows = computed(() => {
  const snapshot = selectedDevice.value?.telemetry;
  if (!snapshot) return [];
  return Object.entries({ ...snapshot.state, ...snapshot.properties }).slice(0, 8);
});

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  devices.startPolling(5000);
  void loadHistory();
  timer = setInterval(() => void loadHistory(), 5000);
});
onUnmounted(() => {
  devices.stopPolling();
  if (timer !== null) clearInterval(timer);
});
watch(
  () => devices.instruments.length,
  () => {
    if (!deviceId.value) deviceId.value = devices.instruments.find((device) => device.online)?.id ?? "";
  },
  { immediate: true },
);
</script>

<template>
  <div class="workbench">
    <header class="hero">
      <div>
        <span class="overline">Reference Case · 有机合成</span>
        <NInput v-model:value="experimentName" size="large" class="title-input" placeholder="实验名称" />
      </div>
      <div class="hero-meta">
        <span class="metric"><b class="display-num">{{ amountMmol.toFixed(2) }}</b> mmol</span>
        <span class="metric"><b class="display-num">{{ concentrationM.toFixed(3) }}</b> M</span>
        <StatusPill :status="conn.online ? 'online' : 'offline'" :label="conn.roleLabel" />
      </div>
    </header>

    <div class="grid">
      <section class="card">
        <h3>1 · 配方与条件</h3>
        <label>摩尔质量 (g/mol)<NInputNumber v-model:value="molecularWeight" :min="0" size="small" /></label>
        <label>称量 (g)<NInputNumber v-model:value="massG" :min="0" size="small" /></label>
        <label>溶剂 (mL)<NInputNumber v-model:value="solventMl" :min="0" size="small" /></label>
        <label>温度 (°C)<NInputNumber v-model:value="temperatureC" size="small" /></label>
        <label>反应时间 (min)<NInputNumber v-model:value="reactionMinutes" :min="0" size="small" /></label>
        <p class="hint">领域算法留在前端；改动这里不会影响任何 Edge 协议。</p>
      </section>

      <section class="card">
        <h3>2 · 在设备上执行一个动作</h3>
        <label>设备<NSelect v-model:value="deviceId" size="small" :options="deviceOptions" placeholder="选择在线设备" /></label>
        <label>动作<NSelect v-model:value="actionName" size="small" :options="actionOptions" placeholder="选择动作" /></label>
        <label>
          参数（同名字段已按配方预填）
          <NInput v-model:value="paramJson" type="textarea" :rows="6" size="small" class="mono" />
        </label>
        <NButton type="primary" size="small" :loading="submitting" :disabled="!selectedAction || !conn.schedulerLocal" @click="runAction">
          提交单点动作
        </NButton>
        <p v-if="!conn.schedulerLocal && conn.online" class="hint warn">当前进程不持有调度权威，无法提交。</p>
        <div v-if="telemetryRows.length" class="telemetry">
          <span v-for="[key, value] in telemetryRows" :key="key" class="tele">
            <em>{{ key }}</em><b class="mono">{{ typeof value === "object" ? JSON.stringify(value) : String(value) }}</b>
          </span>
        </div>
      </section>

      <section class="card">
        <h3>3 · 运行一条已定义的流程</h3>
        <label>流程<NSelect v-model:value="workflowUuid" size="small" filterable :options="workflowOptions" placeholder="选择 Workflow 定义" /></label>
        <div class="row">
          <NButton size="small" type="primary" :loading="submitting" :disabled="!workflowUuid || !conn.schedulerLocal" @click="runWorkflow">运行</NButton>
          <NButton size="small" quaternary @click="router.push('/editor')">去编排画布</NButton>
        </div>
        <h4>进行中</h4>
        <div v-if="!activeRuns.length" class="hint">没有正在执行的任务。</div>
        <div v-for="task in activeRuns" :key="task.uuid" class="run" @click="router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`)">
          <div class="run-head">
            <span class="mono">{{ task.uuid.slice(0, 8) }}</span>
            <NTag size="tiny" :bordered="false">{{ task.execution_kind === "ad_hoc_device_action" ? "单点动作" : "流程" }}</NTag>
            <StatusPill :status="task.status" size="small" />
          </div>
          <NProgress type="line" :percentage="progressOf(task.uuid)" :show-indicator="false" :height="6" />
        </div>
        <h4>最近事件</h4>
        <ul class="events">
          <li v-for="event in history" :key="event.event_uuid">
            <span class="mono dim">{{ fmtTime(event.occurred_at_ms) }}</span>
            <span>{{ event.device_uuid ?? "—" }} · {{ event.action_name ?? event.event_type }}</span>
            <span class="dim">{{ String(event.summary.status ?? event.summary.outcome ?? event.event_type) }}</span>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.workbench {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  padding: 18px 20px;
  border-radius: 16px;
  background: linear-gradient(135deg, var(--domain-accent-soft), #fff);
  border: 1px solid var(--hairline);
}

.overline {
  display: block;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6e7580;
  margin-bottom: 6px;
}

.title-input {
  max-width: 460px;
  font-weight: 700;
}

.hero-meta {
  display: flex;
  align-items: center;
  gap: 18px;
}

.metric b {
  font-size: 22px;
  margin-right: 4px;
}

.grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

.card {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 16px 18px;
  border: 1px solid var(--hairline);
  border-radius: 14px;
  background: var(--panel);
}

.card h3 {
  margin: 0 0 4px;
  font-size: 14px;
}

.card h4 {
  margin: 10px 0 0;
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
}

.card label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
  color: #3d4650;
}

.hint {
  margin: 0;
  font-size: 12px;
  color: #8b929c;
}

.hint.warn {
  color: #b45309;
}

.row {
  display: flex;
  gap: 8px;
}

.telemetry {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.tele {
  display: inline-flex;
  gap: 6px;
  padding: 3px 8px;
  border-radius: 999px;
  background: var(--panel-soft);
  border: 1px solid var(--hairline);
  font-size: 11.5px;
}

.tele em {
  font-style: normal;
  color: #6e7580;
}

.run {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  cursor: pointer;
}

.run-head {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}

.events {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}

.events li {
  display: flex;
  gap: 10px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.dim {
  color: #8b929c;
}
</style>
