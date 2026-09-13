<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, type Component } from "vue";
import { RouterLink, useRoute } from "vue-router";
import {
  NConfigProvider,
  NDialogProvider,
  NIcon,
  NMessageProvider,
  zhCN,
  dateZhCN,
} from "naive-ui";
import {
  AlertCircleOutline,
  ColorWandOutline,
  CubeOutline,
  ExtensionPuzzleOutline,
  EyeOutline,
  FlaskOutline,
  GitNetworkOutline,
  HardwareChipOutline,
  LayersOutline,
  MapOutline,
  PauseCircleOutline,
  PulseOutline,
  ScanOutline,
  ServerOutline,
  SpeedometerOutline,
  TerminalOutline,
  TimeOutline,
} from "@vicons/ionicons5";
import CommandPalette from "./components/CommandPalette.vue";
import ConnectionBar from "./components/ConnectionBar.vue";
import SiteCatalog from "./components/SiteCatalog.vue";
import RunDock from "./components/RunDock.vue";
import ScanDrawer from "./components/ScanDrawer.vue";
import { DEFAULT_LOCAL_EDGE_URL, useConnectionStore } from "./stores/connection";
import { useDecisionsStore } from "./stores/decisions";
import { useDomainThemeStore } from "./stores/domain-theme";
import { useEntityCacheStore } from "./stores/entity-cache";
import { useLabStore } from "./stores/lab";
import { useSchedulerStore } from "./stores/scheduler";
import { domainThemeOverrides } from "./theme";

const route = useRoute();
const conn = useConnectionStore();
const domain = useDomainThemeStore();
const entityCache = useEntityCacheStore();
const lab = useLabStore();
const sched = useSchedulerStore();
const decisions = useDecisionsStore();

/** 首次健康检查完成且不可达时才显示，避免刷新瞬间闪烁。 */
const showOfflineBanner = computed(() => !conn.online && conn.lastCheckedAt > 0);

interface NavItem {
  key: string;
  to: string;
  label: string;
  icon: Component;
}

interface NavGroup {
  key: string;
  title?: string;
  items: NavItem[];
}

/** 侧栏分组：总览 → 实验工作区 → 实验流程 → 异常与告警 → 系统。 */
const NAV_GROUPS_BASE = [
  {
    key: "overview",
    items: [{ key: "console", to: "/", icon: TerminalOutline }],
  },
  {
    key: "workspace",
    title: "实验工作区",
    items: [
      { key: "devices", to: "/devices", icon: HardwareChipOutline },
      { key: "inventory", to: "/inventory", icon: CubeOutline },
      { key: "lab", to: "/lab", icon: MapOutline },
      { key: "monitor", to: "/monitor", icon: EyeOutline },
    ],
  },
  {
    key: "flow",
    title: "实验流程",
    items: [
      { key: "workflows", to: "/workflows", icon: GitNetworkOutline },
      { key: "editor", to: "/editor", icon: ColorWandOutline },
      { key: "timeline", to: "/timeline", icon: PulseOutline },
    ],
  },
  {
    key: "alerts",
    title: "异常与告警",
    items: [
      { key: "error-decisions", to: "/error-decisions", icon: AlertCircleOutline },
      { key: "status-incidents", to: "/status-incidents", icon: PauseCircleOutline },
    ],
  },
  {
    key: "system",
    title: "系统",
    items: [
      { key: "history", to: "/history", icon: TimeOutline },
      { key: "registry", to: "/registry", icon: LayersOutline },
      { key: "packages", to: "/packages", icon: ExtensionPuzzleOutline },
      { key: "system", to: "/system", icon: SpeedometerOutline },
      { key: "logs", to: "/logs", icon: TerminalOutline },
      { key: "entities", to: "/data", icon: ServerOutline },
    ],
  },
] as const;

const navGroups = computed<NavGroup[]>(() =>
  NAV_GROUPS_BASE
    .map((group) => ({
      key: group.key,
      title: "title" in group ? group.title : undefined,
      items: group.items.map((item) => ({
        ...item,
        label: domain.config.nav[item.key as keyof typeof domain.config.nav],
      })),
    })),
);

const ROUTE_KEYS: Array<[prefix: string, key: string]> = [
  ["/lab", "lab"],
  ["/workflow-tasks", "workflows"],
  ["/workflows", "workflows"],
  ["/timeline", "timeline"],
  ["/monitor", "monitor"],
  ["/editor", "editor"],
  ["/inventory", "inventory"],
  ["/devices", "devices"],
  ["/data", "entities"],
  ["/history", "history"],
  ["/registry", "registry"],
  ["/packages", "packages"],
  ["/system", "system"],
  ["/logs", "logs"],
  ["/error-decisions", "error-decisions"],
  ["/status-incidents", "status-incidents"],
];

const activeKey = computed(() => {
  if (route.path === "/") return "console";
  const found = ROUTE_KEYS.find(([prefix]) => route.path.startsWith(prefix));
  return found ? found[1] : "console";
});

const pageTitle = computed(() => {
  if (activeKey.value === "cases") return "参考案例";
  for (const group of navGroups.value) {
    const active = group.items.find((item) => item.key === activeKey.value);
    if (active) return active.label;
  }
  return (route.meta.title as string) ?? "";
});
const currentThemeOverrides = computed(() => domainThemeOverrides(domain.config));

// 异常审批角标：动作异常 + 工作流干预 + 等人确认的人工确认单
const alertBadge = computed(
  () => decisions.pendingErrorCount + decisions.openInterventionCount + decisions.pendingConfirmationCount,
);

// ── 全局命令面板 + 扫码直达 ──
const showPalette = ref(false);
const showScan = ref(false);
const scanInitial = ref("");

const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

function openScan(code = "") {
  scanInitial.value = code;
  showScan.value = true;
}

// 扫码枪（键盘楔）识别：非输入框内的连续快速击键 + Enter 结尾
let wedgeBuffer = "";
let wedgeLastTs = 0;
let wedgeFirstTs = 0;

function onGlobalKeydown(ev: KeyboardEvent) {
  if ((ev.metaKey || ev.ctrlKey) && ev.key.toLowerCase() === "k") {
    ev.preventDefault();
    showScan.value = false;
    showPalette.value = !showPalette.value;
    return;
  }

  const target = ev.target as HTMLElement | null;
  const typing =
    target &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable);
  if (typing || showPalette.value || showScan.value) return;

  const nowTs = Date.now();
  if (ev.key === "Enter") {
    if (
      wedgeBuffer.length >= 6 &&
      nowTs - wedgeLastTs < 140 &&
      nowTs - wedgeFirstTs < 2500
    ) {
      openScan(wedgeBuffer);
    }
    wedgeBuffer = "";
    wedgeFirstTs = 0;
    return;
  }
  if (ev.key.length === 1 && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    // 常见键盘楔约 5–50ms/字符；80ms 容忍无线扫码枪抖动，同时避开手输。
    if (!wedgeBuffer || nowTs - wedgeLastTs >= 80) {
      wedgeBuffer = ev.key;
      wedgeFirstTs = nowTs;
    } else {
      wedgeBuffer += ev.key;
    }
    wedgeLastTs = nowTs;
  }
}

function onOpenPalette() {
  showPalette.value = true;
}

function onOpenScan() {
  openScan();
}

onMounted(() => {
  conn.startPolling();
  entityCache.startPolling();
  sched.startPolling();
  decisions.startPolling();
  window.addEventListener("keydown", onGlobalKeydown);
  window.addEventListener("unilab:open-palette", onOpenPalette);
  window.addEventListener("unilab:open-scan", onOpenScan);
});
onUnmounted(() => {
  conn.stopPolling();
  entityCache.stopPolling();
  sched.stopPolling();
  decisions.stopPolling();
  window.removeEventListener("keydown", onGlobalKeydown);
  window.removeEventListener("unilab:open-palette", onOpenPalette);
  window.removeEventListener("unilab:open-scan", onOpenScan);
});
</script>

<template>
  <NConfigProvider :locale="zhCN" :date-locale="dateZhCN" :theme-overrides="currentThemeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <div class="shell">
          <aside class="rail">
            <div class="brand">
              <div class="brand-mark">
                <NIcon size="20" color="#fff"><FlaskOutline /></NIcon>
              </div>
              <div class="brand-text">
                <span class="brand-name">OpenLab</span>
                <span class="brand-sub">Uni-Lab OS 操作台</span>
              </div>
            </div>

            <nav class="nav">
              <template v-for="(group, groupIndex) in navGroups" :key="group.key">
                <span
                  v-if="group.title"
                  class="nav-section"
                  :class="{ 'nav-section-gap': groupIndex > 0 }"
                >
                  {{ group.title }}
                </span>
                <RouterLink
                  v-for="item in group.items"
                  :key="item.key"
                  :to="item.to"
                  class="nav-item"
                  :class="{ active: activeKey === item.key }"
                >
                  <NIcon size="17" class="nav-icon"><component :is="item.icon" /></NIcon>
                  <span class="nav-label">{{ item.label }}</span>
                  <span
                    v-if="item.key === 'error-decisions' && alertBadge"
                    class="nav-badge"
                  >
                    {{ alertBadge }}
                  </span>
                  <span
                    v-if="item.key === 'status-incidents' && decisions.activeIncidentCount"
                    class="nav-badge nav-badge-hold"
                  >
                    {{ decisions.activeIncidentCount }}
                  </span>
                </RouterLink>
              </template>
            </nav>

            <div class="rail-foot">
              <span class="conn-dot" :class="conn.online ? 'conn-on' : 'conn-off'" />
              <div class="conn-meta">
                <span class="conn-text">{{ conn.online ? "后端已连接" : "后端未连接" }}</span>
                <span class="conn-role">{{ conn.roleLabel }}</span>
              </div>
            </div>
          </aside>

          <main class="stage">
            <div class="stage-top">
              <div class="crumb">
                <span class="crumb-title">{{ pageTitle }}</span>
              </div>
              <div class="top-cluster">
                <span class="dim small">通用</span>
                <SiteCatalog />
                <button class="quick-btn" title="扫码直达（扫码枪直接扫即可）" @click="openScan()">
                  <NIcon size="15"><ScanOutline /></NIcon>
                </button>
                <button class="quick-btn kbtn" @click="showPalette = true">
                  <span class="kbtn-text">命令</span>
                  <kbd>{{ isMac ? "⌘" : "Ctrl" }}</kbd><kbd>K</kbd>
                </button>
                <div class="lab-chip">
                  <span class="lab-name">{{ lab.displayName }}</span>
                  <span class="lab-domain">{{ conn.baseUrl.replace(/^https?:\/\//, "") }}</span>
                </div>
                <ConnectionBar />
              </div>
            </div>
            <div class="stage-body">
              <div class="stage-canvas">
                <Transition name="banner">
                  <div v-if="showOfflineBanner" class="offline-banner" role="status">
                    <span class="offline-dot" />
                    <div class="offline-text">
                      <strong>后端未连接</strong>
                      <span class="offline-detail">
                        {{ conn.baseUrl }} · {{ conn.lastError || "等待进程就绪" }}。页面保留最后一次数据，恢复后自动继续同步。
                      </span>
                    </div>
                    <div class="offline-actions">
                      <button class="offline-btn" :disabled="conn.checking" @click="conn.checkHealth()">
                        {{ conn.checking ? "检测中…" : "立即重试" }}
                      </button>
                      <button
                        v-if="conn.baseUrl !== DEFAULT_LOCAL_EDGE_URL"
                        class="offline-btn ghost"
                        @click="conn.setBaseUrl(DEFAULT_LOCAL_EDGE_URL)"
                      >
                        连接本机 :8002
                      </button>
                    </div>
                  </div>
                </Transition>
                <RouterView />
              </div>
            </div>
            <footer class="project-credits dim">
              <a href="https://github.com/Xuwznln/OpenLabSite/blob/main/docs/LOCAL_START.md" target="_blank" rel="noopener noreferrer">本地启动教程</a>
              <span>上海交通大学rethinklab · 北京中关村学院 · DeepModellings</span>
            </footer>
          </main>
        </div>

        <CommandPalette v-model:show="showPalette" @scan="openScan()" />
        <ScanDrawer v-model:show="showScan" :initial-code="scanInitial" />
        <RunDock />
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style>
html,
body,
#app {
  height: 100%;
  margin: 0;
  overflow: hidden;
  font-family: var(--font-sans);
  background: var(--paper);
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

/* 面板：细线平面化，层次靠排版而非投影 */
.n-card {
  border: 1px solid var(--hairline) !important;
  box-shadow: 0 14px 36px -32px rgba(16, 20, 24, 0.35) !important;
  overflow: hidden;
}

/* 区块标题 = 小号大写字距标签 */
.n-card > .n-card-header .n-card-header__main {
  font-size: 12px !important;
  font-weight: 700 !important;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #6e7580;
}

.display-num {
  font-family: var(--font-display);
  font-variant-numeric: tabular-nums;
}

code,
pre,
.mono {
  font-family: var(--font-mono);
}

/* 页面级通用布局原子 */
.page-grid {
  display: grid;
  gap: 16px;
}

.page-grid-2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.page-grid-3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

@media (max-width: 1100px) {
  .page-grid-2,
  .page-grid-3 {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* 统一空态 / 降级态卡片 */
.degraded {
  border: 1px dashed var(--hairline);
  border-radius: 14px;
  padding: 28px 24px;
  text-align: center;
  color: #6e7580;
  background: var(--panel-soft);
}

.degraded-title {
  display: block;
  font-weight: 700;
  color: #3d4650;
  margin-bottom: 6px;
}

.degraded code {
  font-size: 12px;
}

/* 壳层离线横幅：所有页面共用，页面内不再各自渲染裸错误串 */
.offline-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
  padding: 10px 14px;
  border-radius: 12px;
  border: 1px solid rgba(217, 48, 37, 0.25);
  background: linear-gradient(90deg, rgba(217, 48, 37, 0.08), rgba(217, 48, 37, 0.03));
  color: #5a1f1a;
  font-size: 13px;
}

.offline-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #d93025;
  box-shadow: 0 0 0 4px rgba(217, 48, 37, 0.15);
  flex-shrink: 0;
  animation: offline-pulse 1.6s ease-in-out infinite;
}

@keyframes offline-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 3px rgba(217, 48, 37, 0.12);
  }
  50% {
    box-shadow: 0 0 0 6px rgba(217, 48, 37, 0.05);
  }
}

.offline-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 10px;
  align-items: baseline;
}

.offline-detail {
  color: #7a3b34;
  overflow: hidden;
  text-overflow: ellipsis;
}

.offline-actions {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}

.offline-btn {
  border: 1px solid rgba(217, 48, 37, 0.35);
  background: #fff;
  color: #b3261e;
  border-radius: 8px;
  padding: 5px 11px;
  font: 600 12px var(--font-sans);
  cursor: pointer;
}

.offline-btn:hover:not(:disabled) {
  background: rgba(217, 48, 37, 0.08);
}

.offline-btn:disabled {
  opacity: 0.6;
  cursor: default;
}

.offline-btn.ghost {
  border-color: var(--hairline);
  color: #3d4650;
}

.banner-enter-active,
.banner-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.banner-enter-from,
.banner-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}
</style>

<style scoped>
.project-credits {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 6px 18px;
  padding: 8px 16px;
  flex-shrink: 0;
  font-size: 11px;
  border-top: 1px solid var(--hairline);
}
.project-credits a { color: var(--domain-accent); }

.shell {
  display: flex;
  height: 100vh;
  background:
    linear-gradient(rgba(16, 20, 24, 0.04) 1px, transparent 1px),
    linear-gradient(90deg, rgba(16, 20, 24, 0.04) 1px, transparent 1px),
    radial-gradient(circle at 78% -10%, rgba(var(--domain-accent-rgb), 0.09), transparent 34%),
    var(--paper);
  background-size:
    28px 28px,
    28px 28px,
    auto;
  overflow: hidden;
}

/* ── 墨色导航岛 ─────────────────────────────── */
.rail {
  width: 232px;
  flex-shrink: 0;
  margin: 16px 0 16px 16px;
  border-radius: 20px;
  background:
    radial-gradient(circle at 50% -10%, rgba(var(--domain-accent-rgb), 0.3), transparent 30%),
    #0c1014;
  border: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  flex-direction: column;
  padding: 18px 12px 12px;
  box-sizing: border-box;
}

.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 8px 16px;
}

.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--domain-accent);
  box-shadow: 0 10px 24px rgba(var(--domain-accent-rgb), 0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.brand-text {
  display: flex;
  flex-direction: column;
  line-height: 1.25;
}

.brand-name {
  color: #fff;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.brand-sub {
  color: #7d8b99;
  font-size: 11px;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: none;
}

.nav::-webkit-scrollbar {
  display: none;
}

.nav-section {
  padding: 2px 12px 4px;
  color: #58636f;
  font: 700 9px var(--font-mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.nav-section-gap {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 7px 11px;
  border-radius: 10px;
  color: #8b939c;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
  transition: background 0.15s ease, color 0.15s ease;
  position: relative;
}

/* 矮窗口：进一步压缩导航间距，保证全部入口可见 */
@media (max-height: 860px) {
  .rail {
    padding: 14px 12px 10px;
  }

  .nav-item {
    padding: 5px 11px;
    font-size: 12.5px;
  }

  .nav-section {
    padding: 1px 12px 3px;
  }

  .nav-section-gap {
    margin-top: 4px;
    padding-top: 5px;
  }

  .brand {
    padding-bottom: 10px;
  }

  .rail-foot {
    margin-top: 8px;
    padding-top: 8px;
  }
}

@media (max-height: 800px) {
  .rail {
    margin: 12px 0 12px 12px;
  }

  .nav-item {
    padding: 4px 10px;
    font-size: 12px;
    gap: 9px;
  }

  .nav {
    gap: 1px;
  }

  .nav-section-gap {
    margin-top: 3px;
    padding-top: 4px;
  }

  .brand {
    padding-bottom: 8px;
  }

  .brand-mark {
    width: 30px;
    height: 30px;
  }
}

.nav-item:hover {
  color: #fff;
  background: rgba(255, 255, 255, 0.06);
}

.nav-item.active {
  color: #0c1014;
  background: #fff;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
}

.nav-item.active .nav-icon {
  color: var(--domain-accent);
}

.nav-icon {
  flex-shrink: 0;
}

.nav-label {
  flex: 1;
}

.nav-badge {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: #dc2626;
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  font-family: var(--font-mono);
  display: flex;
  align-items: center;
  justify-content: center;
}

.nav-badge-hold {
  background: #b45309;
}

.rail-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 10px 2px;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.conn-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.conn-on {
  background: #04aa65;
  box-shadow: 0 0 8px rgba(4, 170, 101, 0.8);
}

.conn-off {
  background: #de3b3b;
}

.conn-meta {
  display: flex;
  flex-direction: column;
  line-height: 1.3;
  min-width: 0;
}

.conn-text {
  color: #c3ccd6;
  font-size: 12px;
  font-weight: 600;
}

.conn-role {
  color: #6f7d8b;
  font-size: 11px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── 内容舞台 ─────────────────────────────── */
.stage {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  padding: 16px clamp(16px, 2.5vw, 36px) 0;
  box-sizing: border-box;
}

.stage-top {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 10px 16px;
  padding: 4px 2px 14px;
}

.crumb {
  display: flex;
  align-items: baseline;
  gap: 8px;
  white-space: nowrap;
}

.crumb-title {
  font-family: var(--font-mono);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #101418;
}

.top-cluster {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--panel);
  border: 1px solid var(--hairline);
  border-radius: 999px;
  padding: 6px 10px 6px 10px;
}

.quick-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid #e8e6e1;
  background: #fafaf8;
  border-radius: 999px;
  padding: 5px 10px;
  color: #3d4650;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: border-color 0.15s ease, color 0.15s ease;
}

.quick-btn:hover {
  border-color: var(--domain-accent);
  color: var(--domain-accent);
}

.quick-btn kbd {
  font-family: var(--font-mono);
  font-size: 10px;
  background: #fff;
  border: 1px solid #dedbd4;
  border-radius: 4px;
  padding: 0 4px;
  line-height: 1.5;
}

.lab-chip {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  line-height: 1.25;
  padding-right: 12px;
  border-right: 1px solid rgba(13, 27, 44, 0.1);
}

.lab-name {
  font-size: 12.5px;
  font-weight: 700;
  color: #16212d;
}

.lab-domain {
  font-size: 10.5px;
  color: #5c6874;
}

/* 页面只允许纵向滚动；横向溢出（含亚像素取整）一律裁掉，宽表格各自内部滚动 */
.stage-body {
  flex: 1;
  min-height: 0;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
}

.stage-canvas {
  min-width: 0;
  width: min(100%, 1680px);
  margin: 0 auto;
  padding-bottom: 40px;
}

/* 工作台型页面（根元素带 .app-fill）：画布锁满可视高度，滚动下放到页面内部 */
.stage-canvas:has(> .app-fill) {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding-bottom: 0;
}

.stage-canvas > .app-fill {
  flex: 1;
  min-height: 0;
}

@media (max-width: 1180px) {
  .top-domain :deep(.domain-label) {
    display: none;
  }
}

@media (max-width: 960px) {
  .lab-chip {
    display: none;
  }

  .kbtn-text {
    display: none;
  }

  .rail {
    width: 204px;
  }
}

@media (max-width: 760px) {
  .rail {
    width: 76px;
    margin: 8px 0 8px 8px;
    padding: 14px 8px;
    border-radius: 16px;
  }

  .brand {
    justify-content: center;
    padding-inline: 0;
  }

  .brand-text,
  .nav-label,
  .nav-section,
  .conn-meta {
    display: none;
  }

  .top-domain :deep(.domain-label) {
    display: none;
  }

  .nav-item {
    justify-content: center;
    padding: 10px;
  }

  .nav-badge {
    position: absolute;
    top: 2px;
    right: 2px;
  }

  .rail-foot {
    justify-content: center;
  }

  .stage {
    padding: 8px 10px 0;
  }

  .kbtn {
    display: none;
  }

  .top-cluster {
    gap: 5px;
    padding: 4px;
  }
}
</style>
