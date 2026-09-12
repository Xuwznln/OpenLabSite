/**
 * 机器可读操作目录：浏览器会调用的每一条微后端路由。
 *
 * 与 Uni-Lab-OS `GET /api/openapi.json` 逐条对应；协议测试把各域客户端的实际
 * 请求与本目录双向比对，保证「客户端方法 ↔ 后端路由」一一对应。写端点属于
 * Backend ↔ Edge 控制面（runtime 命令 receive / job transition / outbox claim、
 * telemetry ingest、history append、materials snapshot 对齐）不在此登记，
 * 浏览器也不得调用。
 *
 * `role` 标注挂载角色：`host` 只在设备执行进程可用，`backend` 只在
 * `--role backend` 调度权威进程可用，`any` 两者皆有。
 */
import type { OperationContract } from "./common.js";

export const OPERATIONS = [
  // ── system：诊断路由（unilabos/server/api/runtime/diagnostics.py） ──
  { id: "system.health", domain: "system", method: "GET", path: "/api/v1/health", summary: "健康状态：scheduler local/remote、execution ready/disabled", mutates: false, role: "any" },
  { id: "system.hostlink.peers", domain: "system", method: "GET", path: "/api/v1/hostlink/peers", summary: "HostLink 组网：host/slave 角色、在线 peer 与设备档案", mutates: false, role: "any" },
  { id: "system.scheduler.resources", domain: "system", method: "GET", path: "/api/v1/scheduler/resources", summary: "本机调度资源快照（503 = 调度权威在远端）", mutates: false, role: "any" },
  { id: "system.restart.status", domain: "system", method: "GET", path: "/api/v1/restart", summary: "安静点重启等待状态", mutates: false, role: "any" },
  { id: "system.restart.request", domain: "system", method: "POST", path: "/api/v1/restart", summary: "登记安静点重启（暂停派发，active job 清空后重启）", mutates: true, role: "any" },
  { id: "system.restart.cancel", domain: "system", method: "DELETE", path: "/api/v1/restart", summary: "取消等待中的重启并恢复派发", mutates: true, role: "any" },

  // ── runtime-v1：runtime.db 只读投影 ──
  { id: "runtime-v1.sessions.list", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/sessions", summary: "Backend 控制会话列表", mutates: false, role: "any" },
  { id: "runtime-v1.sessions.get", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/sessions/{session_uuid}", summary: "Backend 控制会话详情", mutates: false, role: "any" },
  { id: "runtime-v1.endpoints.list", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/endpoints", summary: "执行 endpoint 快照：设备路由 + 动作能力（设备目录权威）", mutates: false, role: "any" },
  { id: "runtime-v1.endpoints.get", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/endpoints/{endpoint_uuid}", summary: "执行 endpoint 快照详情", mutates: false, role: "any" },
  { id: "runtime-v1.commands.list", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/commands", summary: "Backend command inbox 列表", mutates: false, role: "any" },
  { id: "runtime-v1.commands.get", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/commands/{command_uuid}", summary: "Backend command inbox 详情", mutates: false, role: "any" },
  { id: "runtime-v1.jobs.list", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/jobs", summary: "执行 job 列表（status/device_uuid 过滤）", mutates: false, role: "any" },
  { id: "runtime-v1.jobs.get", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/jobs/{job_uuid}", summary: "执行 job 详情", mutates: false, role: "any" },
  { id: "runtime-v1.adapter-commands.list", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/adapter-commands", summary: "Adapter durable outbox 列表", mutates: false, role: "any" },
  { id: "runtime-v1.adapter-commands.get", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/adapter-commands/{adapter_command_uuid}", summary: "Adapter durable outbox 详情", mutates: false, role: "any" },
  { id: "runtime-v1.backend-events.list", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/backend-events", summary: "Backend event durable outbox 列表", mutates: false, role: "any" },
  { id: "runtime-v1.backend-events.get", domain: "runtime-v1", method: "GET", path: "/api/v1/runtime/backend-events/{event_uuid}", summary: "Backend event durable outbox 详情", mutates: false, role: "any" },

  // ── workflow：Workflow Authority（本机调度时挂载） ──
  { id: "workflow.workflow.create", domain: "workflow", method: "POST", path: "/api/v1/workflows", summary: "创建 Workflow 定义", mutates: true, role: "any" },
  { id: "workflow.workflow.list", domain: "workflow", method: "GET", path: "/api/v1/workflows", summary: "Workflow 定义分页列表", mutates: false, role: "any" },
  { id: "workflow.workflow.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}", summary: "Workflow 定义详情", mutates: false, role: "any" },
  { id: "workflow.workflow.update", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}", summary: "更新 Workflow 定义元数据", mutates: true, role: "any" },
  { id: "workflow.workflow.delete", domain: "workflow", method: "DELETE", path: "/api/v1/workflows/{workflow_uuid}", summary: "软删除 Workflow 并级联节点/边", mutates: true, role: "any" },
  { id: "workflow.graph.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/graph", summary: "整图 hydration（nodes/edges/node_templates/handle_templates）", mutates: false, role: "any" },
  { id: "workflow.graph.save", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}/graph", summary: "revision 乐观锁全量协调 Graph", mutates: true, role: "any" },
  { id: "workflow.task.create", domain: "workflow", method: "POST", path: "/api/v1/workflow-tasks", summary: "提交运行：整图（workflow）或单点设备动作（ad_hoc_device_action）", mutates: true, role: "any" },
  { id: "workflow.task.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks", summary: "运行分页列表（status/workflow_uuid 过滤）", mutates: false, role: "any" },
  { id: "workflow.task.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}", summary: "运行详情", mutates: false, role: "any" },
  { id: "workflow.task.jobs", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/jobs", summary: "运行的全部 attempt（节点作业）平铺列表", mutates: false, role: "any" },
  { id: "workflow.task.node-runs", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/node-runs", summary: "运行的节点运行视图：每节点一条，当前 attempt 结果 + attempts 历史", mutates: false, role: "any" },
  { id: "workflow.node-run.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-runs/{run_uuid}", summary: "节点运行详情（含 attempts）", mutates: false, role: "any" },
  { id: "workflow.task.manual-confirmations", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/manual-confirmations", summary: "task 的人工确认待办与历史", mutates: false, role: "any" },
  { id: "workflow.manual-confirmation.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-manual-confirmations/{confirmation_uuid}", summary: "人工确认详情", mutates: false, role: "any" },
  { id: "workflow.manual-confirmation.decide", domain: "workflow", method: "POST", path: "/api/v1/workflow-manual-confirmations/{confirmation_uuid}/decision", summary: "提交人工确认决策", mutates: true, role: "any" },
  { id: "workflow.task.manual-confirmation.decide", domain: "workflow", method: "POST", path: "/api/v1/workflow-tasks/{task_uuid}/manual-confirmations/{confirmation_uuid}/decision", summary: "按任务校验并提交人工确认决策", mutates: true, role: "any" },
  { id: "workflow.task.interventions", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/interventions", summary: "task 的干预记录", mutates: false, role: "any" },
  { id: "workflow.job.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}", summary: "节点作业详情", mutates: false, role: "any" },
  { id: "workflow.job.results", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}/results", summary: "job 执行结果", mutates: false, role: "any" },
  { id: "workflow.job.feedback-history", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}/feedback-history", summary: "job 反馈归档", mutates: false, role: "any" },
  { id: "workflow.authoring.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/authoring", summary: "Authoring 状态机聚合（Draft/Candidate）", mutates: false, role: "any" },
  { id: "workflow.authoring.draft", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}/authoring/draft", summary: "保存 Draft 源码（hash+revision 前置校验）", mutates: true, role: "any" },
  { id: "workflow.authoring.apply", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/authoring/apply", summary: "Apply Candidate 到 Graph", mutates: true, role: "any" },
  { id: "workflow.events", domain: "workflow", method: "SSE", path: "/api/v1/events", summary: "frontend_event 失效通知流（Last-Event-ID 续传）", mutates: false, role: "any" },

  // ── registry：Registry Authority（默认本机调度 Host 与 --role backend 均挂载；接入远端调度权威的受控 Edge 返回 404） ──
  { id: "registry.entries.list", domain: "registry", method: "GET", path: "/api/v1/registry/entries", summary: "注册表条目状态列表（status 过滤 active/pending/removed/unusable）", mutates: false, role: "any" },
  { id: "registry.entries.get", domain: "registry", method: "GET", path: "/api/v1/registry/entries/{name}", summary: "条目详情（含生效/挂起 payload 与冲突明细）", mutates: false, role: "any" },
  { id: "registry.pending-impacts.list", domain: "registry", method: "GET", path: "/api/v1/registry/pending-impacts", summary: "挂起条目影响面：冲突 action 反查受影响 workflow 节点", mutates: false, role: "any" },
  { id: "registry.entry-versions.list", domain: "registry", method: "GET", path: "/api/v1/registry/entries/{name}/versions", summary: "条目版本历史（新在前）", mutates: false, role: "any" },
  { id: "registry.entry-versions.get", domain: "registry", method: "GET", path: "/api/v1/registry/entries/{name}/versions/{version}", summary: "条目单版本全文", mutates: false, role: "any" },
  { id: "registry.entries.apply", domain: "registry", method: "POST", path: "/api/v1/registry/entries/{name}/apply", summary: "升级：挂起版本切换为生效版本", mutates: true, role: "any" },
  { id: "registry.entries.dismiss", domain: "registry", method: "POST", path: "/api/v1/registry/entries/{name}/dismiss", summary: "忽略挂起版本（生效版本不动，历史保留）", mutates: true, role: "any" },
  { id: "registry.entries.restore", domain: "registry", method: "POST", path: "/api/v1/registry/entries/{name}/restore/{version}", summary: "历史版本还原为新的生效版本", mutates: true, role: "any" },
  { id: "registry.reports.list", domain: "registry", method: "GET", path: "/api/v1/registry/reports", summary: "Edge 上报批次统计", mutates: false, role: "any" },

  // ── materials-v1：物料权威 ──
  { id: "materials-v1.templates.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/templates", summary: "资源模板列表（含 registry 全量定义）", mutates: false, role: "any" },
  { id: "materials-v1.templates.get", domain: "materials-v1", method: "GET", path: "/api/v1/materials/templates/{template_uuid}", summary: "资源模板详情", mutates: false, role: "any" },
  { id: "materials-v1.templates.create", domain: "materials-v1", method: "POST", path: "/api/v1/materials/templates", summary: "新建模板（权威分配 uuid）", mutates: true, role: "any" },
  { id: "materials-v1.templates.put", domain: "materials-v1", method: "PUT", path: "/api/v1/materials/templates/{template_uuid}", summary: "更新模板", mutates: true, role: "any" },
  { id: "materials-v1.templates.delete", domain: "materials-v1", method: "DELETE", path: "/api/v1/materials/templates/{template_uuid}", summary: "删除未被引用的模板", mutates: true, role: "any" },
  { id: "materials-v1.registry-classes.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/registry-classes", summary: "registry 可实例化资源类目录（出库选择器）", mutates: false, role: "any" },
  { id: "materials-v1.instances.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/instances", summary: "物料聚合列表（roots_only / name 精确搜索）", mutates: false, role: "any" },
  { id: "materials-v1.instances.by-resource-id", domain: "materials-v1", method: "GET", path: "/api/v1/materials/instances/by-resource-id/{resource_id}", summary: "按 resource_id 读取物料聚合", mutates: false, role: "any" },
  { id: "materials-v1.instances.get", domain: "materials-v1", method: "GET", path: "/api/v1/materials/instances/{material_uuid}", summary: "物料聚合详情", mutates: false, role: "any" },
  { id: "materials-v1.instances.tree", domain: "materials-v1", method: "GET", path: "/api/v1/materials/instances/{material_uuid}/tree", summary: "物料树一致性快照", mutates: false, role: "any" },
  { id: "materials-v1.instances.instantiate", domain: "materials-v1", method: "POST", path: "/api/v1/materials/instantiate", summary: "出库：按 registry 资源类实例化并权威登记", mutates: true, role: "any" },
  { id: "materials-v1.trees.create", domain: "materials-v1", method: "POST", path: "/api/v1/materials/trees", summary: "提交完整创建树", mutates: true, role: "any" },
  { id: "materials-v1.instances.patch", domain: "materials-v1", method: "PATCH", path: "/api/v1/materials/instances/{material_uuid}", summary: "修改标识字段（名称/条码/生命周期…）", mutates: true, role: "any" },
  { id: "materials-v1.instances.data", domain: "materials-v1", method: "PUT", path: "/api/v1/materials/instances/{material_uuid}/data", summary: "写入内容物与业务数据", mutates: true, role: "any" },
  { id: "materials-v1.instances.position", domain: "materials-v1", method: "PUT", path: "/api/v1/materials/instances/{material_uuid}/position", summary: "写入位置/尺寸", mutates: true, role: "any" },
  { id: "materials-v1.instances.delete", domain: "materials-v1", method: "DELETE", path: "/api/v1/materials/instances/{material_uuid}", summary: "删除物料（可递归）并释放位点", mutates: true, role: "any" },
  { id: "materials-v1.move", domain: "materials-v1", method: "POST", path: "/api/v1/materials/move", summary: "权威内换位点/换父物料", mutates: true, role: "any" },
  { id: "materials-v1.transfer", domain: "materials-v1", method: "POST", path: "/api/v1/materials/transfer", summary: "跨设备转运并同步两端设备", mutates: true, role: "any" },
  { id: "materials-v1.notify-device", domain: "materials-v1", method: "POST", path: "/api/v1/materials/notify-device", summary: "把权威变更分发到目标设备", mutates: true, role: "host" },
  { id: "materials-v1.links.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/links", summary: "拓扑边查询", mutates: false, role: "any" },
  { id: "materials-v1.links.upsert", domain: "materials-v1", method: "POST", path: "/api/v1/materials/links", summary: "拓扑边 upsert（幂等）", mutates: true, role: "any" },
  { id: "materials-v1.links.delete", domain: "materials-v1", method: "DELETE", path: "/api/v1/materials/links/{link_uuid}", summary: "删除拓扑边", mutates: true, role: "any" },
  { id: "materials-v1.lots.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/lots", summary: "库存批次列表", mutates: false, role: "any" },
  { id: "materials-v1.lots.get", domain: "materials-v1", method: "GET", path: "/api/v1/materials/lots/{lot_uuid}", summary: "库存批次详情", mutates: false, role: "any" },
  { id: "materials-v1.lots.inbound", domain: "materials-v1", method: "POST", path: "/api/v1/materials/lots/inbound", summary: "批次入库或补充", mutates: true, role: "any" },
  { id: "materials-v1.reservations.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/reservations", summary: "库存预留列表", mutates: false, role: "any" },
  { id: "materials-v1.reservations.get", domain: "materials-v1", method: "GET", path: "/api/v1/materials/reservations/{reservation_uuid}", summary: "库存预留详情", mutates: false, role: "any" },
  { id: "materials-v1.reservations.by-job", domain: "materials-v1", method: "GET", path: "/api/v1/materials/reservations/by-job/{job_uuid}", summary: "按 Job 读取库存预留", mutates: false, role: "any" },
  { id: "materials-v1.changes.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/changes", summary: "物料 append-only 变更账本", mutates: false, role: "any" },
  { id: "materials-v1.events", domain: "materials-v1", method: "SSE", path: "/api/v1/materials/events", summary: "materials.changed 失效通知流（Last-Event-ID 续传）", mutates: false, role: "any" },

  // ── graphs-v1：设备图 ──
  { id: "graphs-v1.graphs.list", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs", summary: "图快照分页列表", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.get", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs/{identity}", summary: "按 uuid 或 name 读取图", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.payload", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs/{identity}/payload", summary: "图快照 node-link 载荷", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.live", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs/live/payload", summary: "当前真实拓扑（material + material_link 实时序列化）", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.upsert", domain: "graphs-v1", method: "POST", path: "/api/v1/graphs", summary: "上传/更新图快照", mutates: true, role: "any" },
  { id: "graphs-v1.graphs.delete", domain: "graphs-v1", method: "DELETE", path: "/api/v1/graphs/{identity}", summary: "删除图快照", mutates: true, role: "any" },

  // ── telemetry-v1 ──
  { id: "telemetry-v1.events.list", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/events", summary: "遥测追加事件查询", mutates: false, role: "any" },
  { id: "telemetry-v1.events.get", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/events/{event_uuid}", summary: "遥测事件详情", mutates: false, role: "any" },
  { id: "telemetry-v1.sources.cursor", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/sources/{endpoint_uuid}/cursor", summary: "endpoint 遥测来源游标", mutates: false, role: "any" },
  { id: "telemetry-v1.states.list", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/states", summary: "设备最新状态快照列表", mutates: false, role: "any" },
  { id: "telemetry-v1.states.get", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/states/{endpoint_uuid}/{device_uuid}", summary: "设备最新状态快照", mutates: false, role: "any" },

  // ── history-v1 ──
  { id: "history-v1.payloads.get", domain: "history-v1", method: "GET", path: "/api/v1/history/payloads/{payload_uuid}", summary: "不可变 payload 元数据/正文", mutates: false, role: "any" },
  { id: "history-v1.events.list", domain: "history-v1", method: "GET", path: "/api/v1/history/events", summary: "统一 append-only 历史流", mutates: false, role: "any" },
  { id: "history-v1.events.get", domain: "history-v1", method: "GET", path: "/api/v1/history/events/{event_uuid}", summary: "统一历史事件详情", mutates: false, role: "any" },
  { id: "history-v1.events.replacement-chain", domain: "history-v1", method: "GET", path: "/api/v1/history/events/{event_uuid}/replacement-chain", summary: "结果替换审计链", mutates: false, role: "any" },

  // ── decisions：执行端人工决策（仅带执行面的 host） ──
  { id: "decisions.status-incidents.list", domain: "decisions", method: "GET", path: "/api/v1/status-incidents", summary: "状态联锁 incident 与调度 hold 快照", mutates: false, role: "host" },
  { id: "decisions.status-incidents.resolve", domain: "decisions", method: "POST", path: "/api/v1/status-incidents/{incident_id}", summary: "提交状态联锁决策（仅限 Host 返回的 options）", mutates: true, role: "host" },
  { id: "decisions.error-decisions.list", domain: "decisions", method: "GET", path: "/api/v1/error-decisions", summary: "待处理动作异常", mutates: false, role: "host" },
  { id: "decisions.error-decisions.resolve", domain: "decisions", method: "POST", path: "/api/v1/error-decisions/{decision_id}", summary: "处理动作异常（重试/跳过/中止/人工替换结果）", mutates: true, role: "host" },

  // ── driver-packages：驱动包台账与安装（仅带执行面的 host；生效需 POST /restart） ──
  { id: "driver-packages.inventory", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages", summary: "驱动包台账 + 本次启动扫描目录 + 是否需重启", mutates: false, role: "host" },
  { id: "driver-packages.catalog", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/catalog", summary: "官方 / 社区驱动包目录（远程索引 + 本地补充），供一键安装", mutates: false, role: "host" },
  { id: "driver-packages.install", domain: "driver-packages", method: "POST", path: "/api/v1/driver-packages/install", summary: "pip 安装驱动包（pip 规格 / git URL / 本地目录），返回后台 operation", mutates: true, role: "host" },
  { id: "driver-packages.operations.list", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/operations", summary: "最近的安装 / 卸载操作", mutates: false, role: "host" },
  { id: "driver-packages.operations.get", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/operations/{operation_id}", summary: "轮询单个操作的状态与 pip 日志", mutates: false, role: "host" },
  { id: "driver-packages.set-enabled", domain: "driver-packages", method: "PUT", path: "/api/v1/driver-packages/{name}/enabled", summary: "启用 / 停用驱动包（下次启动生效）", mutates: true, role: "host" },
  { id: "driver-packages.uninstall", domain: "driver-packages", method: "DELETE", path: "/api/v1/driver-packages/{name}", summary: "pip 卸载并移出台账，返回后台 operation", mutates: true, role: "host" },
  { id: "driver-packages.graphs.list", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/{name}/graphs", summary: "驱动包随包设备图（data-files share/<包>/graph 或源码 graph/）", mutates: false, role: "host" },
  { id: "driver-packages.graphs.get", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/{name}/graphs/{graph_name}", summary: "随包设备图的 node-link 载荷", mutates: false, role: "host" },
  { id: "driver-packages.graphs.launch", domain: "driver-packages", method: "POST", path: "/api/v1/driver-packages/{name}/graphs/{graph_name}/launch", summary: "把随包图作为受管设备进程拉起（同名进程存在则更新并重启）", mutates: true, role: "host" },

  // ── device-processes：受管设备进程（本机 Slave 子进程；仅 host） ──
  { id: "device-processes.list", domain: "device-processes", method: "GET", path: "/api/v1/device-processes", summary: "全部受管进程（规格 + 运行态）与子进程应连的 HostLink 地址", mutates: false, role: "host" },
  { id: "device-processes.device-classes", domain: "device-processes", method: "GET", path: "/api/v1/device-processes/device-classes", summary: "可配置的设备类（注册表已加载 + 驱动包扫描到）", mutates: false, role: "host" },
  { id: "device-processes.create", domain: "device-processes", method: "POST", path: "/api/v1/device-processes", summary: "新建受管进程：设备节点 + 驱动包 + 重启策略", mutates: true, role: "host" },
  { id: "device-processes.get", domain: "device-processes", method: "GET", path: "/api/v1/device-processes/{process_id}", summary: "单个受管进程", mutates: false, role: "host" },
  { id: "device-processes.update", domain: "device-processes", method: "PUT", path: "/api/v1/device-processes/{process_id}", summary: "修改规格（运行中需重启生效）", mutates: true, role: "host" },
  { id: "device-processes.delete", domain: "device-processes", method: "DELETE", path: "/api/v1/device-processes/{process_id}", summary: "停止并删除受管进程", mutates: true, role: "host" },
  { id: "device-processes.start", domain: "device-processes", method: "POST", path: "/api/v1/device-processes/{process_id}/start", summary: "拉起子进程（已在运行 409）", mutates: true, role: "host" },
  { id: "device-processes.stop", domain: "device-processes", method: "POST", path: "/api/v1/device-processes/{process_id}/stop", summary: "结束子进程（不触发看护重启）", mutates: true, role: "host" },
  { id: "device-processes.restart", domain: "device-processes", method: "POST", path: "/api/v1/device-processes/{process_id}/restart", summary: "停止后重新拉起", mutates: true, role: "host" },
  { id: "device-processes.logs", domain: "device-processes", method: "GET", path: "/api/v1/device-processes/{process_id}/logs", summary: "子进程尾部日志（tail 行）", mutates: false, role: "host" },

  // ── lab-v1：实验室布局（区域 / 围墙像素格；runtime.db，一个 Host 一份） ──
  { id: "lab-v1.layout.get", domain: "lab-v1", method: "GET", path: "/api/v1/lab/layout", summary: "实验室布局文档（从未保存时 revision 0）", mutates: false, role: "any" },
  { id: "lab-v1.layout.put", domain: "lab-v1", method: "PUT", path: "/api/v1/lab/layout", summary: "整份替换布局（revision 乐观锁，409 = 过期）", mutates: true, role: "any" },
  { id: "lab-v1.layout.reset", domain: "lab-v1", method: "DELETE", path: "/api/v1/lab/layout", summary: "重置布局为未保存状态", mutates: true, role: "any" },

  // ── debug：四库只读浏览 ──
  { id: "debug.databases.list", domain: "debug", method: "GET", path: "/api/v1/debug/databases", summary: "四库文件状态与每张表行数", mutates: false, role: "any" },
  { id: "debug.databases.table", domain: "debug", method: "GET", path: "/api/v1/debug/databases/{database}/tables/{table}", summary: "单表分页浏览（列定义 + 行数据）", mutates: false, role: "any" },
] as const satisfies readonly OperationContract[];

export type OperationId = (typeof OPERATIONS)[number]["id"];

export function findOperation(id: OperationId): OperationContract {
  const found = OPERATIONS.find((operation) => operation.id === id);
  if (!found) throw new Error(`unknown operation ${id}`);
  return found;
}

/** 某个域的全部操作。 */
export function operationsOf(domain: OperationContract["domain"]): readonly OperationContract[] {
  return OPERATIONS.filter((operation) => operation.domain === domain);
}
