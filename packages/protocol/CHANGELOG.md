# Changelog

## 3.0.0：对齐 Uni-Lab-OS V1.0 合同（破坏性）

面向 Uni-Lab-OS 统一分支（dev 架构 + V1.0 API 合同，deepmodeling/Uni-Lab-OS#361，0.13.0rc1）。dev 时代的路径、
信封与业务码不再保留兼容分支；旧后端请继续用 2.x。

### 传输与错误

- **全部 `/api/v1` JSON 路由按 V1 信封统一解包**（`{code, data}` / `{code, error: {msg, code?, details?}}`）：
  `http.request` 直接返回 `data`，`code != 0` 抛 `BackendBusinessError`（新增 `symbol` / `details` / `httpStatus` /
  `retryAfterMs`，`isNotFound` / `isConflict` 按 V1 码表分类，新增 `isInvalidInput` / `isOperationNotAllowed` /
  `isUnavailable`）。`BACKEND_BUSINESS_CODES` 扩成完整 V1 码表（1001 / 1002 / 2005 / 4000–4002 / 5000–5004 / 6000–6011）。
  `backendRequest()` / `backendVoid()` 保留为 `http.request` 的薄别名（`@deprecated`）。
- 不包信封的路由在目录里标 `raw: true`（`/health`、`/readiness`、`POST /inventory/commands`、`/v1/*` 进程管理）；
  `RequestConfig` 新增 `raw` 与 `headers`。
- **控制面 token 改用 `X-UniLab-Token`**（`CONTROL_TOKEN_HEADER`），不再发 `Authorization: Bearer`（V1 留给工站
  api_key）；被拒码 `CONTROL_TOKEN_REJECTED_CODE` 由 4001 改为 **1002**（4001 在 V1 是「资源不存在」）。
  `ApiError.isControlTokenRejected` 也认 `/v1/*` 的 `{"error": {"code": "unauthorized"}}`；新增 `ApiError.businessCode` /
  `retryAfterMs`。
- **5001 退避**：Host 子进程启动 / 重启期间 Host 专有路由返回 200 + 5001 + `Retry-After`，GET 按 `unavailableRetry`
  有限重试（默认 2 次、每次 ≤ 3 s；读不到 `Retry-After` 时 1 s），写请求从不自动重试；`sleep` 可注入。
- 新增 `isCapabilityUnavailable(error)`（404 / 503 / 业务码 5001）、`isBackendEnvelope()`、`parseRetryAfter()`。
- `system.health()` 按 V1：`scheduler` 为 `ready` / `disabled`，调度归属改读 `scheduler_mode`，另有 `unavailable_devices`；
  `system.readiness()` 增加 V1 `status`（`ready` / `starting` / `failed`）`capabilities` `phase` `workflowRuntime`。
- SSE 事件名按 V1：`workflow.runtime.changed`（dev 细粒度种类在 `data.kind`）、`workflow.authoring.changed`、
  `station.error_handling.changed`、`stream.reset`；导出常量 `WORKFLOW_*_EVENT` / `WORKFLOW_EVENT_NAMES` /
  `MATERIALS_CHANGED_EVENT`。
- 新增 `openapi-types.ts`：`OpenApiQuery` / `OpenApiBody` / `OpenApiData` 从快照推导请求类型。

### 物料与库存

- **新域 `inventory`**（`createInventoryApi` / `api.domains.inventory`）：读 `/inventory/instances|templates|lots|
  reservations|relations|contents|ledger|snapshot|outbox|sync|commands/processed|ingress-reservations`（具名数组取出直接
  返回数组，列表缺省 `all=true`）；**全部物料写入经 `POST /inventory/commands`**：`instantiate` / `createTree` / `patch` /
  `putData` / `putPosition` / `remove` / `move` / `transfer` / `inboundLot` / 模板维护提交 materials.v1 变更信封
  （原路径参数放 `target_uuid`，payload 按类型化请求体补齐全部字段：`resourceTemplateWrite()` / `materialDataWrite()` /
  `materialPositionWrite()`），`typedCommand()` 提交 V1 类型化命令，`command()` 原样提交；被拒抛
  `InventoryCommandRejectedError`。批次入库带 V1 `location_site_uuid` / `warehouse_zone_id`。
- `materials-v1` 收缩为 dev 独有路由：`registryClasses` / `byResourceId` / `tree` / `notifyDevice` / `upsertLink` /
  `deleteLink` / `reservationByJob`，新增 `executions` / `execution` / `previewInventory`；`templates` / `instances` /
  `instance` / `lots` / `lot` / `reservations` / `reservation` / `links` / `changes` 与全部写方法移除（后端已删除对应路由）。

### 历史、调度与其它域

- `history-v1` 改走 `/api/v1/edge/history/*`（V1 把 `/history/*` 让给运行历史）。
- 新域 `run-history`（`/history/workflows|jobs`）、`scheduler`（monitor snapshot / timeline / time-plan / reschedule /
  drain / inventory- & physical-recovery）、`device-state`（V1 设备状态视图）、`process-management`（`/v1/snapshot|
  operations|logs`，裸 JSON，类型取自生成的 `WorkspaceSnapshot` 等）。
- `lab-v1` 按 V1 lab 合同：`profile` / `updateProfile` / `layoutView` / 分区 / 摆放 / 装配 / 仓储 / demo；网格经
  `PUT /lab/profile` 的 `grid` 写入（过期 3003），`layout()` / `saveLayout()` / `resetLayout()` 保留为便捷方法；
  `LabV1Layout` 时间字段改为 `create_time` / `update_time`（ISO）。dev 的 `PUT | DELETE /lab/layout` 移除。
- `decisions`：error-decisions 按 V1 实际合同——列表 `{decisions}`、成功 `status: "delivered"`、请求体即
  `ErrorDecisionIn`（不再回带 `job_id` / `device_id` / `scheduler_updated`），可选 `Idempotency-Key`；
  `ErrorDecision` 增加 `category` / `stage` / `node_run_uuid` / `error_info`，超时字段改为可选。
- `driver-packages` 新增 `changes()` / `confirmOperation()` / `recoverOperation()`。

### 工作流

- `commandTask()` 返回 V1 命令投影（`BackendWorkflowTaskCommand`，HTTP 201），`status="rejected"` 抛
  `TaskCommandRejectedError`（code 3003、`reason`、`TASK_COMMAND_REJECT_REASONS`）；命令类型增加 `switch_to_step` /
  `unlock_resources`，**`pause` 改为 V1 语义（只暂停派发，不转逐步）**；`expected_revision` 改为可选。
- 人工确认按作业提交 `decideJobManualConfirmation(jobUuid, {action: "approve" | "reject"})`；移除
  `decideManualConfirmation` / `decideTaskManualConfirmation`。
- 干预改为全局列表 `interventions({status, limit})` + `intervention()` + `decideIntervention(uuid, {revision, option_id},
  idempotencyKey)`；移除 `taskInterventions`。`BackendIntervention` 去掉 `edge_agent_uuid` / `decision_idempotency_key`，
  增加 `delivery_status` / `delivered_at`。
- 反馈归档 `jobFeedback(jobUuid, {page, page_size})`（V1 分页）替换 `jobFeedbackHistory`。
- 组合调用按发布合同：`{revision, contract_uuid, invocation_uuid?, device_bindings: {}, pose?, param?}`，返回父图；
  发布 DTO 增加 V1 合同字段（`workflow_revision` / `version` / `input_contract` / `output_contract` / `node_count`…）。
- `applyAuthoring()` 只带 `{candidate_hash}`；工作流 DTO / 写入增加 `workflow_type`（`normal` / `experiment_operation`）、
  `operation_category_uuid`、`status`；任务 DTO 增加 `priority` / `inventory_bindings` / `execution_mode` / `dispatch_gate` /
  `wait_reason`；`BackendPage.total` 改为可选、增加 `has_more`。
- 新增 V1 浏览器路由的客户端：实验操作类别、JSON / Python 导入、复制、引用、模板目录 / 实例、节点 / 连线增量编辑、
  节点模板、资源作用域、运行前检查、authoring compile / generate / validate、任务展示投影 / 删除 / 事件 / step-state /
  按作业改参、执行锁、物料事件与库存消费、结构化人工交互、作业核对 / 结果未知处置 / 失败转运结算、V1 单点动作、
  资源区间 / 借还 / 设备托管、等待图。

### 目录与契约校验

- 快照同步 unilabos 0.13.0rc1：353 条操作 = 239 浏览器目录 + 32 控制面 + 82「浏览器暂未采用」的 V1 控制台面
  （试剂 / 样品合同、V1 资源合同、工站异常处置台、V1 设备视图、`/monitor/events`，按组登记在
  `scripts/validate-contract.mjs` 的 `UNADOPTED_GROUPS` 并附理由）。校验新增：域白名单 19 个、`/v1/` 前缀只许
  process-management、`raw` 操作固定清单、三份清单互不重叠。
- `scripts/live-smoke.mjs`：控制令牌（`--token` / `OPENLAB_CONTROL_TOKEN`）、无令牌写 → 401 + 1002、V1 暂停 / 继续、
  库存命令（出库 → 改条码 → 移动 → 被拒命令 → 删除）、`--restart` 验证 5001 退避。

## 未发布：写请求的控制令牌

- 传输层新增 `getToken` 选项（`createHttpTransport` / `createEdgeApi`，类型 `ControlTokenProvider`）：
  写请求（POST / PUT / PATCH / DELETE）发出前现取令牌，非空时附加 `Authorization: Bearer <token>`。
  GET 与 SSE 不带令牌；未提供或返回空值时请求与此前完全一致，旧版微后端不受影响。
- `ApiError.isControlTokenRejected`（HTTP 401 + `code` 4001，常量 `CONTROL_TOKEN_REJECTED_CODE`）：
  写请求因令牌缺失或不正确被拒。令牌由微后端保存在 `<working_dir>/control_token`，`unilab token` 查看。

## 未发布：内容物关联化学品定义；修正物料数据 / 位置写入的 operation

- 快照同步 Uni-Lab-OS `feat/substance-chemical-link`（dev + PR #353）：路由不变，`MaterialSubstance`
  新增可选 `chemical_uuid` 与只读 `chemical`（新 schema `ChemicalSummary`）。
- `MaterialsV1Substance` 增加 `chemical_uuid?: string | null` / `chemical?: ChemicalSummary | null`；
  chemicals-v1 导出 `ChemicalSummary`。省略 / null / uuid 三种写法语义见 docs/protocol/materials.md。
- 修正：`materialsV1.putData` 的 operation 由 `put_material_data` 改为微后端接受的 `put_data`，
  `putPosition` 由 `put_material_position` 改为 `put_position`（旧值会被微后端以 422 拒绝）。

## 未发布：工作流入口参数、发布与组合调用；就绪探针与化学品定义

- 快照同步 Uni-Lab-OS `feat/workflow-entry-params`（dev + PR #346）：新增 12 条浏览器操作，无删除。
- workflow 域：`declareIo`（PUT /workflows/{uuid}/io）、`publishWorkflow` / `workflowPublications`
  （/workflows/{uuid}/publications）、`latestPublications`（GET /workflow-publications）、
  `insertCompositeInvocation`（POST /workflows/{uuid}/composite-invocations）、`editTaskInput`
  （PATCH /workflow-tasks/{uuid}/input）；`createTask` 接受 `input`，任务 DTO 带 `input` / `output`。
  新增合同 / 发布 / 组合调用类型，以及 `workflowInputReference` / `isWorkflowInputReference` /
  `declaredWorkflowIo` 三个纯函数。
- system 域：`readiness()`（GET /readiness）；503 是「尚未就绪」的正常回答，返回同形状正文而不抛错。
- 新域 `chemicals-v1`（`createChemicalsV1Api` / `api.domains.chemicalsV1`）：化学品定义 CRUD，
  `expected_version` 乐观锁；业务码与 workflow 共用一张表（参数错误 1000，`CHEMICAL_BUSINESS_CODES`）。
- 需要包含上述路由的 Uni-Lab-OS 构建；旧构建上这些方法返回 404，页面按「不支持」降级。

## 未发布：工作流事件流订阅语义（v1.0 ADR 0006）

- `/api/v1/events` 首连不再从序号 0 回放：服务端先发只含 `id` 的水位帧，此后只推新通知；
  显式 `Last-Event-ID: 0` 才回放保留历史，其他游标照旧续传。
- 游标大于最新序号时收到 `stream.reset`（`data.reason` 为 `cursor_ahead`，`id` 为新水位）。
  前端把它加入工作流失效事件，与 `onopen` 一样只触发 HTTP 重读。
- OpenAPI 快照同步 `Last-Event-ID` 头的新说明；路由、operation 与 schema 不变。
- 需要包含该订阅语义的 Uni-Lab-OS 构建；旧构建首连仍会回放历史，前端行为保持正确，只是首屏多刷新几次。

## 未发布：快照对齐 Uni-Lab-OS 0.12.3

- `openapi/unilabos-openapi.json` 改为对应 unilabos 0.12.3 正式发行版。与 0.12.1 开发构建相比，
  路由、operation 与 schema 均无变化；导出时 pydantic 2.14 把整数约束写成 `0.0` 形式，语义相同，未采用。
- 0.12.3 是第一个同时包含 Site 导入策略、工作流逐步执行和统一日志接口的发行版，兼容矩阵的最低版本随之更新。
- SDK 运行时代码与生成类型不变。

## 未发布：SDK 包规范化

- 以 OpenLab TypeScript SDK 明确包定位，保留 `@openlab/protocol` 和全部公共 API。
- 仓库、主页与问题反馈链接迁移至 OpenLabSite，增加 SDK 关键词。
- 按项目许可证声明 Apache-2.0，并随包携带 LICENSE。
- 补齐中英文 README、源码安装、导出入口和发布前检查说明。
- 本次不修改运行时、OpenAPI 快照或版本号，不执行 npm 发布。

- 发布前同步：从当前微后端重新生成快照，移除已删除的设备进程日志路由，更新统一事件流声明；
  日志客户端和 smoke 继续使用 system.logSources / system.logs，不引入新端点。

`@openlab/protocol` 按 [semver](https://semver.org/) 发布。每个版本注明它面向的线上协议版本与
最低兼容的 Uni-Lab-OS（`unilabos`）版本；规则见
[docs/protocol/conventions.md §10](../../docs/protocol/conventions.md#10-版本与兼容)。

## 未发布：首版契约收敛与 Host / Slave 实时日志

- 新增 `system.logSources()` / `system.logs()`：来源目录与有界增量只读查询，响应含独立游标、文件切换标记。
- 日志追加经 HostLink + 控制 WS 转为既有 `/events` 上的 `runtime.logs.changed`，空闲不轮询日志；跨页共用通知连接。
- 移除 `deviceProcesses.logs` 及旧接口回退、地图 localStorage 权威回退/自动迁移；第一版发布前直接统一契约。
- 没有新数据库、SSE 流或浏览器到 Slave 的直连端口；旧后端 `legacy` 适配器不变。
- OpenAPI / 目录 / 类型 / 测试 / live smoke 同步，详见 `docs/protocol/logs.md`。

## 未发布：Site 模板默认值确认

- `BackendWorkflowFromTemplateInput` / `BackendGraphWriteInput` 增加 `site_binding_mode`（resolve / preserve，默认 resolve）。
- 程序化导入自动在目标物料范围解析 SiteSlot；缺声明/目标/唯一匹配时业务码 1000。前端草稿显式 preserve，确认后保存实际 UUID 与 node.meta_data.site_bindings。
- 节点与流程卡计数、原定义补全窗口、提交前校验使用同一口径；模板标签不被覆盖，不增加数据库、锁或 legacy 分支。
- 需要 Uni-Lab-OS 0.12.1 中包含本次 Site 导入策略的构建；OpenAPI、SDK 类型与测试同步更新。

## 未发布：工作流逐步执行

- 新增 `workflowBackend.commandTask()`：同一任务内单点放行 / 切回自动，版本校验与幂等键防重复。
- Task 详情必须有 `control_revision`，列表不带；缺失是契约错误，禁用控制而不自行猜测节点状态。
- 要求 Uni-Lab-OS 0.12.1 **包含 2026-09-13 逐步执行接口的构建**；版本号相同的旧构建不支持。
- 没有数据库 schema 变更，复用 workflow_task_command；已同步 OpenAPI 快照、目录与客户端测试。

## 兼容矩阵

| @openlab/protocol | 线上协议 | 最低 unilabos | 说明 |
| --- | --- | --- | --- |
| 3.0.0 | `/api/v1`（V1.0 合同）+ `/v1/*` 进程管理 | 0.13.0rc1（统一分支，deepmodeling/Uni-Lab-OS#361） | V1 信封 / `X-UniLab-Token` / 库存命令；快照对应 0.13.0rc1，不兼容 0.12.x |
| 2.0.0 | `/api/v1` | 0.12.3（第一个包含 Site 导入策略、逐步执行与统一日志接口的发行版） | 首个按微后端四库 + 权威模型重写的版本；快照 `openapi/unilabos-openapi.json` 对应 unilabos 0.12.3 |

## 2.0.0

首个面向 Uni-Lab-OS 微后端的版本。协议对象从旧的「Edge 实体 / 代理」模型整体切换为微后端的
四库权威模型；旧域（agent、cloud-inventory、device、entities、inventory、lab、monitor、resource、
server-databases、workflow）全部移除，不提供兼容层。

### 新增

- 传输层 `createHttpTransport()`：axios 单实例、非 2xx 归一为 `ApiError`（`isNetwork` / `isUnsupported`）、
  空体不声明 JSON、query 中 `undefined` / 空串剔除、数组用重复键。
- Backend 信封解包 `backendRequest()` / `backendVoid()` 与 `BackendBusinessError`（业务码 1000 / 3002 / 3003 / 5001）。
- materials.v1 幂等写信封 `materialsMutation()`（`command_uuid` / `effect_key` / `preconditions`）与 `MutationResult` 类型。
- 13 个域客户端：`system`、`runtimeV1`、`workflowBackend`、`registry`、`materialsV1`、`graphsV1`、
  `telemetryV1`、`historyV1`、`decisions`、`driverPackages`、`deviceProcesses`、`labV1`、`debug`。
- 机器可读目录 `OPERATIONS`（127 条操作，含 2 条 SSE），`operationsOf()` / `findOperation()`，
  每条带 `role`（host / backend / any）与 `mutates`。
- OpenAPI 契约快照 `openapi/unilabos-openapi.json`（`python -m unilabos.server.openapi_export` 导出，
  两种角色路由全集 + `x-openlab-role`）与生成类型 `@openlab/protocol/openapi`
  （`OpenApiPaths` / `OpenApiComponents` / `OpenApiOperations`）；`openapi:sync` 脚本刷新二者。
  `check` 把目录与快照对账（目录 ⊆ 快照且角色一致；快照 = 目录 ∪ 控制面清单）。
- Workflow 域：节点运行视图 `taskNodeRuns()` / `nodeRun()`（`BackendWorkflowNodeRun`，每节点一条，
  内嵌 `attempts`）；`BackendWorkflowNodeJob` 按微后端当前行结构修正——attempt 是
  `attempt_no` / `trigger` / `workflow_node_run_uuid` / `retry_of_job_uuid` / `error_resolution`，
  `topological_index` / `executor_kind` / `execution_policy` / `execution_timeout_seconds` 移到节点运行上。
- 驱动包域：驱动包是**源码树**而不是 pip 分发——`spec` 是 GitHub 仓库地址 / 归档地址 / 本机目录，
  微后端下载到 `unilabos_data/driver_packages/<name>/<version>/`（本机目录原地登记）、按目录挂载
  （同 `--devices`）、只用 uv 预装 `pyproject` 依赖；`DriverPackage` 带 `source_kind` / `package_root` /
  `dependencies` / `sha256`，inventory 带 `packages_root`。安装 / 卸载为 202 长操作（`operation` 轮询），
  `upgrade` 重新下载并升级依赖，`name` 在源码树无 pyproject 时兜底；Edge 侧目录；随包设备图
  `graphs` / `graph` / `launchGraph`。
- 受管设备进程域：规格 CRUD、`start` / `stop` / `restart`、`logs`、`deviceClasses`。
- lab-v1 域：实验室布局（区域 / 围墙像素格）`layout()` / `saveLayout()` / `resetLayout()`，runtime.db
  单行文档，`revision` 乐观锁（409），从未保存返回 `revision 0`。
- 校验脚本 `scripts/validate-contract.mjs`（域白名单、角色约束、禁止控制面路由、SSE 清单）与
  `scripts/live-smoke.mjs`（对真实微后端跑全部读路径与关键写流程）。

### 移除

- `@openlab/protocol` 1.x 的全部实体 / 表契约 API 与 fixtures；`SERVER_DATABASE_KEYS` 保留为四库键常量。
# 未发布：全量重置

- system 增加 resetPreview / requestReset，与微后端 GET/POST /api/v1/reset 同步。
- 需要包含 ResetController 的微后端版本；不支持的旧服务按缺失能力降级。
- 202 只代表受理，完成后服务退出；备份清单为最终凭据。
