# runtime.db：runtime.v1 / Workflow Authority / Registry Authority

三组路由都落在 `runtime.db`，由 `unilabos/server/api/runtime/` 提供。

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
> `health.scheduler=local` 的 Host 进程本机调度时该表为空。因此时间线 / 监控 /
> 执行历史页的「每次 attempt」一律取 Workflow Authority 的 Task / Node Job
> （`features/task-jobs.ts`：设备与动作从 `workflow_snapshot.nodes[].meta_data.target_device_id`
> 反查），runtime job 仅在系统诊断页展示。

`RuntimeActionCapability.descriptor` 就是 registry 导出的动作定义
（`ActionDescriptor`：`display_name`、`schema`、`goal_default`、`handles`、
`placeholder_keys`、`always_free`、`materials_need_lock` 等）；`device-actions.ts` 提供
`actionSchemaDetailFromCapability()` 把它投影为参数表单使用的 `DeviceActionSchemaDetail`
（schema.properties.goal + placeholder_keys），`actionDisplayName()` 取展示名。

## 2. Workflow Authority（Backend 信封）

本机调度（`health.scheduler=local`）时挂载；接入云端后本进程不挂载，前端应连接调度权威地址。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/workflows` | 创建定义 `{name, tags, description, meta_data}` |
| GET | `/workflows` | 定义分页（`page/page_size/name`） |
| GET / PUT / DELETE | `/workflows/{uuid}` | 详情 / 更新元数据 / 软删除并级联节点边 |
| GET | `/workflows/{uuid}/graph` | 整图 hydration：`workflow` `nodes` `edges` `node_templates` `handle_templates` |
| PUT | `/workflows/{uuid}/graph` | `{revision, nodes[], edges[]}` 乐观锁全量协调；返回新 graph |
| POST | `/workflow-tasks` | 提交运行（见下） |
| GET | `/workflow-tasks` | 运行分页（`status/workflow_uuid/cleanup_status`） |
| GET | `/workflow-tasks/{uuid}` | 运行详情（含 `workflow_snapshot` / `execution_plan`） |
| GET | `/workflow-tasks/{uuid}/node-runs` | 节点运行视图：每节点一条（拓扑序），`status / return_info` 是当前 attempt 的结果，`attempts[]` 是历史；画布节点状态用它 |
| GET | `/workflow-tasks/{uuid}/jobs` | 全部 attempt（节点作业）平铺列表 |
| GET | `/workflow-tasks/{uuid}/manual-confirmations` | 人工确认待办与历史（每 job 至多一条） |
| GET | `/workflow-tasks/{uuid}/interventions` | 干预记录（同 job 多 revision，至多一条 open） |
| GET | `/workflow-node-runs/{uuid}` | 节点运行详情（含 `attempts`） |
| GET | `/workflow-node-jobs/{uuid}` | 作业（attempt）详情 |
| GET | `/workflow-node-jobs/{uuid}/results` | 作业结果（每 job 至多一条） |
| GET | `/workflow-node-jobs/{uuid}/feedback-history` | 反馈归档（sequence 自然序） |
| GET | `/workflows/{uuid}/authoring` | Authoring 状态机聚合（Draft / Candidate） |
| PUT | `/workflows/{uuid}/authoring/draft` | 保存 Python 源码草稿（hash + revision 前置校验） |
| POST | `/workflows/{uuid}/authoring/apply` | Apply Candidate 到 Graph |
| SSE | `/events` | `frontend_event` 失效通知流 |

### 2.1 提交运行

```jsonc
// 整图运行
{ "execution_kind": "workflow", "workflow_uuid": "…", "run_mode": "normal|step|single_node", "target_node_uuid": null }

// 单点设备动作（设备页 / 画布节点直发 / 参考案例）
{
  "execution_kind": "ad_hoc_device_action",
  "device_id": "sample_rack",
  "action_name": "load_sample",
  "action_type": "UniLabJsonCommand",
  "param": { "sample_name": "s1", "site": "<site uuid or label>" },
  "execution_policy": { "always_free": true },   // registry 动作元数据，决定并发模式
  "idempotency_key": "…"                          // 可选；同键同参重复提交返回既有任务
}
```

两种运行都生成 `workflow_task` + `workflow_node_job`，共用调度、设备锁 / 物料锁、历史
与异常链路；`ad_hoc` 任务的 `workflow_uuid` 为 `null`，节点信息在
`workflow_snapshot.nodes[0]`（`action_name`、`meta_data.target_device_id`）。

### 2.2 状态词汇（canonical，页面不得改写）

- Task：`pending running canceling succeeded failed canceled timeout`；
  `control_status`：`active paused waiting_intervention waiting_reconciliation`。
- Node Job：`pending dispatched running intervention_required cancel_requested
  execution_unknown succeeded failed skipped canceled timeout`。
- 可选字段 = DB NULL 时键缺席（不是 `null`）；`intervention.selected_option` 未决策时为 `{}`。
- 节点运行（node run）与 attempt（job）两层：节点级静态信息（`topological_index`、`executor_kind`、
  `execution_policy`、`execution_timeout_seconds`）在节点运行上；job 只带 `attempt_no`、`trigger`
  （`initial` / `retry_decision`）、`retry_of_job_uuid`、`error_resolution` 与本次结果。
  多 attempt = 同一 `workflow_node_run_uuid` 下的多个 job 行；results 每 job 至多一条。

### 2.3 Graph 写入

两种写法，按有没有节点模板区分：

- **有模板（Backend 目录下发）**：节点 `workflow_node_template_uuid` 与边的
  `source/target_handle_uuid` 必须来自 graph hydration 返回的 `node_templates` /
  `handle_templates`；页面不得自造 UUID。
- **无模板（本机 Host；编排画布与 `@workflow` 声明式步骤都用这条）**：节点不引用模板，
  `type = device_action` + `material_uuid`（设备根物料）+ `action_name` / `action_type` +
  `param` + `meta_data.target_device_id` 描述一个动作；执行顺序写在
  `execution_policy.depends_on: [上游节点 uuid]`，`edges` 为空（Handle 连线属于模板体系，
  有连线的节点必须引用模板，否则 422 / 1000）。节点 uuid 是稳定身份：画布首次提交时分配并
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
`GET /workflow-tasks/{uuid}/manual-confirmations` 读取待办，并使用确认决策接口提交结果。
`assignee_user_ids` 必须区分：字段缺失表示编辑器没有完成配置，会被拒绝；显式 `[]`
表示不限制确认人；非空列表表示指定允许确认的用户。确认记录、决策和超时都可在服务
重新实例化后恢复。

`@workflow` 装饰器声明的默认子工作流在 Host 启动时以稳定 uuid 上报到本域，出现在定义列表中；
画布「克隆」它们时把 `depends_on` 还原成顺序连线、`meta_data.target_device_id` 还原成设备。

## 3. Registry Authority（跟随调度权威，Backend 信封）

Edge 每次刷新 `POST /api/v1/resource-templates` 全量上报（控制面路由，浏览器不调用）。
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
