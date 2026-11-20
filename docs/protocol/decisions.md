# 人工决策：状态告警、动作异常与工作流干预

需要操作员介入的执行端事件，V1 信封（传输层解包），REST 快照为权威。动作异常在 `/api/v1/events` 的
`station.error_handling.changed` 到达时重读（失败作业挂起等待决策、作业恢复或结束时各发一次），轮询只作兜底：
通知流断开时 5 s 一读，在线时 30 s 校准一次；工作流干预随同一事件重读，并与状态告警一样保持 5 s 轮询，
页面可见性恢复时全部重读。
状态告警由 Host 持有（Host 专有路由，经调度权威转交）；动作异常由调度权威的决策台回答（V1 实际合同）。
Host 不在线（启动 / 重启中）或 `--role backend` 没有执行面时返回信封 5001（或 404），页面整面板置灰并提示，
`isCapabilityUnavailable(error)` 判定。

## 1. 状态告警（status-incidents）

设备属性命中联锁策略时暂停新任务派发，等待决策；超时保持暂停（不自动执行任何动作），
属性自愈时 incident 自动 `cleared`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/status-incidents?device_id=&include_terminal=` | `{host_ready, incidents[], holds[]}`；`host_ready=false` 时两数组必为空（HostNode 启动中） |
| POST | `/status-incidents/{incident_id}` | `{action, option?, reason?}`；`action` 必须是该 incident `options[].action` 之一（`execute_recovery` / `resume`），否则 1000 |

- `incident.mode`：`interlock`（产生 hold，压住调度）/ `notify`（只提醒，`hold_token=""`）；
- `incident.state`：`awaiting_decision → recovering → resolved`，或属性自愈 `cleared`；
- `options[].recovery_action` 只读展示，由 Host 经 ActionClient 执行，浏览器不得调用或改参；
- POST 回执 `{status:"delivered", state}`：delivered 只表示受理，恢复是否成功以后续 GET 为准；
- 「不存在」业务码（4001 / 3002）= 不存在 / 已终态 / 被他人处理，重新 GET 收敛；3003 = 已有恢复在执行。

## 2. 动作异常（error-decisions，V1 合同）

动作执行失败（或动作执行前预检失败，如缺料）后由调度器挂起，等待人工选择执行面给出的处理选项。
清单同时包含调度器在重启后接管的执行态未知 / 决策上下文丢失的 attempt，两者同形。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/error-decisions` | `{decisions: ErrorDecision[]}`（dev 时代的 `items` 已按 V1 改名） |
| POST | `/error-decisions/{decision_id}` | V1 `ErrorDecisionIn`；成功 `{decision_id, status: "delivered"}`；决策已不在等待 → 「不存在」业务码 4001 |

`ErrorDecision`：`decision_id` `device_id` `action_name` `task_id` `job_id` `node_id` `node_run_uuid`
`exception_type` `error_message` `traceback` `options[{id?, action, label, description}]`
`retry_count/max_retries` `created_at`（epoch 秒）`require_confirmation`，可选 `category`
（`preflight` = 动作尚未派发 / `execution`）、`stage`、`severity`、`error_info[]`（如 `{code: "inventory_shortage"}`），
以及执行面声明了决策超时时才有的 `expires_at` / `decision_timeout_seconds` / `default_on_decision_timeout`
（**已知缺口**：预检报错没有这三个字段，页面不显示倒计时）。

常见 `options[].action`：`retry`（补料或排除原因后重新预检 / 创建新 attempt）、`skip`、`abort`（放行
failed 结果）、`operator_intervention`（人工替换结果，正文带 `result`）。

POST 正文即 V1 `ErrorDecisionIn`：`action` / `option` / `result` / `reason` 均可选，`action` 不强制、不默认，
都不给时执行面按 V1 设备侧口径缺省 `abort`。页面只提交 Host 给出的 `options[].action`：

```json
{ "action": "retry", "option": { "action": "retry", "label": "重试" }, "reason": "operator_ui" }
```

dev 时代必须回带的 `job_id` / `device_id` / `scheduler_updated` 已删除。dev 扩展（可选）：请求头 `Idempotency-Key`
同键同内容重放首次结果（SDK `resolveErrorDecision(decision, body, { idempotencyKey })`），请求体 `operator_id`
记录操作员；物理结果未知的作业只允许补记或终止（3003）。

## 3. 工作流干预（interventions，V1 合同）

调度器把 attempt 标为待决时，在同一事务里开出一条干预（`workflow_intervention`），恢复或进入终态时 superseded。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/workflow-interventions?status=&limit=` | 全局列表（`open` / `selected` / `superseded`，limit 1..500）；按任务看就按 `workflow_task_uuid` 过滤 |
| GET | `/workflow-interventions/{uuid}` | 干预详情 |
| POST | `/workflow-interventions/{uuid}/decisions` | `{revision, option_id, result?}` + 请求头 `Idempotency-Key`（必填）；201 新决策 / 200 重放；未投递 3003，用同一键重试 |

- 干预字段：`revision`、`status`、`options[{id, action, label, description}]`、`resume_control_status`、
  `selected_option`（未决策时 `{}`）、`edge_command_uuid`（= 执行面 `decision_id`）、`delivery_status`、`opened_at`。
- 决策与 `/error-decisions` 走同一放行通道：**同一个待决动作失败既出现在 `/error-decisions`，也有一条干预**
  （`edge_command_uuid` 相同）。异常审批页按 `edge_command_uuid` 去重，只在「动作异常」里展示一次；
  只有不在决策台上的干预才单列「工作流干预」，按钮提交 `option_id`（SDK `decideIntervention(uuid, body, idempotencyKey)`）。
- 人工确认（`manual_confirm` 节点）不是干预：按作业提交 `POST /workflow-node-jobs/{job_uuid}/manual-confirmation`
  （`approve` / `reject`），见 [runtime.md §2.4](./runtime.md#24-graph-写入)。
