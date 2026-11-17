/**
 * 机器可读操作目录：浏览器会调用的每一条微后端路由（Uni-Lab-OS V1.0 合同）。
 *
 * 与 Uni-Lab-OS 契约全集导出（`python -m unilabos.server.openapi_export`，快照在
 * `openapi/unilabos-openapi.json`）逐条对账：scripts/validate-contract.mjs 要求导出里的每条操作
 * 要么在本目录，要么登记为 Backend ↔ Edge 控制面（浏览器不得调用），要么登记为「浏览器暂未采用」
 * 的 V1 控制台面（附理由）；协议测试把各域客户端的实际请求与本目录双向比对，保证
 * 「客户端方法 ↔ 后端路由」一一对应。
 *
 * - `role` 标注挂载角色：`host` 只在设备执行进程可用，`backend` 只在 `--role backend` 调度权威进程
 *   可用，`any` 两者皆有（默认拓扑里 Host 专有路由经调度权威代理，Host 不在线时返回 5001）。
 * - 全部是 V1 信封 `{code, data}` / `{code, error}`（含探针、库存命令与 `/v1/*` 进程管理；只有 SSE 不包信封）。
 */
import type { OperationContract } from "./common.js";

export const OPERATIONS = [
  // ── system：诊断路由（server/api/runtime/diagnostics.py） ──
  { id: "system.reset.preview", domain: "system", method: "GET", path: "/api/v1/reset", summary: "全量重置范围及确认令牌", mutates: false, role: "any" },
  { id: "system.reset.request", domain: "system", method: "POST", path: "/api/v1/reset", summary: "停机归档全部业务数据", mutates: true, role: "any" },
  { id: "system.health", domain: "system", method: "GET", path: "/api/v1/health", summary: "存活探针：scheduler ready/disabled、scheduler_mode local/remote、execution ready/restarting/disabled", mutates: false, role: "any" },
  { id: "system.readiness", domain: "system", method: "GET", path: "/api/v1/readiness", summary: "就绪探针：200 就绪 / 503 + 5001 未就绪，摘要在 data / error.details（V1 status/capabilities/phase/workflowRuntime + dev scheduler/execution/reasons）", mutates: false, role: "any" },
  { id: "system.ping", domain: "system", method: "GET", path: "/api/v1/ping", summary: "HTTP ping-pong：回显客户端时间戳并附服务端时钟（链路时延 / 时钟偏差）", mutates: false, role: "any" },
  { id: "system.hostlink.peers", domain: "system", method: "GET", path: "/api/v1/hostlink/peers", summary: "HostLink 组网：host/slave 角色、在线 peer 与设备档案", mutates: false, role: "any" },
  { id: "system.scheduler.resources", domain: "system", method: "GET", path: "/api/v1/scheduler/resources", summary: "本机调度资源快照（5001 = 调度权威在远端）", mutates: false, role: "any" },
  { id: "system.restart.status", domain: "system", method: "GET", path: "/api/v1/restart", summary: "安静点重启等待状态", mutates: false, role: "any" },
  { id: "system.restart.request", domain: "system", method: "POST", path: "/api/v1/restart", summary: "登记安静点重启（暂停派发，active job 清空后重启）", mutates: true, role: "any" },
  { id: "system.restart.cancel", domain: "system", method: "DELETE", path: "/api/v1/restart", summary: "取消等待中的重启并恢复派发", mutates: true, role: "any" },
  { id: "system.log-sources.list", domain: "system", method: "GET", path: "/api/v1/hostlink/log-sources", summary: "Host 与各 Slave 日志来源目录", mutates: false, role: "host" },
  { id: "system.logs.read", domain: "system", method: "GET", path: "/api/v1/hostlink/logs", summary: "有界增量读取进程日志（每个读取者独立游标）", mutates: false, role: "host" },

  // ── runtime-v1：runtime.db 只读投影（Host） ──
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
  { id: "workflow.workflow.from-template", domain: "workflow", method: "POST", path: "/api/v1/workflows/from-template", summary: "注册表工作流模板按角色绑定实例化为工作流（脚本入口；同模板同绑定幂等）", mutates: true, role: "any" },
  { id: "workflow.workflow.list", domain: "workflow", method: "GET", path: "/api/v1/workflows", summary: "Workflow 定义分页列表（V1 过滤 keyword/name/workflow_type/status/operation_category_uuid）", mutates: false, role: "any" },
  { id: "workflow.workflow.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}", summary: "Workflow 定义详情", mutates: false, role: "any" },
  { id: "workflow.workflow.update", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}", summary: "更新 Workflow 定义元数据", mutates: true, role: "any" },
  { id: "workflow.workflow.delete", domain: "workflow", method: "DELETE", path: "/api/v1/workflows/{workflow_uuid}", summary: "软删除 Workflow 并级联节点/边", mutates: true, role: "any" },
  { id: "workflow.graph.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/graph", summary: "整图 hydration（nodes/edges/node_templates/handle_templates，当前层）", mutates: false, role: "any" },
  { id: "workflow.graph.save", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}/graph", summary: "revision 乐观锁全量协调 Graph", mutates: true, role: "any" },
  { id: "workflow.io.declare", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}/io", summary: "声明入口参数合同 / 输出 / 绑定（服务端保留 meta_data.unilab；revision +1，返回整图）", mutates: true, role: "any" },
  { id: "workflow.publication.create", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/publications", summary: "发布当前修订为不可变快照（V1 发布合同；同修订幂等）", mutates: true, role: "any" },
  { id: "workflow.publication.list", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/publications", summary: "该工作流全部发布（revision 倒序，不含快照正文）", mutates: false, role: "any" },
  { id: "workflow.publication.latest", domain: "workflow", method: "GET", path: "/api/v1/workflow-publications", summary: "每个工作流的最新发布（插入子工作流的调色板）", mutates: false, role: "any" },
  { id: "workflow.composite-invocation.create", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/composite-invocations", summary: "按发布合同（contract_uuid）插入已发布实验操作并内联展开，返回父图", mutates: true, role: "any" },
  { id: "workflow.task.create", domain: "workflow", method: "POST", path: "/api/v1/workflow-tasks", summary: "提交运行：整图（workflow）或单点设备动作（ad_hoc_device_action）", mutates: true, role: "any" },
  { id: "workflow.task.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks", summary: "运行分页列表（status/workflow_uuid/execution_kind 过滤）", mutates: false, role: "any" },
  { id: "workflow.task.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}", summary: "运行详情", mutates: false, role: "any" },
  { id: "workflow.task.command", domain: "workflow", method: "POST", path: "/api/v1/workflow-tasks/{task_uuid}/commands", summary: "V1 任务控制命令（pause / switch_to_step / step / resume / cancel / unlock_resources），返回命令投影，业务拒绝 status=rejected", mutates: true, role: "any" },
  { id: "workflow.task.input-edit", domain: "workflow", method: "PATCH", path: "/api/v1/workflow-tasks/{task_uuid}/input", summary: "暂停时修改未被消费的入口参数（冻结参数 / 未暂停 / revision 不符 3003）", mutates: true, role: "any" },
  { id: "workflow.task.jobs", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/jobs", summary: "运行的全部 attempt（节点作业）平铺列表", mutates: false, role: "any" },
  { id: "workflow.task.node-runs", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/node-runs", summary: "运行的节点运行视图：每节点一条，当前 attempt 结果 + attempts 历史", mutates: false, role: "any" },
  { id: "workflow.node-run.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-runs/{run_uuid}", summary: "节点运行详情（含 attempts）", mutates: false, role: "any" },
  { id: "workflow.task.manual-confirmations", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/manual-confirmations", summary: "task 的人工确认待办与历史", mutates: false, role: "any" },
  { id: "workflow.manual-confirmation.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-manual-confirmations/{confirmation_uuid}", summary: "人工确认详情", mutates: false, role: "any" },
  { id: "workflow.job.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}", summary: "节点作业详情", mutates: false, role: "any" },
  { id: "workflow.job.results", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}/results", summary: "job 执行结果", mutates: false, role: "any" },
  { id: "workflow.authoring.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/authoring", summary: "Authoring 状态机聚合（Draft/Candidate）", mutates: false, role: "any" },
  { id: "workflow.authoring.draft", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}/authoring/draft", summary: "保存 Draft 源码（hash+revision 前置校验）", mutates: true, role: "any" },
  { id: "workflow.authoring.apply", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/authoring/apply", summary: "Apply Candidate 到 Graph（V1 {candidate_hash}）", mutates: true, role: "any" },
  { id: "workflow.events", domain: "workflow", method: "SSE", path: "/api/v1/events", summary: "工作流持久通知（V1 事件名 workflow.runtime.changed / workflow.authoring.changed / station.error_handling.changed，Last-Event-ID）及 runtime.logs.changed 瞬时日志通知（无 id）", mutates: false, role: "any" },
  { id: "workflow.operation-category.list", domain: "workflow", method: "GET", path: "/api/v1/experiment-operation-categories", summary: "实验操作类别列表", mutates: false, role: "any" },
  { id: "workflow.operation-category.create", domain: "workflow", method: "POST", path: "/api/v1/experiment-operation-categories", summary: "新建实验操作类别（名称唯一）", mutates: true, role: "any" },
  { id: "workflow.operation-category.get", domain: "workflow", method: "GET", path: "/api/v1/experiment-operation-categories/{category_uuid}", summary: "实验操作类别详情", mutates: false, role: "any" },
  { id: "workflow.operation-category.update", domain: "workflow", method: "PUT", path: "/api/v1/experiment-operation-categories/{category_uuid}", summary: "修改类别名称 / 排序", mutates: true, role: "any" },
  { id: "workflow.operation-category.delete", domain: "workflow", method: "DELETE", path: "/api/v1/experiment-operation-categories/{category_uuid}", summary: "删除类别（仍被引用 3003）", mutates: true, role: "any" },
  { id: "workflow.workflow.import", domain: "workflow", method: "POST", path: "/api/v1/workflows/import", summary: "旧版 JSON 导入（节点 / 连线身份重建）", mutates: true, role: "any" },
  { id: "workflow.workflow.import-python", domain: "workflow", method: "POST", path: "/api/v1/local/workflows/import-python", summary: "原始 .py 源码导入（只解析不执行，X-Workflow-Filename）", mutates: true, role: "any" },
  { id: "workflow.workflow.duplicate", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/duplicate", summary: "复制工作流", mutates: true, role: "any" },
  { id: "workflow.workflow.referenced-by", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/referenced-by", summary: "引用该工作流的父工作流", mutates: false, role: "any" },
  { id: "workflow.template-catalog", domain: "workflow", method: "GET", path: "/api/v1/workflows/template-catalog", summary: "注册表 @workflow 模板目录（角色与可绑定设备）", mutates: false, role: "any" },
  { id: "workflow.template-instance.create", domain: "workflow", method: "POST", path: "/api/v1/workflows/template-instances", summary: "模板实例化为工作流", mutates: true, role: "any" },
  { id: "workflow.nodes.list", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/nodes", summary: "当前层节点列表", mutates: false, role: "any" },
  { id: "workflow.nodes.create", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/nodes", summary: "增量新增节点（返回整图）", mutates: true, role: "any" },
  { id: "workflow.edges.create", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/edges", summary: "增量新增连线（返回整图）", mutates: true, role: "any" },
  { id: "workflow.graph.batch-delete", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/batch-delete", summary: "批量删除节点 / 连线", mutates: true, role: "any" },
  { id: "workflow.node.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-nodes/{node_uuid}", summary: "节点详情", mutates: false, role: "any" },
  { id: "workflow.node.patch", domain: "workflow", method: "PATCH", path: "/api/v1/workflow-nodes/{node_uuid}", summary: "节点局部修改（只应用显式字段）", mutates: true, role: "any" },
  { id: "workflow.node.delete", domain: "workflow", method: "DELETE", path: "/api/v1/workflow-nodes/{node_uuid}", summary: "删除节点（仍有子节点 3003）", mutates: true, role: "any" },
  { id: "workflow.node.duplicate", domain: "workflow", method: "POST", path: "/api/v1/workflow-nodes/{node_uuid}/duplicate", summary: "复制节点", mutates: true, role: "any" },
  { id: "workflow.edge.delete", domain: "workflow", method: "DELETE", path: "/api/v1/workflow-edges/{edge_uuid}", summary: "删除连线", mutates: true, role: "any" },
  { id: "workflow.node-templates.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-templates", summary: "节点模板目录（分页）", mutates: false, role: "any" },
  { id: "workflow.node-templates.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-templates/{template_uuid}", summary: "节点模板详情", mutates: false, role: "any" },
  { id: "workflow.resource-scopes.put", domain: "workflow", method: "PUT", path: "/api/v1/workflows/{workflow_uuid}/resource-scopes", summary: "资源作用域声明（整份替换）", mutates: true, role: "any" },
  { id: "workflow.run-preflight.get", domain: "workflow", method: "GET", path: "/api/v1/workflows/{workflow_uuid}/run-preflight", summary: "候选运行检查（不建任务、不占资源）", mutates: false, role: "any" },
  { id: "workflow.run-preflight.submit", domain: "workflow", method: "POST", path: "/api/v1/workflows/{workflow_uuid}/run-preflight", summary: "带入口参数 / 库存绑定的运行前检查", mutates: false, role: "any" },
  { id: "workflow.authoring.compile", domain: "workflow", method: "POST", path: "/api/v1/authoring/compile", summary: "源码编译为图变更集（不落库）", mutates: false, role: "any" },
  { id: "workflow.authoring.generate-python", domain: "workflow", method: "POST", path: "/api/v1/authoring/generate-python", summary: "图生成 @workflow 源码（不落库）", mutates: false, role: "any" },
  { id: "workflow.authoring.validate", domain: "workflow", method: "POST", path: "/api/v1/authoring/validate", summary: "源码与图不动点校验（不落库）", mutates: false, role: "any" },
  { id: "workflow.task-presentations.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-task-presentations", summary: "紧凑任务 + 内嵌作业（view=matrix）", mutates: false, role: "any" },
  { id: "workflow.task.delete-eligibility", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/delete-eligibility", summary: "任务能否删除及阻塞项", mutates: false, role: "any" },
  { id: "workflow.task.delete", domain: "workflow", method: "DELETE", path: "/api/v1/workflow-tasks/{task_uuid}", summary: "软删除任务（阻塞项 3003）", mutates: true, role: "any" },
  { id: "workflow.task.events", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/events", summary: "任务事件（after_sequence 游标）", mutates: false, role: "any" },
  { id: "workflow.task.step-state", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/step-state", summary: "逐步执行候选节点", mutates: false, role: "any" },
  { id: "workflow.task.job-param", domain: "workflow", method: "PATCH", path: "/api/v1/workflow-tasks/{task_uuid}/jobs/{job_uuid}/param", summary: "暂停时合并待执行 attempt 的参数", mutates: true, role: "any" },
  { id: "workflow.task.execution-locks", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/execution-locks", summary: "任务持有的执行锁（Claim / Fence）", mutates: false, role: "any" },
  { id: "workflow.task.execution-lock.force-release", domain: "workflow", method: "POST", path: "/api/v1/workflow-tasks/{task_uuid}/execution-locks/{lease_uuid}/force-release", summary: "确认现场安全后强制释放执行锁", mutates: true, role: "any" },
  { id: "workflow.task.material-events", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/material-events", summary: "任务作业引起的物料账本变化", mutates: false, role: "any" },
  { id: "workflow.task.inventory-consumptions", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/inventory-consumptions", summary: "任务的数量型库存消费事实", mutates: false, role: "any" },
  { id: "workflow.job.inventory-consumptions", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}/inventory-consumptions", summary: "作业的数量型库存消费事实", mutates: false, role: "any" },
  { id: "workflow.reagent.inventory-consumptions", domain: "workflow", method: "GET", path: "/api/v1/reagents/{reagent_uuid}/inventory-consumptions", summary: "试剂的工作流消费谱系", mutates: false, role: "any" },
  { id: "workflow.interventions.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-interventions", summary: "全局干预列表（open / selected / superseded）", mutates: false, role: "any" },
  { id: "workflow.intervention.get", domain: "workflow", method: "GET", path: "/api/v1/workflow-interventions/{intervention_uuid}", summary: "干预详情", mutates: false, role: "any" },
  { id: "workflow.intervention.decide", domain: "workflow", method: "POST", path: "/api/v1/workflow-interventions/{intervention_uuid}/decisions", summary: "按修订选择干预方案（Idempotency-Key）", mutates: true, role: "any" },
  { id: "workflow.task.human-interactions", domain: "workflow", method: "GET", path: "/api/v1/workflow-tasks/{task_uuid}/human-interactions", summary: "任务的结构化人工交互请求", mutates: false, role: "any" },
  { id: "workflow.human-interaction.reply", domain: "workflow", method: "POST", path: "/api/v1/workflow-human-interactions/{interaction_uuid}/reply", summary: "回复人工交互（同答案重放幂等）", mutates: true, role: "any" },
  { id: "workflow.job.feedback", domain: "workflow", method: "GET", path: "/api/v1/workflow-node-jobs/{job_uuid}/feedback", summary: "job 反馈归档（page / page_size）", mutates: false, role: "any" },
  { id: "workflow.job.manual-confirmation", domain: "workflow", method: "POST", path: "/api/v1/workflow-node-jobs/{job_uuid}/manual-confirmation", summary: "按作业提交人工确认（approve / reject）", mutates: true, role: "any" },
  { id: "workflow.job.reconcile-quantity", domain: "workflow", method: "POST", path: "/api/v1/workflow-node-jobs/{job_uuid}/reconcile-quantity", summary: "核对作业的实际用量", mutates: true, role: "any" },
  { id: "workflow.job.resolve-uncertain", domain: "workflow", method: "POST", path: "/api/v1/workflow-node-jobs/{job_uuid}/resolve-uncertain", summary: "结果未知作业处置（只接受 canceled）", mutates: true, role: "any" },
  { id: "workflow.job.settle-material-transfer", domain: "workflow", method: "POST", path: "/api/v1/workflow-node-jobs/{job_uuid}/settle-material-transfer", summary: "失败转运的实际位置结算", mutates: true, role: "any" },
  { id: "workflow.device-action-run.create", domain: "workflow", method: "POST", path: "/api/v1/device-action-runs", summary: "V1 单点设备动作（物料 + 节点模板）", mutates: true, role: "any" },
  { id: "workflow.resource-intervals.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-resource-intervals", summary: "资源区间占用", mutates: false, role: "any" },
  { id: "workflow.resource-interval.release", domain: "workflow", method: "POST", path: "/api/v1/workflow-resource-intervals/{owner_uuid}/release", summary: "释放资源区间", mutates: true, role: "any" },
  { id: "workflow.resource-interval.lend", domain: "workflow", method: "POST", path: "/api/v1/workflow-resource-intervals/{owner_uuid}/lend", summary: "出借资源区间", mutates: true, role: "any" },
  { id: "workflow.resource-loans.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-resource-loans", summary: "资源借用记录", mutates: false, role: "any" },
  { id: "workflow.resource-loan.return", domain: "workflow", method: "POST", path: "/api/v1/workflow-resource-loans/{loan_uuid}/return", summary: "归还借用", mutates: true, role: "any" },
  { id: "workflow.device-tenancies.list", domain: "workflow", method: "GET", path: "/api/v1/workflow-device-tenancies", summary: "设备托管记录", mutates: false, role: "any" },
  { id: "workflow.device-tenancy.release", domain: "workflow", method: "POST", path: "/api/v1/workflow-device-tenancies/{tenancy_uuid}/release", summary: "释放设备托管", mutates: true, role: "any" },
  { id: "workflow.wait-graph", domain: "workflow", method: "GET", path: "/api/v1/workflow-runtime/wait-graph", summary: "资源等待图（环检测）", mutates: false, role: "any" },

  // ── run-history：V1 运行历史视图（调度权威） ──
  { id: "run-history.workflows.list", domain: "run-history", method: "GET", path: "/api/v1/history/workflows", summary: "工作流运行历史列表 + 统计", mutates: false, role: "any" },
  { id: "run-history.workflows.get", domain: "run-history", method: "GET", path: "/api/v1/history/workflows/{workflow_id}", summary: "单次运行详情（spec + jobs）", mutates: false, role: "any" },
  { id: "run-history.jobs.list", domain: "run-history", method: "GET", path: "/api/v1/history/jobs", summary: "作业执行历史", mutates: false, role: "any" },

  // ── scheduler：V1 调度观测与运维 ──
  { id: "scheduler.monitor.snapshot", domain: "scheduler", method: "GET", path: "/api/v1/monitor/snapshot", summary: "监控快照（设备忙闲 / 调度统计 / 近期事件）", mutates: false, role: "any" },
  { id: "scheduler.timeline", domain: "scheduler", method: "GET", path: "/api/v1/timeline", summary: "泳道图数据（执行中 + 窗口内已完结作业）", mutates: false, role: "any" },
  { id: "scheduler.time-plan", domain: "scheduler", method: "GET", path: "/api/v1/scheduler/time-plan", summary: "时间排程计划（无引擎时 enabled=false）", mutates: false, role: "any" },
  { id: "scheduler.reschedule", domain: "scheduler", method: "POST", path: "/api/v1/reschedule", summary: "手动重排等待派发的作业", mutates: true, role: "any" },
  { id: "scheduler.drain.status", domain: "scheduler", method: "GET", path: "/api/v1/scheduler/drain", summary: "排空闸门状态", mutates: false, role: "any" },
  { id: "scheduler.drain.start", domain: "scheduler", method: "POST", path: "/api/v1/scheduler/drain", summary: "排空：暂停新派发，等在途作业清空", mutates: true, role: "any" },
  { id: "scheduler.drain.resume", domain: "scheduler", method: "POST", path: "/api/v1/scheduler/drain/resume", summary: "解除排空", mutates: true, role: "any" },
  { id: "scheduler.inventory-recovery.get", domain: "scheduler", method: "GET", path: "/api/v1/scheduler/inventory-recovery", summary: "重启后待核对的库存占用", mutates: false, role: "any" },
  { id: "scheduler.inventory-recovery.reconcile", domain: "scheduler", method: "POST", path: "/api/v1/scheduler/inventory-recovery/reconcile", summary: "核对并收敛库存占用", mutates: true, role: "any" },
  { id: "scheduler.physical-recovery.get", domain: "scheduler", method: "GET", path: "/api/v1/scheduler/physical-recovery", summary: "待人工核实的物理结算", mutates: false, role: "any" },
  { id: "scheduler.physical-recovery.settle", domain: "scheduler", method: "POST", path: "/api/v1/scheduler/physical-recovery/{job_uuid}/settle", summary: "按实际变化结算物理动作", mutates: true, role: "any" },
  { id: "scheduler.physical-recovery.release", domain: "scheduler", method: "POST", path: "/api/v1/scheduler/physical-recovery/{job_uuid}/release", summary: "确认无物理变化后释放占用", mutates: true, role: "any" },

  // ── registry：Registry Authority（默认本机调度 Host 与 --role backend 均挂载；接入远端调度权威的受控 Edge 返回 404） ──
  { id: "registry.entries.list", domain: "registry", method: "GET", path: "/api/v1/registry/entries", summary: "注册表条目状态列表（status 过滤 active/pending/removed/unusable）", mutates: false, role: "any" },
  { id: "registry.entries.get", domain: "registry", method: "GET", path: "/api/v1/registry/entries/{name}", summary: "条目详情（含生效/挂起 payload 与冲突明细）", mutates: false, role: "any" },
  { id: "registry.pending-impacts.list", domain: "registry", method: "GET", path: "/api/v1/registry/pending-impacts", summary: "挂起条目影响面：冲突 action 反查受影响 workflow 节点", mutates: false, role: "any" },
  { id: "registry.entry-versions.list", domain: "registry", method: "GET", path: "/api/v1/registry/entries/{name}/versions", summary: "条目版本历史（新在前）", mutates: false, role: "any" },
  { id: "registry.entry-versions.get", domain: "registry", method: "GET", path: "/api/v1/registry/entries/{name}/versions/{version}", summary: "条目单版本全文", mutates: false, role: "any" },
  { id: "registry.entries.apply", domain: "registry", method: "POST", path: "/api/v1/registry/entries/{name}/apply", summary: "接受挂起的变化：挂起版本生效，待确认移除则软移除", mutates: true, role: "any" },
  { id: "registry.entries.dismiss", domain: "registry", method: "POST", path: "/api/v1/registry/entries/{name}/dismiss", summary: "忽略挂起的变化（生效版本不动，历史保留；Host 再报同一内容会再次挂起）", mutates: true, role: "any" },
  { id: "registry.pending.apply", domain: "registry", method: "POST", path: "/api/v1/registry/pending/apply", summary: "批量接受挂起的变化（names 为空即全部）", mutates: true, role: "any" },
  { id: "registry.pending.dismiss", domain: "registry", method: "POST", path: "/api/v1/registry/pending/dismiss", summary: "批量忽略挂起的变化（names 为空即全部）", mutates: true, role: "any" },
  { id: "registry.status.get", domain: "registry", method: "GET", path: "/api/v1/registry/status", summary: "目录状态：是否已收到 Host 上报、最近一次上报、挂起数、单机判定（规则 B）与跨机器 Slave", mutates: false, role: "any" },
  { id: "registry.slaves.list", domain: "registry", method: "GET", path: "/api/v1/registry/slaves", summary: "权威记着的跨机器 Slave（规则 B 因它们不成立）", mutates: false, role: "any" },
  { id: "registry.slaves.delete", domain: "registry", method: "DELETE", path: "/api/v1/registry/slaves/{machine_name}", summary: "删除一条跨机器 Slave 记录（再次接入会重新记下）", mutates: true, role: "any" },
  { id: "registry.entries.restore", domain: "registry", method: "POST", path: "/api/v1/registry/entries/{name}/restore/{version}", summary: "历史版本还原为新的生效版本", mutates: true, role: "any" },
  { id: "registry.reports.list", domain: "registry", method: "GET", path: "/api/v1/registry/reports", summary: "Edge 上报批次统计", mutates: false, role: "any" },
  { id: "registry.workflow-templates.list", domain: "registry", method: "GET", path: "/api/v1/registry/workflow-templates", summary: "生效的设备包 @workflow 工作流模板（角色占位，插入画布时绑定设备）", mutates: false, role: "any" },

  // ── inventory：V1 Edge 库存操作面；写入一律 POST /inventory/commands ──
  { id: "inventory.health", domain: "inventory", method: "GET", path: "/api/v1/inventory/health", summary: "库存面健康与账本序号", mutates: false, role: "any" },
  { id: "inventory.instances.list", domain: "inventory", method: "GET", path: "/api/v1/inventory/instances", summary: "物料聚合列表（limit 截断；all=true 全量）", mutates: false, role: "any" },
  { id: "inventory.instances.get", domain: "inventory", method: "GET", path: "/api/v1/inventory/instances/{edge_uuid}", summary: "物料聚合 + 关系 + 内容物", mutates: false, role: "any" },
  { id: "inventory.templates.list", domain: "inventory", method: "GET", path: "/api/v1/inventory/templates", summary: "资源模板目录（include_definition 按需）", mutates: false, role: "any" },
  { id: "inventory.templates.get", domain: "inventory", method: "GET", path: "/api/v1/inventory/templates/{template_id}", summary: "资源模板详情", mutates: false, role: "any" },
  { id: "inventory.lots.list", domain: "inventory", method: "GET", path: "/api/v1/inventory/lots", summary: "库存批次列表", mutates: false, role: "any" },
  { id: "inventory.lots.get", domain: "inventory", method: "GET", path: "/api/v1/inventory/lots/{lot_id}", summary: "库存批次详情", mutates: false, role: "any" },
  { id: "inventory.reservations.list", domain: "inventory", method: "GET", path: "/api/v1/inventory/reservations", summary: "批次预留 + 内容物预留 + 来源绑定", mutates: false, role: "any" },
  { id: "inventory.reservations.get", domain: "inventory", method: "GET", path: "/api/v1/inventory/reservations/{reservation_id}", summary: "预留详情（批次或内容物）", mutates: false, role: "any" },
  { id: "inventory.workflow-reservations", domain: "inventory", method: "GET", path: "/api/v1/inventory/workflows/{workflow_id}/reservations", summary: "按任务读取预留", mutates: false, role: "any" },
  { id: "inventory.relations", domain: "inventory", method: "GET", path: "/api/v1/inventory/relations", summary: "父子 / 库位关系 + 拓扑边", mutates: false, role: "any" },
  { id: "inventory.contents", domain: "inventory", method: "GET", path: "/api/v1/inventory/contents", summary: "容器内容物", mutates: false, role: "any" },
  { id: "inventory.snapshot", domain: "inventory", method: "GET", path: "/api/v1/inventory/snapshot", summary: "全量状态导出（带账本游标）", mutates: false, role: "any" },
  { id: "inventory.ledger", domain: "inventory", method: "GET", path: "/api/v1/inventory/ledger", summary: "物料 append-only 账本（after_id 游标）", mutates: false, role: "any" },
  { id: "inventory.outbox.backlog", domain: "inventory", method: "GET", path: "/api/v1/inventory/outbox/backlog", summary: "账本投递积压", mutates: false, role: "any" },
  { id: "inventory.outbox.events", domain: "inventory", method: "GET", path: "/api/v1/inventory/outbox/events", summary: "未确认投递的账本事件", mutates: false, role: "any" },
  { id: "inventory.sync-cursors", domain: "inventory", method: "GET", path: "/api/v1/inventory/sync/cursors", summary: "账本同步游标", mutates: false, role: "any" },
  { id: "inventory.commands.processed", domain: "inventory", method: "GET", path: "/api/v1/inventory/commands/processed", summary: "已处理命令（类型化命令 + materials.v1 变更）", mutates: false, role: "any" },
  { id: "inventory.commands.submit", domain: "inventory", method: "POST", path: "/api/v1/inventory/commands", summary: "库存写入唯一入口（materials.v1 变更信封或 V1 类型化命令；被拒是失败信封）", mutates: true, role: "any" },
  { id: "inventory.ingress.list", domain: "inventory", method: "GET", path: "/api/v1/inventory/ingress-reservations", summary: "工站入站库位预留列表", mutates: false, role: "any" },
  { id: "inventory.ingress.reserve", domain: "inventory", method: "POST", path: "/api/v1/inventory/ingress-reservations", summary: "预留入站库位（幂等）", mutates: true, role: "any" },
  { id: "inventory.ingress.get", domain: "inventory", method: "GET", path: "/api/v1/inventory/ingress-reservations/{reservation_uuid}", summary: "入站预留详情", mutates: false, role: "any" },
  { id: "inventory.ingress.in-transit", domain: "inventory", method: "POST", path: "/api/v1/inventory/ingress-reservations/{reservation_uuid}/in-transit", summary: "标记入站在途", mutates: true, role: "any" },
  { id: "inventory.ingress.receive", domain: "inventory", method: "POST", path: "/api/v1/inventory/ingress-reservations/{reservation_uuid}/receive", summary: "入站收货（移入预留库位）", mutates: true, role: "any" },
  { id: "inventory.ingress.cancel", domain: "inventory", method: "POST", path: "/api/v1/inventory/ingress-reservations/{reservation_uuid}/cancel", summary: "取消入站预留", mutates: true, role: "any" },

  // ── materials-v1：dev 独有物料路由（读写主体已迁到 inventory） ──
  { id: "materials-v1.registry-classes.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/registry-classes", summary: "registry 可实例化资源类目录（出库选择器）", mutates: false, role: "any" },
  { id: "materials-v1.instances.by-resource-id", domain: "materials-v1", method: "GET", path: "/api/v1/materials/instances/by-resource-id/{resource_id}", summary: "按 resource_id 读取物料聚合", mutates: false, role: "any" },
  { id: "materials-v1.instances.tree", domain: "materials-v1", method: "GET", path: "/api/v1/materials/instances/{material_uuid}/tree", summary: "物料树一致性快照", mutates: false, role: "any" },
  { id: "materials-v1.notify-device", domain: "materials-v1", method: "POST", path: "/api/v1/materials/notify-device", summary: "把权威变更分发到目标设备", mutates: true, role: "host" },
  { id: "materials-v1.links.upsert", domain: "materials-v1", method: "POST", path: "/api/v1/materials/links", summary: "拓扑边 upsert（幂等）", mutates: true, role: "any" },
  { id: "materials-v1.links.delete", domain: "materials-v1", method: "DELETE", path: "/api/v1/materials/links/{link_uuid}", summary: "删除拓扑边", mutates: true, role: "any" },
  { id: "materials-v1.reservations.by-job", domain: "materials-v1", method: "GET", path: "/api/v1/materials/reservations/by-job/{job_uuid}", summary: "按 Job 读取库存预留", mutates: false, role: "any" },
  { id: "materials-v1.events", domain: "materials-v1", method: "SSE", path: "/api/v1/materials/events", summary: "materials.changed 失效通知流（Last-Event-ID 续传；不在 V1 合同里，保持原名）", mutates: false, role: "any" },
  { id: "materials-v1.executions.list", domain: "materials-v1", method: "GET", path: "/api/v1/materials/executions", summary: "物理动作执行记录", mutates: false, role: "any" },
  { id: "materials-v1.executions.get", domain: "materials-v1", method: "GET", path: "/api/v1/materials/executions/{job_uuid}", summary: "单个作业的物理执行记录", mutates: false, role: "any" },
  { id: "materials-v1.inventory.preview", domain: "materials-v1", method: "POST", path: "/api/v1/materials/inventory/preview", summary: "库存预演（不落账）", mutates: false, role: "any" },

  // ── graphs-v1：设备图 ──
  { id: "graphs-v1.graphs.list", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs", summary: "图快照分页列表", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.get", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs/{identity}", summary: "按 uuid 或 name 读取图", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.payload", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs/{identity}/payload", summary: "图快照 node-link 载荷", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.live", domain: "graphs-v1", method: "GET", path: "/api/v1/graphs/live/payload", summary: "当前真实拓扑（material + material_link 实时序列化）", mutates: false, role: "any" },
  { id: "graphs-v1.graphs.upsert", domain: "graphs-v1", method: "POST", path: "/api/v1/graphs", summary: "上传/更新图快照", mutates: true, role: "any" },
  { id: "graphs-v1.graphs.delete", domain: "graphs-v1", method: "DELETE", path: "/api/v1/graphs/{identity}", summary: "删除图快照", mutates: true, role: "any" },

  // ── chemicals-v1：化学品定义（materials.db；CAS / InChIKey 可空唯一键，版本乐观锁） ──
  { id: "chemicals-v1.chemical.list", domain: "chemicals-v1", method: "GET", path: "/api/v1/chemicals", summary: "化学品定义分页（q 模糊匹配名称/别名/CAS/分子式）", mutates: false, role: "any" },
  { id: "chemicals-v1.chemical.create", domain: "chemicals-v1", method: "POST", path: "/api/v1/chemicals", summary: "登记化学品（重复 CAS / InChIKey 3003）", mutates: true, role: "any" },
  { id: "chemicals-v1.chemical.get", domain: "chemicals-v1", method: "GET", path: "/api/v1/chemicals/{chemical_uuid}", summary: "化学品定义详情（不存在或已删除 3002）", mutates: false, role: "any" },
  { id: "chemicals-v1.chemical.update", domain: "chemicals-v1", method: "PATCH", path: "/api/v1/chemicals/{chemical_uuid}", summary: "部分修改（expected_version 乐观锁）", mutates: true, role: "any" },
  { id: "chemicals-v1.chemical.delete", domain: "chemicals-v1", method: "DELETE", path: "/api/v1/chemicals/{chemical_uuid}", summary: "软删除（expected_version；CAS / InChIKey 让出）", mutates: true, role: "any" },

  // ── telemetry-v1（Host） ──
  { id: "telemetry-v1.events.list", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/events", summary: "遥测追加事件查询", mutates: false, role: "any" },
  { id: "telemetry-v1.events.get", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/events/{event_uuid}", summary: "遥测事件详情", mutates: false, role: "any" },
  { id: "telemetry-v1.sources.cursor", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/sources/{endpoint_uuid}/cursor", summary: "endpoint 遥测来源游标", mutates: false, role: "any" },
  { id: "telemetry-v1.states.list", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/states", summary: "设备最新状态快照列表", mutates: false, role: "any" },
  { id: "telemetry-v1.states.get", domain: "telemetry-v1", method: "GET", path: "/api/v1/telemetry/states/{endpoint_uuid}/{device_uuid}", summary: "设备最新状态快照", mutates: false, role: "any" },

  // ── device-state：V1 设备状态视图（Host） ──
  { id: "device-state.all", domain: "device-state", method: "GET", path: "/api/v1/device-state", summary: "全量设备属性当前值 + 存储统计", mutates: false, role: "any" },
  { id: "device-state.history", domain: "device-state", method: "GET", path: "/api/v1/device-state/history", summary: "跨设备属性变化点（新 → 旧）", mutates: false, role: "any" },
  { id: "device-state.device", domain: "device-state", method: "GET", path: "/api/v1/device-state/{device_id}", summary: "单台设备属性当前值", mutates: false, role: "any" },
  { id: "device-state.property-history", domain: "device-state", method: "GET", path: "/api/v1/device-state/{device_id}/history", summary: "单属性变化轨迹", mutates: false, role: "any" },

  // ── history-v1：Host 事件 / 载荷存储（/edge/history/*） ──
  { id: "history-v1.payloads.get", domain: "history-v1", method: "GET", path: "/api/v1/edge/history/payloads/{payload_uuid}", summary: "不可变 payload 元数据/正文", mutates: false, role: "any" },
  { id: "history-v1.events.list", domain: "history-v1", method: "GET", path: "/api/v1/edge/history/events", summary: "统一 append-only 历史流", mutates: false, role: "any" },
  { id: "history-v1.events.get", domain: "history-v1", method: "GET", path: "/api/v1/edge/history/events/{event_uuid}", summary: "统一历史事件详情", mutates: false, role: "any" },
  { id: "history-v1.events.replacement-chain", domain: "history-v1", method: "GET", path: "/api/v1/edge/history/events/{event_uuid}/replacement-chain", summary: "结果替换审计链", mutates: false, role: "any" },

  // ── decisions：执行端人工决策 ──
  { id: "decisions.status-incidents.list", domain: "decisions", method: "GET", path: "/api/v1/status-incidents", summary: "状态联锁 incident 与调度 hold 快照", mutates: false, role: "host" },
  { id: "decisions.status-incidents.resolve", domain: "decisions", method: "POST", path: "/api/v1/status-incidents/{incident_id}", summary: "提交状态联锁决策（仅限 Host 返回的 options）", mutates: true, role: "host" },
  { id: "decisions.error-decisions.list", domain: "decisions", method: "GET", path: "/api/v1/error-decisions", summary: "待处理动作异常（V1 {decisions}）", mutates: false, role: "host" },
  { id: "decisions.error-decisions.resolve", domain: "decisions", method: "POST", path: "/api/v1/error-decisions/{decision_id}", summary: "处理动作异常（V1 ErrorDecisionIn；成功 status=delivered）", mutates: true, role: "host" },

  // ── driver-packages：驱动包台账与安装（仅带执行面的 host；生效需 POST /restart） ──
  { id: "driver-packages.inventory", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages", summary: "驱动包台账 + 本次启动扫描目录 + 是否需重启", mutates: false, role: "host" },
  { id: "driver-packages.catalog", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/catalog", summary: "官方 / 社区驱动包目录（远程索引 + 本地补充），供一键安装", mutates: false, role: "host" },
  { id: "driver-packages.install", domain: "driver-packages", method: "POST", path: "/api/v1/driver-packages/install", summary: "安装驱动包：GitHub 仓库 / 归档地址下载到 unilabos_data 或本机目录原地登记，uv 预装依赖，返回后台 operation", mutates: true, role: "host" },
  { id: "driver-packages.operations.list", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/operations", summary: "最近的安装 / 卸载操作", mutates: false, role: "host" },
  { id: "driver-packages.operations.get", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/operations/{operation_id}", summary: "轮询单个操作的状态与日志（下载 / 依赖安装 / 扫描）", mutates: false, role: "host" },
  { id: "driver-packages.set-enabled", domain: "driver-packages", method: "PUT", path: "/api/v1/driver-packages/{name}/enabled", summary: "启用 / 停用驱动包（下次启动生效）", mutates: true, role: "host" },
  { id: "driver-packages.uninstall", domain: "driver-packages", method: "DELETE", path: "/api/v1/driver-packages/{name}", summary: "删除 unilabos_data 里的源码树并移出台账，返回后台 operation", mutates: true, role: "host" },
  { id: "driver-packages.graphs.list", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/{name}/graphs", summary: "驱动包随包设备图（data-files share/<包>/graph 或源码 graph/）", mutates: false, role: "host" },
  { id: "driver-packages.graphs.get", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/{name}/graphs/{graph_name}", summary: "随包设备图的 node-link 载荷", mutates: false, role: "host" },
  { id: "driver-packages.graphs.launch", domain: "driver-packages", method: "POST", path: "/api/v1/driver-packages/{name}/graphs/{graph_name}/launch", summary: "把随包图作为受管设备进程拉起（同名进程存在则更新并重启）", mutates: true, role: "host" },
  { id: "driver-packages.changes", domain: "driver-packages", method: "GET", path: "/api/v1/driver-packages/changes", summary: "源码变更与需重启的 Host / Slave（只读）", mutates: false, role: "host" },
  { id: "driver-packages.operations.confirm", domain: "driver-packages", method: "POST", path: "/api/v1/driver-packages/operations/{operation_id}/confirm", summary: "人工确认待确认的操作", mutates: true, role: "host" },
  { id: "driver-packages.operations.recover", domain: "driver-packages", method: "POST", path: "/api/v1/driver-packages/operations/{operation_id}/recover", summary: "重试中断操作的恢复步骤", mutates: true, role: "host" },

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

  // ── lab-v1：实验室视图（V1 lab 合同；档案 / 布局 / 分区 / 摆放已在核心删除） ──
  { id: "lab-v1.warehouse", domain: "lab-v1", method: "GET", path: "/api/v1/lab/warehouse", summary: "品类库存聚合", mutates: false, role: "any" },
  { id: "lab-v1.assembly", domain: "lab-v1", method: "GET", path: "/api/v1/lab/assembly/{subject_id}", summary: "实例的组合视图（placement 恒为 null）", mutates: false, role: "any" },
  { id: "lab-v1.demo", domain: "lab-v1", method: "POST", path: "/api/v1/lab/demo", summary: "写入仓储演示模板与批次（zones / placements 恒为 0）", mutates: true, role: "any" },

  // ── process-management：V1 进程管理（/v1/*，信封；V1 符号码在 error.code） ──
  { id: "process-management.snapshot", domain: "process-management", method: "GET", path: "/v1/snapshot", summary: "进程快照（authority / Host / 受管进程）", mutates: false, role: "any" },
  { id: "process-management.operations.submit", domain: "process-management", method: "POST", path: "/v1/operations", summary: "受理进程管理操作（HTTP 202，幂等 operationId）", mutates: true, role: "any" },
  { id: "process-management.operations.get", domain: "process-management", method: "GET", path: "/v1/operations/{operation_id}", summary: "进程管理操作状态", mutates: false, role: "any" },
  { id: "process-management.logs", domain: "process-management", method: "GET", path: "/v1/logs/{component}", summary: "组件日志尾部", mutates: false, role: "any" },

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
