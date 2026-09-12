<script setup lang="ts">
/**
 * 实验流程：上半是「流程定义」（可运行 / 复制到画布 / 删除），下半是「运行记录」。
 * 定义与运行（Task）严格分开；每条定义行内直接给出最近一次运行的结果，把两张表串起来。
 */
import { computed, h, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NEmpty,
  NFormItem,
  NInput,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import type {
  BackendWorkflow,
  BackendWorkflowRunMode,
  BackendWorkflowTask,
  RegistryPendingImpact,
} from "@openlab/protocol";
import PageHeader from "../components/PageHeader.vue";
import StatusPill from "../components/StatusPill.vue";
import WorkflowInfoPopover from "../components/WorkflowInfoPopover.vue";
import { describeError } from "../features/errors";
import { describeTask } from "../features/task-jobs";
import { computeWorkflowGraphStats, type WorkflowGraphStats } from "../features/workflow-graph-stats";
import {
  ACTIVE_TASK_STATUSES,
  CONTROL_STATUS_HINT,
  RUN_MODE_LABEL,
  displayTags,
  effectiveTaskStatus,
  formatDuration,
  formatFull,
  formatWhen,
  sortTasksLatestFirst,
  summarizeRuns,
  taskDurationMs,
  taskProgress,
} from "../features/workflow-list";
import { beginWorkflowPrint } from "../features/workflow-print";
import { WORKFLOW_RUN_OPTIONS } from "../features/workflow-execution";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";
import { useSchedulerStore } from "../stores/scheduler";

const router = useRouter();
const message = useMessage();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const sched = useSchedulerStore();

/** 相对时间 / 进行中耗时的时钟；跟随调度轮询节奏即可。 */
const nowMs = ref(Date.now());
let clock: ReturnType<typeof setInterval> | null = null;

// ---------------------------------------------------------------------------
// 注册表挂起更新（只在 --role backend 进程可用）
// ---------------------------------------------------------------------------

/** workflow_uuid → 受挂起模板更新影响的节点数（0 不入表）。 */
const pendingNodeCounts = ref(new Map<string, number>());

async function loadPendingImpacts() {
  if (conn.registrySupport === "unsupported") {
    pendingNodeCounts.value = new Map();
    return;
  }
  try {
    const { impacts } = await conn.api.domains.registry.pendingImpacts();
    const counts = new Map<string, number>();
    for (const impact of impacts as RegistryPendingImpact[]) {
      for (const node of impact.affected_nodes) {
        counts.set(node.workflow_uuid, (counts.get(node.workflow_uuid) ?? 0) + 1);
      }
    }
    pendingNodeCounts.value = counts;
  } catch {
    pendingNodeCounts.value = new Map();
  }
}

// ---------------------------------------------------------------------------
// 流程定义：图谱统计懒加载 + 检索 + 空流程折叠
// ---------------------------------------------------------------------------

const definitionQuery = ref("");
const showEmptyDefinitions = ref(false);

/** 每个定义的图谱统计（节点 / 设备），按 uuid+revision 缓存。 */
const graphStats = shallowRef(new Map<string, WorkflowGraphStats>());
const graphStatsPending = new Set<string>();

function statsKey(workflow: BackendWorkflow): string {
  return `${workflow.uuid}@${workflow.revision}`;
}

async function ensureGraphStats(workflows: BackendWorkflow[]) {
  const wanted = workflows.filter((workflow) => {
    const key = statsKey(workflow);
    return !graphStats.value.has(key) && !graphStatsPending.has(key);
  });
  if (!wanted.length) return;
  for (const workflow of wanted) graphStatsPending.add(statsKey(workflow));
  const results = await Promise.allSettled(
    wanted.map((workflow) => conn.api.domains.workflowBackend.graph(workflow.uuid)),
  );
  const next = new Map(graphStats.value);
  results.forEach((result, index) => {
    const workflow = wanted[index]!;
    graphStatsPending.delete(statsKey(workflow));
    if (result.status === "fulfilled") {
      next.set(statsKey(workflow), computeWorkflowGraphStats(result.value.nodes, result.value.edges));
    }
  });
  graphStats.value = next;
}

function statsOf(workflow: BackendWorkflow): WorkflowGraphStats | undefined {
  return graphStats.value.get(statsKey(workflow));
}

watch(
  () => sched.definitions,
  (definitions) => void ensureGraphStats(definitions),
  { immediate: true },
);

const runSummaries = computed(() => summarizeRuns(sched.tasks));

const matchedDefinitions = computed(() => {
  const text = definitionQuery.value.trim().toLowerCase();
  if (!text) return sched.workflows;
  return sched.workflows.filter((workflow) => {
    const stats = statsOf(workflow);
    const haystack = [
      workflow.name,
      workflow.uuid,
      workflow.description ?? "",
      ...workflow.tags.map(String),
      ...(stats?.devices.map((device) => device.deviceId) ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(text);
  });
});

/** 图谱已读到且没有节点的定义：保存时还没编排，不可运行，单独折叠。 */
function isEmptyDefinition(workflow: BackendWorkflow): boolean {
  const stats = statsOf(workflow);
  return stats !== undefined && stats.nodeCount === 0;
}

const readyDefinitions = computed(() => matchedDefinitions.value.filter((workflow) => !isEmptyDefinition(workflow)));
const emptyDefinitions = computed(() => matchedDefinitions.value.filter(isEmptyDefinition));

function deviceSummary(stats: WorkflowGraphStats): string {
  const names = stats.devices.slice(0, 3).map((device) => device.deviceId);
  const rest = stats.deviceCount - names.length;
  return names.join("、") + (rest > 0 ? ` 等 ${stats.deviceCount} 台` : "");
}

const deleting = ref(new Set<string>());

async function deleteDefinition(workflow: BackendWorkflow) {
  deleting.value = new Set(deleting.value).add(workflow.uuid);
  try {
    await conn.api.domains.workflowBackend.deleteWorkflow(workflow.uuid);
    message.success(`已删除「${workflow.name}」`);
    await sched.refresh();
  } catch (err) {
    message.error(describeError(err));
  } finally {
    const next = new Set(deleting.value);
    next.delete(workflow.uuid);
    deleting.value = next;
  }
}

async function deleteAllEmpty() {
  const targets = emptyDefinitions.value;
  const results = await Promise.allSettled(
    targets.map((workflow) => conn.api.domains.workflowBackend.deleteWorkflow(workflow.uuid)),
  );
  const failed = results.filter((result) => result.status === "rejected").length;
  if (failed) message.warning(`已删除 ${targets.length - failed} 个，${failed} 个失败`);
  else message.success(`已删除 ${targets.length} 个空流程`);
  showEmptyDefinitions.value = false;
  await sched.refresh();
}

// ---------------------------------------------------------------------------
// 运行记录
// ---------------------------------------------------------------------------

/** "" = 全部；"__active" = 进行中三态合并；其余为具体状态值。 */
const statusFilter = ref("");

const statusOptions = [
  { label: "全部状态", value: "" },
  { label: "进行中（待调度 / 运行中 / 取消中）", value: "__active" },
  { label: "已完成", value: "succeeded" },
  { label: "失败", value: "failed" },
  { label: "已取消", value: "canceled" },
  { label: "超时", value: "timeout" },
];

const filteredTasks = computed(() => {
  const filter = statusFilter.value;
  const tasks = !filter
    ? sched.tasks
    : filter === "__active"
      ? sched.tasks.filter((task) => ACTIVE_TASK_STATUSES.has(task.status))
      : sched.tasks.filter((task) => task.status === filter);
  return sortTasksLatestFirst(tasks);
});

function shortId(id: string): string {
  return id.slice(0, 8);
}

function taskTitle(task: BackendWorkflowTask): string {
  const definition = task.workflow_uuid ? sched.definitions.find((wf) => wf.uuid === task.workflow_uuid) : undefined;
  return definition?.name ?? describeTask(task);
}

const taskColumns = computed<DataTableColumns<BackendWorkflowTask>>(() => [
  {
    title: "流程",
    key: "title",
    minWidth: 220,
    ellipsis: true,
    render: (row) => {
      const title = taskTitle(row);
      const isAdhoc = row.execution_kind === "ad_hoc_device_action";
      const nameNode = h(
        NButton,
        {
          text: true,
          type: "primary",
          style: "max-width: 100%; font-weight: 600",
          onClick: () => router.push(`/workflow-tasks/${encodeURIComponent(row.uuid)}`),
        },
        { default: () => h("span", { class: "ellipsis" }, title) },
      );
      const subline = [
        h("span", { class: "mono" }, shortId(row.uuid)),
        isAdhoc ? h("span", null, "单点动作") : null,
        row.run_mode !== "normal" ? h("span", null, RUN_MODE_LABEL[row.run_mode]) : null,
      ].filter(Boolean);
      return h("div", { class: "task-cell" }, [
        row.workflow_uuid
          ? h(WorkflowInfoPopover, { uuid: row.workflow_uuid }, { default: () => nameNode })
          : nameNode,
        h("div", { class: "task-sub" }, subline),
      ]);
    },
  },
  {
    title: "状态",
    key: "status",
    width: 190,
    render: (row) => {
      const hint = ACTIVE_TASK_STATUSES.has(row.status) ? CONTROL_STATUS_HINT[row.control_status] : "";
      const attention = row.cleanup_status === "requires_attention";
      return h("div", { class: "status-cell" }, [
        h(StatusPill, { status: effectiveTaskStatus(row, sched.jobsByTask[row.uuid]), size: "small" }),
        hint ? h("span", { class: "status-hint" }, hint) : null,
        attention ? h(NTag, { size: "tiny", type: "warning", bordered: false }, { default: () => "需要处理" }) : null,
      ]);
    },
  },
  {
    title: "进度",
    key: "progress",
    width: 150,
    render: (row) => {
      const progress = taskProgress(row, sched.jobsByTask[row.uuid]);
      if (!progress) return h("span", { class: "dim" }, "—");
      // 失败 / 取消：显示死在第几个节点（1/8），而不是 fail-fast 收敛后的 8/8
      const shown = progress.stoppedAt ?? progress.done;
      const title =
        progress.tone === "failed"
          ? `第 ${progress.stoppedAt} 个节点失败（共 ${progress.total} 个，已完成 ${progress.done}）`
          : progress.tone === "canceled"
            ? `在第 ${progress.stoppedAt} 个节点取消（共 ${progress.total} 个，已完成 ${progress.done}）`
            : `${progress.done} / ${progress.total} 个节点已完成`;
      return h("div", { class: "progress-cell", title }, [
        h("div", { class: "progress-bar" }, [
          h("div", {
            class: ["progress-fill", progress.tone],
            style: { width: `${Math.round(progress.ratio * 100)}%` },
          }),
        ]),
        h("span", { class: ["progress-text", progress.tone] }, `${shown}/${progress.total}`),
      ]);
    },
  },
  {
    title: "开始",
    key: "started_at",
    width: 130,
    render: (row) =>
      h(
        "span",
        { title: formatFull(row.started_at ?? row.create_time) },
        row.started_at ? formatWhen(row.started_at, nowMs.value) : `创建于 ${formatWhen(row.create_time, nowMs.value)}`,
      ),
  },
  {
    title: "耗时",
    key: "duration",
    width: 120,
    render: (row) => {
      const duration = taskDurationMs(row, nowMs.value);
      if (duration === null) return h("span", { class: "dim" }, "—");
      const live = ACTIVE_TASK_STATUSES.has(row.status);
      return h("span", { class: { live } }, formatDuration(duration));
    },
  },
]);

// ---------------------------------------------------------------------------
// 运行流程（创建 Task）
// ---------------------------------------------------------------------------

const showRun = ref(false);
const submitting = ref(false);
const selectedWorkflowUuid = ref<string | null>(null);
const runMode = ref<BackendWorkflowRunMode>("normal");
const printAfterCreate = ref(true);

const runnableOptions = computed(() =>
  sched.workflows
    .filter((workflow) => !isEmptyDefinition(workflow))
    .map((workflow) => ({ label: workflow.name, value: workflow.uuid })),
);

function openRun(workflowUuid: string) {
  selectedWorkflowUuid.value = workflowUuid;
  showRun.value = true;
}

async function createTask() {
  if (submitting.value || !conn.schedulerLocal) return;
  if (!selectedWorkflowUuid.value) {
    message.warning("请选择要运行的流程");
    return;
  }
  const definition = sched.definitions.find((workflow) => workflow.uuid === selectedWorkflowUuid.value);
  const printSession = printAfterCreate.value ? beginWorkflowPrint() : null;
  if (printAfterCreate.value && !printSession) {
    message.warning("浏览器拦截了打印窗口；任务仍会正常创建，可在任务详情中补打");
  }
  submitting.value = true;
  try {
    const task = await sched.createTask(selectedWorkflowUuid.value, runMode.value);
    printSession?.complete({
      domainName: domain.config.name,
      workflowName: definition?.name ?? selectedWorkflowUuid.value,
      workflowUuid: selectedWorkflowUuid.value,
      taskUuid: task.uuid,
      runMode: task.run_mode,
      status: task.status,
      revision: definition?.revision,
      tags: definition?.tags.map(String),
      createdAt: task.create_time,
    });
    message.success(task.run_mode === "step" ? "已提交，请在运行详情中执行下一步" : `已开始运行「${definition?.name ?? "流程"}」`);
    showRun.value = false;
    await router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`);
  } catch (err) {
    printSession?.close();
    message.error(describeError(err));
  } finally {
    submitting.value = false;
  }
}

const subtitle = computed(() => {
  const parts = [`${sched.definitions.length} 个流程`];
  if (sched.activeTasks.length) parts.push(`${sched.activeTasks.length} 个正在运行`);
  parts.push(`${sched.tasks.length} 条运行记录`);
  return parts.join(" · ");
});

onMounted(() => {
  void sched.refresh();
  void loadPendingImpacts();
  clock = setInterval(() => (nowMs.value = Date.now()), 5000);
});

onUnmounted(() => {
  if (clock !== null) clearInterval(clock);
});
</script>

<template>
  <div class="workflow-page">
    <PageHeader :title="domain.config.nav.workflows" :subtitle="subtitle">
      <template #actions>
        <NButton size="small" :loading="sched.loading" @click="sched.refresh()">刷新</NButton>
        <NButton size="small" type="primary" @click="router.push('/editor')">新建流程</NButton>
      </template>
    </PageHeader>

    <NAlert v-if="sched.error" type="error" closable>流程数据读取失败：{{ sched.error }}</NAlert>

    <!-- 流程定义 -->
    <NCard size="small">
      <template #header>
        <NSpace align="center" :size="10">
          <span>流程定义</span>
          <span class="dim">{{ readyDefinitions.length }} 个可运行</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NInput
          v-model:value="definitionQuery"
          size="small"
          clearable
          placeholder="搜索名称 / 标签 / 设备"
          style="width: 240px"
        />
      </template>

      <NEmpty
        v-if="!sched.initialLoading && !readyDefinitions.length && !emptyDefinitions.length"
        :description="definitionQuery ? '没有匹配的流程' : '还没有流程：在画布里编排并保存后会出现在这里'"
        style="padding: 40px 0"
      >
        <template v-if="!definitionQuery" #extra>
          <NButton size="small" type="primary" @click="router.push('/editor')">去编排一个</NButton>
        </template>
      </NEmpty>

      <div v-else class="wf-list">
        <div v-for="wf in readyDefinitions" :key="wf.uuid" class="wf-row">
          <div class="wf-main">
            <div class="wf-title-line">
              <WorkflowInfoPopover :uuid="wf.uuid" :workflow="wf">
                <button class="wf-name" type="button" @click="router.push(`/workflows/${encodeURIComponent(wf.uuid)}`)">
                  {{ wf.name }}
                </button>
              </WorkflowInfoPopover>
              <NTag
                v-if="pendingNodeCounts.get(wf.uuid)"
                size="small"
                type="warning"
                :bordered="false"
                title="注册表模板有挂起更新，进入详情升级"
              >
                {{ pendingNodeCounts.get(wf.uuid) }} 个节点待升级
              </NTag>
              <span v-for="tag in displayTags(wf.tags)" :key="tag" class="wf-tag">{{ tag }}</span>
            </div>
            <div class="wf-meta">
              <template v-if="statsOf(wf)">
                <span>{{ statsOf(wf)!.nodeCount }} 个节点</span>
                <span class="sep" />
                <span v-if="statsOf(wf)!.deviceCount" :title="statsOf(wf)!.devices.map((d) => `${d.deviceId} × ${d.nodeCount}`).join('\n')">
                  {{ deviceSummary(statsOf(wf)!) }}
                </span>
                <span v-else>未引用设备</span>
              </template>
              <span v-else class="dim">正在读取图谱…</span>
              <span class="sep" />
              <span :title="formatFull(wf.update_time)">更新于 {{ formatWhen(wf.update_time, nowMs) }}</span>
            </div>
          </div>

          <div class="wf-runs">
            <template v-if="runSummaries.get(wf.uuid)">
              <div class="wf-run-latest">
                <StatusPill :status="runSummaries.get(wf.uuid)!.latest.status" size="small" />
                <span class="wf-run-when" :title="formatFull(runSummaries.get(wf.uuid)!.latest.started_at ?? runSummaries.get(wf.uuid)!.latest.create_time)">
                  {{ formatWhen(runSummaries.get(wf.uuid)!.latest.started_at ?? runSummaries.get(wf.uuid)!.latest.create_time, nowMs) }}
                </span>
              </div>
              <div class="wf-run-count">
                共运行 {{ runSummaries.get(wf.uuid)!.total }} 次<template v-if="runSummaries.get(wf.uuid)!.active">
                  · <b>{{ runSummaries.get(wf.uuid)!.active }}</b> 个进行中</template>
              </div>
            </template>
            <span v-else class="dim">尚未运行</span>
          </div>

          <div class="wf-actions">
            <NButton size="small" type="primary" secondary @click="openRun(wf.uuid)">运行</NButton>
            <NButton
              size="small"
              quaternary
              title="以这个流程为底稿在画布里打开一份副本"
              @click="router.push({ path: '/editor', query: { from: wf.uuid } })"
            >
              复制到画布
            </NButton>
            <NPopconfirm :positive-button-props="{ type: 'error' }" @positive-click="deleteDefinition(wf)">
              <template #trigger>
                <NButton size="small" quaternary :loading="deleting.has(wf.uuid)">删除</NButton>
              </template>
              删除流程「{{ wf.name }}」？已有的运行记录会保留。
            </NPopconfirm>
          </div>
        </div>

        <!-- 空流程：保存时没有节点，不可运行，折叠收纳 -->
        <div v-if="emptyDefinitions.length" class="wf-empty-group">
          <div class="wf-empty-head">
            <button class="wf-empty-toggle" type="button" @click="showEmptyDefinitions = !showEmptyDefinitions">
              <span class="chevron" :class="{ open: showEmptyDefinitions }">›</span>
              {{ emptyDefinitions.length }} 个空流程
              <span class="dim">保存时还没有节点，不能运行</span>
            </button>
            <NPopconfirm :positive-button-props="{ type: 'error' }" @positive-click="deleteAllEmpty">
              <template #trigger>
                <NButton size="tiny" quaternary type="error">全部删除</NButton>
              </template>
              删除这 {{ emptyDefinitions.length }} 个空流程？
            </NPopconfirm>
          </div>
          <div v-if="showEmptyDefinitions" class="wf-list wf-list-muted">
            <div v-for="wf in emptyDefinitions" :key="wf.uuid" class="wf-row wf-row-muted">
              <div class="wf-main">
                <div class="wf-title-line">
                  <WorkflowInfoPopover :uuid="wf.uuid" :workflow="wf">
                    <span class="wf-name wf-name-plain">{{ wf.name }}</span>
                  </WorkflowInfoPopover>
                </div>
                <div class="wf-meta">
                  <span :title="formatFull(wf.update_time)">保存于 {{ formatWhen(wf.update_time, nowMs) }}</span>
                </div>
              </div>
              <div class="wf-actions">
                <NPopconfirm :positive-button-props="{ type: 'error' }" @positive-click="deleteDefinition(wf)">
                  <template #trigger>
                    <NButton size="small" quaternary :loading="deleting.has(wf.uuid)">删除</NButton>
                  </template>
                  删除空流程「{{ wf.name }}」？
                </NPopconfirm>
              </div>
            </div>
          </div>
        </div>
      </div>
    </NCard>

    <!-- 运行记录 -->
    <NCard size="small">
      <template #header>
        <NSpace align="center" :size="10">
          <span>运行记录</span>
          <span class="dim">{{ filteredTasks.length }} 条</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NSelect v-model:value="statusFilter" size="small" style="width: 240px" :options="statusOptions" />
      </template>
      <NDataTable
        :columns="taskColumns"
        :data="filteredTasks"
        :loading="sched.initialLoading"
        :row-key="(row: BackendWorkflowTask) => row.uuid"
        :scroll-x="820"
        size="small"
      >
        <template #empty>
          <NEmpty :description="statusFilter ? '这个状态下没有运行记录' : '还没有运行记录：从上方任意流程点「运行」开始'" style="padding: 32px 0" />
        </template>
      </NDataTable>
    </NCard>

    <NModal v-model:show="showRun" preset="card" title="运行流程" style="width: 480px">
      <NFormItem label="流程">
        <NSelect
          v-model:value="selectedWorkflowUuid"
          filterable
          :options="runnableOptions"
          placeholder="选择一个已编排节点的流程"
        />
      </NFormItem>
      <NFormItem label="运行方式">
        <NSelect
          v-model:value="runMode"
          :options="WORKFLOW_RUN_OPTIONS"
          :disabled="submitting"
        />
      </NFormItem>
      <NCheckbox v-model:checked="printAfterCreate">开始后打印实验执行单（也可另存为 PDF）</NCheckbox>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showRun = false">取消</NButton>
          <NButton type="primary" :loading="submitting" @click="createTask">
            {{ runMode === 'step' ? (printAfterCreate ? '提交逐步运行并打印' : '提交逐步运行') : (printAfterCreate ? '开始运行并打印' : '开始运行') }}
          </NButton>
        </NSpace>
      </template>
    </NModal>
  </div>
</template>

<style scoped>
.workflow-page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dim {
  color: #8b929c;
  font-size: 12px;
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

/* ---------- 流程定义列表 ---------- */

.wf-list {
  display: flex;
  flex-direction: column;
  margin: -4px 0;
}

.wf-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 200px auto;
  align-items: center;
  gap: 16px;
  padding: 12px 4px;
  border-bottom: 1px solid var(--hairline);
}

.wf-row:last-child {
  border-bottom: 0;
}

.wf-main {
  min-width: 0;
}

.wf-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.wf-name {
  border: 0;
  background: none;
  padding: 0;
  font: 700 14px var(--font-sans);
  color: #101418;
  cursor: pointer;
  text-align: left;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.wf-name:hover {
  color: var(--domain-accent, #2563eb);
}

.wf-name-plain {
  cursor: default;
  color: #6e7580;
  font-weight: 600;
}

.wf-name-plain:hover {
  color: #6e7580;
}

.wf-tag {
  font: 600 11px var(--font-mono);
  color: #6e7580;
  background: var(--panel-soft, #f3f2ee);
  border-radius: 5px;
  padding: 1px 6px;
}

.wf-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 4px;
  font-size: 12.5px;
  color: #6e7580;
}

.sep {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: #c0c5cc;
}

.wf-runs {
  display: flex;
  flex-direction: column;
  gap: 3px;
  min-width: 0;
}

.wf-run-latest {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wf-run-when {
  font-size: 12.5px;
  color: #3d4650;
}

.wf-run-count {
  font-size: 12px;
  color: #8b929c;
}

.wf-run-count b {
  color: #2e5bff;
}

.wf-actions {
  display: flex;
  align-items: center;
  gap: 4px;
  justify-self: end;
}

/* 空流程折叠组 */
.wf-empty-group {
  margin-top: 4px;
  padding-top: 8px;
  border-top: 1px dashed var(--hairline);
}

.wf-empty-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 4px 4px;
}

.wf-empty-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  background: none;
  padding: 0;
  font: 600 12.5px var(--font-sans);
  color: #3d4650;
  cursor: pointer;
}

.wf-empty-toggle:hover {
  color: var(--domain-accent, #2563eb);
}

.chevron {
  display: inline-block;
  font-size: 16px;
  line-height: 1;
  color: #8b929c;
  transition: transform 0.15s ease;
}

.chevron.open {
  transform: rotate(90deg);
}

.wf-list-muted {
  margin-top: 4px;
}

.wf-row-muted {
  grid-template-columns: minmax(0, 1fr) auto;
  padding: 8px 4px;
}

@media (max-width: 960px) {
  .wf-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  .wf-actions {
    justify-self: start;
  }
}

/* ---------- 运行记录表 ---------- */

:deep(.ellipsis) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.task-cell) {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

:deep(.task-sub) {
  display: flex;
  gap: 8px;
  font-size: 11.5px;
  color: #8b929c;
}

:deep(.status-cell) {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

:deep(.status-hint) {
  font-size: 11.5px;
  color: #b45309;
}

:deep(.progress-cell) {
  display: flex;
  align-items: center;
  gap: 8px;
}

:deep(.progress-bar) {
  flex: 1;
  height: 5px;
  border-radius: 3px;
  background: #ecebe6;
  overflow: hidden;
}

:deep(.progress-fill) {
  height: 100%;
  border-radius: 3px;
  background: #2e5bff;
  transition: width 0.3s ease;
}

:deep(.progress-fill.done) {
  background: #0b7a55;
}

:deep(.progress-fill.failed) {
  background: #b91c1c;
}

/* 取消是人为中止：橙色，与失败区分 */
:deep(.progress-fill.canceled) {
  background: #c2410c;
}

:deep(.progress-text) {
  flex-shrink: 0;
  font: 600 11.5px var(--font-mono);
  color: #6e7580;
  font-variant-numeric: tabular-nums;
}

:deep(.progress-text.failed) {
  color: #b91c1c;
}

:deep(.progress-text.canceled) {
  color: #c2410c;
}

:deep(.live) {
  color: #2e5bff;
  font-variant-numeric: tabular-nums;
}
</style>
