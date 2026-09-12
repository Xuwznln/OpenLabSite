/**
 * Registry Authority（registry 域，unilabos/server/api/runtime/registry.py）。
 *
 * 跟随调度权威挂载：默认 Host 或 `--role backend` 进程都可以持有本域；已经
 * 接入远端 Backend 的受控 Edge 不挂载。Edge 每次刷新把全量模板定义上报
 * （POST /resource-templates），任何字段变化都为该条目自增一个版本；被活跃
 * workflow 节点引用的 action 被删除/定义变化时**不自动生效**，挂起为 pending
 * 版本，由前端"升级"（apply）或"忽略"（dismiss）。
 *
 * - 信封与 workflow 域一致：HTTP 200 + `{code,data}`，经 common.ts 的唯一解包器
 *   抛 BackendBusinessError；404/409/503 走 ApiError。
 * - 远端调度模式的 Edge 没有本域（404），前端按「不支持」静默降级。
 * - `pendingImpacts` 是画布/节点表徽标的数据源：按冲突 action 反查受影响
 *   的 workflow 节点。
 * - 字段拼写与 `unilabos/protocol/runtime/registry.py` 的 Pydantic 模型对齐。
 */
import { backendRequest, type HttpTransport, type JsonObject } from "./common.js";

/** 冲突原因：被引用 action 在新版本中被删除 / 定义变化。 */
export type RegistryConflictReason = "action-removed" | "action-changed";

export interface RegistryConflict {
  action: string;
  reason: RegistryConflictReason;
}

/** 条目组合状态标签；一个条目可同时携带多个（如 active+pending）。 */
export type RegistryEntryStatus = "active" | "pending" | "removed" | "unusable";

export interface RegistryEntrySummary {
  name: string;
  template_uuid: string;
  active_version: number | null;
  pending_version: number | null;
  pending_conflicts: RegistryConflict[];
  unusable_reason: string;
  removed_at_ms: number | null;
  updated_at_ms: number;
  status: RegistryEntryStatus[];
}

/** 详情在状态行基础上追加生效/挂起版本的完整模板 payload。 */
export interface RegistryEntryDetail extends RegistryEntrySummary {
  active_payload?: JsonObject | null;
  pending_payload?: JsonObject | null;
}

/** 被挂起条目影响的 workflow 节点（node_uuid 即 workflow_node 行）。 */
export interface RegistryAffectedNode {
  workflow_uuid: string;
  workflow_name: string;
  node_uuid: string;
  node_name: string;
  action: string;
}

export interface RegistryPendingImpact {
  name: string;
  template_uuid: string;
  active_version: number | null;
  pending_version: number;
  conflicts: RegistryConflict[];
  affected_nodes: RegistryAffectedNode[];
}

export interface RegistryEntryVersion {
  version: number;
  created_at_ms: number;
  source: string;
  edge_uuid: string;
  restored_from: number | null;
  content_sha256: string;
}

export interface RegistryReportCounts {
  total: number;
  added: number;
  updated: number;
  pending: number;
  unchanged: number;
  removed: number;
  revived: number;
  unusable: number;
}

export interface RegistryReportSummary {
  counts: RegistryReportCounts;
  added: string[];
  updated: string[];
  pending: Array<{ name: string; conflicts: RegistryConflict[] }>;
  removed: string[];
  revived: string[];
  unusable: Array<{ id: string; reason: string }>;
}

export interface RegistryReport {
  report_id: number;
  created_at_ms: number;
  edge_uuid: string;
  summary: RegistryReportSummary;
}

/**
 * 设备包 `@workflow` 声明的工作流模板（registry_type=workflow 条目 payload）。
 * 与前端「工作流模板」同形：动作节点用**角色**占位——`ctx.run` 的角色是设备 id，
 * `ctx.run_template` 的角色是设备类（`class:<name>`），插入画布时再绑到实际设备；
 * 步骤按声明序用 edges 串成链。
 */
export interface RegistryWorkflowTemplateRole {
  role: string;
  label: string;
  kind: "device" | "class";
  device_id?: string;
  device_class?: string;
  matches: string[];
}

export interface RegistryWorkflowTemplateNode {
  key: string;
  /** `loop`：循环容器（`with ctx.loop_for / ctx.loop_while`），循环体节点以 `parent` 指向它 */
  kind: "action" | "slot" | "template" | "loop";
  role?: string;
  action_name?: string;
  name?: string;
  /** 这一步做什么 / 操作员该看到什么（`ctx.run(..., description=)`） */
  description?: string;
  /** action：动作参数；loop：LoopSpec（node_output 条件用 `node_key` 引用模板里的步骤） */
  param?: JsonObject;
  inventory_requirements?: JsonObject[];
  /** 所在循环节点的 key；顶层步骤没有 */
  parent?: string;
}

/**
 * 模板操作指引（`@workflow(guide=...)`）：运行前要在前端做的准备（出库、挂到哪台设备
 * 哪个位点、确认设备在线）、预期效果、注意事项。三段都是按顺序的短句列表。
 */
export interface RegistryWorkflowTemplateGuide {
  preparation: string[];
  expected: string[];
  notes: string[];
}

export interface RegistryWorkflowTemplate {
  /** 注册表条目名（`module:qualname`），包内唯一 */
  id: string;
  registry_type: "workflow";
  /** 跨机器稳定的模板身份（uuid5） */
  uuid: string;
  display_name: string;
  description: string;
  tags: string[];
  /** 来源设备包（模块路径顶层包名，如 `site_demo`）；旧 Host 不带，前端从 id 推导 */
  package?: string;
  /** 声明该模板的模块路径（`site_demo.workflows`） */
  module?: string;
  roles: RegistryWorkflowTemplateRole[];
  nodes: RegistryWorkflowTemplateNode[];
  edges: Array<{ source: string; target: string }>;
  guide?: RegistryWorkflowTemplateGuide;
}

export function createRegistryApi(http: HttpTransport) {
  return {
    /** GET /api/v1/registry/entries —— 条目状态列表（status 过滤可选） */
    entries: (params: { status?: RegistryEntryStatus | "" } = {}) =>
      backendRequest<{ entries: RegistryEntrySummary[] }>(http, {
        method: "GET",
        path: "/api/v1/registry/entries",
        params,
      }),
    /** GET /api/v1/registry/entries/{name} —— 状态 + 生效/挂起 payload */
    entry: (name: string) =>
      backendRequest<RegistryEntryDetail>(http, {
        method: "GET",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}`,
      }),
    /** GET /api/v1/registry/pending-impacts —— 挂起条目 → 受影响节点清单 */
    pendingImpacts: () =>
      backendRequest<{ impacts: RegistryPendingImpact[] }>(http, {
        method: "GET",
        path: "/api/v1/registry/pending-impacts",
      }),
    /** GET /api/v1/registry/entries/{name}/versions —— 版本历史（新在前） */
    entryVersions: (name: string) =>
      backendRequest<{ versions: RegistryEntryVersion[] }>(http, {
        method: "GET",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/versions`,
      }),
    /** GET /api/v1/registry/entries/{name}/versions/{version} —— 单版本全文 */
    entryVersion: (name: string, version: number) =>
      backendRequest<JsonObject>(http, {
        method: "GET",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/versions/${version}`,
      }),
    /** POST .../apply —— "升级"按钮：挂起版本切换为生效版本 */
    applyEntry: (name: string) =>
      backendRequest<RegistryEntrySummary>(http, {
        method: "POST",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/apply`,
      }),
    /** POST .../dismiss —— 忽略挂起版本（生效版本不动，历史保留） */
    dismissEntry: (name: string) =>
      backendRequest<RegistryEntrySummary>(http, {
        method: "POST",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/dismiss`,
      }),
    /** POST .../restore/{version} —— 历史版本还原为新的生效版本 */
    restoreEntry: (name: string, version: number) =>
      backendRequest<RegistryEntrySummary>(http, {
        method: "POST",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/restore/${version}`,
      }),
    /** GET /api/v1/registry/workflow-templates —— 生效的 @workflow 模板（模板面板数据源） */
    workflowTemplates: () =>
      backendRequest<{ templates: RegistryWorkflowTemplate[] }>(http, {
        method: "GET",
        path: "/api/v1/registry/workflow-templates",
      }),
    /** GET /api/v1/registry/reports —— 上报批次统计 */
    reports: (params: { page?: number; page_size?: number } = {}) =>
      backendRequest<{
        reports: RegistryReport[];
        total: number;
        page: number;
        page_size: number;
      }>(http, {
        method: "GET",
        path: "/api/v1/registry/reports",
        params,
      }),
  };
}

export type RegistryApi = ReturnType<typeof createRegistryApi>;
