# 实验室档案与布局（lab-v1，V1 lab 合同）

区域 / 围墙的像素格布局叠在物料权威的设备位置之上，是"这台实验室"的人工标注：所有连接同一微后端的浏览器看到同一份，
权威在服务端，不存 localStorage。V1 合同把它并入实验室档案：`GET /lab/profile` 的 `grid` 字段返回、
`PUT /lab/profile` 带 `grid` 整份替换；dev 原来的 `PUT | DELETE /lab/layout` 已删除，`GET /lab/layout` 改为 V1 的
已放置实例视图。V1 信封，由调度权威回答（跨 Host 重启保留），两种进程角色都挂载（`role = any`）。

后端实现：路由 `unilabos/server/api/materials/lab.py`，服务 `unilabos/server/services/materials/lab.py`
（档案 / 分区 / 摆放在 materials.db）；网格文档仍是 runtime.db 的 `lab_layout` 单行（`services/runtime/lab.py`）。

## 1. 模型

网格（`LabV1Layout`，即 `profile.grid` / `layout.grid`）：

```jsonc
{
  "layout_key": "default",          // 预留多布局；当前只有 default
  "revision": 3,                    // 0 = 从未保存；每次写入成功 +1
  "cell_size": 100,                 // 格子边长，与物料权威 position 同单位（mm 时 100 = 10 cm）
  "zones": [
    { "id": "prep", "name": "样品制备区", "color": "#2e5bff", "cells": ["0,0", "1,0"] }
  ],
  "walls": ["5,5", "5,6"],
  "create_time": "2026-11-14T22:13:20.000Z",   // V1 字段约定：ISO 8601 UTC 毫秒；从未保存时为 1970 纪元
  "update_time": "2026-11-14T22:21:40.000Z"
}
```

- 格子键 `"col,row"`（整数，允许负数），格子左上角 = `(col * cell_size, row * cell_size)`；
- 不变量由服务端校验（1000）：区域 `id` 唯一；一个格子至多属于一个区域；区域格子与围墙互斥；
  颜色 `#rrggbb`（归一为小写）；区域 ≤ 200、格子总数 ≤ 100 000；重复格子键去重不报错；
- 进程没有网格服务时 `grid` 为 null。

档案（`LabV1Profile`）：`name`、`domain`、`pack`（领域包：分类、危害等级、强调色）、`domains[]`、`zone_kinds`、`grid`。
V1 分区 `zones` / 摆放 `placements`（`LabV1PlacementZone` / `LabV1Placement`）是 materials.db 里按 id upsert 的资源，
与网格的像素区域是两套东西。

## 2. 端点

| 方法 | 路径 | SDK | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/lab/profile` | `labV1.profile()` | 档案 + `grid` |
| PUT | `/api/v1/lab/profile` | `labV1.updateProfile()` / `saveLayout()` / `resetLayout()` | `name` / `domain` 空值保持原值；`grid` 为对象时按 `revision` 乐观锁整份替换（过期 **3003**，消息里带当前版本），`grid: null` 重置为未保存状态；返回新档案 |
| GET | `/api/v1/lab/layout` | `labV1.layoutView()` / `layout()` | V1 已放置实例视图 `{zones, placements, storage_summary}` + 同一份 `grid`；从未保存时 `revision = 0`、区域 / 围墙为空，**不是 4001** |
| GET | `/api/v1/lab/warehouse` | `labV1.warehouse()` | 品类库存聚合 |
| POST / DELETE | `/api/v1/lab/zones[/{zone_id}]` | `upsertZone()` / `deleteZone()` | V1 分区 |
| POST / DELETE | `/api/v1/lab/placements[/{subject_id}]` | `upsertPlacement()` / `deletePlacement()` | V1 摆放 |
| GET | `/api/v1/lab/assembly/{subject_id}` | `labV1.assembly()` | 实例的装配视图 |
| POST | `/api/v1/lab/demo` | `labV1.seedDemo()` | 写入演示分区与摆放 |

`layout()` / `saveLayout(input)` / `resetLayout()` 是网格的便捷方法：前者取 `layoutView().grid`，后两者经
`PUT /lab/profile` 的 `grid` 写入并返回新的 `grid`。

## 3. 前端行为（`features/lab-layout.ts`、`views/LabMapView.vue`）

- 进页面读一次；每次绘制 600 ms 防抖后保存，成功用返回的 `revision` 覆盖本地版本；
- 3003（`BackendBusinessError.isConflict`）→ 提示"布局刚被其他人修改"，重读服务端版本，这一笔改动作废；
- 布局接口读取失败、或 `grid` 为 null 时明确报错并禁止编辑，不退回 localStorage，不自动导入开发期浏览器存储；
- 「更新于」取 `update_time`，1970 纪元（从未保存）时显示当前时间；
- 导出 / 导入 JSON 仍保留，用于在不同实验室之间搬运布局。

类型 `LabV1Layout`、`LabV1Zone`、`LabV1LayoutWrite`、`LabV1Profile`、`LabV1LayoutView`。
