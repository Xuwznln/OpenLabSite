<script setup lang="ts">
/**
 * 人工确认节点：提交时变成执行节点（host_node）上的 `manual_confirm` 动作，
 * always-free、不占设备锁，运行时停驻等指派人（或任何人）在前端确认后放行。
 */
import { computed } from "vue";
import { Handle, Position } from "@vue-flow/core";
import { NIcon } from "naive-ui";
import { HandRightOutline } from "@vicons/ionicons5";

const props = defineProps<{
  id: string;
  data: {
    label?: string;
    prompt?: string;
    /** 执行这个确认的 host_node id；有多个执行节点时才需要显示。 */
    hostId?: string;
    /** 是否需要在卡片上标出执行节点（编辑器在有多个 host_node 时置位）。 */
    showHost?: boolean;
    /** 是否已经明确提交过 assignee_user_ids；缺失与 [] 的语义不同。 */
    assigneesConfigured?: boolean;
    assignees?: string[];
    timeoutSeconds?: number;
    state?: string;
  };
  selected?: boolean;
}>();

const meta = computed(() => {
  const parts: string[] = [];
  const assignees = Array.isArray(props.data.assignees) ? props.data.assignees.filter(Boolean) : [];
  if (props.data.assigneesConfigured === false) {
    parts.push("尚未明确指派列表");
  } else {
    parts.push(assignees.length ? `指派 ${assignees.join("、")}` : "任何人可确认");
  }
  const timeout = Number(props.data.timeoutSeconds);
  if (Number.isFinite(timeout) && timeout > 0 && timeout !== 3600) parts.push(`${timeout}s 超时`);
  if (props.data.showHost && props.data.hostId) parts.push(`@${props.data.hostId}`);
  return parts.join(" · ");
});
</script>

<template>
  <div class="manual-node" :class="{ selected: props.selected }">
    <Handle id="in" type="target" :position="Position.Left" class="manual-handle" />
    <div class="manual-body">
      <div class="manual-icon"><NIcon :size="16"><HandRightOutline /></NIcon></div>
      <div class="manual-text">
        <div class="manual-title">{{ props.data.label || "人工确认" }}</div>
        <div class="manual-sub">{{ props.data.prompt || "到此暂停，等人确认后继续" }}</div>
        <div class="manual-meta">{{ meta }}</div>
      </div>
    </div>
    <Handle id="out" type="source" :position="Position.Right" class="manual-handle" />
  </div>
</template>

<style scoped>
.manual-node {
  position: relative;
  width: 220px;
  padding: 10px 12px;
  background: #fffbeb;
  border: 1.5px solid #f59e0b;
  border-radius: 12px;
  cursor: grab;
  transition: box-shadow 0.15s, border-color 0.15s;
}

.manual-node:hover {
  box-shadow: 0 4px 12px rgba(245, 158, 11, 0.2);
}

.manual-node.selected {
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.22), 0 4px 12px rgba(0, 0, 0, 0.08);
}

.manual-body {
  display: flex;
  align-items: center;
  gap: 10px;
}

.manual-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 8px;
  background: #f59e0b;
  color: #fff;
  font-size: 16px;
}

.manual-text {
  min-width: 0;
  flex: 1;
}

.manual-title {
  overflow: hidden;
  color: #92400e;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manual-sub {
  overflow: hidden;
  color: #b98a3f;
  font-size: 10.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manual-meta {
  overflow: hidden;
  margin-top: 2px;
  color: #a16207;
  font-size: 10px;
  font-family: var(--font-mono);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.manual-handle {
  width: 11px;
  height: 11px;
  background: #fff;
  border: 2px solid #f59e0b;
}

.manual-handle:hover {
  box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.16);
}
</style>
