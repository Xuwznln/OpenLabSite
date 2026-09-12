# materials.db：materials.v1 与设备图

物料权威只在微后端。设备（`resource_type=device`）、台面、耗材、孔位都是 material 行；
位点（site）归属 owner material；库存批次 / 预留是同一事务边界内的计量视图。
Edge 设备侧只持有投影，前端在权威完成变更后可经 `notify-device` 请求设备同步。

路由：`unilabos/server/api/materials/core.py`（materials.v1）与 `graph.py`（graphs-v1）。

## 1. 聚合模型

`MaterialsV1Aggregate = { material, position, position_version, data, sites, state_hash }`

- `material`（identity）：`material_uuid` `resource_id`（设备 id 即 resource_id）
  `parent_material_uuid` `name` `display_name` `resource_type` `class_name`
  `template_uuid` `template_name` `machine_name` `barcode` `lifecycle_status`
  （`active reserved in_use quarantined consumed retired`）`version`。
- `position`：`position_x/y/z`（可为 null = 权威中无坐标）、`size_width/height/depth`、
  旋转、`layout`、`cross_section_type`。实验室地图直接用这些字段绘制。
- `data`：`substances[]`（name / quantity / quantity_unit / physical_state）、业务 `data`、
  `content_version`。
- `sites[]`：`site_uuid` `label` `site_index` `occupied_material_uuid` `pose`
  `allowed_resource_categories` `owner_material_uuid`。位点占用只由权威维护。

`GET /materials/instances/{uuid}/tree` 返回一致性快照（`nodes[]` + `client_ref_map` +
`state_hash`），装配视图据此渲染。

## 2. 读接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/materials/templates[/{uuid}]` | 资源模板；`definition` 含 registry 全量展开树，**体积大，按需加载**。列表支持 `?include_definition=false`（`templates({ includeDefinition: false })`）只取目录字段，供选择器 / 计量库存页使用 |
| GET | `/materials/registry-classes` | registry 可实例化资源类目录（「入库 → 按件登记」用；模板 `name` 与 `registry_class` 同名） |
| GET | `/materials/instances?roots_only=&name=` | 物料聚合列表；`roots_only=true` 只返回根（设备 / 独立台面）；`name` 精确搜索 |
| GET | `/materials/instances/{uuid}` `/by-resource-id/{id}` `/{uuid}/tree` | 单个聚合 / 按 resource_id / 一致性树 |
| GET | `/materials/links?material_uuid=&link_type=` | 拓扑边（node-link 的 link 行） |
| GET | `/materials/lots[/{uuid}]` | 可计量库存批次 |
| GET | `/materials/reservations[/{uuid}]` `/by-job/{job_uuid}` | 调度器为作业冻结的库存需求 |
| GET | `/materials/changes?after_sequence=&limit=` | append-only 变更账本（sequence 游标） |
| SSE | `/materials/events` | `materials.changed` 失效通知 |

## 3. 写接口（幂等信封）

所有写请求正文是 `InventoryMutation`：

```json
{
  "protocol_version": "materials.v1",
  "command_uuid": "<uuid>",
  "effect_key": "<operation>:<command_uuid>",
  "operation": "instantiate_material",
  "actor_type": "frontend",
  "observed_at_ms": 1788294959000,
  "preconditions": [],
  "payload": { "registry_class": "demo_tips_24", "name": "tips_01" }
}
```

| 方法 | 路径 | operation | payload |
| --- | --- | --- | --- |
| POST | `/materials/instantiate` | `instantiate_material` | `{registry_class, name, barcode?}` → 微后端按 registry 实例化并落库，返回整棵树 |
| POST | `/materials/trees` | `create_material_tree` | `{nodes[]}` parent-first、恰一个根 |
| PATCH | `/materials/instances/{uuid}` | `patch_material` | 名称 / 条码 / 描述 / lifecycle_status 等标识字段 |
| PUT | `/materials/instances/{uuid}/data` | `put_material_data` | `substances[]` / `data` |
| PUT | `/materials/instances/{uuid}/position` | `put_material_position` | 位置 / 尺寸 |
| DELETE | `/materials/instances/{uuid}` | `delete_material` | `{material_uuid, recursive}`；释放占用位点 |
| POST | `/materials/move` | `move_material` | `{material_uuid, destination_site_uuid?, parent_material_uuid?}` 同一权威内换位 |
| POST | `/materials/transfer` | `transfer_material` | `{source_device_id, target_device_id, items[{material_uuid, target_material_uuid, target_site}]}` 跨设备：权威提交位置 + 两端设备同步，返回即已确认 |
| POST | `/materials/templates` / PUT `/templates/{uuid}` / DELETE | `put_template` / `delete_template` | 模板维护 |
| POST | `/materials/lots/inbound` | `inbound_inventory_lot` | `{template_uuid, unit, quantity, batch_no, expiry_at_ms, lot_uuid}`；带 `lot_uuid` = 补充已有批次。服务端把 payload 与模型完整 dump 逐字段比对，可选字段必须显式给 `null` / 空串——客户端 `inboundLot()` 已统一补齐 |
| POST | `/materials/links` / DELETE `/links/{uuid}` | — | 拓扑边 upsert / 删除（无信封） |
| POST | `/materials/notify-device` | — | `{device_id, action: add|update|remove, resource_uuids[]}` → `{notified: true|false|null}` |

错误映射：404 不存在；409 冲突 / 无变化 / 库存不足；410 变更被拒；422 校验失败；
503 转运时设备同步失败。物料页的「移动 / 转运」按目标位点所属根设备自动选择
`move`（同设备）或 `transfer`（跨设备）。

## 4. 设备图（graphs-v1，Backend 信封）

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
`payload.links[]` 是 `{source, target, type?, source_handle?, target_handle?}`。
