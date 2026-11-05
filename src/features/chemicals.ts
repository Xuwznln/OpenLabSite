/**
 * 化学品库（chemicals-v1）的前端口径：表单 ↔ 写入体、后端校验错误指回字段、摘要展示。
 *
 * CAS / InChIKey 的格式与校验位以后端为准（ChemicalService.normalize_*）；这里的本地检查只做
 * 即时提示，后端的拒绝文案（`CAS 登记号校验位不正确：'…'`、`已有相同 InChIKey 的化学品` 等）
 * 由 {@link describeChemicalError} 映射回对应字段。
 */
import {
  ApiError,
  BACKEND_BUSINESS_CODES,
  BackendBusinessError,
  type Chemical,
  type ChemicalPatchInput,
  type ChemicalPhysicalState,
  type ChemicalSummary,
  type ChemicalWriteInput,
} from "@openlab/protocol";

export const PHYSICAL_STATE_LABEL: Record<ChemicalPhysicalState, string> = {
  liquid: "液体",
  solid: "固体",
  gas: "气体",
  unknown: "未知",
};

export const PHYSICAL_STATE_OPTIONS = (Object.keys(PHYSICAL_STATE_LABEL) as ChemicalPhysicalState[]).map((value) => ({
  label: PHYSICAL_STATE_LABEL[value],
  value,
}));

export function physicalStateLabel(value: string | null | undefined): string {
  return PHYSICAL_STATE_LABEL[value as ChemicalPhysicalState] ?? (value || "—");
}

export type ChemicalField =
  | "name"
  | "name_en"
  | "aliases"
  | "cas"
  | "inchi_key"
  | "molecular_formula"
  | "smiles"
  | "molecular_weight"
  | "density_g_per_ml"
  | "physical_state"
  | "description";

/** 表单状态：文本字段用空串表示「未填」，数字用 null。 */
export interface ChemicalForm {
  name: string;
  name_en: string;
  aliases: string[];
  cas: string;
  inchi_key: string;
  molecular_formula: string;
  smiles: string;
  molecular_weight: number | null;
  density_g_per_ml: number | null;
  physical_state: ChemicalPhysicalState;
  description: string;
}

export function chemicalForm(chemical?: Chemical | null): ChemicalForm {
  return {
    name: chemical?.name ?? "",
    name_en: chemical?.name_en ?? "",
    aliases: [...(chemical?.aliases ?? [])],
    cas: chemical?.cas ?? "",
    inchi_key: chemical?.inchi_key ?? "",
    molecular_formula: chemical?.molecular_formula ?? "",
    smiles: chemical?.smiles ?? "",
    molecular_weight: chemical?.molecular_weight ?? null,
    density_g_per_ml: chemical?.density_g_per_ml ?? null,
    physical_state: chemical?.physical_state ?? "unknown",
    description: chemical?.description ?? "",
  };
}

/** 别名：去空白、去空、去重（保持首次出现的顺序）。 */
export function normalizeAliases(aliases: readonly string[]): string[] {
  return [...new Set(aliases.map((item) => item.trim()).filter(Boolean))];
}

const CAS_RE = /^(\d{2,7})-(\d{2})-(\d)$/;
const INCHI_KEY_RE = /^[A-Z]{14}-[A-Z]{10}-[A-Z]$/;

/** CAS 登记号本地检查（与后端同一规则：格式 + 校验位）；空串视为未填，返回 null。 */
export function casProblem(value: string): string | null {
  const cas = value.trim();
  if (!cas) return null;
  const match = CAS_RE.exec(cas);
  if (!match) return "格式应为 2~7 位-2 位-1 位校验位，如 7732-18-5";
  const digits = `${match[1]}${match[2]}`;
  const checksum = [...digits].reverse().reduce((sum, char, index) => sum + Number(char) * (index + 1), 0) % 10;
  return checksum === Number(match[3]) ? null : `校验位不正确（应为 ${checksum}）`;
}

/** InChIKey 本地检查（27 位标准格式，大小写不敏感，后端统一大写）。 */
export function inchiKeyProblem(value: string): string | null {
  const key = value.trim().toUpperCase();
  if (!key) return null;
  return INCHI_KEY_RE.test(key) ? null : "应为 27 位标准 InChIKey，如 XLYOFNOQVPJJNP-UHFFFAOYSA-N";
}

function optionalText(value: string): string | null {
  const text = value.trim();
  return text ? text : null;
}

export interface ChemicalFormCheck {
  errors: Partial<Record<ChemicalField, string>>;
}

/** 提交前的本地检查（名称必填、正数、CAS / InChIKey 形状）。 */
export function checkChemicalForm(form: ChemicalForm): ChemicalFormCheck {
  const errors: Partial<Record<ChemicalField, string>> = {};
  if (!form.name.trim()) errors.name = "名称必填";
  const cas = casProblem(form.cas);
  if (cas) errors.cas = cas;
  const inchi = inchiKeyProblem(form.inchi_key);
  if (inchi) errors.inchi_key = inchi;
  if (form.molecular_weight !== null && !(form.molecular_weight > 0)) errors.molecular_weight = "必须是正数";
  if (form.density_g_per_ml !== null && !(form.density_g_per_ml > 0)) errors.density_g_per_ml = "必须是正数";
  return { errors };
}

/** 新建：表单 → POST /chemicals 写入体。 */
export function chemicalWriteFromForm(form: ChemicalForm): ChemicalWriteInput {
  return {
    name: form.name.trim(),
    name_en: optionalText(form.name_en),
    aliases: normalizeAliases(form.aliases),
    cas: optionalText(form.cas),
    inchi_key: optionalText(form.inchi_key)?.toUpperCase() ?? null,
    molecular_formula: optionalText(form.molecular_formula),
    smiles: optionalText(form.smiles),
    molecular_weight: form.molecular_weight,
    density_g_per_ml: form.density_g_per_ml,
    physical_state: form.physical_state,
    description: form.description.trim(),
  };
}

/**
 * 编辑：只提交相对**打开表单时**改动过的字段（后端 PATCH 未提交的字段保持原值），带 expected_version。
 * 版本过期后重试时 `expectedVersion` 取重新读到的版本，但改动仍按打开时的快照比较——
 * 别人在这期间改的字段不会被表单里的旧值覆盖。没有改动时返回 null。
 */
export function chemicalPatchFromForm(
  original: Chemical,
  form: ChemicalForm,
  expectedVersion: number = original.version,
): ChemicalPatchInput | null {
  const next = chemicalWriteFromForm(form);
  const before = chemicalWriteFromForm(chemicalForm(original));
  const patch: ChemicalPatchInput = { expected_version: expectedVersion };
  let changed = false;
  for (const key of Object.keys(next) as (keyof ChemicalWriteInput)[]) {
    if (JSON.stringify(next[key]) === JSON.stringify(before[key])) continue;
    (patch as unknown as Record<string, unknown>)[key] = next[key];
    changed = true;
  }
  return changed ? patch : null;
}

export interface ChemicalErrorInfo {
  message: string;
  field?: ChemicalField;
  /** 版本过期 / 重复键等需要刷新或改值的冲突。 */
  conflict?: boolean;
}

const FIELD_HINTS: [RegExp, ChemicalField][] = [
  [/CAS/i, "cas"],
  [/InChIKey|inchi_key/i, "inchi_key"],
  [/molecular_weight|分子量/, "molecular_weight"],
  [/density_g_per_ml|密度/, "density_g_per_ml"],
  [/physical_state|物态/, "physical_state"],
  [/aliases|别名/, "aliases"],
  [/\bname\b|名称/, "name"],
];

/**
 * 化学品写入失败 → 可读文案与字段：业务码 1000（校验）/ 3003（重复键或版本过期）/ 3002（已删除），
 * 以及 FastAPI 422 的字段校验（loc 指向 body 字段）。
 */
export function describeChemicalError(error: unknown): ChemicalErrorInfo | null {
  if (error instanceof BackendBusinessError) {
    const message = error.message;
    if (error.code === BACKEND_BUSINESS_CODES.notFound) return { message: "化学品不存在或已被删除，已刷新列表", conflict: true };
    if (error.code === BACKEND_BUSINESS_CODES.conflict) {
      if (/CAS/.test(message)) return { message: "已有相同 CAS 登记号的化学品（同一 CAS 只能登记一次）", field: "cas", conflict: true };
      if (/InChIKey/i.test(message)) return { message: "已有相同 InChIKey 的化学品", field: "inchi_key", conflict: true };
      return { message: "化学品已被别人修改或删除（版本已变化），已重新读取；请确认后再操作", conflict: true };
    }
    if (error.code === BACKEND_BUSINESS_CODES.invalidInput) {
      const field = FIELD_HINTS.find(([pattern]) => pattern.test(message))?.[1];
      return { message, ...(field ? { field } : {}) };
    }
    return null;
  }
  if (error instanceof ApiError && error.status === 422) {
    const detail = error.body?.detail;
    if (Array.isArray(detail) && detail[0]) {
      const loc = detail[0].loc ?? [];
      const field = String(loc[loc.length - 1] ?? "");
      const known = ["name", "name_en", "aliases", "cas", "inchi_key", "molecular_formula", "smiles", "molecular_weight", "density_g_per_ml", "physical_state", "description"];
      return {
        message: /greater than 0/.test(detail[0].msg) ? "必须是正数" : detail[0].msg,
        ...(known.includes(field) ? { field: field as ChemicalField } : {}),
      };
    }
  }
  return null;
}

// ── 展示 ──

export function formatNumber(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return Number(value.toFixed(digits)).toString();
}

/** 摘要的一行文字：「水 · CAS 7732-18-5 · H2O · 18.015 g/mol」（缺的项省略）。 */
export function chemicalSummaryText(summary: Pick<ChemicalSummary, "name" | "cas" | "molecular_formula" | "molecular_weight">): string {
  const parts = [summary.name];
  if (summary.cas) parts.push(`CAS ${summary.cas}`);
  if (summary.molecular_formula) parts.push(summary.molecular_formula);
  if (summary.molecular_weight) parts.push(`${formatNumber(summary.molecular_weight)} g/mol`);
  return parts.join(" · ");
}

export function chemicalPath(chemicalUuid: string): string {
  return `/chemicals/${encodeURIComponent(chemicalUuid)}`;
}

export function fmtMs(ms: number | null | undefined): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
