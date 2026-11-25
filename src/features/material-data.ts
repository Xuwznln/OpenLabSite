/**
 * 物料自身数据（聚合的 `data.data`，例如加热样品的 `temperature_c`、孔位与枪头的 `volume`）的展示行。
 *
 * - 标量逐项列出，键名与取值原样（数字只去掉浮点尾差）；
 * - 嵌套对象按层级缩进展开，组行给出成员数；
 * - 元素全是标量的短数组合成一行，元素全是对象的数组逐项展开；
 * - 只有确实无从排版的值（混合数组、超过层级上限）才退回紧凑 JSON。
 *
 * 纯函数：不读也不改业务字段的语义，只决定怎么排版。
 */

export type MaterialDataTone = "number" | "boolean" | "text" | "empty";

export interface MaterialDataRow {
  /** 完整路径（`a.b[0].c`），列表 key 用 */
  path: string;
  /** 本层的键；数组元素是 `#1`、`#2`… */
  label: string;
  /** 嵌套层级，0 为顶层 */
  depth: number;
  /** `value` 标量（或合成一行的数组）；`group` 对象 / 数组的标题行；`json` 退回紧凑 JSON */
  kind: "value" | "group" | "json";
  text: string;
  tone: MaterialDataTone;
}

/** 最深展开到第几层（再往下退回 JSON）。 */
const MAX_DEPTH = 4;
/** 对象数组最多逐项展开几项。 */
const MAX_EXPANDED_ITEMS = 20;
/** 标量数组最多合成一行的元素数。 */
const MAX_INLINE_ITEMS = 12;

type Plain = Record<string, unknown>;

function isPlainObject(value: unknown): value is Plain {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isScalar(value: unknown): boolean {
  return value === null || value === undefined || ["string", "number", "boolean"].includes(typeof value);
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value) || Number.isInteger(value)) return String(value);
  // 只去掉浮点运算尾差（0.30000000000000004 → 0.3），不做业务上的取整
  return String(Number.parseFloat(value.toPrecision(12)));
}

function scalar(value: unknown): { text: string; tone: MaterialDataTone } {
  if (value === null || value === undefined) return { text: "—", tone: "empty" };
  if (typeof value === "number") return { text: formatNumber(value), tone: "number" };
  if (typeof value === "boolean") return { text: value ? "是" : "否", tone: "boolean" };
  const text = String(value);
  return text ? { text, tone: "text" } : { text: "（空字符串）", tone: "empty" };
}

function inlineScalar(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "number") return formatNumber(value);
  if (typeof value === "boolean") return value ? "是" : "否";
  return String(value);
}

function json(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function pushValue(rows: MaterialDataRow[], path: string, label: string, depth: number, value: unknown) {
  if (isScalar(value)) {
    rows.push({ path, label, depth, kind: "value", ...scalar(value) });
    return;
  }
  if (Array.isArray(value)) {
    pushArray(rows, path, label, depth, value);
    return;
  }
  if (isPlainObject(value)) {
    pushObject(rows, path, label, depth, value);
    return;
  }
  rows.push({ path, label, depth, kind: "json", text: json(value), tone: "text" });
}

function pushObject(rows: MaterialDataRow[], path: string, label: string, depth: number, value: Plain) {
  const keys = Object.keys(value);
  if (!keys.length) {
    rows.push({ path, label, depth, kind: "value", text: "（空对象）", tone: "empty" });
    return;
  }
  if (depth + 1 >= MAX_DEPTH) {
    rows.push({ path, label, depth, kind: "json", text: json(value), tone: "text" });
    return;
  }
  rows.push({ path, label, depth, kind: "group", text: `${keys.length} 项`, tone: "text" });
  for (const key of keys) pushValue(rows, `${path}.${key}`, key, depth + 1, value[key]);
}

function pushArray(rows: MaterialDataRow[], path: string, label: string, depth: number, value: unknown[]) {
  if (!value.length) {
    rows.push({ path, label, depth, kind: "value", text: "（空数组）", tone: "empty" });
    return;
  }
  if (value.every(isScalar) && value.length <= MAX_INLINE_ITEMS) {
    rows.push({ path, label, depth, kind: "value", text: value.map(inlineScalar).join(", "), tone: "text" });
    return;
  }
  if (value.every(isPlainObject) && depth + 2 < MAX_DEPTH) {
    rows.push({ path, label, depth, kind: "group", text: `数组 · ${value.length} 项`, tone: "text" });
    value.slice(0, MAX_EXPANDED_ITEMS).forEach((item, index) => {
      pushObject(rows, `${path}[${index}]`, `#${index + 1}`, depth + 1, item as Plain);
    });
    if (value.length > MAX_EXPANDED_ITEMS) {
      rows.push({
        path: `${path}[…]`,
        label: "…",
        depth: depth + 1,
        kind: "value",
        text: `另有 ${value.length - MAX_EXPANDED_ITEMS} 项未展开`,
        tone: "empty",
      });
    }
    return;
  }
  rows.push({ path, label, depth, kind: "json", text: json(value), tone: "text" });
}

/** 物料 `data.data` → 展示行（顶层键按存储顺序）。不是对象时整体作为一行 JSON。 */
export function materialDataRows(data: unknown): MaterialDataRow[] {
  if (!isPlainObject(data)) {
    return data === null || data === undefined ? [] : [{ path: "data", label: "data", depth: 0, kind: "json", text: json(data), tone: "text" }];
  }
  const rows: MaterialDataRow[] = [];
  for (const key of Object.keys(data)) pushValue(rows, key, key, 0, data[key]);
  return rows;
}

/** 顶层字段数（区块标题里的计数）。 */
export function materialDataCount(data: unknown): number {
  return isPlainObject(data) ? Object.keys(data).length : data === null || data === undefined ? 0 : 1;
}
