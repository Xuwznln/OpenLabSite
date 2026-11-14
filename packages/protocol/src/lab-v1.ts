/**
 * lab-v1 域：实验室档案、布局网格、分区与摆放（V1 lab 合同；unilabos/server/api/materials/lab.py）。
 *
 * - `GET /lab/profile`：实验室名称 / 领域包 / 分区种类，以及 dev 的布局网格文档 `grid`；
 *   `PUT /lab/profile` 带 `grid` 整份替换（`revision` 乐观锁，过期 3003），`grid: null` 重置。
 *   原 `PUT|DELETE /lab/layout` 已删除，本客户端的 {@link LabV1Api.saveLayout} / `resetLayout` 走档案。
 * - `GET /lab/layout`：V1 已放置实例视图 `{zones, placements, storage_summary}`，附同一份 `grid`。
 * - 分区（zones）与摆放（placements）是 materials.db 里的 V1 资源，按 id upsert / 删除。
 *
 * 网格：`cell_size` 与 position 同单位，格子键 `"col,row"`（允许负数），格子左上角 =
 * (col * cell_size, row * cell_size)。一份文档所有浏览器共享；从未保存时 revision = 0。
 * 进程没有网格服务时 `grid` 为 null。
 */
import type { HttpTransport, JsonObject } from "./common.js";

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
  /** 0 = 从未保存；每次写入成功 +1。 */
  revision: number;
  cell_size: number;
  zones: LabV1Zone[];
  walls: string[];
  /** ISO 8601 UTC 毫秒（V1 字段约定）。 */
  create_time: string;
  update_time: string;
}

/** 网格写入：`revision` 必须等于当前读到的版本，否则 3003。 */
export interface LabV1LayoutWrite {
  revision: number;
  cell_size: number;
  zones: LabV1Zone[];
  walls: string[];
}

export interface LabV1DomainPack extends JsonObject {
  domain: string;
  name: string;
  accent: string;
}

export interface LabV1Profile {
  name: string;
  domain: string;
  pack: LabV1DomainPack;
  domains: LabV1DomainPack[];
  zone_kinds: JsonObject[] | string[];
  grid: LabV1Layout | null;
}

export interface LabV1ProfileUpdate {
  /** 空值保持原值。 */
  name?: string;
  domain?: string;
  /** 对象 = 按 revision 乐观锁整份替换；null = 重置。省略 = 不动。 */
  grid?: LabV1LayoutWrite | null;
}

/** V1 分区（materials.db lab_zone）。 */
export interface LabV1PlacementZone {
  zone_id: string;
  name: string;
  kind: string;
  x: number;
  y: number;
  w: number;
  h: number;
  meta: JsonObject;
  meta_json?: string;
  version: number;
}

/** V1 摆放（materials.db lab_placement）。 */
export interface LabV1Placement {
  subject_id: string;
  subject_kind: string;
  zone_id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label: string;
  meta: JsonObject;
  meta_json?: string;
  version: number;
}

export interface LabV1LayoutView {
  zones: LabV1PlacementZone[];
  placements: LabV1Placement[];
  storage_summary: JsonObject;
  grid: LabV1Layout | null;
}

export function createLabV1Api(http: HttpTransport) {
  const base = "/api/v1/lab";
  const updateProfile = (body: LabV1ProfileUpdate) =>
    http.request<LabV1Profile>({ method: "PUT", path: `${base}/profile`, body });
  return {
    profile: () => http.request<LabV1Profile>({ method: "GET", path: `${base}/profile` }),
    updateProfile,
    /** V1 已放置实例视图（含 grid）。 */
    layoutView: () => http.request<LabV1LayoutView>({ method: "GET", path: `${base}/layout` }),
    /** 当前布局网格（从未保存时 revision 0、区域 / 围墙为空；进程没有网格服务时 null）。 */
    layout: async () => (await http.request<LabV1LayoutView>({ method: "GET", path: `${base}/layout` })).grid,
    /** 整份替换网格；3003 = revision 过期，重读后再决定覆盖或合并。 */
    saveLayout: async (input: LabV1LayoutWrite) => (await updateProfile({ grid: input })).grid,
    /** 重置网格为未保存状态。 */
    resetLayout: async () => (await updateProfile({ grid: null })).grid,
    /** 品类库存聚合（性质 / 品类为组织依据）。 */
    warehouse: () => http.request<JsonObject>({ method: "GET", path: `${base}/warehouse` }),
    upsertZone: (zone: Partial<LabV1PlacementZone> & { zone_id: string }) =>
      http.request<LabV1PlacementZone>({ method: "POST", path: `${base}/zones`, body: zone }),
    deleteZone: (zoneId: string) =>
      http.request<JsonObject>({ method: "DELETE", path: `${base}/zones/${encodeURIComponent(zoneId)}` }),
    upsertPlacement: (placement: Partial<LabV1Placement> & { subject_id: string }) =>
      http.request<LabV1Placement>({ method: "POST", path: `${base}/placements`, body: placement }),
    deletePlacement: (subjectId: string) =>
      http.request<JsonObject>({ method: "DELETE", path: `${base}/placements/${encodeURIComponent(subjectId)}` }),
    /** 某实例的装配视图（父子 / 库位链）。 */
    assembly: (subjectId: string) =>
      http.request<JsonObject>({ method: "GET", path: `${base}/assembly/${encodeURIComponent(subjectId)}` }),
    /** 写入演示分区与摆放（返回 `{seeded}`）。 */
    seedDemo: () => http.request<{ seeded: boolean | number }>({ method: "POST", path: `${base}/demo` }),
  };
}

export type LabV1Api = ReturnType<typeof createLabV1Api>;
