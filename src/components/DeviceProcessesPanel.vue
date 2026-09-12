<script setup lang="ts">
/**
 * 受管设备进程面板：把驱动包里的设备类配成本机 Slave 子进程，启停 / 重启 / 看日志。
 * 数据来自 device-processes 域；崩溃看护由 Host 完成，这里只展示 restart_count 与 last_error。
 */
import { computed, h, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import { useRouter } from "vue-router";
import {
  NButton,
  NCheckbox,
  NDataTable,
  NEmpty,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NModal,
  NPopconfirm,
  NSelect,
  NSpace,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import type {
  DeviceClassOption,
  DeviceProcess,
  DeviceProcessListing,
  DeviceProcessRestartPolicy,
  DriverPackage,
  JsonObject,
} from "@openlab/protocol";
import StatusPill from "./StatusPill.vue";
import { describeError } from "../features/errors";
import { resetManagedProcesses } from "../features/device-process-reset";
import { useConnectionStore } from "../stores/connection";

const props = defineProps<{
  /** 驱动包台账（选择挂载的包）。 */
  packages: DriverPackage[];
}>();

const conn = useConnectionStore();
const router = useRouter();
const message = useMessage();

const listing = shallowRef<DeviceProcessListing | null>(null);
const classes = shallowRef<DeviceClassOption[]>([]);
const loading = ref(false);
const busyId = ref("");
const resetting = ref(false);
const resetOpen = ref(false);
const resetConfirmation = ref("");
const resetTargets = shallowRef<DeviceProcess[]>([]);
const resetError = ref("");

async function openReset() {
  if (!conn.online || resetting.value || busyId.value) return;
  try {
    const current = await conn.api.domains.deviceProcesses.list();
    listing.value = current;
    resetTargets.value = [...current.processes];
    resetConfirmation.value = "";
    resetError.value = "";
    resetOpen.value = true;
  } catch (error) {
    message.error(describeError(error));
  }
}

async function resetAll() {
  if (resetConfirmation.value !== "清空" || resetting.value || !conn.online) return;
  resetting.value = true;
  resetError.value = "";
  try {
    const result = await resetManagedProcesses(
      conn.api.domains.deviceProcesses,
      resetTargets.value.map((item) => item.id),
      () => conn.api.domains.system.restartStatus(),
    );
    if (result.failed.length) {
      resetError.value = `已清除 ${result.removed.length} 个；失败：${result.failed.map((item) => `${item.id}（${describeError(item.error)}）`).join("、")}`;
      resetTargets.value = resetTargets.value.filter((item) => result.failed.some((failure) => failure.id === item.id));
    } else {
      resetOpen.value = false;
      message.success(`已停止并删除 ${result.removed.length} 个受管设备进程；驱动包、物料及历史保留`);
    }
    await refresh();
  } catch (error) {
    resetError.value = describeError(error);
  } finally {
    resetting.value = false;
  }
}

async function refresh() {
  if (!conn.online) return;
  loading.value = true;
  try {
    listing.value = await conn.api.domains.deviceProcesses.list();
  } catch (error) {
    message.error(`读取设备进程失败：${describeError(error)}`);
  } finally {
    loading.value = false;
  }
}

async function loadClasses() {
  try {
    classes.value = await conn.api.domains.deviceProcesses.deviceClasses();
  } catch {
    classes.value = [];
  }
}

const processes = computed(() => listing.value?.processes ?? []);
const runningCount = computed(() => processes.value.filter((item) => item.status === "running").length);

// ── 启停 ─────────────────────────────────────────────────────

async function act(process: DeviceProcess, action: "start" | "stop" | "restart") {
  if (resetting.value || resetOpen.value) return;
  busyId.value = process.id;
  try {
    await conn.api.domains.deviceProcesses[action](process.id);
    message.success(`${process.name} 已${action === "start" ? "启动" : action === "stop" ? "停止" : "重启"}`);
    await refresh();
  } catch (error) {
    message.error(describeError(error));
  } finally {
    busyId.value = "";
  }
}

async function remove(process: DeviceProcess) {
  if (resetting.value || resetOpen.value) return;
  busyId.value = process.id;
  try {
    await conn.api.domains.deviceProcesses.remove(process.id);
    message.success(`已删除 ${process.name}`);
    await refresh();
  } catch (error) {
    message.error(describeError(error));
  } finally {
    busyId.value = "";
  }
}

function openLogs(process: DeviceProcess) {
  void router.push({ path: "/logs", query: { source: `managed:${process.id}` } });
}

// ── 新建 / 编辑 ─────────────────────────────────────────────

const RESTART_OPTIONS: { label: string; value: DeviceProcessRestartPolicy }[] = [
  { label: "仅异常退出时重启（推荐）", value: "on-failure" },
  { label: "任何退出都重启", value: "always" },
  { label: "不自动重启", value: "never" },
];

const formOpen = ref(false);
const saving = ref(false);
const editing = shallowRef<DeviceProcess | null>(null);
const form = ref({
  name: "",
  deviceId: "",
  deviceClass: null as string | null,
  deviceName: "",
  configJson: "{}",
  packageNames: [] as string[],
  externalOnly: false,
  autoStart: true,
  restartPolicy: "on-failure" as DeviceProcessRestartPolicy,
  maxRestarts: 5,
});

const classOptions = computed(() =>
  classes.value.map((item) => ({
    label: `${item.display_name || item.id}${item.display_name ? ` · ${item.id}` : ""}${item.package ? ` · ${item.package}` : " · 内置"}`,
    value: item.id,
  })),
);

const packageOptions = computed(() => props.packages.map((item) => ({ label: `${item.name} ${item.version}`, value: item.name })));

function openCreate() {
  editing.value = null;
  form.value = {
    name: "",
    deviceId: "",
    deviceClass: null,
    deviceName: "",
    configJson: "{}",
    packageNames: [],
    externalOnly: false,
    autoStart: true,
    restartPolicy: "on-failure",
    maxRestarts: 5,
  };
  formOpen.value = true;
  void loadClasses();
}

function openEdit(process: DeviceProcess) {
  editing.value = process;
  const node = process.graph_nodes[0] as Record<string, unknown> | undefined;
  form.value = {
    name: process.name,
    deviceId: String(node?.id ?? ""),
    deviceClass: node ? String(node.class ?? "") : null,
    deviceName: String(node?.name ?? ""),
    configJson: JSON.stringify(node?.config ?? {}, null, 2),
    packageNames: [...process.package_names],
    externalOnly: process.external_only,
    autoStart: process.auto_start,
    restartPolicy: process.restart_policy,
    maxRestarts: process.max_restarts,
  };
  formOpen.value = true;
  void loadClasses();
}

// 选了驱动包里的类，自动勾上那个包 + 仅外部包
watch(
  () => form.value.deviceClass,
  (id) => {
    const option = classes.value.find((item) => item.id === id);
    if (option?.package && !form.value.packageNames.includes(option.package)) {
      form.value.packageNames = [...form.value.packageNames, option.package];
      form.value.externalOnly = true;
    }
    if (!form.value.deviceId && id) form.value.deviceId = id;
  },
);

async function submit() {
  let config: JsonObject;
  try {
    const parsed: unknown = JSON.parse(form.value.configJson || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("必须是 JSON 对象");
    config = parsed as JsonObject;
  } catch (error) {
    message.warning(`初始化配置不是合法 JSON：${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (!form.value.name.trim() || !form.value.deviceId.trim() || !form.value.deviceClass) {
    message.warning("名称、设备 id 与设备类都要填");
    return;
  }
  saving.value = true;
  try {
    const common = {
      name: form.value.name.trim(),
      package_names: form.value.packageNames,
      external_only: form.value.externalOnly,
      auto_start: form.value.autoStart,
      restart_policy: form.value.restartPolicy,
      max_restarts: form.value.maxRestarts,
    };
    if (editing.value) {
      // 保留原节点 uuid，只改 id / class / name / config
      const node: JsonObject = {
        ...(editing.value.graph_nodes[0] ?? {}),
        id: form.value.deviceId.trim(),
        class: form.value.deviceClass,
        template_name: form.value.deviceClass,
        name: form.value.deviceName.trim() || form.value.deviceId.trim(),
        config,
      };
      await conn.api.domains.deviceProcesses.update(editing.value.id, { ...common, graph_nodes: [node, ...editing.value.graph_nodes.slice(1)] });
      message.success(`已保存 ${common.name}${editing.value.status === "running" ? "，重启进程后生效" : ""}`);
    } else {
      await conn.api.domains.deviceProcesses.create({
        ...common,
        devices: [{ id: form.value.deviceId.trim(), class: form.value.deviceClass, name: form.value.deviceName.trim() || undefined, config }],
      });
      message.success(`已创建 ${common.name}，点击「启动」拉起子进程`);
    }
    formOpen.value = false;
    await refresh();
  } catch (error) {
    message.error(describeError(error));
  } finally {
    saving.value = false;
  }
}

// ── 表格 ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<DeviceProcess["status"], string> = {
  stopped: "已停止",
  starting: "启动中",
  running: "运行中",
  crashed: "已崩溃",
  restarting: "重启中",
};

const STATUS_KEY: Record<DeviceProcess["status"], string> = {
  stopped: "offline",
  starting: "dispatched",
  running: "online",
  crashed: "failed",
  restarting: "dispatched",
};

function fmtMs(value: number | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

const columns: DataTableColumns<DeviceProcess> = [
  {
    title: "进程",
    key: "name",
    minWidth: 200,
    render: (row) =>
      h("div", { class: "proc-name" }, [
        h("span", { class: "proc-title" }, row.name),
        h("span", { class: "mono dim small" }, row.device_ids.map((id) => `${id}`).join(", ")),
      ]),
  },
  {
    title: "状态",
    key: "status",
    width: 120,
    render: (row) => h(StatusPill, { status: STATUS_KEY[row.status], size: "small", label: STATUS_LABEL[row.status] }),
  },
  { title: "PID", key: "pid", width: 80, render: (row) => h("span", { class: "mono" }, row.pid ? String(row.pid) : "—") },
  {
    title: "看护",
    key: "restart",
    width: 190,
    render: (row) => {
      const policy = RESTART_OPTIONS.find((item) => item.value === row.restart_policy)?.label ?? row.restart_policy;
      return h("div", { class: "proc-guard" }, [
        h("span", policy.replace("（推荐）", "")),
        h("span", { class: "dim small" }, `重启 ${row.restart_count}/${row.max_restarts} · ${row.auto_start ? "随 Host 自启" : "手动启动"}`),
      ]);
    },
  },
  {
    title: "驱动包",
    key: "package_names",
    minWidth: 140,
    render: (row) =>
      row.package_names.length
        ? h("div", { class: "tag-wrap" }, row.package_names.map((name) => h(NTag, { size: "small", bordered: false }, { default: () => name })))
        : h("span", { class: "dim" }, row.external_only ? "—" : "内置注册表"),
  },
  {
    title: "最近",
    key: "started_at_ms",
    width: 170,
    render: (row) =>
      h("div", { class: "proc-guard" }, [
        h("span", row.status === "running" ? `启动于 ${fmtMs(row.started_at_ms)}` : `停止于 ${fmtMs(row.stopped_at_ms)}`),
        row.last_error ? h("span", { class: "err small", title: row.last_error }, row.last_error) : null,
      ]),
  },
  {
    title: "",
    key: "actions",
    width: 260,
    render: (row) => {
      const busy = resetting.value || busyId.value === row.id;
      const running = row.status === "running" || row.status === "starting" || row.status === "restarting";
      return h(NSpace, { size: 4, wrap: false }, {
        default: () => [
          running
            ? h(NButton, { size: "tiny", secondary: true, loading: busy, onClick: () => void act(row, "stop") }, { default: () => "停止" })
            : h(NButton, { size: "tiny", type: "primary", secondary: true, loading: busy, onClick: () => void act(row, "start") }, { default: () => "启动" }),
          h(NButton, { size: "tiny", quaternary: true, disabled: busy, onClick: () => void act(row, "restart") }, { default: () => "重启" }),
          h(NButton, { size: "tiny", quaternary: true, onClick: () => openLogs(row) }, { default: () => "日志" }),
          h(NButton, { size: "tiny", quaternary: true, onClick: () => openEdit(row) }, { default: () => "编辑" }),
          h(
            NPopconfirm,
            { onPositiveClick: () => void remove(row) },
            {
              trigger: () => h(NButton, { size: "tiny", quaternary: true, type: "error" }, { default: () => "删除" }),
              default: () => `停止并删除「${row.name}」？其设备将从 HostLink 下线。`,
            },
          ),
        ],
      });
    },
  },
];

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 5000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
});
watch(
  () => conn.online,
  (online) => online && void refresh(),
);

defineExpose({ refresh });
</script>

<template>
  <section class="card">
    <div class="card-head">
      <div class="head-text">
        <span class="card-title">受管设备进程</span>
        <span class="dim small">
          每个进程是一个本机 Slave 子进程，经 HostLink {{ listing?.hostlink.host }}:{{ listing?.hostlink.port }} 接回本 Host；驱动崩溃只影响该进程并按策略自动拉起
        </span>
      </div>
      <NSpace :size="6">
        <NTag size="small" :bordered="false" :type="runningCount ? 'success' : 'default'">{{ runningCount }} / {{ processes.length }} 运行中</NTag>
        <NButton size="small" type="error" secondary :disabled="!conn.online || !processes.length || !!busyId || resetting" @click="openReset">清空受管设备进程</NButton>
        <NButton size="small" type="primary" :disabled="resetting" @click="openCreate">新建设备进程</NButton>
        <NButton size="small" :loading="loading" @click="refresh">刷新</NButton>
      </NSpace>
    </div>

    <NEmpty v-if="!processes.length" description="还没有受管进程：先装好驱动包，再把里面的设备类配成一个进程启动" style="padding: 24px 0" />
    <NDataTable v-else :columns="columns" :data="processes" size="small" :scroll-x="1180" :row-key="(row: DeviceProcess) => row.id" />

    <NModal v-model:show="resetOpen" preset="card" title="清空受管设备进程" style="width: 560px" :closable="!resetting" :mask-closable="!resetting" :close-on-esc="!resetting">
      <p>将停止并删除以下 {{ resetTargets.length }} 个进程配置，Host 重启后也不会自动拉起。需要通过驱动包「启动」或手动配置恢复。</p>
      <p>{{ resetTargets.map((item) => item.name).join("、") }}</p>
      <p>仅限本机受管进程；不处理命令行启动的 Host 设备、外部 Slave，不删除驱动包、物料、设备图快照和历史记录。</p>
      <p>请先停止工作流和外部派发，再操作；此操作不是全局原子重置。</p>
      <p v-if="resetError" role="alert">{{ resetError }}</p>
      <NInput v-model:value="resetConfirmation" placeholder="输入「清空」确认" :disabled="resetting" />
      <template #footer>
        <NSpace justify="end">
          <NButton :disabled="resetting" @click="resetOpen = false">取消</NButton>
          <NButton type="error" :loading="resetting" :disabled="!conn.online || resetConfirmation !== '清空' || !resetTargets.length" @click="resetAll">停止并清空</NButton>
        </NSpace>
      </template>
    </NModal>

    <!-- 新建 / 编辑 -->
    <NModal v-model:show="formOpen" preset="card" :title="editing ? `编辑 ${editing.name}` : '新建设备进程'" style="width: 620px">
      <NForm label-placement="top" size="small">
        <div class="form-row">
          <NFormItem label="进程名称" style="flex: 1"><NInput v-model:value="form.name" placeholder="例如 蠕动泵站" /></NFormItem>
          <NFormItem label="设备类（注册表 / 驱动包）" style="flex: 1.4">
            <NSelect v-model:value="form.deviceClass" filterable :options="classOptions" placeholder="选择 @device 类" />
          </NFormItem>
        </div>
        <div class="form-row">
          <NFormItem label="设备 id（图中唯一）" style="flex: 1"><NInput v-model:value="form.deviceId" placeholder="pump_1" class="mono" /></NFormItem>
          <NFormItem label="显示名（可选）" style="flex: 1"><NInput v-model:value="form.deviceName" placeholder="1 号蠕动泵" /></NFormItem>
        </div>
        <NFormItem label="初始化配置（JSON，对应设备类 __init__ 参数）">
          <NInput v-model:value="form.configJson" type="textarea" :rows="4" class="mono" placeholder='{ "port": "COM3", "baudrate": 9600 }' />
        </NFormItem>
        <div class="form-row">
          <NFormItem label="挂载驱动包" style="flex: 1.4">
            <NSelect v-model:value="form.packageNames" multiple filterable :options="packageOptions" placeholder="子进程 --devices 要扫描的包" />
          </NFormItem>
          <NFormItem label="重启策略" style="flex: 1">
            <NSelect v-model:value="form.restartPolicy" :options="RESTART_OPTIONS" />
          </NFormItem>
          <NFormItem label="最多重启" style="width: 110px">
            <NInputNumber v-model:value="form.maxRestarts" :min="0" :max="50" style="width: 100%" />
          </NFormItem>
        </div>
        <div class="form-row checks">
          <NCheckbox v-model:checked="form.autoStart">随 Host 启动自动拉起</NCheckbox>
          <NCheckbox v-model:checked="form.externalOnly">仅外部包（--external_devices_only，不加载内置注册表，启动更快）</NCheckbox>
        </div>
      </NForm>
      <p class="dim small">
        子进程命令：<span class="mono">python -m unilabos --is_slave --host_node_ip {{ listing?.hostlink.host }} --hostlink_port {{ listing?.hostlink.port }} -g &lt;graph.json&gt; --devices &lt;包目录&gt;…</span>
      </p>
      <NSpace justify="end">
        <NButton @click="formOpen = false">取消</NButton>
        <NButton type="primary" :loading="saving" @click="submit">{{ editing ? "保存" : "创建" }}</NButton>
      </NSpace>
    </NModal>

  </section>
</template>

<style scoped>
.card {
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 14px;
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.card-title {
  font-weight: 700;
  font-size: 13.5px;
  color: #101418;
}

.form-row {
  display: flex;
  gap: 12px;
}

.form-row.checks {
  flex-wrap: wrap;
  gap: 8px 18px;
  margin-bottom: 8px;
}

:deep(.proc-name),
:deep(.proc-guard) {
  display: flex;
  flex-direction: column;
  gap: 1px;
}

:deep(.proc-title) {
  font-weight: 600;
}

:deep(.tag-wrap) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

:deep(.err) {
  color: #b91c1c;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 160px;
}

.mono {
  font-family: var(--font-mono);
}

.small {
  font-size: 11.5px;
}

.dim {
  color: #8b929c;
}
</style>
