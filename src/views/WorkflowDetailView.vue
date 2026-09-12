<script setup lang="ts">
/** Workflow 定义/Graph 详情；运行实例统一跳到 /workflow-tasks/:uuid。 */
import { computed, onMounted, shallowRef, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  NAlert,
  NButton,
  NCard,
  NDescriptions,
  NDescriptionsItem,
  NEmpty,
  NIcon,
  NSpace,
  NSpin,
  NTable,
  NTag,
  useMessage,
} from "naive-ui";
import { ArrowBackOutline } from "@vicons/ionicons5";
import type {
  BackendWorkflowGraph,
  BackendWorkflowNode,
  BackendWorkflowTask,
  RegistryPendingImpact,
} from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import StatusPill from "../components/StatusPill.vue";
import { describeError } from "../features/errors";
import { beginWorkflowPrint } from "../features/workflow-print";
import WorkflowRunButton from "../components/WorkflowRunButton.vue";
import type { WorkflowExecutionMode } from "../features/workflow-execution";
import { useConnectionStore } from "../stores/connection";
import { useDomainThemeStore } from "../stores/domain-theme";

const NODE_TYPE_LABEL: Record<string, string> = {
  device_action: "设备动作",
  workflow: "子流程",
  manual_confirm: "人工确认",
  control: "控制",
};

/** graph 节点的目标设备写在 meta_data.target_device_id（旧图可能在 param.device_id）。 */
function nodeDevice(node: BackendWorkflowNode): string {
  const meta = node.meta_data as Record<string, unknown> | undefined;
  const param = node.param as Record<string, unknown> | undefined;
  const value = meta?.target_device_id ?? param?.device_id;
  return typeof value === "string" ? value : "";
}

function paramPreview(param: unknown): string {
  if (!param || typeof param !== "object") return "—";
  const entries = Object.entries(param as Record<string, unknown>);
  if (!entries.length) return "—";
  const text = entries.map(([key, value]) => `${key}=${typeof value === "string" ? value : JSON.stringify(value)}`).join("  ");
  return text.length > 72 ? `${text.slice(0, 72)}…` : text;
}

function fmtIso(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

const route = useRoute();
const router = useRouter();
const message = useMessage();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const workflowUuid = String(route.params.id ?? "");

const graph = shallowRef<BackendWorkflowGraph | null>(null);
const tasks = shallowRef<BackendWorkflowTask[]>([]);
const loading = ref(true);
const running = ref(false);
const lastError = ref("");
const pendingImpacts = shallowRef<RegistryPendingImpact[]>([]);
const registryActing = ref("");

const templateNames = computed(() =>
  new Map((graph.value?.node_templates ?? []).map((item) => [item.uuid, item.display_name])),
);

/** 当前 workflow 里被注册表挂起更新影响的节点：node_uuid → 冲突说明。 */
const nodeImpacts = computed(() => {
  const map = new Map<string, { entryName: string; actions: string[] }>();
  for (const impact of pendingImpacts.value) {
    for (const node of impact.affected_nodes) {
      if (node.workflow_uuid !== workflowUuid) continue;
      const hit = map.get(node.node_uuid);
      if (hit) {
        if (!hit.actions.includes(node.action)) hit.actions.push(node.action);
      } else {
        map.set(node.node_uuid, { entryName: impact.name, actions: [node.action] });
      }
    }
  }
  return map;
});

/** 当前 workflow 涉及的挂起条目（去重），驱动顶部升级提示。 */
const impactedEntries = computed(() =>
  pendingImpacts.value.filter((impact) =>
    impact.affected_nodes.some((node) => node.workflow_uuid === workflowUuid),
  ),
);

async function loadPendingImpacts() {
  // Registry Authority 只在 --role backend 进程挂载；Host 进程直接跳过，不发 404 请求。
  if (conn.registrySupport === "unsupported") {
    pendingImpacts.value = [];
    return;
  }
  try {
    const { impacts } = await conn.api.domains.registry.pendingImpacts();
    pendingImpacts.value = impacts;
  } catch {
    pendingImpacts.value = [];
  }
}

async function refresh() {
  loading.value = true;
  lastError.value = "";
  try {
    const api = conn.api.domains.workflowBackend;
    const [nextGraph, taskPage] = await Promise.all([
      api.graph(workflowUuid),
      api.tasks({ page: 1, page_size: 100, workflow_uuid: workflowUuid }),
      loadPendingImpacts(),
    ]);
    graph.value = nextGraph;
    tasks.value = taskPage.items;
  } catch (err) {
    lastError.value = describeError(err);
  } finally {
    loading.value = false;
  }
}

/** "升级"按钮：确认挂起版本生效；之后新任务按新动作定义执行。 */
async function upgradeRegistryEntry(name: string) {
  registryActing.value = name;
  try {
    await conn.api.domains.registry.applyEntry(name);
    message.success(`模板 ${name} 已升级为挂起版本`);
    await loadPendingImpacts();
  } catch (err) {
    message.error(describeError(err));
  } finally {
    registryActing.value = "";
  }
}

/** 忽略挂起版本：保持当前生效版本继续服务。 */
async function dismissRegistryEntry(name: string) {
  registryActing.value = name;
  try {
    await conn.api.domains.registry.dismissEntry(name);
    message.success(`已忽略模板 ${name} 的挂起版本`);
    await loadPendingImpacts();
  } catch (err) {
    message.error(describeError(err));
  } finally {
    registryActing.value = "";
  }
}

function printDefinition() {
  const session = beginWorkflowPrint();
  if (!session) {
    message.warning("浏览器拦截了打印窗口，请允许本站打开弹窗后重试");
    return;
  }
  session.complete({
    domainName: domain.config.name,
    workflowName: graph.value?.workflow.name ?? workflowUuid,
    workflowUuid,
    status: "definition",
    revision: graph.value?.workflow.revision,
    nodeCount: graph.value?.nodes.length,
    edgeCount: graph.value?.edges.length,
    tags: graph.value?.workflow.tags.map(String),
  });
}

const runMode = ref<WorkflowExecutionMode>("normal");

async function createTask(printAfterCreate = false) {
  if (running.value || !conn.schedulerLocal || !graph.value) return;
  const printSession = printAfterCreate ? beginWorkflowPrint() : null;
  if (printAfterCreate && !printSession) {
    message.warning("浏览器拦截了打印窗口；任务仍会正常创建，可在任务详情中补打");
  }
  running.value = true;
  try {
    const task = await conn.api.domains.workflowBackend.createTask({
      workflow_uuid: workflowUuid,
      run_mode: runMode.value,
    });
    printSession?.complete({
      domainName: domain.config.name,
      workflowName: graph.value?.workflow.name ?? workflowUuid,
      workflowUuid,
      taskUuid: task.uuid,
      runMode: task.run_mode,
      status: task.status,
      revision: graph.value?.workflow.revision,
      nodeCount: graph.value?.nodes.length,
      edgeCount: graph.value?.edges.length,
      tags: graph.value?.workflow.tags.map(String),
      createdAt: task.create_time,
    });
    message.success(`已创建任务 ${task.uuid}`);
    await router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`);
  } catch (err) {
    printSession?.close();
    message.error(describeError(err));
  } finally {
    running.value = false;
  }
}

onMounted(() => void refresh());

// SSE 失效通知到达时自动重拉，页面无需手动刷新入口；断线恢复后同样自动重拉
watch(
  () => [conn.workflowNoticeRevision, conn.online] as const,
  ([, online]) => {
    if (online) void refresh();
  },
);
</script>

<template>
  <div class="detail-layout">
    <NCard size="small">
      <NSpace justify="space-between" align="center">
        <NSpace align="center">
          <NButton size="small" @click="router.back()">
            <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
            返回
          </NButton>
          <EntityRef :uuid="workflowUuid" :label="graph?.workflow.name" />
          <NTag v-if="graph" size="small">版本 {{ graph.workflow.revision }}</NTag>
        </NSpace>
        <NSpace>
          <NButton size="small" secondary :disabled="!graph" @click="printDefinition">
            打印定义
          </NButton>
          <WorkflowRunButton v-model="runMode" :loading="running"
            :disabled="!conn.schedulerLocal || !graph || !conn.online" @submit="createTask(false)" />
          <NButton size="small" type="primary" :loading="running" :disabled="!conn.schedulerLocal || !graph || !conn.online" @click="createTask(true)">
            创建并打印
          </NButton>
        </NSpace>
      </NSpace>
    </NCard>

    <NAlert v-if="lastError && conn.online" type="error">{{ lastError }}</NAlert>

    <NAlert v-if="impactedEntries.length" type="warning" title="注册表更新挂起，节点待升级">
      <div class="impact-list">
        <div v-for="impact in impactedEntries" :key="impact.name" class="impact-row">
          <span>
            模板 <b>{{ impact.name }}</b>（v{{ impact.active_version ?? "—" }} →
            v{{ impact.pending_version }}）的动作
            <span class="mono">{{ impact.conflicts.map((c) => c.action).join("、") }}</span>
            {{ impact.conflicts.some((c) => c.reason === "action-removed") ? "被移除或变化" : "定义变化" }}，
            本工作流 {{ impact.affected_nodes.filter((n) => n.workflow_uuid === workflowUuid).length }}
            个节点挂起（见下方标记）。
          </span>
          <NSpace size="small">
            <NButton
              size="tiny"
              type="warning"
              :loading="registryActing === impact.name"
              @click="upgradeRegistryEntry(impact.name)"
            >
              升级
            </NButton>
            <NButton
              size="tiny"
              secondary
              :disabled="registryActing === impact.name"
              @click="dismissRegistryEntry(impact.name)"
            >
              忽略
            </NButton>
          </NSpace>
        </div>
      </div>
    </NAlert>

    <div v-if="!graph && !conn.online" class="degraded">
      <span class="degraded-title">等待微后端连接</span>
      连接恢复后会自动载入该流程的定义与运行记录。
    </div>

    <NSpin v-else-if="loading && !graph" />

    <template v-else-if="graph">
      <NCard title="定义" size="small">
        <NDescriptions :column="3" label-placement="left" bordered size="small">
          <NDescriptionsItem label="名称">{{ graph.workflow.name }}</NDescriptionsItem>
          <NDescriptionsItem label="节点">{{ graph.nodes.length }}</NDescriptionsItem>
          <NDescriptionsItem label="边">{{ graph.edges.length }}</NDescriptionsItem>
          <NDescriptionsItem label="更新时间">{{ fmtIso(graph.workflow.update_time) }}</NDescriptionsItem>
          <NDescriptionsItem label="标签" :span="2">
            {{ graph.workflow.tags.map(String).join("、") || "—" }}
          </NDescriptionsItem>
        </NDescriptions>
      </NCard>

      <NCard title="Graph 节点" size="small">
        <NEmpty v-if="graph.nodes.length === 0" description="该定义尚未保存 Graph" />
        <NTable v-else size="small" striped>
          <thead>
            <tr>
              <th>#</th><th>名称</th><th>类型</th><th>目标设备</th><th>动作</th><th>参数</th><th>注册表</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(node, index) in graph.nodes" :key="node.uuid">
              <td class="mono dim">{{ index + 1 }}</td>
              <td>
                <span class="node-name">{{ node.name }}</span>
                <EntityRef :uuid="node.uuid" mono class="node-uuid" />
              </td>
              <td>{{ NODE_TYPE_LABEL[node.type] ?? node.type }}</td>
              <td class="mono">{{ nodeDevice(node) || templateNames.get(node.workflow_node_template_uuid ?? '') || '—' }}</td>
              <td class="mono">{{ node.action_name ?? '—' }}</td>
              <td class="mono param-cell" :title="JSON.stringify(node.param)">{{ paramPreview(node.param) }}</td>
              <td>
                <NTag
                  v-if="nodeImpacts.has(node.uuid)"
                  size="small"
                  type="warning"
                  :title="`模板 ${nodeImpacts.get(node.uuid)!.entryName} 的动作 ${nodeImpacts
                    .get(node.uuid)!
                    .actions.join('、')} 有挂起更新`"
                >
                  挂起·待升级
                </NTag>
                <span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </NTable>
      </NCard>

      <NCard title="运行记录" size="small">
        <NEmpty v-if="tasks.length === 0" description="该定义尚无 Task" />
        <NTable v-else size="small" striped>
          <thead><tr><th>Task</th><th>状态</th><th>模式</th><th>提交</th><th>结束</th><th></th></tr></thead>
          <tbody>
            <tr v-for="task in tasks" :key="task.uuid">
              <td><EntityRef :uuid="task.uuid" mono /></td>
              <td><StatusPill :status="task.status" size="small" /></td>
              <td>{{ task.run_mode }}<span v-if="task.control_status !== 'active'" class="dim"> · {{ task.control_status }}</span></td>
              <td class="mono">{{ fmtIso(task.create_time) }}</td>
              <td class="mono">{{ fmtIso(task.finished_at) }}</td>
              <td>
                <NButton
                  text
                  type="primary"
                  @click="router.push(`/workflow-tasks/${encodeURIComponent(task.uuid)}`)"
                >
                  查看
                </NButton>
              </td>
            </tr>
          </tbody>
        </NTable>
      </NCard>
    </template>
  </div>
</template>

<style scoped>
.detail-layout {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

.dim {
  color: #8b929c;
}

.node-name {
  display: block;
  font-weight: 600;
}

.node-uuid {
  display: block;
  font-size: 11px;
  color: #8b929c;
}

.param-cell {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: #5c6874;
}

.impact-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.impact-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
</style>
