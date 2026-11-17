# 实验室视图（lab-v1，V1 lab 合同）

`/api/v1/lab/*` 现在只剩三个**只依赖物料权威（materials.db）**的视图，V1 信封，由调度权威回答，两种进程角色都挂载
（`role = any`）。后端实现：路由 `unilabos/server/api/materials/lab.py`，服务 `unilabos/server/services/materials/lab.py`
（`LabViews`）。

## 1. 已删除的部分

按核心负责人 2026-11-17 的决定，实验室档案 / 分区 / 摆放与网格布局连同它们的表一起删除（materials.db
`lab_meta` / `lab_zone` / `lab_placement`、runtime.db `lab_layout`）：

| 删除的路由 | 原来是什么 |
| --- | --- |
| `GET` / `PUT /lab/profile` | 实验室档案（名称、领域包）与网格布局 `grid`（revision 乐观锁） |
| `GET /lab/layout` | V1 已放置实例视图 + 同一份 `grid` |
| `POST /lab/zones`、`DELETE /lab/zones/{zone_id}` | V1 二维矩形分区 |
| `POST /lab/placements`、`DELETE /lab/placements/{subject_id}` | 分区里的在台摆放 |

这些路径现在由应用级兜底返回 **HTTP 404 + 信封 4001**。协议包 `lab-v1` 域同步删除了 `profile` / `updateProfile` /
`layoutView` / `layout` / `saveLayout` / `resetLayout` / `upsertZone` / `deleteZone` / `upsertPlacement` /
`deletePlacement` 与对应类型；OpenLab 下线了实验室地图页（`LabMapView`、`features/lab-layout.ts`）。
设备与物料的位置仍在物料权威的 `position` 里（[materials.md](./materials.md)），装配视图照常使用。

保留不动的：`lab_graph`（命名设备图快照）、`material_link`（拓扑边）、`site`（库位）、批次上的 `warehouse_zone_id`。

## 2. 端点

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/lab/warehouse` | `labV1.warehouse()` | 按品类（模板）聚合批次 / 数量 / 在库实例 / 库位分布（`warehouse_zone_id` 分组） |
| GET | `/api/v1/lab/assembly/{subject_id}` | `labV1.assembly()` | 物料组合树（父子 / 库位链）；V1 的 `placement` 键保留、**恒为 null** |
| POST | `/api/v1/lab/demo` | `labV1.seedDemo()` | 幂等写入仓储演示模板与批次，返回 `{seeded: {zones, templates, instances, placements, lots}}`，`zones` / `placements` 恒为 0 |

OpenLab 目前没有页面直接调用这三个端点：装配视图（`/lab/assembly/:id`，`AssemblyView`）从 `/inventory/*` 与
`materialsV1.tree()` 读同一棵物料树。
