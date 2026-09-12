# telemetry.db / history.db / 四库调试面

## 1. telemetry.v1（`/api/v1/telemetry/*`，直出 DTO）

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

## 2. history.v1（`/api/v1/history/*`，直出 DTO）

统一 append-only 历史流。`sequence` 是全局单调序号，分页只用 `after_sequence`。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/history/events?after_sequence=&limit=&event_types=&job_uuid=&device_uuid=&event_key=&occurred_from_ms=&occurred_through_ms=` | 事件流；`event_types` 可重复传 |
| GET | `/history/events/{event_uuid}` | 事件详情 |
| GET | `/history/events/{event_uuid}/replacement-chain` | 人工替换结果的审计链 |
| GET | `/history/payloads/{payload_uuid}` | 事件引用的不可变 payload；`inline_payload` 为 Base64 |

`event_type`：`job_transition` `action_availability` `job_feedback` `job_result` `job_log`
`error_snapshot` `decision_audit`。`summary` 是结构化摘要，正文（大结果 / traceback）
经 `payload_uuid` 引用。历史页用类型 chips + 设备 / 作业过滤，抽屉里解码 payload。

## 3. 四库调试面（`/api/v1/debug/*`，直出 DTO）

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/debug/databases` | `{root, databases[{database, path, exists, size_bytes, tables[{name, rows}]}]}` |
| GET | `/debug/databases/{database}/tables/{table}?limit=&offset=&order=&descending=` | `{columns[{name,type,pk}], total_rows, rows[]}`；默认按 rowid 倒序 |

`mode=ro` 短连接直接读 SQLite 文件：没有 SQL 入口、没有写路径，BLOB 只回长度占位。
表清单来自实时 `sqlite_master`，前端不再维护静态表清单；数据库浏览页只是排障 / 核对窗口，
业务写入回到对应页面走领域 API。
