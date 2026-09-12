# @openlab/protocol

Uni-Lab-OS 微后端 HTTP API（OpenLab Edge 协议 v1）的类型化客户端与机器可读目录。
框架无关、零 UI 依赖：浏览器、Node ≥ 22、Electron、测试脚本都能直接用。

- 协议规范：[`docs/protocol/`](https://github.com/Xuwznln/OpenLab/tree/main/docs/protocol)
  （[conventions.md](https://github.com/Xuwznln/OpenLab/blob/main/docs/protocol/conventions.md) 是规范性文本）
- 服务端：[Uni-Lab-OS](https://github.com/deepmodeling/Uni-Lab-OS)（`unilab`，默认 `:8002`）
- 版本与兼容矩阵：[CHANGELOG.md](./CHANGELOG.md)

## 安装

```bash
pnpm add @openlab/protocol     # 或 npm i / yarn add
```

运行时依赖只有 `axios`。ESM only（`"type": "module"`），附带 `.d.ts` 与 source map。

## 用法

```ts
import { createEdgeApi, ApiError, BackendBusinessError } from "@openlab/protocol";

const api = createEdgeApi("http://127.0.0.1:8002", { timeoutMs: 10_000 });

// 能力探测：连的是 Host 还是纯调度权威
const health = await api.health();               // { status, scheduler: "local"|"remote", execution: "ready"|"disabled" }

// 按域访问：一个域 = 微后端 unilabos/server/api/ 下的一组路由
const roots = await api.domains.materialsV1.instances(true);
const tasks = await api.domains.workflowBackend.tasks({ page: 1, page_size: 20 });
const peers = await api.domains.system.hostlinkPeers();

// 写操作：materials.v1 自动包幂等信封（command_uuid / effect_key）
const result = await api.domains.materialsV1.patch(materialUuid, { name: "1 号孔板" });
result.replayed;                                  // 同 command_uuid 重放会为 true

// 长操作：202 + operation 资源轮询
let op = await api.domains.driverPackages.install({ spec: "git+https://github.com/Xuwznln/LabDeviceLockDemo.git", name: "lock_demo" });
while (op.status === "running") op = await api.domains.driverPackages.operation(op.operation_id);

// SSE 失效通知流：拿 URL 自己开 EventSource，收到事件后重拉 HTTP
const es = new EventSource(api.http.url("/api/v1/events"));
```

### 错误处理

| 抛出 | 何时 | 你该做什么 |
| --- | --- | --- |
| `ApiError`（`status = 0`） | 网络 / 超时 / CORS | 显示离线；保留上次数据 |
| `ApiError`（`isUnsupported`：404 / 503） | 该能力未在当前进程挂载 | 页面降级，提示连接另一角色进程；不是故障 |
| `ApiError`（409 / 422 / 5xx） | 冲突 / 校验 / 服务端错误 | `error.message` 已归一为可读文案，`error.body` 是原始错误体 |
| `BackendBusinessError` | workflow / registry / graphs 域信封 `code != 0` | `isNotFound`（3002）、`isConflict`（3003，重新读取后重试） |

### 目录（catalog）

```ts
import { OPERATIONS, operationsOf, findOperation } from "@openlab/protocol/catalog";

operationsOf("driver-packages");          // 该域全部操作：id / method / path / role / mutates
findOperation("workflow.task.create");     // { method: "POST", path: "/api/v1/workflow-tasks", ... }
```

`OPERATIONS` 是浏览器会调用的全部微后端路由的登记表，协议测试保证每个客户端方法都对应一条、
每条都有客户端方法。适合做权限清单、mock 服务器、路由审计。

### OpenAPI 快照与生成类型

微后端的契约全集（Host 与 `--role backend` 两种角色的路由并集，每个 operation 带
`x-openlab-role`）由 `python -m unilabos.server.openapi_export` 离线导出，随包提交并发布：

```ts
import type { OpenApiPaths, OpenApiComponents } from "@openlab/protocol";          // 生成的类型
type InstallBody = OpenApiComponents["schemas"]["DriverPackageInstallRequest"];
type HealthOp = OpenApiPaths["/api/v1/health"]["get"];

import openapi from "@openlab/protocol/openapi.json" with { type: "json" };       // 原始文档（mock / 网关 / 审计）
```

`pnpm run check` 会把 `OPERATIONS` 与快照对账：目录里的每条操作都必须存在且角色一致，快照里多出的
操作必须显式登记为 Backend ↔ Edge 控制面。刷新快照：`pnpm --filter @openlab/protocol openapi:sync`
（`UNILABOS_PYTHON` 指定解释器，如 `"mamba run -n unilab-dev-jazzy python"`）。

## 域一览

| `api.domains.*` | 微后端路由 | 角色 |
| --- | --- | --- |
| `system` | `/health` `/hostlink/peers` `/scheduler/resources` `/restart` | any |
| `runtimeV1` | `/runtime/*`（执行 endpoint、命令、job、outbox） | any |
| `workflowBackend` | `/workflows*` `/workflow-tasks*` `/workflow-node-jobs*` `/events`（SSE） | any |
| `registry` | `/registry/*`（默认本机调度 Host 与 `--role backend` 均提供；远端受控 Edge 返回 404） | any |
| `materialsV1` | `/materials/*`（物料权威、库存、账本、`/materials/events` SSE） | any |
| `graphsV1` | `/graphs*`（设备图快照与实时拓扑） | any |
| `telemetryV1` | `/telemetry/*` | any |
| `historyV1` | `/history/*` | any |
| `decisions` | `/status-incidents*` `/error-decisions*` | host |
| `driverPackages` | `/driver-packages*`（安装台账、目录、随包图、长操作） | host |
| `deviceProcesses` | `/device-processes*`（受管本机 Slave 子进程） | host |
| `debug` | `/debug/databases*`（四库只读浏览） | any |

`role = host` 的域只在带设备执行面的 Host 进程可用；`backend` 只在 `unilab --role backend`；
其余两种角色都挂载。

## 边界

这个包**只包含**线上契约与传输：

- 有：请求 / 响应类型、按域的客户端方法、错误类、信封与幂等信封的构造 / 解包、操作目录、
  少量纯函数适配器（如 `hostlinkPeerState()`）。
- 没有：任何 UI 框架、状态管理、本地存储、浏览器专属 API（`EventSource` 由调用方创建）、
  与微后端无关的外部资源（驱动包索引 awesome-lab-devices 的读取在应用层）。

导入只能走公开入口 `@openlab/protocol` 与 `@openlab/protocol/catalog`；`dist/` 内部文件路径不是契约。

## 版本策略

| 变化 | 版本位 |
| --- | --- |
| 线上协议大版本变更（路径前缀升级）或客户端 API 不兼容改动 | major |
| 新端点、新可选字段、新枚举值、新域 | minor |
| 客户端修复、类型收紧、文档 | patch |

`OPENLAB_PROTOCOL_VERSION` 常量与 `package.json` 版本一致（测试守护）。每个版本在
[CHANGELOG.md](./CHANGELOG.md) 注明最低兼容的 unilabos 版本；客户端必须容忍服务端多出的字段与未知枚举值。

## 开发与发布

```bash
pnpm --filter @openlab/protocol openapi:sync   # 调微后端导出器 → openapi/unilabos-openapi.json + src/generated/openapi.ts
pnpm --filter @openlab/protocol build     # 清 dist + tsc
pnpm --filter @openlab/protocol check     # build + scripts/validate-contract.mjs（目录完整性、角色、SSE 清单、目录 ↔ OpenAPI 对账）
pnpm --filter @openlab/protocol test      # vitest：客户端 ↔ 目录双向比对、信封、幂等、版本一致、快照元信息
pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 [--write]   # 对真实微后端跑读路径 / 关键写流程
```

发布步骤（`prepack` 会自动跑 check + test）：

1. 对着目标 unilabos 版本 `openapi:sync`，处理对账失败（新增到目录 / 控制面清单，或改类型）；
2. 更新 `src/common.ts` 的 `OPENLAB_PROTOCOL_VERSION` 与 `package.json` 的 `version`；
3. 在 `CHANGELOG.md` 补条目与兼容矩阵（写明快照对应的 unilabos 版本）；
4. `pnpm --filter @openlab/protocol publish`（`publishConfig.access = public`，带 provenance 需在 CI 中发布）；
5. 主应用在 monorepo 内用 `workspace:*` 引用，无需改动；外部消费者按 semver 升级。

## 许可

见 `package.json` 的 `license` 字段。
