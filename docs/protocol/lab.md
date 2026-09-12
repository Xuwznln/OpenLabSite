# 实验室布局（lab-v1）

区域 / 围墙的像素格布局叠在物料权威的设备位置之上，是"这台 Host 的实验室"的人工标注：
所有连接同一微后端的浏览器看到同一份，因此权威在服务端（runtime.db 的 `lab_layout` 单行文档），
不再存 localStorage。直出 DTO，两种进程角色都挂载（`role = any`）。

后端实现：`unilabos/server/services/runtime/lab.py`（与 RuntimeService 共用 runtime.db 连接与写锁），
路由 `unilabos/server/api/runtime/lab.py`，协议模型 `unilabos/protocol/runtime/lab.py`。

## 1. 模型

```jsonc
{
  "layout_key": "default",          // 预留多布局；当前只有 default
  "revision": 3,                    // 0 = 从未保存；每次 PUT 成功 +1
  "cell_size": 100,                 // 格子边长，与物料权威 position 同单位（mm 时 100 = 10 cm）
  "zones": [
    { "id": "prep", "name": "样品制备区", "color": "#2e5bff", "cells": ["0,0", "1,0"] }
  ],
  "walls": ["5,5", "5,6"],
  "created_at_ms": 1788469175524,
  "updated_at_ms": 1788469175524
}
```

- 格子键 `"col,row"`（整数，允许负数），格子左上角 = `(col * cell_size, row * cell_size)`；
- 不变量由服务端校验（422）：区域 `id` 唯一；一个格子至多属于一个区域；区域格子与围墙互斥；
  颜色 `#rrggbb`（归一为小写）；区域 ≤ 200、格子总数 ≤ 100 000；重复格子键去重不报错。

## 2. 端点

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/v1/lab/layout` | 当前布局；从未保存时 `revision = 0`、区域 / 围墙为空、`cell_size` 取默认 100，**不是 404** |
| PUT | `/api/v1/lab/layout` | `{revision, cell_size, zones, walls}` 整份替换；`revision` 必须等于当前读到的版本，否则 **409**（`detail` 里带当前版本） |
| DELETE | `/api/v1/lab/layout` | 重置为未保存状态 → 204 |

## 3. 前端行为（`features/lab-layout.ts`、`views/LabMapView.vue`）

- 进页面读一次；每次绘制 600 ms 防抖后 `PUT`，成功用返回的 `revision` 覆盖本地版本；
- 409 → 提示"布局刚被其他人修改"，重读服务端版本，这一笔改动作废；
- 微后端没有该接口（老版本 404 / 503）→ 退回 localStorage（`openlab:lab-layout:<baseUrl>`），页面上说明；
- 迁移：服务端 `revision = 0` 而浏览器里有旧版布局时，自动 `PUT` 上去并清掉本地副本，提示一次；
- 导出 / 导入 JSON 仍保留，用于在不同 Host 之间搬运布局。

客户端：`api.domains.labV1.layout()` / `saveLayout(input)` / `resetLayout()`；类型 `LabV1Layout`、
`LabV1Zone`、`LabV1LayoutWrite`。
