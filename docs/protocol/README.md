# OpenLab ↔ Uni-Lab-OS 微后端协议（V1.0 合同）

本目录是 OpenLab 前端与 Uni-Lab-OS 微后端之间 HTTP 协议的规范文档集，也是
`@openlab/protocol`（`packages/protocol/`，单独发包）的设计依据。

协议真相是微后端从路由声明生成的 OpenAPI：运行中的进程在 `http://<host>:8002/api/docs` 给出本进程
视角，`python -m unilabos.server.openapi_export` 离线导出两种角色的路由全集（带 `x-openlab-role`）。
导出快照提交在协议包（`packages/protocol/openapi/unilabos-openapi.json`）并生成 TypeScript 类型；
`catalog.ts` 登记浏览器会调用的子集，契约校验保证目录 ⊆ 导出、导出 = 目录 ∪ 控制面清单 ∪「浏览器暂未采用」
清单（当前快照 unilabos 0.13.0a2：355 条操作 = 237 浏览器 + 36 控制面 + 82 暂未采用）；
协议测试把客户端方法与目录双向比对。任一环变更必须同一变更集内对齐
（[conventions.md §11](./conventions.md#11-契约治理新增或修改一个端点)）。

## 文档地图

| 文档 | 内容 | 性质 |
| --- | --- | --- |
| [conventions.md](./conventions.md) | URL / 方法 / 状态码 / 表示层 / V1 信封与业务码 / 不鉴权 / 5001 重试 / 长操作 / SSE / 能力发现 / 版本兼容 / 契约治理 | **规范**（MUST / SHOULD） |
| [runtime.md](./runtime.md) | `runtime-v1`（执行投影）、`workflow`（Workflow Authority）、`run-history`、`scheduler`、`registry` | 域契约 |
| [materials.md](./materials.md) | `inventory`（V1 库存面 + 唯一写入口）、`materials-v1`（dev 独有物料路由）、`graphs-v1`（设备图） | 域契约 |
| [telemetry-history.md](./telemetry-history.md) | `telemetry-v1`、`device-state`、`history-v1`（`/edge/history`）、`debug`、`process-management` | 域契约 |
| [decisions.md](./decisions.md) | 状态告警、动作异常（V1 error-decisions）与工作流干预 | 域契约 |
| [driver-packages.md](./driver-packages.md) | 驱动包安装 / 目录 / 随包图、受管设备进程 | 域契约 |
| [lab.md](./lab.md) | `lab-v1`：仓储聚合、组合视图、演示数据（档案 / 布局 / 分区 / 摆放已在核心删除） | 域契约 |
| [logs.md](./logs.md) | Host / 受管 Slave / 外部 Slave 有界增量实时日志（system 域） | 域契约 |
| [`packages/protocol/README.md`](../../packages/protocol/README.md) | 协议包的安装、用法、边界与发布流程 | 包文档 |
| [`packages/protocol/CHANGELOG.md`](../../packages/protocol/CHANGELOG.md) | 协议包版本、兼容矩阵 | 发布记录 |

## 1. 部署形态与进程角色

```text
浏览器 (OpenLab Web，静态站)
   │  HTTP JSON（/api/v1，V1 信封；不鉴权）+ 两条 SSE 失效通知流
   ▼
unilab 调度权威 :8002（unilab --port，浏览器只连这一个地址）
   ├─ runtime.db    Workflow 定义 / Graph / Task / Node Job / 干预 / Authoring / 运行历史视图
   │                Registry Authority；进程管理状态（/v1/*）
   ├─ materials.db  资源模板 / 物料聚合 / 位点 / 拓扑边 / 图快照 / 批次 / 预留 / 内容物 / 账本
   └─ Host 子进程（不监听端口）：Host 专有路由由权威经控制 WS 转交（edge_proxy），Host 不在线时 200 + 5001
        ├─ runtime.db    Backend 会话 / 执行 endpoint / 命令 / 执行 job / outbox
        ├─ telemetry.db  设备最新状态 + 追加遥测事件（/telemetry、/device-state）
        ├─ history.db    payload + 统一历史事件流（/edge/history）
        ├─ unilabos_data/driver_packages.json   驱动包台账
        └─ unilabos_data/device_processes.json  受管设备进程规格（+ 子进程运行态）
```

同一套路由挂载在两种进程角色上，`GET /api/v1/health` 告诉浏览器连的是谁：

| 字段 | 取值 | 含义 |
| --- | --- | --- |
| `scheduler_mode` | `local` | 本进程持有 Workflow Authority，可创建 / 编辑 / 运行工作流 |
|  | `remote` | 已接入远端调度权威，工作流写入口不在本进程 |
| `scheduler` | `ready` / `disabled` | V1 字段：本进程是否承载调度器 |
| `execution` | `ready` | 本进程带设备执行面（HostNode、遥测、人工决策、驱动包、受管进程），或 Host 子进程已接入 |
|  | `restarting` | 调度权威在线但 Host 子进程正在启动 / 重启 |
|  | `disabled` | `unilab --role backend` 纯调度权威进程 |

- **默认拓扑**（`unilab`，可不带 `-g`，此时以空图启动只有 `host_node`）：调度权威 + Host 子进程，
  `execution=ready`。设备、遥测、人工决策、驱动包、受管进程是 Host 专有路由，经权威转交。
- **调度权威进程**（`unilab --role backend`）：`execution=disabled`。挂载 Workflow Authority 与
  Registry Authority；执行面路由返回 404 或信封 5001。

`catalog.ts` 的每条操作都标注 `role`（`host` / `backend` / `any`）。页面遇到 404 / 503 / 信封 5001
（`isCapabilityUnavailable(error)`）时按「当前进程不支持 / 暂不可用」降级并提示，不得当作故障。

## 2. 协议域

| 域 | 路径前缀 | 存储 | 客户端 | 角色 |
| --- | --- | --- | --- | --- |
| `system` | `/api/v1/health` `/readiness` `/ping` `/hostlink/*` `/scheduler/resources` `/restart` `/reset` | — | `createSystemApi` | any / host |
| `runtime-v1` | `/api/v1/runtime/*` | Host runtime.db | `createRuntimeV1Api` | any |
| `workflow` | `/api/v1/workflows*` `/workflow-*` `/experiment-operation-categories*` `/authoring/*` `/device-action-runs` `/events` | runtime.db | `createWorkflowBackendApi` | any |
| `run-history` | `/api/v1/history/workflows*` `/history/jobs` | runtime.db 视图 | `createRunHistoryApi` | any |
| `scheduler` | `/api/v1/monitor/snapshot` `/timeline` `/scheduler/*` `/reschedule` | 调度器 | `createSchedulerApi` | any |
| `registry` | `/api/v1/registry/*` | runtime.db | `createRegistryApi` | any |
| `inventory` | `/api/v1/inventory/*`；**写一律 `POST /inventory/commands`** | materials.db | `createInventoryApi` | any |
| `materials-v1` | `/api/v1/materials/*`（dev 独有：树、registry 资源类、拓扑边写、设备通知、执行读、`events`） | materials.db | `createMaterialsV1Api` | any |
| `graphs-v1` | `/api/v1/graphs*` | materials.db | `createGraphsV1Api` | any |
| `chemicals-v1` | `/api/v1/chemicals*` | materials.db | `createChemicalsV1Api` | any |
| `telemetry-v1` | `/api/v1/telemetry/*` | Host telemetry.db | `createTelemetryV1Api` | any |
| `device-state` | `/api/v1/device-state*` | Host telemetry.db | `createDeviceStateApi` | any |
| `history-v1` | `/api/v1/edge/history/*` | Host history.db | `createHistoryV1Api` | any |
| `decisions` | `/api/v1/status-incidents*` `/error-decisions*` | 内存 / runtime.db | `createDecisionsApi` | host |
| `driver-packages` | `/api/v1/driver-packages*` | `unilabos_data/driver_packages/` 源码树 + 台账 JSON | `createDriverPackagesApi` | host |
| `device-processes` | `/api/v1/device-processes*` | 规格 JSON + 子进程 | `createDeviceProcessesApi` | host |
| `lab-v1` | `/api/v1/lab/warehouse` `/lab/assembly/{id}` `/lab/demo` | materials.db | `createLabV1Api` | any |
| `process-management` | `/v1/snapshot` `/v1/operations*` `/v1/logs/{component}`（无 `/api` 前缀） | runtime.db | `createProcessManagementApi` | any |
| `debug` | `/api/v1/debug/databases*` | 四库只读 | `createDebugApi` | any |

全部 JSON 路由（含探针、库存命令与 `/v1/*` 进程管理）都是 V1 信封 `{code, data}`，传输层统一解包；只有 SSE 与文件下载不包信封。
信封、业务码、5001 重试的精确定义见 [conventions.md §5](./conventions.md#5-响应信封与错误)。

### 2.1 浏览器暂未采用的 V1 控制台面

V1 合同里还有一批浏览器可调用、但 OpenLabSite 目前没有页面与客户端的路由。它们登记在
`packages/protocol/scripts/validate-contract.mjs` 的 `UNADOPTED_GROUPS`（附理由），契约校验据此对账：

| 组 | 路由 | 理由 |
| --- | --- | --- |
| `content-contract` | `/reagents*` `/reagent-infos*` `/samples*` `/current-substances*` `/compounds/{cas}` 及内容物历史 | 试剂 / 样品 / 当前内容物是 `material_substance` 上的角色；OpenLabSite 经物料内容物 + 化学品定义管理 |
| `resource-contract` | `/materials`、`/materials/{uuid}*`、`/resource-templates*`、`/sites/{uuid}`、`/material-*`、`/resources` | V1 Backend 资源合同；OpenLabSite 读 `/inventory/*`，写走 `/inventory/commands` |
| `stations` | `/stations/{station_id}/*` | V1 工站异常处置台；OpenLabSite 的异常面是 error-decisions + status-incidents + 干预 |
| `device-views` | `/devices*` `/actions` `/online-devices` `/authoring/device-catalog` `/job/*` | 设备目录由 runtime endpoints + 物料根 + 遥测合成 |
| `monitor-sse` | `GET /monitor/events` | 失效通知只用 `/events` 与 `/materials/events` |

需要其中的能力时按 [conventions.md §11](./conventions.md#11-契约治理新增或修改一个端点) 把它移进目录、补客户端与测试，而不是在页面里手写请求。

## 3. 实时模型

浏览器没有推送正文：**数据真相永远来自 HTTP**，SSE 只承担失效通知。

| 流 | 事件 | 语义 |
| --- | --- | --- |
| `GET /api/v1/events` | `workflow.runtime.changed`（`data.kind`：`task` / `node_run` / `node_job` / `manual_confirmation` / `resource`）`workflow.authoring.changed` `station.error_handling.changed` | Workflow Authority 变更（V1 事件名，常量 `WORKFLOW_EVENT_NAMES`）；首连不重放（先收到只含 `id` 的水位帧），`Last-Event-ID` 续传，显式 `0` 回放 |
| 同一 `GET /api/v1/events` | `stream.reset` | 游标过期或超前；`id` 为新水位（可能回退），客户端重读 HTTP |
| 同一 `GET /api/v1/events` | `runtime.logs.changed` | 日志来源索引；不写 SSE id，重连按 HTTP 日志游标补读 |
| 同一 `GET /api/v1/events` | `material.changed` | 物料账本推进（瞬时，不写 SSE id）；`data` 是 `{sequence, material_uuids?}`，列不准时省略 uuid。OpenLabSite 不监听，仍用下一行的物料流 |
| `GET /api/v1/materials/events` | `materials.changed` | 物料账本推进；首连不重放（先收到只含 `id` 的水位帧），重连按游标补齐。id 是 `<sequence>:<账本纪元>`（空账本只有 `<sequence>`），常量合集 `MATERIALS_EVENT_NAMES` |
| 同一 `GET /api/v1/materials/events` | `stream.reset` | 游标超前于账本（`cursor_ahead`）或来自另一个库（`epoch_changed`：换了数据目录、全量重置）；`id` 为新水位，客户端重读 HTTP |

`stores/connection.ts` 为持久数据通知维护 `revision` 计数；日志通知按来源定向重拉，不触发工作流刷新；
任一流的 `stream.reset`，或物料流 id 里的账本纪元与上次不同，说明后端换了一份数据：`resyncRevision` +1，全部通道各重读
一次（去抖合并，不刷新整页），按序号增量缓存的页面（运行监控、执行历史）清空后整体重读；
`station.error_handling.changed` 单独计数，只让人工决策面板重读动作异常与干预（通知流断开时退回轮询）。没有 SSE
的域（telemetry / runtime / 状态告警 / device-processes）按 3–8 秒轮询，可见性恢复时立即刷新。
Host 子进程启动 / 重启期间 Host 专有路由返回 HTTP 200 + 信封 5001 + `Retry-After`：GET 由传输层有限退避重试，
仍不可用时页面显示「暂不可用」降级态，Host 恢复后下一轮轮询自动收敛。

恢复基线来自四库：执行状态读 `runtime.execution_job`，设备当前值读 `telemetry.device_state_latest`，
历史读 `history.history_event`，物料读 `/inventory/*`；断线重连不依赖任何进程内事件缓存。

## 4. 设备与动作从哪里来

微后端没有独立的「设备」路由。浏览器把几处事实合成设备目录（`stores/devices.ts`）：

1. `runtime-v1.endpoints[].device_routes` — 哪些设备由哪个 endpoint 执行、是否在线；
2. `runtime-v1.endpoints[].action_capabilities` — 每个动作的 registry 定义与当前可用性；
3. `inventory.instances({ rootsOnly: true })` 中 `resource_type=device` 的根物料 — 展示名、类、位点、位置；
4. `telemetry-v1.states` — 最新属性快照；
5. `system.hostlinkPeers` — Slave 机器与心跳判活；
6. `device-processes.list` — 哪些设备跑在本机受管子进程里。

执行一个动作 = `POST /api/v1/workflow-tasks`，`execution_kind: "ad_hoc_device_action"`，微后端生成
单 job 任务并复用整图的调度 / 锁 / 历史 / 异常链路。

设备驱动从哪里来：[awesome-lab-devices](https://github.com/Xuwznln/awesome-lab-devices) 索引由浏览器
直接读取，选中的 `spec` 经 `driver-packages.install` 下发给 Host（见 driver-packages.md）。

## 5. 版本与兼容

- 当前尚未首发，前后端直接对齐当前契约（Uni-Lab-OS 统一分支的 V1.0 合同，0.13 发布线），不保留 dev 时代
  路由的兼容分支；旧后端 `legacy` 适配器不动。
- 正式发布后，线上协议大版本在路径（`/api/v1`）；v1 内只做加法变更。
- `@openlab/protocol` 按 semver 发布，`OPENLAB_PROTOCOL_VERSION` 与 `package.json` 版本一致；
  每个版本在 CHANGELOG 注明最低 unilabos 版本。
- 细则与废弃流程见 [conventions.md §10](./conventions.md#10-版本与兼容)。

## 6. 前端红线

- 页面只能调用 `useConnectionStore().api.domains.*` 暴露的方法；禁止手写 `/api/v1/...`。
- 不改写状态词汇（任务终态 `succeeded`、job 状态、物料 lifecycle、进程状态）。
- 不把 SSE payload 当业务正文；不用列表存在性判断 HostLink peer 在线（用 `online`）。
- 人工决策只提交 Host 给出的 `options[].action`。
- `inventory.templates({ includeDefinition: true })` 携带 registry 全量定义（可达数十 MB），只在需要时按需加载，
  不轮询；列表场景用缺省的目录模式（`include_definition=false`）。
- 物料写入只经 `inventory.*` 写方法（内部提交 `POST /inventory/commands`）；不手拼变更信封。
- 浏览器只读的外部资源（驱动包索引）由 `features/` 层负责，不进协议包。

## 7. 验证门槛

```bash
pnpm --filter @openlab/protocol openapi:sync   # 调微后端导出器刷新 OpenAPI 快照并重生成类型（UNILABOS_PYTHON 指定解释器）
pnpm run protocol:check     # tsc + 目录校验（域覆盖、角色、SSE 清单、无 raw 声明、目录 ↔ OpenAPI 导出对账、控制面 / 暂未采用清单）
pnpm run protocol:test      # 客户端方法 ↔ 目录双向比对、V1 信封解包、5001 重试、不带鉴权头、库存命令、版本一致、快照元信息
pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write
                            # 对着真实微后端跑通全部读路径与关键写流程（--restart 另测 Host 重启期间的 5001 退避）
```
