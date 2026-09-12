/**
 * 设备图（graphs-v1 域，unilabos/server/api/materials/graph.py）。
 *
 * 图不是独立权威：`unilab -g graph.json` 启动时上传的 node-link 拓扑落入
 * materials.db（设备/物料为 material 行，连线为 material_link 行），这里的
 * 「图」是快照与实时序列化两种读法：
 *
 * - `payload(identity)`：某次上传/保存的图快照（按 uuid 或 name）；
 * - `livePayload()`：当前真实拓扑（material + material_link 实时序列化）。
 *
 * 响应使用 Backend 信封 `{code, data}`；3002 = 图不存在。
 */
import { backendRequest, backendVoid, type HttpTransport, type JsonObject, type JsonValue } from "./common.js";

export interface GraphSummary {
  uuid: string;
  name: string;
  description: string | null;
  tags: JsonValue[];
  meta_data: JsonObject;
  revision: number;
  create_time: string;
  update_time: string;
  node_count: number;
}

export interface GraphPage {
  items: GraphSummary[];
  total: number;
  page: number;
  page_size: number;
}

/** 图节点：`config_info` 风格的物料/设备行（与 materials.v1 identity 同源）。 */
export interface GraphNode {
  id: string;
  uuid: string;
  name: string;
  display_name: string;
  description: string;
  /** `device` / `plate` / `well` / … registry resource_type。 */
  type: string;
  /** registry 类名（设备 class / 物料 class）。 */
  class: string;
  parent_uuid: string | null;
  pose: JsonObject | null;
  config: JsonObject;
  data: JsonObject;
  extra: JsonObject;
  meta_data: JsonObject;
  machine_name: string;
  barcode: string;
  template_name: string;
  resource_template_uuid: string;
  sites: JsonObject[];
  [key: string]: JsonValue | undefined;
}

export interface GraphLink {
  uuid?: string;
  source: string;
  target: string;
  type?: string;
  source_handle?: string;
  target_handle?: string;
  [key: string]: JsonValue | undefined;
}

/** node-link 载荷：`nodes` 是设备/物料行，`links` 是拓扑边。 */
export interface GraphPayload {
  nodes: GraphNode[];
  links: GraphLink[];
  directed?: boolean;
  multigraph?: boolean;
  graph?: JsonObject;
}

export interface GraphDetail extends GraphSummary {
  payload?: GraphPayload;
}

export interface GraphUpsertInput {
  name: string;
  payload: GraphPayload | JsonObject;
  uuid?: string | null;
  tags?: JsonValue[];
  description?: string | null;
  meta_data?: JsonObject;
}

export function createGraphsV1Api(http: HttpTransport) {
  return {
    /** GET /api/v1/graphs —— 图快照分页列表 */
    graphs: (params: { page?: number; page_size?: number; name?: string } = {}) =>
      backendRequest<GraphPage>(http, { method: "GET", path: "/api/v1/graphs", params }),
    /** GET /api/v1/graphs/{identity} —— 按 uuid 或 name 读取图元信息 */
    graph: (identity: string) =>
      backendRequest<GraphDetail>(http, {
        method: "GET",
        path: `/api/v1/graphs/${encodeURIComponent(identity)}`,
      }),
    /** GET /api/v1/graphs/{identity}/payload —— 图快照的 node-link 载荷 */
    payload: (identity: string) =>
      backendRequest<GraphPayload>(http, {
        method: "GET",
        path: `/api/v1/graphs/${encodeURIComponent(identity)}/payload`,
      }),
    /** GET /api/v1/graphs/live/payload —— 当前真实拓扑（非快照回放） */
    livePayload: () =>
      backendRequest<GraphPayload>(http, { method: "GET", path: "/api/v1/graphs/live/payload" }),
    /** POST /api/v1/graphs —— 上传/更新图（同名或同 uuid 幂等） */
    upsert: (body: GraphUpsertInput) =>
      backendRequest<GraphDetail>(http, { method: "POST", path: "/api/v1/graphs", body }),
    /** DELETE /api/v1/graphs/{identity} */
    remove: (identity: string) =>
      backendVoid(http, {
        method: "DELETE",
        path: `/api/v1/graphs/${encodeURIComponent(identity)}`,
      }),
  };
}

export type GraphsV1Api = ReturnType<typeof createGraphsV1Api>;
