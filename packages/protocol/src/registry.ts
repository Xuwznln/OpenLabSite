/**
 * Registry Authority（registry 域，unilabos/server/api/runtime/registry.py）。
 *
 * 跟随调度权威挂载：默认 Host 或 `--role backend` 进程都可以持有本域；已经
 * 接入远端 Backend 的受控 Edge 不挂载。**调度权威不自己扫描注册表，目录只来自 Host 上报**
 * （`POST /registry/reports`）；首次上报前目录为空（`status().reported = false`）。
 *
 * 接受规则：新增 / 变化 / Host 不再上报（待确认移除）的条目先挂起，满足其一自动生效——
 * 规则 B：上报 Host 与权威同机、且权威没有记着跨机器 Slave（`acceptance.single_machine`）；
 * 规则 A：条目所属驱动包版本比已接受内容的高。不满足时挂起待确认（`pending_reason` 说明原因），
 * 由前端逐条或批量"接受"（apply）/"忽略"（dismiss）。冲突明细（被引用 action 删除 / 变化）
 * 只附在挂起条目上，不再决定是否挂起。
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

/** 挂起的是哪种变化：新条目、已有条目的新版本、Host 不再上报（待确认移除）；空串 = 没有挂起。 */
export type RegistryPendingChange = "" | "add" | "update" | "remove";

/** 为什么没有自动接受：上报的 Host 不在权威这台机器上 / 权威记着跨机器 Slave；空串 = 没有挂起。 */
export type RegistryPendingReason = "" | "cross-machine-reporter" | "cross-machine-slave";

/** 自动接受依据：规则 B（单机部署）/ 规则 A（驱动包版本升高）。 */
export type RegistryAcceptRule = "single-machine" | "package-upgrade";

export interface RegistryEntrySummary {
  name: string;
  template_uuid: string;
  active_version: number | null;
  pending_version: number | null;
  pending_conflicts: RegistryConflict[];
  pending_change?: RegistryPendingChange;
  pending_reason?: RegistryPendingReason;
  /** 挂起内容所属驱动包版本（规则 A 的比较对象）。 */
  pending_package_version?: string;
  /** 已接受内容所属驱动包与版本。 */
  package?: string;
  package_version?: string;
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
  pending_change?: RegistryPendingChange;
  pending_reason?: RegistryPendingReason;
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
  /** 已生效的新增 / 更新 / 移除里按自动接受规则生效的个数（与 added / updated / removed 重叠）。 */
  auto_accepted?: number;
}

/** 规则 B 判定：上报 Host 与权威同机、且没有跨机器 Slave 时 `single_machine`。 */
export interface RegistryAcceptance {
  single_machine: boolean;
  reason: RegistryPendingReason;
  /** 上报 Host 的机器标识（进程内上报为权威自己的）。 */
  reporter_machine_id: string;
  /** 判定时权威记着的跨机器 Slave（machine_name）。 */
  remote_slaves: string[];
}

export interface RegistryReportSummary {
  counts: RegistryReportCounts;
  added: string[];
  updated: string[];
  pending: Array<{ name: string; conflicts: RegistryConflict[]; change?: RegistryPendingChange; reason?: RegistryPendingReason }>;
  removed: string[];
  revived: string[];
  unusable: Array<{ id: string; reason: string }>;
  auto_accepted?: Array<{ name: string; rule: RegistryAcceptRule; conflicts: RegistryConflict[] }>;
  acceptance?: RegistryAcceptance | null;
}

/** 权威记着的跨机器 Slave（`registry_remote_slave`）。 */
export interface RegistryRemoteSlave {
  machine_name: string;
  /** Slave 自报的机器标识；旧 Slave 没有时为空（同样算跨机器）。 */
  machine_id: string;
  /** 经由哪个 Host 报来。 */
  edge_uuid: string;
  first_seen_at_ms: number;
  last_seen_at_ms: number;
}

/** `GET /registry/status`：目录是否已上报、最近一次上报、挂起数与当前的规则 B 判定。 */
export interface RegistryStatus {
  /** 是否收到过 Host 上报；false 时目录为空，编译 / 实例化报 `registry_not_reported`。 */
  reported: boolean;
  last_report: {
    report_id: number;
    created_at_ms: number;
    edge_uuid: string;
    counts: Partial<RegistryReportCounts>;
    acceptance?: RegistryAcceptance | null;
  } | null;
  active_count: number;
  pending_count: number;
  /** 权威这台机器的标识。 */
  machine_id: string;
  acceptance: RegistryAcceptance;
  remote_slaves: RegistryRemoteSlave[];
}

/** 批量接受 / 忽略的结果：逐条执行，失败的列入 `failed`。 */
export interface RegistryPendingBatchResult {
  entries: RegistryEntrySummary[];
  failed: Array<{ name: string; error: string }>;
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
  /**
   * `loop`：循环容器（`for` / 原生 `while` / `ctx.loop_for` / `ctx.loop_while`），循环体节点以 `parent` 指向它；
   * `condition`：源码 `if` 的条件（分支步骤的 `condition_guards` 引用它）；`material_io`：人工装入 / 取走 / 补量；
   * `group`：`ctx.group` / `ctx.parallel` 的展示分组（成员以 `parent` 指向它，不参与执行依赖）。
   */
  kind: "action" | "slot" | "template" | "loop" | "condition" | "material_io" | "group";
  role?: string;
  action_name?: string;
  name?: string;
  /** 这一步做什么 / 操作员该看到什么（`ctx.run(..., description=)`） */
  description?: string;
  /**
   * action：动作参数；loop：LoopSpec（node_output 条件 / 表达式用 `node_key` 引用模板里的步骤）；
   * condition：`{version, expression}`；material_io：人工物料参数。步骤结果引用写成 `{kind: "node_output", node_key, data_key}`。
   */
  param?: JsonObject;
  /** 分支步骤的条件守卫：`[{node_key, equals}]`（只执行命中的分支） */
  condition_guards?: JsonObject[];
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
  /** `with ctx.lock(...)` 资源作用域：`{scope_id, kind, resources[角色], node_keys[]}` */
  resource_scopes?: JsonObject[];
  /** 入口参数与输出（`input_contract` / `output_contract` / `output_bindings`） */
  io?: JsonObject;
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
    /** POST .../apply —— 接受挂起的变化：挂起版本切换为生效版本，待确认移除则软移除 */
    applyEntry: (name: string) =>
      backendRequest<RegistryEntrySummary>(http, {
        method: "POST",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/apply`,
      }),
    /** POST .../dismiss —— 忽略挂起的变化（生效版本不动，历史保留；Host 再报同一内容会再次挂起） */
    dismissEntry: (name: string) =>
      backendRequest<RegistryEntrySummary>(http, {
        method: "POST",
        path: `/api/v1/registry/entries/${encodeURIComponent(name)}/dismiss`,
      }),
    /** POST /api/v1/registry/pending/apply —— 批量接受；`names` 省略或为空即全部挂起条目 */
    applyPending: (names: string[] = []) =>
      http.request<RegistryPendingBatchResult>({ method: "POST", path: "/api/v1/registry/pending/apply", body: { names } }),
    /** POST /api/v1/registry/pending/dismiss —— 批量忽略；`names` 省略或为空即全部挂起条目 */
    dismissPending: (names: string[] = []) =>
      http.request<RegistryPendingBatchResult>({ method: "POST", path: "/api/v1/registry/pending/dismiss", body: { names } }),
    /** GET /api/v1/registry/status —— 目录是否已上报、挂起数、单机判定与跨机器 Slave */
    status: () => http.request<RegistryStatus>({ method: "GET", path: "/api/v1/registry/status" }),
    /** GET /api/v1/registry/slaves —— 权威记着的跨机器 Slave 与当前判定 */
    remoteSlaves: () =>
      http.request<{ slaves: RegistryRemoteSlave[]; acceptance: RegistryAcceptance }>({
        method: "GET",
        path: "/api/v1/registry/slaves",
      }),
    /** DELETE /api/v1/registry/slaves/{machine_name} —— 确认不再使用后删除记录（不存在 4001） */
    forgetRemoteSlave: (machineName: string) =>
      http.request<{ machine_name: string; remaining: string[] }>({
        method: "DELETE",
        path: `/api/v1/registry/slaves/${encodeURIComponent(machineName)}`,
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
