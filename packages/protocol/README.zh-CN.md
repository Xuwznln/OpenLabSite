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
import { createEdgeApi, ApiError, BackendBusinessError } from "@openlab/protocol";

const api = createEdgeApi("http://127.0.0.1:8002", { timeoutMs: 10_000 });

try {
  const health = await api.health();
  const roots = await api.domains.materialsV1.instances(true);
  const tasks = await api.domains.workflowBackend.tasks({ page: 1, page_size: 20 });
  console.log({ health, roots, tasks });
} catch (error) {
  if (error instanceof BackendBusinessError) {
    console.error("后端业务错误", error.message);
  } else if (error instanceof ApiError) {
    console.error("请求失败", error.status, error.message);
  } else {
    throw error;
  }
}
```

`127.0.0.1:8002` 是调用方机器上的后端管理 API，不是 HostLink 设备通信端口。
能力是否可用取决于后端版本、进程角色和当前运行状态。

### 实时通知

SDK 提供事件流地址；订阅生命周期由应用管理。通知用于触发 HTTP 重读，不应作为完整业务正文。

```ts
const events = new EventSource(api.domains.workflowBackend.eventsUrl());
// 根据接口规范订阅所需事件，并重新读取对应资源。
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
| `system` | 健康、日志、组网与运行诊断 |
| `runtimeV1` | 执行端点、命令与作业投影 |
| `workflowBackend` | 工作流、任务、节点作业与执行控制 |
| `registry` | 设备和物料类型注册表 |
| `materialsV1` | 物料、位点、库存与变更账本 |
| `graphsV1` | 设备图 |
| `telemetryV1` / `historyV1` | 遥测状态与历史记录 |
| `decisions` | 状态告警与动作异常处理 |
| `driverPackages` / `deviceProcesses` | 驱动包与受管设备进程 |
| `labV1` / `debug` | 实验室布局与只读数据库诊断 |

具体角色、字段和路由以 [协议规范](../../docs/protocol/README.md) 及随包 OpenAPI 快照为准。
操作目录是契约描述，不替代后端权限检查。

## 错误与写操作

| 错误 | 处理原则 |
| --- | --- |
| `ApiError`，`status = 0` | 检查网络、超时和 CORS；保留上次读取的数据 |
| `ApiError`，404 / 503 | 根据接口与响应判断资源不存在、能力不可用或服务未就绪 |
| `ApiError`，409 / 422 / 5xx | 分别处理冲突、参数校验或服务端错误；保留原始错误体用于诊断 |
| `BackendBusinessError` | 后端信封中的业务失败；结合业务码处理，不视作成功响应 |

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
