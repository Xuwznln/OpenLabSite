import { createRouter, createWebHashHistory } from "vue-router";

// hash 模式：GitHub Pages 静态托管无需服务端 rewrite
export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: "/",
      name: "console",
      component: () => import("./views/ConsoleView.vue"),
      meta: { title: "运行总览", overline: "Overview" },
    },
    { path: "/console", redirect: "/" },
    { path: "/dashboard", redirect: "/" },

    // ── 实验工作区 ──
    {
      path: "/devices",
      name: "devices",
      component: () => import("./views/DevicesView.vue"),
      meta: { title: "设备", overline: "Instruments" },
    },
    {
      path: "/inventory",
      name: "inventory",
      component: () => import("./views/InventoryView.vue"),
      meta: { title: "物料", overline: "Materials" },
    },
    { path: "/materials", redirect: "/inventory" },
    {
      path: "/lab",
      name: "lab",
      component: () => import("./views/LabMapView.vue"),
      meta: { title: "实验室地图", overline: "Deck Map" },
    },
    {
      path: "/lab/assembly/:id",
      name: "lab-assembly",
      component: () => import("./views/AssemblyView.vue"),
      meta: { title: "装配视图", overline: "Labware" },
    },
    {
      path: "/monitor",
      name: "monitor",
      component: () => import("./views/MonitorView.vue"),
      meta: { title: "运行监控", overline: "Live Monitor" },
    },

    // ── 实验流程 ──
    {
      path: "/workflows",
      name: "workflows",
      component: () => import("./views/WorkflowsView.vue"),
      meta: { title: "实验流程", overline: "Workflows" },
    },
    {
      path: "/workflows/:id",
      name: "workflow-detail",
      component: () => import("./views/WorkflowDetailView.vue"),
      meta: { title: "流程详情", overline: "Workflow" },
    },
    {
      path: "/workflow-tasks/:id",
      name: "workflow-task-detail",
      component: () => import("./views/WorkflowTaskDetailView.vue"),
      meta: { title: "任务运行时", overline: "Task Runtime" },
    },
    {
      path: "/editor",
      name: "editor",
      component: () => import("./views/EditorView.vue"),
      meta: { title: "编排画布", overline: "Protocol Designer" },
    },
    {
      path: "/timeline",
      name: "timeline",
      component: () => import("./views/TimelineView.vue"),
      meta: { title: "任务排程", overline: "Timeline" },
    },

    // ── 异常与告警 ──
    {
      path: "/error-decisions",
      name: "error-decisions",
      component: () => import("./views/ErrorDecisionsView.vue"),
      meta: { title: "异常审批", overline: "Error Recovery" },
    },
    {
      path: "/status-incidents",
      name: "status-incidents",
      component: () => import("./views/StatusIncidentsView.vue"),
      meta: { title: "状态告警", overline: "Status Alerts" },
    },

    // ── 系统 ──
    {
      path: "/history",
      name: "history",
      component: () => import("./views/HistoryView.vue"),
      meta: { title: "执行历史", overline: "Audit" },
    },
    {
      path: "/registry",
      name: "registry",
      component: () => import("./views/RegistryView.vue"),
      meta: { title: "注册表", overline: "Registry Authority" },
    },
    {
      path: "/packages",
      name: "driver-packages",
      component: () => import("./views/DriverPackagesView.vue"),
      meta: { title: "驱动包", overline: "Driver Packages" },
    },
    {
      path: "/system",
      name: "system",
      component: () => import("./views/SystemView.vue"),
      meta: { title: "系统诊断", overline: "Diagnostics" },
    },
    {
      path: "/logs",
      name: "runtime-logs",
      component: () => import("./views/RuntimeLogsView.vue"),
      meta: { title: "实时日志", overline: "Runtime Logs" },
    },
    {
      path: "/data",
      name: "data-browser",
      component: () => import("./views/DataBrowserView.vue"),
      meta: { title: "数据库浏览", overline: "Database Explorer" },
    },
    { path: "/entities", redirect: "/data" },

    // ── 领域工具 ──
    {
      path: "/toolkit",
      name: "domain-toolkit",
      component: () => import("./views/DomainToolkitView.vue"),
      meta: { title: "领域工具", overline: "Open Toolkit" },
    },

    // 参考案例：不进入主导航，供用户/AI 预览和复制源码。
    {
      path: "/cases/organic-synthesis",
      name: "case-organic-synthesis",
      component: () =>
        import("./vibe-cases/organic-synthesis/OrganicSynthesisWorkbench.vue"),
      meta: { title: "有机合成案例", overline: "Reference Case" },
    },
    { path: "/:pathMatch(.*)*", redirect: "/" },
  ],
});
