/**
 * 工作流入口参数（input_contract）与输出的前端口径：表单字段、取值校验、后端错误的人话翻译。
 *
 * 合同在服务端保留的 `workflow.meta_data.unilab`（{@link declaredWorkflowIo} 读取）；
 * 任务快照里的合同在 `task.workflow_snapshot.workflow`。这里只做表单与展示，最终校验
 * （类型 / 必填 / 未知键）以后端为准：后端拒绝时 {@link describeEntryInputError} 把
 * `workflow_input_required（/input/x）` 这类诊断码译成可读文案并指回字段。
 */
import {
  BACKEND_BUSINESS_CODES,
  BackendBusinessError,
  declaredWorkflowIo,
  isWorkflowInputReference,
  type BackendWorkflowInputParameter,
  type BackendWorkflowOutputDescriptor,
  type BackendWorkflowTask,
  type BackendWorkflowValueSchema,
  type JsonObject,
  type JsonValue,
} from "@openlab/protocol";

export type EntryFieldKind = "number" | "integer" | "string" | "boolean" | "enum" | "json";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 合同里的值 Schema → 表单控件种类；enum 优先，其余不认识的形状走 JSON 文本。 */
export function entryFieldKind(schema: BackendWorkflowValueSchema | null | undefined): EntryFieldKind {
  const record = asRecord(schema) ?? {};
  if (Array.isArray(record.enum) && record.enum.length) return "enum";
  switch (record.type) {
    case "number":
      return "number";
    case "integer":
      return "integer";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    default:
      return "json";
  }
}

const KIND_LABEL: Record<EntryFieldKind, string> = {
  number: "数字",
  integer: "整数",
  string: "文本",
  boolean: "是/否",
  enum: "选项",
  json: "JSON",
};

export function schemaTypeLabel(schema: BackendWorkflowValueSchema | null | undefined): string {
  return KIND_LABEL[entryFieldKind(schema)];
}

export function enumOptions(schema: BackendWorkflowValueSchema | null | undefined): JsonValue[] {
  const values = asRecord(schema)?.enum;
  return Array.isArray(values) ? (values as JsonValue[]) : [];
}

/** 展示名：有 title 用「title（name）」，否则就是 name。 */
export function entryParameterLabel(parameter: Pick<BackendWorkflowInputParameter, "name" | "title">): string {
  const title = parameter.title?.trim();
  return title && title !== parameter.name ? `${title}（${parameter.name}）` : parameter.name;
}

/** 值的紧凑文本（表格 / 列表展示）。 */
export function entryValueText(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "是" : "否";
  const text = JSON.stringify(value);
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** 一条入口参数的摘要：「体积（volume）· 数字 · 必填」/「· 默认 2」。 */
export function describeEntryParameter(parameter: BackendWorkflowInputParameter): string {
  const parts = [entryParameterLabel(parameter), schemaTypeLabel(parameter.schema)];
  if (Object.prototype.hasOwnProperty.call(parameter, "default")) parts.push(`默认 ${entryValueText(parameter.default)}`);
  else if (parameter.required) parts.push("必填");
  else parts.push("可选");
  return parts.join(" · ");
}

export function describeOutput(output: BackendWorkflowOutputDescriptor): string {
  return `${entryParameterLabel(output)} · ${schemaTypeLabel(output.schema)}`;
}

export function workflowEntryParameters(workflow: { meta_data?: unknown } | null | undefined): BackendWorkflowInputParameter[] {
  return declaredWorkflowIo(workflow).input_contract.parameters;
}

/** 任务提交时固化的工作流（workflow_snapshot.workflow）上声明的 I/O。 */
export function taskDeclaredIo(task: BackendWorkflowTask | null | undefined) {
  const workflow = asRecord(asRecord(task?.workflow_snapshot)?.workflow);
  return declaredWorkflowIo(workflow);
}

// ── 表单值 ──

/**
 * 表单值：数字 / 文本 / 选项存原值，`null` = 未填；是/否存 true / false / null；
 * JSON 存文本（提交时解析）。
 */
export type EntryFormValues = Record<string, unknown>;

function hasDefault(parameter: BackendWorkflowInputParameter): boolean {
  return Object.prototype.hasOwnProperty.call(parameter, "default");
}

function formValueOf(parameter: BackendWorkflowInputParameter, value: unknown): unknown {
  if (value === undefined || value === null) return null;
  return entryFieldKind(parameter.schema) === "json" ? JSON.stringify(value, null, 2) : value;
}

/** 初始表单：已有值（任务当前 input）优先，其次合同默认值，否则留空。 */
export function initialEntryValues(
  parameters: readonly BackendWorkflowInputParameter[],
  current: JsonObject | null | undefined = undefined,
): EntryFormValues {
  const values: EntryFormValues = {};
  for (const parameter of parameters) {
    const existing = current && Object.prototype.hasOwnProperty.call(current, parameter.name) ? current[parameter.name] : undefined;
    values[parameter.name] = formValueOf(parameter, existing !== undefined ? existing : hasDefault(parameter) ? parameter.default : undefined);
  }
  return values;
}

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === "string" && value.trim() === "");
}

function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

/** 单个表单值 → 合同值；不合法时返回错误文案。 */
export function parseEntryValue(
  parameter: BackendWorkflowInputParameter,
  raw: unknown,
): { value: JsonValue } | { error: string } {
  const kind = entryFieldKind(parameter.schema);
  switch (kind) {
    case "number":
    case "integer": {
      const number = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(number)) return { error: "请输入数字" };
      if (kind === "integer" && !Number.isInteger(number)) return { error: "请输入整数" };
      return { value: number };
    }
    case "boolean":
      if (typeof raw === "boolean") return { value: raw };
      return { error: "请选择是或否" };
    case "string":
      return { value: String(raw) };
    case "enum": {
      const options = enumOptions(parameter.schema);
      const hit = options.find((option) => sameJson(option, raw));
      return hit === undefined ? { error: `请选择：${options.map(entryValueText).join(" / ")}` } : { value: hit };
    }
    default: {
      let parsed: unknown;
      try {
        parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      } catch {
        return { error: "不是合法 JSON" };
      }
      const type = asRecord(parameter.schema)?.type;
      if (type === "array" && !Array.isArray(parsed)) return { error: "应为 JSON 数组" };
      if (type === "object" && !asRecord(parsed)) return { error: "应为 JSON 对象" };
      return { value: parsed as JsonValue };
    }
  }
}

export interface EntryInputBuild {
  input: JsonObject;
  /** 参数名 → 错误文案；有错误时不要提交。 */
  errors: Record<string, string>;
  /** 部分修改模式下真正变化的参数名。 */
  changed: string[];
}

/**
 * 表单 → 任务 `input`。
 *
 * - 提交运行：空着的可选参数 / 有默认值的参数不传（后端补默认值），空着的必填参数报错；
 * - 暂停修改（传 baseline = 任务当前 input）：只收集与当前值不同的参数，空着视为不改。
 */
export function buildEntryInput(
  parameters: readonly BackendWorkflowInputParameter[],
  values: EntryFormValues,
  options: { baseline?: JsonObject | null } = {},
): EntryInputBuild {
  const input: JsonObject = {};
  const errors: Record<string, string> = {};
  const changed: string[] = [];
  const partial = options.baseline !== undefined && options.baseline !== null;
  for (const parameter of parameters) {
    const raw = values[parameter.name];
    // 空文本也算没填：表单里没法区分「有意传空串」与「没填」，空串需要时走默认值。
    if (isBlank(raw)) {
      if (!partial && parameter.required && !hasDefault(parameter)) errors[parameter.name] = "必填";
      continue;
    }
    const parsed = parseEntryValue(parameter, raw);
    if ("error" in parsed) {
      errors[parameter.name] = parsed.error;
      continue;
    }
    if (partial) {
      if (sameJson(parsed.value, options.baseline?.[parameter.name])) continue;
      changed.push(parameter.name);
    }
    input[parameter.name] = parsed.value;
  }
  return { input, errors, changed };
}

// ── 后端错误 ──

export interface EntryInputErrorInfo {
  message: string;
  /** 指向的入口参数名（能定位时）。 */
  field?: string;
}

const ENTRY_DIAGNOSTIC = /(workflow_input_required|workflow_input_unknown|workflow_value_invalid|workflow_schema_invalid)（\/input\/([^/）]+)([^）]*)）/;

/**
 * 任务提交 / 暂停修改被后端按入口参数合同拒绝（code=1000 且带 `/input/` 诊断）时给出人话；
 * 其他错误返回 null，由调用方按通用错误处理。
 */
export function describeEntryInputError(
  error: unknown,
  parameters: readonly BackendWorkflowInputParameter[],
): EntryInputErrorInfo | null {
  if (!(error instanceof BackendBusinessError) || error.code !== BACKEND_BUSINESS_CODES.invalidInput) return null;
  const match = ENTRY_DIAGNOSTIC.exec(error.message);
  if (!match) return null;
  const [, code, field, rest] = match;
  const parameter = parameters.find((item) => item.name === field);
  const label = parameter ? entryParameterLabel(parameter) : field;
  const where = rest && rest !== "" ? `（位置 ${rest.replace(/^\//, "")}）` : "";
  if (code === "workflow_input_required") return { field, message: `入口参数「${label}」必填` };
  if (code === "workflow_input_unknown") {
    return { field, message: `「${field}」不是这个流程声明的入口参数；流程定义可能刚被修改，请刷新后重试` };
  }
  if (parameter) {
    const kind = entryFieldKind(parameter.schema);
    const expect = kind === "enum" ? `应为 ${enumOptions(parameter.schema).map(entryValueText).join(" / ")} 之一` : `应为${schemaTypeLabel(parameter.schema)}`;
    return { field, message: `入口参数「${label}」的值不符合要求${where}：${expect}` };
  }
  return { field, message: `入口参数「${label}」的值不符合要求${where}` };
}

/** PATCH input 的 3003：冻结参数 / 不在暂停 / revision 过期，统一给出可操作的说明。 */
export function describeInputEditConflict(error: unknown): string | null {
  if (!(error instanceof BackendBusinessError) || !error.isConflict) return null;
  const frozen = /入口参数 ['"]?([^'"\s]+)['"]? 已被已下发的节点使用/.exec(error.message);
  if (frozen) {
    return `入口参数「${frozen[1]}」已被已下发的节点使用，不能再修改；本次修改没有生效，已重新读取任务。`;
  }
  if (error.message.includes("暂停")) return "任务已不在暂停状态：入口参数只能在暂停时修改，已重新读取任务。";
  return "任务状态已变化（可能已恢复运行、已结束，或在别的页面改过参数），本次修改没有生效，已重新读取任务。";
}

// ── 节点 param 里的引用 ──

/** 节点 param 顶层引用的入口参数：param 键 → 入口参数名。 */
export function entryReferencesOf(param: unknown): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(asRecord(param) ?? {})) {
    if (isWorkflowInputReference(value)) result.set(key, value.parameter);
  }
  return result;
}
