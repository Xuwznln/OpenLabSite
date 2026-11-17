# telemetry.db / history.db / 四库调试面 / 进程管理

telemetry / device-state / edge history 都在 Host 子进程的库里（Host 专有路由，经调度权威转交）：V1 信封，
Host 启动 / 重启期间返回 HTTP 200 + 5001 + `Retry-After`，GET 由传输层有限退避重试，仍不可用时页面显示「暂不可用」。

## 1. telemetry.v1（`/api/v1/telemetry/*`）

设备把状态推给微后端（`POST /telemetry/events`，控制面，浏览器不调用）；微后端维护
每个 `(endpoint_uuid, device_uuid)` 的最新快照并追加事件。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/telemetry/states?endpoint_uuid=` | `DeviceStateLatest[]`：`properties`（registry `@property` 状态字段）、`state`、`connection_state`、`alarms`、`observed_at_ms`、`version` |
| GET | `/telemetry/states/{endpoint_uuid}/{device_uuid}` | 单设备最新快照 |
| GET | `/telemetry/events?device_uuid=&event_type=&observed_from_ms=&limit=` | 追加事件（`state` `property_sample` `connection` `alarm`）；`payload` 为 `{property, value}` 或整份状态 |
| GET | `/telemetry/events/{event_uuid}` | 事件详情 |
| GET | `/telemetry/sources/{endpoint_uuid}/cursor` | 来源游标（epoch / generation / sequence） |

设备页把 `properties` 渲染为实时属性条，点击属性用 `property_sample` 事件画历史曲线
（数值折线 / 状态阶梯）；总览页的「收藏指标」从同一快照取值。

### 1.1 V1 设备状态视图（`device-state` 域，`/api/v1/device-state*`）

V1 的标量属性视图，同样在 Host 的 telemetry.db，值变化时追加一条历史。`POST /device-state/report` 是设备侧写入（控制面）。

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/device-state` | `deviceState.all()` | 全量设备属性当前值 + 存储统计（`{devices, stats}`） |
| GET | `/device-state/history?since_ms=&limit=` | `deviceState.history()` | 跨设备 / 属性的最近变化点（新 → 旧） |
| GET | `/device-state/{device_id}` | `deviceState.device(id)` | 单台设备属性当前值；没有记录 4001 |
| GET | `/device-state/{device_id}/history?property=` | `deviceState.propertyHistory(id, property)` | 单属性变化轨迹 |

页面目前仍以 telemetry-v1 为主数据源；device-state 供需要 V1 形状的视图使用。

## 2. history.v1（`/api/v1/edge/history/*`）

Host 的统一 append-only 历史流（history.db）。V1 合同把 `/api/v1/history/*` 让给了调度权威的工作流运行历史
（`run-history` 域，见 [runtime.md §3](./runtime.md#3-v1-运行历史与调度观测)），本存储整体搬到 `/edge/history/*`，DTO 不变。
`sequence` 是全局单调序号，分页只用 `after_sequence`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/edge/history/events?after_sequence=&limit=&event_types=&job_uuid=&device_uuid=&event_key=&occurred_from_ms=&occurred_through_ms=` | 事件流；`event_types` 可重复传 |
| GET | `/edge/history/events/{event_uuid}` | 事件详情 |
| GET | `/edge/history/events/{event_uuid}/replacement-chain` | 人工替换结果的审计链 |
| GET | `/edge/history/payloads/{payload_uuid}` | 事件引用的不可变 payload；`inline_payload` 为 Base64 |

追加写入（`POST /edge/history/events|payloads`、替换）是 Host ↔ 权威的控制面，浏览器不调用。

`event_type`：`job_transition` `action_availability` `job_feedback` `job_result` `job_log`
`error_snapshot` `decision_audit`。`summary` 是结构化摘要，正文（大结果 / traceback）
经 `payload_uuid` 引用。历史页用类型 chips + 设备 / 作业过滤，抽屉里解码 payload；Host 不在线（5001）时
事件流区域显示「暂不可用」，下方任务归档（Workflow Authority）与 V1 运行历史统计（`runHistory.workflows().stats`）照常显示。

## 3. 四库调试面（`/api/v1/debug/*`）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/debug/databases` | `{root, databases[{database, path, exists, size_bytes, tables[{name, rows}]}]}` |
| GET | `/debug/databases/{database}/tables/{table}?limit=&offset=&order=&descending=` | `{columns[{name,type,pk}], total_rows, rows[]}`；默认按 rowid 倒序 |

`mode=ro` 短连接直接读 SQLite 文件：没有 SQL 入口、没有写路径，BLOB 只回长度占位。
表清单来自实时 `sqlite_master`，前端不再维护静态表清单；数据库浏览页只是排障 / 核对窗口，
业务写入回到对应页面走领域 API。

## 4. V1 进程管理（`process-management` 域，`/v1/*`）

原 V1 Workspace Host 合同，挂在调度权威的管理应用上（`server/api/process_management.py`）。路径**不带 `/api` 前缀**，
成功是**裸 JSON**，失败是 HTTP 状态 + `{"error": {"code", "message", "details?"}}`（不存在 404、`operation_conflict` /
`revision_conflict` 409、其余 400、日志暂不可读 503 `component_unavailable`），SDK 抛 `ApiError`。

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/v1/snapshot` | `processManagement.snapshot()` | `{schemaVersion: "unilab-workspace-host/v1", revision, eventCursor, host, configuration, components, updatedAt}`；`components` 是按名字的映射：`backend`（调度权威）、`edge`（Host）、`managed:<process_id>`、恒为 idle 的 `plc` / `renderer` |
| POST | `/v1/operations` | `processManagement.submitOperation({operationId, command, parameters?, expectedRevision?})` | 受理操作（202）；`operationId` 由调用方生成并作为幂等键；命令见 `configuration.commands`（`workspace.*` / `scheduler.drain\|resume` / `device-process.*` / `driver-package.*` / `material.layout.*`…） |
| GET | `/v1/operations/{operation_id}` | `processManagement.operation(id)` | 轮询操作阶段与结果 / 错误 |
| GET | `/v1/logs/{component}?maxBytes=` | `processManagement.logs(component, maxBytes?)` | 组件日志尾部（`{component, logPath, content}`；读取端单次最多 256 KiB / 1000 行） |

时间字段（`submittedAt` 等）是 ISO 8601 UTC 毫秒。OpenLabSite 目前只在 live smoke 里读快照；系统页的重启与日志仍走
system 域（`/restart`、`/hostlink/logs`）。
