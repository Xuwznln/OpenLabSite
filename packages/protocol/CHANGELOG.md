# Changelog

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

## 未发布：Host / Slave 实时日志

- 新增 `system.logSources()` / `system.logs()`：来源目录与有界增量只读查询，响应含独立游标、文件切换标记。
- Host 及远端 Slave 需使用包含本功能的 Uni-Lab-OS 0.12.1 构建并重启；远端声明 `process-logs` 能力。
- 旧 Host 降级为受管 Slave 尾部日志；没有新数据库、SSE 流或浏览器到 Slave 的直连端口。
- OpenAPI / 目录 / 类型 / 测试 / live smoke 同步，详见 `docs/protocol/logs.md`。

## 未发布：工作流逐步执行

- 新增 `workflowBackend.commandTask()`：同一任务内单点放行 / 切回自动，版本校验与幂等键防重复。
- Task 详情新增可选 `control_revision`；旧构建缺少此字段时前端禁用控制并提示升级。
- 要求 Uni-Lab-OS 0.12.1 **包含 2026-09-13 逐步执行接口的构建**；版本号相同的旧构建不支持。
- 没有数据库 schema 变更，复用 workflow_task_command；已同步 OpenAPI 快照、目录与客户端测试。

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
