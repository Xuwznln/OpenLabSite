/**
 * 化学品定义（chemicals-v1 域，unilabos/server/api/materials/chemicals.py；落 materials.db）。
 *
 * 一条定义以 `chemical_uuid` 为主键；CAS 登记号与 InChIKey 是**可空**唯一键（只在未删除的
 * 行之间唯一，软删除后可以重新登记）。CAS 校验格式与校验位，InChIKey 统一大写。
 *
 * - 响应使用 `{code, data, error}` 信封（经 common.ts 唯一解包器抛 BackendBusinessError）；
 *   业务码与 workflow / graphs 同一张表（Uni-Lab-OS api/envelope.py）：1000 参数错误、
 *   3002 不存在、3003 冲突（重复 CAS / InChIKey、版本过期）。
 * - 修改与删除带 `expected_version` 乐观锁；时间是毫秒整数（`*_ms`）。
 */
import { BACKEND_BUSINESS_CODES, backendRequest, backendVoid, type HttpTransport, type JsonObject } from "./common.js";

export type ChemicalPhysicalState = "liquid" | "solid" | "gas" | "unknown";

/** 化学品定义 DTO：可空字段是 `null`（不是键缺席）。 */
export interface Chemical {
  chemical_uuid: string;
  name: string;
  name_en: string | null;
  aliases: string[];
  cas: string | null;
  inchi_key: string | null;
  molecular_formula: string | null;
  smiles: string | null;
  /** g/mol，> 0 */
  molecular_weight: number | null;
  /** g/mL，> 0 */
  density_g_per_ml: number | null;
  physical_state: ChemicalPhysicalState;
  description: string;
  meta_data: JsonObject;
  created_at_ms: number;
  updated_at_ms: number;
  /** 乐观锁版本，从 1 开始，每次修改 +1。 */
  version: number;
}

/**
 * 物料内容物读取时附带的化学品摘要（`MaterialsV1Substance.chemical`，只读，写入时被忽略）。
 * 字段与 {@link Chemical} 同名同义，是它的子集。
 */
export type ChemicalSummary = Pick<
  Chemical,
  | "chemical_uuid"
  | "name"
  | "cas"
  | "inchi_key"
  | "molecular_formula"
  | "smiles"
  | "molecular_weight"
  | "density_g_per_ml"
  | "physical_state"
>;

/** POST /chemicals（拒绝未知字段）。 */
export interface ChemicalWriteInput {
  name: string;
  name_en?: string | null;
  aliases?: string[];
  cas?: string | null;
  inchi_key?: string | null;
  molecular_formula?: string | null;
  smiles?: string | null;
  molecular_weight?: number | null;
  density_g_per_ml?: number | null;
  physical_state?: ChemicalPhysicalState;
  description?: string;
  meta_data?: JsonObject;
  /** 缺省由服务端生成。 */
  chemical_uuid?: string | null;
}

/** PATCH /chemicals/{uuid}：只提交要改的字段，未提交的保持原值。 */
export interface ChemicalPatchInput {
  expected_version: number;
  name?: string;
  name_en?: string | null;
  aliases?: string[];
  cas?: string | null;
  inchi_key?: string | null;
  molecular_formula?: string | null;
  smiles?: string | null;
  molecular_weight?: number | null;
  density_g_per_ml?: number | null;
  physical_state?: ChemicalPhysicalState;
  description?: string;
  meta_data?: JsonObject;
}

export type ChemicalListParams = {
  /** 名称 / 别名 / CAS / 分子式模糊匹配 */
  q?: string;
  /** 精确匹配 */
  cas?: string;
  /** 精确匹配（大小写不敏感） */
  inchi_key?: string;
  physical_state?: ChemicalPhysicalState | "";
  page?: number;
  /** 1..500，默认 50 */
  page_size?: number;
};

export interface ChemicalPage {
  items: Chemical[];
  total: number;
  page: number;
  page_size: number;
}

/** 化学品定义业务码：与 workflow / graphs 共用 BACKEND_BUSINESS_CODES。 */
export const CHEMICAL_BUSINESS_CODES = {
  invalidInput: BACKEND_BUSINESS_CODES.invalidInput,
  notFound: BACKEND_BUSINESS_CODES.notFound,
  conflict: BACKEND_BUSINESS_CODES.conflict,
} as const;

export function createChemicalsV1Api(http: HttpTransport) {
  const item = (chemicalUuid: string) => `/api/v1/chemicals/${encodeURIComponent(chemicalUuid)}`;
  return {
    /** GET /api/v1/chemicals —— 分页搜索 */
    chemicals: (params: ChemicalListParams = {}) =>
      backendRequest<ChemicalPage>(http, { method: "GET", path: "/api/v1/chemicals", params }),
    /** POST /api/v1/chemicals —— 登记（201；重复 CAS / InChIKey 3003） */
    createChemical: (body: ChemicalWriteInput) =>
      backendRequest<Chemical>(http, { method: "POST", path: "/api/v1/chemicals", body }),
    /** GET /api/v1/chemicals/{chemical_uuid} —— 不存在或已删除 3002 */
    chemical: (chemicalUuid: string) =>
      backendRequest<Chemical>(http, { method: "GET", path: item(chemicalUuid) }),
    /** PATCH /api/v1/chemicals/{chemical_uuid} —— 版本过期 3003 */
    updateChemical: (chemicalUuid: string, body: ChemicalPatchInput) =>
      backendRequest<Chemical>(http, { method: "PATCH", path: item(chemicalUuid), body }),
    /** DELETE /api/v1/chemicals/{chemical_uuid}?expected_version= —— 软删除，CAS / InChIKey 让出 */
    deleteChemical: (chemicalUuid: string, expectedVersion: number) =>
      backendVoid(http, {
        method: "DELETE",
        path: item(chemicalUuid),
        params: { expected_version: expectedVersion },
      }),
  };
}

export type ChemicalsV1Api = ReturnType<typeof createChemicalsV1Api>;
