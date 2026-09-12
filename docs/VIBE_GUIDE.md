# 用 AI 直接改造 OpenLab 前端

OpenLab 是 Vue 3 实验室操作界面。推荐做法是让 AI 直接修改 Vue 页面，而不是安装动态
插件。领域差异体现在页面组合与交互；页面与微后端之间的协议保持稳定。

## 1. 给 AI 的标准提示词

```text
请先阅读 AGENTS.md、docs/VIBE_GUIDE.md、docs/protocol/README.md，并参考
src/vibe-cases/organic-synthesis/OrganicSynthesisWorkbench.vue。

为我创建一个 [学科/实验类型] 工作台，放在 src/views/[Name]WorkbenchView.vue，
并在 src/router.ts 增加路由、在 src/App.vue 的导航中加入入口。

我希望同一页面包含：
- [物料范围]
- [仪器/装置与要执行的动作]
- [领域计算器]
- [工作流参数]
- [实时进度/异常]

只允许使用 useConnectionStore().api.domains 已有方法和现有 stores
（devices / scheduler / decisions / entity-cache / pinned-metrics）。
禁止修改 packages/protocol、docs/protocol、后端路由、事件名、状态词汇。
若接口缺失，请做明确降级态并在交付说明里提出，不要修改协议。

保持亮色主题，使用全局字体与颜色变量；完成后运行 pnpm run build。
```

## 2. 可改层与不可改层

```text
领域工作台（用户/AI 自由修改）
  ├─ 页面布局、交互、计算器
  ├─ 设备 / 物料 / 工作流的组合方式
  └─ 领域术语、默认参数、快捷操作
                  │
标准前端接口（锁定）
  ├─ useConnectionStore().api.domains.*   协议客户端
  ├─ useDevicesStore()                    设备目录（endpoint + 物料根 + 遥测 + HostLink 合成）
  ├─ useSchedulerStore()                  Workflow 定义 / Task / Node Job 投影
  ├─ useDecisionsStore()                  动作异常 / 状态告警 / 干预
  └─ useEntityCacheStore()                uuid → 名称
                  │
微后端协议与数据真相（锁定）
  ├─ 十个协议域（docs/protocol/README.md）
  ├─ Backend 信封 / materials.v1 幂等信封
  └─ 四个 SQLite 库
```

## 3. 常用组合

```ts
import { useConnectionStore } from "../stores/connection";
import { useDevicesStore } from "../stores/devices";
import { useSchedulerStore } from "../stores/scheduler";

const conn = useConnectionStore();
const devices = useDevicesStore();   // devices.instruments / devices.byId(id) / device.actions
const sched = useSchedulerStore();   // sched.workflows / sched.activeTasks / sched.jobsByTask
```

| 目标 | 调用 |
| --- | --- |
| 列出在线设备与动作 | `devices.startPolling()` → `devices.instruments[].actions` |
| 动作参数表单 | `actionSchemaDetailFromCapability(capability)` + `features/action-param-form.ts` |
| 运行一个设备动作 | `conn.api.domains.workflowBackend.createTask({ execution_kind: "ad_hoc_device_action", device_id, action_name, param })` |
| 运行一条流程 | `sched.createTask(workflowUuid, "normal")` |
| 读物料树 / 位点占用 | `conn.api.domains.materialsV1.instances(true)`、`.tree(uuid)` |
| 按件登记一件可追踪物料（进入「在库物料」，工作流 `kind: "material"` 需求选取） | `conn.api.domains.materialsV1.instantiate(registryClass, name, barcode?)` |
| 按量登记 / 补充计量库存批次（散装试剂或耗材，工作流 `kind: "lot"` 需求预留与扣减） | `.inboundLot({ template_uuid, unit, quantity, batch_no?, expiry_at_ms?, lot_uuid? })`，模板目录用 `.templates({ includeDefinition: false })` |
| 出库到位点 / 移动 / 转运 | `.move({...})`（同设备）/ `.transfer({...})`（跨设备） |
| 设备实时属性 | `devices.byId(id)?.telemetry.properties` |
| 属性历史曲线 | `conn.api.domains.telemetryV1.events({ device_uuid, event_type: "property_sample" })` |
| 执行历史 | `conn.api.domains.historyV1.events({ limit, event_types })` |
| 待处理决策 | `useDecisionsStore().errorDecisions / incidents / interventions` |

## 4. 降级态要求

新页面至少验证四种状态：微后端在线且有数据、微后端离线、接口返回空集合、
连接 `--role backend` 进程（没有设备执行面：设备 / 遥测 / 人工决策不可用，注册表可用）。
用 `conn.online`、`conn.executionReady`、`conn.schedulerLocal`、`conn.registrySupport`
判断，并复用全局 `.degraded` 样式给出说明，不要静默转圈。

## 5. 交付门槛

```bash
pnpm run protocol:check
pnpm run protocol:test
pnpm run app:test
pnpm run app:build
```

不要提交 `dist/`；不要为了消除类型错误修改协议——应在页面里正确使用现有类型。
