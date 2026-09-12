# OpenLab ↔ Uni-Lab-OS 微后端协议（v1）

本目录是 OpenLab 前端与 Uni-Lab-OS 微后端之间 HTTP 协议的规范文档集，也是
`@openlab/protocol`（`packages/protocol/`，单独发包）的设计依据。

协议真相是微后端从路由声明生成的 OpenAPI：运行中的进程在 `http://<host>:8002/api/docs` 给出本进程
视角，`python -m unilabos.server.openapi_export` 离线导出两种角色的路由全集（带 `x-openlab-role`）。
导出快照提交在协议包（`packages/protocol/openapi/unilabos-openapi.json`）并生成 TypeScript 类型；
`catalog.ts` 登记浏览器会调用的子集，契约校验保证目录 ⊆ 导出、导出 = 目录 ∪ 控制面清单；
协议测试把客户端方法与目录双向比对。任一环变更必须同一变更集内对齐
（[conventions.md §11](./conventions.md#11-契约治理新增或修改一个端点)）。

## 文档地图

| 文档 | 内容 | 性质 |
| --- | --- | --- |
| [conventions.md](./conventions.md) | URL / 方法 / 状态码 / 表示层 / 三种信封 / 错误 / 长操作 / SSE / 能力发现 / 版本兼容 / 契约治理 | **规范**（MUST / SHOULD） |
| [runtime.md](./runtime.md) | `runtime-v1`（执行投影）、`workflow`（Workflow Authority）、`registry`（Registry Authority） | 域契约 |
| [materials.md](./materials.md) | `materials-v1`（物料权威、库存、账本）、`graphs-v1`（设备图） | 域契约 |
| [telemetry-history.md](./telemetry-history.md) | `telemetry-v1`、`history-v1`、`debug` | 域契约 |
| [decisions.md](./decisions.md) | 状态告警与动作异常的人工决策 | 域契约 |
| [driver-packages.md](./driver-packages.md) | 驱动包安装 / 目录 / 随包图、受管设备进程 | 域契约 |
| [lab.md](./lab.md) | `lab-v1`：实验室布局（区域 / 围墙像素格，runtime.db 单行文档，revision 乐观锁） | 域契约 |
| [logs.md](./logs.md) | Host / 受管 Slave / 外部 Slave 有界增量实时日志（system 域） | 域契约 |
| [`packages/protocol/README.md`](../../packages/protocol/README.md) | 协议包的安装、用法、边界与发布流程 | 包文档 |
| [`packages/protocol/CHANGELOG.md`](../../packages/protocol/CHANGELOG.md) | 协议包版本、兼容矩阵 | 发布记录 |

## 1. 部署形态与进程角色

```text
浏览器 (OpenLab Web，静态站)
   │  HTTP JSON（/api/v1）+ 两条 SSE 失效通知流
   ▼
Uni-Lab-OS 微后端 :8002（unilab --port）
   ├─ runtime.db    Backend 会话 / 执行 endpoint / 命令 / 执行 job / outbox
   │                Workflow 定义 / Graph / Task / Node Job / Authoring
   │                Registry Authority（默认本机调度 Host 与 --role backend 均提供）
   ├─ materials.db  资源模板 / 物料聚合 / 位点 / 拓扑边 / 图快照 / 批次 / 预留 / 变更账本
   ├─ telemetry.db  设备最新状态 + 追加遥测事件
   └─ history.db    payload + 统一历史事件流
   ├─ unilabos_data/driver_packages.json   驱动包台账
   └─ unilabos_data/device_processes.json  受管设备进程规格（+ 子进程运行态）
```

同一套路由挂载在两种进程角色上，`GET /api/v1/health` 告诉浏览器连的是谁：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `scheduler` | `local` | 本进程持有 Workflow Authority，可创建 / 编辑 / 运行工作流 |
|  | `remote` | 已接入云端 Backend，工作流写入口不在本进程 |
| `execution` | `ready` | 本进程带设备执行面（HostNode、遥测、人工决策、驱动包、受管进程） |
|  | `disabled` | `unilab --role backend` 纯调度权威进程 |

- **Host 进程**（`unilab`，可不带 `-g`，此时以空图启动只有 `host_node`）：`execution=ready`。
  设备、物料、遥测、人工决策、驱动包、受管进程都在这里；本机调度时也挂载 Workflow Authority。
- **调度权威进程**（`unilab --role backend`）：`execution=disabled`。挂载 Workflow Authority 与
  Registry Authority；执行面路由返回 404 / 503。

`catalog.ts` 的每条操作都标注 `role`（`host` / `backend` / `any`）。页面遇到 404 / 503 时按
「当前进程不支持该能力」降级并提示连接另一角色进程，不得当作故障。

## 2. 协议域

| 域 | 路径前缀 | 存储 | 信封 | 客户端 | 角色 |
| --- | --- | --- | --- | --- | --- |
| `system` | `/api/v1/health` `/ping` `/hostlink/peers` `/scheduler/resources` `/restart` | — | 直出 | `createSystemApi` | any |
| `runtime-v1` | `/api/v1/runtime/*` | runtime.db | 直出 | `createRuntimeV1Api` | any |
| `workflow` | `/api/v1/workflows*` `/workflow-tasks*` `/workflow-node-jobs*` `/events` | runtime.db | Backend | `createWorkflowBackendApi` | any |
| `registry` | `/api/v1/registry/*` | runtime.db | Backend | `createRegistryApi` | any |
| `materials-v1` | `/api/v1/materials/*` | materials.db | 直出 + 写信封 | `createMaterialsV1Api` | any |
| `graphs-v1` | `/api/v1/graphs*` | materials.db | Backend | `createGraphsV1Api` | any |
| `telemetry-v1` | `/api/v1/telemetry/*` | telemetry.db | 直出 | `createTelemetryV1Api` | any |
| `history-v1` | `/api/v1/history/*` | history.db | 直出 | `createHistoryV1Api` | any |
| `decisions` | `/api/v1/status-incidents*` `/error-decisions*` | 内存 | 直出 | `createDecisionsApi` | host |
| `driver-packages` | `/api/v1/driver-packages*` | `unilabos_data/driver_packages/` 源码树 + 台账 JSON | 直出 + 长操作 | `createDriverPackagesApi` | host |
| `device-processes` | `/api/v1/device-processes*` | 规格 JSON + 子进程 | 直出 | `createDeviceProcessesApi` | host |
| `lab-v1` | `/api/v1/lab/layout` | runtime.db（`lab_layout` 单行文档） | 直出 | `createLabV1Api` | any |
| `debug` | `/api/v1/debug/databases*` | 四库只读 | 直出 | `createDebugApi` | any |

三种信封的精确定义与错误语义见 [conventions.md §5](./conventions.md#5-响应信封与错误)。

## 3. 实时模型

浏览器没有推送正文：**数据真相永远来自 HTTP**，SSE 只承担失效通知。

| 流 | 事件 | 语义 |
| --- | --- | --- |
| `GET /api/v1/events` | `workflow.task.changed` `workflow.node_job.changed` `workflow.authoring.changed` | Workflow Authority 变更；`Last-Event-ID` 续传 |
| `GET /api/v1/materials/events` | `materials.changed` | 物料账本推进；首连不重放，重连按游标补齐 |

`stores/connection.ts` 为每条流维护 `revision` 计数；store 监听 revision 重拉 HTTP。没有 SSE
的域（telemetry / runtime / decisions / device-processes）按 3–8 秒轮询，可见性恢复时立即刷新。

恢复基线来自四库：执行状态读 `runtime.execution_job`，设备当前值读 `telemetry.device_state_latest`，
历史读 `history.history_event`，物料读 materials.v1；断线重连不依赖任何进程内事件缓存。

## 4. 设备与动作从哪里来

微后端没有独立的「设备」路由。浏览器把几处事实合成设备目录（`stores/devices.ts`）：

1. `runtime-v1.endpoints[].device_routes` — 哪些设备由哪个 endpoint 执行、是否在线；
2. `runtime-v1.endpoints[].action_capabilities` — 每个动作的 registry 定义与当前可用性；
3. `materials-v1.instances(roots_only)` 中 `resource_type=device` 的根物料 — 展示名、类、位点、位置；
4. `telemetry-v1.states` — 最新属性快照；
5. `system.hostlinkPeers` — Slave 机器与心跳判活；
6. `device-processes.list` — 哪些设备跑在本机受管子进程里。

执行一个动作 = `POST /api/v1/workflow-tasks`，`execution_kind: "ad_hoc_device_action"`，微后端生成
单 job 任务并复用整图的调度 / 锁 / 历史 / 异常链路。

设备驱动从哪里来：[awesome-lab-devices](https://github.com/Xuwznln/awesome-lab-devices) 索引由浏览器
直接读取，选中的 `spec` 经 `driver-packages.install` 下发给 Host（见 driver-packages.md）。

## 5. 版本与兼容

- 线上协议大版本在路径（`/api/v1`）；v1 内只做加法变更。
- `@openlab/protocol` 按 semver 发布，`OPENLAB_PROTOCOL_VERSION` 与 `package.json` 版本一致；
  每个版本在 CHANGELOG 注明最低 unilabos 版本。
- 细则与废弃流程见 [conventions.md §10](./conventions.md#10-版本与兼容)。

## 6. 前端红线

- 页面只能调用 `useConnectionStore().api.domains.*` 暴露的方法；禁止手写 `/api/v1/...`。
- 不改写状态词汇（任务终态 `succeeded`、job 状态、物料 lifecycle、进程状态）。
- 不把 SSE payload 当业务正文；不用列表存在性判断 HostLink peer 在线（用 `online`）。
- 人工决策只提交 Host 给出的 `options[].action`。
- `materials.templates` 携带 registry 全量定义（可达数十 MB），只在需要时按需加载，不轮询；
  列表场景用 `include_definition=false`。
- 浏览器只读的外部资源（驱动包索引）由 `features/` 层负责，不进协议包。
- 人工标注类数据（实验室布局）也走微后端（`lab-v1`），localStorage 只做老微后端降级与一次性迁移。

## 7. 验证门槛

```bash
pnpm --filter @openlab/protocol openapi:sync   # 调微后端导出器刷新 OpenAPI 快照并重生成类型（UNILABOS_PYTHON 指定解释器）
pnpm run protocol:check     # tsc + 目录校验（域覆盖、角色、SSE 清单、目录 ↔ OpenAPI 导出对账、控制面清单）
pnpm run protocol:test      # 客户端方法 ↔ 目录双向比对、信封解包、幂等信封、版本一致、快照元信息
pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write
                            # 对着真实微后端跑通全部读路径与关键写流程
```
