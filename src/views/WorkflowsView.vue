<script setup lang="ts">
/** 流程定义与运行任务：定义与运行（Task）严格分开。 */
import { computed, h, onMounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NCheckbox,
  NDataTable,
  NFormItem,
  NInput,
  NModal,
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
import EntityRef from "../components/EntityRef.vue";
import PageHeader from "../components/PageHeader.vue";
import StatusPill from "../components/StatusPill.vue";
import WorkflowInfoPopover from "../components/WorkflowInfoPopover.vue";
import { describeError } from "../features/errors";
import { describeTask } from "../features/task-jobs";
import { computeWorkflowGraphStats, type WorkflowGraphStats } from "../features/workflow-graph-stats";
import { beginWorkflowPrint } from "../features/workflow-print";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";
import { useSchedulerStore } from "../stores/scheduler";

const router = useRouter();
const message = useMessage();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const sched = useSchedulerStore();

/** workflow_uuid → 注册表挂起更新影响的节点数（0 不入表）。 */
const pendingNodeCounts = ref(new Map<string, number>());

async function loadPendingImpacts() {
  // Registry Authority 只在 --role backend 进程挂载；Host 进程直接跳过，不发 404 请求。
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

const showRun = ref(false);
const submitting = ref(false);
const selectedWorkflowUuid = ref<string | null>(null);
const runMode = ref<BackendWorkflowRunMode>("normal");
const printAfterCreate = ref(true);
const statusFilter = ref("");

/** 定义检索：名称 / 标签 / uuid / 涉及设备 id。 */
const definitionQuery = ref("");

/** 每个定义的图谱统计（节点 / 设备），按 uuid+revision 缓存，列表可见时懒加载。 */
const graphStats = shallowRef(new Map<string, WorkflowGraphStats>());
const graphStatsPending = new Set<string>();

async function ensureGraphStats(workflows: BackendWorkflow[]) {
  const wanted = workflows.filter((workflow) => {
    const key = `${workflow.uuid}@${workflow.revision}`;
    return !graphStats.value.has(key) && !graphStatsPending.has(key);
  });
  if (!wanted.length) return;
  for (const workflow of wanted) graphStatsPending.add(`${workflow.uuid}@${workflow.revision}`);
  const results = await Promise.allSettled(
    wanted.map((workflow) => conn.api.domains.workflowBackend.graph(workflow.uuid)),
  );
  const next = new Map(graphStats.value);
  results.forEach((result, index) => {
    const workflow = wanted[index]!;
    const key = `${workflow.uuid}@${workflow.revision}`;
    graphStatsPending.delete(key);
    if (result.status === "fulfilled") {
      next.set(key, computeWorkflowGraphStats(result.value.nodes, result.value.edges));
    }
  });
  graphStats.value = next;
}

function statsOf(workflow: BackendWorkflow): WorkflowGraphStats | undefined {
  return graphStats.value.get(`${workflow.uuid}@${workflow.revision}`);
}

const visibleDefinitions = computed(() => {
  const text = definitionQuery.value.trim().toLowerCase();
  if (!text) return sched.definitions;
  return sched.definitions.filter((workflow) => {
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

watch(
  () => sched.definitions,
  (definitions) => void ensureGraphStats(definitions),
  { immediate: true },
);

const definitionOptions = computed(() =>
  sched.definitions.map((workflow) => ({
    label: `${workflow.name} · ${shortId(workflow.uuid)}`,
    value: workflow.uuid,
  })),
);

const visibleTasks = computed(() =>
  statusFilter.value
    ? sched.tasks.filter((task) => task.status === statusFilter.value)
    : sched.tasks,
);

function shortId(id: string): string {
  return id.length > 12 ? `${id.slice(0, 10)}…` : id;
}

function fmtIso(value?: string): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

const definitionColumns: DataTableColumns<BackendWorkflow> = [
  {
    title: "名称",
    key: "name",
    minWidth: 160,
    // 信息卡（NPopover）取代原生 tooltip；单元格本体仍保持省略号布局
    ellipsis: true,
    render: (row) => {
      const popover = h(
        WorkflowInfoPopover,
        { uuid: row.uuid, workflow: row },
        {
          default: () =>
            h(
              NButton,
              {
                text: true,
                type: "primary",
                style: "max-width: 100%",
                onClick: () => router.push(`/workflows/${encodeURIComponent(row.uuid)}`),
              },
              {
                default: () =>
                  h(
                    "span",
                    {
                      style:
                        "display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;",
                    },
                    row.name,
                  ),
              },
            ),
        },
      );
      const pendingNodes = pendingNodeCounts.value.get(row.uuid) ?? 0;
      if (!pendingNodes) return popover;
      return h(
        NSpace,
        { size: 4, align: "center", wrap: false },
        {
          default: () => [
            popover,
            h(
              NTag,
              {
                size: "small",
                type: "warning",
                title: "注册表模板有挂起更新，进入详情升级",
              },
              { default: () => `挂起 ${pendingNodes} 节点` },
            ),
          ],
        },
      );
    },
  },
  {
    title: "UUID",
    key: "uuid",
    width: 120,
    // 名称列已在左侧，这里保持短码；hover 仍给完整 UUID / 描述
    render: (row) => h(EntityRef, { uuid: row.uuid, label: shortId(row.uuid), mono: true }),
  },
  { title: "版本", key: "revision", width: 80 },
  {
    title: "规模",
    key: "scale",
    width: 170,
    // 节点数 / 涉及设备数：图谱懒加载，未到时显示占位
    render: (row) => {
      const stats = statsOf(row);
      if (!stats) return h("span", { class: "dim" }, "…");
      const deviceTitle = stats.devices.map((device) => `${device.deviceId} ×${device.nodeCount}`).join("\n");
      return h(
        NSpace,
        { size: 4, wrap: false },
        {
          default: () => [
            h(NTag, { size: "small", bordered: false }, { default: () => `${stats.nodeCount} 节点` }),
            h(
              NTag,
              {
                size: "small",
                bordered: false,
                type: stats.deviceCount ? "info" : "default",
                title: deviceTitle || "没有引用设备",
              },
              { default: () => `${stats.deviceCount} 设备` },
            ),
          ],
        },
      );
    },
  },
  {
    title: "标签",
    key: "tags",
    minWidth: 150,
    render: (row) =>
      h(
        NSpace,
        { size: 4, wrap: true },
        { default: () => row.tags.map((tag) => h(NTag, { size: "small" }, { default: () => String(tag) })) },
      ),
  },
  {
    title: "更新时间",
    key: "update_time",
    width: 170,
    render: (row) => fmtIso(row.update_time),
  },
  {
    title: "操作",
    key: "actions",
    width: 100,
    render: (row) =>
      h(
        NButton,
        {
          size: "small",
          type: "primary",
          secondary: true,
          onClick: () => {
            selectedWorkflowUuid.value = row.uuid;
            showRun.value = true;
          },
        },
        { default: () => "创建任务" },
      ),
  },
];

const taskColumns: DataTableColumns<BackendWorkflowTask> = [
  {
    title: "Task UUID",
    key: "uuid",
    width: 130,
    render: (row) =>
      h(
        NButton,
        {
          text: true,
          type: "primary",
          onClick: () => router.push(`/workflow-tasks/${encodeURIComponent(row.uuid)}`),
        },
        { default: () => h(EntityRef, { uuid: row.uuid, label: shortId(row.uuid), mono: true }) },
      ),
  },
  {
    title: "状态",
    key: "status",
    width: 130,
    render: (row) => h(StatusPill, { status: row.status, size: "small" }),
  },
  { title: "模式", key: "run_mode", width: 110 },
  {
    title: "控制态",
    key: "control_status",
    width: 170,
    render: (row) => h("span", { class: "mono" }, row.control_status),
  },
  {
    title: "Workflow",
    key: "workflow_uuid",
    width: 200,
    // 同定义表：hover 展示 Workflow 信息卡（含图谱统计）；行内优先显示定义名称；
    // ad-hoc 单点动作没有定义，显示「设备 / 动作」。
    render: (row) => {
      const workflowUuid = row.workflow_uuid;
      if (!workflowUuid) {
        return h(
          "span",
          { class: "adhoc-label", title: describeTask(row) },
          describeTask(row),
        );
      }
      const definition = sched.definitions.find((wf) => wf.uuid === workflowUuid);
      return h(
        WorkflowInfoPopover,
        { uuid: workflowUuid, workflow: definition },
        {
          default: () =>
            h(
              "span",
              {
                class: definition ? undefined : "mono",
                style:
                  "display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default;",
              },
              definition ? definition.name : shortId(workflowUuid),
            ),
        },
      );
    },
  },
  {
    title: "开始",
    key: "started_at",
    width: 170,
    render: (row) => fmtIso(row.started_at),
  },
];

async function createTask() {
  if (!selectedWorkflowUuid.value) {
    message.warning("请选择 Workflow 定义");
    return;
  }
  const definition = sched.definitions.find(
    (workflow) => workflow.uuid === selectedWorkflowUuid.value,
  );
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
    message.success(`已创建任务 ${task.uuid}`);
    showRun.value = false;
    await router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`);
  } catch (err) {
    printSession?.close();
    message.error(describeError(err));
  } finally {
    submitting.value = false;
  }
}

onMounted(() => {
  void sched.refresh();
  void loadPendingImpacts();
});
</script>

<template>
  <div class="workflow-page">
    <PageHeader
      :title="domain.config.nav.workflows"
      subtitle="管理流程定义，创建并跟踪运行任务"
    >
      <template #actions>
        <NButton size="small" secondary @click="router.push('/editor')">编排草稿</NButton>
        <NButton size="small" type="primary" @click="showRun = true">从定义创建任务</NButton>
      </template>
    </PageHeader>

    <NAlert v-if="sched.error" type="error" closable>
      流程数据读取失败：{{ sched.error }}
    </NAlert>

    <NCard size="small">
      <template #header>
        <NSpace align="center" :size="10">
          <span>Workflow 定义</span>
          <span class="dim">{{ visibleDefinitions.length }} / {{ sched.definitions.length }}</span>
        </NSpace>
      </template>
      <template #header-extra>
        <NInput
          v-model:value="definitionQuery"
          size="small"
          clearable
          placeholder="检索名称 / 标签 / 设备 / UUID"
          style="width: 260px"
        />
      </template>
      <NDataTable
        :columns="definitionColumns"
        :data="visibleDefinitions"
        :loading="sched.initialLoading"
        :row-key="(row: BackendWorkflow) => row.uuid"
        :scroll-x="900"
        size="small"
      />
    </NCard>

    <NCard size="small">
      <template #header>
        <NSpace align="center">
          <span>Workflow Tasks</span>
          <NSelect
            v-model:value="statusFilter"
            size="small"
            style="width: 170px"
            :options="[
              { label: '全部状态', value: '' },
              { label: '待调度', value: 'pending' },
              { label: '运行中', value: 'running' },
              { label: '等待取消', value: 'canceling' },
              { label: '成功', value: 'succeeded' },
              { label: '失败', value: 'failed' },
              { label: '已取消', value: 'canceled' },
              { label: '超时', value: 'timeout' },
            ]"
          />
        </NSpace>
      </template>
      <NDataTable
        :columns="taskColumns"
        :data="visibleTasks"
        :loading="sched.initialLoading"
        :row-key="(row: BackendWorkflowTask) => row.uuid"
        :scroll-x="830"
        size="small"
      />
    </NCard>

    <NModal v-model:show="showRun" preset="card" title="创建 Workflow Task" style="width: 520px">
      <NFormItem label="Workflow 定义">
        <NSelect
          v-model:value="selectedWorkflowUuid"
          filterable
          :options="definitionOptions"
          placeholder="选择已保存且通过后端校验的 Workflow"
        />
      </NFormItem>
      <NFormItem label="运行模式">
        <NSelect
          v-model:value="runMode"
          :options="[
            { label: '正常运行', value: 'normal' },
            { label: '逐步运行', value: 'step' },
            { label: '单节点', value: 'single_node', disabled: true },
          ]"
        />
      </NFormItem>
      <NCheckbox v-model:checked="printAfterCreate">
        创建成功后打印实验执行单（也可另存为 PDF）
      </NCheckbox>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showRun = false">返回</NButton>
          <NButton type="primary" :loading="submitting" @click="createTask">
            {{ printAfterCreate ? "创建任务并打印" : "创建任务" }}
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

:deep(.adhoc-label) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #3d4650;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}
</style>
