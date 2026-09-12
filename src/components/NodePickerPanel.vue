<script setup lang="ts">
/**
 * Dify 风格「插入节点」面板：列出 runtime.v1 在线执行路由及动作能力。
 * 执行面不可用时提示并提供手动录入。
 */
import { computed, onMounted, ref } from "vue";
import {
  NButton,
  NCollapse,
  NCollapseItem,
  NEmpty,
  NInput,
  NSpin,
  NTag,
} from "naive-ui";
import type { RuntimeActionCapability } from "@openlab/protocol";
import { actionParamSummary, runtimeActionParams } from "../features/runtime-actions";
import { setDragPayload } from "../features/canvas-dnd";
import { useConnectionStore } from "../stores/connection";

const emit = defineEmits<{
  (
    e: "insert",
    payload: {
      deviceId: string;
      actionName: string;
      param?: Record<string, unknown>;
    },
  ): void;
}>();

const conn = useConnectionStore();
const search = ref("");
const loading = ref(true);
const devicesAvailable = ref(false);
const devices = ref<string[]>([]);
const actionsOf = ref<Record<string, RuntimeActionCapability[]>>({});

const manualDevice = ref("");
const manualAction = ref("");

function actionParams(action: RuntimeActionCapability): Record<string, unknown> {
  return runtimeActionParams(action);
}

async function load() {
  loading.value = true;
  try {
    const endpoints = await conn.api.domains.runtimeV1.endpoints();
    const online = endpoints.filter((endpoint) => endpoint.state === "online");
    const deviceIds = new Set(
      online
        .flatMap((endpoint) => endpoint.device_routes)
        .filter((route) => route.enabled && route.selected)
        .map((route) => route.device_uuid),
    );
    devices.value = [...deviceIds];
    const grouped: Record<string, RuntimeActionCapability[]> = {};
    for (const capability of online.flatMap((endpoint) => endpoint.action_capabilities)) {
      if (!deviceIds.has(capability.device_uuid) || capability.state !== "active") continue;
      (grouped[capability.device_uuid] ??= []).push(capability);
    }
    actionsOf.value = grouped;
    devicesAvailable.value = devices.value.length > 0;
  } catch {
    devicesAvailable.value = false;
  } finally {
    loading.value = false;
  }
}

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase();
  return devices.value
    .map((key) => {
      const actions = (actionsOf.value[key] ?? []).filter((a) => {
        const name = a.action_name;
        return !q || name.toLowerCase().includes(q) || key.toLowerCase().includes(q);
      });
      return { key, actions };
    })
    .filter((d) => d.actions.length > 0 || (!q ? true : d.key.toLowerCase().includes(q)));
});

function insertManual() {
  if (!manualDevice.value || !manualAction.value) return;
  emit("insert", { deviceId: manualDevice.value, actionName: manualAction.value });
}

onMounted(() => void load());
</script>

<template>
  <div class="picker">
    <div class="picker-header">插入节点</div>
    <NSpin v-if="loading" size="small" style="margin: 24px auto; display: block" />

    <template v-else-if="devicesAvailable">
      <NInput
        v-model:value="search"
        size="small"
        placeholder="搜索设备 / 动作…"
        clearable
        style="margin-bottom: 8px"
      />
      <NEmpty
        v-if="!filtered.length"
        size="small"
        description="没有匹配的在线设备动作"
        style="margin-top: 24px"
      />
      <NCollapse v-else :default-expanded-names="filtered.map((d) => d.key)">
        <NCollapseItem v-for="d in filtered" :key="d.key" :name="d.key">
          <template #header>
            <span class="dev-name">{{ d.key }}</span>
            <NTag size="tiny" :bordered="false" type="success" style="margin-left: 6px">
              在线
            </NTag>
          </template>
          <div
            v-for="a in d.actions"
            :key="a.action_name"
            class="action-item"
            draggable="true"
            title="点击插入，或拖到画布 / 空位上"
            @dragstart="
              setDragPayload($event, {
                kind: 'action',
                deviceId: d.key,
                actionName: a.action_name,
                param: actionParams(a),
              })
            "
            @click="
              emit('insert', {
                deviceId: d.key,
                actionName: a.action_name,
                param: actionParams(a),
              })
            "
          >
            <span class="action-text">
              <span class="action-name">{{ a.action_name }}</span>
              <span v-if="actionParamSummary(a).displayName" class="action-alias">{{ actionParamSummary(a).displayName }}</span>
            </span>
            <span class="action-meta">
              <NTag v-if="a.availability === 'busy'" size="tiny" type="warning" :bordered="false">busy</NTag>
              <span class="action-count" :class="{ zero: actionParamSummary(a).total === 0 }">{{ actionParamSummary(a).label }}</span>
            </span>
          </div>
        </NCollapseItem>
      </NCollapse>
    </template>

    <template v-else>
      <div class="offline-tip">
        未获取到 runtime.v1 在线执行路由；当前可手动录入节点：
      </div>
      <NInput
        v-model:value="manualDevice"
        size="small"
        placeholder="设备 ID，如 liquid_handler"
        style="margin-bottom: 6px"
      />
      <NInput
        v-model:value="manualAction"
        size="small"
        placeholder="动作名，如 prepare_samples"
        style="margin-bottom: 8px"
        @keyup.enter="insertManual"
      />
      <NButton
        size="small"
        type="primary"
        block
        :disabled="!manualDevice || !manualAction"
        @click="insertManual"
      >
        插入节点
      </NButton>
      <NButton size="tiny" quaternary block style="margin-top: 6px" @click="load">
        重试获取在线设备
      </NButton>
    </template>
  </div>
</template>

<style scoped>
.picker {
  width: 260px;
  background: #fff;
  border: 1px solid #e4e4e7;
  border-radius: 12px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
  padding: 12px;
  max-height: 480px;
  overflow-y: auto;
}

.picker-header {
  font-size: 13px;
  font-weight: 600;
  color: #18181b;
  margin-bottom: 8px;
}

.dev-name {
  font-size: 12px;
  font-weight: 600;
}

.action-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 8px;
  border-radius: 6px;
  font-size: 12px;
  cursor: pointer;
}

.action-item:hover {
  background: #f0f4ff;
}

.action-text {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.action-name {
  color: #3f3f46;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.action-alias {
  font-size: 10.5px;
  color: #8b929c;
}

.action-meta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  flex-shrink: 0;
}

.action-count {
  font-family: var(--font-mono);
  font-size: 10px;
  color: #3d4650;
  background: #eef0f3;
  border-radius: 999px;
  padding: 1px 7px;
  white-space: nowrap;
}

.action-count.zero {
  color: #9aa1aa;
  background: transparent;
  border: 1px dashed #d9dde3;
}

.offline-tip {
  font-size: 12px;
  color: #71717a;
  line-height: 1.6;
  margin-bottom: 8px;
}
</style>
