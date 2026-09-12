# 参考案例（Vibe Cases）

这里放可直接复制、可运行的领域页面案例。它们不是运行时插件；用户或 AI 应复制
源码到 `src/views/` 后继续修改。

规则：

- 只调用 `useConnectionStore().api.domains.*` 现有方法和现有 stores。
- 不修改 `packages/protocol`、`docs/protocol` 或微后端协议。
- 领域计算器可写在页面中；设备、物料、执行状态必须来自标准接口。
- 案例必须能通过 `pnpm run build`，并对四种状态（在线 / 离线 / 空数据 / 角色不支持）给出降级态。

当前案例：

- `organic-synthesis/OrganicSynthesisWorkbench.vue`
  - 预览 `/#/cases/organic-synthesis`
  - 配方与条件计算器 → 在设备上执行一个动作（`ad_hoc_device_action`）→ 运行一条已定义
    的流程 → 进度、遥测与最近历史事件

新增案例建议命名：

```text
src/vibe-cases/
├── organic-synthesis/
├── inorganic-preparation/
├── biology-batch/
└── materials-characterization/
```

案例目标是提供 AI 容易模仿的完整页面，不要在这里创建新的协议抽象。
