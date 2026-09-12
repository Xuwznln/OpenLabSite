/**
 * lab-v1 域：实验室布局（区域 / 围墙像素格）—— `unilabos/server/api/runtime/lab.py`，runtime.db。
 *
 * 布局叠在物料权威的设备位置之上：`cell_size` 与 position 同单位，格子键 `"col,row"`
 * （允许负数），格子左上角 = (col * cell_size, row * cell_size)。一个 Host 一份文档，所有
 * 连接同一微后端的浏览器共享；整份替换 + `revision` 乐观锁（从未保存时 revision = 0）。
 */
import type { HttpTransport } from "./common.js";

export interface LabV1Zone {
  /** 稳定 id（1–64 字符）。 */
  id: string;
  name: string;
  /** `#rrggbb`，服务端归一为小写。 */
  color: string;
  /** 格子键集合；一个格子至多属于一个区域，且不能同时是围墙。 */
  cells: string[];
}

export interface LabV1Layout {
  layout_key: string;
  /** 0 = 从未保存；每次 PUT 成功 +1。 */
  revision: number;
  cell_size: number;
  zones: LabV1Zone[];
  walls: string[];
  created_at_ms: number;
  updated_at_ms: number;
}

/** PUT 请求体：`revision` 必须等于当前读到的版本，否则 409。 */
export interface LabV1LayoutWrite {
  revision: number;
  cell_size: number;
  zones: LabV1Zone[];
  walls: string[];
}

export function createLabV1Api(http: HttpTransport) {
  const base = "/api/v1/lab";
  return {
    /** GET /lab/layout —— 当前布局（从未保存时 revision 0、区域 / 围墙为空）。 */
    layout: () => http.request<LabV1Layout>({ method: "GET", path: `${base}/layout` }),
    /** PUT /lab/layout —— 整份替换；409 = revision 过期，重读后再决定覆盖或合并。 */
    saveLayout: (input: LabV1LayoutWrite) =>
      http.request<LabV1Layout>({ method: "PUT", path: `${base}/layout`, body: input }),
    /** DELETE /lab/layout —— 重置为未保存状态（204）。 */
    resetLayout: () => http.request<void>({ method: "DELETE", path: `${base}/layout` }),
  };
}

export type LabV1Api = ReturnType<typeof createLabV1Api>;
