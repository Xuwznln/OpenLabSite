/**
 * lab-v1 域：实验室视图（V1 lab 合同；unilabos/server/api/materials/lab.py），只读写物料权威（materials.db）。
 *
 * - `GET /lab/warehouse`：按品类（模板）聚合批次 / 数量 / 在库实例 / 库位分布；
 * - `GET /lab/assembly/{id}`：物料组合树（父子 / 库位链），V1 的 `placement` 键保留、恒为 null；
 * - `POST /lab/demo`：幂等写入仓储演示模板与批次，`zones` / `placements` 计数恒为 0。
 *
 * V1 的实验室档案、分区、摆放与 dev 的网格布局（`/lab/profile`、`/lab/layout`、`/lab/zones`、
 * `/lab/placements`）及其表已在核心删除（回 404），本域不再提供对应方法。
 */
import type { HttpTransport, JsonObject } from "./common.js";

/** `POST /lab/demo` 的写入计数（V1 形状；分区 / 摆放已删除，恒为 0）。 */
export interface LabV1DemoCounts {
  zones: number;
  templates: number;
  instances: number;
  placements: number;
  lots: number;
}

export function createLabV1Api(http: HttpTransport) {
  const base = "/api/v1/lab";
  return {
    /** 品类库存聚合（性质 / 品类为组织依据）。 */
    warehouse: () => http.request<JsonObject>({ method: "GET", path: `${base}/warehouse` }),
    /** 某实例的组合视图（父子 / 库位链；`placement` 恒为 null）。 */
    assembly: (subjectId: string) =>
      http.request<JsonObject>({ method: "GET", path: `${base}/assembly/${encodeURIComponent(subjectId)}` }),
    /** 写入仓储演示模板与批次（返回 `{seeded: 计数}`）。 */
    seedDemo: () => http.request<{ seeded: LabV1DemoCounts }>({ method: "POST", path: `${base}/demo` }),
  };
}

export type LabV1Api = ReturnType<typeof createLabV1Api>;
