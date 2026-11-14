# runtime.db：runtime.v1 / Workflow Authority / 运行历史与调度 / Registry Authority

这些路由都落在 `runtime.db`，由 `unilabos/server/api/runtime/` 提供，全部是 V1 信封（传输层解包，业务失败抛
`BackendBusinessError`）。runtime.v1 投影在 Host 子进程的库里（Host 专有，Host 启动 / 重启时 5001）；其余由调度权威回答。

## 1. runtime.v1 只读投影（`/api/v1/runtime/*`）

浏览器只使用 GET；命令 receive、job transition、outbox claim/ack 属于 Backend ↔ Edge
控制面，目录校验禁止登记。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/runtime/sessions[/{session_uuid}]` | Backend 控制会话（本机调度模式下为空） |
| GET | `/runtime/endpoints[/{endpoint_uuid}]` | 执行 endpoint 快照：`device_routes` + `action_capabilities` |
| GET | `/runtime/commands[/{command_uuid}]` | Backend command inbox |
| GET | `/runtime/jobs[/{job_uuid}]` | 执行 job（每个 attempt 一行；`device_uuid` / `action_name` / 时间戳 / 状态 / terminal gate） |
| GET | `/runtime/adapter-commands[/{uuid}]` | adapter durable outbox |
| GET | `/runtime/backend-events[/{event_uuid}]` | Backend event durable outbox |

`RuntimeExecutionJob.status`：`accepted → dispatch_pending → dispatched → running →
(failure_waiting | terminal_waiting) → succeeded | failed | canceled | execution_unknown |
rejected`。`retry_of_job_uuid` / `attempt_no` 表达重试链；`terminal_gate_state`
表达失败放行的门控。

> 注意：`runtime.execution_job` 只在 Backend 控制模式（runtime.v1 命令下发）写入；
> `health.scheduler_mode=local` 的本机调度时该表为空。因此时间线 / 监控 /
> 执行历史页的「每次 attempt」一律取 Workflow Authority 的 Task / Node Job
> （`features/task-jobs.ts`：设备与动作从 `workflow_snapshot.nodes[].meta_data.target_device_id`
> 反查），runtime job 仅在系统诊断页展示。

`RuntimeActionCapability.descriptor` 就是 registry 导出的动作定义
（`ActionDescriptor`：`display_name`、`schema`、`goal_default`、`handles`、
`placeholder_keys`、`always_free`、`materials_need_lock` 等）；`device-actions.ts` 提供
`actionSchemaDetailFromCapability()` 把它投影为参数表单使用的 `DeviceActionSchemaDetail`
（schema.properties.goal + placeholder_keys），`actionDisplayName()` 取展示名。

## 2. Workflow Authority（V1 信封）

本机调度（`health.scheduler_mode=local`）时挂载；接入远端调度权威后本进程不挂载，前端应连接调度权威地址。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/workflows` | 创建定义 `{name, tags, description, meta_data, workflow_type?, operation_category_uuid?}`；`workflow_type` 为 `normal`（缺省）或 `experiment_operation`，创建后不能改（1000） |
| GET | `/workflows` | 定义分页 `{items, has_more, page, page_size}`（`page_size` ≤ 100；过滤 `keyword` / `name` / `workflow_type` / `status` / `operation_category_uuid`）；条目带 `workflow_type` / `operation_category_uuid` / `status`（`draft` / `published`） |
| GET / PUT / DELETE | `/workflows/{uuid}` | 详情 / 更新元数据（类别省略 = 保持，null = 清除）/ 软删除并级联节点边 |
| GET | `/workflows/{uuid}/graph` | 整图 hydration（当前层）：`workflow` `nodes` `edges` `node_templates` `handle_templates` `inventory_requirements` |
| PUT | `/workflows/{uuid}/graph` | `{revision, nodes[], edges[], site_binding_mode?}` 乐观锁全量协调；返回新 graph |
| PUT | `/workflows/{uuid}/io` | 声明入口参数合同 / 输出 / 绑定（写服务端保留的 `meta_data.unilab`，revision +1，返回整图；见 §2.5） |
| POST | `/workflows/{uuid}/publications` | `{revision}` 发布当前修订，返回 V1 发布合同（`uuid` 即 `contract_uuid`；同修订幂等，旧修订 3003） |
| GET | `/workflows/{uuid}/publications` | 该工作流全部发布（revision 倒序；不含快照正文） |
| GET | `/workflow-publications` | 每个工作流的最新发布（插入子工作流的调色板） |
| POST | `/workflows/{uuid}/composite-invocations` | `{revision, contract_uuid, invocation_uuid?, device_bindings: {}, pose?, param?}` 按发布合同插入实验操作并内联展开，返回插入后的父图（当前层，HTTP 200） |
| POST | `/workflows/from-template` | 注册表 `@workflow` 模板按角色绑定实例化（`site_binding_mode` 缺省 `resolve`） |
| GET / POST | `/workflows/template-catalog` / `/workflows/template-instances` | 模板目录 / 浏览器形状的模板实例化（`preserve`） |
| GET / POST / PUT / DELETE | `/experiment-operation-categories[/{uuid}]` | 实验操作类别（列表 `{items}`；名称唯一 3003；仍被引用时删除 3003） |
| POST | `/workflows/import` / `/local/workflows/import-python` | 旧版 JSON 导入 / 原始 `.py` 源码导入（`X-Workflow-Filename`，只解析不执行），都返回整图（201） |
| POST / GET | `/workflows/{uuid}/duplicate` / `/workflows/{uuid}/referenced-by` | 复制 / 引用它的父工作流 |
| GET / POST | `/workflows/{uuid}/nodes` / `/workflows/{uuid}/edges` / `/workflows/{uuid}/batch-delete` | V1 增量编辑（全图 CAS 保存的薄封装，返回整图） |
| GET / PATCH / DELETE / POST | `/workflow-nodes/{uuid}[/duplicate]` / `DELETE /workflow-edges/{uuid}` | 单节点读取 / 局部修改 / 删除（仍有子节点 3003）/ 复制；删边 |
| GET | `/workflow-node-templates[/{uuid}]` | 节点模板目录（分页） |
| PUT | `/workflows/{uuid}/resource-scopes` | 资源作用域声明（整份替换） |
| GET / POST | `/workflows/{uuid}/run-preflight` | 不建任务、不占资源的候选运行检查（POST 带入口参数 / 库存绑定；`Cache-Control: no-store`） |
| POST | `/authoring/compile` `/authoring/generate-python` `/authoring/validate` | 源码 ↔ 图的可信转换（不落库） |
| POST | `/workflow-tasks` | 提交运行（见 §2.1；声明了入口参数的工作流带 `input`；V1 另收 `priority` / `inventory_bindings`）→ 201 |
| PATCH | `/workflow-tasks/{uuid}/input` | `{expected_revision, input, idempotency_key?}` 暂停时修改尚未被消费的入口参数 |
| GET | `/workflow-tasks` | 运行分页 `{items, has_more, …}`（`status` / `workflow_uuid` / `cleanup_status` / `execution_kind`）；条目带 V1 `priority` `inventory_bindings` `execution_mode` `dispatch_gate` `wait_reason` |
| GET | `/workflow-task-presentations?view=matrix` | 紧凑任务 + 内嵌作业（活跃 / 需关注任务 + 最近 `terminal_limit` 个终态） |
| GET | `/workflow-tasks/{uuid}` | 运行详情（含 `workflow_snapshot` / `execution_plan` / `control_revision`） |
| GET / DELETE | `/workflow-tasks/{uuid}/delete-eligibility` / `/workflow-tasks/{uuid}` | 能否删除及阻塞项 / 软删除（阻塞项 3003，重放 `already_deleted`） |
| POST | `/workflow-tasks/{uuid}/commands` | `{type, idempotency_key, expected_revision?, target_node_uuid?, description?, meta_data?}`，返回**命令投影**（HTTP 201），见 §2.2 |
| GET | `/workflow-tasks/{uuid}/node-runs` | 节点运行视图：每节点一条（拓扑序），`status / return_info` 是当前 attempt 的结果，`attempts[]` 是历史；画布节点状态用它 |
| GET | `/workflow-tasks/{uuid}/jobs` | 全部 attempt（节点作业）平铺列表 |
| PATCH | `/workflow-tasks/{uuid}/jobs/{job_uuid}/param` | `{param}` 暂停时合并进某个待执行 attempt（V1 按作业粒度） |
| GET | `/workflow-tasks/{uuid}/events?after_sequence=` / `/step-state` | 任务事件游标 / 逐步执行候选节点 |
| GET / POST | `/workflow-tasks/{uuid}/execution-locks` / `…/{lease_uuid}/force-release` | 执行锁（Claim / Fence）/ 确认现场安全后强制释放 |
| GET | `/workflow-tasks/{uuid}/material-events` / `/inventory-consumptions`；`/workflow-node-jobs/{uuid}/inventory-consumptions`；`/reagents/{uuid}/inventory-consumptions` | 物料账本变化与数量型库存消费事实（只读） |
| GET | `/workflow-tasks/{uuid}/manual-confirmations` | 人工确认待办与历史（每 job 至多一条） |
| GET | `/workflow-manual-confirmations/{uuid}` | 人工确认详情 |
| POST | `/workflow-node-jobs/{job_uuid}/manual-confirmation` | `{action: "approve" \| "reject", confirmed_by?, comment?, decision_idempotency_key?}` 按作业提交人工确认（确认单的 `workflow_node_job_uuid` 即 job_uuid） |
| GET | `/workflow-interventions?status=&limit=` | **全局**干预列表（`open` / `selected` / `superseded`，limit 1..500）；按任务看就按 `workflow_task_uuid` 过滤 |
| GET / POST | `/workflow-interventions/{uuid}` / `…/{uuid}/decisions` | 干预详情 / `{revision, option_id, result?}` + 请求头 `Idempotency-Key` 按修订选择方案（201 新 / 200 重放；未投递 3003，用同一键重试） |
| GET / POST | `/workflow-tasks/{uuid}/human-interactions` / `/workflow-human-interactions/{uuid}/reply` | V1 结构化人工交互请求 / 回复（同答案重放幂等） |
| GET | `/workflow-node-runs/{uuid}` | 节点运行详情（含 `attempts`） |
| GET | `/workflow-node-jobs/{uuid}` | 作业（attempt）详情 |
| GET | `/workflow-node-jobs/{uuid}/results` | 作业结果（每 job 至多一条） |
| GET | `/workflow-node-jobs/{uuid}/feedback?page=&page_size=` | 反馈归档（V1 分页 `{items, has_more, page, page_size}`，sequence 自然序） |
| POST | `/workflow-node-jobs/{uuid}/reconcile-quantity` / `resolve-uncertain` / `settle-material-transfer` | 实际用量核对 / 结果未知处置（只接受 `canceled`，等待确认时 202）/ 失败转运的实际位置结算 |
| POST | `/device-action-runs` | V1 单点设备动作（物料 + 节点模板，`idempotency_key`）；OpenLabSite 的单点动作仍走 `ad_hoc_device_action` 任务 |
| GET / POST | `/workflow-resource-intervals[/{owner}/release\|lend]` `/workflow-resource-loans[/{uuid}/return]` `/workflow-device-tenancies[/{uuid}/release]` | dev 独有资源区间 / 借还 / 设备托管（释放体 `{expected_version, reason}`） |
| GET | `/workflow-runtime/wait-graph` | 资源等待图（等待者 + 活跃占用，环检测） |
| GET | `/workflows/{uuid}/authoring` | Authoring 状态机聚合（Draft / Candidate） |
| PUT | `/workflows/{uuid}/authoring/draft` | 保存 Python 源码草稿（hash + revision 前置校验） |
| POST | `/workflows/{uuid}/authoring/apply` | `{candidate_hash}` Apply Candidate 到 Graph（草稿 hash 与基准修订由服务端从已存候选推导；旧的三元 CAS 体 1000） |
| SSE | `/events` | `frontend_event` 失效通知流（V1 事件名，见 [README §3](./README.md#3-实时模型)） |

dev 时代的 `GET /workflow-tasks/{uuid}/interventions`、`GET /workflow-node-jobs/{uuid}/feedback-history`、
`POST /workflow-manual-confirmations/{uuid}/decision`、`POST /workflow-tasks/{uuid}/manual-confirmations/{uuid}/decision`
已删除，客户端对应换成 `interventions()` 全局列表、`jobFeedback()`、`decideJobManualConfirmation()`。

### 2.1 提交运行

#### Site 模板参数的导入与确认

`SiteSlot` / `unilabos_sites` 参数保存权威 `site_uuid`，不是 `T1` 这样的标签。普通 `str`
（例如 `tips_site` / `plate_site`）仍按驱动的标签语义处理，不做名称推断。

`POST /workflows/from-template` 的 `site_binding_mode` 默认 `resolve`；`PUT /workflows/{uuid}/graph`
按 V1 默认 `preserve`（原样保存草稿），程序化导入显式传 `resolve`。`resolve` 在目标物料范围将标签唯一解析为 UUID；
缺设备/动作声明、缺 Site 或有歧义返回业务码 1000（HTTP 200），失败不改原图。
浏览器保存显式传 `preserve`，即使只有一个候选，也必须通过确认窗口选择目标物料及 Site。
省略参数但 `goal_default` 存在非空 Site 建议时也需确认；明确清空的可选参数或空默认值才跳过。

作用域依次为 `node.meta_data.site_binding_owners[param]`（owner material_uuid）、Host
物料动作的 `param.mount_resource`、目标设备的物料子树；前两种只查 owner 自身的 Site。
禁止全局按名称选第一个，不进行 category 强检验或物料创建/转移。

确认后写 `param[param] = site_uuid`，并保留
`meta_data.site_bindings[param] = {site_uuid, owner_material_uuid, device_id, action_name}`。
打开/保存草稿、唯一预选、在高级 JSON 粘贴 UUID 均不等于确认。设备、动作、物料或 Site
发生变化后旧记录须重新核对；目录加载失败标为“待校验”。确认记录不是锁或鉴权凭证。
节点卡和工作流卡计入“待补全 N 项”，已确认并仍有效的引用、合法可选空值和上游动态映射不计入。
运行（含逐步/单点）之前重新读取权威校验；流程列表可直接补全原定义，无须复制工作流。
单点动作不走模板导入自动解析，客户端应提交已确认的实际 UUID。

```jsonc
// 整图运行
{ "execution_kind": "workflow", "workflow_uuid": "…", "run_mode": "normal|step|single_node", "target_node_uuid": null }

// 单点设备动作（设备页 / 画布节点直发 / 参考案例）
{
  "execution_kind": "ad_hoc_device_action",
  "device_id": "sample_rack",
  "action_name": "load_sample",
  "action_type": "UniLabJsonCommand",
  "param": { "sample_name": "s1", "site": "<已确认的 site_uuid>" },
  "execution_policy": { "always_free": true },   // registry 动作元数据，决定并发模式
  "idempotency_key": "…"                          // 可选；同键同参重复提交返回既有任务
}
```

两种运行都生成 `workflow_task` + `workflow_node_job`，共用调度、设备锁 / 物料锁、历史
与异常链路；`ad_hoc` 任务的 `workflow_uuid` 为 `null`，节点信息在
`workflow_snapshot.nodes[0]`（`action_name`、`meta_data.target_device_id`）。

### 2.2 任务控制命令（V1）

`POST /workflow-tasks/{uuid}/commands` 幂等提交一次控制命令，返回**命令投影**（HTTP 201）：

```jsonc
{ "uuid": "…", "workflow_task_uuid": "…", "type": "pause", "idempotency_key": "…",
  "status": "pending" | "succeeded" | "rejected", "result": { "dispatch_gate": "paused" } /* 拒绝时 { "reason": "…" } */ }
```

| type | 适用 | 效果 |
| --- | --- | --- |
| `pause` | 自动模式（`run_mode=normal`）运行中 | 暂停派发：`dispatch_gate=paused`、`control_status=paused`，已下发的动作照常跑完，**不转逐步** |
| `switch_to_step` | 自动模式运行中 | 转为逐步（dev 原来的 pause 语义）：在途动作跑完后停下 |
| `step` | 逐步模式暂停中；或自动模式暂停派发中且无在飞动作（先转逐步） | 只放行一个满足依赖的动作 attempt，投影 `pending`，被下一次派发认领后完成；`target_node_uuid` 可指定目标节点 |
| `resume` | 自动模式暂停派发中 / 逐步模式 | 自动模式解除暂停（`dispatch_gate=active`）；逐步模式转为 `run_mode=normal` 并从原位置按依赖并行执行 |
| `cancel` | 未结束任务（暂停中也可以） | 任务进入 `canceling`，不再派发；正在执行的动作收到取消请求，设备锁保持到它真实返回，全部返回后落 `canceled` |
| `unlock_resources` | 失败 / 取消 / 超时的终态任务 | 人工解除执行锁、资源区间与设备托管；须 `meta_data.confirmed_physical_safe: true` + `description` |

- **业务拒绝**是 HTTP 201 + 投影 `status="rejected"` + `result.reason`（`task_is_terminal`、`task_is_not_in_normal_mode`、
  `task_is_not_paused`、`task_is_not_paused_step`、`step_in_progress`、`target_node_not_ready`、
  `only_workflow_tasks_accept_execution_control`、`job_outcome_unsettled`…）。SDK `commandTask()` 把它抛成
  `TaskCommandRejectedError`（code 3003、`reason`，文案取 `TASK_COMMAND_REJECT_REASONS`），不会被当成功。
- `expected_revision` 可选：给出时按任务 `control_revision` 校验，不符 3003（HTTP 200 信封）。
  同幂等键同类型重传返回同一条命令投影，不再放行；同键换类型 1000。
- 命令成功后重读任务拿新的 `control_revision`（命令投影不含任务）。

#### 逐步运行（微后端持有许可）

以 `run_mode="step"` 提交完整工作流，初始 `control_status="paused"`，不下发动作。
任务详情必须返回 `control_revision`（初始 0；列表投影不提供）。`step` 命令只放行一个满足依赖的动作 attempt；
并行分支也只选一个，循环/子流程展开后的叶动作同样逐步。该步等待资源或执行期间 `control_status="active"`，
不接受下一次 step（`step_in_progress`）；完成后回到 paused。尚未获准的动作不申请动作/物料执行锁；
库存预留继续沿用整任务的原有策略。

`resume` 正在执行的动作不会被取消或重复下发。执行状态不确定或异常待处理时必须先走原有裁决流程，
不能用 resume 绕过。retry 仍在同一 node run 下追加 attempt，但逐步模式下新 attempt 需再次点击放行。

命令保存在 `workflow_task_command`：step 的 result 关联 job_uuid / node_run_uuid，target_node_uuid 关联工作流节点；
不创建新任务。每条受理命令推进 control_revision。网络重传必须保留原 idempotency_key（和原 expected_revision），
不能自动重读版本重试 step。状态变化经 `workflow.runtime.changed`（`data.kind` 为 `task` / `node_run`）SSE 通知；
正文仍经 HTTP 重拉。重启后已成功动作不重跑，已下发但结果未知的动作转 waiting_reconciliation 等待人工裁决。

缺少 control_revision、node-runs 或命令端点属于契约/部署错误：显示错误并禁止不安全放行，
不能通过 jobs 推导来替代缺失的权威节点运行状态，不保留开发期旧协议回退。

### 2.3 状态词汇（canonical，页面不得改写）

- Task：`pending running canceling succeeded failed canceled timeout`；
  `control_status`：`active paused waiting_intervention waiting_reconciliation`；V1 `dispatch_gate`：`active paused`；
  `execution_mode`：`normal step`。
- Node Job：`pending dispatched running intervention_required cancel_requested
  execution_unknown succeeded failed skipped canceled timeout`。
- 可选字段 = DB NULL 时键缺席（不是 `null`）；`intervention.selected_option` 未决策时为 `{}`；
  干预带 `edge_command_uuid`（= 执行面 decision_id）与 `delivery_status`，不再有 `edge_agent_uuid` / `decision_idempotency_key`。
- 节点运行（node run）与 attempt（job）两层：节点级静态信息（`topological_index`、`executor_kind`、
  `execution_policy`、`execution_timeout_seconds`）在节点运行上；job 只带 `attempt_no`、`trigger`
  （`initial` / `retry_decision`）、`retry_of_job_uuid`、`error_resolution` 与本次结果。
  多 attempt = 同一 `workflow_node_run_uuid` 下的多个 job 行；results 每 job 至多一条。

### 2.4 Graph 写入

两种写法，按有没有节点模板区分：

- **有模板（Backend 目录下发）**：节点 `workflow_node_template_uuid` 与边的
  `source/target_handle_uuid` 必须来自 graph hydration 返回的 `node_templates` /
  `handle_templates`；页面不得自造 UUID。
- **无模板（本机 Host；编排画布与 `@workflow` 声明式步骤都用这条）**：节点不引用模板，
  `type = device_action` + `material_uuid`（设备根物料）+ `action_name` / `action_type` +
  `param` + `meta_data.target_device_id` 描述一个动作；执行顺序写在
  `execution_policy.depends_on: [上游节点 uuid]`，`edges` 为空（Handle 连线属于模板体系，
  有连线的节点必须引用模板，否则 1000）。节点 uuid 是稳定身份：画布首次提交时分配并
  写回草稿，再提交复用；`depends_on` 参与执行计划的拓扑排序与环检测。

画布提交流程：`POST /workflows`（或复用已绑定定义 `PUT /workflows/{uuid}`）→
`PUT /workflows/{uuid}/graph {revision, nodes, edges: []}`（撞 3003 重读 revision 再试一次）→
`POST /workflow-tasks {execution_kind: "workflow", workflow_uuid}`。本机调度器目前只接线
`device_action`；其它 executor_kind 的节点图可以保存，但运行会以 `plan_not_executable` 失败，
前端在提交运行前拦截。参数传递需要 Handle，无模板图只保留顺序连线。

**人工确认**：Host 把它实现成执行节点（`host_node`，多 Host 时可能有多个）上的动作
`manual_confirm`（descriptor `node_type=manual_confirm`，always-free，goal
`{assignee_user_ids: [], timeout_seconds: 3600}`）。画布的人工确认节点提交为
`type=device_action` + `target_device_id=<host_node>` + `action_name=manual_confirm`，
`assignee_user_ids` 是明确的列表：空列表 = 不指派（任何人可确认），与 goal_default 同义，
不算未填。只有执行节点上报了该动作，画布才提供人工确认节点；多个执行节点时节点上可选。
调度器识别到 `manual_confirm` 后，会先持久化一条
`workflow_manual_confirmation`，保持当前 job 为等待状态，不向设备重复派发；前端通过
`GET /workflow-tasks/{uuid}/manual-confirmations` 读取待办，按作业提交结果
（`POST /workflow-node-jobs/{job_uuid}/manual-confirmation`，`approve` / `reject`，V1 没有 skip）。
`assignee_user_ids` 必须区分：字段缺失表示编辑器没有完成配置，会被拒绝；显式 `[]`
表示不限制确认人；非空列表表示指定允许确认的用户。确认记录、决策和超时都可在服务
重新实例化后恢复。

`@workflow` 装饰器声明的默认子工作流在 Host 启动时以稳定 uuid 上报到本域，出现在定义列表中；
画布「克隆」它们时把 `depends_on` 还原成顺序连线、`meta_data.target_device_id` 还原成设备。

### 2.5 入口参数、输出、发布与组合调用（工作流即节点）

- **合同**写在服务端保留的 `workflow.meta_data.unilab`（`input_contract` / `output_contract` /
  `output_bindings`），只能经 `PUT /io` 写入；普通 `PUT /workflows/{uuid}` 与 `PUT /graph` 不写也不清。
  前端用 `declaredWorkflowIo(workflow)` 读取，不自行改写。
- **画布节点引用入口参数**：param **顶层**值写 `{"kind": "workflow_input", "parameter": 名}`
  （`workflowInputReference(名)`）。引用的名字必须已在合同里声明——`PUT /graph` 与 `PUT /io` 都校验（1000）。
  所以「新增引用」要先 `PUT /io` 声明（或用 `node_params` 一并写入），「删除合同里的参数」要在图里不再引用之后。
- **输出绑定**：画布节点 `{kind: "node_output", workflow_node_uuid, data_key}`（空串 = 整个返回值）；
  组合调用 / 模板节点用 `source_handle_uuid`；也可直接透传入口参数。
- **提交运行**：`POST /workflow-tasks {workflow_uuid, input}` 按合同校验（`workflow_input_unknown` /
  `workflow_input_required` / `workflow_value_invalid` + `（/input/名）`，均 1000）并补默认值；
  任务详情返回有效 `input` 与 `output`（列表不含 `output`）。未声明合同的工作流只接受 `{}`。
- **暂停时修改**：`PATCH /workflow-tasks/{uuid}/input`，`expected_revision` 取 control_revision。
  只在 `control_status="paused"` 且未结束时允许；已被已下发 attempt 用过的参数冻结（3003，消息含参数名），
  同值提交是空操作；成功记为 `edit_input` 命令并推进 control_revision。
- **发布**：`POST /publications {revision}` 冻结当前修订，返回 V1 发布合同（`uuid` = contract_uuid、`workflow_revision`、
  `version`、`input_contract` / `output_contract`、`executor_requirements: []`、`node_count` / `edge_count`、`revision_fingerprint`，
  另带 dev 调色板字段 `inputs` / `outputs` / `node_template` / `handle_templates`）；`GET /workflow-publications` 给每个工作流最新一条。
- **组合调用**：`POST /composite-invocations {revision, contract_uuid, invocation_uuid?, device_bindings: {}, pose?, param?}`。
  子工作流 = 合同所属工作流，子修订 = 合同修订；它必须是实验操作（`workflow_type="experiment_operation"`，否则 1000）
  且当前修订已发布（否则 3003）；dev 发布没有执行器需求，`device_bindings` 必须为空对象。`param` 即实参：静态值或
  `{"kind": "workflow_input", "parameter": 父入口参数}`。返回插入后的父图（当前层）。父图多一个 `type="workflow"`、
  `meta_data.unilab.composite` 记着固定发布的调用节点，以及 `parent_uuid` 链指向它的展开节点（uuid 由调用 uuid 派生）。
  **前端回存整图时必须原样带上调用节点与展开节点（及它们之间的边）**；`meta_data.unilab` 可以不回传（服务端保留）。
  父图里依赖调用节点（`depends_on: [调用 uuid]`）等价于依赖它展开出的全部叶子。

## 3. V1 运行历史与调度观测

**run-history**（`/api/v1/history/*`，调度权威从 runtime.db 视图回答；与 Host 的 `/edge/history/*` 是两回事），
时间字段是 epoch 秒（V1 原样）：

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/history/workflows?state=&since=&limit=&with_spec=` | `runHistory.workflows()` | `{runs[], stats}`（新 → 旧；`stats.runs_by_state` / `total_runs` / `total_jobs`） |
| GET | `/history/workflows/{workflow_id}` | `runHistory.workflow(id)` | 单次运行 + 提交时整图快照 + 全部作业；不存在 3002 |
| GET | `/history/jobs?workflow_id=&device_id=&limit=` | `runHistory.jobs()` | 作业执行历史 `{jobs[]}`（实测 / 预估用时） |

**scheduler**（无本机调度器时 5001）：

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/monitor/snapshot` | `scheduler.monitorSnapshot()` | 设备忙闲、调度统计、各通道近期事件 |
| GET | `/timeline?window_s=` | `scheduler.timeline()` | 执行中作业 + 窗口内已完结作业 + 预估器统计 |
| GET | `/scheduler/time-plan` | `scheduler.timePlan()` | 没有时间计划引擎时 `{enabled: false, algorithm: "stable-ready-order"}` |
| POST | `/reschedule` | `scheduler.reschedule()` | 重新判定等待派发的作业（调试用） |
| GET / POST | `/scheduler/drain` / `/scheduler/drain/resume` | `drainStatus()` / `drain()` / `resumeDrain()` | 排空闸门（`phase` / `active_device_job_ids` / `dispatch_paused`） |
| GET / POST | `/scheduler/inventory-recovery[/reconcile]` `/scheduler/physical-recovery[/{job}/settle\|release]` | 同名方法 | 重启后需要人工核对的库存 / 物理结算 |

V1 四通道 SSE `GET /monitor/events` 不进浏览器目录。

## 4. Registry Authority（跟随调度权威，V1 信封）

Host 启动时经 `POST /api/v1/registry/reports` 全量上报（控制面路由，浏览器不调用；V1 合同把
`POST /resource-templates` 让给了身份回执）。
每个模板条目独立维护版本；被活跃 workflow 节点引用的 action 删除/变化时条目挂起为
`pending`，由前端确认。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/registry/entries?status=` | 条目状态行（`status[]` 可同时含 `active` `pending` `removed` `unusable`） |
| GET | `/registry/entries/{name}` | 详情：`active_payload` / `pending_payload` / `pending_conflicts` |
| GET | `/registry/pending-impacts` | 挂起条目 → 受影响 workflow 节点（画布徽标数据源） |
| GET | `/registry/entries/{name}/versions[/{version}]` | 版本历史（新在前）/ 单版本全文 |
| POST | `/registry/entries/{name}/apply` | 升级：挂起版本切换为生效版本 |
| POST | `/registry/entries/{name}/dismiss` | 忽略挂起版本（生效不变，历史保留） |
| POST | `/registry/entries/{name}/restore/{version}` | 历史版本还原为新的生效版本 |
| GET | `/registry/reports` | 上报批次统计（added/updated/pending/removed/revived/unusable） |

接入远端 Backend 的受控 Edge 返回 404：`stores/connection.ts` 探测一次并把
`registrySupport` 置为 `unsupported`，注册表页显示降级说明；默认 Host 和
`--role backend` 调度权威进程均提供本域。
