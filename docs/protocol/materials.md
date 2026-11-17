# materials.db：库存面（inventory）、dev 物料路由与设备图

物料权威只在调度权威进程（materials.db）。设备（`resource_type=device`）、台面、耗材、孔位都是 material 行；
位点（site）归属 owner material；库存批次 / 预留 / 内容物是同一事务边界内的计量视图。
Host 设备侧只持有投影，前端在权威完成变更后可经 `notify-device` 请求设备同步。

V1 合同之后物料面分三块，全部是 V1 信封（`POST /inventory/commands` 除外）：

| 域 | 路由 | 职责 | 客户端 |
| --- | --- | --- | --- |
| `inventory` | `/api/v1/inventory/*`（`server/api/materials/inventory.py`） | 读物料聚合 / 模板 / 批次 / 预留 / 关系 / 账本；**全部写入的唯一入口** `POST /inventory/commands` | `createInventoryApi` / `api.domains.inventory` |
| `materials-v1` | `/api/v1/materials/*` 的 dev 独有路由（`core.py`、`execution.py`） | 物料树、按 resource_id 读取、registry 资源类、拓扑边写、设备通知、按 Job 读预留、物理执行读、库存预演、`materials.changed` SSE | `createMaterialsV1Api` / `api.domains.materialsV1` |
| `graphs-v1` | `/api/v1/graphs*`（`graph.py`） | 设备图快照与实时拓扑 | `createGraphsV1Api` |

dev 时代按操作分路由的读写（`/materials/templates`、`/instances`、`/lots`、`/reservations`、`/links` 读、
`/changes`、`/instantiate`、`/trees`、`/move`、`/transfer`、`/lots/inbound`、`PATCH|PUT|DELETE /instances/{uuid}`…）
已从后端删除，不保留别名。V1 的 Backend 资源合同（`/materials`、`/materials/{uuid}*`、`/resource-templates*`）与
试剂 / 样品合同（`/reagents*`、`/samples*`…）OpenLabSite 暂未采用（见 [README §2.1](./README.md#21-浏览器暂未采用的-v1-控制台面)）。

## 1. 聚合模型

`MaterialsV1Aggregate = { material, position, position_version, data, sites, state_hash }`

- `material`（identity）：`material_uuid` `resource_id`（设备 id 即 resource_id）
  `parent_material_uuid` `name` `display_name` `resource_type` `class_name`
  `template_uuid` `template_name` `machine_name` `barcode` `lifecycle_status`
  （`active reserved in_use quarantined consumed retired`）`version`。
- **`name` 恒等于 `material_uuid`**（所有物料，包括设备；核心 2026-11-17 起，与 V1 有意不同），不是给人看的名字。
  人读标签是 `display_name`（孔位是 ordering 标识如 `A1`；权威保证非空，缺省依次回退旧名、PLR 键、`resource_id`），
  PyLabRobot 树里用的名字（PLR 键）在 `config.name`，唯一的人可读键是 `resource_id`（显示名可以重名）。
  前端显示 / 排序 / 去重 / 搜索一律用 `display_name`（`features/material-label.ts`，缺失时回退 `resource_id`）；
  `?name=` 筛选与根物料排序也按 `display_name`。
- 工作流 / 动作参数里的物料引用（ResourceSlot）写 `{id: resource_id, uuid}`：设备侧先按 `uuid` 解析，`id` 只在
  没有 uuid 时按 resource_id（或 UUID 形式的 id）查；不要再把物料 `name` 写成 `id`。
- `position`：`position_x/y/z`（可为 null = 权威中无坐标；三者要么都给要么都空）、`size_width/height/depth`、
  旋转、`layout`、`cross_section_type`。装配视图直接用这些字段绘制。
- `data`：`substances[]`（name / quantity / quantity_unit / physical_state，关联了化学品时还有
  `chemical_uuid` 与只读摘要 `chemical`）、业务 `data`、`content_version`。
- `sites[]`：`site_uuid` `label` `site_index` `occupied_material_uuid` `pose`
  `allowed_resource_categories` `owner_material_uuid`。位点占用只由权威维护。

`/inventory/instances` 条目在聚合外另附 V1 别名：`edge_uuid`（= material_uuid）、`template_id`、`barcode`、
`status`（= lifecycle_status）；单个实例另带 `relation`（父子 / 库位）与 `content`（内容物 + `content_version`）。
批次附 `lot_id` / `template_id`，模板附 `template_id`，预留附 `reservation_id` / `workflow_id` / `node_id`。
时间字段保持 dev 的 `*_at_ms`。

`GET /materials/instances/{uuid}/tree` 返回一致性快照（`nodes[]` + `client_ref_map` +
`state_hash`），装配视图据此渲染。

## 2. 读接口

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/inventory/instances?roots_only=&name=&status=&limit=&all=` | `inventory.instances({ rootsOnly, name, status })` | 物料聚合列表 `{instances}`；`roots_only=true` 只返回根（设备 / 独立台面，按 `display_name` 排序）；`name` 按 `display_name` 精确搜索；默认 `limit=500` 截断，SDK 缺省带 `all=true`（dev 扩展，取全集） |
| GET | `/inventory/instances/{edge_uuid}` | `inventory.instance(uuid)` | 单个聚合 + `relation` + `content` |
| GET | `/inventory/templates?name=&include_definition=&all=` | `inventory.templates({ includeDefinition })` | 资源模板目录 `{templates}`；缺省只取目录字段（`definition` 为 `{}`）。`includeDefinition: true` 附 registry 全量展开树，**体积大，按需加载** |
| GET | `/inventory/templates/{template_id}` | `inventory.template(id)` | 模板详情 |
| GET | `/inventory/lots?template_uuid=&unit=&include_quarantined=` | `inventory.lots()` | 可计量库存批次 `{lots}`（含 V1 `location_site_uuid` / `warehouse_zone_id`） |
| GET | `/inventory/lots/{lot_id}` | `inventory.lot(id)` | 批次详情 |
| GET | `/inventory/reservations?task_uuid=&status=` | `inventory.reservations()` | `{reservations, content_reservations, source_bindings}`：批次 / 物料预留 + 容器内容物预留 + 来源绑定 |
| GET | `/inventory/reservations/{reservation_id}` `/inventory/workflows/{task_uuid}/reservations` | `inventory.reservation(id)` / `workflowReservations(task)` | 单条预留（批次或内容物）/ 按任务 |
| GET | `/inventory/relations?material_uuid=&link_type=…` | `inventory.relations()` | `{relations, links}`：父子 / 库位关系 + 拓扑边（node-link 的 link 行） |
| GET | `/inventory/contents` | `inventory.contents()` | 有内容物的容器 |
| GET | `/inventory/ledger?after_id=&limit=` | `inventory.ledger(afterId, limit)` | append-only 变更账本（`after_id` 即 sequence 游标） |
| GET | `/inventory/snapshot` | `inventory.snapshot()` | 全量状态导出（带账本游标）；体积大，只按需读取 |
| GET | `/inventory/health` `/outbox/backlog` `/outbox/events` `/sync/cursors` `/commands/processed` | 同名方法 | 账本序号、投递积压、同步游标、已处理命令 |
| GET / POST | `/inventory/ingress-reservations[/{uuid}][/in-transit\|receive\|cancel]` | `ingressReservations()` 等 | 工站入站库位预留 |
| GET | `/materials/registry-classes` | `materialsV1.registryClasses()` | registry 可实例化资源类目录（「入库 → 按件登记」用；模板 `name` 与 `registry_class` 同名） |
| GET | `/materials/instances/by-resource-id/{id}` `/materials/instances/{uuid}/tree` | `materialsV1.byResourceId()` / `tree()` | 按 resource_id / 一致性树 |
| GET | `/materials/reservations/by-job/{job_uuid}` | `materialsV1.reservationByJob()` | 调度器为作业冻结的库存需求 |
| GET | `/materials/executions[/{job_uuid}]` | `materialsV1.executions()` / `execution()` | 物理动作执行记录（只读） |
| POST | `/materials/inventory/preview` | `materialsV1.previewInventory()` | 库存预演（不落账，`mutates: false`） |
| SSE | `/materials/events` | `materialsV1.eventsUrl()` | `materials.changed` 失效通知（`MATERIALS_CHANGED_EVENT`） |

## 3. 写接口：`POST /inventory/commands`

所有物料写请求都提交到这一个入口，与其它路由一样走 V1 信封：完成是成功信封，被拒（含同一 `command_id` 的拒绝重放）
是 HTTP 200 的失败信封：

```json
{ "code": 0, "data": { "command_id": "<command_uuid>", "status": "completed", "result": { "…": "MutationResult" }, "replayed": false } }
{ "code": 6007, "error": { "msg": "…", "code": "conflict:site_occupied", "details": { "command_id": "<command_uuid>", "replayed": false } } }
```

SDK 的写方法在被拒时抛 `InventoryCommandRejectedError`（继承 `BackendBusinessError`，`code` = 业务码，
`symbol` = 拒绝码，`details.command_id` / `replayed`，`isConflict` / `isNotFound` 照常可用）；`inventory.command(body)`
不抛拒绝，把失败信封还原成 `{command_id, status: "rejected", error, error_code, code, replayed}` 返回。

dev 变更的正文仍是 `InventoryMutation`（materials.v1 幂等信封），原路径参数放在顶层 `target_uuid`：

```json
{
  "protocol_version": "materials.v1",
  "command_uuid": "<uuid>",
  "effect_key": "<operation>:<command_uuid>",
  "operation": "instantiate_material",
  "actor_type": "human",
  "observed_at_ms": 1788294959000,
  "preconditions": [],
  "payload": { "registry_class": "demo_tips_24", "display_name": "tips_01" }
}
```

`payload` 与该 operation 的类型化请求体**完整 dump 逐字段比对**：每个字段都要显式给出且与后端缺省值一致，
否则 1000 `mutation.payload differs from the typed request body`。SDK 写方法统一补齐（`resourceTemplateWrite()`、
`materialDataWrite()`、`materialPositionWrite()` 等），页面不得手拼信封。

`actor_type` 是变更来源，落账本并渲染"来源" tag，取值为微后端
`KNOWN_ACTOR_TYPES`（`human` / `graph` / `registry` / `device` / `virtual_device` /
`scheduler` / `workflow` / `backend` / `edge`）。浏览器 / 操作员直接发起的写操作**必须**
显式携带 `human`（`materialsMutation()` 的默认值），不要依赖服务端默认值 `edge`——
`edge` 表示"未细分的 Edge 进程内写点"，展示为"Edge 上报"而不是"本地权威"。

| SDK（`inventory.*`） | operation | payload |
| --- | --- | --- |
| `instantiate(registryClass, displayName, barcode?)` | `instantiate_material` | `{registry_class, display_name, barcode?}` → 微后端按 registry 实例化并落库（显示名同时作 PLR 根名，缺省派生 `resource_id`），返回整棵树 |
| `createTree(value)` | `create_material_tree` | `{nodes[]}` parent-first、恰一个根；节点 identity / position / data / sites 带全字段 |
| `patch(uuid, value)` | `patch_material` + `target_uuid` | `display_name` / 条码 / 描述 / lifecycle_status 等标识字段；未改的字段显式 `null`；`MaterialPatch` 没有 `name`（= uuid，不可改） |
| `putData(uuid, value)` | `put_data` + `target_uuid` | 整份替换 `substances[]` / `data` / `sites_initialized` / 状态（漏传即回缺省）；内容物只带可写字段 |
| `putPosition(uuid, value)` | `put_position` + `target_uuid` | 位置 / 尺寸整份替换 |
| `remove(uuid, recursive)` | `delete_material` | `{material_uuid, recursive}`；释放占用位点 |
| `move(value)` | `move_material` | `{material_uuid, destination_site_uuid, parent_material_uuid}` 同一权威内换位 |
| `transfer(value)` | `transfer_material` | `{source_device_id, target_device_id, items[{material_uuid, target_material_uuid, target_site}]}` 跨设备：权威提交位置 + 两端设备同步，返回即已确认 |
| `createTemplate` / `putTemplate` / `deleteTemplate` | `put_template` / `delete_template` | 模板维护（`ResourceTemplateWrite` 全字段） |
| `inboundLot(value)` | `inbound_inventory_lot` | `{lot_uuid, template_uuid, batch_no, unit, quantity, expiry_at_ms, location_site_uuid, warehouse_zone_id}`；带 `lot_uuid` = 补充已有批次 |
| `typedCommand(type, payload, { commandId, expectedVersion })` | V1 类型化命令 | `reagent.dispense`、`inventory.*`（含 `inventory.lot.correct`）、`material.*`、`content.*`、`source.*`；`command_id` 幂等 |

不走命令入口的两类写：拓扑边 `POST /materials/links` / `DELETE /materials/links/{uuid}`（`materialsV1.upsertLink()` /
`deleteLink()`，信封），以及 `POST /materials/notify-device`（`{device_id, action: add|update|remove, resource_uuids[]}` →
`{notified: true|false|null}`，Host 角色）。

拒绝的业务码：不存在 4001 / 6000（`not_found:material`）/ 6006（`not_found:site`）；冲突 3003（状态）/ 4002（含无变化
`no_change`）/ 6007（库位已占用）/ 6010（身份冲突）/ 6011（活动占用）；参数非法 1000。物料页的「移动 / 转运」按目标位点
所属根设备自动选择 `move`（同设备）或 `transfer`（跨设备）。

## 4. 设备图（graphs-v1，V1 信封）

`unilab -g graph.json` 启动时上传的 node-link 拓扑落入 materials.db：节点是 material 行，
连线是 `material_link` 行；`lab_graph` 保存版本化快照。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/graphs?page=&page_size=&name=` | 图快照分页（`node_count` / `revision`） |
| GET | `/graphs/{identity}` `/{identity}/payload` | 按 uuid 或 name 读取图 / 其 node-link 载荷 |
| GET | `/graphs/live/payload` | 当前真实拓扑（material + material_link 实时序列化） |
| POST | `/graphs` | `{name, payload, uuid?, tags?, description?, meta_data?}` 上传 / 更新 |
| DELETE | `/graphs/{identity}` | 软删除快照 |

`payload.nodes[]` 是 `config_info` 风格的物料行（`id` `uuid` `type` `class` `pose` `sites`…），
`payload.links[]` 是 `{source, target, type?, source_handle?, target_handle?}`。V1 的 `GET /materials/graph`
（另一种 node-link 形状）暂未采用。

## 内容物关联化学品定义

`MaterialSubstance.chemical_uuid` 引用 `chemicals-v1` 的化学品定义；读取时有引用的内容物另带只读摘要
`chemical`（`chemical_uuid name cas inchi_key molecular_formula smiles molecular_weight density_g_per_ml
physical_state`），化学品已软删除时 `chemical` 为 null、uuid 保留；未关联的内容物两个键都不出现。
显式解除过关联的内容物带只读 `chemical_unlinked: true`。

写入（`put_data` / 建树 / 快照 / 增量）时三种写法语义不同：

| 写法 | 语义 |
| --- | --- |
| 省略 `chemical_uuid` | 沿用同一物料同名（不区分大小写）内容物已有的引用或「已解除」；都没有就按名称 / 英文名 / 别名 / CAS 唯一匹配自动关联 |
| `chemical_uuid: null` | 不关联，本次写入不自动匹配；对已关联的内容物就是解除，之后省略的写入（设备按名称上报）也不再自动关联 |
| `chemical_uuid: "<uuid>"` | 关联；必须是未删除的化学品，否则命令被拒（参数非法 1000）；并清除「已解除」 |

`chemical` / `chemical_unlinked` 写入时不发送（SDK 只带可写字段）。「省略」与「null」是两个不同的请求（幂等哈希不同）。
页面发出的写入所见即所得：**每一份**内容物都显式带 `chemical_uuid`——改动的那一份是新值，其余是当前显示的关联
（已关联即那个 uuid，化学品已删除也回传原 uuid；未关联即 null）。按名称自动匹配只发生在省略这个键的设备上报和
旧客户端上，用户解除的关联不会在改别的内容物时被重新自动关联。写入以读到的聚合 `state_hash` 作前提
（`aggregate_type: "material"`），期间被设备上报或别的页面改过就以冲突类业务码被拒，而不是覆盖。
