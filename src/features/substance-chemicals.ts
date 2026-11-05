/**
 * 物料内容物 ↔ 化学品定义的关联（materials.db v3，`MaterialSubstance.chemical_uuid`）。
 *
 * 读取：有引用的内容物带 `chemical_uuid` 与只读摘要 `chemical`；化学品已删除时 `chemical` 为
 * null、uuid 保留；未关联的内容物两个键都不出现。
 *
 * 写入（PUT /instances/{uuid}/data 是整份替换）：只有用户改动的那一份带 `chemical_uuid`
 * （uuid = 关联，null = 解除）；其余内容物**省略**这个键——服务端按同名沿用已有引用，
 * 不会被这次写入改动。`chemical` 摘要从不回传（服务端忽略它，带上只会让请求体变大）。
 */
import { ApiError } from "@openlab/protocol";
import type {
  ChemicalSummary,
  MaterialsV1Aggregate,
  MaterialsV1DataWrite,
  MaterialsV1Precondition,
  MaterialsV1Substance,
} from "@openlab/protocol";

export type SubstanceLinkState =
  | { kind: "linked"; chemicalUuid: string; summary: ChemicalSummary }
  /** 引用的化学品已被软删除：uuid 还在，摘要为 null。 */
  | { kind: "deleted"; chemicalUuid: string }
  | { kind: "unlinked" };

export function substanceLink(substance: MaterialsV1Substance): SubstanceLinkState {
  const chemicalUuid = typeof substance.chemical_uuid === "string" ? substance.chemical_uuid : "";
  if (!chemicalUuid) return { kind: "unlinked" };
  return substance.chemical ? { kind: "linked", chemicalUuid, summary: substance.chemical } : { kind: "deleted", chemicalUuid };
}

/**
 * 回传用的内容物：写入模型的完整字段（物料权威要求 payload 与类型化请求体的完整 dump 逐字一致，
 * 缺省字段也要显式给出），去掉只读摘要；引用键默认省略（= 沿用）。
 */
function substanceWrite(substance: MaterialsV1Substance): MaterialsV1Substance {
  return {
    substance_uuid: substance.substance_uuid ?? null,
    name: substance.name,
    quantity: substance.quantity,
    quantity_unit: substance.quantity_unit,
    physical_state: substance.physical_state,
    composition: substance.composition ?? [],
    meta_data: substance.meta_data ?? {},
  };
}

/**
 * 改一份内容物的关联，得到整份数据写入体：`index` 那一份带 `chemical_uuid`（uuid 或 null），
 * 其余省略引用键。PUT data 是整份替换，且权威校验 payload 必须等于类型化请求体的完整 dump，
 * 所以 data / sites_initialized / 计数 / 状态原样带回，来源字段显式为 null（这是一次人工编辑）。
 */
export function dataWriteWithLink(
  data: MaterialsV1Aggregate["data"],
  index: number,
  chemicalUuid: string | null,
): MaterialsV1DataWrite {
  if (index < 0 || index >= data.substances.length) throw new RangeError(`内容物下标越界：${index}`);
  return {
    data: data.data,
    substances: data.substances.map((substance, i) =>
      i === index ? { ...substanceWrite(substance), chemical_uuid: chemicalUuid } : substanceWrite(substance),
    ),
    sites_initialized: data.sites_initialized,
    unknown_counter: data.unknown_counter ?? null,
    state_status: data.state_status,
    source_event_uuid: null,
    source_job_uuid: null,
    source_command_uuid: null,
    observed_at_ms: Date.now(),
  };
}

/** 以读到的聚合状态为前提：期间物料被别处改过（设备上报、别的页面）就整次拒绝，而不是覆盖。 */
export function aggregatePrecondition(aggregate: MaterialsV1Aggregate): MaterialsV1Precondition {
  return { aggregate_type: "material", aggregate_uuid: aggregate.material.material_uuid, expected_state_hash: aggregate.state_hash };
}

export interface SubstanceReference {
  materialUuid: string;
  materialName: string;
  substanceName: string;
  quantity: number;
  unit: string;
}

/** 哪些物料的内容物引用了某个化学品（化学品详情页「被引用」列表）。 */
export function substanceReferences(
  aggregates: readonly MaterialsV1Aggregate[],
  chemicalUuid: string,
): SubstanceReference[] {
  const result: SubstanceReference[] = [];
  for (const aggregate of aggregates) {
    for (const substance of aggregate.data.substances) {
      if (substance.chemical_uuid !== chemicalUuid) continue;
      result.push({
        materialUuid: aggregate.material.material_uuid,
        materialName: aggregate.material.display_name || aggregate.material.name,
        substanceName: substance.name,
        quantity: substance.quantity,
        unit: substance.quantity_unit,
      });
    }
  }
  return result;
}

/** 关联写入失败的人话（物料接口直出 HTTP 状态 + detail）；不认识的返回 null。 */
export function describeLinkError(error: unknown): { message: string; refresh: boolean } | null {
  if (!(error instanceof ApiError)) return null;
  if (error.status === 409) {
    return /unchanged/i.test(error.message)
      ? { message: "关联没有变化", refresh: false }
      : { message: "物料在这期间被别处改过（设备上报或其他页面），已重新读取，请再操作一次", refresh: true };
  }
  if (error.status === 422) return { message: `关联被拒绝：${error.message}`, refresh: false };
  if (error.status === 404) return { message: "物料已不存在，已重新读取", refresh: true };
  return null;
}
