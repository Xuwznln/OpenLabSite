<script setup lang="ts">
/**
 * Workflow 任务运行时详情（workflow-backend 域，Backend {code,data} 信封）。
 *
 * 消费 backend 9dd16db1 的 4 个只读运行时端点（spec §6）：
 * - manual-confirmations：确认卡片（每 job 至多一条，task 维度聚合）
 * - interventions：干预记录 revision 序列 + resume_control_status
 * - per-job results / feedback-history：attempt 时间线
 *
 * §6.3 渲染路径红线：「多 attempt」= 同 task+node 的多个 job 行（job 根字段
 * attempt）；必须先 GET /workflow-tasks/{task}/jobs 再逐 job 取 results。
 * results 响应保持列表形状但每 job 至多一条，渲染取 rows[0]、不假设多条。
 *
 * 降级：旧基座无这些路由（HTTP 404）→ 显示「后端版本不支持」；
 * code=3002 → task 不存在或已删；code=1000 → 非法 uuid。
 */
import { computed, onMounted, ref, shallowReactive, shallowRef, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NEmpty,
  NIcon,
  NInput,
  NSpin,
  NTag,
  NTooltip,
} from "naive-ui";
import { ArrowBackOutline } from "@vicons/ionicons5";
import {
  ApiError,
  BackendBusinessError,
  type BackendIntervention,
  type BackendManualConfirmation,
  type BackendManualConfirmationDecisionInput,
  type BackendNodeJobFeedback,
  type BackendNodeJobResult,
  type BackendWorkflowNodeJob,
  type BackendWorkflowTask,
} from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import StatusPill from "../components/StatusPill.vue";
import { describeError } from "../features/errors";
import { describeNodeJob, describeTask, parseIsoMs, snapshotNodes, snapshotWorkflowName } from "../features/task-jobs";
import { beginWorkflowPrint } from "../features/workflow-print";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";

const route = useRoute();
const router = useRouter();
const conn = useConnectionStore();
const domain = useDomainThemeStore();

const taskUuid = String(route.params.id ?? "");
const wb = () => conn.api.domains.workflowBackend;

const loading = ref(true);
/** ""=正常；unsupported=旧基座 404；not-found=code 3002；bad-uuid=code 1000 */
const degraded = ref<"" | "unsupported" | "not-found" | "bad-uuid">("");
const lastError = ref("");

// shallowRef：DTO 内含递归 JSON 类型，深层 ref 解包会让 vue-tsc 爆栈；
// 加载后整体替换引用即可触发更新
const task = shallowRef<BackendWorkflowTask | null>(null);
const jobs = shallowRef<BackendWorkflowNodeJob[]>([]);
const confirmations = shallowRef<BackendManualConfirmation[]>([]);
const interventions = shallowRef<BackendIntervention[]>([]);
const manualDecisionActor = ref("operator");
const manualDecisionBusy = shallowReactive<Record<string, boolean>>({});

function classifyError(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 404) {
    degraded.value = "unsupported";
    return true;
  }
  if (err instanceof BackendBusinessError) {
    if (err.code === 3002) degraded.value = "not-found";
    else if (err.code === 1000) degraded.value = "bad-uuid";
    else lastError.value = err.message;
    return true;
  }
  lastError.value = describeError(err);
  return false;
}

async function refresh() {
  loading.value = true;
  degraded.value = "";
  lastError.value = "";
  try {
    // task 与 jobs 是既有端点；confirmations/interventions 是新端点，
    // 旧基座只会在新端点上 404 —— 分开捕获，避免整页误判为不支持
    task.value = await wb().task(taskUuid);
    jobs.value = await wb().taskJobs(taskUuid);
  } catch (err) {
    classifyError(err);
    loading.value = false;
    return;
  }
  try {
    confirmations.value = await wb().taskManualConfirmations(taskUuid);
    interventions.value = await wb().taskInterventions(taskUuid);
  } catch (err) {
    classifyError(err);
  }
  loading.value = false;
}

async function decideManualConfirmation(
  confirmation: BackendManualConfirmation,
  action: BackendManualConfirmationDecisionInput["action"],
) {
  if (confirmation.status !== "pending" || manualDecisionBusy[confirmation.uuid]) return;
  const actor = manualDecisionActor.value.trim() || "operator";
  manualDecisionBusy[confirmation.uuid] = true;
  try {
    await wb().decideManualConfirmation(confirmation.uuid, {
      action,
      confirmed_by: actor,
      decision_idempotency_key: `openlab-manual:${confirmation.uuid}:${action}`,
    });
    await refresh();
  } catch (err) {
    classifyError(err);
  } finally {
    manualDecisionBusy[confirmation.uuid] = false;
  }
}

// ── attempt 时间线：同 node 的 job 行按 attempt 分组（§6.3） ──

const nodeGroups = computed(() => {
  const groups = new Map<string, BackendWorkflowNodeJob[]>();
  for (const job of jobs.value) {
    const list = groups.get(job.workflow_node_uuid) ?? [];
    list.push(job);
    groups.set(job.workflow_node_uuid, list);
  }
  const order = new Map(snapshotNodes(task.value).map((node, index) => [node.uuid, index]));
  return [...groups.entries()]
    .map(([nodeUuid, list]) => {
      const sorted = [...list].sort((a, b) => a.attempt_no - b.attempt_no);
      const info = describeNodeJob(task.value, sorted[0]!);
      return { nodeUuid, jobs: sorted, ...info };
    })
    .sort((a, b) => (order.get(a.nodeUuid) ?? 1e9) - (order.get(b.nodeUuid) ?? 1e9));
});

// ── 任务摘要（标题 / 时间 / 用时 / 计数） ──

const title = computed(() => (task.value ? describeTask(task.value) : `task ${shortId(taskUuid)}`));
const workflowName = computed(() => snapshotWorkflowName(task.value));

const EXECUTION_KIND_LABEL: Record<string, string> = {
  workflow: "整图运行",
  ad_hoc_device_action: "单点设备动作",
};

const RUN_MODE_LABEL: Record<string, string> = {
  normal: "普通",
  dry_run: "试运行",
  step: "单步",
};

function fmtDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(Math.round(ms), 0)} ms`;
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ${s % 60} s`;
  return `${Math.floor(m / 60)} h ${m % 60} min`;
}

const elapsedText = computed(() => {
  const start = parseIsoMs(task.value?.started_at) ?? parseIsoMs(task.value?.create_time);
  if (!start) return "—";
  const end = parseIsoMs(task.value?.finished_at) ?? Date.now();
  return `${fmtDuration(end - start)}${task.value?.finished_at ? "" : "（进行中）"}`;
});

function jobDuration(job: BackendWorkflowNodeJob): string {
  const start = parseIsoMs(job.started_at);
  if (!start) return "";
  return fmtDuration((parseIsoMs(job.finished_at) ?? Date.now()) - start);
}

const jobCounts = computed(() => {
  const counts = { total: jobs.value.length, done: 0, failed: 0 };
  for (const job of jobs.value) {
    if (job.status === "succeeded" || job.status === "skipped") counts.done += 1;
    else if (job.status === "failed" || job.status === "timeout") counts.failed += 1;
  }
  return counts;
});

// ── 每 job 的 result / feedback（展开时按需加载） ──

interface JobRuntime {
  loading: boolean;
  loaded: boolean;
  unsupported: boolean;
  error: string;
  /** 当前 schema 每 job 至多一条（列表形状仅为归档扩展留余量）。 */
  result: BackendNodeJobResult | null;
  feedback: BackendNodeJobFeedback[];
}

const expanded = ref<Set<string>>(new Set());
// shallowReactive + 整体替换条目：JobRuntime 内含递归 JSON 类型，深层
// reactive 会让 vue-tsc 类型实例化爆栈
const runtime = shallowReactive<Record<string, JobRuntime>>({});

async function toggleJob(jobUuid: string) {
  const next = new Set(expanded.value);
  if (next.has(jobUuid)) {
    next.delete(jobUuid);
    expanded.value = next;
    return;
  }
  next.add(jobUuid);
  expanded.value = next;
  if (runtime[jobUuid]?.loaded) return;
  const idle: JobRuntime = {
    loading: true,
    loaded: false,
    unsupported: false,
    error: "",
    result: null,
    feedback: [],
  };
  runtime[jobUuid] = idle;
  try {
    const rows = await wb().jobResults(jobUuid);
    const feedback = await wb().jobFeedbackHistory(jobUuid);
    runtime[jobUuid] = {
      ...idle,
      loading: false,
      loaded: true,
      // §6.3：渲染按至多一条处理，不假设多条
      result: rows[0] ?? null,
      feedback,
    };
  } catch (err) {
    const failed = { ...idle, loading: false };
    if (err instanceof ApiError && err.status === 404) failed.unsupported = true;
    else if (err instanceof BackendBusinessError && err.code === 3002)
      failed.error = "job 不存在或已删除";
    else failed.error = describeError(err);
    runtime[jobUuid] = failed;
  }
}

// ── 展示辅助 ──

const CONFIRM_STATUS_LABEL: Record<BackendManualConfirmation["status"], string> = {
  pending: "待确认",
  approved: "已批准",
  rejected: "已拒绝",
  timed_out: "已超时",
  canceled: "已取消",
};

const INTERVENTION_STATUS_LABEL: Record<BackendIntervention["status"], string> = {
  open: "待决策",
  selected: "已选择",
  superseded: "已被取代",
};

function tagType(value: string): "success" | "error" | "warning" | "info" | "default" {
  if (["approved", "succeeded", "selected", "active"].includes(value)) return "success";
  if (["rejected", "failed", "timeout", "timed_out"].includes(value)) return "error";
  if (["pending", "open", "paused"].includes(value)) return "warning";
  if (["canceled", "superseded"].includes(value)) return "default";
  return "info";
}

function fmtIso(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function shortId(uuid: string): string {
  return uuid.length > 8 ? uuid.slice(0, 8) : uuid;
}

function jsonPreview(value: unknown): string {
  const text = JSON.stringify(value);
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

function printTask() {
  if (!task.value) return;
  const session = beginWorkflowPrint();
  if (!session) {
    lastError.value = "浏览器拦截了打印窗口，请允许本站打开弹窗后重试";
    return;
  }
  session.complete({
    domainName: domain.config.name,
    workflowName: title.value,
    workflowUuid: task.value.workflow_uuid ?? "ad-hoc",
    taskUuid: task.value.uuid,
    runMode: task.value.run_mode,
    status: task.value.status,
    nodeCount: jobs.value.length,
    createdAt: task.value.create_time,
  });
}

onMounted(() => void refresh());
// 失效通知或断线恢复时重拉
watch(
  () => [conn.workflowNoticeRevision, conn.online] as const,
  ([, online]) => {
    if (online) void refresh();
  },
);
</script>

<template>
  <div class="task-detail">
    <NCard size="small">
      <div class="head-row">
        <NButton size="small" @click="router.back()">
          <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
          返回
        </NButton>
        <div class="head-title">
          <span class="title-text">{{ title }}</span>
          <span class="mono head-id">{{ taskUuid }}</span>
        </div>
        <StatusPill v-if="task" :status="task.status" />
        <NTag v-if="task && task.control_status !== 'active'" size="small" type="warning" :bordered="false">
          控制态 {{ task.control_status }}
        </NTag>
        <NButton size="small" secondary style="margin-left: auto" @click="refresh()">
          刷新
        </NButton>
        <NButton v-if="task" size="small" type="primary" secondary @click="printTask">
          打印实验单
        </NButton>
      </div>
      <div v-if="task" class="summary-grid">
        <div class="summary-item">
          <span class="summary-k">类型</span>
          <span class="summary-v">{{ EXECUTION_KIND_LABEL[task.execution_kind] ?? task.execution_kind }} · {{ RUN_MODE_LABEL[task.run_mode] ?? task.run_mode }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">流程定义</span>
          <span class="summary-v">
            <EntityRef v-if="task.workflow_uuid" :uuid="task.workflow_uuid" :label="workflowName || undefined" />
            <span v-else class="dim">无（单点动作）</span>
          </span>
        </div>
        <div class="summary-item">
          <span class="summary-k">提交</span>
          <span class="summary-v mono">{{ fmtIso(task.create_time) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">开始 / 结束</span>
          <span class="summary-v mono">{{ fmtIso(task.started_at) }} → {{ fmtIso(task.finished_at) }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">用时</span>
          <span class="summary-v">{{ elapsedText }}</span>
        </div>
        <div class="summary-item">
          <span class="summary-k">节点作业</span>
          <span class="summary-v">
            {{ jobCounts.total }} 条 · 完成 {{ jobCounts.done }}
            <span v-if="jobCounts.failed" class="err">· 失败 {{ jobCounts.failed }}</span>
          </span>
        </div>
        <div v-if="task.description" class="summary-item summary-wide">
          <span class="summary-k">描述</span>
          <span class="summary-v">{{ task.description }}</span>
        </div>
      </div>
    </NCard>

    <div v-if="!task && !conn.online" class="degraded">
      <span class="degraded-title">等待微后端连接</span>
      连接恢复后会自动载入任务、节点作业与运行记录。
    </div>

    <NSpin v-else-if="loading && !task" style="margin: 48px auto; display: block" />

    <!-- 旧基座降级：新端点 404 → 后端版本不支持 -->
    <NAlert v-else-if="degraded === 'unsupported'" type="info">
      当前进程不提供任务运行时读取端点（manual-confirmations / interventions /
      results / feedback-history）；请连接带 Workflow Authority 的进程后重试。
    </NAlert>
    <NAlert v-else-if="degraded === 'not-found'" type="warning">
      任务不存在或已被删除（code=3002）。
    </NAlert>
    <NAlert v-else-if="degraded === 'bad-uuid'" type="error">
      任务 UUID 非法（code=1000）：{{ taskUuid }}
    </NAlert>

    <template v-else>
      <NAlert
        v-if="lastError && conn.online"
        type="error"
        closable
        @close="lastError = ''"
      >
        {{ lastError }}
      </NAlert>

      <!-- ── attempt 时间线（§6.3 红线：多 attempt = 同 node 多 job 行） ── -->
      <NCard size="small" title="节点作业">
        <template #header-extra>
          <span class="dim">按流程拓扑顺序；同一节点的多次 attempt 依次列出</span>
        </template>
        <NEmpty v-if="nodeGroups.length === 0" description="本任务尚未产生节点作业" size="small" />
        <div v-for="group in nodeGroups" :key="group.nodeUuid" class="node-group">
          <div class="node-head">
            <span class="node-name">{{ group.nodeName }}</span>
            <span v-if="group.deviceId" class="node-meta mono">{{ group.deviceId }} · {{ group.actionName }}</span>
            <span class="node-meta mono dim">node {{ shortId(group.nodeUuid) }}</span>
          </div>
          <div v-for="job in group.jobs" :key="job.uuid" class="job-row">
            <div class="row-head clickable" @click="toggleJob(job.uuid)">
              <span class="attempt-chip">attempt {{ job.attempt_no }}</span>
              <StatusPill :status="job.status" size="small" />
              <span class="mono dim">job {{ shortId(job.uuid) }}</span>
              <span v-if="job.started_at" class="dim">{{ fmtIso(job.started_at) }}<template v-if="job.finished_at"> → {{ fmtIso(job.finished_at) }}</template></span>
              <span v-if="jobDuration(job)" class="dim">用时 {{ jobDuration(job) }}</span>
              <span v-if="job.error_info && Object.keys(job.error_info).length" class="err small">
                {{ jsonPreview(job.error_info) }}
              </span>
              <span class="expand-hint">{{ expanded.has(job.uuid) ? "收起" : "结果 / 反馈" }}</span>
            </div>

            <div v-if="expanded.has(job.uuid)" class="job-runtime">
              <NSpin v-if="runtime[job.uuid]?.loading" size="small" />
              <template v-else-if="runtime[job.uuid]?.unsupported">
                <span class="dim">后端版本不支持 results / feedback-history 端点。</span>
              </template>
              <template v-else-if="runtime[job.uuid]?.error">
                <span class="err">{{ runtime[job.uuid]?.error }}</span>
              </template>
              <template v-else>
                <!-- result：每 job 至多一条 -->
                <div class="rt-block">
                  <div class="rt-title">执行结果</div>
                  <div v-if="!runtime[job.uuid]?.result" class="dim small">
                    尚无结果（job 未提交 result）
                  </div>
                  <div v-else class="small">
                    <NTag
                      size="small"
                      :type="tagType(runtime[job.uuid]!.result!.outcome)"
                      :bordered="false"
                    >
                      {{ runtime[job.uuid]!.result!.outcome }}
                    </NTag>
                    <span class="dim">
                      提交 {{ fmtIso(runtime[job.uuid]!.result!.committed_at) }}
                    </span>
                    <span v-if="runtime[job.uuid]!.result!.consumed_at" class="dim">
                      · 已消费 {{ fmtIso(runtime[job.uuid]!.result!.consumed_at) }}
                    </span>
                    <div class="mono small">
                      return_info: {{ jsonPreview(runtime[job.uuid]!.result!.return_info) }}
                    </div>
                    <div
                      v-if="runtime[job.uuid]!.result!.error_info.length"
                      class="mono small err"
                    >
                      error_info: {{ jsonPreview(runtime[job.uuid]!.result!.error_info) }}
                    </div>
                  </div>
                </div>
                <!-- feedback：sequence 自然序 -->
                <div class="rt-block">
                  <div class="rt-title">反馈归档</div>
                  <div v-if="runtime[job.uuid]?.feedback.length === 0" class="dim small">
                    没有反馈记录
                  </div>
                  <div
                    v-for="fb in runtime[job.uuid]?.feedback ?? []"
                    :key="fb.uuid"
                    class="fb-row small"
                  >
                    <span class="mono seq">#{{ fb.sequence }}</span>
                    <span class="mono">{{ fb.feedback_type }}</span>
                    <span class="mono dim">{{ jsonPreview(fb.data) }}</span>
                    <span class="dim">观测 {{ fmtIso(fb.observed_at) }}</span>
                  </div>
                </div>
              </template>
            </div>
          </div>
        </div>
      </NCard>

      <div class="secondary-row">
        <!-- ── 人工确认卡片（§6.1） ── -->
        <NCard size="small" title="人工确认">
          <template #header-extra>
            <span class="dim">{{ confirmations.length ? `${confirmations.length} 条` : "无" }}</span>
          </template>
          <div v-if="confirmations.length === 0" class="dim small">
            本任务没有需要人工确认的节点。
          </div>
          <div
            v-for="c in confirmations"
            :key="c.uuid"
            class="confirm-card"
            :class="{ settled: c.status !== 'pending' }"
          >
            <div class="row-head">
              <NTag size="small" :type="tagType(c.status)" :bordered="false">
                {{ CONFIRM_STATUS_LABEL[c.status] }}
              </NTag>
              <span class="mono dim">job {{ shortId(c.workflow_node_job_uuid) }}</span>
              <span class="dim">开启 {{ fmtIso(c.opened_at) }}</span>
              <span v-if="c.deadline_at" class="dim">截止 {{ fmtIso(c.deadline_at) }}</span>
            </div>
            <div v-if="c.description" class="desc">{{ c.description }}</div>
            <div class="mono small">param: {{ jsonPreview(c.param) }}</div>
            <div v-if="c.assignee_user_ids.length" class="small dim">
              指派：{{ c.assignee_user_ids.join("、") }}
            </div>
            <div v-else-if="c.status === 'pending'" class="small confirm-unrestricted">
              未指派：任何已登录操作员均可确认
            </div>
            <div v-if="c.decided_at" class="small">
              {{ c.confirmed_by ?? "—" }} 于 {{ fmtIso(c.decided_at) }} 决策
              <span v-if="c.comment" class="dim">：{{ c.comment }}</span>
            </div>
            <div v-if="c.status === 'pending'" class="confirm-actions">
              <NInput
                v-model:value="manualDecisionActor"
                size="small"
                class="confirm-actor"
                placeholder="确认人 ID"
                @click.stop
              />
              <NButton
                size="small"
                type="primary"
                :loading="manualDecisionBusy[c.uuid]"
                @click.stop="decideManualConfirmation(c, 'approve')"
              >
                确认放行
              </NButton>
              <NButton
                size="small"
                secondary
                :disabled="manualDecisionBusy[c.uuid]"
                @click.stop="decideManualConfirmation(c, 'skip')"
              >
                跳过
              </NButton>
              <NButton
                size="small"
                tertiary
                type="error"
                :disabled="manualDecisionBusy[c.uuid]"
                @click.stop="decideManualConfirmation(c, 'reject')"
              >
                拒绝
              </NButton>
            </div>
          </div>
        </NCard>

        <!-- ── 干预记录（§6.2） ── -->
        <NCard size="small" title="干预记录">
          <template #header-extra>
            <span class="dim">{{ interventions.length ? `${interventions.length} 条` : "无" }}</span>
          </template>
          <div v-if="interventions.length === 0" class="dim small">
            没有发生过人工干预（动作异常经「异常审批」处理后会在此留痕）。
          </div>
          <div v-for="iv in interventions" :key="iv.uuid" class="intervention-row">
            <div class="row-head">
              <span class="mono rev">rev {{ iv.revision }}</span>
              <NTag size="small" :type="tagType(iv.status)" :bordered="false">
                {{ INTERVENTION_STATUS_LABEL[iv.status] }}
              </NTag>
              <NTooltip>
                <template #trigger>
                  <NTag
                    size="small"
                    :type="iv.resume_control_status === 'paused' ? 'warning' : 'success'"
                    :bordered="false"
                  >
                    恢复后 {{ iv.resume_control_status === "paused" ? "保持暂停" : "继续执行" }}
                  </NTag>
                </template>
                resume_control_status = {{ iv.resume_control_status }}
              </NTooltip>
              <span class="mono dim">job {{ shortId(iv.workflow_node_job_uuid) }}</span>
              <span class="dim">开启 {{ fmtIso(iv.opened_at) }}</span>
            </div>
            <div class="small">
              选项：
              <span v-for="(opt, i) in iv.options" :key="i" class="mono opt">
                {{ jsonPreview(opt) }}
              </span>
            </div>
            <div v-if="iv.status === 'selected'" class="small">
              已选 <b class="mono">{{ iv.selected_option_id ?? "—" }}</b>
              <span v-if="iv.decided_at" class="dim">（{{ fmtIso(iv.decided_at) }}）</span>
              <span class="mono dim">{{ jsonPreview(iv.selected_option) }}</span>
            </div>
          </div>
        </NCard>
      </div>
    </template>
  </div>
</template>

<style scoped>
.task-detail {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.head-row {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.head-title {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.title-text {
  font-weight: 700;
  font-size: 15px;
  color: #101418;
}

.head-id {
  font-size: 11px;
  color: #8b929c;
}

.summary-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px 18px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--hairline);
}

.summary-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.summary-wide {
  grid-column: 1 / -1;
}

.summary-k {
  font-size: 11px;
  color: #8b929c;
  letter-spacing: 0.02em;
}

.summary-v {
  font-size: 13px;
  color: #1f262e;
  overflow: hidden;
  text-overflow: ellipsis;
}

.secondary-row {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

@media (max-width: 1100px) {
  .summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .secondary-row {
    grid-template-columns: minmax(0, 1fr);
  }
}

.mono {
  font-family: var(--font-mono);
}

.small {
  font-size: 12px;
}

.dim {
  color: #9aa3ab;
  font-size: 12px;
}

.err {
  color: #b91c1c;
}

.row-head {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.confirm-card {
  border: 1px solid #fcd34d;
  background: #fffbeb;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.confirm-card.settled {
  border-color: #e8e6e1;
  background: #fafaf8;
}

.confirm-unrestricted {
  color: #5c786d;
}

.confirm-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 5px;
  padding-top: 7px;
  border-top: 1px solid rgba(217, 180, 73, 0.28);
}

.confirm-actor {
  width: 150px;
}

.desc {
  font-size: 13px;
}

.intervention-row {
  border-bottom: 1px solid #f0eee9;
  padding: 8px 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.intervention-row:last-child {
  border-bottom: none;
}

.rev {
  font-size: 12px;
  font-weight: 700;
  color: #6e7580;
}

.opt {
  display: inline-block;
  background: #f5f4f0;
  border-radius: 6px;
  padding: 1px 6px;
  margin-right: 6px;
  font-size: 11.5px;
}

.node-group {
  margin-bottom: 12px;
}

.node-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 6px;
}

.node-name {
  font-size: 13.5px;
  font-weight: 700;
  color: #1f262e;
}

.node-meta {
  font-size: 11.5px;
  color: #6e7580;
}

.job-row {
  border: 1px solid #ececea;
  border-radius: 8px;
  padding: 8px 10px;
  margin-bottom: 6px;
}

.clickable {
  cursor: pointer;
}

.attempt-chip {
  display: inline-flex;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  color: #1e40af;
  background: #dbeafe;
  font-family: var(--font-mono);
}

.expand-hint {
  margin-left: auto;
  font-size: 12px;
  color: #2563eb;
}

.job-runtime {
  margin-top: 8px;
  border-top: 1px dashed #ececea;
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rt-title {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #6e7580;
  margin-bottom: 3px;
}

.fb-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 2px 0;
}

.seq {
  color: #6e7580;
  font-weight: 700;
}
</style>
