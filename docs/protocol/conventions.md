# OpenLab Edge API 规范（v1）：请求格式与约定

本文是 OpenLab 前端与 Uni-Lab-OS 微后端之间 HTTP 协议的**规范性**文档：定义 URL、方法、
状态码、表示层、信封、错误、长操作、实时流、能力发现、版本兼容与契约治理。各协议域的
具体端点与 DTO 见同目录的域文档；`@openlab/protocol` 是本规范的类型化实现。

关键词 **必须（MUST）**、**不得（MUST NOT）**、**应当（SHOULD）**、**可以（MAY）** 按 RFC 2119
理解。规范与实现冲突时以本文为准并修实现；现存的历史例外集中列在附录 A，新增端点不得再扩大例外。

## 0. 参与方与契约真相

| 参与方 | 说明 |
| --- | --- |
| 浏览器 / OpenLab Web | 静态站（GitHub Pages 或任意静态托管），只消费本规范定义的 HTTP API |
| 微后端（Host 进程） | `unilab`（默认 `:8002`）：设备执行面 + 四库权威 + 本机调度时的 Workflow Authority |
| 调度权威进程 | `unilab --role backend`：Workflow Authority + Registry Authority，无设备执行面 |
| `@openlab/protocol` | 框架无关的类型、客户端与机器可读目录（`catalog.ts`），单独发包 |

- **契约真相是微后端从路由声明生成的 OpenAPI**。运行中的进程在 `GET /api/openapi.json`（`/api/docs`）
  给出本进程视角；`python -m unilabos.server.openapi_export` 离线导出**两种角色路由的全集**，每个
  operation 带 `x-openlab-role`。这份导出以快照形式提交在协议包
  `packages/protocol/openapi/unilabos-openapi.json`，并生成 TypeScript 类型
  （`src/generated/openapi.ts`，`@openlab/protocol/openapi`）。
- `catalog.ts` 是浏览器会调用的子集的登记（附带 OpenAPI 表达不了的 `mutates`、`summary` 与域归属）；
  契约校验保证：目录里每条操作都存在于导出、角色一致；导出里多出的操作要么进目录，要么显式列为
  Backend ↔ Edge 控制面（浏览器不得调用）。协议测试保证客户端方法 ↔ 目录一一对应。
- 后端路由、OpenAPI 快照、目录 / 客户端三者之一变更，其余**必须**同一变更集内跟上（§11 清单）。
  后端**应当**为响应声明 `response_model`（Pydantic），否则 OpenAPI 里只有请求体形状、没有响应形状，
  漂移只能靠人工对照（Workflow 域的行 DTO 目前就是这种情况）。

## 1. 总体模型

- **资源导向**：URL 指向集合与资源，动作用方法表达；只有无法映射到 CRUD 的领域动作
  （启动进程、应用候选、提交决策）才用 POST 动词子路径（§2.2）。
- **HTTP 是唯一真相**：所有状态可由 GET 完整恢复；SSE 只送失效通知（§7）。
- **权威分离**：写入口在权威所在进程；浏览器不得调用 Backend ↔ Edge 控制面路由
  （`catalog` 校验脚本硬性禁止，§11）。
- **能力而非版本探测**：页面按 `GET /api/v1/health` 与 404/503 判断"当前进程有没有这项能力"，
  而不是按 unilabos 版本号分叉（§8）。

## 2. URL 与命名

### 2.1 前缀与版本

```text
http(s)://<host>:<port>/api/v1/<domain-collection>[/<identifier>[/<sub-collection>[/<identifier>]]][/<action>]
```

- 所有浏览器可调用路由**必须**以 `/api/v1/` 开头（`OPENLAB_API_PREFIX`）。大版本只在**不兼容变更**时递增，
  且新旧版本并行挂载至少一个 unilabos 小版本周期（§10）。
- 根路径 `/` 只给路标，微后端**不**托管前端页面。

### 2.2 路径

| 规则 | 示例 |
| --- | --- |
| 集合名用**复数、kebab-case** 名词 | `/workflow-tasks` `/driver-packages` `/device-processes` `/status-incidents` |
| 资源标识符用花括号占位，名字 **snake_case**、带类型后缀 | `{material_uuid}` `{task_uuid}` `{process_id}` `{name}` |
| 子资源表达从属关系，最多两级 | `/workflows/{workflow_uuid}/graph` `/workflow-node-jobs/{job_uuid}/results` |
| 领域动作 = `POST <资源>/<动词>`，动词用现在时原形 | `/device-processes/{process_id}/start` `/registry/entries/{name}/apply` `/driver-packages/{name}/graphs/{graph}/launch` |
| 只读的派生视图用名词子路径 | `/materials/instances/{material_uuid}/tree` `/graphs/live/payload` |
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
- 只读列表的通用参数：分页 `page` / `page_size`，窗口 `limit` / `offset`，账本游标 `after_sequence`（§4.4）；
  过滤参数与被过滤字段同名（`status`、`device_id`、`workflow_uuid`、`job_uuid`）。
- 昂贵的可选载荷用 `include_*` 开关，默认关（`GET /materials/templates?include_definition=false`）。

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
  "JSON 头 + 空体" 判为 1000）。
- 服务端对未知字段**应当**忽略（materials.v1 写信封是例外：payload 严格比对，§5.3）。

### 3.2 状态码

| 码 | 何时使用 | 正文 |
| --- | --- | --- |
| 200 | 读成功；同步写成功；Backend 信封域**恒 200**（业务结果看 `code`） | DTO / 信封 |
| 201 | 同步创建了新资源（`POST /device-processes`） | 新资源 |
| 202 | 已接受、异步执行（`POST /driver-packages/install`、`DELETE /driver-packages/{name}`） | operation 资源（§6） |
| 204 | 删除成功且无内容（`DELETE /device-processes/{id}`） | 无 |
| 404 | 资源不存在；**或路由未在本进程挂载** | `{"detail": "..."}` |
| 405 | 路径存在但方法不支持（通常是路由顺序错误，视为缺陷） | — |
| 409 | 状态冲突：已在运行、恢复正在执行、决策已被处理 | `{"detail": "..."}` |
| 422 | 语义 / 校验错误（含 FastAPI 请求体校验） | `{"detail": string \| ValidationIssue[]}` |
| 503 | 能力未装配：调度权威在远端、执行面缺失 | `{"detail": "..."}` |
| 5xx 其它 | 未预期错误 | `{"detail": "..."}` |

约定：

- **400 不使用**；所有客户端可修正的请求错误统一 422。
- **404 与 503 对客户端等价于"当前进程不支持该能力"**（`ApiError.isUnsupported`），页面**必须**降级
  而非报障；只有在同进程曾经成功过的资源上才把 404 解释为"不存在"。
- 冲突（409）与"不存在"（404）的判定在服务层完成，路由层只做映射，不得靠字符串猜测扩散到客户端。

### 3.3 幂等与并发

| 机制 | 用在哪 | 规则 |
| --- | --- | --- |
| `command_uuid` + `effect_key` | materials.v1 全部写请求 | 同 `command_uuid` 重放返回首次 `MutationResult`（`replayed=true`）；客户端每次用户操作生成一次，重试复用 |
| `revision` 乐观锁 | Workflow Graph / Authoring；Registry 条目 | PUT 携带期望 revision，不匹配 → 业务码 3003 |
| `preconditions[]` | materials.v1 | `expected_version` / `expected_state_hash` 不满足即拒绝 |
| 名称去重 | 受管进程 `launch`、图 upsert | 同名视为同一资源：更新而非新建 |
| 自然幂等 | `PUT /enabled`、`POST /restart`（重复登记合并） | 重复调用结果一致 |

## 4. 表示层

### 4.1 JSON

- `application/json; charset=utf-8`；不出现 `NaN` / `Infinity`；数字不用字符串包装。
- **可选字段两种写法，域内必须一致**：四库域用显式 `null`；Workflow 域"DB NULL = 键缺席"
  （TS `?:`），消费方不得把缺席当空串。
- 大对象（registry 全量定义、`action_value_mappings`）**透传**：客户端类型为 `JsonObject`，
  不解构、不改写。

### 4.2 时间

- 新增字段**必须**是 `*_at_ms`：**UTC epoch 毫秒整数**（`created_at_ms`、`observed_at_ms`、
  `received_at_ms`）。持续时间用 `*_ms` / `*_s` 显式带单位（`timeout_ms`、`heartbeat_interval`
  这种无单位名属历史例外）。
- Workflow Authority 域使用 **UTC ISO-8601 字符串**（`started_at`、`opened_at`、`deadline_at`），
  是既定契约，保持不变。
- 诊断 / 决策域的 epoch **秒**浮点（`connected_at`、`last_seen`、`created_at`、`expires_at`、
  `requested_at`）是历史例外（附录 A），新增字段不得沿用。
- 客户端**不得**按数量级猜单位，以协议包类型注释为准。

### 4.3 状态词汇

状态是权威的语言，前端只翻译不改写：

- 任务终态 `succeeded` / `failed` / `cancelled`；节点作业与 attempt 状态同源；
- 物料 lifecycle：`active | reserved | in_use | quarantined | consumed | retired`；
- 受管进程：`stopped | starting | running | crashed | restarting`；
- 长操作：`running | succeeded | failed`；
- HostLink peer：`online` 是判活唯一依据，`connected` 只是 TCP 存活。

新增枚举值属于**加法变更**（§10），客户端遇到未知值必须原样展示、不崩。

### 4.4 列表、分页与游标

| 形态 | 参数 | 响应 | 用途 |
| --- | --- | --- | --- |
| 页码分页 | `page`（≥1）、`page_size`（默认 20，上限 100） | `{items, total, page, page_size}` | 人看的列表（workflows、tasks、graphs、reports） |
| 窗口 | `limit`（不传 = 全量）、`offset`（默认 0） | 数组 | 单个父资源下的子记录（jobs、confirmations、interventions） |
| 账本游标 | `after_sequence`、`limit` | 数组，按 `sequence` 升序 | append-only 流：materials changes、telemetry events、runtime outbox |
| 快照 | 无 | 数组 | 小而全的实时快照（endpoints、telemetry states、peers） |

- 列表默认排序由服务端固定并在域文档写明（通常按创建时间或 sequence）；v1 不提供自定义排序。
- 软删除记录默认不返回；需要时用显式开关（`include_terminal`）。

### 4.5 引用与展开

- 引用别的聚合只放 uuid（+ 必要的展示名），不内嵌整对象；需要跨域拼装时由前端
  `entity-cache` 解析，避免响应膨胀与循环。
- 树 / 图这类天然嵌套结构（物料树、node-link 图）整棵返回，并附一致性版本（`revision` / `state_hash`）。

## 5. 响应信封与错误

v1 存在三种响应形态，**按域固定**，一个域内不得混用：

### 5.1 直出 DTO（system / runtime / materials 读 / telemetry / history / decisions / driver-packages / device-processes / debug）

成功直接返回模型；失败按 §3.2 状态码，正文：

```json
{ "detail": "driver package not found: acme" }
```

请求体校验失败（422）时 `detail` 是数组：

```json
{ "detail": [ { "loc": ["body", "spec"], "msg": "String should have at least 1 character", "type": "string_too_short" } ] }
```

### 5.2 Backend 信封（workflow / registry / graphs）

HTTP **恒 200**；业务结果在正文：

```json
{ "code": 0, "data": { "...": "..." } }
{ "code": 3003, "error": { "msg": "workflow revision mismatch", "expected": 4, "actual": 5 } }
```

| code | 含义 | 客户端 |
| --- | --- | --- |
| 0 | 成功 | 解包 `data` |
| 1000 | 入参非法（uuid / 分页 / JSON 深度 / 体格式） | 修请求 |
| 3002 | 资源不存在或已软删 | 当作 404 |
| 3003 | 并发冲突（revision / hash 不匹配、目录冲突） | 重新读取后重试 |
| 5001 | 模板目录不可用 | 降级提示 |

传输层 4xx/5xx 仍按 §5.1 抛 `ApiError`；`code != 0` 抛 `BackendBusinessError`。新业务码只能追加，不得复用。

### 5.3 materials.v1 写信封

写请求统一包在 `InventoryMutation`，成功返回 `MutationResult`：

```json
{
  "protocol_version": "materials.v1",
  "command_uuid": "9d1d…", "effect_key": "patch_material:9d1d…",
  "operation": "patch_material", "actor_type": "human", "actor_uuid": null,
  "job_uuid": null, "observed_at_ms": 1788440000000,
  "preconditions": [ { "aggregate_type": "material", "aggregate_uuid": "…", "expected_version": 7 } ],
  "payload": { "name": "…", "barcode": null, "lifecycle": "active", "…": "…" }
}
```

```json
{
  "protocol_version": "materials.v1", "command_uuid": "9d1d…", "effect_key": "patch_material:9d1d…",
  "replayed": false, "changed": true,
  "ledger_sequence_start": 1201, "ledger_sequence_end": 1203,
  "affected": [ { "aggregate_type": "material", "aggregate_uuid": "…", "version": 8, "state_hash": "…" } ],
  "data": { "…": "聚合读模型" }
}
```

- `payload` 与路由声明的类型化请求体**严格比对**：可选字段必须显式给出（`null` / 空串），否则 422
  `mutation.payload differs from the typed request body`。客户端只能通过 `materialsMutation()` 构造。
- `operation` 取值由服务端定义（`patch_material`、`put_position`、`inbound_lot`…），前端不得自造。
- `actor_type` 取值为服务端 `KNOWN_ACTOR_TYPES`；浏览器 / 操作员发起的写操作**必须**显式携带
  `human`（`materialsMutation()` 默认值），不依赖服务端默认值 `edge`。

### 5.4 客户端错误归一

| 类 | 何时 | 关键属性 |
| --- | --- | --- |
| `ApiError` | 网络失败（`status=0`）或非 2xx | `status`、`body`、`isNetwork`、`isUnsupported`（404/503） |
| `BackendBusinessError` | 信封 `code != 0` | `code`、`envelope`、`isNotFound`、`isConflict` |

页面层只依赖这两个类；`describeError()` 负责成文案。

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

## 7. 实时（SSE）

| 流 | 事件 | 续传 |
| --- | --- | --- |
| `GET /api/v1/events` | `workflow.task.changed`、`workflow.node_job.changed`、`workflow.authoring.changed` | `Last-Event-ID` |
| `GET /api/v1/materials/events` | `materials.changed`（携带 ledger sequence） | `Last-Event-ID`；首连不重放 |

- 事件**只是失效通知**：正文不含业务数据，客户端收到后重拉 HTTP。
- 没有 SSE 的域按 3–8 s 轮询，页面可见性恢复时立即刷新。
- 实时日志页是有界只读例外：只在可见且未暂停时按 1 s 增量拉取选中进程，来源目录 5 s 刷新；
  不新增长连接，读取与窗口上限见 [logs.md](./logs.md)。
- 浏览器同源连接数有限（HTTP/1.1 每源 6 条）：一个页面**至多**各打开一条流，跨 tab 复用由应用层保证。
- 新增流必须登记到 `catalog.ts`（`method: "SSE"`）并更新校验脚本的 SSE 清单。

## 8. 能力发现与进程角色

```json
GET /api/v1/health → { "status": "ok", "scheduler": "local" | "remote", "execution": "ready" | "disabled" }
```

| 能力 | 判定 |
| --- | --- |
| 可创建 / 运行工作流 | `scheduler == "local"` |
| 设备、物料、遥测、人工决策、驱动包、受管进程 | `execution == "ready"` |
| Registry Authority | 默认本机调度 Host 与 `--role backend` 均提供；远端受控 Edge 不挂载 |

- `catalog.ts` 每条操作标注 `role: host | backend | any`；校验脚本强制 decisions /
  driver-packages / device-processes 为 `host`，registry 跟随调度权威并标为 `any`。
- 未挂载的路由返回 404（或服务缺失时 503），客户端按 §3.2 降级，页面给出"连接另一角色进程"的提示。

## 9. 传输与安全

- v1 面向**实验室局域网**：无鉴权、CORS 全放开；远程访问通过反向代理 / 隧道，并由代理层做 TLS 与访问控制。
- 页面由 HTTPS 站点（GitHub Pages）托管、微后端是 `http://` 时，浏览器按混合内容规则处理：
  - `http://127.0.0.1` / `localhost` 是「可信来源」，Chrome / Edge / Firefox 放行，Safari 拦截；
  - `http://192.168.x.x` 等局域网地址默认拦截。用户可在浏览器「网站设置 → 不安全内容 → 允许」
    为本站放行，或在 Windows 上用 `netsh interface portproxy` 把远端端口映射到本机 127.0.0.1，
    或改用 `http://` 打开页面 / 由反向代理把 `/api` 反代成同源。连接面板检测到这种地址会直接给出上述步骤。
  - 微后端对带 `Access-Control-Request-Private-Network: true` 的预检回 `Access-Control-Allow-Private-Network: true`，
    满足 Chrome 的 Private Network Access 要求。
- 端口由 `unilab --port` 决定（默认 8002），页面在连接面板填写；同源反代场景自动探测。
- 客户端默认超时 10 s；健康探测 4 s；长操作不靠超时而靠 operation 轮询。
- 微后端不写 Cookie、不依赖会话；所有请求可重放。

## 10. 版本与兼容

| 层 | 版本载体 | 规则 |
| --- | --- | --- |
| 线上协议 | 路径 `/api/v1` | 只做**加法变更**（新端点、新可选字段、新枚举值）；删除 / 改名 / 改语义 = 新大版本 |
| `@openlab/protocol` | npm semver，`OPENLAB_PROTOCOL_VERSION` 与 `package.json.version` 必须一致（有测试守护） | major：线上协议大版本变更或客户端 API 不兼容；minor：新端点 / 字段；patch：客户端修复 |
| unilabos | `unilabos.__version__` | 发布说明列出协议影响；新增端点先发 unilabos，再发协议包 |

- **废弃流程**：字段 / 端点先在 OpenAPI `description` 与域文档标 `Deprecated`，协议包类型加 `@deprecated`，
  至少保留一个 unilabos 小版本后才可移除（同时升大版本）。
- 客户端**必须**容忍未知字段与未知枚举值；服务端**必须**容忍缺失的新可选字段。
- 兼容矩阵在 `packages/protocol/CHANGELOG.md` 维护：每个协议包版本注明最低 unilabos 版本。

## 11. 契约治理：新增或修改一个端点

一次变更集必须同时包含：

1. 微后端路由（`unilabos/server/api/…`）与服务层错误映射（§3.2）；角色专属路由登记到
   `unilabos/server/openapi_export.py` 的前缀表；请求 / 响应声明 Pydantic 模型；
2. 后端测试（`tests/server/`）；
3. 同步契约快照：`pnpm --filter @openlab/protocol openapi:sync`（调用导出器，重生成
   `openapi/unilabos-openapi.json` 与 `src/generated/openapi.ts`，二者随包提交）；
4. `packages/protocol/src/<domain>.ts` 的类型与方法（方法名 = 资源 + 动作，驼峰；有生成类型时
   请求体优先复用 `OpenApiComponents["schemas"][…]`）；
5. `catalog.ts` 登记（`id` = `<domain>.<resource>.<action>`，`role`、`mutates` 正确）；浏览器不该调用的
   新路由登记到 `scripts/validate-contract.mjs` 的 `CONTROL_PLANE_OPERATIONS`；
6. 域覆盖测试（客户端 ↔ 目录双向比对）；
7. `docs/protocol/<domain>.md` 与（如涉及）本文附录 A；
8. `scripts/live-smoke.mjs` 读路径（可选写路径）。

`pnpm run protocol:check` 强制：域必须在白名单；`id` 必须以域名为前缀；GET / SSE 不得
`mutates: true`；同一 `方法 + 路径` 只能登记一次；目录 ⊆ OpenAPI 导出且角色一致；
OpenAPI 导出 = 目录 ∪ 控制面清单（多一条、少一条都失败）；控制面路由不得出现在浏览器目录。

页面侧红线（见 README §6）：只经 `api.domains.*` 调用；不手写 `/api/v1/…`；不改写状态词汇；
不把 SSE 正文当数据；人工决策只提交 Host 给出的选项。

## 附录 A：历史例外（冻结，不得扩大）

| 例外 | 位置 | 说明 |
| --- | --- | --- |
| epoch 秒时间戳 | `hostlink.peers[].connected_at / last_seen`、`error-decisions[].created_at / expires_at`、`restart.requested_at` | 诊断 / 决策域早期契约 |
| 无单位的持续时间名 | `HostLinkConfig.heartbeat_interval`、`decision_timeout_seconds` | 值单位为秒 |
| 连字符枚举 | `device-processes.restart_policy = on-failure` | 与 systemd / Docker 习惯一致 |
| Backend 信封"键缺席 = 空" | Workflow 域全部 DTO | 与四库域的显式 `null` 不同 |
| 主键字段名 | Workflow 域 `uuid`；四库域 `<type>_uuid` | 两种并存 |
| 严格比对的写体 | materials.v1 `payload` | 有意为之（防止半更新），非疏漏 |

## 附录 B：术语

| 术语 | 含义 |
| --- | --- |
| Edge / Host | 带设备执行面的 `unilab` 进程 |
| Backend（调度权威） | `--role backend` 进程或云端；持有 Workflow Authority |
| 权威（Authority） | 某类事实的唯一写入口与真相来源（物料权威、Graph Authority、Workflow Authority、Registry Authority） |
| 域（domain） | 一组路由 + 一份客户端文件 + 一段目录；对应 `unilabos/server/api/` 的一个模块 |
| 直出 DTO / 信封 | §5 的三种响应形态 |
| 长操作 | 202 + operation 资源 + 轮询（§6） |
| 失效通知 | SSE 事件，只表示"某物变了"，不带正文（§7） |
