<script setup lang="ts">
/**
 * 驱动包：给 Host 进程安装 / 启停设备驱动包，并安全重启让注册表加载。
 *
 * 数据全部来自 driver-packages 域（Host 专有；--role backend 返回 404 → 降级提示）。
 * 安装是后台 operation：这里每 1.5s 轮询日志直到终态；台账变化后 inventory 的
 * `restart_required` 为 true，页面顶部给出「安静点重启」——走 system.requestRestart
 * （mode=quiescent, scope=auto），默认部署只重启 Host，权威进程保持在线。
 *
 * 「启动」：示例设备包随包带设备图（`share/<包>/graph/*.json`），装完后一键把每张
 * 纯设备图作为受管设备进程拉起（driverPackages.launchGraph），不需要重启 Host；
 * 包里的 @workflow 模板仍要等 Host 重启后才会出现在工作流页。
 */
import { computed, h, onMounted, onUnmounted, ref, shallowRef, watch } from "vue";
import {
  NAlert,
  NButton,
  NCheckbox,
  NDataTable,
  NEmpty,
  NIcon,
  NInput,
  NPopconfirm,
  NSwitch,
  NTag,
  useMessage,
  type DataTableColumns,
} from "naive-ui";
import { RefreshOutline } from "@vicons/ionicons5";
import {
  ApiError,
  type DriverPackage,
  type DriverPackageInventory,
  type DriverPackageOperation,
  type RestartStatus,
} from "@openlab/protocol";
import DeviceProcessesPanel from "../components/DeviceProcessesPanel.vue";
import DriverPackageCatalog from "../components/DriverPackageCatalog.vue";
import PageHeader from "../components/PageHeader.vue";
import FullResetPanel from "../components/FullResetPanel.vue";
import StatusPill from "../components/StatusPill.vue";
import { describeError } from "../features/errors";
import { useConnectionStore } from "../stores/connection";

const conn = useConnectionStore();
const message = useMessage();

const inventory = shallowRef<DriverPackageInventory | null>(null);
const loading = ref(false);
const unsupported = ref(false);
const lastError = ref("");

const spec = ref("");
const enableAfterInstall = ref(true);
const installing = ref(false);

/** 正在跟踪的操作（安装 / 卸载）；终态后保留供查看日志。 */
const activeOperation = shallowRef<DriverPackageOperation | null>(null);
const logOpen = ref(true);

const restart = shallowRef<RestartStatus | null>(null);
const restartPhase = ref<"idle" | "requested" | "down" | "back">("idle");

async function refresh() {
  if (!conn.online) return;
  loading.value = true;
  try {
    inventory.value = await conn.api.domains.driverPackages.inventory();
    unsupported.value = false;
    lastError.value = "";
  } catch (error) {
    if (error instanceof ApiError && error.isUnsupported) {
      unsupported.value = true;
    } else {
      lastError.value = describeError(error);
    }
  } finally {
    loading.value = false;
  }
}

async function refreshRestart() {
  if (!conn.online) return;
  try {
    restart.value = await conn.api.domains.system.restartStatus();
  } catch {
    /* 重启中或不支持时保持上次状态 */
  }
}

// ── 安装 / 卸载 ───────────────────────────────────────────────

async function install(specValue?: string, upgrade = false, name = "") {
  const value = (specValue ?? spec.value).trim();
  if (!value) {
    message.warning("填写 GitHub 仓库地址（https://github.com/org/repo[@ref]）、zip / tar.gz 归档地址或本机目录");
    return;
  }
  installing.value = true;
  try {
    activeOperation.value = await conn.api.domains.driverPackages.install({
      spec: value,
      enable: enableAfterInstall.value,
      upgrade,
      name,
    });
    logOpen.value = true;
    message.info(`已开始${upgrade ? "重装 / 升级" : "安装"} ${value}，下载与依赖安装日志会实时显示在下方`);
    if (!specValue) spec.value = "";
  } catch (error) {
    message.error(`安装请求失败：${describeError(error)}`);
  } finally {
    installing.value = false;
  }
}

async function uninstall(pkg: DriverPackage) {
  try {
    activeOperation.value = await conn.api.domains.driverPackages.uninstall(pkg.name);
    logOpen.value = true;
    message.info(`正在卸载 ${pkg.name}`);
  } catch (error) {
    message.error(`卸载请求失败：${describeError(error)}`);
  }
}

function uninstallByName(name: string) {
  const pkg = packages.value.find((item) => item.name === name);
  if (pkg) void uninstall(pkg);
  else message.warning("驱动包台账已变化，请刷新后重试");
}

async function toggleEnabled(pkg: DriverPackage, enabled: boolean) {
  try {
    await conn.api.domains.driverPackages.setEnabled(pkg.name, enabled);
    message.success(enabled ? `${pkg.name} 将在下次启动挂载` : `${pkg.name} 下次启动不再加载`);
    await refresh();
  } catch (error) {
    message.error(describeError(error));
  }
}

// ── 启动随包设备图 ──────────────────────────────────────────────

const processesPanel = ref<InstanceType<typeof DeviceProcessesPanel> | null>(null);
/** 正在启动的包名（按钮 loading）。 */
const launching = ref<string | null>(null);

/** 把包里每张纯设备图拉成受管进程；示例包通常只有一张，host/slave 双进程 demo 有两张。 */
async function launchPackage(name: string) {
  launching.value = name;
  try {
    const graphs = await conn.api.domains.driverPackages.graphs(name);
    const runnable = graphs.filter((graph) => graph.device_only);
    if (!runnable.length) {
      message.warning(
        graphs.length
          ? `${name} 的随包图含物料节点，只能用 unilab -g 作为启动图加载`
          : `${name} 没有随包设备图，请在下方「受管设备进程」里手动配置设备`,
      );
      return;
    }
    const started: string[] = [];
    for (const graph of runnable) {
      const result = await conn.api.domains.driverPackages.launchGraph(name, graph.name);
      started.push(`${result.process.name}${result.created ? "" : "（已重启）"}`);
    }
    message.success(`已启动 ${started.join("、")}；设备接回 Host 后出现在设备页`);
    await processesPanel.value?.refresh();
  } catch (error) {
    message.error(`启动失败：${describeError(error)}`);
  } finally {
    launching.value = null;
  }
}

/** 轮询进行中的 operation：终态后刷新台账并停止。 */
let operationTimer: ReturnType<typeof setInterval> | null = null;

watch(
  () => activeOperation.value?.operation_id,
  (id) => {
    if (operationTimer) clearInterval(operationTimer);
    operationTimer = null;
    if (!id) return;
    operationTimer = setInterval(async () => {
      try {
        const next = await conn.api.domains.driverPackages.operation(id);
        activeOperation.value = next;
        if (next.status !== "running") {
          if (operationTimer) clearInterval(operationTimer);
          operationTimer = null;
          if (next.status === "succeeded") message.success(`${next.kind === "install" ? "安装" : "卸载"}完成：${next.package_name || next.spec}`);
          else message.error(`${next.kind === "install" ? "安装" : "卸载"}失败：${next.error ?? "未知错误"}`);
          await refresh();
        }
      } catch {
        /* 进程重启期间读不到就等下一轮 */
      }
    }, 1500);
  },
  { immediate: true },
);

// ── 安全重启 ─────────────────────────────────────────────────

const restarting = ref(false);

async function requestRestart(mode: "quiescent" | "immediate") {
  restarting.value = true;
  try {
    restart.value = await conn.api.domains.system.requestRestart({ mode, scope: "auto" });
    restartPhase.value = "requested";
    message.info(mode === "quiescent" ? "已登记安静点重启：等待作业结束后重启 Host；默认部署下调度权威保持在线" : "正在重启 Host 执行端");
  } catch (error) {
    message.error(`重启请求失败：${describeError(error)}`);
  } finally {
    restarting.value = false;
  }
}

async function cancelRestart() {
  try {
    restart.value = await conn.api.domains.system.cancelRestart();
    restartPhase.value = "idle";
    message.info("已取消重启登记");
  } catch (error) {
    message.error(describeError(error));
  }
}

// Host 真的下线又回来后刷新台账，restart_required 会回到 false。
// 两种形态：连的是 Host 本体时 online 会翻一次；连的是调度权威（默认拓扑）时端口
// 一直在线，Host 子进程重启体现为 health.execution ready → restarting → ready。
const hostUp = computed(() => conn.online && conn.health?.execution !== "restarting");
watch(hostUp, (up) => {
  if (restartPhase.value === "requested" && !up) restartPhase.value = "down";
  if (restartPhase.value === "down" && up) {
    restartPhase.value = "back";
    void refresh();
    void refreshRestart();
    message.success("Host 已重启，驱动包台账已重新加载");
    setTimeout(() => (restartPhase.value = "idle"), 6000);
  }
  if (up && !inventory.value) void refresh();
});

// ── 表格 ─────────────────────────────────────────────────────

function fmtMs(value: number | null | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN", { hour12: false }) : "—";
}

const packages = computed(() => inventory.value?.packages ?? []);

const columns: DataTableColumns<DriverPackage> = [
  {
    title: "驱动包",
    key: "name",
    minWidth: 200,
    render: (row) =>
      h("div", { class: "pkg-name" }, [
        h("span", { class: "pkg-title" }, row.name),
        h("span", { class: "mono dim small", title: row.spec }, `${row.version || "?"} · ${row.spec}`),
      ]),
  },
  {
    title: "状态",
    key: "state",
    width: 150,
    render: (row) => {
      if (!row.enabled) return h(StatusPill, { status: "offline", size: "small", label: "已停用" });
      if (!row.dirs_exist) return h(StatusPill, { status: "failed", size: "small", label: "目录缺失" });
      if (row.mounted) return h(StatusPill, { status: "online", size: "small", label: "已加载" });
      return h(StatusPill, { status: "pending", size: "small", label: "待重启生效" });
    },
  },
  {
    title: "设备类",
    key: "device_ids",
    minWidth: 220,
    render: (row) =>
      row.device_ids.length
        ? h(
            "div",
            { class: "tag-wrap" },
            row.device_ids.map((id) =>
              h(
                NTag,
                { size: "small", bordered: false, type: row.loaded_device_ids.includes(id) ? "success" : "default", title: row.loaded_device_ids.includes(id) ? "已在注册表中" : "重启后加载" },
                { default: () => id },
              ),
            ),
          )
        : h("span", { class: "dim" }, "未扫描到 @device"),
  },
  {
    title: "源码树",
    key: "package_root",
    minWidth: 220,
    ellipsis: { tooltip: true },
    render: (row) =>
      h("div", { class: "pkg-name" }, [
        h("span", { class: "mono small", title: row.package_root }, row.package_root || row.package_dirs.join("; ") || "—"),
        h(
          "span",
          { class: "dim small" },
          [
            row.source_kind === "local" ? "本机目录（原地登记）" : row.source_kind === "github" ? "GitHub 下载" : row.source_kind === "archive" ? "归档下载" : "",
            row.dependencies?.length ? `依赖 ${row.dependencies.length} 项（${row.installer || "未装"}）` : "无第三方依赖",
          ]
            .filter(Boolean)
            .join(" · "),
        ),
      ]),
  },
  { title: "安装时间", key: "installed_at_ms", width: 160, render: (row) => fmtMs(row.installed_at_ms) },
  {
    title: "启用",
    key: "enabled",
    width: 80,
    render: (row) => h(NSwitch, { size: "small", value: row.enabled, "onUpdate:value": (value: boolean) => void toggleEnabled(row, value) }),
  },
  {
    title: "操作",
    key: "actions",
    width: 190,
    fixed: "right",
    render: (row) =>
      h("div", { class: "row-actions" }, [
        h(
          NButton,
          {
            size: "tiny",
            type: "primary",
            quaternary: true,
            loading: launching.value === row.name,
            disabled: !row.dirs_exist,
            title: "把随包设备图作为受管设备进程启动（不需要重启 Host）",
            onClick: () => void launchPackage(row.name),
          },
          { default: () => "启动" },
        ),
        h(
          NButton,
          {
            size: "tiny",
            quaternary: true,
            disabled: !row.spec,
            title: row.spec ? `重新下载 ${row.spec} 并升级其依赖` : "台账里没有记录安装来源",
            onClick: () => void install(row.spec, true, row.name),
          },
          { default: () => "升级" },
        ),
        h(
          NPopconfirm,
          { onPositiveClick: () => void uninstall(row) },
          {
            trigger: () => h(NButton, { size: "tiny", type: "error", quaternary: true }, { default: () => "卸载" }),
            default: () =>
              row.source_kind === "local"
                ? `把本机目录 ${row.name} 移出台账（不删文件）？其驱动的设备重启后不可用。`
                : `删除 unilabos_data 里 ${row.name} 的源码树并移出台账？其驱动的设备重启后不可用。`,
          },
        ),
      ]),
  },
];

const opStatusLabel: Record<DriverPackageOperation["status"], string> = {
  running: "进行中",
  succeeded: "成功",
  failed: "失败",
};

let timer: ReturnType<typeof setInterval> | null = null;
onMounted(() => {
  void refresh();
  void refreshRestart();
  timer = setInterval(() => {
    void refreshRestart();
    if (!activeOperation.value || activeOperation.value.status !== "running") void refresh();
  }, 8000);
});
onUnmounted(() => {
  if (timer) clearInterval(timer);
  if (operationTimer) clearInterval(operationTimer);
});
</script>

<template>
  <div class="page">
    <PageHeader
      title="驱动包与设备进程"
      :subtitle="inventory ? `${inventory.packages.length} 个驱动包 · Python ${inventory.python.version} · ${inventory.scan_dirs.length} 个扫描目录 · 装包 → 配设备进程 → 启动` : '安装设备驱动包，把设备配成受管的本机 Slave 进程启动运行'"
    >
      <template #actions>
        <NButton size="small" :loading="loading" @click="refresh">
          <template #icon><NIcon><RefreshOutline /></NIcon></template>
          刷新
        </NButton>
      </template>
    </PageHeader>

    <FullResetPanel />

    <div v-if="!conn.online" class="degraded">
      <span class="degraded-title">尚未连接微后端</span>
      连接 Host 进程后可安装、启停驱动包。
    </div>
    <div v-else-if="unsupported" class="degraded">
      <span class="degraded-title">当前进程没有执行面</span>
      驱动包装进的是运行设备的 Host 进程自己的 Python 环境；<code>--role backend</code> 调度权威进程不加载注册表，
      请把地址切到带设备的 Host 再操作。
    </div>

    <template v-else>
      <NAlert v-if="lastError" type="error" closable @close="lastError = ''">{{ lastError }}</NAlert>

      <!-- 重启横幅：台账变了 / 已登记重启 / 进程重启中 -->
      <div v-if="restartPhase === 'down'" class="restart-bar down">
        <b>Host 正在重启…</b>
        <span>执行面恢复后自动刷新台账。</span>
      </div>
      <div v-else-if="restart?.pending" class="restart-bar pending">
        <b>已登记{{ restart.mode === "immediate" ? "立即" : "安静点" }}重启</b>
        <span>
          新派发已暂停{{ restart.active_jobs.length ? `，等待 ${restart.active_jobs.length} 个执行中的作业结束` : "，执行端已安静，即将重启" }}。
        </span>
        <NButton size="tiny" quaternary @click="cancelRestart">取消</NButton>
        <NButton v-if="restart.active_jobs.length" size="tiny" type="warning" secondary @click="requestRestart('immediate')">不等了，立即重启</NButton>
      </div>
      <div v-else-if="inventory?.restart_required" class="restart-bar required">
        <b>驱动包台账已变化，需要重启 Host 进程才会生效</b>
        <span>安静点重启：暂停新派发，等执行中的作业结束后只重启 Host 进程并自动恢复；调度权威、物料与任务不受影响。</span>
        <NButton size="small" type="primary" :loading="restarting" @click="requestRestart('quiescent')">安静点重启</NButton>
        <NButton size="small" quaternary :loading="restarting" @click="requestRestart('immediate')">立即重启</NButton>
      </div>
      <div v-else-if="restartPhase === 'back'" class="restart-bar ok">
        <b>已重启</b>
        <span>注册表已按新的驱动包目录重新构建。</span>
      </div>

      <div class="grid">
        <DriverPackageCatalog
          :installed-names="packages.map((item) => item.name)"
          :launching="launching"
          @install="(value, upgrade, name) => install(value, upgrade, name)"
          @launch="(name) => launchPackage(name)"
          @uninstall="uninstallByName"
        />

        <section class="card">
          <div class="card-head">
            <span class="card-title">手动安装</span>
            <span class="dim small" :title="inventory?.packages_root">不在索引里的包：源码树放进 unilabos_data/driver_packages/，依赖用 uv 装进 {{ inventory?.python.executable ?? "Host 进程的 Python" }}</span>
          </div>
          <div class="install-row">
            <NInput
              v-model:value="spec"
              placeholder="GitHub 仓库 https://github.com/org/repo[@ref] · 归档地址 …/pkg.tar.gz · 本机目录 D:\devices\acme"
              :disabled="installing"
              @keyup.enter="install()"
            />
            <NButton type="primary" :loading="installing || activeOperation?.status === 'running'" @click="install()">安装</NButton>
          </div>
          <div class="install-opts">
            <NCheckbox v-model:checked="enableAfterInstall">装完即启用（下次启动挂载到 --devices 扫描）</NCheckbox>
            <span class="dim small">安装 = 下载源码树（本机目录原地登记）→ uv 预装 pyproject 依赖 → AST 扫描 `@device` 记入台账；不 pip install 包体。</span>
          </div>

          <!-- 操作日志 -->
          <div v-if="activeOperation" class="op">
            <div class="op-head" @click="logOpen = !logOpen">
              <StatusPill
                :status="activeOperation.status === 'running' ? 'running' : activeOperation.status === 'succeeded' ? 'succeeded' : 'failed'"
                size="small"
                :label="`${activeOperation.kind === 'install' ? '安装' : '卸载'} · ${opStatusLabel[activeOperation.status]}`"
              />
              <span class="mono op-spec">{{ activeOperation.spec }}</span>
              <span class="dim small">{{ fmtMs(activeOperation.started_at_ms) }}</span>
              <span class="dim small op-toggle">{{ logOpen ? "收起日志" : "展开日志" }}</span>
            </div>
            <div v-if="activeOperation.error" class="op-error">{{ activeOperation.error }}</div>
            <pre v-if="logOpen" class="op-log">{{ activeOperation.log || "等待输出…" }}</pre>
          </div>
        </section>
      </div>

      <section class="card">
        <div class="card-head">
          <div class="head-text">
            <span class="card-title">已登记的驱动包</span>
            <span class="dim small">
              启用开关与卸载都在 Host 下次启动生效；「已加载」= 本次启动已纳入扫描。受管设备进程挂载驱动包不需要重启 Host。
            </span>
          </div>
          <div class="scan-dirs">
            <span class="dim small">本次启动扫描目录：</span>
            <span v-for="dir in inventory?.scan_dirs ?? []" :key="dir" class="mono small chip" :title="dir">{{ dir.split(/[\\/]/).slice(-2).join("/") }}</span>
            <NTag v-if="inventory?.external_only" size="tiny" :bordered="false" type="warning" title="--external_devices_only：不加载内置注册表">仅外部包</NTag>
          </div>
        </div>
        <NEmpty v-if="!packages.length" description="还没有通过管理端安装的驱动包；--devices 直接指定的目录不在台账里" style="padding: 28px 0" />
        <NDataTable v-else :columns="columns" :data="packages" size="small" :scroll-x="1100" :row-key="(row: DriverPackage) => row.name" />
      </section>

      <DeviceProcessesPanel ref="processesPanel" :packages="packages" />

      <section v-if="inventory?.operations.length" class="card">
        <div class="card-head"><span class="card-title">最近操作</span></div>
        <ul class="ops">
          <li v-for="op in inventory.operations" :key="op.operation_id" class="ops-row" @click="activeOperation = op; logOpen = true">
            <StatusPill :status="op.status === 'running' ? 'running' : op.status === 'succeeded' ? 'succeeded' : 'failed'" size="small" :label="opStatusLabel[op.status]" />
            <span>{{ op.kind === "install" ? "安装" : "卸载" }}</span>
            <span class="mono ops-spec">{{ op.spec }}</span>
            <span class="dim small">{{ fmtMs(op.started_at_ms) }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<style scoped>
.page {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.grid {
  display: grid;
  grid-template-columns: minmax(0, 3fr) minmax(0, 2fr);
  gap: 12px;
  align-items: stretch;
}

@media (max-width: 1100px) {
  .grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

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
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
}

.card-title {
  font-weight: 700;
  font-size: 13.5px;
  color: #101418;
}

.install-row {
  display: flex;
  gap: 8px;
}

.install-opts {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.restart-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid;
  font-size: 12.5px;
}

.restart-bar span {
  flex: 1;
  min-width: 200px;
}

.restart-bar.required {
  border-color: rgba(180, 83, 9, 0.35);
  background: #fff7e6;
  color: #7a3b00;
}

.restart-bar.pending {
  border-color: rgba(46, 91, 255, 0.35);
  background: #eef2ff;
  color: #1e3a8a;
}

.restart-bar.down {
  border-color: rgba(110, 117, 128, 0.35);
  background: #f3f4f6;
  color: #374151;
}

.restart-bar.ok {
  border-color: rgba(11, 122, 85, 0.35);
  background: #e6f7f0;
  color: #0b5d42;
}

.op {
  border: 1px solid var(--hairline);
  border-radius: 10px;
  overflow: hidden;
}

.op-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: var(--panel-soft);
  cursor: pointer;
}

.op-spec {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

.op-toggle {
  color: var(--domain-accent) !important;
}

.op-error {
  padding: 8px 10px;
  color: #b91c1c;
  font-size: 12px;
  border-top: 1px solid var(--hairline);
}

.op-log {
  margin: 0;
  padding: 10px 12px;
  max-height: 280px;
  overflow: auto;
  background: #101418;
  color: #d5dae0;
  font: 11.5px/1.5 var(--font-mono);
  white-space: pre-wrap;
  word-break: break-all;
}

.head-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.scan-dirs {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.chip {
  padding: 0 6px;
  border-radius: 999px;
  background: #eef0f3;
  color: #3d4650;
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ops {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ops-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 12.5px;
}

:deep(.row-actions) {
  display: flex;
  gap: 2px;
  justify-content: flex-end;
}

.ops-row:hover {
  background: var(--panel-soft);
}

.ops-spec {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}

:deep(.pkg-name) {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

:deep(.pkg-name > .mono) {
  max-width: 260px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:deep(.pkg-title) {
  font-weight: 600;
}

:deep(.tag-wrap) {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
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
