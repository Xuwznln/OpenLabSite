<script setup lang="ts">
/**
 * 任务运行时的只读画布：把任务提交时固化的 `workflow_snapshot` 画成图，用节点运行的状态着色。
 *
 * - 节点 = 快照 nodes（设备动作 / host_node 动作 / 循环容器），边 = 快照 edges ∪ execution_policy.depends_on；
 * - 循环容器画成框（dagre 复合节点），循环体成员在框里，框头显示"第 i/N 轮"；
 * - 只读：不能拖、不能连、不能选，只能平移缩放；
 * - 布局用 dagre 从左到右自动排（快照里的 pose 只是画布坐标，运行页统一自动布局更稳）。
 */
import { computed, ref, watch } from "vue";
import { Handle, Position, VueFlow, useVueFlow, type Edge, type Node } from "@vue-flow/core";
import { Background } from "@vue-flow/background";
import dagre from "@dagrejs/dagre";
import type {
  BackendLoopProgress,
  BackendManualConfirmation,
  BackendWorkflowNodeRun,
  BackendWorkflowTask,
} from "@openlab/protocol";
import { snapshotNodes, type SnapshotNode } from "../features/task-jobs";
import { describeLoopProgress, describeLoopNode, loopNodeDataFromSpec } from "../features/workflow-loops";
import { statusMeta } from "../theme";

const props = defineProps<{
  task: BackendWorkflowTask | null;
  runs: BackendWorkflowNodeRun[];
  confirmations: BackendManualConfirmation[];
  /** 高亮的节点 uuid（列表里点到的） */
  activeNodeUuid?: string;
}>();
const emit = defineEmits<{ (e: "select", nodeUuid: string): void }>();

const NODE_W = 210;
const NODE_H = 64;
const LOOP_PAD = 18;
const LOOP_HEADER = 44;

interface RunNodeData {
  title: string;
  subtitle: string;
  status: string;
  statusLabel: string;
  color: string;
  attempts: number;
  waitingConfirm: boolean;
  disabled: boolean;
  /** 循环容器：轮次进度（第 i/N 轮） */
  loopProgress?: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function nodeTitle(node: SnapshotNode): string {
  const meta = asRecord(node.meta_data);
  const device = String(meta?.target_device_id ?? "");
  const action = String(node.action_name ?? "");
  const confirm = asRecord(meta?.manual_confirm);
  if (confirm?.label) return String(confirm.label);
  if (node.name && node.name !== `${device}/${action}`) return String(node.name);
  return action || String(node.name ?? node.uuid.slice(0, 8));
}

function isLoopSnapshotNode(node: SnapshotNode): boolean {
  return String(node.type ?? "").toLowerCase() === "loop";
}

const graph = computed(() => {
  const nodes = snapshotNodes(props.task);
  const runByNode = new Map(props.runs.map((run) => [run.workflow_node_uuid, run]));
  const pendingConfirmJobs = new Set(props.confirmations.filter((c) => c.status === "pending").map((c) => c.workflow_node_job_uuid));
  const byUuid = new Map(nodes.map((n) => [n.uuid, n]));
  // 执行父级：parent_uuid 指向的循环容器（组框等非循环父级不画）
  const loopParentOf = (node: SnapshotNode): string | undefined => {
    const parent = node.parent_uuid ? byUuid.get(node.parent_uuid) : undefined;
    return parent && isLoopSnapshotNode(parent) ? parent.uuid : undefined;
  };

  const g = new dagre.graphlib.Graph({ compound: true });
  g.setGraph({ rankdir: "LR", nodesep: 28, ranksep: 70, marginx: 12, marginy: 12 });
  g.setDefaultEdgeLabel(() => ({}));
  const known = new Set(nodes.map((n) => n.uuid));
  const edgeKeys = new Set<string>();
  const edges: Edge[] = [];
  const addEdge = (source: string, target: string) => {
    if (!known.has(source) || !known.has(target) || source === target) return;
    const key = `${source}->${target}`;
    if (edgeKeys.has(key)) return;
    edgeKeys.add(key);
    g.setEdge(source, target);
    edges.push({ id: key, source, target, type: "smoothstep", style: { stroke: "#94a3b8", strokeWidth: 2 } });
  };
  for (const node of nodes) g.setNode(node.uuid, { width: NODE_W, height: NODE_H });
  for (const node of nodes) {
    const parent = loopParentOf(node);
    if (parent) g.setParent(node.uuid, parent);
  }
  const snapshotEdges = asRecord(props.task?.workflow_snapshot)?.edges;
  if (Array.isArray(snapshotEdges)) {
    for (const edge of snapshotEdges) {
      const record = asRecord(edge);
      if (record) addEdge(String(record.source_node_uuid ?? ""), String(record.target_node_uuid ?? ""));
    }
  }
  for (const node of nodes) {
    const dependsOn = asRecord(node.execution_policy)?.depends_on;
    if (Array.isArray(dependsOn)) for (const upstream of dependsOn) addEdge(String(upstream), node.uuid);
  }
  dagre.layout(g);

  // 循环框：簇外接框加内边距，并向上留出标题栏；成员坐标相对循环框
  const frames = new Map<string, { x: number; y: number; width: number; height: number }>();
  for (const node of nodes) {
    if (!isLoopSnapshotNode(node)) continue;
    const cluster = g.node(node.uuid);
    if (!cluster) continue;
    const width = Math.max(cluster.width ?? NODE_W, NODE_W) + LOOP_PAD * 2;
    const height = Math.max(cluster.height ?? NODE_H, NODE_H) + LOOP_PAD * 2 + LOOP_HEADER;
    frames.set(node.uuid, {
      x: cluster.x - width / 2,
      y: cluster.y - (cluster.height ?? NODE_H) / 2 - LOOP_PAD - LOOP_HEADER,
      width,
      height,
    });
  }
  const absoluteOf = (uuid: string): { x: number; y: number } => {
    const frame = frames.get(uuid);
    if (frame) return { x: frame.x, y: frame.y };
    const position = g.node(uuid);
    return { x: (position?.x ?? 0) - NODE_W / 2, y: (position?.y ?? 0) - NODE_H / 2 };
  };

  // 父节点先进节点表
  const depthOf = (node: SnapshotNode): number => {
    let depth = 0;
    let current = loopParentOf(node);
    while (current) {
      depth += 1;
      current = loopParentOf(byUuid.get(current)!);
    }
    return depth;
  };
  const ordered = [...nodes].sort((a, b) => depthOf(a) - depthOf(b));
  const flowNodes: Node<RunNodeData>[] = ordered.map((node) => {
    const run = runByNode.get(node.uuid);
    const waitingConfirm = Boolean(run?.current_job_uuid && pendingConfirmJobs.has(run.current_job_uuid));
    const status = run?.status ?? "pending";
    const meta = waitingConfirm ? statusMeta("running") : statusMeta(status);
    const snapshotMeta = asRecord(node.meta_data);
    const device = String(snapshotMeta?.target_device_id ?? "");
    const parent = loopParentOf(node);
    const absolute = absoluteOf(node.uuid);
    const parentFrame = parent ? frames.get(parent) : undefined;
    const position = parentFrame ? { x: absolute.x - parentFrame.x, y: absolute.y - parentFrame.y } : absolute;
    const isLoop = isLoopSnapshotNode(node);
    const frame = frames.get(node.uuid);
    const loopSpec = isLoop ? loopNodeDataFromSpec(node.param, String(node.name ?? "")) : null;
    const progress = asRecord(run?.control_data)?.loop as Partial<BackendLoopProgress> | undefined;
    return {
      id: node.uuid,
      type: isLoop ? "loop-run" : "run",
      position,
      ...(parent ? { parentNode: parent } : {}),
      ...(frame ? { style: { width: `${Math.round(frame.width)}px`, height: `${Math.round(frame.height)}px` } } : {}),
      draggable: false,
      connectable: false,
      selectable: false,
      data: {
        title: isLoop ? String(node.name ?? "循环") : nodeTitle(node),
        subtitle: isLoop
          ? describeLoopNode(loopSpec ?? {})
          : device
            ? `${device} · ${String(node.action_name ?? "")}`
            : String(node.action_name ?? node.type ?? ""),
        status,
        statusLabel: waitingConfirm ? "等待人工确认" : meta.label,
        color: meta.color,
        attempts: run?.attempt_count ?? 0,
        waitingConfirm,
        disabled: Boolean((node as { disabled?: boolean }).disabled),
        loopProgress: isLoop ? describeLoopProgress(progress, status) : undefined,
      },
    };
  });
  return { nodes: flowNodes, edges };
});

const { fitView } = useVueFlow();
const ready = ref(false);
function onInit() {
  ready.value = true;
  void fitView({ padding: 0.2 });
}
watch(
  () => graph.value.nodes.length,
  () => {
    if (ready.value) void fitView({ padding: 0.2 });
  },
);
</script>

<template>
  <div class="task-canvas">
    <VueFlow
      :nodes="graph.nodes"
      :edges="graph.edges"
      :nodes-draggable="false"
      :nodes-connectable="false"
      :elements-selectable="false"
      :zoom-on-double-click="false"
      :min-zoom="0.3"
      :max-zoom="1.6"
      fit-view-on-init
      @init="onInit"
      @node-click="(event) => emit('select', String(event.node.id))"
    >
      <Background pattern-color="#e6e9ee" :gap="18" />
      <template #node-run="{ id, data }">
        <div
          class="run-node"
          :class="{ active: id === activeNodeUuid, disabled: data.disabled, waiting: data.waitingConfirm }"
          :style="{ '--node-color': data.color }"
        >
          <Handle type="target" :position="Position.Left" class="run-handle" />
          <div class="run-head">
            <span class="run-dot" />
            <span class="run-title">{{ data.title }}</span>
          </div>
          <div class="run-sub mono">{{ data.subtitle }}</div>
          <div class="run-status">
            {{ data.statusLabel }}<span v-if="data.attempts > 1"> · {{ data.attempts }} 次尝试</span>
          </div>
          <Handle type="source" :position="Position.Right" class="run-handle" />
        </div>
      </template>
      <template #node-loop-run="{ id, data }">
        <div
          class="loop-run-node"
          :class="{ active: id === activeNodeUuid, disabled: data.disabled }"
          :style="{ '--node-color': data.color }"
        >
          <Handle type="target" :position="Position.Left" class="run-handle" :style="{ top: '22px' }" />
          <div class="loop-run-head">
            <span class="run-dot" />
            <span class="loop-run-badge">循环</span>
            <span class="run-title">{{ data.title }}</span>
            <span class="loop-run-status">
              {{ data.statusLabel }}<template v-if="data.loopProgress"> · {{ data.loopProgress }}</template>
            </span>
          </div>
          <div class="run-sub mono loop-run-sub">{{ data.subtitle }}</div>
          <Handle type="source" :position="Position.Right" class="run-handle" :style="{ top: '22px' }" />
        </div>
      </template>
    </VueFlow>
    <div class="lock-badge" title="运行中的图是任务提交时固化的快照，不能在这里修改">只读快照</div>
  </div>
</template>

<style scoped>
.task-canvas {
  position: relative;
  height: 260px;
  border: 1px solid var(--hairline);
  border-radius: 12px;
  overflow: hidden;
  background: #fafbfc;
}

.lock-badge {
  position: absolute;
  top: 8px;
  right: 10px;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(16, 20, 24, 0.72);
  color: #fff;
  pointer-events: none;
}

.run-node {
  width: 210px;
  box-sizing: border-box;
  padding: 8px 10px 7px;
  border: 1.5px solid var(--node-color);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(16, 20, 24, 0.06);
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
}

.run-node.active {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 30%, transparent);
}

.run-node.disabled {
  opacity: 0.45;
  border-style: dashed;
}

.run-node.waiting .run-dot {
  animation: pulse 1.2s ease-in-out infinite;
}

.run-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.run-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--node-color);
  flex-shrink: 0;
}

.run-title {
  font-weight: 650;
  color: #101418;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-sub {
  color: #6e7580;
  font-size: 11px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.run-status {
  margin-top: 3px;
  color: var(--node-color);
  font-weight: 600;
  font-size: 11.5px;
}

.run-handle {
  width: 6px;
  height: 6px;
  background: #94a3b8;
  border: none;
}

.loop-run-node {
  position: relative;
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  padding: 6px 10px;
  border: 1.5px dashed var(--node-color);
  border-radius: 12px;
  background: color-mix(in srgb, var(--node-color) 6%, #fff);
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
}

.loop-run-node.active {
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--node-color) 30%, transparent);
}

.loop-run-node.disabled {
  opacity: 0.45;
}

.loop-run-head {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.loop-run-badge {
  flex-shrink: 0;
  padding: 0 6px;
  border-radius: 999px;
  background: #ede9fe;
  color: #5b21b6;
  font-size: 10px;
  font-weight: 600;
}

.loop-run-status {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--node-color);
  font-weight: 600;
  font-size: 11.5px;
}

.loop-run-sub {
  color: #6b21a8;
}

.mono {
  font-family: var(--font-mono);
}

@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}
</style>
