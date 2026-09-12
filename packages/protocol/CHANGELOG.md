# Changelog

`@openlab/protocol` 按 [semver](https://semver.org/) 发布。每个版本注明它面向的线上协议版本与
最低兼容的 Uni-Lab-OS（`unilabos`）版本；规则见
[docs/protocol/conventions.md §10](../../docs/protocol/conventions.md#10-版本与兼容)。

## 兼容矩阵

| @openlab/protocol | 线上协议 | 最低 unilabos | 说明 |
| --- | --- | --- | --- |
| 2.0.0 | `/api/v1` | 0.12.1（含 driver-packages / device-processes / node-runs 路由与 `openapi_export` 的构建） | 首个按微后端四库 + 权威模型重写的版本；快照 `openapi/unilabos-openapi.json` 对应 unilabos 0.12.1 |

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
- 机器可读目录 `OPERATIONS`（126 条操作，含 2 条 SSE），`operationsOf()` / `findOperation()`，
  每条带 `role`（host / backend / any）与 `mutates`。
- OpenAPI 契约快照 `openapi/unilabos-openapi.json`（`python -m unilabos.server.openapi_export` 导出，
  两种角色路由全集 + `x-openlab-role`）与生成类型 `@openlab/protocol/openapi`
  （`OpenApiPaths` / `OpenApiComponents` / `OpenApiOperations`）；`openapi:sync` 脚本刷新二者。
  `check` 把目录与快照对账（目录 ⊆ 快照且角色一致；快照 = 目录 ∪ 控制面清单）。
- Workflow 域：节点运行视图 `taskNodeRuns()` / `nodeRun()`（`BackendWorkflowNodeRun`，每节点一条，
  内嵌 `attempts`）；`BackendWorkflowNodeJob` 按微后端当前行结构修正——attempt 是
  `attempt_no` / `trigger` / `workflow_node_run_uuid` / `retry_of_job_uuid` / `error_resolution`，
  `topological_index` / `executor_kind` / `execution_policy` / `execution_timeout_seconds` 移到节点运行上。
- 驱动包域：安装 / 卸载为 202 长操作（`operation` 轮询）、`upgrade` 与 `name` 提示、Edge 侧目录、
  随包设备图 `graphs` / `graph` / `launchGraph`。
- 受管设备进程域：规格 CRUD、`start` / `stop` / `restart`、`logs`、`deviceClasses`。
- 校验脚本 `scripts/validate-contract.mjs`（域白名单、角色约束、禁止控制面路由、SSE 清单）与
  `scripts/live-smoke.mjs`（对真实微后端跑全部读路径与关键写流程）。

### 移除

- `@openlab/protocol` 1.x 的全部实体 / 表契约 API 与 fixtures；`SERVER_DATABASE_KEYS` 保留为四库键常量。
