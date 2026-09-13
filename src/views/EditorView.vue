<script setup lang="ts">
/**
 * 工作流编辑器（Dify 式三栏）：
 *
 * - 左：常驻节点库（Edge 在线设备/动作，搜索点选插入；离线可手动录入）
 * - 中：Vue Flow 画布（拖拽、连线、边端点重连、dagre 一键布局、网格吸附、
 *   MiniMap、Shift 框选、右键菜单、撤销/重做、复制/粘贴/副本）
 * - 右：抽屉检查器——点节点改参数/物料需求；点连线配置 **参数传递**
 *   （gjson 从父节点返回值取 → sjson 写入子节点参数，提交时生成 handles）
 *
 * 草稿自动保存到 localStorage（刷新不丢）；支持导出/导入 JSON 文件与
 * ?from=<workflow_id> 从运行历史克隆整图回画布（改一改重跑）。
 */
import { computed, markRaw, nextTick, onMounted, onUnmounted, provide, ref, shallowRef, watch, type Component } from "vue";
import { useRoute, useRouter } from "vue-router";
import {
  ConnectionMode,
  VueFlow,
  useVueFlow,
  type Node as FlowNode,
  type NodeTypesObject,
} from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import { Controls } from "@vue-flow/controls";
import { MiniMap } from "@vue-flow/minimap";
import dagre from "@dagrejs/dagre";
import {
  NButton,
  NDrawer,
  NDrawerContent,
  NDropdown,
  NIcon,
  NInput,
  NInputNumber,
  NModal,
  NPopover,
  NSelect,
  NSpace,
  NSwitch,
  NTabPane,
  NTabs,
  NTag,
  useDialog,
  useMessage,
} from "naive-ui";
import {
  AddOutline,
  ArrowBackOutline,
  ArrowForwardOutline,
  CloseOutline,
  GitBranchOutline,
  HandRightOutline,
  HelpCircleOutline,
  Pin,
  RepeatOutline,
  PinOutline,
  SettingsOutline,
  Star,
  StarOutline,
  TrashOutline,
} from "@vicons/ionicons5";
import ActionNode from "../components/ActionNode.vue";
import WorkflowRunButton from "../components/WorkflowRunButton.vue";
import { WORKFLOW_RUN_OPTIONS, type WorkflowExecutionMode } from "../features/workflow-execution";
import SlotNode from "../components/SlotNode.vue";
import { TERMS } from "../features/terminology";
import ManualNode from "../components/ManualNode.vue";
import BranchNode from "../components/BranchNode.vue";
import NodePickerPanel from "../components/NodePickerPanel.vue";
import GroupNode from "../components/GroupNode.vue";
import LoopNode from "../components/LoopNode.vue";
import TemplateGuide from "../components/TemplateGuide.vue";
import TemplatePanel from "../components/TemplatePanel.vue";
import {
  GROUP_ACTIONS_KEY,
  GROUP_NODE_TYPE,
  GROUP_PADDING,
  fitFrame,
  frameForLayout,
  frameSize,
  frameStyle,
  groupSubmitMeta,
  type GroupNodeData,
} from "../features/canvas-groups";
import {
  LOOP_ACTIONS_KEY,
  LOOP_HEADER_HEIGHT,
  LOOP_NODE_TYPE,
  LOOP_OPS,
  defaultLoopNodeData,
  describeLoopNode,
  loopNodeDataFromSpec,
  nearestLoopAncestor,
  type LoopConditionSource,
  type LoopMode,
  type LoopNodeData,
} from "../features/workflow-loops";
import WorkflowVariablesDrawer from "../components/WorkflowVariablesDrawer.vue";
import {
  buildTemplateRegistry,
  collectRoles,
  expandTemplate,
  hasTemplateGuide,
  suggestDeviceForRole,
  templateFromCanvas,
  templateFromRegistry,
  type ExpandedEdge,
  type ExpandedNode,
  type RoleDeviceCandidate,
  type TemplateRole,
  type WorkflowTemplate,
} from "../features/workflow-templates";
import {
  alignListGroups,
  applyVariablesToParam,
  buildParameterTableMeta,
  cloneJson,
  coerceVariableValue,
  flattenParameterFields,
  normalizeVariables,
  parseNodeParam,
  parseParameterTableMeta,
  variableId,
  type ParameterField,
  type VariableNode,
  type WorkflowVariable,
} from "../features/workflow-variables";
import {
  hasDragPayload,
  readDragPayload,
  setDragPayload,
  type SpecialKind,
} from "../features/canvas-dnd";
import { actionSchemaDetailFromCapability } from "@openlab/protocol";
import { useActionParamForm } from "../features/action-param-form";
import {
  actionParamSummary,
  runtimeActionParams,
  useRuntimeActions,
} from "../features/runtime-actions";
import {
  MISSING_PARAM_COUNTS_KEY,
  missingParamEntries,
} from "../features/param-completeness";
import {
  dryRunWorkflow,
  type DryRunDeductionRow,
  type DryRunEdgeInput,
  type DryRunIssue,
  type DryRunLot,
  type DryRunNodeInput,
  type DryRunReport,
} from "../features/graph-dry-run";
import type {
  BackendWorkflow,
  BackendWorkflowWriteInput,
  DeviceActionSchemaDetail,
  JsonObject,
  RuntimeActionCapability,
} from "@openlab/protocol";
import ActionParamFields from "../components/ActionParamFields.vue";
import { beginWorkflowPrint } from "../features/workflow-print";
import {
  buildAuthorityGraph,
  DEFAULT_MANUAL_CONFIRM_TIMEOUT_S,
  HOST_NODE_ID,
  MANUAL_CONFIRM_ACTION,
  newNodeUuid,
  SubmitGraphError,
  submitWorkflow,
} from "../features/workflow-submit";
import { useConnectionStore } from "../stores/connection";
import { useDevicesStore } from "../stores/devices";
import { useDomainThemeStore } from "../stores/domain-theme";

import "@vue-flow/core/dist/style.css";
import "@vue-flow/core/dist/theme-default.css";
import "@vue-flow/controls/dist/style.css";
import "@vue-flow/minimap/dist/style.css";
import { describeError } from "../features/errors";

const route = useRoute();
const router = useRouter();
const message = useMessage();
const dialog = useDialog();
const conn = useConnectionStore();
const devicesStore = useDevicesStore();
const domain = useDomainThemeStore();

const nodeTypes: NodeTypesObject = {
  action: markRaw(ActionNode) as unknown as NodeTypesObject[string],
  slot: markRaw(SlotNode) as unknown as NodeTypesObject[string],
  manual: markRaw(ManualNode) as unknown as NodeTypesObject[string],
  branch: markRaw(BranchNode) as unknown as NodeTypesObject[string],
  [GROUP_NODE_TYPE]: markRaw(GroupNode) as unknown as NodeTypesObject[string],
  [LOOP_NODE_TYPE]: markRaw(LoopNode) as unknown as NodeTypesObject[string],
};

const DRAFT_KEY = "unilab-edge-ui:editor-draft";
const VARIABLE_STORE_KEY = "unilab-edge-ui:workflow-variable-profiles";

// 内部 ID 自动生成（时间戳保证不重复），用户可编辑的是展示名 workflowName
const workflowId = ref(`wf-${Date.now()}`);
const workflowName = ref("");
const priority = ref("normal");
/** 这份草稿已提交到 Workflow Authority 的定义 uuid；再提交即更新同一定义。 */
const authorityWorkflowUuid = ref("");
const submitting = ref(false);
const draftSavedAt = ref(0);
const variablesDrawerOpen = ref(false);
const workflowVariables = ref<WorkflowVariable[]>([]);

const priorityOptions = ref([
  { label: "紧急", value: "urgent" },
  { label: "高", value: "high" },
  { label: "普通", value: "normal" },
  { label: "低", value: "low" },
]);

/** 克隆来的非枚举优先级（如 "1.0"）动态注入选项，不悄悄改语义 */
function ensurePriorityOption(value: string) {
  if (!priorityOptions.value.some((o) => o.value === value)) {
    priorityOptions.value.push({ label: `自定义 ${value}`, value });
  }
}

let nodeSeq = 1;

// ── 画布数据模型 ──

/** 一条参数传递映射：gjson 从父返回值取 sourceKey → sjson 写入子参数 targetKey */
type ParamMapping = { sourceKey: string; targetKey: string };

type LiteNode = {
  id: string;
  type?: string;
  position: { x: number; y: number };
  /** Vue Flow 算好的绝对坐标（组内成员的 position 是相对父节点的） */
  computedPosition?: { x: number; y: number };
  parentNode?: string;
  style?: Record<string, unknown>;
  data: Record<string, unknown>;
};

/** 节点的绝对坐标：组内成员用 computedPosition，其余就是 position。 */
function absolutePosition(node: LiteNode): { x: number; y: number } {
  const computed = node.parentNode ? node.computedPosition : undefined;
  return computed ? { x: computed.x, y: computed.y } : { x: node.position.x, y: node.position.y };
}

function isGroupNode(node: { type?: string }): boolean {
  return node.type === GROUP_NODE_TYPE;
}
function isLoopNode(node: { type?: string }): boolean {
  return node.type === LOOP_NODE_TYPE;
}
/** 有宽高、能装成员的节点：组框（画布边界）与循环框（图结构）。 */
function isContainerNode(node: { type?: string }): boolean {
  return isGroupNode(node) || isLoopNode(node);
}
/** 容器嵌套深度（父链长度），批量落节点时父节点必须先进节点表。 */
function containerDepth(nodeId: string, byId: Map<string, { parentNode?: string }>): number {
  let depth = 0;
  let current = byId.get(nodeId)?.parentNode;
  const seen = new Set<string>();
  while (current && !seen.has(current)) {
    seen.add(current);
    depth += 1;
    current = byId.get(current)?.parentNode;
  }
  return depth;
}
type LiteEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  data?: { mappings?: ParamMapping[] };
  label?: string;
  style?: Record<string, unknown>;
};

const flow = useVueFlow();
const {
  addNodes,
  addEdges,
  removeNodes,
  removeEdges,
  setNodes,
  setEdges,
  updateEdge,
  removeSelectedNodes,
  onConnect,
  onEdgeUpdate,
  onNodeClick,
  onEdgeClick,
  onNodesChange,
  onEdgesChange,
  onNodeDragStop,
  onNodeContextMenu,
  onEdgeContextMenu,
  onPaneContextMenu,
  onNodesInitialized,
  fitView,
} = flow;

// 批量落节点（模板展开/草稿恢复）时，尺寸测量完成前 fitView 会空跑；
// 挂起一个标记，等 nodesInitialized 再补一次。
let fitOnNextInit = false;

function requestFitView() {
  fitOnNextInit = true;
  void nextTick(() => fitView({ padding: 0.2, duration: 250 }));
}

onNodesInitialized(() => {
  if (!fitOnNextInit) return;
  fitOnNextInit = false;
  void fitView({ padding: 0.2, duration: 250 });
});

const liteNodes = computed(() => flow.getNodes.value as unknown as LiteNode[]);
const liteEdges = computed(() => flow.getEdges.value as unknown as LiteEdge[]);
/** 图节点数：组框只是可见边界，不算步骤 */
const nodeCount = computed(() => liteNodes.value.filter((n) => !isGroupNode(n)).length);

const EDGE_STYLE_PLAIN = { stroke: "#94a3b8", strokeWidth: 2 };
const EDGE_STYLE_MAPPED = { stroke: "#2E5BFF", strokeWidth: 2 };

function mappingLabel(mappings: ParamMapping[]): string {
  if (!mappings.length) return "";
  if (mappings.length === 1) return `${mappings[0].sourceKey} -> ${mappings[0].targetKey}`;
  return `${mappings.length} 项传参`;
}

/** 已有 target→…→source 路径时，再加 source→target 会成环（DAG 校验）。 */
function wouldCreateCycle(source: string, target: string, ignoreEdgeId?: string): boolean {
  const adjacency = new Map<string, string[]>();
  for (const edge of liteEdges.value) {
    if (edge.id === ignoreEdgeId) continue;
    const next = adjacency.get(edge.source) ?? [];
    next.push(edge.target);
    adjacency.set(edge.source, next);
  }
  const stack = [target];
  const seen = new Set<string>();
  while (stack.length) {
    const current = stack.pop()!;
    if (current === source) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    for (const next of adjacency.get(current) ?? []) stack.push(next);
  }
  return false;
}

function validateConnection(
  connection: { source?: string | null; target?: string | null },
  ignoreEdgeId?: string,
): connection is { source: string; target: string } {
  if (!connection.source || !connection.target || connection.source === connection.target) {
    message.warning("请从节点右侧 OUT 拖到另一节点左侧 IN，节点不能连接自身");
    return false;
  }
  if (
    liteEdges.value.some(
      (edge) =>
        edge.id !== ignoreEdgeId &&
        edge.source === connection.source &&
        edge.target === connection.target,
    )
  ) {
    message.warning("这两个节点已经连接");
    return false;
  }
  if (wouldCreateCycle(connection.source, connection.target, ignoreEdgeId)) {
    message.warning("这样连接会形成回路，工作流必须是有向无环图");
    return false;
  }
  return true;
}

onConnect((connection) => {
  if (!validateConnection(connection)) return;
  addEdges([
    {
      ...connection,
      sourceHandle: connection.sourceHandle ?? "out",
      targetHandle: connection.targetHandle ?? "in",
      id: `e${Date.now()}${Math.floor(Math.random() * 1000)}`,
      type: "smoothstep",
      data: { mappings: [] },
      style: EDGE_STYLE_PLAIN,
    },
  ]);
  commitHistory();
});

// 拖动边端点即可改接到其他节点（edges-updatable），传参映射随边保留
onEdgeUpdate(({ edge, connection }) => {
  if (!validateConnection(connection, edge.id)) return;
  updateEdge(
    edge,
    {
      ...connection,
      sourceHandle: connection.sourceHandle ?? "out",
      targetHandle: connection.targetHandle ?? "in",
    },
    false,
  );
  commitHistory();
  saveDraftSoon();
});

onNodeDragStop(() => commitHistory());

// Backspace/Delete 直接删除选中元素时，同步清理置顶变量并收起对应抽屉
onNodesChange((changes) => {
  if (restoringHistory) return;
  const removed = new Set(
    changes.flatMap((change) => (change.type === "remove" ? [change.id] : [])),
  );
  if (!removed.size) return;
  if (workflowVariables.value.some((variable) => removed.has(variable.nodeId))) {
    workflowVariables.value = workflowVariables.value.filter(
      (variable) => !removed.has(variable.nodeId),
    );
  }
  if (removed.has(editingNodeId.value)) {
    nodeDrawerOpen.value = false;
    nodePanelOpen.value = false;
    nodePanelPinned.value = false;
  }
  if (removed.has(lastInsertedId)) lastInsertedId = "";
  commitHistory();
});

onEdgesChange((changes) => {
  if (restoringHistory) return;
  const removed = changes.some((change) => change.type === "remove");
  if (
    changes.some(
      (change) => change.type === "remove" && change.id === editingEdgeId.value,
    )
  ) {
    edgeDrawerOpen.value = false;
  }
  if (removed) commitHistory();
});

// ── 插入节点 ──

let lastInsertedId = "";

function nextNodeId(): string {
  while (liteNodes.value.some((n) => n.id === `n${nodeSeq}`)) nodeSeq++;
  return `n${nodeSeq++}`;
}

// 节点渲染宽 220+边距，340 间距保证连线有可见、可点的长度
const INSERT_GAP_X = 340;

/** 接链锚点：优先当前唯一选中的节点（组框没有 handle，不算），其次上一个插入的节点。 */
function chainAnchorId(): string {
  const selected = flow.getSelectedNodes.value;
  if (selected.length === 1 && !isGroupNode(selected[0])) return String(selected[0].id);
  return lastInsertedId;
}

/** 新节点落点：锚点右侧一格；没有锚点就排在画布最右（按绝对坐标，组内成员也算）。 */
function insertPosition(anchorId: string): { x: number; y: number } {
  const nodes = liteNodes.value.filter((n) => !isGroupNode(n));
  if (!nodes.length) return { x: 80, y: 120 };
  const anchor =
    nodes.find((n) => n.id === anchorId) ??
    nodes.reduce((a, b) => (absolutePosition(a).x >= absolutePosition(b).x ? a : b));
  const base = absolutePosition(anchor);
  return { x: base.x + INSERT_GAP_X, y: base.y };
}

/** 新节点落在当前视口外时跟随过去，避免插着插着跑出屏幕。 */
function ensureVisible(position: { x: number; y: number }) {
  const vp = flow.viewport.value;
  const dim = flow.dimensions.value;
  if (!dim.width || !dim.height) return;
  const margin = 32;
  const left = position.x * vp.zoom + vp.x;
  const top = position.y * vp.zoom + vp.y;
  const right = left + 240 * vp.zoom;
  const bottom = top + 90 * vp.zoom;
  if (
    left < margin ||
    top < margin ||
    right > dim.width - margin ||
    bottom > dim.height - margin
  ) {
    requestFitView();
  }
}

function insertNode(payload: {
  deviceId: string;
  actionName: string;
  param?: Record<string, unknown>;
}) {
  const anchorId = chainAnchorId();
  const id = nextNodeId();
  const position = insertPosition(anchorId);
  addNodes([
    {
      id,
      type: "action",
      position,
      data: {
        deviceId: payload.deviceId,
        actionName: payload.actionName,
        actionType: "goal",
        paramJson: JSON.stringify(payload.param ?? {}, null, 2),
        requirementsJson: "[]",
      },
    },
  ]);
  ensureVisible(position);
  // Dify 式插入即接链：从选中节点（或上一个插入的节点）自动连边
  if (anchorId && liteNodes.value.some((n) => n.id === anchorId)) {
    addEdges([
      {
        id: `e-${anchorId}-${id}`,
        source: anchorId,
        target: id,
        sourceHandle: "out",
        targetHandle: "in",
        type: "smoothstep",
        data: { mappings: [] },
        style: EDGE_STYLE_PLAIN,
      },
    ]);
  }
  lastInsertedId = id;
  commitHistory();
}

// ── 节点检查器 ──

const nodeDrawerOpen = ref(false);
const editingNodeId = ref("");
const editDevice = ref("");
const editAction = ref("");
const editActionType = ref("goal");
const editParam = ref("{}");
const useRequirements = ref(false);
const reqTemplate = ref("");
const reqQuantity = ref<number | null>(null);
const reqUnit = ref("");

const variableNodes = computed<VariableNode[]>(() =>
  liteNodes.value.map((node) => ({
    id: node.id,
    label: `${node.id} · ${String(node.data.actionName ?? "未命名动作")}`,
    paramJson: String(node.data.paramJson ?? "{}"),
  })),
);

// ── 动作参数表单：schema 识别 + placeholder 动态可填项（核心逻辑抽到
//    features/action-param-form.ts，与 DevicesView 单点动作同源复用） ──

const paramForm = useActionParamForm({
  api: () => conn.api,
  device: editDevice,
  action: editAction,
  paramJson: editParam,
  active: () => nodeDrawerOpen.value || nodePanelOpen.value,
  isFocused: (path) => Boolean(focusedVariable(path)),
  onParamWritten: (path, value) => {
    if (path) {
      const variable = focusedVariable(path);
      if (variable) variable.value = cloneJson(value);
    }
    applyPanelParamToNode();
  },
  onError: (text) => message.error(text),
  onSuccess: (text) => message.success(text),
});
const { showAllParams } = paramForm;
const loadActionPlaceholders = paramForm.reload;

// ── 卡片「还差 N 项」徽标 + 试运行：共享动作 schema 缓存 ──
//
// 同一 device|action 只请求一次（负缓存 null 表示不可用），懒加载 + 并发上限，
// 画布节点再多也不会每帧重算或重复请求；统计口径见 param-completeness.ts。

const actionSchemaCache = ref(new Map<string, DeviceActionSchemaDetail | null>());
const schemaInFlight = new Set<string>();
const SCHEMA_FETCH_CONCURRENCY = 4;

function schemaDetailFromCapability(
  capability: RuntimeActionCapability,
): DeviceActionSchemaDetail | null {
  const detail = actionSchemaDetailFromCapability(capability);
  return detail.schema ? detail : null;
}

let runtimeCapabilityIndexPromise: Promise<Map<string, RuntimeActionCapability>> | null = null;

async function runtimeActionSchema(
  device: string,
  action: string,
): Promise<DeviceActionSchemaDetail | null> {
  runtimeCapabilityIndexPromise ??= conn.api.domains.runtimeV1.endpoints().then((endpoints) =>
    new Map(
      endpoints
        .flatMap((endpoint) => endpoint.action_capabilities)
        .filter((capability) => capability.state === "active")
        .map((capability) => [
          `${capability.device_uuid}|${capability.action_name}`,
          capability,
        ]),
    ),
  );
  try {
    const capability = (await runtimeCapabilityIndexPromise).get(`${device}|${action}`);
    return capability ? schemaDetailFromCapability(capability) : null;
  } catch (error) {
    runtimeCapabilityIndexPromise = null;
    throw error;
  }
}

async function ensureActionSchemas(keys: readonly string[]): Promise<void> {
  const pending = [...new Set(keys)].filter((key) => {
    const [device, action] = key.split("|");
    return (
      Boolean(device && action) &&
      !actionSchemaCache.value.has(key) &&
      !schemaInFlight.has(key)
    );
  });
  if (!pending.length) return;
  for (const key of pending) schemaInFlight.add(key);
  let cursor = 0;
  const worker = async () => {
    while (cursor < pending.length) {
      const key = pending[cursor++];
      const [device, action] = key.split("|");
      let detail: DeviceActionSchemaDetail | null = null;
      try {
        detail = await runtimeActionSchema(device, action);
      } catch {
        detail = null;
      }
      const map = new Map(actionSchemaCache.value);
      map.set(key, detail);
      actionSchemaCache.value = map;
      schemaInFlight.delete(key);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(SCHEMA_FETCH_CONCURRENCY, pending.length) }, worker),
  );
}

/** 画布上出现过的 device|action 对（computed 只访问 data 字段，拖动不触发）。 */
const canvasSchemaKeys = computed<string[]>(() => {
  const keys = new Set<string>();
  for (const node of liteNodes.value) {
    if ((node.type ?? "action") !== "action") continue;
    const device = String(node.data.deviceId ?? "");
    const action = String(node.data.actionName ?? "");
    if (device && action) keys.add(`${device}|${action}`);
  }
  return [...keys].sort();
});

let schemaPrefetchTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => canvasSchemaKeys.value.join(","),
  () => {
    if (schemaPrefetchTimer) clearTimeout(schemaPrefetchTimer);
    schemaPrefetchTimer = setTimeout(() => {
      void ensureActionSchemas(canvasSchemaKeys.value);
    }, 300);
  },
  { immediate: true },
);

// 离线期间缓存的负结果（null）在调度器恢复在线后清掉重拉，
// 避免徽标/试运行一直停留在「schema 不可用」的退化口径。
watch(
  () => conn.schedulerOnline,
  (online) => {
    if (!online) return;
    const entries = [...actionSchemaCache.value].filter(([, detail]) => detail !== null);
    if (entries.length === actionSchemaCache.value.size) return;
    actionSchemaCache.value = new Map(entries);
    void ensureActionSchemas(canvasSchemaKeys.value);
  },
);

/** 各节点被上游 @@@ 映射覆盖的写入路径（targetKey 最后一段）。 */
const mappedPathsByNode = computed<Map<string, string[]>>(() => {
  const map = new Map<string, string[]>();
  for (const edge of liteEdges.value) {
    for (const mapping of edge.data?.mappings ?? []) {
      const segments = mapping.targetKey.split("@@@");
      const path = (segments[segments.length - 1] ?? "").trim();
      if (!path) continue;
      const list = map.get(edge.target) ?? [];
      list.push(path);
      map.set(edge.target, list);
    }
  }
  return map;
});

/** 每个动作节点的未填参数数：provide 给 ActionNode 渲染「还差 N 项」。 */
const missingParamCounts = computed<Map<string, number>>(() => {
  const counts = new Map<string, number>();
  for (const node of liteNodes.value) {
    if ((node.type ?? "action") !== "action") continue;
    const device = String(node.data.deviceId ?? "");
    const action = String(node.data.actionName ?? "");
    counts.set(
      node.id,
      missingParamEntries({
        detail: actionSchemaCache.value.get(`${device}|${action}`) ?? null,
        paramJson: String(node.data.paramJson ?? "{}"),
        mappedPaths: mappedPathsByNode.value.get(node.id) ?? [],
      }).length,
    );
  }
  return counts;
});
provide(MISSING_PARAM_COUNTS_KEY, missingParamCounts);

function focusedVariable(path: string): WorkflowVariable | undefined {
  return workflowVariables.value.find(
    (variable) =>
      variable.nodeId === editingNodeId.value && variable.path === path,
  );
}

function focusParameter(field: ParameterField): void {
  if (focusedVariable(field.path)) return;
  const id = variableId(editingNodeId.value, field.path);
  updateVariables([
    ...workflowVariables.value,
    {
      id,
      label: field.path.split(".").at(-1) || field.path,
      nodeId: editingNodeId.value,
      path: field.path,
      type: field.type,
      group: field.type.startsWith("list:") ? "default" : undefined,
      value: cloneJson(field.value),
    },
  ]);
}

function unfocusParameter(path: string): void {
  workflowVariables.value = workflowVariables.value.filter(
    (variable) =>
      variable.nodeId !== editingNodeId.value || variable.path !== path,
  );
  saveDraftSoon();
}

function editFieldInParameterTable(field: ParameterField): void {
  focusParameter(field);
  nodeDrawerOpen.value = false;
  variablesDrawerOpen.value = true;
}

function updateVariables(next: WorkflowVariable[]): void {
  workflowVariables.value = alignListGroups(next);
  syncVariablesToNodes();
  commitHistory("variables");
  saveDraftSoon();
}

function syncVariablesToNodes(): void {
  for (const node of liteNodes.value) {
    const variables = workflowVariables.value.filter(
      (variable) => variable.nodeId === node.id,
    );
    if (!variables.length) continue;
    try {
      node.data.paramJson = JSON.stringify(
        applyVariablesToParam(String(node.data.paramJson ?? "{}"), variables),
        null,
        2,
      );
    } catch {
      // 节点高级 JSON 尚未修复时，不覆盖用户输入。
    }
  }
}

/** 装载节点编辑状态（浮层与抽屉共用），返回是否命中节点。 */
function initNodeEditing(nodeId: string): boolean {
  const target = liteNodes.value.find((n) => n.id === nodeId);
  if (!target) return false;
  editingNodeId.value = target.id;
  editDevice.value = String(target.data.deviceId ?? "");
  editAction.value = String(target.data.actionName ?? "");
  editActionType.value = String(target.data.actionType ?? "goal");
  const variables = workflowVariables.value.filter(
    (variable) => variable.nodeId === target.id,
  );
  try {
    editParam.value = JSON.stringify(
      applyVariablesToParam(String(target.data.paramJson ?? "{}"), variables),
      null,
      2,
    );
  } catch {
    editParam.value = String(target.data.paramJson ?? "{}");
  }
  try {
    const reqs = JSON.parse(String(target.data.requirementsJson ?? "[]"));
    useRequirements.value = Array.isArray(reqs) && reqs.length > 0;
    if (useRequirements.value) {
      reqTemplate.value = String(reqs[0].template_id ?? "");
      reqQuantity.value = Number(reqs[0].quantity ?? 0) || null;
      reqUnit.value = String(reqs[0].unit ?? "");
    } else {
      reqTemplate.value = "";
      reqQuantity.value = null;
      reqUnit.value = "";
    }
  } catch {
    useRequirements.value = false;
  }
  showAllParams.value = false;
  return true;
}

/** 后备入口：节点全部设置抽屉（设备/动作/物料需求/高级 JSON）。 */
function openNodeInspector(nodeId: string) {
  if (!initNodeEditing(nodeId)) return;
  closeNodePanel();
  nodeDrawerOpen.value = true;
  void loadActionPlaceholders();
}

// 浮层/抽屉内改设备/动作后的 schema 重识别（400ms 防抖）由 paramForm 内部 watch 负责。

onNodeClick(({ node }) => {
  // 组框 / 循环框只做选中 / 拖动，操作都在它自己的标题栏按钮上
  if (isContainerNode(node)) return;
  if (node.type === "slot") {
    openSlotFill(String(node.id));
    return;
  }
  if (node.type === "manual" || node.type === "branch") {
    openSpecialEditor(String(node.id));
    return;
  }
  openNodePanel(String(node.id));
});

// ── 节点参数浮层（hover-tip 式，锚定节点顶部；替代抽屉成为参数主入口） ──

const nodePanelOpen = ref(false);
const nodePanelPinned = ref(false);
let nodePanelDirty = false;

/**
 * 浮层锚点：节点顶边中点的屏幕坐标（跟随画布缩放/平移/拖动）。
 * 同时按画布可视区计算可用高度（maxHeight，浮层内部滚动）并把水平位置
 * 钳制在画布内；上方空间不足时向下翻转（below）。
 */
const nodePanelAnchor = computed(() => {
  if (!nodePanelOpen.value) return null;
  const node = flow.findNode(editingNodeId.value);
  if (!node) return null;
  const vp = flow.viewport.value;
  const width = node.dimensions?.width || 220;
  const height = node.dimensions?.height || 72;
  const wrapWidth = canvasWrapRef.value?.clientWidth ?? 0;
  const wrapHeight = canvasWrapRef.value?.clientHeight ?? 0;
  const margin = 12;
  const arrowGap = 14;
  const anchorX = (node.position.x + width / 2) * vp.zoom + vp.x;
  const nodeTop = node.position.y * vp.zoom + vp.y;
  const nodeBottom = (node.position.y + height) * vp.zoom + vp.y;
  // 上/下可用空间；上方装不下一个合理高度的浮层时向下翻转
  const spaceAbove = nodeTop - arrowGap - margin;
  const spaceBelow = wrapHeight - nodeBottom - arrowGap - margin;
  const below = spaceAbove < 320 && spaceBelow > spaceAbove;
  const maxHeight = Math.max(180, Math.floor(below ? spaceBelow : spaceAbove));
  // 水平钳制：浮层（translate -50%）整体保持在画布可视范围内
  const panelWidth = Math.min(620, Math.max(wrapWidth - margin * 2, 0));
  const minX = margin + panelWidth / 2;
  const maxX = Math.max(wrapWidth - margin - panelWidth / 2, minX);
  const x = wrapWidth ? Math.min(Math.max(anchorX, minX), maxX) : anchorX;
  return { x, y: nodeTop, below, nodeBottom, maxHeight };
});

function openNodePanel(nodeId: string) {
  closeNodePanel();
  if (!initNodeEditing(nodeId)) return;
  nodeDrawerOpen.value = false;
  nodePanelPinned.value = false;
  pendingBindSource.value = null;
  nodePanelDirty = false;
  nodePanelOpen.value = true;
  void loadActionPlaceholders();
  void loadUpstreamFields();
}

function closeNodePanel() {
  if (!nodePanelOpen.value) return;
  if (nodePanelDirty) {
    commitHistory();
    nodePanelDirty = false;
  }
  nodePanelOpen.value = false;
  nodePanelPinned.value = false;
  pendingBindSource.value = null;
}

// 点画布空白处关闭浮层（图钉固定时保留）
flow.onPaneClick(() => {
  if (!nodePanelPinned.value) closeNodePanel();
});

/** 浮层内的字段编辑即时写回节点（hover-tip 交互没有「保存」步骤）。 */
function applyPanelParamToNode(): void {
  if (!nodePanelOpen.value) return;
  const target = liteNodes.value.find((n) => n.id === editingNodeId.value);
  if (!target) return;
  target.data.paramJson = editParam.value;
  nodePanelDirty = true;
  saveDraftSoon();
}

// ── 浮层左栏：上游节点输出字段 ──

interface UpstreamSource {
  nodeId: string;
  edgeId: string;
  label: string;
  device: string;
  action: string;
}

const upstreamSources = computed<UpstreamSource[]>(() => {
  if (!nodePanelOpen.value) return [];
  const seen = new Map<string, UpstreamSource>();
  for (const edge of liteEdges.value) {
    if (edge.target !== editingNodeId.value) continue;
    if (seen.has(edge.source)) continue;
    const node = liteNodes.value.find((n) => n.id === edge.source);
    if (!node || (node.type ?? "action") !== "action") continue;
    seen.set(edge.source, {
      nodeId: node.id,
      edgeId: edge.id,
      label: String(node.data.actionName ?? node.id),
      device: String(node.data.deviceId ?? ""),
      action: String(node.data.actionName ?? ""),
    });
  }
  return [...seen.values()];
});

interface UpstreamFieldEntry {
  key: string;
  label: string;
}

const upstreamFields = ref<
  Map<string, { loading: boolean; fields: UpstreamFieldEntry[] }>
>(new Map());
let upstreamLoadSeq = 0;

function upstreamFieldsFor(nodeId: string): UpstreamFieldEntry[] {
  return upstreamFields.value.get(nodeId)?.fields ?? [];
}

function upstreamFieldsLoading(nodeId: string): boolean {
  return upstreamFields.value.get(nodeId)?.loading ?? false;
}

/** 拉取动作的输出字段候选（registry 输出 handle data_key + result schema 顶层字段）。
 *  执行时下游取值根是上游返回值本身，候选只含“返回值里面的内容”，
 *  不含 result / return_value 这类外层包装名。 */
async function fetchActionOutputFields(
  device: string,
  action: string,
): Promise<UpstreamFieldEntry[]> {
  if (!device || !action) return [];
  const entries = new Map<string, UpstreamFieldEntry>();
  try {
    const detail = await runtimeActionSchema(device, action);
    // registry 输出 handle：data_key 即父节点返回值上的 gjson 取值路径
    const handles = detail?.handles as
      | { output?: { data_key?: string; label?: string }[] }
      | undefined;
    for (const handle of handles?.output ?? []) {
      const key = String(handle.data_key ?? "").trim();
      if (key) entries.set(key, { key, label: String(handle.label ?? "") });
    }
    const resultNode = (detail?.schema?.properties as
      | Record<string, { properties?: Record<string, unknown> }>
      | undefined)?.result;
    for (const key of Object.keys(resultNode?.properties ?? {})) {
      if (!entries.has(key)) entries.set(key, { key, label: "" });
    }
  } catch {
    // schema 不可用 → 空候选，调用方展示空态
  }
  return [...entries.values()];
}

/** 每次打开浮层实时拉取各上游动作的输出 schema（registry handles + result 字段）。 */
async function loadUpstreamFields(): Promise<void> {
  const seq = ++upstreamLoadSeq;
  const sources = upstreamSources.value;
  const next = new Map<string, { loading: boolean; fields: UpstreamFieldEntry[] }>();
  for (const source of sources) {
    next.set(source.nodeId, { loading: true, fields: [] });
  }
  upstreamFields.value = next;
  await Promise.all(
    sources.map(async (source) => {
      const entries = new Map<string, UpstreamFieldEntry>();
      // 已用过的 sourceKey 始终可复用
      for (const edge of liteEdges.value) {
        if (edge.source !== source.nodeId) continue;
        for (const mapping of edge.data?.mappings ?? []) {
          if (mapping.sourceKey) {
            entries.set(mapping.sourceKey, { key: mapping.sourceKey, label: "已用" });
          }
        }
      }
      for (const field of await fetchActionOutputFields(source.device, source.action)) {
        if (!entries.has(field.key)) entries.set(field.key, field);
      }
      if (seq !== upstreamLoadSeq) return;
      const map = new Map(upstreamFields.value);
      map.set(source.nodeId, { loading: false, fields: [...entries.values()] });
      upstreamFields.value = map;
    }),
  );
}

// ── 浮层映射：左侧字段 → 右侧参数（写回边 mappings，提交时生成 handles） ──

const pendingBindSource = ref<{ nodeId: string; edgeId: string; key: string } | null>(
  null,
);

function pickBindSource(source: UpstreamSource, key: string): void {
  if (
    pendingBindSource.value &&
    pendingBindSource.value.nodeId === source.nodeId &&
    pendingBindSource.value.key === key
  ) {
    pendingBindSource.value = null;
    return;
  }
  pendingBindSource.value = { nodeId: source.nodeId, edgeId: source.edgeId, key };
}

/** 把选中的上游字段绑定到本节点参数（targetPath 为参数 dot 路径）。 */
function bindPendingTo(targetPath: string): void {
  const pending = pendingBindSource.value;
  if (!pending) return;
  const edge = liteEdges.value.find((e) => e.id === pending.edgeId);
  if (!edge) {
    pendingBindSource.value = null;
    return;
  }
  const mappings = [...(edge.data?.mappings ?? [])];
  if (
    mappings.some((m) => m.sourceKey === pending.key && m.targetKey === targetPath)
  ) {
    message.info("该映射已存在");
    pendingBindSource.value = null;
    return;
  }
  mappings.push({ sourceKey: pending.key, targetKey: targetPath });
  writeEdgeMappings(edge, mappings);
  pendingBindSource.value = null;
  message.success(`已绑定 ${pending.key} -> ${targetPath}`);
}

function writeEdgeMappings(edge: LiteEdge, mappings: ParamMapping[]): void {
  edge.data = { ...(edge.data ?? {}), mappings };
  edge.label = mappingLabel(mappings);
  edge.style = mappings.length ? EDGE_STYLE_MAPPED : EDGE_STYLE_PLAIN;
  commitHistory();
  saveDraftSoon();
}

interface PanelMappingRow {
  edgeId: string;
  index: number;
  sourceNodeLabel: string;
  sourceKey: string;
  /** targetKey 按 @@@ 拆成分段：前 n-1 段是继续下钻的 gjson 取值键，最后一段是 sjson 写入路径。 */
  targetSegments: string[];
}

const panelMappingRows = computed<PanelMappingRow[]>(() => {
  if (!nodePanelOpen.value) return [];
  const rows: PanelMappingRow[] = [];
  for (const edge of liteEdges.value) {
    if (edge.target !== editingNodeId.value) continue;
    const sourceNode = liteNodes.value.find((n) => n.id === edge.source);
    (edge.data?.mappings ?? []).forEach((mapping, index) => {
      rows.push({
        edgeId: edge.id,
        index,
        sourceNodeLabel: String(sourceNode?.data.actionName ?? edge.source),
        sourceKey: mapping.sourceKey,
        targetSegments: mapping.targetKey.split("@@@"),
      });
    });
  }
  return rows;
});

/** 正在内联编辑的映射分段：segIndex = -1 表示源路径，>=0 表示 target 第 n 段。 */
const editingSegment = ref<{ edgeId: string; index: number; segIndex: number } | null>(
  null,
);
const segmentDraft = ref("");

function isEditingSegment(row: PanelMappingRow, segIndex: number): boolean {
  const cur = editingSegment.value;
  return (
    !!cur && cur.edgeId === row.edgeId && cur.index === row.index && cur.segIndex === segIndex
  );
}

function beginSegmentEdit(row: PanelMappingRow, segIndex: number): void {
  editingSegment.value = { edgeId: row.edgeId, index: row.index, segIndex };
  segmentDraft.value =
    segIndex === -1 ? row.sourceKey : row.targetSegments[segIndex] ?? "";
}

function commitSegmentEdit(): void {
  const cur = editingSegment.value;
  if (!cur) return;
  const edge = liteEdges.value.find((e) => e.id === cur.edgeId);
  const mappings = [...(edge?.data?.mappings ?? [])];
  const mapping = mappings[cur.index];
  editingSegment.value = null;
  if (!edge || !mapping) return;
  const draft = segmentDraft.value.trim();
  if (cur.segIndex === -1) {
    if (!draft || draft === mapping.sourceKey) return;
    mappings[cur.index] = { ...mapping, sourceKey: draft };
  } else {
    const segments = mapping.targetKey.split("@@@");
    if (cur.segIndex >= segments.length) {
      // 追加分段：原末段前移为下钻键，新段成为 sjson 写入路径
      if (!draft) return;
      segments.push(draft);
    } else if (draft) {
      segments[cur.segIndex] = draft;
    } else {
      if (segments.length <= 1) return;
      segments.splice(cur.segIndex, 1);
    }
    const nextKey = segments.join("@@@");
    if (nextKey === mapping.targetKey) return;
    mappings[cur.index] = { ...mapping, targetKey: nextKey };
  }
  writeEdgeMappings(edge, mappings);
}

/** 在 target 路径末尾追加一个 @@@ 分段（提交编辑后才写回边）。 */
function appendSegment(row: PanelMappingRow): void {
  editingSegment.value = {
    edgeId: row.edgeId,
    index: row.index,
    segIndex: row.targetSegments.length,
  };
  segmentDraft.value = "";
}

function removeMappingRow(row: PanelMappingRow): void {
  const edge = liteEdges.value.find((e) => e.id === row.edgeId);
  if (!edge) return;
  const mappings = [...(edge.data?.mappings ?? [])];
  mappings.splice(row.index, 1);
  writeEdgeMappings(edge, mappings);
}

function saveNode() {
  const target = liteNodes.value.find((n) => n.id === editingNodeId.value);
  if (!target) return;
  try {
    JSON.parse(editParam.value);
  } catch {
    message.error("参数不是合法 JSON");
    return;
  }
  const requirements =
    useRequirements.value && reqTemplate.value && reqQuantity.value
      ? [{ template_id: reqTemplate.value, quantity: reqQuantity.value, unit: reqUnit.value }]
      : [];
  target.data.deviceId = editDevice.value;
  target.data.actionName = editAction.value;
  target.data.actionType = editActionType.value;
  target.data.paramJson = editParam.value;
  target.data.requirementsJson = JSON.stringify(requirements);
  nodeDrawerOpen.value = false;
  commitHistory();
  saveDraftSoon();
}

function deleteNode() {
  removeNodes([editingNodeId.value], true);
  workflowVariables.value = workflowVariables.value.filter(
    (variable) => variable.nodeId !== editingNodeId.value,
  );
  nodeDrawerOpen.value = false;
  commitHistory();
  saveDraftSoon();
}

// ── 连线检查器（参数传递） ──

const edgeDrawerOpen = ref(false);
const editingEdgeId = ref("");
const editingEdgeDesc = ref("");
const editingEdgeSource = ref("");
const editingEdgeTarget = ref("");
const edgeMappings = ref<ParamMapping[]>([]);

const edgeSourceNode = computed(() =>
  liteNodes.value.find((node) => node.id === editingEdgeSource.value),
);
const edgeTargetNode = computed(() =>
  liteNodes.value.find((node) => node.id === editingEdgeTarget.value),
);
/** 源节点动作的输出字段候选（打开连线检查器时异步拉取）。 */
const edgeSourceSchemaFields = ref<UpstreamFieldEntry[]>([]);

const edgeSourcePathOptions = computed(() => {
  // 候选 = 已用的 sourceKey + 上游输出 schema 字段（返回值里面的内容）
  const known = new Set(
    edgeMappings.value.map((mapping) => mapping.sourceKey).filter(Boolean),
  );
  for (const field of edgeSourceSchemaFields.value) known.add(field.key);
  return [...known].map((path) => ({ label: path, value: path }));
});
const edgeTargetPathOptions = computed(() => {
  const known = new Set(
    edgeMappings.value.map((mapping) => mapping.targetKey).filter(Boolean),
  );
  if (edgeTargetNode.value) {
    try {
      for (const field of flattenParameterFields(
        parseNodeParam(String(edgeTargetNode.value.data.paramJson ?? "{}")),
      )) {
        known.add(field.path);
      }
    } catch {
      // 高级 JSON 非法时仍允许用户手动输入路径。
    }
  }
  return [...known].map((path) => ({ label: path, value: path }));
});

function openEdgeInspector(edgeId: string) {
  const target = liteEdges.value.find((e) => e.id === edgeId);
  if (!target) return;
  editingEdgeId.value = target.id;
  const srcNode = liteNodes.value.find((n) => n.id === target.source);
  const dstNode = liteNodes.value.find((n) => n.id === target.target);
  editingEdgeSource.value = target.source;
  editingEdgeTarget.value = target.target;
  editingEdgeDesc.value = `${srcNode?.data.actionName ?? target.source} -> ${dstNode?.data.actionName ?? target.target}`;
  edgeMappings.value = (target.data?.mappings ?? []).map((m) => ({ ...m }));
  edgeSourceSchemaFields.value = [];
  if (srcNode && (srcNode.type ?? "action") === "action") {
    void fetchActionOutputFields(
      String(srcNode.data.deviceId ?? ""),
      String(srcNode.data.actionName ?? ""),
    ).then((fields) => {
      if (editingEdgeId.value === target.id) edgeSourceSchemaFields.value = fields;
    });
  }
  edgeDrawerOpen.value = true;
}

onEdgeClick(({ edge }) => openEdgeInspector(String(edge.id)));

function addMapping() {
  edgeMappings.value.push({ sourceKey: "", targetKey: "" });
}

function removeMapping(index: number) {
  edgeMappings.value.splice(index, 1);
}

function saveEdge() {
  const target = liteEdges.value.find((e) => e.id === editingEdgeId.value);
  if (!target) return;
  const mappings = edgeMappings.value
    .map((m) => ({ sourceKey: m.sourceKey.trim(), targetKey: m.targetKey.trim() }))
    .filter((m) => m.sourceKey && m.targetKey);
  target.data = { ...(target.data ?? {}), mappings };
  target.label = mappingLabel(mappings);
  target.style = mappings.length ? EDGE_STYLE_MAPPED : EDGE_STYLE_PLAIN;
  edgeDrawerOpen.value = false;
  commitHistory();
  saveDraftSoon();
}

function deleteEdge() {
  removeEdges([editingEdgeId.value]);
  edgeDrawerOpen.value = false;
  commitHistory();
  saveDraftSoon();
}

// ── dagre 一键布局 ──

/**
 * 一键布局：循环框是 dagre 的复合节点（成员是它的子节点），布局后成员位置换成相对循环框，
 * 循环框尺寸按 dagre 算出的簇大小再留出标题栏。组框不参与（只是可见边界），布局后按成员撑大。
 */
function autoLayout() {
  const nodes = liteNodes.value.filter((n) => !isGroupNode(n));
  const byId = new Map(liteNodes.value.map((n) => [n.id, n] as const));
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: "LR", nodesep: 46, ranksep: 92 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.id, { width: 220, height: 72 });
  for (const n of nodes) {
    const loop = nearestLoopAncestor(n.id, byId);
    if (loop) g.setParent(n.id, loop);
  }
  for (const e of liteEdges.value) {
    if (g.hasNode(e.source) && g.hasNode(e.target)) g.setEdge(e.source, e.target);
  }
  dagre.layout(g);
  // 循环框：簇的外接框再向上留出标题栏；成员相对循环框左上角
  const loopFrames = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const n of nodes) {
    if (!isLoopNode(n)) continue;
    const cluster = g.node(n.id);
    if (!cluster) continue;
    const width = Math.max(cluster.width ?? 0, 260) + GROUP_PADDING * 2;
    const height = Math.max(cluster.height ?? 0, 72) + LOOP_HEADER_HEIGHT + GROUP_PADDING * 2;
    loopFrames.set(n.id, {
      x: cluster.x - width / 2,
      y: cluster.y - height / 2,
      width,
      height,
    });
  }
  const absoluteOf = (id: string): { x: number; y: number } => {
    const frame = loopFrames.get(id);
    if (frame) return { x: frame.x, y: frame.y };
    const pos = g.node(id);
    return { x: (pos?.x ?? 0) - 110, y: (pos?.y ?? 0) - 36 };
  };
  for (const n of nodes) {
    const absolute = absoluteOf(n.id);
    const loop = nearestLoopAncestor(n.id, byId);
    const parentFrame = loop ? loopFrames.get(loop) : undefined;
    const position = parentFrame
      ? { x: absolute.x - parentFrame.x, y: absolute.y - parentFrame.y }
      : absolute;
    const patch: Record<string, unknown> = { position };
    const frame = loopFrames.get(n.id);
    if (frame) patch.style = frameStyle(frame);
    // 循环体成员从组框里出来了（布局按循环层级重排），组框成员关系只保留到循环框那一层
    if (n.parentNode && !loop && isGroupNode(byId.get(n.parentNode) ?? {})) {
      const group = byId.get(n.parentNode)!;
      const groupAbsolute = absolutePosition(group);
      patch.position = { x: absolute.x - groupAbsolute.x, y: absolute.y - groupAbsolute.y };
    }
    flow.updateNode(n.id, patch as Parameters<typeof flow.updateNode>[1]);
  }
  for (const group of liteNodes.value.filter((n) => isGroupNode(n))) fitGroupToMembers(group.id);
  void nextTick(() => fitView({ padding: 0.2 }));
  commitHistory();
  saveDraftSoon();
}

// ── 草稿自动保存 ──

type Draft = {
  workflowId: string;
  workflowName?: string;
  priority: string;
  /** 已提交到权威的定义 uuid（再提交即更新）。 */
  authorityWorkflowUuid?: string;
  variables?: WorkflowVariable[];
  nodes: {
    id: string;
    type?: string;
    x: number;
    y: number;
    /** 组内成员：所属组框 id（x/y 为组内相对坐标） */
    parentNode?: string;
    /** 组框尺寸 */
    width?: number;
    height?: number;
    data: Record<string, unknown>;
  }[];
  edges: {
    id: string;
    source: string;
    target: string;
    sourceHandle?: string;
    mappings: ParamMapping[];
  }[];
};

/** 草稿 / 历史里的节点 → Vue Flow 节点：容器（组框 / 循环框）先于成员，成员挂回父节点。 */
function hydrateDraftNodes(nodes: Draft["nodes"]): FlowNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const ordered = [...nodes].sort((a, b) => containerDepth(a.id, byId) - containerDepth(b.id, byId));
  return ordered.map((n) => {
    const base: FlowNode = {
      id: n.id,
      type: n.type ?? "action",
      position: { x: n.x, y: n.y },
      data: n.data,
    };
    if (isContainerNode(n)) {
      // 容器不能被 Delete 键直接删掉（成员会成孤儿）：解组 / 解开 / 删除整组走标题栏按钮
      base.style = frameStyle({ width: n.width ?? 0, height: n.height ?? 0 });
      base.deletable = false;
    }
    return n.parentNode ? { ...base, parentNode: n.parentNode, expandParent: true } : base;
  });
}

function snapshotDraft(): Draft {
  return {
    workflowId: workflowId.value,
    workflowName: workflowName.value,
    priority: priority.value,
    authorityWorkflowUuid: authorityWorkflowUuid.value || undefined,
    variables: cloneJson(workflowVariables.value),
    nodes: liteNodes.value.map((n) => {
      const entry: Draft["nodes"][number] = {
        id: n.id,
        type: n.type ?? "action",
        x: n.position.x,
        y: n.position.y,
        data: { ...n.data },
      };
      if (n.parentNode) entry.parentNode = n.parentNode;
      if (isContainerNode(n)) {
        const size = frameSize(n.style);
        entry.width = size.width;
        entry.height = size.height;
      }
      return entry;
    }),
    edges: liteEdges.value.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? "out",
      mappings: e.data?.mappings ?? [],
    })),
  };
}

let draftTimer: ReturnType<typeof setTimeout> | null = null;

function flushDraftNow() {
  draftTimer = null;
  localStorage.setItem(DRAFT_KEY, JSON.stringify(snapshotDraft()));
  draftSavedAt.value = Date.now();
}

function saveDraftSoon() {
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(flushDraftNow, 500);
}

// 防抖窗口内切走页面也不丢最后一笔编辑
onUnmounted(() => {
  if (draftTimer) {
    clearTimeout(draftTimer);
    flushDraftNow();
  }
});

// 节点拖动 / 增删 / 连线都会反映在 getNodes/getEdges 上，深度监听统一触发
watch([() => flow.getNodes.value, () => flow.getEdges.value], saveDraftSoon, { deep: true });
watch([workflowId, workflowName, priority], saveDraftSoon);
watch(workflowVariables, saveDraftSoon, { deep: true });

// ── 撤销 / 重做 ──
//
// 历史记录图结构 + 置顶变量（不含 workflowId/priority）。提交经 nextTick 合并：
// 一次删除引发的“级联删边 + 删节点”只落一条历史，撤销一步即可完整回来。

type GraphState = {
  variables: WorkflowVariable[];
  nodes: Draft["nodes"];
  edges: Draft["edges"];
};

const HISTORY_LIMIT = 60;
const undoStack = ref<string[]>([]); // 栈顶 = 当前状态
const redoStack = ref<string[]>([]);
let restoringHistory = false;
let commitScheduled = false;
let pendingCommitTag = "graph";
let lastCommitTag = "";
let lastCommitAt = 0;

const canUndo = computed(() => undoStack.value.length > 1);
const canRedo = computed(() => redoStack.value.length > 0);

function graphState(): GraphState {
  const draft = snapshotDraft();
  return { variables: draft.variables ?? [], nodes: draft.nodes, edges: draft.edges };
}

function commitNow(tag: string) {
  if (restoringHistory) return;
  const snap = JSON.stringify(graphState());
  if (snap === undoStack.value.at(-1)) return;
  const now = Date.now();
  // 变量表里的连续键入合并为一条历史，避免每个字符占一步
  if (
    tag === "variables" &&
    lastCommitTag === "variables" &&
    now - lastCommitAt < 1200 &&
    undoStack.value.length > 1
  ) {
    undoStack.value[undoStack.value.length - 1] = snap;
  } else {
    undoStack.value.push(snap);
    if (undoStack.value.length > HISTORY_LIMIT) undoStack.value.shift();
  }
  redoStack.value = [];
  lastCommitTag = tag;
  lastCommitAt = now;
}

function commitHistory(tag = "graph") {
  if (restoringHistory) return;
  pendingCommitTag = tag;
  if (commitScheduled) return;
  commitScheduled = true;
  void nextTick(() => {
    commitScheduled = false;
    commitNow(pendingCommitTag);
  });
}

function applyGraphState(snap: string) {
  const state = JSON.parse(snap) as GraphState;
  restoringHistory = true;
  nodeDrawerOpen.value = false;
  edgeDrawerOpen.value = false;
  workflowVariables.value = normalizeVariables(state.variables);
  setNodes(hydrateDraftNodes(state.nodes));
  setEdges(
    state.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || "out",
      targetHandle: "in",
      type: "smoothstep",
      data: { mappings: e.mappings },
      label: mappingLabel(e.mappings),
      style: e.mappings.length ? EDGE_STYLE_MAPPED : EDGE_STYLE_PLAIN,
    })),
  );
  if (!state.nodes.some((n) => n.id === lastInsertedId)) {
    lastInsertedId = state.nodes.at(-1)?.id ?? "";
  }
  void nextTick(() => {
    restoringHistory = false;
  });
  saveDraftSoon();
}

function undo() {
  if (!canUndo.value) return;
  redoStack.value.push(undoStack.value.pop()!);
  applyGraphState(undoStack.value.at(-1)!);
}

function redo() {
  if (!canRedo.value) return;
  const snap = redoStack.value.pop()!;
  undoStack.value.push(snap);
  applyGraphState(snap);
}

function resetHistory() {
  undoStack.value = [JSON.stringify(graphState())];
  redoStack.value = [];
  lastCommitTag = "";
  lastCommitAt = 0;
}

// ── 复制 / 粘贴 / 副本 ──

type ClipboardPayload = {
  nodes: {
    id: string;
    type?: string;
    x: number;
    y: number;
    /** 循环体成员：所在循环也在剪贴板里时保留归属（x/y 为相对坐标） */
    parentNode?: string;
    /** 循环框尺寸 */
    width?: number;
    height?: number;
    data: Record<string, unknown>;
  }[];
  edges: {
    source: string;
    target: string;
    sourceHandle?: string;
    mappings: ParamMapping[];
  }[];
};

const clipboard = ref<ClipboardPayload | null>(null);
let pasteRound = 0;

function selectedLiteNodes(): LiteNode[] {
  return flow.getSelectedNodes.value as unknown as LiteNode[];
}

/** 复制选中节点（或指定 id），同时带上它们内部的连线与传参映射；选中循环框即连同整个循环体。 */
function copySelection(nodeIds?: string[]): boolean {
  const initial = nodeIds?.length
    ? liteNodes.value.filter((n) => nodeIds.includes(n.id))
    : selectedLiteNodes();
  if (!initial.length) return false;
  // 组框不进剪贴板（只是画布边界）；循环框连同全部成员（含嵌套）
  const picked: LiteNode[] = [];
  const queue = initial.filter((n) => !isGroupNode(n));
  const idSet = new Set<string>();
  while (queue.length) {
    const node = queue.shift()!;
    if (idSet.has(node.id)) continue;
    idSet.add(node.id);
    picked.push(node);
    if (isLoopNode(node)) queue.push(...liteNodes.value.filter((n) => n.parentNode === node.id));
  }
  if (!picked.length) return false;
  clipboard.value = {
    nodes: picked.map((n) => {
      // 父级也被复制时保留相对坐标与归属，否则用绝对坐标落到顶层
      const keepParent = Boolean(n.parentNode && idSet.has(n.parentNode));
      const position = keepParent ? n.position : absolutePosition(n);
      const entry: ClipboardPayload["nodes"][number] = {
        id: n.id,
        type: n.type ?? "action",
        x: position.x,
        y: position.y,
        data: cloneJson({ ...n.data }),
      };
      if (keepParent) entry.parentNode = n.parentNode;
      if (isLoopNode(n)) {
        const size = frameSize(n.style);
        entry.width = size.width;
        entry.height = size.height;
      }
      return entry;
    }),
    edges: liteEdges.value
      .filter((e) => idSet.has(e.source) && idSet.has(e.target))
      .map((e) => ({
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? "out",
        mappings: cloneJson(e.data?.mappings ?? []),
      })),
  };
  pasteRound = 0;
  return true;
}

/** 复制/重复出来的是新的图实体，不能继承原节点的权威 UUID。 */
function cloneNodeDataForNewInstance(
  data: Record<string, unknown>,
): Record<string, unknown> {
  const cloned = cloneJson(data);
  // 即使原节点尚未提交、没有 uuid，也在复制时先建立新实体身份；
  // 提交层仍会再次校验图内及跨 Workflow 的 UUID 冲突。
  cloned.uuid = newNodeUuid();
  return cloned;
}

function pasteClipboard() {
  const payload = clipboard.value;
  if (!payload?.nodes.length) {
    message.info("剪贴板为空：先选中节点按 Ctrl+C 复制");
    return;
  }
  pasteRound += 1;
  const offset = 48 * pasteRound;
  removeSelectedNodes(flow.getSelectedNodes.value);
  const idMap = new Map<string, string>();
  for (const n of payload.nodes) idMap.set(n.id, nextNodeId());
  const byId = new Map(payload.nodes.map((n) => [n.id, n] as const));
  // 父级（循环框）先进节点表
  const ordered = [...payload.nodes].sort((a, b) => containerDepth(a.id, byId) - containerDepth(b.id, byId));
  const newNodes = ordered.map((n) => {
    const id = idMap.get(n.id)!;
    const parent = n.parentNode ? idMap.get(n.parentNode) : undefined;
    const node: Record<string, unknown> = {
      id,
      type: n.type ?? "action",
      // 成员相对父级，不再平移
      position: parent ? { x: n.x, y: n.y } : { x: n.x + offset, y: n.y + offset },
      data: cloneNodeDataForNewInstance(n.data),
      selected: true,
    };
    if (parent) {
      node.parentNode = parent;
      node.expandParent = true;
    }
    if (isLoopNode(n)) {
      node.style = frameStyle({ width: n.width ?? 320, height: n.height ?? 160 });
      node.deletable = false;
    }
    return node as { id: string; type: string; position: { x: number; y: number }; data: Record<string, unknown> };
  });
  addNodes(newNodes);
  addEdges(
    payload.edges.map((e, i) => ({
      id: `e-paste-${Date.now()}-${i}`,
      source: idMap.get(e.source)!,
      target: idMap.get(e.target)!,
      sourceHandle: e.sourceHandle || "out",
      targetHandle: "in",
      type: "smoothstep",
      data: { mappings: cloneJson(e.mappings) },
      label: mappingLabel(e.mappings),
      style: e.mappings.length ? EDGE_STYLE_MAPPED : EDGE_STYLE_PLAIN,
    })),
  );
  lastInsertedId = newNodes.at(-1)?.id ?? lastInsertedId;
  commitHistory();
  message.success(`已粘贴 ${newNodes.length} 个节点`);
}

function duplicateNodes(nodeIds?: string[]) {
  if (copySelection(nodeIds)) pasteClipboard();
  else message.info("先选中要创建副本的节点");
}

// ── 右键菜单 ──

const ctxMenu = ref({
  show: false,
  x: 0,
  y: 0,
  kind: "pane" as "node" | "edge" | "pane",
  targetId: "",
});

const ctxOptions = computed(() => {
  if (ctxMenu.value.kind === "node") {
    const target = liteNodes.value.find((n) => n.id === ctxMenu.value.targetId);
    const nodeType = target?.type ?? "action";
    if (target && isGroupNode(target)) {
      // 组框不是动作节点：只有解组 / 删除整组（"删除节点"对 deletable:false 的组框是空操作）
      return [
        { label: "解组（保留成员）", key: "group-ungroup" },
        { type: "divider" as const, key: "d1" },
        { label: "删除整组", key: "group-delete" },
      ];
    }
    if (target && isLoopNode(target)) {
      return [
        { label: "编辑循环", key: "loop-edit" },
        { label: "包成循环…（嵌套）", key: "node-wrap-loop" },
        { label: "创建副本（含循环体）", key: "node-duplicate" },
        { label: "断开所有连线", key: "node-disconnect" },
        { type: "divider" as const, key: "d1" },
        { label: "解开循环（保留成员）", key: "loop-dissolve" },
        { label: "删除循环及成员", key: "loop-delete" },
      ];
    }
    // 放入 / 移出循环：成员看所在循环，非成员列出画布上的循环
    const loopId = target ? nearestLoopAncestor(target.id, new Map(liteNodes.value.map((n) => [n.id, n]))) : undefined;
    const loopTargets = liteNodes.value
      .filter((n) => isLoopNode(n) && n.id !== loopId)
      .map((n) => ({ label: String(n.data.label || describeLoopNode(n.data as Partial<LoopNodeData>)), key: `loop-move:${n.id}` }));
    const loopItems = [
      { label: "包成循环…", key: "node-wrap-loop", disabled: nodeType === "branch" },
      ...(loopTargets.length ? [{ label: "放入循环", key: "loop-move-menu", children: loopTargets }] : []),
      ...(loopId ? [{ label: "移出循环", key: "loop-move-out" }] : []),
    ];
    if (nodeType === "slot") {
      return [
        { label: "填充空位", key: "node-fill" },
        { label: "创建副本", key: "node-duplicate" },
        { label: "重复片段 ×N…", key: "node-repeat" },
        ...loopItems,
        { label: "断开所有连线", key: "node-disconnect" },
        { type: "divider" as const, key: "d1" },
        { label: "删除空位", key: "node-delete" },
      ];
    }
    return [
      { label: "编辑节点", key: "node-edit" },
      { label: "创建副本", key: "node-duplicate" },
      { label: "重复片段 ×N…", key: "node-repeat", disabled: nodeType === "branch" },
      ...loopItems,
      { label: "断开所有连线", key: "node-disconnect" },
      { type: "divider" as const, key: "d1" },
      { label: "删除节点", key: "node-delete" },
    ];
  }
  if (ctxMenu.value.kind === "edge") {
    return [
      { label: "配置参数传递", key: "edge-edit" },
      { type: "divider" as const, key: "d1" },
      { label: "删除连线", key: "edge-delete" },
    ];
  }
  return [
    { label: "粘贴", key: "pane-paste", disabled: !clipboard.value },
    { label: "自动布局", key: "pane-layout", disabled: !nodeCount.value },
    { label: "适应画布", key: "pane-fit", disabled: !nodeCount.value },
  ];
});

function openCtxMenu(kind: "node" | "edge" | "pane", targetId: string, event: MouseEvent) {
  event.preventDefault();
  ctxMenu.value = { show: true, x: event.clientX, y: event.clientY, kind, targetId };
}

onNodeContextMenu(({ event, node }) =>
  openCtxMenu("node", String(node.id), event as MouseEvent),
);
onEdgeContextMenu(({ event, edge }) =>
  openCtxMenu("edge", String(edge.id), event as MouseEvent),
);
onPaneContextMenu((event) => openCtxMenu("pane", "", event as MouseEvent));

function disconnectNode(nodeId: string) {
  const touching = liteEdges.value
    .filter((e) => e.source === nodeId || e.target === nodeId)
    .map((e) => e.id);
  if (!touching.length) {
    message.info("该节点没有连线");
    return;
  }
  removeEdges(touching);
  commitHistory();
}

/** 右键作用范围：目标节点在多选里就是整个多选，否则只是它自己。 */
function selectionOr(nodeId: string): string[] {
  const selected = flow.getSelectedNodes.value.map((n) => String(n.id));
  return selected.includes(nodeId) && selected.length > 1 ? selected : [nodeId];
}

function onCtxSelect(key: string) {
  const id = ctxMenu.value.targetId;
  ctxMenu.value.show = false;
  if (key.startsWith("loop-move:")) {
    moveNodesIntoLoop(selectionOr(id), key.slice("loop-move:".length));
    return;
  }
  switch (key) {
    case "node-edit": {
      const nodeType = liteNodes.value.find((n) => n.id === id)?.type ?? "action";
      if (nodeType === "manual" || nodeType === "branch") openSpecialEditor(id);
      else openNodeInspector(id);
      break;
    }
    case "node-fill":
      openSlotFill(id);
      break;
    case "node-repeat":
      openRepeatModal(id);
      break;
    case "node-duplicate":
      duplicateNodes([id]);
      break;
    case "node-disconnect":
      disconnectNode(id);
      break;
    case "node-delete":
      removeNodes([id], true);
      break;
    case "group-ungroup":
      ungroup(id);
      break;
    case "group-delete":
      removeGroup(id);
      break;
    case "loop-edit":
      openLoopEditor({ kind: "edit", nodeId: id });
      break;
    case "node-wrap-loop":
      openWrapLoopModal(id);
      break;
    case "loop-dissolve":
      dissolveLoop(id);
      break;
    case "loop-delete":
      removeLoop(id);
      break;
    case "loop-move-out":
      moveNodesOutOfLoop(selectionOr(id));
      break;
    case "edge-edit":
      openEdgeInspector(id);
      break;
    case "edge-delete":
      removeEdges([id]);
      break;
    case "pane-paste":
      pasteClipboard();
      break;
    case "pane-layout":
      autoLayout();
      break;
    case "pane-fit":
      void fitView({ padding: 0.2, duration: 250 });
      break;
  }
}

// ── 快捷键：撤销/重做/复制/粘贴/副本 ──

function isTypingTarget(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable;
}

function onEditorKeydown(e: KeyboardEvent) {
  if (isTypingTarget(e.target)) return;
  if ((e.key === "Delete" || e.key === "Backspace") && !e.ctrlKey && !e.metaKey) {
    // 组框是 deletable:false（Vue Flow 的 Delete 不带子节点删除，删了父节点会留下孤儿成员），
    // 所以 Vue Flow 对选中的组框什么都不做。只选了组框时按 Delete → 走"删除整组"确认。
    const selected = flow.getSelectedNodes.value;
    if (selected.length && selected.every((n) => isContainerNode(n))) {
      e.preventDefault();
      for (const container of selected) {
        if (isLoopNode(container)) removeLoop(String(container.id));
        else removeGroup(String(container.id));
      }
    }
    return;
  }
  if (!(e.ctrlKey || e.metaKey)) return;
  const key = e.key.toLowerCase();
  if (key === "z" && !e.shiftKey) {
    e.preventDefault();
    undo();
  } else if ((key === "z" && e.shiftKey) || key === "y") {
    e.preventDefault();
    redo();
  } else if (key === "c") {
    if (window.getSelection()?.toString()) return; // 文本复制让浏览器处理
    if (copySelection()) {
      e.preventDefault();
      message.success("已复制选中节点");
    }
  } else if (key === "v") {
    if (clipboard.value) {
      e.preventDefault();
      pasteClipboard();
    }
  } else if (key === "d") {
    e.preventDefault();
    duplicateNodes();
  }
}

// ── 导出 / 导入工作流 JSON ──

const importInputRef = ref<HTMLInputElement | null>(null);

function exportDraftFile() {
  if (!nodeCount.value) {
    message.warning("画布为空，没有可导出的内容");
    return;
  }
  const blob = new Blob([JSON.stringify(snapshotDraft(), null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${workflowName.value || workflowId.value || "workflow"}.openlab.json`;
  a.click();
  URL.revokeObjectURL(url);
  message.success("已导出当前画布");
}

function printDraft() {
  if (!nodeCount.value) {
    message.warning("画布为空，没有可打印的实验草稿");
    return;
  }
  const session = beginWorkflowPrint();
  if (!session) {
    message.warning("浏览器拦截了打印窗口，请允许本站打开弹窗后重试");
    return;
  }
  session.complete({
    domainName: domain.config.name,
    workflowName: workflowName.value || "未命名工作流草稿",
    workflowUuid: workflowId.value || "local-draft",
    runMode: priority.value,
    status: "local draft · not submitted",
    nodeCount: nodeCount.value,
    edgeCount: liteEdges.value.length,
  });
}

function importDraftFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  void file.text().then((text) => {
    try {
      const draft = JSON.parse(text) as Draft;
      if (!Array.isArray(draft.nodes) || !draft.nodes.length) {
        throw new Error("文件里没有节点");
      }
      restoreDraft(draft);
      saveDraftSoon();
      message.success(`已导入 ${draft.nodes.length} 个节点`);
    } catch (err) {
      message.error(`导入失败：${describeError(err)}`);
    }
  });
}

// ── 工作流模板：内置 + 用户模板、嵌套展开、空位（slot）填充 ──

const USER_TEMPLATE_KEY = "unilab-edge-ui:user-templates";

const userTemplates = ref<WorkflowTemplate[]>([]);

function loadUserTemplates(): void {
  try {
    const parsed = JSON.parse(localStorage.getItem(USER_TEMPLATE_KEY) ?? "[]");
    userTemplates.value = Array.isArray(parsed) ? (parsed as WorkflowTemplate[]) : [];
  } catch {
    userTemplates.value = [];
  }
}

function persistUserTemplates(): void {
  localStorage.setItem(USER_TEMPLATE_KEY, JSON.stringify(userTemplates.value));
}

/**
 * 设备包模板：驱动包里 `@workflow` 声明、随注册表上报到调度权威
 * （registry 域）。接远端调度权威的受控 Edge 没有该域 → 静默为空。
 */
const registryTemplates = ref<WorkflowTemplate[]>([]);

async function loadRegistryTemplates(): Promise<void> {
  try {
    const { templates } = await conn.api.domains.registry.workflowTemplates();
    registryTemplates.value = templates.map(templateFromRegistry);
  } catch {
    registryTemplates.value = [];
  }
}

const templateRegistry = computed(() =>
  buildTemplateRegistry(userTemplates.value, registryTemplates.value),
);
const templateList = computed(() => [...templateRegistry.value.values()]);

const slotCount = computed(
  () => liteNodes.value.filter((n) => n.type === "slot").length,
);

// 角色映射弹窗（插入模板 / 用模板填充空位共用）：设备 chip 平铺点选，无下拉
const roleModalOpen = ref(false);
const roleSelections = ref<Record<string, string>>({});
const pendingRoles = ref<TemplateRole[]>([]);
const pendingTemplateId = ref("");
const pendingFillSlotId = ref("");
const roleDeviceOptions = ref<{ label: string; value: string; className: string }[]>([]);
/** 正在插入的模板的运行前准备（设备包 @workflow guide.preparation），角色弹窗里先提醒。 */
const pendingTemplatePreparation = computed(
  () => templateRegistry.value.get(pendingTemplateId.value)?.guide?.preparation ?? [],
);

async function loadRoleDeviceOptions(): Promise<void> {
  try {
    const endpoints = await conn.api.domains.runtimeV1.endpoints();
    const byId = new Map<string, string>();
    for (const route of endpoints
      .filter((endpoint) => endpoint.state === "online")
      .flatMap((endpoint) => endpoint.device_routes)
      .filter((route) => route.enabled && route.selected)) {
      const config = (route.config ?? {}) as Record<string, unknown>;
      const className = typeof config.registry_name === "string" ? config.registry_name : "";
      if (!byId.has(route.device_uuid)) byId.set(route.device_uuid, className);
    }
    roleDeviceOptions.value = [...byId].map(([key, className]) => ({
      label: key,
      value: key,
      className,
    }));
  } catch {
    roleDeviceOptions.value = [];
  }
}

/** 拖放插入模板时的落点（beginTemplateUse → materializeTemplate 间传递）。 */
let pendingTemplateOrigin: { x: number; y: number } | null = null;

/** 模板使用入口：先展开校验（环/缺模板即时报错），有角色先弹映射，没有直接落布。 */
function beginTemplateUse(
  templateId: string,
  fillSlotId = "",
  origin: { x: number; y: number } | null = null,
) {
  canvasMenu.value = null;
  let roles: TemplateRole[];
  try {
    expandTemplate(templateId, templateRegistry.value);
    roles = collectRoles(templateId, templateRegistry.value);
  } catch (err) {
    message.error(describeError(err));
    return;
  }
  pendingTemplateId.value = templateId;
  pendingFillSlotId.value = fillSlotId;
  pendingTemplateOrigin = origin;
  if (!roles.length) {
    materializeTemplate(templateId, {}, fillSlotId);
    return;
  }
  pendingRoles.value = roles;
  roleSelections.value = {};
  void loadRoleDeviceOptions().then(() => {
    const candidates: RoleDeviceCandidate[] = roleDeviceOptions.value.map((o) => ({
      id: o.value,
      className: o.className || undefined,
    }));
    const selections: Record<string, string> = {};
    for (const role of roles) selections[role.role] = suggestDeviceForRole(role, candidates);
    roleSelections.value = selections;
    roleModalOpen.value = true;
  });
}

function confirmRoleModal() {
  roleModalOpen.value = false;
  materializeTemplate(
    pendingTemplateId.value,
    { ...roleSelections.value },
    pendingFillSlotId.value,
  );
}

/** 展开图里一个节点布局后的框：绝对坐标（归一化到 (0,0)），循环框带宽高。 */
type ExpansionFrame = { x: number; y: number; width: number; height: number };

/**
 * 展开图的 dagre 布局，归一化到 (0,0) 由调用方平移。
 * 循环节点是复合节点（成员是它的子节点），布局后循环框取簇外接框再留出标题栏。
 */
function layoutExpansion(
  nodes: ExpandedNode[],
  edges: ExpandedEdge[],
): Map<string, ExpansionFrame> {
  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: "LR", nodesep: 46, ranksep: 92 });
  g.setDefaultEdgeLabel(() => ({}));
  for (const n of nodes) g.setNode(n.key, { width: 220, height: 72 });
  for (const n of nodes) if (n.parent) g.setParent(n.key, n.parent);
  for (const e of edges) g.setEdge(e.source, e.target);
  dagre.layout(g);
  const frames = new Map<string, ExpansionFrame>();
  for (const n of nodes) {
    const p = g.node(n.key);
    if (n.type === "loop") {
      const width = Math.max(p.width ?? 0, 260) + GROUP_PADDING * 2;
      const height = Math.max(p.height ?? 0, 72) + LOOP_HEADER_HEIGHT + GROUP_PADDING * 2;
      frames.set(n.key, { x: p.x - width / 2, y: p.y - height / 2, width, height });
    } else {
      frames.set(n.key, { x: p.x - 110, y: p.y - 36, width: 220, height: 72 });
    }
  }
  let minX = Infinity;
  let minY = Infinity;
  for (const frame of frames.values()) {
    minX = Math.min(minX, frame.x);
    minY = Math.min(minY, frame.y);
  }
  for (const frame of frames.values()) {
    frame.x -= minX;
    frame.y -= minY;
  }
  return frames;
}

function expandedNodeData(
  node: ExpandedNode,
  mapping: Record<string, string>,
  resolveNodeId: (key: string) => string | undefined = () => undefined,
): Record<string, unknown> {
  if (node.type === "slot") {
    return { slotLabel: node.slotLabel ?? "空位", slotHint: node.slotHint ?? "" };
  }
  if (node.type === "loop") {
    return loopNodeDataFromSpec(node.loopSpec, node.name ?? "", resolveNodeId) as unknown as Record<string, unknown>;
  }
  return {
    deviceId: mapping[node.role ?? ""] ?? "",
    deviceRole: node.role ?? "",
    actionName: node.actionName ?? "",
    actionType: "goal",
    paramJson: JSON.stringify(node.param ?? {}, null, 2),
    requirementsJson: JSON.stringify(node.inventoryRequirements ?? []),
  };
}

function templateEdgeProps(mappings: ParamMapping[]) {
  return {
    sourceHandle: "out",
    targetHandle: "in",
    type: "smoothstep",
    data: { mappings },
    label: mappingLabel(mappings),
    style: mappings.length ? EDGE_STYLE_MAPPED : EDGE_STYLE_PLAIN,
  };
}

/** 把模板展开落到画布：fillSlotId 非空 = 替换该空位并重接其上下游。 */
function materializeTemplate(
  templateId: string,
  mapping: Record<string, string>,
  fillSlotId: string,
) {
  let graph: { nodes: ExpandedNode[]; edges: ExpandedEdge[] };
  try {
    graph = expandTemplate(templateId, templateRegistry.value);
  } catch (err) {
    message.error(describeError(err));
    return;
  }
  if (!graph.nodes.length) {
    message.warning("模板是空的");
    return;
  }
  const layout = layoutExpansion(graph.nodes, graph.edges);
  const template = templateRegistry.value.get(templateId);

  const slot = fillSlotId
    ? liteNodes.value.find((n) => n.id === fillSlotId)
    : undefined;
  const dropOrigin = pendingTemplateOrigin;
  pendingTemplateOrigin = null;
  let originX = 80;
  let originY = 120;
  if (slot) {
    const slotAbsolute = absolutePosition(slot);
    originX = slotAbsolute.x;
    originY = slotAbsolute.y;
  } else if (dropOrigin) {
    originX = dropOrigin.x;
    originY = dropOrigin.y;
  } else {
    const others = liteNodes.value.filter((n) => !isGroupNode(n));
    if (others.length) {
      originX = Math.max(...others.map((n) => absolutePosition(n).x)) + INSERT_GAP_X;
    }
  }

  // 成组：填的是某个组里的空位就并入那个组，否则新建一个以模板命名的组框包住全部成员。
  // 成员位置相对组框；拖成员到边缘组框跟着长（expandParent），拖组框整块一起动。
  const joinGroupId = slot?.parentNode ?? "";
  const groupId = joinGroupId || `g-${Date.now()}`;
  let childOffset = { x: 0, y: 0 };
  let groupNode: {
    id: string;
    type: string;
    position: { x: number; y: number };
    style: Record<string, string>;
    data: Record<string, unknown>;
  } | null = null;
  if (joinGroupId) {
    const group = liteNodes.value.find((n) => n.id === joinGroupId);
    const groupAbsolute = group ? absolutePosition(group) : { x: 0, y: 0 };
    childOffset = { x: originX - groupAbsolute.x, y: originY - groupAbsolute.y };
  } else {
    // 组框只需装下顶层框（循环框已包住自己的成员）
    const topFrames = graph.nodes.filter((n) => !n.parent).map((n) => layout.get(n.key)!);
    const frame = frameForLayout(
      { x: originX, y: originY },
      topFrames.map((f) => ({ x: f.x + f.width - 220, y: f.y + f.height - 72 })),
    );
    childOffset = frame.childOffset;
    const groupData: GroupNodeData = {
      groupName: template?.name ?? templateId,
      groupDescription: template?.description ?? "",
      templateId,
    };
    groupNode = {
      id: groupId,
      type: GROUP_NODE_TYPE,
      position: frame.position,
      style: frameStyle(frame),
      data: groupData as unknown as Record<string, unknown>,
    };
  }

  const idMap = new Map<string, string>();
  for (const n of graph.nodes) idMap.set(n.key, n.type === "loop" ? newLoopNodeId() : nextNodeId());
  const resolveExpandedRef = (key: string) => idMap.get(key);
  // 父节点（循环框）先于成员进节点表
  const depthOf = (n: ExpandedNode): number => {
    let depth = 0;
    let current = n.parent ? graph.nodes.find((m) => m.key === n.parent) : undefined;
    while (current) {
      depth += 1;
      current = current.parent ? graph.nodes.find((m) => m.key === current!.parent) : undefined;
    }
    return depth;
  };
  const orderedNodes = [...graph.nodes].sort((a, b) => depthOf(a) - depthOf(b));
  const newNodes = orderedNodes.map((n) => {
    const id = idMap.get(n.key)!;
    const frame = layout.get(n.key)!;
    // 循环体成员相对循环框；顶层节点相对组框（childOffset）
    const parentFrame = n.parent ? layout.get(n.parent)! : undefined;
    const position = parentFrame
      ? { x: frame.x - parentFrame.x, y: frame.y - parentFrame.y }
      : { x: childOffset.x + frame.x, y: childOffset.y + frame.y };
    const node: Record<string, unknown> = {
      id,
      type: n.type,
      position,
      parentNode: n.parent ? idMap.get(n.parent)! : groupId,
      expandParent: true,
      data: expandedNodeData(n, mapping, resolveExpandedRef),
    };
    if (n.type === "loop") {
      node.style = frameStyle(frame);
      node.deletable = false;
    }
    return node as { id: string; type: string; position: { x: number; y: number }; parentNode: string; data: Record<string, unknown> };
  });
  const stamp = Date.now();
  const newEdges = graph.edges.map((e, i) => ({
    id: `e-tpl-${stamp}-${i}`,
    source: idMap.get(e.source)!,
    target: idMap.get(e.target)!,
    ...templateEdgeProps(e.mappings),
  }));

  // 拼接只看顶层节点：循环体成员的先后由循环框代表
  const targeted = new Set(graph.edges.map((e) => e.target));
  const sourced = new Set(graph.edges.map((e) => e.source));
  const topLevel = graph.nodes.filter((n) => !n.parent);
  const entries = topLevel
    .filter((n) => !targeted.has(n.key))
    .map((n) => idMap.get(n.key)!);
  const exits = topLevel
    .filter((n) => !sourced.has(n.key))
    .map((n) => idMap.get(n.key)!);

  const spliceEdges: typeof newEdges = [];
  let spliceSeq = 0;
  if (slot) {
    const incoming = liteEdges.value.filter((e) => e.target === slot.id);
    const outgoing = liteEdges.value.filter((e) => e.source === slot.id);
    for (const e of incoming) {
      for (const entry of entries) {
        spliceEdges.push({
          id: `e-fill-${stamp}-${spliceSeq++}`,
          source: e.source,
          target: entry,
          ...templateEdgeProps(e.data?.mappings ?? []),
        });
      }
    }
    for (const e of outgoing) {
      for (const exit of exits) {
        spliceEdges.push({
          id: `e-fill-${stamp}-${spliceSeq++}`,
          source: exit,
          target: e.target,
          ...templateEdgeProps(e.data?.mappings ?? []),
        });
      }
    }
  } else {
    // 普通插入：恰有一个选中节点时自动接链到模板全部入口
    const selected = flow.getSelectedNodes.value;
    if (selected.length === 1) {
      const src = String(selected[0].id);
      for (const entry of entries) {
        spliceEdges.push({
          id: `e-chain-${stamp}-${spliceSeq++}`,
          source: src,
          target: entry,
          ...templateEdgeProps([]),
        });
      }
    }
  }

  if (slot) removeNodes([slot.id], true);
  // 父节点必须先于成员进入节点表
  addNodes(groupNode ? [{ ...groupNode, deletable: false }, ...newNodes] : newNodes);
  addEdges([...newEdges, ...spliceEdges]);
  if (joinGroupId) fitGroupToMembers(joinGroupId);
  lastInsertedId = exits.at(-1) ?? newNodes.at(-1)!.id;
  slotFillOpen.value = false;
  requestFitView();
  commitHistory();
  const tplName = template?.name ?? templateId;
  message.success(
    slot ? `已用模板「${tplName}」填充空位` : `已插入模板「${tplName}」（成组）`,
  );
}

// ── 分组：组框操作（GroupNode 经 provide 调回来） ──

/** 成员变多后把组框撑大到能装下全部成员（只增不减）。 */
function fitGroupToMembers(groupId: string) {
  const group = liteNodes.value.find((n) => n.id === groupId);
  if (!group) return;
  // 成员里的循环框按它自己的宽高算，不然组框会夹不住整个循环
  const members = liteNodes.value
    .filter((n) => n.parentNode === groupId)
    .map((n) => ({ position: n.position, ...containerSizeOf(n) }));
  const size = fitFrame(members, frameSize(group.style));
  flow.updateNode(groupId, { style: frameStyle(size) });
}

/**
 * 删掉组框本身。组框建出来时是 deletable:false（Delete 键不能把父节点删掉留下一堆孤儿成员），
 * 而 Vue Flow 的 removeNodes 会跳过 deletable:false 的节点——解组 / 删除整组这两条显式路径
 * 必须先把标记翻回来，否则成员没了、空框还留在画布上。
 */
function removeGroupFrame(groupId: string) {
  if (!flow.findNode(groupId)) return;
  flow.updateNode(groupId, { deletable: true });
  removeNodes([groupId], false);
}

/** 解组：成员位置换算成绝对坐标、脱离父节点，再删掉组框。 */
function ungroup(groupId: string) {
  const members = liteNodes.value.filter((n) => n.parentNode === groupId);
  for (const member of members) {
    const absolute = absolutePosition(member);
    flow.updateNode(member.id, {
      parentNode: undefined,
      expandParent: false,
      position: absolute,
    } as Parameters<typeof flow.updateNode>[1]);
  }
  removeGroupFrame(groupId);
  commitHistory();
  message.success("已解组，成员节点保留");
}

function removeGroup(groupId: string) {
  const group = liteNodes.value.find((n) => n.id === groupId);
  const memberIds = liteNodes.value.filter((n) => n.parentNode === groupId).map((n) => n.id);
  dialog.warning({
    title: "删除整组",
    content: `将删除组「${String(group?.data.groupName ?? groupId)}」及其 ${memberIds.length} 个节点，以及相关连线。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: () => {
      if (memberIds.length) removeNodes(memberIds, true);
      removeGroupFrame(groupId);
      commitHistory();
    },
  });
}

function templateHasGuide(templateId: string): boolean {
  const tpl = templateRegistry.value.get(templateId);
  return Boolean(tpl && hasTemplateGuide(tpl));
}

const guideTemplateId = ref("");
const guideTemplate = computed(() => templateRegistry.value.get(guideTemplateId.value) ?? null);

provide(GROUP_ACTIONS_KEY, {
  hasGuide: templateHasGuide,
  showGuide: (templateId: string) => {
    guideTemplateId.value = templateId;
  },
  ungroup,
  removeGroup,
});

// ── 循环容器：包成循环 / 放入 / 移出 / 解开 / 删除 / 编辑 ──
//
// 循环框是 Vue Flow 父节点（成员 position 相对于它），也是图结构：有 in/out handle，提交为
// type=loop 节点，成员带 parent_uuid。跨边界的连线在包 / 解开时改接到循环框上，运行时后端
// 把它翻译成"循环整体先于/后于外部节点"。

const LOOP_MIN_SIZE = { width: 320, height: 160 };

function nodeById(id: string): LiteNode | undefined {
  return liteNodes.value.find((n) => n.id === id);
}

function loopMemberIds(loopId: string): string[] {
  return liteNodes.value.filter((n) => n.parentNode === loopId).map((n) => n.id);
}

function liteNodeMap(): Map<string, LiteNode> {
  return new Map(liteNodes.value.map((n) => [n.id, n]));
}

/** 若干节点的公共直接父级（都在同一容器里或都在顶层）；不一致返回 null。 */
function commonParentOf(nodes: LiteNode[]): { parent?: string } | null {
  const parents = new Set(nodes.map((n) => n.parentNode ?? ""));
  if (parents.size !== 1) return null;
  const parent = [...parents][0];
  return { parent: parent || undefined };
}

/** 一组节点（绝对坐标）的外接框，向上留出循环标题栏。 */
function frameAround(nodes: LiteNode[]): { x: number; y: number; width: number; height: number } {
  const positions = nodes.map((n) => ({ ...absolutePosition(n), size: containerSizeOf(n) }));
  const minX = Math.min(...positions.map((p) => p.x));
  const minY = Math.min(...positions.map((p) => p.y));
  const maxX = Math.max(...positions.map((p) => p.x + p.size.width));
  const maxY = Math.max(...positions.map((p) => p.y + p.size.height));
  return {
    x: minX - GROUP_PADDING,
    y: minY - LOOP_HEADER_HEIGHT - GROUP_PADDING,
    width: Math.max(LOOP_MIN_SIZE.width, maxX - minX + GROUP_PADDING * 2),
    height: Math.max(LOOP_MIN_SIZE.height, maxY - minY + LOOP_HEADER_HEIGHT + GROUP_PADDING * 2),
  };
}

function containerSizeOf(node: LiteNode): { width: number; height: number } {
  if (isContainerNode(node)) {
    const size = frameSize(node.style);
    if (size.width && size.height) return size;
  }
  return { width: 220, height: 72 };
}

/** 成员变多后把循环框撑大到能装下全部成员（只增不减）。 */
function fitLoopToMembers(loopId: string) {
  const loop = nodeById(loopId);
  if (!loop) return;
  const members = liteNodes.value.filter((n) => n.parentNode === loopId);
  const size = fitFrame(
    members.map((n) => ({ position: n.position, ...containerSizeOf(n) })),
    frameSize(loop.style),
  );
  flow.updateNode(loopId, { style: frameStyle(size) });
}

/**
 * 把节点挂到（或脱离）容器：position 在绝对坐标与相对坐标间换算，父级为空即顶层。
 * 调用方保证父级已在节点表里。
 */
function reparentNode(nodeId: string, parentId: string | undefined) {
  const node = nodeById(nodeId);
  if (!node) return;
  const absolute = absolutePosition(node);
  const parent = parentId ? nodeById(parentId) : undefined;
  const parentAbsolute = parent ? absolutePosition(parent) : { x: 0, y: 0 };
  flow.updateNode(nodeId, {
    parentNode: parentId,
    expandParent: Boolean(parentId),
    position: { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y },
  } as Parameters<typeof flow.updateNode>[1]);
}

/** 跨循环边界的连线：进循环体的改接到循环框入口，出循环体的改从循环框出口发出。 */
function rewireEdgesToContainer(memberIds: Set<string>, loopId: string) {
  const stamp = Date.now();
  let seq = 0;
  const toRemove: string[] = [];
  const toAdd: Parameters<typeof addEdges>[0] = [];
  const seen = new Set<string>();
  for (const e of liteEdges.value) {
    const inside = memberIds.has(e.source);
    const outside = memberIds.has(e.target);
    if (inside === outside) continue;
    toRemove.push(e.id);
    const source = inside ? loopId : e.source;
    const target = outside ? loopId : e.target;
    if (source === target) continue;
    const key = `${source}->${target}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toAdd.push({
      id: `e-loop-${stamp}-${seq++}`,
      source,
      target,
      ...templateEdgeProps(inside ? [] : cloneJson(e.data?.mappings ?? [])),
    });
  }
  if (toRemove.length) removeEdges(toRemove);
  if (toAdd.length) addEdges(toAdd);
}

/** 解开循环时的反向改线：循环框的入边接到循环体入口，出边从循环体出口发出。 */
function rewireEdgesFromContainer(loopId: string, memberIds: string[]) {
  const memberSet = new Set(memberIds);
  const internalTargets = new Set(liteEdges.value.filter((e) => memberSet.has(e.source) && memberSet.has(e.target)).map((e) => e.target));
  const internalSources = new Set(liteEdges.value.filter((e) => memberSet.has(e.source) && memberSet.has(e.target)).map((e) => e.source));
  const entries = memberIds.filter((id) => !internalTargets.has(id));
  const exits = memberIds.filter((id) => !internalSources.has(id));
  const incoming = liteEdges.value.filter((e) => e.target === loopId);
  const outgoing = liteEdges.value.filter((e) => e.source === loopId);
  const stamp = Date.now();
  let seq = 0;
  const toAdd: Parameters<typeof addEdges>[0] = [];
  for (const e of incoming) {
    for (const entry of entries) {
      toAdd.push({ id: `e-unloop-${stamp}-${seq++}`, source: e.source, target: entry, ...templateEdgeProps([]) });
    }
  }
  for (const e of outgoing) {
    for (const exit of exits) {
      toAdd.push({ id: `e-unloop-${stamp}-${seq++}`, source: exit, target: e.target, ...templateEdgeProps([]) });
    }
  }
  removeEdges([...incoming, ...outgoing].map((e) => e.id));
  if (toAdd.length) addEdges(toAdd);
}

function newLoopNodeId(): string {
  return `loop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

/** 在指定位置放一个空循环框（成员之后用"放入循环"或拖入模板加）。 */
function insertLoopNode(data: LoopNodeData, position: { x: number; y: number }, chainFrom = ""): string {
  const id = newLoopNodeId();
  addNodes([
    {
      id,
      type: LOOP_NODE_TYPE,
      position,
      style: frameStyle(LOOP_MIN_SIZE),
      data: data as unknown as Record<string, unknown>,
      deletable: false,
    },
  ]);
  if (chainFrom && nodeById(chainFrom)) {
    addEdges([{ id: `e-${chainFrom}-${id}`, source: chainFrom, target: id, ...templateEdgeProps([]) }]);
  }
  lastInsertedId = id;
  ensureVisible(position);
  commitHistory();
  return id;
}

/**
 * 把一组节点包成一个新循环：节点成为循环体（同一父级下），跨边界连线改接到循环框。
 * 条件分支节点在提交前会被拼接掉，不能进循环体。
 */
function wrapNodesInLoop(nodeIds: string[], data: LoopNodeData): string | null {
  const seeds = liteNodes.value.filter((n) => nodeIds.includes(n.id) && !isGroupNode(n));
  if (!seeds.length) {
    message.info("先选中要包进循环的节点");
    return null;
  }
  if (seeds.some((n) => n.type === "branch")) {
    message.warning("条件分支节点不能进循环体，请先移出选区");
    return null;
  }
  const common = commonParentOf(seeds);
  if (!common) {
    message.warning("选中的节点必须在同一层级（同一个组 / 循环里，或都在顶层）");
    return null;
  }
  const frame = frameAround(seeds);
  const parent = common.parent ? nodeById(common.parent) : undefined;
  const parentAbsolute = parent ? absolutePosition(parent) : { x: 0, y: 0 };
  const loopId = newLoopNodeId();
  addNodes([
    {
      id: loopId,
      type: LOOP_NODE_TYPE,
      position: { x: frame.x - parentAbsolute.x, y: frame.y - parentAbsolute.y },
      style: frameStyle(frame),
      data: data as unknown as Record<string, unknown>,
      deletable: false,
      ...(common.parent ? { parentNode: common.parent, expandParent: true } : {}),
    },
  ]);
  for (const seed of seeds) {
    const absolute = absolutePosition(seed);
    flow.updateNode(seed.id, {
      parentNode: loopId,
      expandParent: true,
      position: { x: absolute.x - frame.x, y: absolute.y - frame.y },
    } as Parameters<typeof flow.updateNode>[1]);
  }
  rewireEdgesToContainer(new Set(seeds.map((n) => n.id)), loopId);
  if (common.parent && isGroupNode(parent ?? {})) fitGroupToMembers(common.parent);
  lastInsertedId = loopId;
  commitHistory();
  message.success(`已把 ${seeds.length} 个节点包成循环「${data.label}」`);
  return loopId;
}

/** 把节点放进已有的循环：脱离原父级、改挂循环框，连线按边界改接。 */
function moveNodesIntoLoop(nodeIds: string[], loopId: string) {
  const loop = nodeById(loopId);
  if (!loop || !isLoopNode(loop)) return;
  const nodes = liteNodes.value.filter((n) => nodeIds.includes(n.id) && !isGroupNode(n) && n.id !== loopId);
  if (!nodes.length) return;
  if (nodes.some((n) => n.type === "branch")) {
    message.warning("条件分支节点不能进循环体");
    return;
  }
  const byId = liteNodeMap();
  // 不能把循环放进自己的循环体
  for (const node of nodes) {
    if (isLoopNode(node)) {
      let current: string | undefined = loopId;
      while (current) {
        if (current === node.id) {
          message.warning("不能把循环放进它自己的循环体");
          return;
        }
        current = byId.get(current)?.parentNode;
      }
    }
  }
  const loopAbsolute = absolutePosition(loop);
  const loopSize = frameSize(loop.style);
  // 放到循环框标题栏下方，按当前成员数往右排
  const existing = loopMemberIds(loopId).length;
  nodes.forEach((node, index) => {
    const absolute = {
      x: loopAbsolute.x + GROUP_PADDING + (existing + index) * (220 + 32),
      y: loopAbsolute.y + LOOP_HEADER_HEIGHT + GROUP_PADDING,
    };
    flow.updateNode(node.id, {
      parentNode: loopId,
      expandParent: true,
      position: { x: absolute.x - loopAbsolute.x, y: absolute.y - loopAbsolute.y },
    } as Parameters<typeof flow.updateNode>[1]);
  });
  const memberIds = new Set([...loopMemberIds(loopId), ...nodes.map((n) => n.id)]);
  rewireEdgesToContainer(memberIds, loopId);
  void nextTick(() => {
    fitLoopToMembers(loopId);
    if (loopSize.width === 0) fitLoopToMembers(loopId);
  });
  commitHistory();
  message.success(`已把 ${nodes.length} 个节点放入循环`);
}

/** 把循环体成员移出到循环框所在的层级；它与外部的连线改成与循环框断开。 */
function moveNodesOutOfLoop(nodeIds: string[]) {
  const byId = liteNodeMap();
  const moved: string[] = [];
  for (const id of nodeIds) {
    const node = byId.get(id);
    const loopId = node ? nearestLoopAncestor(id, byId) : undefined;
    if (!node || !loopId || node.parentNode !== loopId) continue;
    const loop = byId.get(loopId)!;
    // 成员与循环体内其它节点的连线拆掉（跨边界的边不允许）
    const others = new Set(loopMemberIds(loopId).filter((m) => m !== id));
    removeEdges(
      liteEdges.value
        .filter((e) => (e.source === id && others.has(e.target)) || (e.target === id && others.has(e.source)))
        .map((e) => e.id),
    );
    const absolute = absolutePosition(node);
    const loopAbsolute = absolutePosition(loop);
    const size = frameSize(loop.style);
    const parent = loop.parentNode ? byId.get(loop.parentNode) : undefined;
    const parentAbsolute = parent ? absolutePosition(parent) : { x: 0, y: 0 };
    // 落到循环框下方
    const target = { x: absolute.x, y: loopAbsolute.y + size.height + GROUP_PADDING };
    flow.updateNode(id, {
      parentNode: loop.parentNode,
      expandParent: Boolean(loop.parentNode),
      position: { x: target.x - parentAbsolute.x, y: target.y - parentAbsolute.y },
    } as Parameters<typeof flow.updateNode>[1]);
    moved.push(id);
  }
  if (!moved.length) return;
  commitHistory();
  message.success(`已把 ${moved.length} 个节点移出循环`);
}

/** 解开循环：成员回到循环框所在层级，循环框的连线接回循环体入口/出口，再删掉循环框。 */
function dissolveLoop(loopId: string) {
  const loop = nodeById(loopId);
  if (!loop) return;
  const memberIds = loopMemberIds(loopId);
  rewireEdgesFromContainer(loopId, memberIds);
  for (const id of memberIds) reparentNode(id, loop.parentNode);
  flow.updateNode(loopId, { deletable: true });
  removeNodes([loopId], false);
  if (loop.parentNode && isGroupNode(nodeById(loop.parentNode) ?? {})) fitGroupToMembers(loop.parentNode);
  commitHistory();
  message.success("已解开循环，成员节点保留");
}

function removeLoop(loopId: string) {
  const loop = nodeById(loopId);
  const collect = (id: string): string[] => loopMemberIds(id).flatMap((m) => [m, ...(isLoopNode(nodeById(m) ?? {}) ? collect(m) : [])]);
  const memberIds = collect(loopId);
  const label = String(loop?.data.label ?? loopId);
  dialog.warning({
    title: "删除循环",
    content: `将删除循环「${label}」及其 ${memberIds.length} 个节点，以及相关连线。`,
    positiveText: "删除",
    negativeText: "取消",
    onPositiveClick: () => {
      // 内层容器也是 deletable:false，先翻回来再一起删
      for (const id of [...memberIds, loopId]) {
        if (isContainerNode(nodeById(id) ?? {})) flow.updateNode(id, { deletable: true });
      }
      if (memberIds.length) removeNodes(memberIds, true);
      removeNodes([loopId], true);
      commitHistory();
    },
  });
}

provide(LOOP_ACTIONS_KEY, {
  edit: (loopId: string) => openLoopEditor({ kind: "edit", nodeId: loopId }),
  dissolve: dissolveLoop,
  remove: removeLoop,
  memberCount: (loopId: string) => loopMemberIds(loopId).length,
});

// ── 循环配置弹窗：编辑已有循环 / 包成循环 / 插入空循环 共用一张表单 ──

type LoopEditTarget =
  | { kind: "edit"; nodeId: string }
  | { kind: "wrap"; nodeIds: string[] }
  | { kind: "insert"; position: { x: number; y: number }; chainFrom: string };

const loopEditOpen = ref(false);
const loopEditTarget = ref<LoopEditTarget>({ kind: "insert", position: { x: 0, y: 0 }, chainFrom: "" });
const loopForm = ref<LoopNodeData>(defaultLoopNodeData("for"));

const LOOP_MODE_OPTIONS: { label: string; value: LoopMode }[] = [
  { label: "固定次数 for", value: "for" },
  { label: "按条件 while", value: "while" },
];
const LOOP_SOURCE_OPTIONS: { label: string; value: LoopConditionSource }[] = [
  { label: "设备状态字段", value: "device_state" },
  { label: "某节点的返回值", value: "node_output" },
];
const LOOP_OP_OPTIONS = LOOP_OPS.map((op) => ({ label: op === "exists" ? "存在（非空）" : op, value: op }));

/** 条件可选设备：设备库里的全部设备 id。 */
const loopDeviceOptions = computed(() => libDevices.value.map((id) => ({ label: id, value: id })));

/** 选定设备最近上报的状态字段（telemetry properties，也就是运行时判定读的那份），带当前值；没有就手填。 */
const loopFieldOptions = computed(() => {
  const properties = devicesStore.byId(loopForm.value.deviceId)?.telemetry?.properties ?? {};
  return Object.entries(properties).map(([field, value]) => ({
    label: `${field} = ${typeof value === "string" ? value : JSON.stringify(value)}`,
    value: field,
  }));
});

/** 条件可引用的节点：画布上的设备动作 / 人工确认节点（不含循环框、组框、空位、分支）。 */
const loopNodeOptions = computed(() =>
  liteNodes.value
    .filter((n) => n.type === "action" || n.type === "manual")
    .map((n) => ({
      label:
        n.type === "manual"
          ? `${String(n.data.label ?? "人工确认")} (${n.id})`
          : `${String(n.data.deviceId ?? "?")}/${String(n.data.actionName ?? "?")} (${n.id})`,
      value: n.id,
    })),
);

const loopEditTitle = computed(() => {
  const target = loopEditTarget.value;
  if (target.kind === "edit") return `编辑循环 · ${target.nodeId}`;
  if (target.kind === "wrap") return `把 ${target.nodeIds.length} 个节点包成循环`;
  return "插入循环";
});

function openLoopEditor(target: LoopEditTarget) {
  loopEditTarget.value = target;
  if (target.kind === "edit") {
    const node = nodeById(target.nodeId);
    if (!node) return;
    loopForm.value = { ...defaultLoopNodeData(), ...(node.data as Partial<LoopNodeData>) } as LoopNodeData;
  } else {
    loopForm.value = defaultLoopNodeData("for");
  }
  loopEditOpen.value = true;
}

function onLoopModeChange(mode: LoopMode) {
  const current = loopForm.value;
  const fresh = defaultLoopNodeData(mode);
  // 切换模式时只换默认标签 / 间隔，保留已填的条件字段
  const autoLabel = !current.label || current.label === describeLoopNode(current) || current.label === defaultLoopNodeData(current.mode).label;
  loopForm.value = { ...current, mode, intervalSeconds: fresh.intervalSeconds, label: autoLabel ? fresh.label : current.label };
}

function saveLoopEditor() {
  const form = loopForm.value;
  const data: LoopNodeData = {
    ...form,
    label: form.label.trim() || describeLoopNode(form),
    deviceId: form.deviceId.trim(),
    field: form.field.trim(),
    dataKey: form.dataKey.trim(),
    count: Math.max(1, Math.floor(Number(form.count) || 1)),
    maxIterations: Math.max(1, Math.floor(Number(form.maxIterations) || 1)),
    intervalSeconds: Math.max(0, Number(form.intervalSeconds) || 0),
  };
  if (data.mode === "while") {
    if (data.conditionSource === "device_state" && (!data.deviceId || !data.field)) {
      message.warning("while 循环需要选择设备与状态字段");
      return;
    }
    if (data.conditionSource === "node_output" && !data.conditionNodeId) {
      message.warning("while 循环需要选择被判定的节点");
      return;
    }
    if (data.op !== "exists" && !String(data.value ?? "").trim()) {
      message.warning(`比较运算 ${data.op} 需要对比值`);
      return;
    }
  }
  const target = loopEditTarget.value;
  if (target.kind === "edit") {
    const node = nodeById(target.nodeId);
    if (node) {
      Object.assign(node.data, data);
      commitHistory();
      saveDraftSoon();
    }
  } else if (target.kind === "wrap") {
    if (!wrapNodesInLoop(target.nodeIds, data)) return;
  } else {
    insertLoopNode(data, target.position, target.chainFrom);
  }
  loopEditOpen.value = false;
}

function openWrapLoopModal(nodeId: string) {
  openLoopEditor({ kind: "wrap", nodeIds: selectionOr(nodeId) });
}

// ── 空位填充弹窗 ──

const slotFillOpen = ref(false);
const fillingSlotId = ref("");
const fillingSlotLabel = computed(() => {
  const node = liteNodes.value.find((n) => n.id === fillingSlotId.value);
  return String(node?.data.slotLabel ?? "空位");
});

function openSlotFill(slotId: string) {
  fillingSlotId.value = slotId;
  slotFillOpen.value = true;
}

/** 空位 → 单个节点的原位替换：上下游连线（含传参映射）原样重接。 */
function replaceSlotWithNode(
  slotId: string,
  type: string,
  data: Record<string, unknown>,
  successText: string,
): boolean {
  const slot = liteNodes.value.find((n) => n.id === slotId);
  if (!slot) return false;
  const id = nextNodeId();
  const stamp = Date.now();
  // 空位在组里：替换后的节点留在同一组（相对坐标原样沿用）
  const position = { ...slot.position };
  const grouping = slot.parentNode ? { parentNode: slot.parentNode, expandParent: true } : {};
  const incoming = liteEdges.value.filter((e) => e.target === slot.id);
  const outgoing = liteEdges.value.filter((e) => e.source === slot.id);
  const rewired = [
    ...incoming.map((e, i) => ({
      id: `e-fill-${stamp}-i${i}`,
      source: e.source,
      target: id,
      ...templateEdgeProps(e.data?.mappings ?? []),
      sourceHandle: e.sourceHandle || "out",
    })),
    ...outgoing.map((e, i) => ({
      id: `e-fill-${stamp}-o${i}`,
      source: id,
      target: e.target,
      ...templateEdgeProps(e.data?.mappings ?? []),
    })),
  ];
  removeNodes([slot.id], true);
  addNodes([{ id, type, position, data, ...grouping }]);
  addEdges(rewired);
  slotFillOpen.value = false;
  commitHistory();
  message.success(successText);
  return true;
}

function fillSlotWithAction(payload: {
  deviceId: string;
  actionName: string;
  param?: Record<string, unknown>;
}) {
  const ok = replaceSlotWithNode(
    fillingSlotId.value,
    "action",
    {
      deviceId: payload.deviceId,
      actionName: payload.actionName,
      actionType: "goal",
      paramJson: JSON.stringify(payload.param ?? {}, null, 2),
      requirementsJson: "[]",
    },
    `空位已填充为 ${payload.actionName}`,
  );
  if (!ok) slotFillOpen.value = false;
}

function fillSlotWithTemplate(templateId: string) {
  beginTemplateUse(templateId, fillingSlotId.value);
}

// ── 存为模板 ──

const saveTplOpen = ref(false);
const saveTplName = ref("");
const saveTplDesc = ref("");

function openSaveTemplate() {
  if (!nodeCount.value) {
    message.warning("画布为空，先搭好流程再存模板");
    return;
  }
  canvasMenu.value = null;
  saveTplName.value = "";
  saveTplDesc.value = "";
  saveTplOpen.value = true;
}

function confirmSaveTemplate() {
  const name = saveTplName.value.trim();
  if (!name) {
    message.warning("给模板起个名字");
    return;
  }
  const id = `user-${Date.now()}`;
  const byId = liteNodeMap();
  const tpl = templateFromCanvas(
    { id, name, description: saveTplDesc.value.trim() || `${nodeCount.value} 步流程` },
    // 组框不是步骤：存模板时打平，只保留成员节点；循环框保留，成员记所在循环
    liteNodes.value
      .filter((n) => !isGroupNode(n))
      .map((n) => ({ id: n.id, type: n.type, data: { ...n.data }, parent: nearestLoopAncestor(n.id, byId) })),
    liteEdges.value.map((e) => ({
      source: e.source,
      target: e.target,
      mappings: e.data?.mappings ?? [],
    })),
  );
  userTemplates.value = [...userTemplates.value, tpl];
  persistUserTemplates();
  saveTplOpen.value = false;
  message.success(`模板「${name}」已保存到本地`);
}

function removeUserTemplate(id: string) {
  userTemplates.value = userTemplates.value.filter((t) => t.id !== id);
  persistUserTemplates();
  message.success("模板已删除");
}

// ── 画布节点库：运行时设备/动作能力 ──

// manualConfirmHosts 会在 setup 期间被 watch 立即读取，因此这些 ref 必须先初始化。
// 放在特殊节点派生状态之前，避免 computed 首次求值触发 TDZ。
const {
  loading: libLoading,
  devicesAvailable: libAvailable,
  devices: libDevices,
  hostDevices: libHostDevices,
  actionsOf: libActionsOf,
  load: loadLibrary,
} = useRuntimeActions();

// ── 特殊节点：人工确认（manual_confirm）/ 空位 / 条件分支 ──

const SPECIAL_ITEMS: {
  kind: SpecialKind;
  icon: Component;
  title: string;
  desc: string;
}[] = [
  {
    kind: "manual",
    icon: markRaw(HandRightOutline),
    title: "人工确认",
    desc: "流程走到这里暂停，等人确认后继续",
  },
  {
    kind: "slot",
    icon: markRaw(AddOutline),
    title: "空位",
    desc: "先占个位置，之后再拖动作或模板进来",
  },
  {
    kind: "branch",
    icon: markRaw(GitBranchOutline),
    title: "条件分支 if",
    desc: "按参数真假选一条路走，另一条不执行",
  },
  {
    kind: "loop",
    icon: markRaw(RepeatOutline),
    title: "循环 for / while",
    desc: "框住一段步骤反复执行：固定次数，或按设备状态 / 节点返回值判定",
  },
];

/**
 * 能执行人工确认的执行节点：暴露 `manual_confirm` 动作的 host_node（Host 自己的节点；
 * 多 Host / 多执行节点场景会有多个）。上报了才在「特殊」里放人工确认节点；多个时节点上可选。
 */
const manualConfirmHosts = computed(() =>
  libDevices.value
    .filter((id) => libHostDevices.value.includes(id))
    .filter((id) =>
      (libActionsOf.value[id] ?? []).some(
        (action) => action.action_name === MANUAL_CONFIRM_ACTION,
      ),
    )
    .sort((left, right) => {
      // 默认优先规范 Host 节点；多 Host 时其余节点仍完整保留并可选择。
      if (left === HOST_NODE_ID) return -1;
      if (right === HOST_NODE_ID) return 1;
      return left.localeCompare(right);
    }),
);
const specialItems = computed(() =>
  SPECIAL_ITEMS.filter((item) => item.kind !== "manual" || manualConfirmHosts.value.length > 0).map((item) =>
    item.kind === "manual" && manualConfirmHosts.value.length > 1
      ? { ...item, desc: `${item.desc}；${manualConfirmHosts.value.length} 个执行节点可选` }
      : item,
  ),
);

function specialNodeData(kind: SpecialKind): Record<string, unknown> {
  if (kind === "manual") {
    return {
      label: "人工确认",
      prompt: "",
      hostId: manualConfirmHosts.value[0] ?? HOST_NODE_ID,
      showHost: manualConfirmHosts.value.length > 1,
      assignees: [],
      assigneesConfigured: true,
      timeoutSeconds: DEFAULT_MANUAL_CONFIRM_TIMEOUT_S,
    };
  }
  if (kind === "branch") return { variableId: "", op: "==", value: "" };
  if (kind === "loop") return defaultLoopNodeData("for") as unknown as Record<string, unknown>;
  return { slotLabel: "空位", slotHint: "" };
}

/** 人工节点必须落到当前 runtime.v1 已上报的 host_node 上。 */
function ensureManualConfirmHostAvailable(): boolean {
  if (manualConfirmHosts.value.length > 0) return true;
  message.warning("当前没有上报 manual_confirm 的 host_node，人工确认暂不可用");
  return false;
}

// 执行节点集合变化（Slave 上下线 / 新 Host 接入）时，同步节点卡片上"是否标出执行节点"
watch(manualConfirmHosts, (hosts) => {
  for (const node of liteNodes.value) {
    if (node.type !== "manual") continue;
    node.data.showHost = hosts.length > 1;
    const current = String(node.data.hostId ?? "");
    if (hosts.length && !hosts.includes(current)) node.data.hostId = hosts[0];
  }
});

/** 在指定位置放一个节点；chainFrom 非空则自动从该节点接链。 */
function placeNode(
  type: string,
  data: Record<string, unknown>,
  position: { x: number; y: number },
  chainFrom = "",
): string {
  const id = nextNodeId();
  addNodes([{ id, type, position, data }]);
  if (chainFrom && liteNodes.value.some((n) => n.id === chainFrom)) {
    addEdges([
      {
        id: `e-${chainFrom}-${id}`,
        source: chainFrom,
        target: id,
        ...templateEdgeProps([]),
      },
    ]);
  }
  lastInsertedId = id;
  ensureVisible(position);
  commitHistory();
  return id;
}

function insertSpecial(kind: SpecialKind) {
  if (kind === "manual" && !ensureManualConfirmHostAvailable()) return;
  const anchorId = chainAnchorId();
  if (kind === "loop") {
    // 有多选就直接把选中的节点包成循环，否则插一个空循环框（先配参数）
    const selected = flow.getSelectedNodes.value.map((n) => String(n.id)).filter((id) => !isGroupNode(nodeById(id) ?? {}));
    if (selected.length > 1 || (selected.length === 1 && !isLoopNode(nodeById(selected[0]) ?? {}))) {
      openLoopEditor({ kind: "wrap", nodeIds: selected });
    } else {
      openLoopEditor({ kind: "insert", position: insertPosition(anchorId), chainFrom: anchorId });
    }
    return;
  }
  placeNode(kind, specialNodeData(kind), insertPosition(anchorId), anchorId);
}

function setDragPayloadForSpecial(event: DragEvent, kind: SpecialKind) {
  setDragPayload(event, { kind: "special", special: kind });
}

function fillSlotWithManual(slotId: string) {
  if (!ensureManualConfirmHostAvailable()) return;
  replaceSlotWithNode(slotId, "manual", specialNodeData("manual"), "空位已填充为人工确认");
}

// ── 画布拖放：设备动作 / 模板 / 特殊节点拖到画布空白或空位上 ──

const canvasWrapRef = ref<HTMLElement | null>(null);

// ── 画布悬浮节点库：设备平铺成按钮，模板 / 特殊 / 手动同排（互斥展开） ──

/** 当前展开的库菜单：`dev:{id}` / templates / specials / manual；null=全收起 */
const canvasMenu = ref<string | null>(null);
const manualDevice = ref("");
const manualAction = ref("");

function insertFromLibrary(deviceId: string, action: RuntimeActionCapability) {
  insertNode({
    deviceId,
    actionName: action.action_name,
    param: runtimeActionParams(action),
  });
  canvasMenu.value = null;
}

function insertSpecialFromLibrary(kind: SpecialKind) {
  insertSpecial(kind);
  canvasMenu.value = null;
}

function insertManualNode() {
  const deviceId = manualDevice.value.trim();
  const actionName = manualAction.value.trim();
  if (!deviceId || !actionName) return;
  insertNode({ deviceId, actionName });
  canvasMenu.value = null;
}

function dropFlowPosition(event: DragEvent): { x: number; y: number } {
  const bounds = canvasWrapRef.value?.getBoundingClientRect();
  const pos = flow.project({
    x: event.clientX - (bounds?.left ?? 0),
    y: event.clientY - (bounds?.top ?? 0),
  });
  // 节点中心大致落在指针处
  return { x: pos.x - 110, y: pos.y - 30 };
}

function dropTargetSlotId(event: DragEvent): string {
  const el = document.elementFromPoint(event.clientX, event.clientY);
  const nodeEl = (el as HTMLElement | null)?.closest?.(
    ".vue-flow__node",
  ) as HTMLElement | null;
  const id = nodeEl?.getAttribute("data-id") ?? "";
  if (!id) return "";
  return liteNodes.value.find((n) => n.id === id)?.type === "slot" ? id : "";
}

function onCanvasDragOver(event: DragEvent) {
  if (!hasDragPayload(event)) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
}

function onCanvasDrop(event: DragEvent) {
  const payload = readDragPayload(event);
  if (!payload) return;
  event.preventDefault();
  const slotId = dropTargetSlotId(event);
  const position = dropFlowPosition(event);

  if (payload.kind === "action") {
    if (slotId) {
      fillingSlotId.value = slotId;
      fillSlotWithAction(payload);
      return;
    }
    placeNode("action", {
      deviceId: payload.deviceId,
      actionName: payload.actionName,
      actionType: "goal",
      paramJson: JSON.stringify(payload.param ?? {}, null, 2),
      requirementsJson: "[]",
    }, position);
    return;
  }
  if (payload.kind === "template") {
    beginTemplateUse(payload.templateId, slotId, slotId ? null : position);
    return;
  }
  if (slotId) {
    if (payload.special === "manual") {
      fillSlotWithManual(slotId);
    } else {
      message.info("空位请用设备动作、模板或人工确认填充");
    }
    return;
  }
  if (payload.special === "manual" && !ensureManualConfirmHostAvailable()) return;
  if (payload.special === "loop") {
    openLoopEditor({ kind: "insert", position, chainFrom: "" });
    return;
  }
  placeNode(payload.special, specialNodeData(payload.special), position);
}

// ── 特殊节点编辑（人工确认 / 条件分支） ──

const specialEditOpen = ref(false);
const specialEditId = ref("");
const specialEditKind = ref<"manual" | "branch">("manual");
const manualLabel = ref("");
const manualPrompt = ref("");
const manualHostId = ref("");
const manualTimeoutS = ref<number | null>(DEFAULT_MANUAL_CONFIRM_TIMEOUT_S);
/** 指派人列表；只有 explicit=true 时才把 assignee_user_ids 写入提交参数。 */
const manualAssignees = ref<string[]>([]);
const manualAssigneesExplicit = ref(true);
const manualHostOptions = computed(() => {
  return manualConfirmHosts.value.map((id) => ({
    label: id,
    value: id,
  }));
});
const branchVariableId = ref("");
const branchOp = ref("==");
const branchValue = ref("");

const branchVariableOptions = computed(() =>
  workflowVariables.value.map((v) => ({
    label: `${v.id}（${v.label}）`,
    value: v.id,
  })),
);

const BRANCH_OPS = ["==", "!=", ">", ">=", "<", "<=", "contains"].map((op) => ({
  label: op,
  value: op,
}));

function openSpecialEditor(nodeId: string) {
  const node = liteNodes.value.find((n) => n.id === nodeId);
  if (!node) return;
  specialEditId.value = nodeId;
  if (node.type === "manual") {
    specialEditKind.value = "manual";
    manualLabel.value = String(node.data.label ?? "人工确认");
    manualPrompt.value = String(node.data.prompt ?? "");
    manualHostId.value = String(node.data.hostId ?? "") || (manualConfirmHosts.value[0] ?? HOST_NODE_ID);
    const timeout = Number(node.data.timeoutSeconds);
    manualTimeoutS.value = Number.isFinite(timeout) && timeout > 0 ? timeout : DEFAULT_MANUAL_CONFIRM_TIMEOUT_S;
    manualAssigneesExplicit.value = Object.prototype.hasOwnProperty.call(node.data, "assignees");
    manualAssignees.value = Array.isArray(node.data.assignees) ? node.data.assignees.map(String).filter(Boolean) : [];
  } else {
    specialEditKind.value = "branch";
    branchVariableId.value = String(node.data.variableId ?? "");
    branchOp.value = String(node.data.op ?? "==");
    branchValue.value = String(node.data.value ?? "");
  }
  specialEditOpen.value = true;
}

function saveSpecialEditor() {
  const node = liteNodes.value.find((n) => n.id === specialEditId.value);
  if (!node) {
    specialEditOpen.value = false;
    return;
  }
  if (specialEditKind.value === "manual") {
    if (!ensureManualConfirmHostAvailable()) return;
    const selectedHost = manualConfirmHosts.value.includes(manualHostId.value)
      ? manualHostId.value
      : manualConfirmHosts.value[0]!;
    manualHostId.value = selectedHost;
    node.data.label = manualLabel.value.trim() || "人工确认";
    node.data.prompt = manualPrompt.value.trim();
    node.data.hostId = selectedHost;
    node.data.showHost = manualConfirmHosts.value.length > 1;
    node.data.timeoutSeconds =
      manualTimeoutS.value && manualTimeoutS.value > 0 ? Math.round(manualTimeoutS.value) : DEFAULT_MANUAL_CONFIRM_TIMEOUT_S;
    if (manualAssigneesExplicit.value) {
      node.data.assignees = manualAssignees.value.map((item) => item.trim()).filter(Boolean);
      node.data.assigneesConfigured = true;
    } else {
      delete node.data.assignees;
      node.data.assigneesConfigured = false;
    }
  } else {
    node.data.variableId = branchVariableId.value;
    node.data.op = branchOp.value;
    node.data.value = branchValue.value;
  }
  specialEditOpen.value = false;
  commitHistory();
  saveDraftSoon();
}

// ── 条件分支：提交时求值 → 图变换（拼接真分支、disabled 假分支） ──

type SubmitEdgeLite = {
  source: string;
  target: string;
  sourceHandle: string;
  mappings: ParamMapping[];
};

function variableValueOf(variableIdText: string): unknown {
  const variable = workflowVariables.value.find((v) => v.id === variableIdText);
  return variable
    ? coerceVariableValue(variable.type, variable.value)
    : undefined;
}

function evalBranch(data: Record<string, unknown>): boolean | null {
  const variableIdText = String(data.variableId ?? "");
  if (!variableIdText) return null;
  const lhs = variableValueOf(variableIdText);
  if (lhs === undefined) return null;
  const op = String(data.op ?? "==");
  const rhsRaw = String(data.value ?? "");
  const numeric =
    typeof lhs === "number" && rhsRaw !== "" && Number.isFinite(Number(rhsRaw));
  const lhsCmp: string | number | boolean = numeric
    ? Number(lhs)
    : typeof lhs === "boolean"
      ? lhs
      : String(lhs);
  const rhsCmp: string | number | boolean = numeric
    ? Number(rhsRaw)
    : typeof lhs === "boolean"
      ? ["true", "1", "yes", "是"].includes(rhsRaw.trim().toLowerCase())
      : rhsRaw;
  switch (op) {
    case "==":
      return lhsCmp === rhsCmp;
    case "!=":
      return lhsCmp !== rhsCmp;
    case ">":
      return Number(lhsCmp) > Number(rhsCmp);
    case ">=":
      return Number(lhsCmp) >= Number(rhsCmp);
    case "<":
      return Number(lhsCmp) < Number(rhsCmp);
    case "<=":
      return Number(lhsCmp) <= Number(rhsCmp);
    case "contains":
      return String(lhsCmp).includes(String(rhsCmp));
    default:
      return null;
  }
}

/**
 * 提交前图变换：分支节点按当前参数表求值后消失——入边直接拼到所选分支，
 * 未选分支整段（从入口不可达的节点）标 disabled（协议原生跳过，图仍完整入库）。
 */
function buildSubmitGraph():
  | { nodes: LiteNode[]; edges: SubmitEdgeLite[]; disabled: Set<string>; notes: string[] }
  | { error: string } {
  // 分支在提交前求值消失；组框只是画布上的可见边界，不进图
  const keptNodes = liteNodes.value.filter((n) => n.type !== "branch" && !isGroupNode(n));
  let edges: SubmitEdgeLite[] = liteEdges.value.map((e) => ({
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle ?? "out",
    mappings: cloneJson(e.data?.mappings ?? []),
  }));
  const notes: string[] = [];

  // 原图入口（含分支边在内无任何入边的节点）
  const targeted = new Set(liteEdges.value.map((e) => e.target));
  const entries = new Set(
    liteNodes.value.filter((n) => !isGroupNode(n) && !targeted.has(n.id)).map((n) => n.id),
  );

  for (const branch of liteNodes.value.filter((n) => n.type === "branch")) {
    const verdict = evalBranch(branch.data);
    if (verdict === null) {
      return {
        error: `条件分支 ${branch.id} 未配置条件或引用的变量不存在，先点击该节点完成配置`,
      };
    }
    const chosenHandle = verdict ? "out-true" : "out-false";
    const incoming = edges.filter((e) => e.target === branch.id);
    const chosen = edges.filter(
      (e) => e.source === branch.id && e.sourceHandle === chosenHandle,
    );
    edges = edges.filter((e) => e.source !== branch.id && e.target !== branch.id);
    for (const i of incoming) {
      for (const c of chosen) {
        edges.push({
          source: i.source,
          target: c.target,
          sourceHandle: i.sourceHandle,
          mappings: cloneJson(i.mappings),
        });
      }
    }
    entries.delete(branch.id);
    notes.push(
      `${branch.id}: ${String(branch.data.variableId)} ${String(branch.data.op ?? "==")} ` +
        `${String(branch.data.value ?? "")}，走${verdict ? "真" : "假"}分支`,
    );
  }

  // 变换后从入口做可达性；不可达节点（未选分支）disabled。
  // 循环体成员没有来自外部的连线：到达循环框即视为到达它的全部成员（含嵌套）。
  const remaining = new Set(keptNodes.map((n) => n.id));
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!remaining.has(e.source) || !remaining.has(e.target)) continue;
    const next = adjacency.get(e.source) ?? [];
    next.push(e.target);
    adjacency.set(e.source, next);
  }
  const membersOf = new Map<string, string[]>();
  for (const n of keptNodes) {
    if (!n.parentNode || !remaining.has(n.parentNode)) continue;
    const list = membersOf.get(n.parentNode) ?? [];
    list.push(n.id);
    membersOf.set(n.parentNode, list);
  }
  const reached = new Set<string>();
  // 入口只算顶层（不在任何循环体里）的节点：成员由容器带入
  const byId = new Map(liteNodes.value.map((n) => [n.id, n]));
  const queue = [...entries].filter((id) => remaining.has(id) && !nearestLoopAncestor(id, byId));
  while (queue.length) {
    const current = queue.pop()!;
    if (reached.has(current)) continue;
    reached.add(current);
    for (const next of adjacency.get(current) ?? []) queue.push(next);
    for (const member of membersOf.get(current) ?? []) queue.push(member);
  }
  const disabled = new Set(
    keptNodes.filter((n) => !reached.has(n.id)).map((n) => n.id),
  );
  return { nodes: keptNodes, edges, disabled, notes };
}

// ── 重复片段 ×N（for 循环的配置时展开） ──

const repeatModalOpen = ref(false);
const repeatCount = ref(3);
let repeatSeedIds: string[] = [];

function openRepeatModal(nodeId: string) {
  const selected = flow.getSelectedNodes.value.map((n) => String(n.id));
  repeatSeedIds =
    selected.includes(nodeId) && selected.length > 1 ? selected : [nodeId];
  repeatCount.value = 3;
  repeatModalOpen.value = true;
}

function confirmRepeat() {
  const times = Math.max(2, Math.floor(repeatCount.value || 2));
  const seeds = liteNodes.value.filter((n) => repeatSeedIds.includes(n.id));
  if (!seeds.length) {
    repeatModalOpen.value = false;
    return;
  }
  if (seeds.some((n) => n.type === "branch")) {
    message.warning("条件分支节点不参与重复展开，请先移出选区");
    return;
  }
  if (seeds.some((n) => isContainerNode(n))) {
    message.warning("请选中组 / 循环里的节点再重复展开，组框和循环框本身不参与（循环框可用「创建副本」）");
    return;
  }
  // 同在一个循环体里的片段：复制件留在该循环里（相对坐标），否则落到顶层
  const sharedParent = commonParentOf(seeds);
  const loopParent = sharedParent?.parent && isLoopNode(nodeById(sharedParent.parent) ?? {}) ? sharedParent.parent : "";
  const idSet = new Set(seeds.map((n) => n.id));
  const internal = liteEdges.value.filter(
    (e) => idSet.has(e.source) && idSet.has(e.target),
  );
  const internalTargets = new Set(internal.map((e) => e.target));
  const internalSources = new Set(internal.map((e) => e.source));
  const entryIds = seeds.filter((n) => !internalTargets.has(n.id)).map((n) => n.id);
  const exitIds = seeds.filter((n) => !internalSources.has(n.id)).map((n) => n.id);
  // 复制件落在组外（绝对坐标），不跟原组绑定；在循环体里则沿用相对坐标留在循环里
  const seedPositions = new Map(
    seeds.map((n) => [n.id, loopParent ? { ...n.position } : absolutePosition(n)] as const),
  );
  const minX = Math.min(...[...seedPositions.values()].map((p) => p.x));
  const maxX = Math.max(...[...seedPositions.values()].map((p) => p.x));
  const strideX = maxX - minX + INSERT_GAP_X;
  const stamp = Date.now();

  type NewNode = {
    id: string;
    type: string;
    position: { x: number; y: number };
    data: Record<string, unknown>;
    parentNode?: string;
    expandParent?: boolean;
  };
  const newNodes: NewNode[] = [];
  const newEdges: ReturnType<typeof buildRepeatEdge>[] = [];
  let edgeSeq = 0;

  function buildRepeatEdge(
    source: string,
    target: string,
    sourceHandle: string,
    mappings: ParamMapping[],
  ) {
    return {
      id: `e-rep-${stamp}-${edgeSeq++}`,
      source,
      target,
      ...templateEdgeProps(mappings),
      sourceHandle,
    };
  }

  let prevExits = [...exitIds];
  for (let round = 1; round < times; round++) {
    const idMap = new Map<string, string>();
    for (const n of seeds) {
      const id = nextNodeId();
      idMap.set(n.id, id);
      const base = seedPositions.get(n.id)!;
      newNodes.push({
        id,
        type: n.type ?? "action",
        position: { x: base.x + strideX * round, y: base.y },
        data: cloneNodeDataForNewInstance({ ...n.data }),
        ...(loopParent ? { parentNode: loopParent, expandParent: true } : {}),
      });
    }
    for (const e of internal) {
      newEdges.push(
        buildRepeatEdge(
          idMap.get(e.source)!,
          idMap.get(e.target)!,
          e.sourceHandle ?? "out",
          cloneJson(e.data?.mappings ?? []),
        ),
      );
    }
    for (const s of prevExits) {
      for (const t of entryIds) {
        newEdges.push(buildRepeatEdge(s, idMap.get(t)!, "out", []));
      }
    }
    prevExits = exitIds.map((x) => idMap.get(x)!);
  }

  addNodes(newNodes);
  addEdges(newEdges);
  if (loopParent) void nextTick(() => fitLoopToMembers(loopParent));
  repeatModalOpen.value = false;
  requestFitView();
  commitHistory();
  message.success(`片段已串联展开为 ${times} 份`);
}

function restoreDraft(draft: Draft) {
  workflowId.value = draft.workflowId || `wf-${Date.now()}`;
  authorityWorkflowUuid.value = draft.authorityWorkflowUuid ?? "";
  // 旧草稿没有 workflowName 字段：workflowId 若是用户手填的（非自动时间戳格式）则回落展示
  workflowName.value =
    draft.workflowName ??
    (draft.workflowId && !/^wf-\d+$/.test(draft.workflowId) ? draft.workflowId : "");
  priority.value = draft.priority || "normal";
  workflowVariables.value = normalizeVariables(draft.variables);
  ensurePriorityOption(priority.value);
  setNodes(hydrateDraftNodes(draft.nodes));
  setEdges(
    draft.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || "out",
      targetHandle: "in",
      type: "smoothstep",
      data: { mappings: e.mappings },
      label: mappingLabel(e.mappings),
      style: e.mappings.length ? EDGE_STYLE_MAPPED : EDGE_STYLE_PLAIN,
    })),
  );
  lastInsertedId = draft.nodes.at(-1)?.id ?? "";
  requestFitView();
  void nextTick(() => resetHistory());
}

function newWorkflow() {
  setNodes([]);
  setEdges([]);
  workflowId.value = `wf-${Date.now()}`;
  workflowName.value = "";
  priority.value = "normal";
  authorityWorkflowUuid.value = "";
  workflowVariables.value = [];
  sourceWorkflow.value = null;
  nodeSeq = 1;
  lastInsertedId = "";
  localStorage.removeItem(DRAFT_KEY);
  draftSavedAt.value = 0;
  void nextTick(() => resetHistory());
}

function readVariableProfiles(): Record<string, WorkflowVariable[]> {
  try {
    const parsed = JSON.parse(localStorage.getItem(VARIABLE_STORE_KEY) ?? "{}");
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, WorkflowVariable[]>)
      : {};
  } catch {
    return {};
  }
}

function saveVariableProfile(id: string): void {
  const profiles = readVariableProfiles();
  profiles[id] = cloneJson(workflowVariables.value);
  localStorage.setItem(VARIABLE_STORE_KEY, JSON.stringify(profiles));
}

function loadVariableProfile(id: string): WorkflowVariable[] {
  return normalizeVariables(readVariableProfiles()[id]);
}

// ── 从 canonical Workflow Graph 克隆（?from=<workflow_uuid>） ──

/** 画布来源定义（克隆入口记录）；存在时可把参数表写回定义 meta_data。
    shallowRef：递归 JsonValue 类型经 ref 深度 UnwrapRef 会触发 TS2589。 */
const sourceWorkflow = shallowRef<BackendWorkflow | null>(null);
const savingParameterTable = ref(false);

/**
 * 参数表落库：写入克隆来源定义的 meta_data.parameter_table（{version: 1, variables}）。
 * 画布自己的定义在提交时随 meta_data 一起写入（performSubmit）。
 */
async function saveParameterTableToDefinition(): Promise<void> {
  const workflow = sourceWorkflow.value;
  if (!workflow) return;
  savingParameterTable.value = true;
  try {
    const metaData: JsonObject = {
      ...workflow.meta_data,
      parameter_table: buildParameterTableMeta(
        workflowVariables.value,
      ) as unknown as JsonObject,
    };
    const body: BackendWorkflowWriteInput = {
      name: workflow.name,
      tags: workflow.tags,
      meta_data: metaData,
    };
    if (workflow.description !== undefined) {
      body.description = workflow.description;
    }
    const updated = await conn.api.domains.workflowBackend.updateWorkflow(
      workflow.uuid,
      body,
    );
    sourceWorkflow.value = updated;
    message.success(`参数表已存入定义 ${workflow.name}`);
  } catch (err) {
    message.error(
      `参数表存入定义失败：${describeError(err)}`,
    );
  } finally {
    savingParameterTable.value = false;
  }
}

async function cloneFrom(sourceId: string) {
  try {
    const graph = await conn.api.domains.workflowBackend.graph(sourceId);
    if (!graph.nodes.length) {
      message.warning(`Workflow ${sourceId} 没有可克隆的 Graph`);
      return;
    }
    sourceWorkflow.value = graph.workflow;
    // 参数表恢复：本地变量草稿（最近编辑）优先，其次定义 meta_data.parameter_table
    const localVariables = loadVariableProfile(sourceId);
    const storedVariables = parseParameterTableMeta(
      graph.workflow.meta_data?.parameter_table,
    );
    const templateMap = new Map(graph.node_templates.map((item) => [item.uuid, item]));
    const handleMap = new Map(graph.handle_templates.map((item) => [item.uuid, item]));
    // 同 (source,target) 的多条传参边折叠成一条可视边，映射合并
    const grouped = new Map<string, { source: string; target: string; mappings: ParamMapping[] }>();
    for (const e of graph.edges) {
      const key = `${e.source_node_uuid}->${e.target_node_uuid}`;
      const group = grouped.get(key) ?? {
        source: e.source_node_uuid,
        target: e.target_node_uuid,
        mappings: [],
      };
      const sh = handleMap.get(e.source_handle_uuid);
      const th = handleMap.get(e.target_handle_uuid);
      if (
        sh?.data_source === "executor" &&
        sh.handle_key !== "ready" &&
        sh.data_key &&
        th &&
        th.handle_key !== "ready" &&
        th.data_key
      ) {
        group.mappings.push({ sourceKey: sh.data_key, targetKey: th.data_key });
      }
      grouped.set(key, group);
    }
    // 无模板图（@workflow 声明式步骤 / 画布提交）的顺序写在 execution_policy.depends_on，还原成顺序连线
    const nodeUuids = new Set(graph.nodes.map((n) => n.uuid));
    for (const n of graph.nodes) {
      const dependsOn = (n.execution_policy as Record<string, unknown> | undefined)?.depends_on;
      if (!Array.isArray(dependsOn)) continue;
      for (const upstream of dependsOn) {
        const source = String(upstream);
        if (!nodeUuids.has(source) || source === n.uuid) continue;
        const key = `${source}->${n.uuid}`;
        if (!grouped.has(key)) grouped.set(key, { source, target: n.uuid, mappings: [] });
      }
    }
    const requirementsOf = (n: (typeof graph.nodes)[number]): string => {
      const list = (n.meta_data as Record<string, unknown> | undefined)?.inventory_requirements;
      if (!Array.isArray(list)) return "[]";
      return JSON.stringify(
        list
          .filter((item): item is Record<string, unknown> => item !== null && typeof item === "object")
          .map((item) => ({ key: item.key, template_id: item.template_uuid, quantity: item.quantity, unit: item.unit })),
      );
    };
    // 循环容器：type=loop 的节点是循环框，parent_uuid 指向它的节点是循环体（坐标改成相对循环框）
    const loopUuids = new Set(graph.nodes.filter((n) => String(n.type).toLowerCase() === "loop").map((n) => n.uuid));
    const poseOf = (n: (typeof graph.nodes)[number], i: number) => {
      const pose = (n.pose ?? {}) as Record<string, unknown>;
      return {
        x: typeof pose.x === "number" ? pose.x : 80 + i * 280,
        y: typeof pose.y === "number" ? pose.y : 110,
      };
    };
    const absoluteByUuid = new Map(graph.nodes.map((n, i) => [n.uuid, poseOf(n, i)] as const));
    const loopParentOf = (n: (typeof graph.nodes)[number]): string | undefined =>
      n.parent_uuid && loopUuids.has(n.parent_uuid) ? n.parent_uuid : undefined;
    const loopFrameSize = (loopUuid: string): { width: number; height: number } => {
      const origin = absoluteByUuid.get(loopUuid) ?? { x: 0, y: 0 };
      const members = graph.nodes
        .filter((m) => loopParentOf(m) === loopUuid)
        .map((m) => {
          const abs = absoluteByUuid.get(m.uuid)!;
          const size = loopUuids.has(m.uuid) ? loopFrameSize(m.uuid) : { width: 220, height: 72 };
          return { position: { x: abs.x - origin.x, y: abs.y - origin.y }, ...size };
        });
      return fitFrame(members, { width: 320, height: 160 });
    };
    restoreDraft({
      workflowId: `wf-${Date.now()}`,
      workflowName: graph.workflow.name ? `${graph.workflow.name} 副本` : "",
      priority: "normal",
      variables: localVariables.length ? localVariables : storedVariables,
      nodes: graph.nodes.map((n, i) => {
        const template = n.workflow_node_template_uuid
          ? templateMap.get(n.workflow_node_template_uuid)
          : undefined;
        const isManual =
          String(template?.node_type ?? n.type).toLowerCase() === "manual_confirm";
        const meta = (n.meta_data ?? {}) as Record<string, unknown>;
        const absolute = poseOf(n, i);
        const loopParent = loopParentOf(n);
        const parentAbsolute = loopParent ? absoluteByUuid.get(loopParent)! : { x: 0, y: 0 };
        const relative = { x: absolute.x - parentAbsolute.x, y: absolute.y - parentAbsolute.y };
        if (loopUuids.has(n.uuid)) {
          const size = loopFrameSize(n.uuid);
          return {
            id: n.uuid,
            type: LOOP_NODE_TYPE,
            x: relative.x,
            y: relative.y,
            ...(loopParent ? { parentNode: loopParent } : {}),
            width: size.width,
            height: size.height,
            data: loopNodeDataFromSpec(
              (n.param ?? {}) as Record<string, unknown>,
              String(n.name ?? ""),
              (ref) => (nodeUuids.has(ref) ? ref : undefined),
            ) as unknown as Record<string, unknown>,
          };
        }
        const manualParam = (n.param ?? {}) as Record<string, unknown>;
        const manualData: Record<string, unknown> = {
          label: String(manualParam.label ?? n.name ?? "人工确认"),
          prompt: String(manualParam.prompt ?? ""),
        };
        if (typeof meta.target_device_id === "string" && meta.target_device_id.trim()) {
          manualData.hostId = meta.target_device_id.trim();
        }
        if (typeof manualParam.timeout_seconds === "number" && Number.isFinite(manualParam.timeout_seconds)) {
          manualData.timeoutSeconds = manualParam.timeout_seconds;
        }
        // 严格保留缺 key / 显式 []：旧图缺 key 时，用户必须在编辑器明确选择后才能运行。
        if (Object.prototype.hasOwnProperty.call(manualParam, "assignee_user_ids") && Array.isArray(manualParam.assignee_user_ids)) {
          manualData.assignees = manualParam.assignee_user_ids.map(String).filter(Boolean);
          manualData.assigneesConfigured = true;
        } else {
          manualData.assigneesConfigured = false;
        }
        return {
          id: n.uuid,
          type: isManual ? "manual" : "action",
          x: loopParent ? relative.x : absolute.x,
          y: loopParent ? relative.y : absolute.y,
          ...(loopParent ? { parentNode: loopParent } : {}),
          data: isManual
            ? manualData
            : {
                deviceId: String(meta.target_device_id ?? ""),
                actionName: n.action_name ?? "",
                actionType: n.action_type ?? "goal",
                paramJson: JSON.stringify(n.param ?? {}, null, 2),
                requirementsJson: requirementsOf(n),
                workflowNodeTemplateUuid: n.workflow_node_template_uuid ?? "",
              },
        };
      }),
      edges: [...grouped.values()].map((g, i) => ({
        id: `e-clone-${i}`,
        source: g.source,
        target: g.target,
        mappings: g.mappings,
      })),
    });
    const hasPose = graph.nodes.some((n) => typeof (n.pose as Record<string, unknown> | undefined)?.x === "number");
    if (!hasPose) void nextTick(() => autoLayout());
    message.success(`已克隆 ${sourceId}（${graph.nodes.length} 节点）到本地草稿`);
  } catch (err) {
    message.error(`克隆失败：${describeError(err)}`);
  }
}

// ── 试运行（Dry Run）：本地静态校验，不提交、不下发任何设备动作 ──
//
// 后端只读调查结论：Uni-Lab-OS 的 validate_graph 只在 Workflow v1 图保存
// （PUT /workflows/{uuid}/graph）与 authoring apply 的写路径内触发，Edge
// 调度器 POST /scheduler/workflows 提交时才做环检测（422），没有只读校验端点——
// 故这里为纯前端本地校验（graph-dry-run.ts），不虚构端点。

const dryRunOpen = ref(false);
const dryRunRunning = ref(false);
const dryRunReport = ref<DryRunReport | null>(null);

function collectDryRunNodes(): DryRunNodeInput[] {
  return liteNodes.value.map((node) => ({
    id: node.id,
    type: node.type ?? "action",
    deviceId: String(node.data.deviceId ?? ""),
    actionName: String(node.data.actionName ?? ""),
    paramJson: String(node.data.paramJson ?? "{}"),
    requirementsJson: String(node.data.requirementsJson ?? "[]"),
  }));
}

function collectDryRunEdges(): DryRunEdgeInput[] {
  return liteEdges.value.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    mappings: (edge.data?.mappings ?? []).map((mapping) => ({ ...mapping })),
  }));
}

async function runDryRun(): Promise<void> {
  dryRunOpen.value = true;
  dryRunRunning.value = true;
  try {
    syncVariablesToNodes();
    // schema 走共享缓存（已请求过的不再发）；物料批次只读拉一次做粗检。
    await ensureActionSchemas(canvasSchemaKeys.value);
    let lots: DryRunLot[] | null = null;
    try {
      // 批次 + 模板名：台账用人话显示物料；隔离 / 过期批次由校验器排除
      const [lotRows, templateRows] = await Promise.all([
        conn.api.domains.materialsV1.lots(),
        conn.api.domains.materialsV1.templates().catch(() => []),
      ]);
      const templateNames = new Map(
        templateRows.map((template) => [template.template_uuid, template.display_name || template.name]),
      );
      lots = lotRows.map((lot) => ({
        template_id: lot.template_uuid,
        template_name: templateNames.get(lot.template_uuid),
        lot_uuid: lot.lot_uuid,
        batch_no: lot.batch_no,
        quantity_available: lot.quantity_available,
        unit: lot.unit,
        quarantined: lot.quarantined,
        expiry_at_ms: lot.expiry_at_ms ?? null,
      }));
    } catch {
      lots = null;
    }
    dryRunReport.value = dryRunWorkflow({
      nodes: collectDryRunNodes(),
      edges: collectDryRunEdges(),
      schemas: actionSchemaCache.value,
      lots,
    });
  } finally {
    dryRunRunning.value = false;
  }
}

const dryRunSummary = computed(() => {
  const report = dryRunReport.value;
  if (!report) return "";
  if (!report.issues.length) return "通过";
  return `${report.errorCount} 错误 / ${report.warningCount} 警告`;
});

const DEDUCTION_STATUS_LABEL: Record<DryRunDeductionRow["status"], string> = {
  ok: "充足",
  short: "不足",
  unknown: "无批次",
  "unit-mismatch": "单位不一致",
};

/**
 * 把一个节点平移到画布视野中央并适度放大，返回过渡结束的 Promise。
 *
 * 不用 fitView 单节点：那会把缩放一路顶到 maxZoom，观感突兀；这里保留用户当前缩放
 * （至少 1×，最多 1.5×）。节点落在视野中线略偏下，给随后在其上方打开的参数浮层留出空间。
 */
async function focusNode(nodeId: string): Promise<void> {
  const node = flow.findNode(nodeId);
  if (!node) return;
  const width = node.dimensions?.width || 220;
  const height = node.dimensions?.height || 72;
  const zoom = Math.min(Math.max(flow.viewport.value.zoom, 1), 1.5);
  const viewportHeight = flow.dimensions.value.height || 0;
  await flow.setCenter(
    node.computedPosition.x + width / 2,
    node.computedPosition.y + height / 2 - (viewportHeight * 0.15) / zoom,
    { zoom, duration: 250 },
  );
}

/** 点击报告条目：画布定位节点并打开对应编辑入口（浮层/空位/特殊节点）。 */
async function locateIssue(issue: DryRunIssue): Promise<void> {
  if (!issue.nodeId) return;
  const node = flow.findNode(issue.nodeId);
  if (!node) return;
  dryRunOpen.value = false;
  // 等平移/缩放过渡结束再开浮层：浮层锚点跟随节点，动画途中打开会跟着滑动
  await focusNode(issue.nodeId);
  const type = String(node.type ?? "action");
  if (type === "action") openNodePanel(issue.nodeId);
  else if (type === "slot") openSlotFill(issue.nodeId);
  else if (type === "manual" || type === "branch") openSpecialEditor(issue.nodeId);
}

// ── 提交 ──
const submissionOpen = ref(false);
const runMode = ref<WorkflowExecutionMode>("normal");

function validateVariableGroups(): boolean {
  const lengths = new Map<string, Set<number>>();
  for (const variable of workflowVariables.value) {
    if (!variable.type.startsWith("list:")) continue;
    const group = variable.group || "default";
    const set = lengths.get(group) ?? new Set<number>();
    set.add(Array.isArray(variable.value) ? variable.value.length : 0);
    lengths.set(group, set);
  }
  for (const [group, values] of lengths) {
    if (values.size > 1) {
      message.error(`等长列表组 ${group} 的列长度不一致，请在参数表中补齐`);
      return false;
    }
  }
  return true;
}

/** 提交入口：先跑一遍本地校验，有 error 级问题给确认拦截（可跳过）。 */
function submit(): void {
  if (submitting.value) return;
  const mode = runMode.value;
  if (!nodeCount.value) {
    message.warning("画布为空，先从上方设备按钮插入节点");
    return;
  }
  syncVariablesToNodes();
  // 只用已有 schema 缓存做即时把关（不等网络）；物料粗检是 warning 级，不参与拦截。
  const gate = dryRunWorkflow({
    nodes: collectDryRunNodes(),
    edges: collectDryRunEdges(),
    schemas: actionSchemaCache.value,
    lots: null,
  });
  if (!gate.errorCount) {
    void performSubmit({ runMode: mode });
    return;
  }
  dialog.warning({
    title: "试运行发现错误",
    content: `本地校验发现 ${gate.errorCount} 个错误级问题（未填参数 / 未绑定引用 / 回路 / 空位等）。仍要按当前内容提交吗？`,
    positiveText: "仍要提交",
    negativeText: "查看报告",
    onPositiveClick: () => {
      void performSubmit({ runMode: mode });
    },
    onNegativeClick: () => {
      void runDryRun();
    },
  });
}

/**
 * 提交：定义 → 图 → 运行（saveOnly 时只到图）。
 *
 * 新契约无节点模板：设备动作节点 = type + material_uuid + action_name，顺序 = execution_policy.depends_on，
 * 边为空（与 @workflow 声明式步骤同一套约定）。节点 uuid 首次分配后写回草稿，定义 uuid 也绑定到草稿，
 * 再次提交是更新同一定义（PUT graph 带 revision）。
 */
async function performSubmit(options: { saveOnly?: boolean; runMode?: WorkflowExecutionMode } = {}) {
  if (submitting.value) return;
  if (!nodeCount.value) {
    message.warning("画布为空，先从上方设备按钮插入节点");
    return;
  }
  if (slotCount.value) {
    message.warning(`还有 ${slotCount.value} 个空位未填充：点击虚线空位节点补全后再提交`);
    return;
  }
  if (!conn.online) {
    message.error("尚未连接后端，无法提交");
    return;
  }
  if (!validateVariableGroups()) return;
  syncVariablesToNodes();
  const transformed = buildSubmitGraph();
  if ("error" in transformed) {
    message.error(transformed.error);
    return;
  }
  saveVariableProfile(workflowId.value);
  submitting.value = true;
  try {
    // 设备 → material_uuid / action_type 从设备目录解析（materials 根物料 + runtime 能力）
    if (!devicesStore.loaded) await devicesStore.refresh();
    const groupsById = new Map(
      liteNodes.value.filter((n) => isGroupNode(n)).map((n) => [n.id, groupSubmitMeta(n)] as const),
    );
    const nodesById = new Map(liteNodes.value.map((n) => [n.id, n]));
    // 所属组框：沿父链找最近的组（循环框在组里时，成员也算在那个组里）
    const groupOf = (nodeId: string) => {
      let current = nodesById.get(nodeId)?.parentNode;
      const seen = new Set<string>();
      while (current && !seen.has(current)) {
        seen.add(current);
        if (groupsById.has(current)) return groupsById.get(current);
        current = nodesById.get(current)?.parentNode;
      }
      return undefined;
    };
    const build = await buildAuthorityGraph({
      nodes: transformed.nodes.map((node) => ({
        id: node.id,
        type: node.type ?? "action",
        // 落库的 pose 用绝对坐标：组内成员的 position 是相对组框的
        position: absolutePosition(node),
        data: node.data,
        group: groupOf(node.id),
        loopId: nearestLoopAncestor(node.id, nodesById),
      })),
      edges: transformed.edges.map((edge) => ({ source: edge.source, target: edge.target, mappings: edge.mappings })),
      disabled: transformed.disabled,
      // 未绑定权威定义时，草稿里的 UUID 可能来自另一个已删除的 Workflow；
      // Backend 对 workflow_node 身份仍做全局唯一约束，首次创建必须重新分配。
      reuseExistingUuids: Boolean(authorityWorkflowUuid.value),
      resolveDevice: (deviceId) => {
        const device = devicesStore.byId(deviceId);
        if (!device) return undefined;
        return {
          materialUuid: device.materialUuid,
          action: (actionName) => {
            const capability = device.actions.find((item) => item.action_name === actionName);
            if (!capability) return undefined;
            return {
              actionType: capability.action_type ?? capability.descriptor.type ?? undefined,
              alwaysFree: capability.descriptor.always_free === true,
            };
          },
        };
      },
    });
    // 稳定 uuid 写回画布节点，随草稿保存；下次提交沿用
    for (const node of liteNodes.value) {
      const uuid = build.uuidByNodeId.get(node.id);
      if (uuid) node.data.uuid = uuid;
    }
    for (const warning of build.warnings) message.warning(warning, { duration: 8000 });
    if (!options.saveOnly && build.notLocallyExecutable.length) {
      const names = build.notLocallyExecutable.map((item) => item.name).join("、");
      message.error(
        `本机调度器目前只执行设备动作节点；「${names}」（${build.notLocallyExecutable[0].type}）没有本地执行器，任务会在派发前失败。` +
          "可以先「保存为定义」，运行前请移除或替换这些节点。",
        { duration: 12_000 },
      );
      return;
    }

    const name = workflowName.value.trim() || `画布流程 ${new Date().toLocaleString("zh-CN", { hour12: false })}`;
    const result = await submitWorkflow(conn.api.domains.workflowBackend, {
      workflowUuid: authorityWorkflowUuid.value || undefined,
      runMode: options.runMode ?? "normal",
      name,
      description: transformed.notes.length ? `分支求值：${transformed.notes.join("；")}` : undefined,
      metaData: {
        priority: priority.value,
        parameter_table: buildParameterTableMeta(workflowVariables.value) as unknown as JsonObject,
      },
      nodes: build.nodes,
      saveOnly: options.saveOnly,
    });
    authorityWorkflowUuid.value = result.workflow.uuid;
    if (!workflowName.value.trim()) workflowName.value = name;
    flushDraftNow();
    if (result.task) {
      submissionOpen.value = false;
      message.success(result.task.run_mode === "step" ? `已提交逐步运行：${name}，请在详情页执行下一步` : `已提交运行：${name}（${build.nodes.length} 个节点）`);
      void router.push(`/workflow-tasks/${result.task.uuid}`);
    } else {
      message.success(`${result.created ? "已创建" : "已更新"}工作流定义 ${name}（revision ${result.workflow.revision}）`);
    }
  } catch (error) {
    if (error instanceof SubmitGraphError) {
      message.error(error.message, { duration: 10_000 });
    } else {
      message.error(`提交失败：${describeError(error)}`, { duration: 10_000 });
    }
  } finally {
    submitting.value = false;
  }
}

const draftHint = computed(() => {
  if (!draftSavedAt.value) return "";
  return `草稿已自动保存 ${new Date(draftSavedAt.value).toLocaleTimeString("zh-CN", { hour12: false })}`;
});

onMounted(() => {
  window.addEventListener("keydown", onEditorKeydown);
  loadUserTemplates();
  void loadRegistryTemplates();
  void loadLibrary();
  resetHistory();
  const from = String(route.query.from ?? "");
  if (from) {
    void cloneFrom(from);
    return;
  }
  const raw = localStorage.getItem(DRAFT_KEY);
  if (raw) {
    try {
      const draft = JSON.parse(raw) as Draft;
      if (draft.nodes?.length) {
        restoreDraft(draft);
        draftSavedAt.value = Date.now();
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }
});

onUnmounted(() => {
  window.removeEventListener("keydown", onEditorKeydown);
});
</script>

<template>
  <div class="editor-layout app-fill">
    <!-- 顶部工具条 -->
    <div class="editor-toolbar">
      <NSpace align="center" :size="8">
        <NInput
          v-model:value="workflowName"
          size="small"
          style="width: 230px"
          placeholder="工作流名称"
          :title="`内部 ID：${workflowId}（自动生成）`"
        >
          <template #prefix><span class="wf-prefix">名称</span></template>
        </NInput>
        <NSelect
          v-model:value="priority"
          :options="priorityOptions"
          size="small"
          style="width: 96px"
        />
        <NButton size="small" secondary @click="autoLayout">自动布局</NButton>
        <NButton
          size="small"
          secondary
          type="primary"
          @click="variablesDrawerOpen = true"
        >
          参数表
          <span v-if="workflowVariables.length" class="button-count">
            {{ workflowVariables.length }}
          </span>
        </NButton>
        <NButton
          v-if="sourceWorkflow"
          size="small"
          quaternary
          :loading="savingParameterTable"
          :title="`把当前参数表写入定义 ${sourceWorkflow.name} 的 meta_data`"
          @click="saveParameterTableToDefinition"
        >
          参数表存入定义
        </NButton>
        <NButton
          size="small"
          quaternary
          :disabled="!canUndo"
          title="撤销 (Ctrl+Z)"
          @click="undo"
        >
          撤销
        </NButton>
        <NButton
          size="small"
          quaternary
          :disabled="!canRedo"
          title="重做 (Ctrl+Shift+Z / Ctrl+Y)"
          @click="redo"
        >
          重做
        </NButton>
        <NButton size="small" quaternary title="下载画布 JSON" @click="exportDraftFile">
          导出
        </NButton>
        <NButton size="small" quaternary title="打印本地草稿，不会提交到后端" @click="printDraft">
          打印草稿
        </NButton>
        <NButton
          size="small"
          quaternary
          title="从 JSON 文件恢复画布"
          @click="importInputRef?.click()"
        >
          导入
        </NButton>
        <input
          ref="importInputRef"
          type="file"
          accept=".json,application/json"
          style="display: none"
          @change="importDraftFile"
        />
        <NButton size="small" quaternary @click="newWorkflow">新建</NButton>
        <span v-if="draftHint" class="draft-hint">{{ draftHint }}</span>
      </NSpace>
    </div>

    <div class="editor-body">
      <!-- 画布满幅；节点库全部按钮化悬浮在画布上（支持拖拽节点/模板落入，或拖到空位上填充） -->
      <div
        ref="canvasWrapRef"
        class="editor-canvas"
        @dragover="onCanvasDragOver"
        @drop="onCanvasDrop"
      >
        <VueFlow
          :node-types="nodeTypes"
          :min-zoom="0.2"
          :max-zoom="2"
          :delete-key-code="['Backspace', 'Delete']"
          :edges-updatable="true"
          :edge-updater-radius="14"
          :connection-radius="30"
          :connection-mode="ConnectionMode.Strict"
          :snap-to-grid="true"
          :snap-grid="[18, 18]"
        >
          <Background pattern-color="#d4d4d8" :gap="18" />
          <Controls position="bottom-left" />
          <MiniMap
            position="bottom-right"
            pannable
            zoomable
            :node-color="() => '#d4d4d8'"
            mask-color="rgba(245,245,245,0.75)"
          />
        </VueFlow>

        <!-- 画布左上：设备平铺成按钮（点开动作菜单），模板 / 特殊 / 手动同排 -->
        <div class="canvas-library" @mousedown.stop>
          <template v-if="libAvailable">
            <NPopover
              v-for="d in libDevices"
              :key="d"
              :show="canvasMenu === `dev:${d}`"
              trigger="click"
              placement="bottom-start"
              :show-arrow="false"
              raw
              @update:show="(v: boolean) => (canvasMenu = v ? `dev:${d}` : null)"
            >
              <template #trigger>
                <button
                  type="button"
                  class="lib-chip"
                  :class="{ open: canvasMenu === `dev:${d}` }"
                  :title="`${d} · 点开动作列表`"
                >
                  <span class="lib-dot" />{{ d }}
                </button>
              </template>
              <div class="lib-menu">
                <div class="lib-menu-title">{{ d }} · 点击插入，或拖到画布 / 空位上</div>
                <button
                  v-for="a in libActionsOf[d] ?? []"
                  :key="a.action_name"
                  type="button"
                  class="lib-action"
                  draggable="true"
                  @dragstart="
                    setDragPayload($event, {
                      kind: 'action',
                      deviceId: d,
                      actionName: a.action_name,
                      param: runtimeActionParams(a),
                    })
                  "
                  :title="actionParamSummary(a).displayName ? `${actionParamSummary(a).displayName} · ${actionParamSummary(a).label}` : actionParamSummary(a).label"
                  @click="insertFromLibrary(d, a)"
                >
                  <span class="lib-action-text">
                    <span class="lib-action-name">{{ a.action_name }}</span>
                    <span v-if="actionParamSummary(a).displayName" class="lib-action-alias">{{ actionParamSummary(a).displayName }}</span>
                  </span>
                  <span class="lib-action-meta">
                    <NTag v-if="a.availability === 'busy'" size="tiny" type="warning" :bordered="false">
                      busy
                    </NTag>
                    <span class="lib-action-count" :class="{ zero: actionParamSummary(a).total === 0 }">
                      {{ actionParamSummary(a).label }}
                    </span>
                  </span>
                </button>
                <div v-if="!(libActionsOf[d] ?? []).length" class="lib-menu-empty">
                  该设备暂无可用动作
                </div>
              </div>
            </NPopover>
          </template>
          <button
            v-else
            type="button"
            class="lib-chip offline"
            :title="libLoading ? '正在获取在线设备…' : '未获取到在线设备，点击重试'"
            :disabled="libLoading"
            @click="void loadLibrary()"
          >
            {{ libLoading ? "获取设备中…" : "无在线设备 · 重试" }}
          </button>

          <span class="lib-divider" />

          <NPopover
            :show="canvasMenu === 'templates'"
            trigger="click"
            placement="bottom-start"
            :show-arrow="false"
            raw
            @update:show="(v: boolean) => (canvasMenu = v ? 'templates' : null)"
          >
            <template #trigger>
              <button type="button" class="lib-chip" :class="{ open: canvasMenu === 'templates' }">
                模板
              </button>
            </template>
            <div class="lib-menu wide">
              <TemplatePanel
                :templates="templateList"
                :registry="templateRegistry"
                @pick="beginTemplateUse($event)"
                @save-current="openSaveTemplate"
                @remove="removeUserTemplate"
              />
            </div>
          </NPopover>

          <NPopover
            :show="canvasMenu === 'specials'"
            trigger="click"
            placement="bottom-start"
            :show-arrow="false"
            raw
            @update:show="(v: boolean) => (canvasMenu = v ? 'specials' : null)"
          >
            <template #trigger>
              <button type="button" class="lib-chip" :class="{ open: canvasMenu === 'specials' }">
                特殊
              </button>
            </template>
            <div class="lib-menu">
              <div class="lib-menu-title">特殊节点 · 点击插入，或拖到画布 / 空位上</div>
              <div v-if="!manualConfirmHosts.length" class="lib-menu-hint">
                连接的执行节点没有上报 manual_confirm 动作，人工确认节点暂不可用。
              </div>
              <div class="specials-list">
                <div
                  v-for="item in specialItems"
                  :key="item.kind"
                  class="special-card"
                  :class="`special-${item.kind}`"
                  draggable="true"
                  title="点击插入，或拖到画布 / 空位上"
                  @dragstart="setDragPayloadForSpecial($event, item.kind)"
                  @click="insertSpecialFromLibrary(item.kind)"
                >
                  <span class="special-icon"><NIcon :size="16"><component :is="item.icon" /></NIcon></span>
                  <span class="special-text">
                    <b>{{ item.title }}</b>
                    <small>{{ item.desc }}</small>
                  </span>
                </div>
              </div>
            </div>
          </NPopover>

          <NPopover
            :show="canvasMenu === 'manual'"
            trigger="click"
            placement="bottom-start"
            :show-arrow="false"
            raw
            @update:show="(v: boolean) => (canvasMenu = v ? 'manual' : null)"
          >
            <template #trigger>
              <button
                type="button"
                class="lib-chip"
                :class="{ open: canvasMenu === 'manual' }"
                title="手动录入设备与动作插入节点"
              >
                <NIcon :size="12"><AddOutline /></NIcon>手动
              </button>
            </template>
            <div class="lib-menu manual">
              <div class="lib-menu-title">手动录入节点</div>
              <NInput
                v-model:value="manualDevice"
                size="small"
                placeholder="设备 ID，如 liquid_handler"
              />
              <NInput
                v-model:value="manualAction"
                size="small"
                placeholder="动作名，如 prepare_samples"
                @keyup.enter="insertManualNode"
              />
              <NButton
                size="small"
                type="primary"
                block
                :disabled="!manualDevice.trim() || !manualAction.trim()"
                @click="insertManualNode"
              >
                插入节点
              </NButton>
            </div>
          </NPopover>
        </div>

        <!-- 画布右上：状态与提交操作悬浮条（从顶部工具栏下放，给画布让高度） -->
        <div class="canvas-actions" @mousedown.stop>
          <NTag size="small" :bordered="false">{{ nodeCount }} 节点</NTag>
          <NTag v-if="slotCount" size="small" :bordered="false" type="warning">
            {{ slotCount }} 个空位待填充
          </NTag>
          <NTag v-if="workflowVariables.length" size="small" :bordered="false" type="info">
            参数表 {{ workflowVariables.length }} 个字段
          </NTag>
          <NTag
            v-if="dryRunReport && !dryRunRunning"
            size="small"
            :bordered="false"
            :type="
              dryRunReport.errorCount
                ? 'error'
                : dryRunReport.warningCount
                  ? 'warning'
                  : 'success'
            "
            style="cursor: pointer"
            title="查看试运行报告"
            @click="dryRunOpen = true"
          >
            {{ dryRunSummary }}
          </NTag>
          <NButton
            size="small"
            secondary
            :loading="dryRunRunning"
            :disabled="!nodeCount"
            title="本地静态校验：不提交、不下发任何设备动作"
            @click="runDryRun"
          >
            试运行
          </NButton>
          <NButton
            size="small"
            secondary
            :loading="submitting"
            :disabled="!conn.schedulerOnline || !nodeCount"
            :title="authorityWorkflowUuid ? `更新已绑定的定义 ${authorityWorkflowUuid.slice(0, 8)}（PUT graph，revision 乐观锁）` : '创建工作流定义并保存图，不运行'"
            @click="performSubmit({ saveOnly: true })"
          >
            {{ authorityWorkflowUuid ? "更新定义" : "保存为定义" }}
          </NButton>
          <WorkflowRunButton
            v-model="runMode"
            :loading="submitting"
            :disabled="!conn.schedulerOnline || !nodeCount"
            @submit="submissionOpen = true"
          />
          <NModal v-model:show="submissionOpen" preset="card" title="提交工作流运行" style="width: 480px">
            <p>{{ workflowName || '当前画布' }} · {{ nodeCount }} 个节点</p>
            <NSelect v-model:value="runMode" :options="WORKFLOW_RUN_OPTIONS" :disabled="submitting" aria-label="运行方式" />
            <p>{{ runMode === 'step' ? '提交后先等待。在运行详情页点击「执行下一步」，每次只放行一个动作，也可切换自动执行。' : '提交后由后端按依赖和资源情况自动执行到结束。' }}</p>
            <template #footer>
              <NSpace justify="end">
                <NButton :disabled="submitting" @click="submissionOpen = false">取消</NButton>
                <NButton type="primary" :loading="submitting" :disabled="!conn.schedulerOnline" @click="submit">
                  {{ runMode === 'step' ? '提交并逐步运行' : '提交并自动执行' }}
                </NButton>
              </NSpace>
            </template>
          </NModal>
        </div>

        <!-- 节点参数浮层：左=上游输出字段，右=本节点输入参数；映射写回边 mappings -->
        <div
          v-if="nodePanelOpen && nodePanelAnchor"
          class="node-panel"
          :class="{ below: nodePanelAnchor.below, 'single-col': !upstreamSources.length }"
          :style="{
            left: `${nodePanelAnchor.x}px`,
            top: nodePanelAnchor.below
              ? `${nodePanelAnchor.nodeBottom + 14}px`
              : `${nodePanelAnchor.y - 14}px`,
            maxHeight: `${nodePanelAnchor.maxHeight}px`,
          }"
          @mousedown.stop
          @wheel.stop
        >
          <div class="node-panel-arrow" />
          <header class="node-panel-head">
            <div class="node-panel-title">
              <strong :title="editAction || editingNodeId">{{ editAction || editingNodeId }}</strong>
              <span :title="`${editDevice} · ${editingNodeId}`">{{ editDevice }} · {{ editingNodeId }}</span>
            </div>
            <div class="node-panel-actions">
              <NButton
                size="tiny"
                quaternary
                circle
                :type="nodePanelPinned ? 'primary' : 'default'"
                :title="nodePanelPinned ? '取消固定' : '固定浮层（点空白不关闭）'"
                @click="nodePanelPinned = !nodePanelPinned"
              >
                <NIcon :size="14">
                  <Pin v-if="nodePanelPinned" />
                  <PinOutline v-else />
                </NIcon>
              </NButton>
              <NButton
                size="tiny"
                quaternary
                circle
                title="全部设置：设备 / 动作 / 物料需求 / 高级 JSON"
                @click="openNodeInspector(editingNodeId)"
              >
                <NIcon :size="14"><SettingsOutline /></NIcon>
              </NButton>
              <NButton size="tiny" quaternary circle title="关闭" @click="closeNodePanel">
                <NIcon :size="14"><CloseOutline /></NIcon>
              </NButton>
            </div>
          </header>

          <div class="node-panel-body">
            <!-- 左栏：上游输出连接点（Handle 术语见 terminology.ts）；
                 无上游时整栏隐藏、浮层收窄为单列（空态提示挪到底部一行） -->
            <section v-if="upstreamSources.length" class="node-panel-col upstream-col">
              <div class="node-panel-col-title">{{ TERMS.upstreamOutputs }}</div>
              <div
                v-for="source in upstreamSources"
                :key="source.nodeId"
                class="upstream-source"
              >
                <div class="upstream-source-name">
                  <strong>{{ source.label }}</strong>
                  <span>{{ source.device }}</span>
                </div>
                <div v-if="upstreamFieldsLoading(source.nodeId)" class="node-panel-hint">
                  读取输出 schema…
                </div>
                <div
                  v-else-if="!upstreamFieldsFor(source.nodeId).length"
                  class="node-panel-hint"
                >
                  该动作未声明输出字段
                </div>
                <div v-else class="upstream-chips">
                  <button
                    v-for="field in upstreamFieldsFor(source.nodeId)"
                    :key="field.key"
                    type="button"
                    class="chip source-chip"
                    :class="{
                      picked:
                        pendingBindSource?.nodeId === source.nodeId &&
                        pendingBindSource?.key === field.key,
                    }"
                    :title="field.label || field.key"
                    @click="pickBindSource(source, field.key)"
                  >
                    {{ field.key }}
                  </button>
                </div>
              </div>
              <div v-if="pendingBindSource" class="bind-pending">
                已选 <code>{{ pendingBindSource.key }}</code>——点右侧参数的「绑定」完成绑定
              </div>
            </section>

            <!-- 右栏：本节点输入参数（placeholder 下拉 + 置顶字段聚焦） -->
            <section class="node-panel-col params-col">
              <div class="node-panel-col-title">
                本节点输入参数
                <NButton
                  size="tiny"
                  quaternary
                  @click="variablesDrawerOpen = true"
                >
                  参数表
                </NButton>
              </div>
              <ActionParamFields
                :form="paramForm"
                list-in-table
                empty-text="当前没有参数字段，可在「全部设置」的高级 JSON 中添加。"
                @edit-list="editFieldInParameterTable"
              >
                <template #placeholder-actions="{ field }">
                  <NButton
                    v-if="pendingBindSource"
                    size="tiny"
                    type="primary"
                    secondary
                    @click="bindPendingTo(field.param)"
                  >
                    <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
                    绑定
                  </NButton>
                </template>
                <template #field-actions="{ field }">
                  <NSpace :size="2" align="center">
                    <NButton
                      v-if="pendingBindSource"
                      size="tiny"
                      type="primary"
                      secondary
                      @click="bindPendingTo(field.path)"
                    >
                      <template #icon><NIcon><ArrowBackOutline /></NIcon></template>
                      绑定
                    </NButton>
                    <NButton
                      v-if="focusedVariable(field.path)"
                      size="tiny"
                      quaternary
                      type="primary"
                      @click="unfocusParameter(field.path)"
                    >
                      <template #icon><NIcon><Star /></NIcon></template>
                      已置顶
                    </NButton>
                    <NButton
                      v-else
                      size="tiny"
                      quaternary
                      @click="focusParameter(field)"
                    >
                      <template #icon><NIcon><StarOutline /></NIcon></template>
                      置顶
                    </NButton>
                  </NSpace>
                </template>
              </ActionParamFields>
            </section>
          </div>

          <!-- 底部：传参绑定。@@@ 下钻路径由注册表 handle 模板预设，普通用户
               只做绑定/解绑；完整路径默认只读摘要（hover 看全貌），编辑收进
               「高级」折叠（clone 的 legacy 图偶发需要修预设路径，故保留不推荐）。 -->
          <footer v-if="panelMappingRows.length" class="node-panel-mappings">
            <div class="node-panel-col-title">
              传参绑定
              <small>路径由注册表预设，只需绑定/解绑</small>
            </div>
            <div
              v-for="row in panelMappingRows"
              :key="`bind-${row.edgeId}-${row.index}`"
              class="binding-row"
              :title="`完整路径：${row.sourceKey} -> ${row.targetSegments.join(' @@@ ')}`"
            >
              <span class="binding-source">
                {{ row.sourceNodeLabel }} · <code>{{ row.sourceKey }}</code>
              </span>
              <span class="panel-mapping-arrow"><NIcon :size="12"><ArrowForwardOutline /></NIcon></span>
              <span class="binding-target">
                <code>{{ row.targetSegments[row.targetSegments.length - 1] || "…" }}</code>
              </span>
              <span
                v-if="row.targetSegments.length > 1"
                class="binding-preset"
                title="含注册表预设的下钻取值段（hover 本行看完整路径）"
              >
                预设下钻 ×{{ row.targetSegments.length - 1 }}
              </span>
              <button
                type="button"
                class="chip remove-chip binding-remove"
                title="解绑该传参"
                @click="removeMappingRow(row)"
              >
                解绑
              </button>
            </div>
            <details class="mapping-advanced">
              <summary>高级：查看 / 编辑完整 @@@ 路径（注册表预设，一般无需改动）</summary>
              <div v-for="row in panelMappingRows" :key="`${row.edgeId}-${row.index}`" class="panel-mapping-row">
              <span class="chip origin-chip" :title="row.sourceNodeLabel">
                {{ row.sourceNodeLabel }}
              </span>
              <template v-if="isEditingSegment(row, -1)">
                <NInput
                  v-model:value="segmentDraft"
                  size="tiny"
                  class="segment-input"
                  placeholder="gjson 取值路径"
                  @blur="commitSegmentEdit"
                  @keyup.enter="commitSegmentEdit"
                />
              </template>
              <button
                v-else
                type="button"
                class="chip source-chip"
                title="点击编辑 gjson 取值路径"
                @click="beginSegmentEdit(row, -1)"
              >
                {{ row.sourceKey }}
              </button>
              <span class="panel-mapping-arrow"><NIcon :size="12"><ArrowForwardOutline /></NIcon></span>
              <template v-for="(segment, segIndex) in row.targetSegments" :key="segIndex">
                <span v-if="segIndex > 0" class="segment-sep">@@@</span>
                <NInput
                  v-if="isEditingSegment(row, segIndex)"
                  v-model:value="segmentDraft"
                  size="tiny"
                  class="segment-input"
                  :placeholder="segIndex === row.targetSegments.length - 1 ? '写入路径' : '下钻键'"
                  @blur="commitSegmentEdit"
                  @keyup.enter="commitSegmentEdit"
                />
                <button
                  v-else
                  type="button"
                  class="chip target-chip"
                  :class="{ 'set-chip': segIndex === row.targetSegments.length - 1 }"
                  :title="segIndex === row.targetSegments.length - 1
                    ? '写入参数路径（点击编辑；清空删除该段）'
                    : '下钻取值键（点击编辑；清空删除该段）'"
                  @click="beginSegmentEdit(row, segIndex)"
                >
                  {{ segment || "…" }}
                </button>
              </template>
              <NInput
                v-if="isEditingSegment(row, row.targetSegments.length)"
                v-model:value="segmentDraft"
                size="tiny"
                class="segment-input"
                placeholder="新分段"
                @blur="commitSegmentEdit"
                @keyup.enter="commitSegmentEdit"
              />
              <button
                v-else
                type="button"
                class="chip add-chip"
                title="追加 @@@ 分段"
                @click="appendSegment(row)"
              >
                +
              </button>
              <button
                type="button"
                class="chip remove-chip"
                title="删除映射"
                @click="removeMappingRow(row)"
              >
                <NIcon :size="13"><TrashOutline /></NIcon>
              </button>
              </div>
            </details>
          </footer>
          <footer v-else-if="upstreamSources.length" class="node-panel-mappings">
            <div class="node-panel-hint">
              点左栏输出{{ TERMS.handle }}，再点右栏参数的「绑定」即可完成绑定。
            </div>
          </footer>
          <footer v-else class="node-panel-mappings slim">
            <div class="node-panel-hint">
              暂无上游节点——连线后可把上游输出绑定到本节点参数。
            </div>
          </footer>
        </div>

        <div v-if="!nodeCount" class="empty-hint">
          点上方设备按钮选动作插入节点（也可拖入画布），或打开「模板」一键铺出整段流程
          （支持嵌套模板与待填充的空位）；<br />
          从节点右侧 OUT 拖到下一节点左侧 IN，<b>点击连线</b>可配置参数传递
          （父节点返回值写入子节点参数）；点击节点编辑参数与物料需求。
        </div>

        <!-- 画布操作提示：常驻悬浮小图标，hover 展开快捷键说明 -->
        <NPopover v-else trigger="hover" placement="top" :show-arrow="false">
          <template #trigger>
            <button type="button" class="canvas-help" aria-label="画布操作提示">
              <NIcon :size="16"><HelpCircleOutline /></NIcon>
            </button>
          </template>
          <div class="canvas-help-list">
            <div><kbd>右键</kbd><span>节点 / 连线 / 空白有更多操作</span></div>
            <div><kbd>拖动端点</kbd><span>改接已有连线</span></div>
            <div><kbd>Shift + 拖拽</kbd><span>框选多个节点</span></div>
            <div><kbd>Ctrl + Z</kbd><span>撤销</span></div>
            <div><kbd>Ctrl + C / V</kbd><span>复制粘贴</span></div>
            <div><kbd>Backspace / Delete</kbd><span>删除选中</span></div>
          </div>
        </NPopover>
      </div>
    </div>

    <!-- 右键菜单 -->
    <NDropdown
      trigger="manual"
      placement="bottom-start"
      :show="ctxMenu.show"
      :x="ctxMenu.x"
      :y="ctxMenu.y"
      :options="ctxOptions"
      size="small"
      @select="onCtxSelect"
      @clickoutside="ctxMenu.show = false"
    />

    <!-- 组框「流程说明」：来源模板的运行前准备 / 步骤 / 预期效果 -->
    <NModal
      :show="guideTemplate !== null"
      preset="card"
      :title="guideTemplate ? `${guideTemplate.name} · 流程说明` : ''"
      style="width: 560px; max-height: min(720px, calc(100vh - 48px))"
      content-style="overflow-y: auto"
      @update:show="(show: boolean) => { if (!show) guideTemplateId = '' }"
    >
      <TemplateGuide v-if="guideTemplate" :template="guideTemplate" />
    </NModal>

    <!-- 模板角色映射 -->
    <NModal
      v-model:show="roleModalOpen"
      preset="card"
      title="选择模板设备"
      style="width: 460px; max-height: min(600px, calc(100vh - 48px))"
      content-style="overflow-y: auto"
    >
      <div class="role-help">为模板中的每个设备角色选一台实际设备；也可以先留空，之后再补。</div>
      <!-- 设备包模板的运行前准备（出库、挂到哪个位点、确认设备在线）：绑定设备前先看一眼 -->
      <div v-if="pendingTemplatePreparation.length" class="role-preparation">
        <div class="role-preparation-title">运行前准备</div>
        <ol>
          <li v-for="(item, index) in pendingTemplatePreparation" :key="`prep-${index}`">{{ item }}</li>
        </ol>
      </div>
      <!-- 在线设备平铺成 chip 点选（无下拉、不会被弹窗裁剪），再点一次取消；也可手输 -->
      <div v-for="role in pendingRoles" :key="role.role" class="role-row">
        <span class="role-label">
          {{ role.label }}
          <small>{{ role.role }}</small>
        </span>
        <div v-if="roleDeviceOptions.length" class="role-chips">
          <button
            v-for="opt in roleDeviceOptions"
            :key="opt.value"
            type="button"
            class="role-chip"
            :class="{ active: roleSelections[role.role] === opt.value }"
            @click="
              roleSelections[role.role] =
                roleSelections[role.role] === opt.value ? '' : opt.value
            "
          >
            {{ opt.label }}
          </button>
        </div>
        <NInput
          v-model:value="roleSelections[role.role]"
          size="small"
          placeholder="或输入设备 ID（留空稍后补）"
          clearable
        />
      </div>
      <NSpace justify="end" style="margin-top: 16px">
        <NButton size="small" @click="roleModalOpen = false">取消</NButton>
        <NButton size="small" type="primary" @click="confirmRoleModal">
          {{ pendingFillSlotId ? "填充空位" : "插入模板" }}
        </NButton>
      </NSpace>
    </NModal>

    <!-- 空位填充：设备动作 / 模板 二选一 -->
    <NModal
      v-model:show="slotFillOpen"
      preset="card"
      :title="`填充空位 · ${fillingSlotLabel}`"
      style="width: 640px"
    >
      <NTabs type="segment" size="small" animated>
        <NTabPane name="action" tab="设备动作">
          <div class="fill-picker">
            <NodePickerPanel @insert="fillSlotWithAction" />
          </div>
        </NTabPane>
        <NTabPane name="template" tab="模板">
          <div class="fill-templates">
            <TemplatePanel
              mode="picker"
              :templates="templateList"
              :registry="templateRegistry"
              @pick="fillSlotWithTemplate"
            />
          </div>
        </NTabPane>
      </NTabs>
    </NModal>

    <!-- 存为模板 -->
    <NModal
      v-model:show="saveTplOpen"
      preset="card"
      title="把当前画布存为模板"
      style="width: 420px"
    >
      <NSpace vertical :size="10">
        <NInput
          v-model:value="saveTplName"
          size="small"
          placeholder="模板名称，如 我的合成流程"
          @keyup.enter="confirmSaveTemplate"
        />
        <NInput
          v-model:value="saveTplDesc"
          size="small"
          placeholder="一句话描述（可选）"
        />
        <div class="role-help">保存后可在其他流程中直接插入，插入时可整体换设备。</div>
      </NSpace>
      <NSpace justify="end" style="margin-top: 16px">
        <NButton size="small" @click="saveTplOpen = false">取消</NButton>
        <NButton size="small" type="primary" @click="confirmSaveTemplate">保存</NButton>
      </NSpace>
    </NModal>

    <!-- 特殊节点编辑：人工确认 / 条件分支 -->
    <NModal
      v-model:show="specialEditOpen"
      preset="card"
      :title="specialEditKind === 'manual' ? `人工确认 · ${specialEditId}` : `条件分支 · ${specialEditId}`"
      style="width: 440px"
    >
      <template v-if="specialEditKind === 'manual'">
        <NSpace vertical :size="10">
          <div>
            <div class="field-label">标题</div>
            <NInput v-model:value="manualLabel" size="small" placeholder="人工确认" />
          </div>
          <div>
            <div class="field-label">提示语（运行时展示给操作员）</div>
            <NInput
              v-model:value="manualPrompt"
              type="textarea"
              :rows="3"
              size="small"
              placeholder="如：确认反应瓶已固定、通风橱已关闭"
            />
          </div>
          <div>
            <div class="field-label">
              指派人
              <span class="field-muted">
                {{ manualAssigneesExplicit ? (manualAssignees.length ? "仅名单可确认" : "已明确为空列表，任何人可确认") : "尚未决定" }}
              </span>
            </div>
            <NSelect
              v-model:value="manualAssignees"
              multiple
              tag
              filterable
              clearable
              size="small"
              :options="manualAssignees.map((id) => ({ label: id, value: id }))"
              placeholder="输入用户 id 后回车添加；清空后仍会提交空列表"
              @update:value="manualAssigneesExplicit = true"
            />
            <NButton
              v-if="!manualAssigneesExplicit || manualAssignees.length"
              size="tiny"
              secondary
              style="margin-top: 6px"
              @click="manualAssignees = []; manualAssigneesExplicit = true"
            >
              明确为空列表（不指派）
            </NButton>
          </div>
          <NSpace :size="8">
            <div style="width: 150px">
              <div class="field-label">超时（秒）</div>
              <NInputNumber v-model:value="manualTimeoutS" size="small" :min="1" :step="60" />
            </div>
            <div style="flex: 1">
              <div class="field-label">执行节点</div>
              <NSelect
                v-model:value="manualHostId"
                :options="manualHostOptions"
                :disabled="manualHostOptions.length <= 1"
                size="small"
                placeholder="host_node"
              />
            </div>
          </NSpace>
          <div class="role-help">
            提交为执行节点上的 <code>manual_confirm</code> 动作（always-free，不占设备锁）；运行到这里暂停，
            {{ !manualAssigneesExplicit ? "先明确指派列表" : (manualAssignees.length ? "指派人" : "任何人") }}在运行详情页确认后继续，超时未确认按失败处理。
            {{ manualConfirmHosts.length > 1 ? `当前有 ${manualConfirmHosts.length} 个执行节点上报了该动作，可以选择由谁执行。` : "" }}
          </div>
        </NSpace>
      </template>
      <template v-else>
        <NSpace vertical :size="10">
          <div>
            <div class="field-label">参数表变量</div>
            <NSelect
              v-model:value="branchVariableId"
              :options="branchVariableOptions"
              size="small"
              filterable
              placeholder="从参数表选择变量（先在参数表置顶字段）"
            />
          </div>
          <NSpace :size="8">
            <div style="width: 110px">
              <div class="field-label">比较</div>
              <NSelect v-model:value="branchOp" :options="BRANCH_OPS" size="small" />
            </div>
            <div style="flex: 1">
              <div class="field-label">对比值</div>
              <NInput v-model:value="branchValue" size="small" placeholder="如 300 / true / 后处理" />
            </div>
          </NSpace>
          <div class="role-help">条件成立走绿色出口，不成立走红色出口；另一条路上的节点不会执行。</div>
        </NSpace>
      </template>
      <NSpace justify="end" style="margin-top: 16px">
        <NButton size="small" @click="specialEditOpen = false">取消</NButton>
        <NButton size="small" type="primary" @click="saveSpecialEditor">保存</NButton>
      </NSpace>
    </NModal>

    <!-- 重复片段 ×N（for 循环的配置时展开） -->
    <NModal
      v-model:show="repeatModalOpen"
      preset="card"
      title="重复片段"
      style="width: 380px"
    >
      <NSpace vertical :size="10">
        <div class="role-help">把选中的 {{ repeatSeedIds.length }} 个节点依次复制 N 份，每份可单独改参数。</div>
        <div>
          <div class="field-label">总份数 N</div>
          <NInputNumber
            v-model:value="repeatCount"
            size="small"
            :min="2"
            :max="20"
            style="width: 140px"
          />
        </div>
      </NSpace>
      <NSpace justify="end" style="margin-top: 16px">
        <NButton size="small" @click="repeatModalOpen = false">取消</NButton>
        <NButton size="small" type="primary" @click="confirmRepeat">展开</NButton>
      </NSpace>
    </NModal>

    <!-- 循环配置：编辑 / 包成循环 / 插入空循环 -->
    <NModal v-model:show="loopEditOpen" preset="card" :title="loopEditTitle" style="width: 480px">
      <NSpace vertical :size="10">
        <NSpace :size="8">
          <div style="width: 160px">
            <div class="field-label">循环方式</div>
            <NSelect
              :value="loopForm.mode"
              :options="LOOP_MODE_OPTIONS"
              size="small"
              @update:value="(mode: LoopMode) => onLoopModeChange(mode)"
            />
          </div>
          <div style="flex: 1">
            <div class="field-label">标题</div>
            <NInput v-model:value="loopForm.label" size="small" :placeholder="describeLoopNode(loopForm)" />
          </div>
        </NSpace>
        <template v-if="loopForm.mode === 'for'">
          <NSpace :size="8">
            <div style="width: 160px">
              <div class="field-label">重复次数</div>
              <NInputNumber v-model:value="loopForm.count" size="small" :min="1" :max="100000" />
            </div>
            <div style="width: 160px">
              <div class="field-label">每轮间隔（秒）</div>
              <NInputNumber v-model:value="loopForm.intervalSeconds" size="small" :min="0" :step="0.5" />
            </div>
          </NSpace>
          <div class="role-help">
            循环体每轮重新执行，运行页按轮次显示。循环体节点的参数里可以写
            <code v-pre>{{loop.iteration}}</code>（第几轮，从 1 起）、<code v-pre>{{loop.index}}</code>（从 0 起）、
            <code v-pre>{{loop.count}}</code>（总轮数），整个值恰为占位符时保持数字类型。
          </div>
        </template>
        <template v-else>
          <div>
            <div class="field-label">继续条件的数据源</div>
            <NSelect v-model:value="loopForm.conditionSource" :options="LOOP_SOURCE_OPTIONS" size="small" />
          </div>
          <NSpace v-if="loopForm.conditionSource === 'device_state'" :size="8">
            <div style="flex: 1; min-width: 180px">
              <div class="field-label">设备</div>
              <NSelect v-model:value="loopForm.deviceId" :options="loopDeviceOptions" size="small" filterable tag placeholder="设备 id" />
            </div>
            <div style="flex: 1; min-width: 180px">
              <div class="field-label">状态字段</div>
              <NSelect
                v-model:value="loopForm.field"
                :options="loopFieldOptions"
                size="small"
                filterable
                tag
                placeholder="设备上报的状态字段名"
              />
            </div>
          </NSpace>
          <NSpace v-else :size="8">
            <div style="flex: 1; min-width: 220px">
              <div class="field-label">被判定的节点</div>
              <NSelect
                v-model:value="loopForm.conditionNodeId"
                :options="loopNodeOptions"
                size="small"
                filterable
                placeholder="取该节点最近一次的返回值"
              />
            </div>
            <div style="width: 150px">
              <div class="field-label">返回值里的字段</div>
              <NInput v-model:value="loopForm.dataKey" size="small" placeholder="如 ready / temperature" />
            </div>
          </NSpace>
          <NSpace :size="8">
            <div style="width: 150px">
              <div class="field-label">比较</div>
              <NSelect v-model:value="loopForm.op" :options="LOOP_OP_OPTIONS" size="small" />
            </div>
            <div style="flex: 1">
              <div class="field-label">对比值</div>
              <NInput
                v-model:value="loopForm.value"
                size="small"
                :disabled="loopForm.op === 'exists'"
                placeholder="如 80 / true / ready（数字、布尔按 JSON 解析）"
              />
            </div>
          </NSpace>
          <NSpace :size="8">
            <div style="width: 150px">
              <div class="field-label">判定间隔（秒）</div>
              <NInputNumber v-model:value="loopForm.intervalSeconds" size="small" :min="0" :step="0.5" />
            </div>
            <div style="width: 150px">
              <div class="field-label">最多轮数（保护）</div>
              <NInputNumber v-model:value="loopForm.maxIterations" size="small" :min="1" :max="100000" />
            </div>
          </NSpace>
          <div class="role-help">
            每轮开始前判定：<b>{{ describeLoopNode(loopForm) }}</b>——成立就再执行一轮循环体，不成立结束循环。
            设备状态取设备最新上报的字段值；节点返回值取该节点最近一次成功的结果，它还没产出时循环体先跑一轮
            （"重复直到达标"就是把探测步骤放进循环体、条件引用它）。达到最多轮数仍未结束按失败处理。
            循环体为空时就是"等到某状态"，必须设判定间隔。
          </div>
        </template>
      </NSpace>
      <NSpace justify="end" style="margin-top: 16px">
        <NButton size="small" @click="loopEditOpen = false">取消</NButton>
        <NButton size="small" type="primary" @click="saveLoopEditor">
          {{ loopEditTarget.kind === "edit" ? "保存" : loopEditTarget.kind === "wrap" ? "包成循环" : "插入" }}
        </NButton>
      </NSpace>
    </NModal>

    <!-- 节点检查器 -->
    <NDrawer v-model:show="nodeDrawerOpen" :width="380" placement="right">
      <NDrawerContent :title="`节点全部设置 · ${editingNodeId}`" closable>
        <NSpace vertical :size="12">
          <div>
            <div class="field-label">设备 ID</div>
            <NInput v-model:value="editDevice" size="small" />
          </div>
          <div>
            <div class="field-label">动作名</div>
            <NInput v-model:value="editAction" size="small" />
          </div>
          <div>
            <div class="field-label">动作类型</div>
            <NInput v-model:value="editActionType" size="small" placeholder="goal" />
          </div>
          <div>
            <div class="field-label">动作参数</div>
            <small class="drawer-param-hint">
              参数逐项编辑在画布节点浮层完成（点击节点弹出）；这里仅保留协议原始值。
            </small>
            <details class="advanced-json" open>
              <summary>高级 JSON · 协议原始值</summary>
              <NInput
                v-model:value="editParam"
                type="textarea"
                :rows="8"
                style="font-family: var(--font-mono); font-size: 12px; margin-top: 8px"
              />
            </details>
          </div>
          <div>
            <NSpace align="center" justify="space-between">
              <span class="field-label" style="margin-bottom: 0">物料需求</span>
              <NSwitch v-model:value="useRequirements" size="small" />
            </NSpace>
            <template v-if="useRequirements">
              <NInput
                v-model:value="reqTemplate"
                size="small"
                placeholder="模板 ID，如 reagent-naoh"
                style="margin-top: 6px"
              />
              <NSpace style="margin-top: 6px">
                <NInputNumber
                  v-model:value="reqQuantity"
                  size="small"
                  placeholder="数量"
                  :min="0.001"
                  style="width: 140px"
                />
                <NInput
                  v-model:value="reqUnit"
                  size="small"
                  placeholder="单位"
                  style="width: 90px"
                />
              </NSpace>
            </template>
          </div>
          <NSpace justify="space-between" style="margin-top: 8px">
            <NButton size="small" type="error" secondary @click="deleteNode">
              删除节点
            </NButton>
            <NButton size="small" type="primary" @click="saveNode">保存</NButton>
          </NSpace>
        </NSpace>
      </NDrawerContent>
    </NDrawer>

    <!-- 连线检查器：参数传递 -->
    <NDrawer v-model:show="edgeDrawerOpen" :width="420" placement="right">
      <NDrawerContent :title="`连线 ${editingEdgeDesc}`" closable>
        <div class="edge-direction">
          <div>
            <span>输出节点</span>
            <strong>{{ edgeSourceNode?.data.actionName ?? editingEdgeSource }}</strong>
            <small>{{ edgeSourceNode?.data.deviceId ?? editingEdgeSource }}</small>
          </div>
          <b><NIcon :size="18"><ArrowForwardOutline /></NIcon></b>
          <div>
            <span>输入节点</span>
            <strong>{{ edgeTargetNode?.data.actionName ?? editingEdgeTarget }}</strong>
            <small>{{ edgeTargetNode?.data.deviceId ?? editingEdgeTarget }}</small>
          </div>
        </div>
        <div class="edge-help">
          从左侧节点的执行结果按 <b>gjson 路径</b>取值，经 <b>sjson 路径</b>写入右侧节点参数
          （对齐云端 <code>@@@</code> 传参语义）。例如父节点返回
          <code>{"wait_s": 300}</code>，取值路径 <code>wait_s</code> 写入路径
          <code>time</code>，子节点参数里 <code>time</code> 就是 300。
        </div>

        <div v-for="(m, i) in edgeMappings" :key="i" class="mapping-row">
          <label>
            <span>左侧输出{{ TERMS.handle }}</span>
            <NSelect
              v-model:value="m.sourceKey"
              :options="edgeSourcePathOptions"
              size="small"
              filterable
              tag
              placeholder="如 created_resource_tree"
            />
          </label>
          <span class="mapping-arrow"><NIcon :size="14"><ArrowForwardOutline /></NIcon></span>
          <label>
            <span>右侧输入参数</span>
            <NSelect
              v-model:value="m.targetKey"
              :options="edgeTargetPathOptions"
              size="small"
              filterable
              tag
              placeholder="如 temperature"
            />
          </label>
          <NButton size="tiny" quaternary type="error" @click="removeMapping(i)">
            <NIcon :size="14"><CloseOutline /></NIcon>
          </NButton>
        </div>

        <NButton size="small" dashed block style="margin-top: 8px" @click="addMapping">
          + 添加参数传递
        </NButton>

        <NSpace justify="space-between" style="margin-top: 20px">
          <NButton size="small" type="error" secondary @click="deleteEdge">删除连线</NButton>
          <NButton size="small" type="primary" @click="saveEdge">保存</NButton>
        </NSpace>
      </NDrawerContent>
    </NDrawer>

    <WorkflowVariablesDrawer
      :show="variablesDrawerOpen"
      :variables="workflowVariables"
      :nodes="variableNodes"
      @update:show="variablesDrawerOpen = $event"
      @update:variables="updateVariables"
    />

    <!-- 试运行报告：本地静态校验（不提交、不下发设备动作），条目点击定位节点 -->
    <NDrawer v-model:show="dryRunOpen" placement="bottom" :height="340">
      <NDrawerContent closable>
        <template #header>
          <NSpace align="center" :size="8">
            <span>试运行报告</span>
            <NTag
              v-if="dryRunReport && !dryRunRunning"
              size="small"
              :bordered="false"
              :type="
                dryRunReport.errorCount
                  ? 'error'
                  : dryRunReport.warningCount
                    ? 'warning'
                    : 'success'
              "
            >
              {{ dryRunSummary }}
            </NTag>
            <span class="dry-run-subtitle">本地静态校验 · 不提交、不下发设备动作</span>
          </NSpace>
        </template>
        <div v-if="dryRunRunning" class="dry-run-loading">正在校验（拉取动作 schema 与物料批次）…</div>
        <template v-else-if="dryRunReport">
          <div v-if="!dryRunReport.issues.length" class="dry-run-pass">
            全部检查通过：未填参数 / 引用绑定 / 参数映射 / DAG 结构 / 物料需求均无问题。
          </div>
          <ul v-else class="dry-run-list">
            <li
              v-for="(issue, index) in dryRunReport.issues"
              :key="index"
              class="dry-run-item"
              :class="issue.level"
              :title="issue.nodeId ? '点击定位节点' : undefined"
              @click="void locateIssue(issue)"
            >
              <NTag
                size="small"
                :bordered="false"
                :type="issue.level === 'error' ? 'error' : 'warning'"
              >
                {{ issue.level === "error" ? "错误" : "警告" }}
              </NTag>
              <span v-if="issue.nodeLabel" class="dry-run-node">
                {{ issue.nodeLabel }}
                <code v-if="issue.nodeId">{{ issue.nodeId }}</code>
              </span>
              <span class="dry-run-msg">{{ issue.message }}</span>
            </li>
          </ul>
          <p v-for="note in dryRunReport.notes" :key="note" class="dry-run-footnote">
            {{ note }}
          </p>

          <!-- 物料扣减模拟：全图累计需求 vs 当前可用批次 -->
          <section class="deduction">
            <div class="deduction-head">
              <span class="deduction-title">物料扣减模拟</span>
              <span class="dry-run-subtitle">
                {{
                  dryRunReport.deductions.length
                    ? `${dryRunReport.deductions.length} 种可计量物料 · ${dryRunReport.deductions.filter((row) => row.status === "short").length} 种不足`
                    : "本图没有声明可计量物料需求（节点「物料需求」为空）"
                }}
              </span>
            </div>
            <table v-if="dryRunReport.deductions.length" class="deduction-table">
              <thead>
                <tr>
                  <th>物料</th><th>全图需求</th><th>当前可用</th><th>运行后余量</th><th>批次</th><th>状态</th><th>涉及节点</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in dryRunReport.deductions" :key="row.template_id" :class="`deduction-${row.status}`">
                  <td>
                    <span class="deduction-name">{{ row.template_name }}</span>
                    <code v-if="row.template_name !== row.template_id">{{ row.template_id.slice(0, 8) }}</code>
                  </td>
                  <td class="mono">{{ row.required }} {{ row.unit }}</td>
                  <td class="mono">{{ row.available === null ? "—" : `${row.available} ${row.unit}` }}</td>
                  <td class="mono">{{ row.remaining === null ? "—" : `${row.remaining} ${row.unit}` }}</td>
                  <td class="mono">{{ row.available === null ? "—" : `${row.lotCount}${row.excludedLots ? ` (+${row.excludedLots} 隔离/过期)` : ""}` }}</td>
                  <td>{{ DEDUCTION_STATUS_LABEL[row.status] }}</td>
                  <td class="deduction-nodes">{{ row.nodes.join("、") }}</td>
                </tr>
              </tbody>
            </table>
          </section>
        </template>
      </NDrawerContent>
    </NDrawer>
  </div>
</template>

<style scoped>
/* app-fill：外壳把 stage-canvas 锁满可视高度，画布随之吃满剩余空间 */
.editor-layout {
  display: flex;
  flex-direction: column;
  min-height: 480px;
  gap: 10px;
}

.editor-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 12px;
  padding: 8px 12px;
}

.wf-prefix {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #a6acb5;
}

.draft-hint {
  font-family: var(--font-mono);
  font-size: 11px;
  color: #a6acb5;
}

.button-count {
  display: inline-flex;
  min-width: 16px;
  height: 16px;
  margin-left: 5px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  color: #fff;
  background: #2e5bff;
  font: 9px var(--font-mono);
}

.editor-body {
  flex: 1;
  min-height: 0;
  display: flex;
}

/* 画布右上悬浮操作条：状态徽标 + 试运行 / 提交检查 */
.canvas-actions {
  position: absolute;
  top: 10px;
  right: 10px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 6px;
  max-width: min(44%, 560px);
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e8e6e1;
  border-radius: 10px;
  box-shadow: 0 8px 22px rgb(23 27 32 / 8%);
  backdrop-filter: blur(4px);
}

/* 画布左上悬浮节点库：设备平铺 chip + 模板 / 特殊 / 手动 */
.canvas-library {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 10;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  max-width: min(52%, 760px);
  padding: 6px 8px;
  background: rgba(255, 255, 255, 0.94);
  border: 1px solid #e8e6e1;
  border-radius: 10px;
  box-shadow: 0 8px 22px rgb(23 27 32 / 8%);
  backdrop-filter: blur(4px);
}

.lib-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 168px;
  padding: 4px 10px;
  border: 1px solid #e4e2dc;
  border-radius: 999px;
  background: #fff;
  color: #3d434c;
  font: 600 11.5px var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: 140ms ease;
}

.lib-chip:hover {
  border-color: #c8cdd6;
  background: #f7f8fa;
}

.lib-chip.open {
  border-color: var(--domain-accent, #2e5bff);
  color: var(--domain-accent, #2e5bff);
  background: #f4f7ff;
}

.lib-chip.offline {
  color: #9aa1aa;
  font-weight: 500;
}

.lib-chip:disabled {
  cursor: default;
  opacity: 0.7;
}

.lib-dot {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.lib-divider {
  flex-shrink: 0;
  width: 1px;
  height: 16px;
  background: #e4e2dc;
}

/* 库菜单浮层（raw popover，自带白底卡片样式） */
.lib-menu {
  width: 312px;
  max-height: min(420px, calc(100vh - 220px));
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: 8px;
  background: #fff;
  border: 1px solid #e4e2dc;
  border-radius: 12px;
  box-shadow: 0 14px 36px rgb(23 27 32 / 14%);
}

.lib-menu.wide {
  width: 340px;
}

.lib-menu.manual {
  display: grid;
  gap: 8px;
}

.lib-menu-title {
  margin: 2px 4px 8px;
  color: #9aa1aa;
  font-size: 10.5px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-menu-hint {
  margin: 0 4px 8px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #fff7ed;
  color: #9a3412;
  font-size: 11px;
  line-height: 1.4;
}

.lib-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  width: 100%;
  padding: 7px 9px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  text-align: left;
  font-size: 12px;
  color: #3f3f46;
  cursor: pointer;
}

.lib-action:hover {
  background: #f0f4ff;
}

.lib-action-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.lib-action-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-action-alias {
  font-size: 10.5px;
  color: #8b929c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lib-action-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

/* 参数数量徽标：一眼看出插入后要填多少东西 */
.lib-action-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #3d4650;
  background: #eef0f3;
  border-radius: 999px;
  padding: 1px 7px;
  white-space: nowrap;
}

.lib-action-count.zero {
  color: #9aa1aa;
  background: transparent;
  border: 1px dashed #d9dde3;
}

.lib-menu-empty {
  padding: 14px 8px;
  color: #9aa1aa;
  font-size: 11.5px;
  text-align: center;
}

/* 模板面板嵌入库菜单：去掉自带卡片边框，由菜单容器统一提供 */
.lib-menu.wide :deep(.tpl-panel) {
  border: 0;
  box-shadow: none;
  padding: 0;
}

/* 空位填充弹窗里的设备面板铺满弹窗宽度 */
.fill-picker :deep(.picker) {
  width: 100%;
  max-height: 420px;
  box-shadow: none;
  border: 1px solid #e8e6e1;
}

.fill-templates {
  max-height: 420px;
  overflow-y: auto;
}

.role-help {
  margin-bottom: 12px;
  padding: 9px 11px;
  border: 1px solid #f0eee9;
  border-radius: 8px;
  background: #fbfaf8;
  color: #6e7580;
  font-size: 11.5px;
  line-height: 1.65;
}

.role-help code {
  font-family: var(--font-mono);
  font-size: 10.5px;
  background: #f0eee9;
  padding: 1px 4px;
  border-radius: 4px;
}

.specials-list {
  display: grid;
  gap: 8px;
  align-content: start;
}

.special-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 11px 12px;
  border: 1px solid #e8e6e1;
  border-radius: 10px;
  background: #fff;
  cursor: grab;
  transition: border-color 0.15s, box-shadow 0.15s;
}

.special-card:hover {
  box-shadow: 0 3px 10px rgba(0, 0, 0, 0.08);
}

.special-manual:hover {
  border-color: #f59e0b;
}

.special-slot:hover {
  border-color: #a78bfa;
}

.special-branch:hover {
  border-color: #06b6d4;
}

.special-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #f4f2ee;
  font-size: 15px;
}

.special-manual .special-icon {
  background: #fef3c7;
  color: #b45309;
}

.special-slot .special-icon {
  background: #f3e8ff;
  color: #7c3aed;
  font-weight: 700;
}

.special-branch .special-icon {
  background: #cffafe;
  color: #0e7490;
  font-weight: 700;
}

.special-text {
  min-width: 0;
}

.special-text b {
  display: block;
  font-size: 12.5px;
  color: #26282d;
}

.special-text small {
  display: block;
  margin-top: 2px;
  color: #8d949d;
  font-size: 10.5px;
  line-height: 1.5;
}

.role-preparation {
  margin-bottom: 12px;
  padding: 9px 11px;
  border: 1px solid #d9e2fb;
  border-radius: 8px;
  background: #f8faff;
  color: #3d434c;
  font-size: 11.5px;
  line-height: 1.65;
}

.role-preparation-title {
  margin-bottom: 4px;
  font-weight: 600;
  color: #2e5bff;
}

.role-preparation ol {
  margin: 0;
  padding-left: 18px;
}

.role-row {
  display: flex;
  flex-direction: column;
  gap: 7px;
  margin-top: 12px;
}

.role-row + .role-row {
  padding-top: 12px;
  border-top: 1px dashed #efede8;
}

.role-label {
  font-size: 12px;
  font-weight: 600;
  color: #26282d;
}

.role-label small {
  margin-left: 6px;
  color: #9aa1aa;
  font: 9.5px var(--font-mono);
}

/* 在线设备平铺 chip：点选即映射，再点取消 */
.role-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.role-chip {
  max-width: 100%;
  padding: 4px 11px;
  border: 1px solid #e4e2dc;
  border-radius: 999px;
  background: #fff;
  color: #3d434c;
  font: 11.5px var(--font-sans);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: 140ms ease;
}

.role-chip:hover {
  border-color: #c8cdd6;
  background: #f7f8fa;
}

.role-chip.active {
  border-color: var(--domain-accent, #2e5bff);
  background: var(--domain-accent, #2e5bff);
  color: #fff;
}

.editor-canvas {
  position: relative;
  flex: 1;
  min-width: 0;
  background: #fff;
  border: 1px solid #e8e6e1;
  border-radius: 12px;
  overflow: hidden;
}

.editor-canvas :deep(.vue-flow) {
  width: 100%;
  height: 100%;
}

/* 连线上的传参标签 */
.editor-canvas :deep(.vue-flow__edge-textbg) {
  fill: #eef3ff;
}
.editor-canvas :deep(.vue-flow__edge-text) {
  font-family: var(--font-mono);
  font-size: 10px;
  fill: #2e5bff;
}

/* 边 hover / 选中反馈：厚命中区 + 明显高亮，方便点选配置传参 */
.editor-canvas :deep(.vue-flow__edge) {
  cursor: pointer;
}
.editor-canvas :deep(.vue-flow__edge:hover .vue-flow__edge-path),
.editor-canvas :deep(.vue-flow__edge.selected .vue-flow__edge-path) {
  stroke: #2e5bff;
  stroke-width: 2.5;
}

/* 边端点重连把手（edges-updatable）。注意不能用 CSS r 缩小圆点：
   updater 圆的 r 就是拖拽命中半径，缩了就抓不住。 */
.editor-canvas :deep(.vue-flow__edgeupdater) {
  cursor: move;
  fill: transparent;
  stroke: transparent;
  stroke-width: 1.5;
  transition: fill 0.15s, stroke 0.15s;
}
.editor-canvas :deep(.vue-flow__edge:hover .vue-flow__edgeupdater),
.editor-canvas :deep(.vue-flow__edge.selected .vue-flow__edgeupdater) {
  fill: rgba(46, 91, 255, 0.12);
  stroke: #2e5bff;
}

.canvas-help {
  position: absolute;
  bottom: 12px;
  left: 50%;
  transform: translateX(-50%);
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid #e4e2dc;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.94);
  color: #9aa1aa;
  cursor: help;
  transition: 140ms ease;
}

.canvas-help:hover {
  color: #3d434c;
  border-color: #cfd4dc;
  box-shadow: 0 4px 14px rgb(23 27 32 / 10%);
}

.empty-hint {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  color: #a6acb5;
  font-size: 13px;
  text-align: center;
  line-height: 2;
  pointer-events: none;
}

/* ── 节点参数浮层（hover-tip 式，锚定节点顶部） ── */

.node-panel {
  position: absolute;
  z-index: 12;
  width: min(620px, calc(100% - 24px));
  transform: translate(-50%, -100%);
  background: var(--panel, #fdfdfb);
  border: 1px solid var(--hairline, #e8e6e1);
  border-radius: 12px;
  box-shadow: 0 12px 32px rgba(28, 30, 34, 0.14);
  display: flex;
  flex-direction: column;
  /* maxHeight 由锚点按画布可用空间内联计算；超出部分各栏内部滚动 */
  overflow: hidden;
}

.node-panel.below {
  transform: translate(-50%, 0);
}

/* 无上游节点：左栏整体隐藏，浮层收窄为单列（不再为空态占一栏宽） */
.node-panel.single-col {
  width: min(400px, calc(100% - 24px));
}

.node-panel-arrow {
  position: absolute;
  bottom: -6px;
  left: 50%;
  width: 12px;
  height: 12px;
  transform: translateX(-50%) rotate(45deg);
  background: var(--panel, #fdfdfb);
  border-right: 1px solid var(--hairline, #e8e6e1);
  border-bottom: 1px solid var(--hairline, #e8e6e1);
}

.node-panel.below .node-panel-arrow {
  bottom: auto;
  top: -6px;
  border: none;
  border-left: 1px solid var(--hairline, #e8e6e1);
  border-top: 1px solid var(--hairline, #e8e6e1);
}

.node-panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 10px 8px 14px;
  background: #fafaf8;
  border-bottom: 1px solid var(--hairline, #e8e6e1);
}

/* 标题两行：动作名 + 设备·节点 id，超长各自省略，不与按钮混排 */
.node-panel-title {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}

.node-panel-title strong,
.node-panel-title span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.node-panel-title strong {
  font-size: 13px;
  letter-spacing: -0.01em;
}

.node-panel-title span {
  color: #9aa1aa;
  font-size: 10px;
  font-family: var(--font-mono);
}

.node-panel-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 2px;
}

.node-panel-body {
  display: flex;
  gap: 0;
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;
}

.node-panel-col {
  flex: 1;
  min-width: 0;
  padding: 10px 12px;
  overflow-y: auto;
}

.upstream-col {
  flex: 0 0 44%;
  border-right: 1px dashed var(--hairline, #e8e6e1);
  background: var(--panel-soft, #faf9f5);
  border-radius: 0 0 0 12px;
}

.node-panel-col-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
  font-size: 11px;
  font-weight: 600;
  color: #6e7580;
  letter-spacing: 0.04em;
}

.node-panel-col-title small {
  font-weight: 400;
  color: #9aa1aa;
  font-size: 10px;
}

.node-panel-hint {
  color: #9aa1aa;
  font-size: 11px;
  line-height: 1.7;
}

.upstream-source {
  margin-bottom: 10px;
}

.upstream-source-name {
  margin-bottom: 5px;
  font-size: 11px;
}

.upstream-source-name strong {
  color: #3d434c;
}

.upstream-source-name span {
  margin-left: 6px;
  color: #9aa1aa;
  font-family: var(--font-mono);
  font-size: 10px;
}

.upstream-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.chip {
  display: inline-flex;
  align-items: center;
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid var(--hairline, #e8e6e1);
  background: #fff;
  color: #3d434c;
  font-family: var(--font-mono);
  font-size: 11px;
  line-height: 1.5;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
}

.chip:hover {
  border-color: #2e5bff;
  color: #2e5bff;
}

.source-chip.picked {
  border-color: #2e5bff;
  background: #eef3ff;
  color: #2e5bff;
}

.origin-chip {
  cursor: default;
  background: var(--panel-soft, #faf9f5);
  color: #6e7580;
  font-family: inherit;
}

.target-chip.set-chip {
  border-color: #b7c6ff;
  background: #eef3ff;
  color: #2e5bff;
}

.add-chip {
  padding: 2px 7px;
  color: #9aa1aa;
}

.remove-chip {
  border: none;
  background: transparent;
  padding: 2px 4px;
}

.bind-pending {
  margin-top: 6px;
  padding: 6px 8px;
  border-radius: 8px;
  background: #eef3ff;
  color: #2e5bff;
  font-size: 11px;
}

.bind-pending code {
  font-family: var(--font-mono);
}

.node-panel-mappings {
  flex-shrink: 0;
  padding: 8px 12px 10px;
  border-top: 1px solid var(--hairline, #e8e6e1);
  max-height: 20vh;
  overflow-y: auto;
}

.node-panel-mappings.slim {
  padding: 6px 12px;
}

/* 绑定行：来源节点 · 输出 → 输入参数 + 解绑（@@@ 细节收进「高级」） */
.binding-row {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 3px 0;
  font-size: 11px;
}

.binding-source {
  overflow: hidden;
  color: #6e7580;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.binding-source code,
.binding-target code {
  font-family: var(--font-mono);
  font-size: 11px;
}

.binding-source code {
  color: #2563eb;
}

.binding-target {
  overflow: hidden;
  color: #16803c;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.binding-preset {
  flex-shrink: 0;
  padding: 0 5px;
  color: #8a6d1f;
  font-size: 9px;
  line-height: 15px;
  background: #faf3dd;
  border: 1px solid #eddfae;
  border-radius: 8px;
}

.binding-remove {
  margin-left: auto;
  flex-shrink: 0;
}

.mapping-advanced {
  margin-top: 6px;
  color: #9aa1aa;
  font-size: 10.5px;
}

.mapping-advanced summary {
  cursor: pointer;
  user-select: none;
}

.panel-mapping-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 0;
}

.panel-mapping-arrow {
  display: inline-flex;
  align-items: center;
  color: #9aa1aa;
  font-size: 12px;
}

.segment-sep {
  color: #c2c8d0;
  font-family: var(--font-mono);
  font-size: 10px;
}

.segment-input {
  width: 120px;
}

.drawer-param-hint {
  display: block;
  margin-bottom: 6px;
  color: #9aa1aa;
  font-size: 10.5px;
  line-height: 1.6;
}

.field-label {
  font-size: 12px;
  color: #6e7580;
  margin-bottom: 4px;
}

.field-muted {
  margin-left: 5px;
  color: #9aa1aa;
  font-size: 10px;
}

.parameter-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 8px;
}

.parameter-heading small {
  display: block;
  max-width: 235px;
  color: #9aa1aa;
  font-size: 10px;
  line-height: 1.5;
}

/* 参数字段（placeholder 下拉 / 平铺字段 / 展开全部）的样式随共享组件
   ActionParamFields.vue 走，这里不再重复。 */

.advanced-json {
  margin-top: 10px;
  color: #7d848e;
  font-size: 11px;
}

.advanced-json summary {
  cursor: pointer;
  user-select: none;
}

.edge-direction {
  display: grid;
  grid-template-columns: 1fr 28px 1fr;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.edge-direction > div {
  min-width: 0;
  padding: 10px;
  border: 1px solid #e4e7eb;
  border-radius: 10px;
  background: #fff;
}

.edge-direction span,
.edge-direction small {
  display: block;
  overflow: hidden;
  color: #9299a3;
  font: 9px var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edge-direction strong {
  display: block;
  overflow: hidden;
  margin: 3px 0;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.edge-direction > b {
  color: #2e5bff;
  text-align: center;
  font-size: 20px;
}

.edge-help {
  font-size: 12px;
  color: #6e7580;
  line-height: 1.7;
  background: #fbfaf8;
  border: 1px solid #f0eee9;
  border-radius: 8px;
  padding: 10px 12px;
  margin-bottom: 14px;
}

.edge-help code {
  font-family: var(--font-mono);
  font-size: 11px;
  background: #f0eee9;
  padding: 1px 4px;
  border-radius: 4px;
}

.mapping-row {
  display: grid;
  grid-template-columns: 1fr 18px 1fr 24px;
  align-items: end;
  gap: 6px;
  margin-top: 8px;
}

.mapping-row label > span {
  display: block;
  margin-bottom: 4px;
  color: #8d949d;
  font-size: 10px;
}

.mapping-arrow {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 7px;
  color: #2e5bff;
  font-weight: 600;
  flex-shrink: 0;
}

/* ── 试运行报告 ── */

.dry-run-subtitle {
  color: #9ca3af;
  font-size: 11px;
  font-weight: 400;
}

.dry-run-loading,
.dry-run-pass {
  padding: 18px 4px;
  color: #6b7280;
  font-size: 13px;
}

.dry-run-pass {
  color: #16a34a;
}

.dry-run-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.dry-run-item {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 7px 8px;
  border-radius: 8px;
  cursor: pointer;
}

.dry-run-item:hover {
  background: #f4f5f7;
}

.dry-run-node {
  flex-shrink: 0;
  color: #374151;
  font-size: 12px;
  font-weight: 600;
}

.dry-run-node code {
  margin-left: 4px;
  color: #9ca3af;
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 400;
}

.dry-run-msg {
  min-width: 0;
  color: #4b5563;
  font-size: 12px;
}

.dry-run-footnote {
  margin: 10px 4px 0;
  color: #9ca3af;
  font-size: 11px;
}

/* ── 物料扣减模拟台账 ── */
.deduction {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid #ececea;
}

.deduction-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 8px;
}

.deduction-title {
  font-size: 12px;
  font-weight: 700;
  color: #1f262e;
}

.deduction-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.deduction-table th {
  text-align: left;
  font-size: 11px;
  font-weight: 600;
  color: #6e7580;
  padding: 4px 8px;
  border-bottom: 1px solid #ececea;
}

.deduction-table td {
  padding: 6px 8px;
  border-bottom: 1px solid #f3f2ee;
  vertical-align: top;
}

.deduction-table .mono {
  font-family: var(--font-mono);
  font-size: 11.5px;
}

.deduction-name {
  font-weight: 600;
  margin-right: 6px;
}

.deduction-table code {
  font-size: 10.5px;
  color: #9aa1aa;
}

.deduction-nodes {
  color: #5c6874;
  max-width: 220px;
}

.deduction-short td {
  background: #fef2f2;
}

.deduction-short td:nth-child(6) {
  color: #b91c1c;
  font-weight: 700;
}

.deduction-unit-mismatch td:nth-child(6) {
  color: #b45309;
  font-weight: 700;
}

.deduction-unknown td:nth-child(6) {
  color: #9aa1aa;
}

.deduction-ok td:nth-child(6) {
  color: #0b7a55;
  font-weight: 600;
}
</style>

<style>
/* 画布操作提示 popover（teleport 到 body，需全局样式） */
.canvas-help-list {
  display: grid;
  gap: 5px;
  padding: 2px 0;
}

.canvas-help-list > div {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: #3d434c;
}

.canvas-help-list kbd {
  flex-shrink: 0;
  min-width: 64px;
  padding: 1px 7px;
  border: 1px solid #e4e2dc;
  border-bottom-width: 2px;
  border-radius: 5px;
  background: #f7f6f3;
  color: #5f6670;
  font: 10.5px var(--font-mono);
  text-align: center;
}
</style>
