# OpenLab Edge API 规范（V1.0 合同）：请求格式与约定

本文是 OpenLab 前端与 Uni-Lab-OS 微后端之间 HTTP 协议的**规范性**文档：定义 URL、方法、
状态码、表示层、信封、错误、长操作、实时流、能力发现、版本兼容与契约治理。各协议域的
具体端点与 DTO 见同目录的域文档；`@openlab/protocol` 是本规范的类型化实现。

关键词 **必须（MUST）**、**不得（MUST NOT）**、**应当（SHOULD）**、**可以（MAY）** 按 RFC 2119
理解。规范与实现冲突时以本文为准并修实现；现存的历史例外集中列在附录 A，新增端点不得再扩大例外。

## 0. 参与方与契约真相

| 参与方 | 说明 |
| --- | --- |
| 浏览器 / OpenLab Web | 静态站（GitHub Pages 或任意静态托管），只消费本规范定义的 HTTP API |
| 微后端（默认拓扑） | `unilab`（默认 `:8002`）：调度权威进程持有管理端口（Workflow / Registry / Materials Authority），并看护不监听端口的 Host 子进程（设备执行面、遥测、历史、驱动包、受管进程）；Host 专有路由由权威经控制 WS 转交 |
| 调度权威进程 | `unilab --role backend`：Workflow Authority + Registry Authority，无设备执行面 |
| `@openlab/protocol` | 框架无关的类型、客户端与机器可读目录（`catalog.ts`），单独发包 |

- **契约真相是微后端从路由声明生成的 OpenAPI**。运行中的进程在 `GET /api/openapi.json`（`/api/docs`）
  给出本进程视角；`python -m unilabos.server.openapi_export` 离线导出**两种角色路由的全集**，每个
  operation 带 `x-openlab-role`。这份导出以快照形式提交在协议包
  `packages/protocol/openapi/unilabos-openapi.json`，并生成 TypeScript 类型
  （`src/generated/openapi.ts`，`@openlab/protocol/openapi`）。
- `catalog.ts` 是浏览器会调用的子集的登记（附带 OpenAPI 表达不了的 `mutates`、`summary` 与域归属）；
  契约校验保证：目录里每条操作都存在于导出、角色一致；导出里多出的操作要么进目录，要么显式列为
  Backend ↔ Edge 控制面（浏览器不得调用），要么列为「浏览器暂未采用」的 V1 控制台面（附理由，见
  [README §2.1](./README.md#21-浏览器暂未采用的-v1-控制台面)）。协议测试保证客户端方法 ↔ 目录一一对应。
- 后端路由、OpenAPI 快照、目录 / 客户端三者之一变更，其余**必须**同一变更集内跟上（§11 清单）。
  后端**应当**为响应声明 `response_model`（Pydantic），否则 OpenAPI 里只有请求体形状、没有响应形状，
  漂移只能靠人工对照（Workflow 域的行 DTO 目前就是这种情况）。

## 1. 总体模型

- **资源导向**：URL 指向集合与资源，动作用方法表达；只有无法映射到 CRUD 的领域动作
  （启动进程、应用候选、提交决策）才用 POST 动词子路径（§2.2）。
- **HTTP 是唯一真相**：所有状态可由 GET 完整恢复；SSE 只送失效通知（§7）。
- **权威分离**：写入口在权威所在进程；浏览器不得调用 Backend ↔ Edge 控制面路由
  （`catalog` 校验脚本硬性禁止，§11）。
- **能力而非版本探测**：页面按 `GET /api/v1/health` 与 404 / 503 / 信封 5001 判断"当前进程有没有这项能力"，
  而不是按 unilabos 版本号分叉（§8）。
- **管理 API 不鉴权**：读写请求都不带令牌（控制面 token 与 V1 工站 api_key 已在核心删除，§9）。

## 2. URL 与命名

### 2.1 前缀与版本

```text
http(s)://<host>:<port>/api/v1/<domain-collection>[/<identifier>[/<sub-collection>[/<identifier>]]][/<action>]
```

- 所有浏览器可调用路由**必须**以 `/api/v1/` 开头（`OPENLAB_API_PREFIX`）。唯一例外是 V1 进程管理的四条路由
  （`/v1/snapshot`、`/v1/operations`、`/v1/operations/{operation_id}`、`/v1/logs/{component}`，
  `OPENLAB_PROCESS_MANAGEMENT_PREFIX`），按 V1 原样不带 `/api`。首发前允许统一调整契约，
  不并行保留开发期协议；首发后的版本规则见 §10。
- 根路径 `/` 只给路标，微后端**不**托管前端页面。

### 2.2 路径

| 规则 | 示例 |
| --- | --- |
| 集合名用**复数、kebab-case** 名词 | `/workflow-tasks` `/driver-packages` `/device-processes` `/status-incidents` |
| 资源标识符用花括号占位，名字 **snake_case**、带类型后缀 | `{material_uuid}` `{task_uuid}` `{process_id}` `{name}` |
| 子资源表达从属关系，最多两级 | `/workflows/{workflow_uuid}/graph` `/workflow-node-jobs/{job_uuid}/results` |
| 领域动作 = `POST <资源>/<动词>`，动词用现在时原形 | `/device-processes/{process_id}/start` `/registry/entries/{name}/apply` `/driver-packages/{name}/graphs/{graph}/launch` |
| 只读的派生视图用名词子路径 | `/materials/instances/{material_uuid}/tree` `/graphs/live/payload` `/workflow-tasks/{task_uuid}/step-state` |
| 按业务键查询用 `by-<key>` 子集合 | `/materials/instances/by-resource-id/{resource_id}` `/materials/reservations/by-job/{job_uuid}` |
| 长操作的进度是独立资源 | `/driver-packages/operations/{operation_id}` |
| 不得在路径里放动词式 CRUD | ~~`/getWorkflow`~~ ~~`/materials/delete`~~ |

标识符规则：

- 权威分配的身份一律是 **RFC 4122 UUID 字符串**，字段名 `*_uuid`（`material_uuid`、`task_uuid`、
  `endpoint_uuid`）。DTO 自身的主键字段名为 `uuid`（Workflow 域）或 `<type>_uuid`（四库域）。
- 人可读的稳定键用 `id` / `name`（设备 `id`、驱动包 `name`、图 `name`），可以作为路径参数，
  但**不得**作为跨域引用键——跨域引用只用 uuid。
- 路径参数**必须**由客户端做 `encodeURIComponent`。

### 2.3 查询参数

- 名字 **snake_case**；布尔值字面量 `true` / `false`；数组用**重复键**（`?status=a&status=b`，
  不用 `status[]` 或逗号）。
- `undefined` 与空串**不得**发送（传输层统一剔除），后端把"未传"当作"不过滤 / 取默认"。
- 只读列表的通用参数：分页 `page` / `page_size`，窗口 `limit` / `offset`，账本游标 `after_sequence` / `after_id`（§4.4）；
  过滤参数与被过滤字段同名（`status`、`device_id`、`workflow_uuid`、`job_uuid`）。
- 昂贵的可选载荷用 `include_*` 开关，默认关（`GET /inventory/templates?include_definition=true` 才带 registry 全量定义）。

### 2.4 字段命名

- JSON 字段 **snake_case**；枚举值 **小写 snake_case**（`on_failure` 这类历史上用连字符的
  `on-failure` 属例外，见附录 A）。
- 布尔字段用形容词 / 助动词前缀：`enabled`、`installed`、`mounted`、`restart_required`、`dirs_exist`。
- 计数与数量带单位或后缀：`quantity_total`、`page_size`、`max_restarts`、`timeout_ms`。
- 时间字段见 §4.2。

## 3. 方法、状态码与幂等

### 3.1 方法语义

| 方法 | 语义 | 幂等 | 请求体 |
| --- | --- | --- | --- |
| GET | 读取，无副作用 | 是 | 无 |
| POST | 创建；或领域动作 | 否（借幂等键实现，§3.3） | JSON 或空 |
| PUT | **整体**替换 / 设定（`/enabled`、`/graph`、`/position`） | 是 | JSON |
| PATCH | 局部更新，只改给出的键 | 是 | JSON |
| DELETE | 删除或撤销（`DELETE /restart` = 取消重启） | 是 | 无 |

- 只有带正文时才发送 `Content-Type: application/json`；空体不得声明 JSON（Workflow 路由会把
  "JSON 头 + 空体" 判为 1000）。原始源码导入（`POST /local/workflows/import-python`）用
  `text/x-python` + `X-Workflow-Filename`。
- 服务端对未知字段**应当**忽略；V1 迁移后部分请求模型是严格的（`extra="forbid"`，未知字段 1000），
  库存命令的 `payload` 与类型化请求体逐字段比对（§5.6）。

### 3.2 状态码

V1 合同里**业务结果看信封 `code`，不看 HTTP 状态**：业务失败也是 HTTP 200（§5）。HTTP 状态只表达以下情形：

| 码 | 何时使用 | 正文 |
| --- | --- | --- |
| 200 | 读成功；同步写成功；**业务失败**（信封 `code != 0`）；Host 暂不可用（信封 5001 + `Retry-After`） | 信封 |
| 201 | 同步创建了新资源 / 受理了新命令（`POST /workflow-tasks`、任务命令、干预决策首次提交） | 信封 |
| 202 | 已接受、异步执行（`POST /driver-packages/install`、`DELETE /driver-packages/{name}`、`POST /v1/operations`） | 信封 |
| 404 / 405 | **路由未在本进程挂载**（含已删除的路由、未知 `/v1/*` 路径）/ 方法不对 | 信封 4001 / 1001（应用级兜底） |
| 503 | 进程级维护闸门（全量重置进行中）；`/readiness` 未就绪 | 信封 5001（readiness 的摘要在 `error.details`） |
| 500 | 服务端缺陷（未登记的异常） | 非信封 |

约定：

- 请求体校验失败与非法 JSON 是信封 1000（HTTP 200），不再有 FastAPI 422。
- **404 / 503 / 信封 5001 对客户端等价于"当前进程不支持 / 暂不可用该能力"**（`isCapabilityUnavailable(error)`），
  页面**必须**降级而非报障；资源不存在用业务码判断（3002 / 4001 / 6000…，`BackendBusinessError.isNotFound`）。
- 冲突与"不存在"的判定在服务层完成并映射成业务码（`server/api/envelope.py`），不得靠字符串猜测扩散到客户端。

### 3.3 幂等与并发

| 机制 | 用在哪 | 规则 |
| --- | --- | --- |
| `command_uuid` + `effect_key` | `POST /inventory/commands` 的 materials.v1 变更信封 | 同 `command_uuid` 重放返回首次 `MutationResult`（`replayed=true`）；客户端每次用户操作生成一次，重试复用 |
| `command_id` | `POST /inventory/commands` 的 V1 类型化命令 | 同 id 同请求重放首次结果（完成或拒绝），同 id 不同请求 3003 |
| `idempotency_key`（请求体） | 任务创建、任务命令、入口参数修改、人工确认（`decision_idempotency_key`） | 同键同语义只生效一次；同键不同内容 1000 / 3003 |
| `Idempotency-Key`（请求头） | 干预决策（必填）、动作异常决策（可选） | 201 新决策 / 200 重放；未投递 3003，用同一键重试 |
| `revision` 乐观锁 | Workflow Graph / IO / 发布 / 组合调用；Registry 条目；`/v1/operations` 的 `expectedRevision` | 不匹配 → 业务码 3003（`/v1/*` 的 `error.code` 为 `revision_conflict`） |
| `expected_revision`（可选） | 任务命令 | 给出时按 `control_revision` 校验，不符 3003 |
| `preconditions[]` / `expected_version` | materials.v1 变更信封 / 类型化命令 / 化学品 | `expected_version` / `expected_state_hash` 不满足即拒绝 |
| 名称去重 | 受管进程 `launch`、图 upsert | 同名视为同一资源：更新而非新建 |
| 自然幂等 | `PUT /enabled`、`POST /restart`（重复登记合并） | 重复调用结果一致 |

写请求**不得**自动重试（传输层只对 GET 做 5001 退避，§5.5）；用户重试时复用原幂等键。

## 4. 表示层

### 4.1 JSON

- `application/json; charset=utf-8`；不出现 `NaN` / `Infinity`；数字不用字符串包装。
- **可选字段两种写法，域内必须一致**：四库域（库存 / 遥测 / 历史）用显式 `null`；Workflow 域"DB NULL = 键缺席"
  （TS `?:`），消费方不得把缺席当空串。
- 大对象（registry 全量定义、`action_value_mappings`）**透传**：客户端类型为 `JsonObject`，
  不解构、不改写。

### 4.2 时间

- V1 合同对外的时间字段是 **ISO 8601 UTC 毫秒字符串**（`2026-11-12T08:00:00.000Z`）：Workflow Authority
  （`create_time`、`started_at`、`opened_at`、`deadline_at`）、进程管理（`submittedAt` 等）。
- dev 原样保留的 DTO 仍是 `*_at_ms`：**UTC epoch 毫秒整数**（`/inventory/*` 读到的物料 / 批次 / 账本、
  telemetry、`/edge/history`）。持续时间用 `*_ms` / `*_s` 显式带单位（`timeout_ms`、`heartbeat_interval`
  这种无单位名属历史例外）。
- epoch **秒**浮点（`hostlink.peers` 的 `connected_at` / `last_seen`、error-decisions 的 `created_at` /
  `expires_at`、`restart.requested_at`、V1 运行历史 `/history/*` 的 `submitted_at` 等）是历史例外（附录 A），
  新增字段不得沿用。
- 客户端**不得**按数量级猜单位，以协议包类型注释为准。

### 4.3 状态词汇

状态是权威的语言，前端只翻译不改写：

- 任务终态 `succeeded` / `failed` / `canceled` / `timeout`；节点作业与 attempt 状态同源；任务命令投影
  `pending` / `succeeded` / `rejected`；
- 物料 lifecycle：`active | reserved | in_use | quarantined | consumed | retired`；
- 受管进程：`stopped | starting | running | crashed | restarting`；
- 长操作：`running | succeeded | failed`；
- HostLink peer：`online` 是判活唯一依据，`connected` 只是 TCP 存活。

新增枚举值属于**加法变更**（§10），客户端遇到未知值必须原样展示、不崩。

### 4.4 列表、分页与游标

| 形态 | 参数 | 响应（信封 `data`） | 用途 |
| --- | --- | --- | --- |
| 页码分页 | `page`（≥1）、`page_size`（默认 20，上限 100） | `{items, has_more, page, page_size}`（dev 列表另带 `total`） | 人看的列表（workflows、tasks、task-presentations、graphs、chemicals、reports、node-templates、job feedback） |
| 窗口 | `limit`（不传 = 全量）、`offset`（默认 0） | 数组 | 单个父资源下的子记录（jobs、confirmations、results） |
| 具名数组 + `limit` | `limit`（≤ 500；`all=true` 不截断，dev 扩展） | `{instances: [...]}` / `{lots: [...]}` / `{templates: [...]}` … | `/inventory/*`；SDK 取出数组直接返回 |
| 账本游标 | `after_sequence` / `after_id`、`limit` | 数组，按 `sequence` 升序 | append-only 流：inventory ledger、telemetry events、edge history、runtime outbox |
| 快照 | 无 | 数组 / 对象 | 小而全的实时快照（endpoints、telemetry states、peers、monitor snapshot） |

- 列表默认排序由服务端固定并在域文档写明（通常按创建时间或 sequence）；v1 不提供自定义排序。
- 软删除记录默认不返回；需要时用显式开关（`include_terminal`）。
- 列表上限要按服务端裁剪处理：页码分页 `page_size` 超过 100 会被截到 100，前端不得假设拿到全集。

### 4.5 引用与展开

- 引用别的聚合只放 uuid（+ 必要的展示名），不内嵌整对象；需要跨域拼装时由前端
  `entity-cache` 解析，避免响应膨胀与循环。
- 树 / 图这类天然嵌套结构（物料树、node-link 图）整棵返回，并附一致性版本（`revision` / `state_hash`）。

## 5. 响应信封与错误

V1 合同：**全部 `/api/v1` JSON 路由都是 V1 信封**（`server/api/envelope.py`），只有 §5.4 列出的路由按 V1 设计不包信封。

### 5.1 V1 信封

```json
{ "code": 0, "data": { "...": "..." } }
{ "code": 0 }
{ "code": 3003, "error": { "msg": "任务控制版本已变化，请刷新后重试" } }
{ "code": 3003, "error": { "msg": "…", "code": "preflight_failed", "details": { "…": "…" } } }
```

- 成功 HTTP 200（创建类可 201），`code = 0`，无数据的命令可省略 `data`；
- 失败 HTTP 200，`error.msg` 是中文说明；`error.code` 是符号码，只在 V1 同路由也输出时出现
  （`workflow_identity_mismatch`、`preflight_failed`、`debug_not_allowed` …），`details` 与 V1 一致；
- 传输层统一解包：`code = 0` 返回 `data`，`code != 0` 抛 `BackendBusinessError`。新业务码只能追加，不得复用。

### 5.2 业务码

| code | 含义 | `BackendBusinessError` |
| --- | --- | --- |
| 0 | 成功 | — |
| 1 | 未归类内部错误 | — |
| 1000 | 参数或载荷不合法（含请求体校验、非法 JSON） | `isInvalidInput` |
| 1001 | 只读模式 / 调试不允许 / 设备动作不允许 | `isOperationNotAllowed` |
| 2005 | 数据库冲突 | `isConflict` |
| 3002 | 工作流或任务不存在 | `isNotFound` |
| 3003 | 状态冲突：修订过期、唯一键重复、状态不允许 | `isConflict` |
| 4000 | 试剂信息仍被引用 | `isConflict` |
| 4001 | 资源不存在（dev 时代的 4001 = 未授权；「未授权」码已随鉴权一起删除） | `isNotFound` |
| 4002 | 资源数据冲突（含物料「无变化」`no_change`） | `isConflict` |
| 5000 | 资源模板不存在 | `isNotFound` |
| 5001 | 依赖暂不可用（Host 启动 / 重启中，带 `Retry-After`）或部署不支持 | `isUnavailable` |
| 5003 / 5004 | 模板定义不合法 / 模板数据冲突 | — / `isConflict` |
| 6000–6011 | 物料：不存在、模板不存在或不可变、父级不存在或成环、库位不存在或已占用、模板不允许、库位成环、身份冲突、活动占用冲突 | `isNotFound` / `isConflict` 按码区分 |

常量见协议包 `BACKEND_BUSINESS_CODES`。页面按类别（`isNotFound` / `isConflict` / `isUnavailable`）处理，
不依赖单个数字；工作流域用 3002 / 3003，资源与化学品域用 4001 / 4002，物料约束用 6xxx。

### 5.3 仍用 HTTP 状态表达的情形

- 全量重置维护闸门：HTTP 503 + 信封 5001；
- `/readiness` 未就绪：HTTP 503 + 信封 5001（`error.code = "not_ready"`，摘要在 `error.details`）；
- 路由未匹配：HTTP 404 + 信封 4001（方法不对 405 + 1001）；
- 服务端缺陷：HTTP 500。

这些抛 `ApiError`，正文里的业务码在 `ApiError.businessCode`。

### 5.4 信封覆盖面

**全部 JSON 路由都是信封**，没有例外清单（`catalog.ts` 不再有 `raw` 标记，校验脚本据此拒绝任何 `raw` 声明）：

| 路由 | 成功 | 失败 |
| --- | --- | --- |
| `GET /api/v1/health` | `data` = `status` / `scheduler` / `scheduler_mode` / `execution` / `unavailable_devices?`（恒 HTTP 200） | — |
| `GET /api/v1/readiness` | HTTP 200 + `data` = 就绪摘要 | HTTP 503 + 5001，摘要在 `error.details`；SDK 把它当正常回答返回摘要 |
| `POST /api/v1/inventory/commands` | `data` = `{command_id, status: "completed", result, replayed}` | HTTP 200 + `{code: <业务码>, error: {msg, code: <error_code>, details: {command_id, replayed}}}` → `InventoryCommandRejectedError`（§5.6） |
| `/v1/snapshot` `/v1/operations[/{id}]` `/v1/logs/{component}` | `data`（提交操作 HTTP 202） | HTTP 200 + 信封，V1 符号码（`operation_not_found` / `operation_conflict` / `revision_conflict` / `component_unavailable` …）在 `error.code` → `BackendBusinessError.symbol` |

只有 SSE 与文件下载不包信封（`RequestConfig.raw` 留给后者，目录里的 JSON 路由都不用它）。

### 5.5 Host 暂不可用：5001 + `Retry-After`

默认拓扑里 Host 专有路由（runtime / telemetry / device-state / edge/history / hostlink / status-incidents /
driver-packages / device-processes …）由调度权威转交给 Host 子进程。Host 启动或安静点重启期间这些路由返回
**HTTP 200 + 信封 5001 + `Retry-After: 3`**：

- 传输层对 **GET** 有限退避重试（`unavailableRetry`，默认 2 次，每次等待 `Retry-After` 但不超过 3 s；
  跨源时浏览器读不到 `Retry-After`，按 1 s）；重试用尽仍是 5001 时抛出，页面按「暂不可用」降级，
  下一轮轮询自然收敛；
- **写请求从不自动重试**：5001 直接抛给页面，由用户确认后用原幂等键重试；
- 后端 CORS `expose_headers` 含 `Retry-After`，跨源页面也能按建议间隔等待。

### 5.6 库存写入：`POST /inventory/commands`

物料的全部写入（模板、建树、出库实例化、标识 / 内容物 / 位置修改、删除、移动、转运、批次入库…）只有这一个入口。
两类命令共用：

```json
{
  "protocol_version": "materials.v1",
  "command_uuid": "9d1d…", "effect_key": "patch_material:9d1d…",
  "operation": "patch_material", "actor_type": "human", "actor_uuid": null,
  "observed_at_ms": 1788440000000,
  "preconditions": [ { "aggregate_type": "material", "aggregate_uuid": "…", "expected_state_hash": "…" } ],
  "target_uuid": "<原路径参数：patch / put_data / put_position 的物料 uuid>",
  "payload": { "name": null, "barcode": "BC-1", "lifecycle_status": null, "…": "…" }
}
```

```json
{ "command_id": "…", "type": "material.move", "payload": { "…": "…" }, "expected_version": 3, "actor": "…" }
```

```json
{ "command_id": "9d1d…", "status": "completed", "replayed": false,
  "result": { "protocol_version": "materials.v1", "replayed": false, "changed": true,
              "ledger_sequence_start": 1201, "ledger_sequence_end": 1203, "affected": [ "…" ], "data": { "…": "聚合读模型" } } }
{ "command_id": "…", "status": "rejected", "error": "site occupied", "error_code": "conflict:site_occupied", "code": 6007 }
```

- materials.v1 变更：`payload` 与该 operation 的类型化请求体**完整 dump 严格比对**——每个字段都要显式给出
  （与后端缺省值一致），否则 1000 `mutation.payload differs from the typed request body`。客户端只能经
  `inventory.*` 写方法提交（内部用 `materialsMutation()` 构造信封并补齐全部字段）。
- `operation` 取值由服务端定义（`put_template`、`instantiate_material`、`create_material_tree`、`patch_material`、
  `put_data`、`put_position`、`delete_material`、`move_material`、`transfer_material`、`inbound_inventory_lot`…），前端不得自造。
- `actor_type` 取值为服务端 `KNOWN_ACTOR_TYPES`；浏览器 / 操作员发起的写操作**必须**显式携带
  `human`（`materialsMutation()` 默认值），不依赖服务端默认值 `edge`。
- V1 类型化命令（`reagent.dispense`、`inventory.*`、`material.*`、`content.*`、`source.*`）经 `inventory.typedCommand()`；
  `expected_version` 对实例是物料版本、对内容物是 `content_version`、对批次是批次版本。
- 原样提交、自己按 `status` 判断用 `inventory.command(body)`（不抛业务拒绝）。

### 5.7 客户端错误归一

| 类 | 何时 | 关键属性 |
| --- | --- | --- |
| `ApiError` | 网络失败（`status=0`）或非 2xx | `status`、`body`、`businessCode`、`retryAfterMs`、`isNetwork`、`isUnsupported`（404/503） |
| `BackendBusinessError` | 信封 `code != 0` | `code`、`symbol`、`details`、`httpStatus`、`retryAfterMs`、`isNotFound`、`isConflict`、`isInvalidInput`、`isOperationNotAllowed`、`isUnavailable` |
| `InventoryCommandRejectedError` | 库存命令被拒（失败信封带 `error.details.command_id`，继承 `BackendBusinessError`） | `result`（还原的拒绝结果）、`details.command_id` / `replayed` |
| `TaskCommandRejectedError` | 任务命令投影 `status = "rejected"`（继承 `BackendBusinessError`，code 3003） | `command`、`reason`（`result.reason`） |

页面层只依赖这些类与 `isCapabilityUnavailable(error)`；`describeError()` 负责成文案。

## 6. 长操作（异步）

用于驱动包下载、依赖安装这类可能跑几分钟的动作：

```text
POST /driver-packages/install ─202─▶ operation{status: running}
GET  /driver-packages/operations/{operation_id} ──轮询（1–2 s）──▶ succeeded | failed
```

- operation 资源字段：`operation_id`、`kind`、`spec`、`status`、`package_name`、`started_at_ms`、
  `finished_at_ms`、`log`（尾部截断，≤ 20 KB）、`error`、`result`。
- 终态不可变；历史保留最近 N 条（当前 30）。**不得**用 HTTP 长轮询或阻塞请求代替。
- 需要重启才生效的变更用**状态字段**表达（`inventory.restart_required`），由客户端显式发起
  `POST /restart {mode, scope}`；重启协调器负责暂停派发、等待 active job、拉起替代进程。
- 中断或待人工确认的驱动包操作经 `POST /driver-packages/operations/{id}/confirm | recover`
  （`{expected_version, reason}`）推进，不重新提交安装。
- V1 进程管理同一模式：`POST /v1/operations {operationId, command, parameters, expectedRevision?}` → 202，
  `GET /v1/operations/{operationId}` 轮询到终态；`operationId` 由调用方生成并作为幂等键。

## 7. 实时（SSE）

| 流 | 事件 | 续传 |
| --- | --- | --- |
| `GET /api/v1/events` | `workflow.runtime.changed`（`data.kind`：`task` / `node_run` / `node_job` / `manual_confirmation` / `resource`，原载荷字段保留）、`workflow.authoring.changed`（`data.kind`：`workflow` / `definition`）、`station.error_handling.changed`（`data.station_id`） | `Last-Event-ID`；首连不重放，先发水位帧；显式 `0` 回放保留历史 |
| 同一 `GET /api/v1/events` | `stream.reset`（`data.reason`：`cursor_ahead` / `cursor_expired`） | 新水位写在 `id`；客户端必须重读 HTTP，不能当成业务变更 |
| 同一 `GET /api/v1/events` | `runtime.logs.changed` | 瞬时通知，不写 SSE id；重连按 HTTP 日志游标补读（不在 V1 合同里，保持原名） |
| `GET /api/v1/materials/events` | `materials.changed`（携带 ledger sequence） | `Last-Event-ID`；首连不重放（不在 V1 合同里，保持原名） |

- 事件名常量：`WORKFLOW_RUNTIME_CHANGED_EVENT` / `WORKFLOW_AUTHORING_CHANGED_EVENT` /
  `STATION_ERROR_HANDLING_CHANGED_EVENT` / `STREAM_RESET_EVENT`（合集 `WORKFLOW_EVENT_NAMES`）、
  `RUNTIME_LOG_NOTICE_EVENT`、`MATERIALS_CHANGED_EVENT`。dev 时代的 `workflow.task.changed` 等细粒度名不再发出。
- 事件**只是失效通知**：正文不含业务数据（`data.kind` 只用于粗分，页面不得据此跳过 HTTP 重读）。
- 没有 SSE 的域按 3–8 s 轮询，页面可见性恢复时立即刷新。
- 实时日志页复用 `/events`，收到来源索引后有界增量读取；空闲不查询，隐藏/暂停不读取。
  不新增长连接，读取与窗口上限见 [logs.md](./logs.md)。
- 浏览器同源连接数有限（HTTP/1.1 每源 6 条）：一个页面**至多**各打开一条流，跨 tab 复用由应用层保证。
- V1 的四通道 `GET /monitor/events` 不进浏览器目录（「暂未采用」）。新增流必须登记到 `catalog.ts`
  （`method: "SSE"`）并更新校验脚本的 SSE 清单。

## 8. 能力发现与进程角色

```json
GET /api/v1/health → { "status": "ok", "scheduler": "ready" | "disabled", "scheduler_mode": "local" | "remote",
                       "execution": "ready" | "restarting" | "disabled", "unavailable_devices"?: [...] }
GET /api/v1/readiness → 200 | 503 { "status": "ready" | "starting" | "failed", "capabilities": {...},
                       "phase": "ready" | "execution_starting" | "host_restarting" | "dispatch_paused",
                       "workflowRuntime": "ready" | "disabled", "scheduler", "execution", "reasons": [] }
```

| 能力 | 判定 |
| --- | --- |
| 可创建 / 运行工作流 | `scheduler_mode == "local"` |
| 设备、遥测、人工决策、驱动包、受管进程 | `execution == "ready"`（`restarting` 时 Host 专有路由返回 5001） |
| 能否接收并执行任务 | `readiness.status == "ready"`；未就绪原因看 `phase` / `reasons` |
| Registry Authority | 默认本机调度 Host 与 `--role backend` 均提供；远端受控 Edge 不挂载 |

- `catalog.ts` 每条操作标注 `role: host | backend | any`；校验脚本强制 decisions /
  driver-packages / device-processes 为 `host`，registry 跟随调度权威并标为 `any`。
- 未挂载的路由返回 404，Host 不在线时返回信封 5001；客户端按 §3.2 降级，页面给出"连接另一角色进程 / 等待 Host"的提示。

## 9. 传输与安全

- v1 面向**实验室局域网**；远程访问通过反向代理 / 隧道，并由代理层做 TLS 与访问控制。
- **不鉴权**：管理 API（含 `/v1/*`、SSE）不校验任何令牌。控制面 token（`X-UniLab-Token`、`unilab token`、
  `<working_dir>/control_token`）与 V1 工站 `Authorization: Bearer <station_api_key>` 都已在核心删除，旧客户端带来的
  这两个头被忽略；业务码 1002 随之删除。访问控制交给网络边界（局域网 / 反向代理）。
- OpenLab 接受落地页链接 `#/?backend=<地址>` 导入后端地址（导入后从地址栏去掉）。
- CORS 默认放行所有来源（`BasicConfig.cors_allow_origins` 可收窄），允许头含 `Idempotency-Key`、
  `X-Workflow-Filename`；`expose_headers` 含 `Retry-After`（§5.5）。
- 页面由 HTTPS 站点（GitHub Pages）托管、微后端是 `http://` 时，浏览器按混合内容规则处理：
  - `http://127.0.0.1` / `localhost` 是「可信来源」，Chrome / Edge / Firefox 放行，Safari 拦截；
  - `http://192.168.x.x` 等局域网地址默认拦截。用户可在浏览器「网站设置 → 不安全内容 → 允许」
    为本站放行，或在 Windows 上用 `netsh interface portproxy` 把远端端口映射到本机 127.0.0.1，
    或改用 `http://` 打开页面 / 由反向代理把 `/api` 反代成同源。连接面板检测到这种地址会直接给出上述步骤。
  - 微后端对带 `Access-Control-Request-Private-Network: true` 的预检回 `Access-Control-Allow-Private-Network: true`，
    满足 Chrome 的 Private Network Access 要求。
- 端口由 `unilab --port` 决定（默认 8002），页面在连接面板填写；同源反代场景自动探测。
- 客户端默认超时 10 s；健康探测 4 s；长操作不靠超时而靠 operation 轮询。
- 微后端不写 Cookie、不依赖会话；读请求可重放，写请求按 §3.3 的幂等键重放。

## 10. 版本与兼容

当前尚未发布首个微后端协议版本：开发期端点、字段及前端存储可以直接收敛，不保留旧接口回退、
自动迁移或升级提示分支；前后端必须使用同一契约。`legacy` 是连接旧后端的独立适配层，保持不变。
下表是首次正式发布后的版本规则，不要求为尚未发布的代码建立兼容层。

| 层 | 版本载体 | 规则 |
| --- | --- | --- |
| 线上协议 | 路径 `/api/v1` | 只做**加法变更**（新端点、新可选字段、新枚举值）；删除 / 改名 / 改语义 = 新大版本 |
| `@openlab/protocol` | npm semver，`OPENLAB_PROTOCOL_VERSION` 与 `package.json.version` 必须一致（有测试守护） | major：线上协议大版本变更或客户端 API 不兼容；minor：新端点 / 字段；patch：客户端修复 |
| unilabos | `unilabos.__version__` | 发布说明列出协议影响；新增端点先发 unilabos，再发协议包 |

- **正式发布后的废弃流程**：字段 / 端点先在 OpenAPI `description` 与域文档标 `Deprecated`，协议包类型加 `@deprecated`，
  至少保留一个 unilabos 小版本后才可移除（同时升大版本）。
- 客户端**必须**容忍未知字段与未知枚举值；服务端**必须**容忍缺失的新可选字段。
- 兼容矩阵在 `packages/protocol/CHANGELOG.md` 维护：每个协议包版本注明最低 unilabos 版本。

## 11. 契约治理：新增或修改一个端点

一次变更集必须同时包含：

1. 微后端路由（`unilabos/server/api/…`，用 `envelope_router` 创建；只有文件下载等非 JSON 端点标 `@raw_response`）与
   服务层错误映射（`envelope.py` 业务码，§5.2）；角色专属路由登记到 `unilabos/server/openapi_export.py` 的前缀表；
   请求 / 响应声明 Pydantic 模型；
2. 后端测试（`tests/server/`）；
3. 同步契约快照：`pnpm --filter @openlab/protocol openapi:sync`（调用导出器，重生成
   `openapi/unilabos-openapi.json` 与 `src/generated/openapi.ts`，二者随包提交）；
4. `packages/protocol/src/<domain>.ts` 的类型与方法（方法名 = 资源 + 动作，驼峰；有生成类型时
   请求体优先复用 `OpenApiComponents["schemas"][…]`）；
5. `catalog.ts` 登记（`id` = `<domain>.<resource>.<action>`，`role`、`mutates` 正确）；
   浏览器不该调用的新路由登记到 `scripts/validate-contract.mjs` 的 `CONTROL_PLANE_OPERATIONS`，浏览器可调用但
   OpenLabSite 暂不使用的登记到 `UNADOPTED_GROUPS`（附理由）；
6. 域覆盖测试（客户端 ↔ 目录双向比对）；
7. `docs/protocol/<domain>.md` 与（如涉及）本文附录 A；
8. `scripts/live-smoke.mjs` 读路径（可选写路径）。

`pnpm run protocol:check` 强制：域必须在白名单；`id` 必须以域名为前缀；路径前缀为 `/api/v1/`
（`process-management` 为 `/v1/`）；GET / SSE 不得 `mutates: true`；同一 `方法 + 路径` 只能登记一次；
没有任何操作声明 `raw`（全部 JSON 路由都是信封）；目录 ⊆ OpenAPI 导出且角色一致；
OpenAPI 导出 = 目录 ∪ 控制面清单 ∪ 暂未采用清单（多一条、少一条都失败）；三份清单互不重叠。

页面侧红线（见 README §6）：只经 `api.domains.*` 调用；不手写 `/api/v1/…`；不改写状态词汇；
不把 SSE 正文当数据；人工决策只提交 Host 给出的选项。

## 附录 A：历史例外（冻结，不得扩大）

| 例外 | 位置 | 说明 |
| --- | --- | --- |
| epoch 秒时间戳 | `hostlink.peers[].connected_at / last_seen`、`error-decisions[].created_at / expires_at`、`restart.requested_at`、V1 运行历史 `/history/*` | 诊断 / 决策域早期契约；运行历史按 V1 原样 |
| epoch 毫秒 `*_at_ms` | `/inventory/*` 读到的 dev 物料 DTO、telemetry、`/edge/history` | dev 原样保留，V1 字段约定（ISO）只覆盖迁移过的路由 |
| 无单位的持续时间名 | `HostLinkConfig.heartbeat_interval`、`decision_timeout_seconds` | 值单位为秒 |
| 连字符枚举 | `device-processes.restart_policy = on-failure` | 与 systemd / Docker 习惯一致 |
| Workflow 域"键缺席 = 空" | Workflow 域全部 DTO | 与四库域的显式 `null` 不同 |
| 主键字段名 | Workflow 域 `uuid`；四库域 `<type>_uuid`（`/inventory/*` 另附 V1 别名 `edge_uuid` / `lot_id` / `template_id` / `reservation_id`） | 并存 |
| 严格比对的写体 | `/inventory/commands` 的 materials.v1 `payload` | 有意为之（防止半更新），非疏漏 |
| 不包信封 | `/health`、`/readiness`、`POST /inventory/commands`、`/v1/*` | V1 原样（§5.4） |
| 无 `/api` 前缀 | `/v1/*` 进程管理 | V1 原样（原 Workspace Host 合同） |

## 附录 B：术语

| 术语 | 含义 |
| --- | --- |
| Edge / Host | 带设备执行面的 `unilab` 进程 |
| Backend（调度权威） | `--role backend` 进程或云端；持有 Workflow Authority |
| 权威（Authority） | 某类事实的唯一写入口与真相来源（物料权威、Graph Authority、Workflow Authority、Registry Authority） |
| 域（domain） | 一组路由 + 一份客户端文件 + 一段目录；对应 `unilabos/server/api/` 的一个模块 |
| V1 信封 | §5 的响应形态（全部 JSON 路由） |
| 长操作 | 202 + operation 资源 + 轮询（§6） |
| 失效通知 | SSE 事件，只表示"某物变了"，不带正文（§7） |
