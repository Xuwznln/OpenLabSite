# OpenLab — AI 开发约定

本项目鼓励用户让 AI **直接修改 Vue 源码**，不使用运行时插件、动态组件加载或
Module Federation。AI 应从现有页面复制结构，再按用户所在学科修改交互与布局。

开始工作前先读：

1. `README.md`
2. `docs/protocol/README.md`（协议域、进程角色、信封与实时模型）
3. `docs/VIBE_GUIDE.md`
4. 与目标页面最接近的 `src/views/` 或 `src/vibe-cases/` 页面

## 协议锁定（硬性红线）

前端改造不得修改或重新发明 Uni-Lab-OS 微后端协议。以下默认只读：

- `packages/protocol/`：协议类型、客户端、目录（`catalog.ts`）、测试与 live smoke
- `docs/protocol/`：各域规范
- 微后端的 REST 路由、SSE 事件名、Backend 信封业务码、materials.v1 幂等信封
- 状态词汇（Task / Node Job / 执行 job / 物料 lifecycle / registry 条目状态）
- 四个 SQLite 库的 schema

具体要求：

- 页面只能调用 `useConnectionStore().api.domains.*` 已暴露的方法；禁止手写 `/api/v1/...`。
- 禁止为了页面方便而修改返回字段、事件名、时间单位或 ID 语义。
- 不把 SSE 通知的 payload 当业务正文；正文一律重新经 HTTP 读取。
- 人工决策只能提交 Host 返回的 `options[].action`，不得自行拼装设备动作。
- 若现有接口不支持需求：保留降级空态，并在交付说明中列出缺少的能力，**不要擅自修改协议**。
- 只有项目维护者明确下达「修改协议」任务时，才允许改上述边界，并必须同步
  `packages/protocol`（类型 + 目录 + 测试）、`docs/protocol`、微后端实现与 live smoke。

## AI 可以自由修改的范围

- `src/views/`：页面及领域工作台
- `src/components/`：通用或领域组件
- `src/stores/`：只组合现有标准 API 的前端状态
- `src/features/`：纯函数（表单、校验、换算）
- `src/router.ts`、`src/App.vue` 导航：增加页面入口
- `src/theme.ts`、`src/style.css` 与组件 scoped CSS：视觉与交互
- `src/vibe-cases/`：新增可复制案例

优先复用：

- `useConnectionStore()`：连接、进程角色（`online` / `schedulerLocal` / `executionReady` / `registrySupport`）与协议客户端
- `useDevicesStore()`：设备目录（endpoint 能力 + 物料根 + 遥测 + HostLink 合成）
- `useSchedulerStore()`：Workflow 定义 / Task / Node Job 投影与提交
- `useDecisionsStore()`：动作异常 / 状态告警 / 干预
- `useEntityCacheStore()`：uuid → 名称
- `StatusPill`、`PageHeader`、`EntityRef`、`ActionParamFields` 等现有组件

## 页面设计约定

- 只提供亮色主题；使用 `src/style.css` 的 `--font-*`、`--paper/--panel/--hairline`、
  `--domain-accent*` 变量，禁止手写字体栈与随意配色。
- 每个页面必须有：在线且有数据、离线、空集合、角色不支持（`--role backend` 无设备执行面 /
  Host 无注册表）四种状态；用全局 `.degraded` 样式给出说明，不要静默转圈或弹错误。
- 优先做「一次实验的操作面」，避免重新做通用管理后台。
- 大体积接口（`materialsV1.templates`）只按需加载，不进入轮询。

## 交付门槛

```bash
pnpm run protocol:check
pnpm run protocol:test
pnpm run app:test
pnpm run app:build
```

四项必须通过。涉及协议的改动还需对着真实微后端跑
`pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write`。
不要提交生成的 `dist/`。不要修改协议来消除 TypeScript 错误；应在页面内正确使用现有类型。
