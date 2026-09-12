# 人工决策：状态告警与动作异常

两类需要操作员介入的执行端事件都由带执行面的 Host 进程持有（`health.execution=ready`），
FastAPI 直出 DTO，REST 快照为权威，页面以轮询 + 可见性恢复收敛。
`--role backend` 进程返回 503，页面整面板置灰并提示连接 Host。

## 1. 状态告警（status-incidents）

设备属性命中联锁策略时暂停新任务派发，等待决策；超时保持暂停（不自动执行任何动作），
属性自愈时 incident 自动 `cleared`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/status-incidents?device_id=&include_terminal=` | `{host_ready, incidents[], holds[]}`；`host_ready=false` 时两数组必为空（HostNode 启动中） |
| POST | `/status-incidents/{incident_id}` | `{action, option?, reason?}`；`action` 必须是该 incident `options[].action` 之一（`execute_recovery` / `resume`），否则 422 |

- `incident.mode`：`interlock`（产生 hold，压住调度）/ `notify`（只提醒，`hold_token=""`）；
- `incident.state`：`awaiting_decision → recovering → resolved`，或属性自愈 `cleared`；
- `options[].recovery_action` 只读展示，由 Host 经 ActionClient 执行，浏览器不得调用或改参；
- POST 回执 `{status:"delivered", state}`：delivered 只表示受理，恢复是否成功以后续 GET 为准；
- 404 = 不存在 / 已终态 / 被他人处理，重新 GET 收敛；409 = 已有恢复在执行。

## 2. 动作异常（error-decisions）

动作执行失败后由微后端挂起（不是执行器），等待人工选择 Host 给出的处理选项。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/error-decisions` | `{items: ErrorDecision[]}` |
| POST | `/error-decisions/{decision_id}` | 见下；409 = 已被处理或不再挂起 |

`ErrorDecision`：`decision_id` `device_id` `action_name` `task_id` `job_id` `node_id`
`exception_type` `error_message` `traceback` `options[{action,label,description}]`
`retry_count/max_retries` `created_at` `expires_at`（epoch 秒）`decision_timeout_seconds`
`default_on_decision_timeout` `require_confirmation`，可选 `category` / `severity`。

常见 `options[].action`：`retry`（Backend 更新调度并创建新 attempt）、`abort`（放行
failed 结果）、`skip`、`operator_intervention`（人工替换结果，正文带 `result`）。

POST 正文必须回带 `job_id` 与 `device_id`（微后端以此校验放行目标）并声明
`scheduler_updated: true`；协议客户端 `resolveErrorDecision(decision, body)` 自动补齐：

```json
{
  "scheduler_updated": true,
  "job_id": "<decision.job_id>",
  "device_id": "<decision.device_id>",
  "action": "retry",
  "option": { "action": "retry", "label": "重试" },
  "reason": "operator_ui"
}
```

## 3. 工作流干预（interventions）

调度器把任务置为 `control_status=waiting_intervention` 时，`GET
/workflow-tasks/{uuid}/interventions` 给出 `status=open` 的干预记录（选项、revision、
恢复控制态）。异常审批页聚合展示并跳转任务运行时；决策入口随 Workflow Authority 的
干预 API 一并提供时再接入，页面不自行拼装。
