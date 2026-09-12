<script setup lang="ts">
/**
 * Dify 风格动作节点：白底圆角卡片 + 彩色图标块 + 标题/副标题 + 状态徽标。
 * 编辑器与运行画布共用；data.state 存在时显示运行状态。
 */
import { computed, inject } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { NIcon } from "naive-ui";
import { HandRightOutline } from "@vicons/ionicons5";
import type { BackendWorkflowNodeJobStatus } from "@openlab/protocol";
import { MISSING_PARAM_COUNTS_KEY } from "../features/param-completeness";

/** 画布节点运行态：Workflow Node Job 的 canonical 状态词汇。 */
export type NodeState = BackendWorkflowNodeJobStatus;

const props = defineProps<{
  id: string;
  data: {
    deviceId?: string;
    actionName?: string;
    state?: NodeState;
    nodeType?: string;
    selected?: boolean;
  };
  selected?: boolean;
}>();

const isManualConfirm = computed(
  () => String(props.data.nodeType ?? "").toLowerCase() === "manual_confirm",
);

// 按 device_id 稳定取色（Dify 式彩色图标块）
const PALETTE = [
  "#6366f1",
  "#0ea5e9",
  "#10b981",
  "#f59e0b",
  "#ec4899",
  "#8b5cf6",
  "#14b8a6",
  "#f97316",
];

const iconColor = computed(() => {
  const key = props.data.deviceId || props.id;
  // FNV-1a：*31 hash 对相近设备名容易撞色（liquid_handler/hplc/robot_arm 曾同色）
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return PALETTE[hash % PALETTE.length];
});

const iconText = computed(() => {
  const key = props.data.deviceId || props.data.actionName || "?";
  return key.slice(0, 1).toUpperCase();
});

const STATE_BADGE: Record<NodeState, { color: string; label: string; pulse?: boolean }> = {
  pending: { color: "#a1a1aa", label: "等待" },
  dispatched: { color: "#3b82f6", label: "已派发", pulse: true },
  running: { color: "#f59e0b", label: "执行中", pulse: true },
  intervention_required: { color: "#d97706", label: "等待干预", pulse: true },
  cancel_requested: { color: "#a1a1aa", label: "取消中" },
  execution_unknown: { color: "#b45309", label: "状态未知" },
  succeeded: { color: "#22c55e", label: "成功" },
  failed: { color: "#ef4444", label: "失败" },
  skipped: { color: "#a1a1aa", label: "已跳过" },
  canceled: { color: "#a1a1aa", label: "已取消" },
  timeout: { color: "#ef4444", label: "超时" },
};

const badge = computed(() => {
  if (!props.data.state) return null;
  const base = STATE_BADGE[props.data.state] ?? { color: "#a1a1aa", label: props.data.state };
  if (isManualConfirm.value && (props.data.state === "running" || props.data.state === "dispatched")) {
    return { ...base, label: "等待人工确认" };
  }
  return base;
});

const borderColor = computed(() => {
  if (props.selected) return "#2563eb";
  if (badge.value) return badge.value.color;
  return "#e4e4e7";
});

// 编辑器 provide 的未填参数计数（运行画布无 provide → 徽标恒隐藏）。
// 点击徽标不拦截事件，自然冒泡到节点 click → 打开参数浮层（快捷入口）。
const missingCounts = inject(MISSING_PARAM_COUNTS_KEY, undefined);
const missingCount = computed(() => missingCounts?.value.get(props.id) ?? 0);
</script>

<template>
  <div
    class="action-node"
    :class="{ selected: props.selected }"
    :style="{ borderColor: borderColor }"
  >
    <span
      v-if="missingCount > 0"
      class="node-missing-pill"
      title="点击补全参数（与参数表单同一统计口径）"
    >
      还差 {{ missingCount }} 项
    </span>
    <span class="port-label port-in">IN</span>
    <Handle
      id="in"
      type="target"
      :position="Position.Left"
      class="node-handle node-handle-in"
    />
    <div class="node-body">
      <div
        class="node-icon"
        :style="{ background: isManualConfirm ? '#f59e0b' : iconColor }"
      >
        <NIcon v-if="isManualConfirm" :size="16"><HandRightOutline /></NIcon>
        <template v-else>{{ iconText }}</template>
      </div>
      <div class="node-text">
        <div class="node-title">{{ props.data.actionName || props.id }}</div>
        <div class="node-sub">{{ props.data.deviceId || "未指定设备" }}</div>
      </div>
      <span
        v-if="badge"
        class="node-badge"
        :class="{ pulse: badge.pulse }"
        :style="{ background: badge.color }"
        :title="badge.label"
      />
    </div>
    <div v-if="badge" class="node-state-text" :style="{ color: badge.color }">
      {{ badge.label }}
    </div>
    <span class="port-label port-out">OUT</span>
    <Handle
      id="out"
      type="source"
      :position="Position.Right"
      class="node-handle node-handle-out"
    />
  </div>
</template>

<style scoped>
.action-node {
  position: relative;
  width: 220px;
  background: #fff;
  border: 1.5px solid #e4e4e7;
  border-radius: 12px;
  padding: 10px 12px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.15s, border-color 0.15s;
  cursor: grab;
}

.action-node:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.action-node.selected {
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18), 0 4px 12px rgba(0, 0, 0, 0.1);
}

.node-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.node-icon {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  color: #fff;
  font-weight: 700;
  font-size: 15px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.node-text {
  min-width: 0;
  flex: 1;
}

.node-title {
  font-size: 13px;
  font-weight: 600;
  color: #18181b;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-sub {
  font-size: 11px;
  color: #71717a;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.node-badge {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.node-badge.pulse {
  animation: badge-pulse 1.2s ease-in-out infinite;
}

@keyframes badge-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.35;
  }
}

.node-state-text {
  margin-top: 6px;
  font-size: 11px;
  font-weight: 500;
}

/* 未填参数小胶囊：右上角悬出，点击冒泡到节点即打开参数浮层 */
.node-missing-pill {
  position: absolute;
  top: -9px;
  right: 10px;
  z-index: 3;
  padding: 1px 8px;
  color: #92400e;
  font-size: 10px;
  font-weight: 650;
  line-height: 16px;
  white-space: nowrap;
  background: #fef3c7;
  border: 1px solid #fcd34d;
  border-radius: 9px;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.08);
  cursor: pointer;
}

.node-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #94a3b8;
  transition: transform 0.15s, border-color 0.15s, box-shadow 0.15s;
}

.node-handle:hover {
  border-color: #2563eb;
  box-shadow: 0 0 0 4px rgba(37, 99, 235, 0.13);
  transform: scale(1.18);
}

.node-handle-in {
  left: -7px;
}

.node-handle-out {
  right: -7px;
}

.port-label {
  position: absolute;
  top: 50%;
  z-index: 2;
  padding: 1px 4px;
  border-radius: 4px;
  opacity: 0;
  color: #6f7884;
  background: #f1f4f8;
  font: 8px var(--font-mono);
  pointer-events: none;
  transform: translateY(-50%);
  transition: opacity 0.15s;
}

.action-node:hover .port-label {
  opacity: 1;
}

.port-in {
  left: 7px;
}

.port-out {
  right: 7px;
}
</style>
