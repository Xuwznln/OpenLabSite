# 材料实验工作台分支

本分支在上游通用版基础上增加 `#/materials`，供独立 OpenLab 页面和循证台共用同一份材料实验工作台源码。上游基线为 `b2791ca555afe62a2ffada37ed3e3a5a5bf99580`。

## 功能

- 从已有研究配方新建独立实验规划，调整参数并通过配套执行服务提交到 UniLabOS。
- 73 个工作流节点、Three.js 场景、倍速和已保存动作轨迹联动。
- 历史回放支持暂停、拖动定位、点击节点跳转；未执行节点明确标记。动作演示筛选机械臂、导轨和整盘搬运动作。
- 主 GLB 按内容哈希缓存，WebSocket 失败时通过同源 HTTP 更新状态；回放不提交任务或设备回执。
- 固定高度的场景与内部滚动面板。嵌入循证台时可传入 `headerTarget`，把标题和操作按钮放入宿主顶部；独立页面保留原位置。

这套渲染使用 Isaac USD 导出的几何及已保存的运动学轨迹。浏览器末帧回执证明网页到达指定位姿，不等于 Isaac 接触物理、碰撞验证或真实化学结果。

## 运行依赖

`src/views/MaterialsWorkbenchView.vue` 复用 `TaskGraphCanvas`、`WorkflowRunButton`、`ActionParamFields`、`ActionResult` 等原生组件，不更改 `@openlab/protocol`。

材料页依赖已配置的同源服务：`/edge` 为 UniLabOS Host，`/execution` 为材料工作流执行桥，`/sim` 为状态、轨迹与模型资源。这些配套服务、设备环境、模型资产和实验数据库不包含在本前端仓库中。仅克隆本仓库可构建界面，实际执行须接入配套服务。

循证台的集成与操作说明位于 [goai_research 材料前端发布说明](https://github.com/asimfish/goai_research/blob/feat/materials-console-20260918/docs/competition/材料前端发布_20260918.md)。

## 验证

```bash
pnpm install --frozen-lockfile
pnpm run protocol:check
pnpm run protocol:test
pnpm run app:test
pnpm run app:build
```

本次发布快照通过 133 个协议操作检查、55 项协议测试、181 项应用测试及类型检查与构建。相同前端此前在 5051 验证了布局、回放定位、参数控件和同源状态读取。
