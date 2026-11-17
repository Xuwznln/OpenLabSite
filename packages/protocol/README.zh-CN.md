<div align="center">

[English](README.md) | **简体中文**

<img src="https://raw.githubusercontent.com/Xuwznln/OpenLabSite/main/public/brands/openlab.svg" alt="OpenLab" width="64" />

# OpenLab TypeScript SDK

面向 Uni-Lab-OS 后端的类型化 API 客户端

`@openlab/protocol` · TypeScript · ESM · Node.js 22+ · Apache-2.0

[项目首页](https://github.com/Xuwznln/OpenLabSite) · [接口规范](../../docs/protocol/README.md) · [版本记录](CHANGELOG.md) · [反馈问题](https://github.com/Xuwznln/OpenLabSite/issues)

</div>

---

## 概述

本包提供框架无关的后端 API 客户端、请求与响应类型、统一错误处理、机器可读操作目录以及 OpenAPI 快照。
可用于浏览器应用、Node.js 工具和自动化测试，不依赖 Vue 或应用状态管理。

**SDK 名称与 HTTP 协议版本分开管理。** npm 包名保持 `@openlab/protocol`，
现有入口 `createEdgeApi` 保持兼容；它访问的是后端 API，不负责设备驱动、调度或数据库访问。
3.x 面向 Uni-Lab-OS V1.0 合同（统一分支 0.13 发布线）：V1 响应信封、管理 API 不鉴权，
物料写入只有 `POST /api/v1/inventory/commands` 一个入口。

## 安装与运行环境

- Node.js 22+；浏览器应用需支持 ESM，并由调用方处理 CORS 和网络访问权限。
- 唯一运行时依赖为 `axios`。
- 提供 ESM、TypeScript 声明、声明映射和 source map，不提供 CommonJS 入口。

### 本仓库内使用

应用通过 `workspace:*` 引用 SDK：

```bash
pnpm install --frozen-lockfile
pnpm --filter @openlab/protocol build
```

### 从源码打包安装

没有可用的 npm 发布版本时，使用本仓库源码构建的安装包：

```bash
pnpm --dir packages/protocol pack --pack-destination ../../artifacts
# 在消费项目中，用上一步实际生成的文件名安装：
npm install /path/to/openlab-protocol-<version>.tgz
```

`prepack` 会执行契约检查与测试。正式发布后，可按已发布版本安装
`npm install @openlab/protocol@<version>`；源码中的版本号不代表该版本已经发布到 npm。

## 快速使用

```ts
import { createEdgeApi, ApiError, BackendBusinessError, isCapabilityUnavailable } from "@openlab/protocol";

const api = createEdgeApi("http://127.0.0.1:8002", { timeoutMs: 10_000 });

try {
  const health = await api.health();
  const roots = await api.domains.inventory.instances({ rootsOnly: true });
  const tasks = await api.domains.workflowBackend.tasks({ page: 1, page_size: 20 });
  console.log({ health, roots, tasks });
} catch (error) {
  if (isCapabilityUnavailable(error)) {
    console.warn("当前进程不提供该能力，或 Host 正在重启", error);
  } else if (error instanceof BackendBusinessError) {
    console.error("后端业务错误", error.code, error.symbol, error.message);
  } else if (error instanceof ApiError) {
    console.error("请求失败", error.status, error.message);
  } else {
    throw error;
  }
}
```

全部 `/api/v1` JSON 路由都是 V1 信封（`{ code, data }` / `{ code, error: { msg, code?, details? } }`），
传输层统一解包，客户端方法直接返回 `data`；`code != 0` 即使 HTTP 200 也抛 `BackendBusinessError`。
`/health`、`/readiness`、`POST /inventory/commands`（被拒是带 `error.details.command_id` 的失败信封）与 `/v1/*`
进程管理路由同样是信封；只有事件流与文件下载不包信封。

`127.0.0.1:8002` 是调用方机器上的后端管理 API，不是 HostLink 设备通信端口。
能力是否可用取决于后端版本、进程角色和当前运行状态。

### 不鉴权

管理 API 不鉴权：核心已删除控制面令牌（`X-UniLab-Token`、`unilab token`）与 V1 工站 api_key，请求不带任何凭据，
也没有「未授权」业务码。访问控制交给网络边界（实验室局域网、反向代理）。

### Host 重启（业务码 5001）

Host 子进程启动或重启期间，Host 专有路由返回 HTTP 200 + 业务码 5001 + `Retry-After`。GET 请求按有限退避自动重试
（默认 2 次，每次最多等 3 s；跨源读不到 `Retry-After` 时等 1 s），写请求从不自动重试。

```ts
const api = createEdgeApi(url, { unavailableRetry: { retries: 4, delayMs: 1_000, maxDelayMs: 3_000 } });
const noRetry = createEdgeApi(url, { unavailableRetry: false });
```

### 物料写入

物料的全部写入都经 `POST /api/v1/inventory/commands`。`inventory` 客户端按类型化请求体补齐全部字段、构造
`materials.v1` 幂等信封并返回 `MutationResult`；命令被拒时抛 `InventoryCommandRejectedError`
（`BackendBusinessError` 子类，`code` 为业务码，`symbol` 为 `error_code`）。

```ts
const tree = await api.domains.inventory.instantiate("demo_tips_24", "tips_01");
await api.domains.inventory.patch(tree.data.root_material_uuid, { barcode: "BC-1" });
await api.domains.inventory.typedCommand("material.move", { edge_uuid: "…", parent_uuid: "…" });
```

### 实时通知

SDK 提供事件流地址；订阅生命周期由应用管理。通知用于触发 HTTP 重读，不应作为完整业务正文。

```ts
import { WORKFLOW_EVENT_NAMES } from "@openlab/protocol";

const events = new EventSource(api.domains.workflowBackend.eventsUrl());
// workflow.runtime.changed / workflow.authoring.changed / station.error_handling.changed / stream.reset
for (const name of WORKFLOW_EVENT_NAMES) events.addEventListener(name, () => refresh());
// 页面卸载或切换连接时关闭订阅：
events.close();
```

Node.js 调用方如需订阅事件，应自行选择兼容的 SSE 客户端。

## API 导出

| 入口 | 内容 |
| --- | --- |
| `@openlab/protocol` | 客户端、类型、错误类与公共辅助函数 |
| `@openlab/protocol/catalog` | 操作目录与检索工具 |
| `@openlab/protocol/openapi` | 生成的 OpenAPI 类型 |
| `@openlab/protocol/openapi.json` | 后端导出的原始 OpenAPI 快照 |
| `@openlab/protocol/package.json` | 包元数据 |

不要直接导入 `dist/` 内部文件。

```ts
import { operationsOf, findOperation } from "@openlab/protocol/catalog";
import type { OpenApiPaths, OpenApiComponents } from "@openlab/protocol";

const operations = operationsOf("driver-packages");
const createTask = findOperation("workflow.task.create");
type HealthOperation = OpenApiPaths["/api/v1/health"]["get"];
type InstallRequest = OpenApiComponents["schemas"]["DriverPackageInstallRequest"];
```

## 业务域

| `api.domains.*` | 用途 |
| --- | --- |
| `system` | 健康、就绪、日志、组网、重启 / 重置与运行诊断 |
| `runtimeV1` | 执行端点、命令与作业投影 |
| `workflowBackend` | 工作流、整图、增量编辑、任务、任务命令、干预与 Authoring |
| `runHistory` / `scheduler` | V1 运行历史；监控快照、泳道图、排空与恢复 |
| `registry` | 设备和物料类型注册表 |
| `inventory` | V1 库存读（`/inventory/*`）与全部物料写入（`/inventory/commands`） |
| `materialsV1` | 剩余 dev 路由：物料树、registry 资源类、拓扑边、设备通知、物理执行记录 |
| `graphsV1` / `chemicalsV1` | 设备图；化学品定义 |
| `telemetryV1` / `deviceState` / `historyV1` | 遥测、V1 设备状态视图与 Host 历史（`/edge/history`） |
| `decisions` | 状态告警与动作异常处理 |
| `driverPackages` / `deviceProcesses` | 驱动包与受管设备进程 |
| `labV1` / `processManagement` / `debug` | 实验室档案与布局网格；V1 进程管理（`/v1/*`）；只读数据库诊断 |

具体角色、字段和路由以 [协议规范](../../docs/protocol/README.md) 及随包 OpenAPI 快照为准。
操作目录是契约描述，不替代后端权限检查。

## 错误与写操作

| 错误 | 处理原则 |
| --- | --- |
| `ApiError`，`status = 0` | 检查网络、超时和 CORS；保留上次读取的数据 |
| `ApiError`，404 / 503 | 当前进程未挂载该路由，或全量重置维护闸门；按「不可用」降级 |
| `BackendBusinessError` | V1 信封中的业务失败（`code` / `symbol` / `details`；`isNotFound` / `isConflict` / `isInvalidInput` / `isUnavailable`），不视作成功响应 |
| `InventoryCommandRejectedError` / `TaskCommandRejectedError` | 库存命令 / 任务命令被拒（`status: "rejected"`） |

用 `isCapabilityUnavailable(error)` 统一判断 404 / 503 / 业务码 5001 的降级态。

物料写入使用幂等信封，工作流等写入可能需要版本校验。
**不要无条件重试写请求或重新生成幂等键**；应根据对应接口规范决定恢复策略。
长操作应使用有间隔、有截止时间的轮询，并处理所有终态，不能忙循环等待。

## 版本与兼容性

SDK 遵循 SemVer，HTTP API 版本独立存在于 `/api/v1` 路径中。
`OPENLAB_PROTOCOL_VERSION` 与包版本一致，由测试校验。

兼容性不仅取决于 `unilabos` 版本号，也取决于后端构建是否包含所需端点。
最低版本与构建条件见 [CHANGELOG.md](CHANGELOG.md)，不支持的能力应显式降级。

## 维护与发布

```bash
pnpm --filter @openlab/protocol check
pnpm --filter @openlab/protocol test
pnpm --filter @openlab/protocol build
```

修改接口契约时，需同步后端、快照、生成类型、目录与测试，并使用独立后端环境执行 live smoke。
只更新包说明和元数据时，不应重新生成或改变接口契约。

发布前检查：

1. 更新版本常量、包版本与 CHANGELOG，声明兼容条件。
2. 通过契约测试及主应用检查，检查 tarball 中的导出、类型、文档和许可证。
3. 核实 npm scope 权限、目标版本及发布身份。
4. 从支持 npm provenance 的可信 CI 发布；普通本地打包不等于发布。
5. 发布后从 npm 安装验证。禁止将访问令牌写入源码或文档。

本仓库未因这些说明而自动配置或触发 npm 发布。

## 许可证

[Apache License 2.0](LICENSE)。后端、设备驱动与第三方标识遵循各自许可证。
