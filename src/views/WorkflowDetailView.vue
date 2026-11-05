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
import {
  ApiError,
  BackendBusinessError,
  declaredWorkflowIo,
  type BackendWorkflowGraph,
  type BackendWorkflowNode,
  type BackendWorkflowPublication,
  type BackendWorkflowTask,
  type RegistryPendingImpact,
} from "@openlab/protocol";
import EntityRef from "../components/EntityRef.vue";
import StatusPill from "../components/StatusPill.vue";
import { describeError } from "../features/errors";
import { beginWorkflowPrint } from "../features/workflow-print";
import WorkflowRunButton from "../components/WorkflowRunButton.vue";
import WorkflowBindingsDialog from "../components/WorkflowBindingsDialog.vue";
import EntryParamsDialog from "../components/EntryParamsDialog.vue";
import { createEntryParamsPrompt, submitWithEntryInput } from "../features/entry-params-prompt";
import { describeEntryParameter, describeOutput } from "../features/workflow-io";
import type { WorkflowExecutionMode } from "../features/workflow-execution";
import { useConnectionStore } from "../stores/connection";
import { useWorkflowValidationStore } from "../stores/workflow-validation";
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

/** 该定义声明的入口参数与输出（服务端保留的 meta_data.unilab）。 */
const declaredIo = computed(() => declaredWorkflowIo(graph.value?.workflow));
const entryPrompt = createEntryParamsPrompt();

// ── 发布：把当前修订冻结为不可变发布，供其他流程作为子工作流插入 ──
const publications = shallowRef<BackendWorkflowPublication[]>([]);
/** ""=正常；unsupported=后端没有发布接口；其他为读取失败文案 */
const publicationsState = ref("");
const publishing = ref(false);
const currentPublished = computed(() =>
  Boolean(graph.value && publications.value.some((item) => item.revision === graph.value!.workflow.revision)),
);

async function loadPublications() {
  try {
    publications.value = await conn.api.domains.workflowBackend.workflowPublications(workflowUuid);
    publicationsState.value = "";
  } catch (err) {
    publications.value = [];
    publicationsState.value = err instanceof ApiError && err.status === 404 ? "unsupported" : describeError(err);
  }
}

async function publishCurrent() {
  if (!graph.value || publishing.value) return;
  const revision = graph.value.workflow.revision;
  publishing.value = true;
  try {
    const publication = await conn.api.domains.workflowBackend.publishWorkflow(workflowUuid, { revision });
    message.success(`已发布版本 ${publication.revision}：其他流程现在可以把它作为子工作流插入`);
  } catch (err) {
    if (err instanceof BackendBusinessError && err.isConflict) {
      message.warning("流程在发布前又被修改（版本已变化），已重新读取；请确认当前内容后再发布");
    } else {
      message.error(`发布失败：${describeError(err)}`);
    }
  } finally {
    publishing.value = false;
    await refresh();
  }
}

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
      loadPublications(),
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
const bindingsOpen = ref(false);

async function createTask(printAfterCreate = false) {
  if (running.value || !conn.schedulerLocal || !graph.value) return;
  const printSession = printAfterCreate ? beginWorkflowPrint() : null;
  if (printAfterCreate && !printSession) {
    message.warning("浏览器拦截了打印窗口；任务仍会正常创建，可在任务详情中补打");
  }
  running.value = true;
  try {
    await useWorkflowValidationStore().check(workflowUuid);
    const mode = runMode.value;
    const task = await submitWithEntryInput(
      entryPrompt,
      declaredIo.value.input_contract.parameters,
      (input) => conn.api.domains.workflowBackend.createTask({
        workflow_uuid: workflowUuid,
        run_mode: mode,
        ...(input ? { input } : {}),
      }),
      { title: `运行「${graph.value.workflow.name}」`, confirmText: mode === "step" ? "提交逐步运行" : "提交运行" },
    );
    if (!task) {
      printSession?.close();
      return;
    }
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
          <NButton size="small" :disabled="!graph || !conn.online" @click="bindingsOpen = true">检查 / 补全参数</NButton>
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
      <span class="degraded-title">等待后端连接</span>
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

      <NCard title="入口参数、输出与发布" size="small">
        <template #header-extra>
          <NButton
            size="small"
            type="primary"
            secondary
            :loading="publishing"
            :disabled="!conn.online || publicationsState === 'unsupported' || graph.nodes.length === 0"
            :title="currentPublished ? '当前版本已发布；重复发布返回同一条记录' : '冻结当前版本，供其他流程作为子工作流插入'"
            @click="publishCurrent"
          >
            {{ currentPublished ? `版本 ${graph.workflow.revision} 已发布` : `发布当前版本（${graph.workflow.revision}）` }}
          </NButton>
        </template>
        <div class="io-grid">
          <div>
            <div class="io-title">入口参数</div>
            <div v-if="!declaredIo.input_contract.parameters.length" class="dim">未声明：运行时直接使用节点里填好的参数</div>
            <div v-for="item in declaredIo.input_contract.parameters" :key="item.name" class="io-item">
              {{ describeEntryParameter(item) }}
            </div>
          </div>
          <div>
            <div class="io-title">输出</div>
            <div v-if="!declaredIo.output_contract.outputs.length" class="dim">未声明：任务结果按节点逐条查看</div>
            <div v-for="item in declaredIo.output_contract.outputs" :key="item.name" class="io-item">
              {{ describeOutput(item) }}
            </div>
          </div>
        </div>
        <div class="io-title" style="margin-top: 12px">发布记录</div>
        <div v-if="publicationsState === 'unsupported'" class="dim">当前后端不提供工作流发布接口。</div>
        <NAlert v-else-if="publicationsState" type="warning" :bordered="false">读取发布记录失败：{{ publicationsState }}</NAlert>
        <div v-else-if="!publications.length" class="dim">尚未发布。发布后，其他流程可在画布里把它作为子工作流插入。</div>
        <NTable v-else size="small" striped>
          <thead><tr><th>版本</th><th>发布时间</th><th>入口参数</th><th>输出</th><th>合同摘要</th></tr></thead>
          <tbody>
            <tr v-for="(item, index) in publications" :key="item.uuid">
              <td>
                {{ item.revision }}
                <NTag v-if="index === 0" size="tiny" type="success" :bordered="false">最新</NTag>
                <NTag v-if="item.revision === graph.workflow.revision" size="tiny" :bordered="false">当前</NTag>
              </td>
              <td class="mono">{{ fmtIso(item.create_time) }}</td>
              <td>{{ item.inputs.map((input) => input.title || input.name).join("、") || "—" }}</td>
              <td>{{ item.outputs.map((output) => output.title || output.name).join("、") || "—" }}</td>
              <td class="mono dim" :title="item.contract_digest">{{ item.contract_digest.replace(/^sha256:/, "").slice(0, 12) }}</td>
            </tr>
          </tbody>
        </NTable>
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
    <WorkflowBindingsDialog :workflow-uuid="bindingsOpen ? workflowUuid : ''" @close="bindingsOpen = false" @saved="graph = $event" />
    <EntryParamsDialog :prompt="entryPrompt" />
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

.io-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px 24px;
}

.io-title {
  font-size: 12px;
  font-weight: 600;
  color: #5c6874;
  margin-bottom: 4px;
}

.io-item {
  font-size: 13px;
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
