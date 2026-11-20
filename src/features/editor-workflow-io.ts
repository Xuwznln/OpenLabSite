/**
 * 编排画布里声明工作流入口参数与输出（随草稿保存，保存定义时经 PUT /io 写入权威）。
 *
 * - 入口参数：画布节点在 param **顶层**写 `{"kind": "workflow_input", "parameter": 名}` 引用；
 * - 输出：绑定到画布节点（编辑器节点 id）返回值里的路径 `dataKey`（空串 = 整个返回值），
 *   提交时按节点的权威 uuid 换成 `{kind: "node_output", workflow_node_uuid, data_key}`。
 *
 * 写入顺序（{@link planIoSave}）：PUT /graph 要求图里引用的入口参数已声明，PUT /io 要求输出
 * 绑定的节点已存在、且不能删掉图里仍引用的参数。所以图里出现新引用时先声明一个「新旧并集」
 * 的输入合同（节点输出暂时清空），存图后再写最终合同与输出。
 *
 * 物料（ResourceSlot）入口参数在核心里必须有同名的物料输出（物料不能在组合工作流边界上静默丢失），
 * 画布不单独编辑它们：声明时自动补一个透传输出（`implicit: true`，绑定回同名入口参数），与
 * 「从模板创建」生成的工作流一致。
 */
import {
  isWorkflowInputReference,
  workflowInputReference,
  type BackendWorkflowDeclaredIo,
  type BackendWorkflowInputContract,
  type BackendWorkflowInputParameter,
  type BackendWorkflowOutputBinding,
  type BackendWorkflowOutputContract,
  type BackendWorkflowOutputDescriptor,
  type JsonObject,
  type JsonValue,
} from "@openlab/protocol";
import { entryFieldKind, entryReferencesOf, enumOptions, parseEntryValue, type EntryFieldKind } from "./workflow-io";

export interface EditorOutput {
  name: string;
  title?: string;
  schema: JsonObject;
  /** 编辑器节点 id；提交时换成权威 uuid。 */
  nodeId: string;
  /** 返回值里的路径，空串 = 整个返回值。 */
  dataKey: string;
}

export interface EditorWorkflowIo {
  inputs: BackendWorkflowInputParameter[];
  outputs: EditorOutput[];
}

export interface IoDeclaration {
  input_contract: BackendWorkflowInputContract;
  output_contract: BackendWorkflowOutputContract;
  output_bindings: Record<string, BackendWorkflowOutputBinding>;
}

/** 编辑器里可选的类型（JSON 等复杂 Schema 只保留从权威读到的原样，不在这里新建）。 */
export type EditorEntryKind = "number" | "integer" | "string" | "boolean" | "enum";

export const ENTRY_KIND_OPTIONS: { label: string; value: EditorEntryKind }[] = [
  { label: "数字", value: "number" },
  { label: "整数", value: "integer" },
  { label: "文本", value: "string" },
  { label: "是/否", value: "boolean" },
  { label: "选项（文本）", value: "enum" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function cloneJson<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}

export function emptyEditorIo(): EditorWorkflowIo {
  return { inputs: [], outputs: [] };
}

/** 与核心 `handle_projection.resource_slot_schema` 同一判定：`$slot: ResourceSlot`，或数组项 / anyOf 成员里有它。 */
export function isResourceSlotSchema(schema: unknown): boolean {
  const record = asRecord(schema);
  if (!record) return false;
  if (record.$slot === "ResourceSlot") return true;
  if (isResourceSlotSchema(record.items)) return true;
  return Array.isArray(record.anyOf) && record.anyOf.some((member) => isResourceSlotSchema(member));
}

/** 没有同名输出的物料入口参数 → 透传输出（核心要求每个物料入口参数都有同名物料输出）。 */
function implicitResourceOutputs(
  inputs: readonly BackendWorkflowInputParameter[],
  taken: ReadonlySet<string>,
): { outputs: BackendWorkflowOutputDescriptor[]; bindings: Record<string, BackendWorkflowOutputBinding> } {
  const outputs: BackendWorkflowOutputDescriptor[] = [];
  const bindings: Record<string, BackendWorkflowOutputBinding> = {};
  for (const input of inputs) {
    if (taken.has(input.name) || !isResourceSlotSchema(input.schema)) continue;
    outputs.push({ name: input.name, schema: cloneJson(input.schema), implicit: true });
    bindings[input.name] = workflowInputReference(input.name);
  }
  return { outputs, bindings };
}

/** 草稿里读回的 io（形状不对的条目丢弃）。 */
export function normalizeEditorIo(raw: unknown): EditorWorkflowIo | null {
  const record = asRecord(raw);
  if (!record) return null;
  const inputs = (Array.isArray(record.inputs) ? record.inputs : [])
    .filter((item) => typeof asRecord(item)?.name === "string" && asRecord(asRecord(item)?.schema))
    .map((item) => cloneJson(item) as BackendWorkflowInputParameter);
  const outputs = (Array.isArray(record.outputs) ? record.outputs : [])
    .map((item) => asRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item && typeof item.name === "string" && asRecord(item.schema)))
    .map((item) => ({
      name: String(item.name),
      ...(typeof item.title === "string" && item.title ? { title: item.title } : {}),
      schema: cloneJson(item.schema) as JsonObject,
      nodeId: String(item.nodeId ?? ""),
      dataKey: String(item.dataKey ?? ""),
    }));
  return { inputs, outputs };
}

export function editorKindOf(schema: JsonObject | null | undefined): EditorEntryKind | "json" {
  const kind: EntryFieldKind = entryFieldKind(schema);
  if (kind === "enum") return enumOptions(schema).every((item) => typeof item === "string") ? "enum" : "json";
  // 物料（ResourceSlot）只保留权威读到的原样，编辑器不新建
  if (kind === "resource" || kind === "resources") return "json";
  return kind;
}

export function schemaOfKind(kind: EditorEntryKind, enumValues: readonly string[] = []): JsonObject {
  if (kind === "enum") {
    const values = [...new Set(enumValues.map((item) => item.trim()).filter(Boolean))];
    return { type: "string", enum: values.length ? values : ["A"] };
  }
  return { type: kind };
}

/** 与 Python `str.isidentifier()` 近似：字母或下划线开头，后接字母 / 数字 / 下划线（含中文）。 */
export function isValidEntryName(name: string): boolean {
  return /^[\p{L}_][\p{L}\p{N}_]*$/u.test(name);
}

/** 由参数键生成不重名的入口参数名。 */
export function suggestEntryName(key: string, taken: ReadonlySet<string>): string {
  let base = key.replace(/[^\p{L}\p{N}_]+/gu, "_").replace(/^_+|_+$/g, "") || "param";
  if (!/^[\p{L}_]/u.test(base)) base = `p_${base}`;
  let name = base;
  for (let index = 2; taken.has(name); index++) name = `${base}_${index}`;
  return name;
}

/** 从参数当前值（与动作 schema 的属性类型）推断入口参数类型。 */
export function inferEntryKind(value: unknown, goalProperty?: unknown): EditorEntryKind {
  const type = asRecord(goalProperty)?.type;
  if (type === "integer" || type === "number" || type === "boolean" || type === "string") return type;
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

/** 把节点参数设为某个入口参数（写入顶层引用）。返回新的 paramJson。 */
export function bindParamToEntry(paramJson: string, key: string, parameter: string): string {
  const param = parseParam(paramJson);
  param[key] = workflowInputReference(parameter) as unknown as JsonValue;
  return JSON.stringify(param, null, 2);
}

/** 解除引用，写回一个静态值；没有值（入口参数没有默认值）时删掉这个键，参数留空待填。 */
export function unbindParamFromEntry(paramJson: string, key: string, value: JsonValue | undefined): string {
  const param = parseParam(paramJson);
  if (value === undefined) delete param[key];
  else param[key] = cloneJson(value);
  return JSON.stringify(param, null, 2);
}

function parseParam(paramJson: string): JsonObject {
  const value = JSON.parse(paramJson.trim() ? paramJson : "{}") as unknown;
  const record = asRecord(value);
  if (!record) throw new Error("参数不是 JSON 对象");
  return record as JsonObject;
}

export interface EntryUsage {
  /** 入口参数名 → 使用它的位置说明（「节点 · 参数」）。 */
  byName: Map<string, string[]>;
}

/** 画布节点（及子工作流实参）对入口参数的引用。 */
export function entryUsage(
  nodes: readonly { id: string; label: string; paramJson?: unknown }[],
  extra: readonly { label: string; names: Iterable<string> }[] = [],
): Map<string, string[]> {
  const byName = new Map<string, string[]>();
  const push = (name: string, where: string) => byName.set(name, [...(byName.get(name) ?? []), where]);
  for (const node of nodes) {
    if (typeof node.paramJson !== "string") continue;
    let param: unknown;
    try {
      param = JSON.parse(node.paramJson || "{}");
    } catch {
      continue;
    }
    for (const [key, name] of entryReferencesOf(param)) push(name, `${node.label} · ${key}`);
  }
  for (const item of extra) for (const name of item.names) push(name, item.label);
  return byName;
}

/** 保存前的本地校验；返回错误列表（空 = 可以保存）。 */
export function validateEditorIo(
  io: EditorWorkflowIo,
  context: { nodeIds: ReadonlySet<string>; referenced: ReadonlySet<string> },
): string[] {
  const errors: string[] = [];
  const names = new Set<string>();
  for (const input of io.inputs) {
    if (!isValidEntryName(input.name)) errors.push(`入口参数名「${input.name}」不合法：用字母 / 数字 / 下划线，且不能以数字开头`);
    if (names.has(input.name)) errors.push(`入口参数名「${input.name}」重复`);
    names.add(input.name);
    if (Object.prototype.hasOwnProperty.call(input, "default")) {
      const parsed = parseEntryValue(input, input.default);
      if ("error" in parsed) errors.push(`入口参数「${input.name}」的默认值不符合类型：${parsed.error}`);
    }
  }
  for (const name of context.referenced) {
    if (!names.has(name)) errors.push(`画布引用了未声明的入口参数「${name}」：请在「入口参数」里声明，或在节点里解除引用`);
  }
  const outputNames = new Set<string>();
  for (const output of io.outputs) {
    if (!isValidEntryName(output.name)) errors.push(`输出名「${output.name}」不合法`);
    if (outputNames.has(output.name)) errors.push(`输出名「${output.name}」重复`);
    outputNames.add(output.name);
    if (!output.nodeId || !context.nodeIds.has(output.nodeId)) errors.push(`输出「${output.name}」没有选择来源节点（或节点已删除）`);
  }
  return errors;
}

/** 编辑器 io → PUT /io 的合同与绑定；节点 id 换成权威 uuid，物料入口参数补透传输出。 */
export function declarationOf(io: EditorWorkflowIo, uuidOf: (nodeId: string) => string | undefined): IoDeclaration {
  const bindings: Record<string, BackendWorkflowOutputBinding> = {};
  for (const output of io.outputs) {
    const uuid = uuidOf(output.nodeId);
    if (uuid) bindings[output.name] = { kind: "node_output", workflow_node_uuid: uuid, data_key: output.dataKey.trim() };
  }
  const outputs: BackendWorkflowOutputDescriptor[] = io.outputs
    .filter((item) => bindings[item.name])
    .map((item) => ({ name: item.name, schema: cloneJson(item.schema), ...(item.title ? { title: item.title } : {}) }));
  const implicit = implicitResourceOutputs(io.inputs, new Set(outputs.map((item) => item.name)));
  return {
    input_contract: { version: 1, parameters: io.inputs.map((item) => cloneJson(item)) },
    output_contract: { version: 1, outputs: [...outputs, ...implicit.outputs] },
    output_bindings: { ...bindings, ...implicit.bindings },
  };
}

/** 权威声明 → 编辑器 io（克隆 / 首次接管时）；只认按返回值路径绑定的输出。 */
export function editorIoFromDeclared(
  declared: BackendWorkflowDeclaredIo,
  nodeIdOf: (uuid: string) => string | undefined,
): { io: EditorWorkflowIo; droppedOutputs: string[] } {
  const outputs: EditorOutput[] = [];
  const droppedOutputs: string[] = [];
  for (const output of declared.output_contract.outputs) {
    const binding = declared.output_bindings[output.name] as Record<string, unknown> | undefined;
    // 物料入口参数的透传输出：声明时由 declarationOf 按入口参数补齐，不需要接管
    if (output.implicit && isWorkflowInputReference(binding) && binding.parameter === output.name) continue;
    const nodeId = binding?.kind === "node_output" && typeof binding.data_key === "string"
      ? nodeIdOf(String(binding.workflow_node_uuid ?? ""))
      : undefined;
    if (!nodeId) {
      droppedOutputs.push(output.name);
      continue;
    }
    outputs.push({
      name: output.name,
      ...(output.title ? { title: output.title } : {}),
      schema: cloneJson(output.schema),
      nodeId,
      dataKey: String(binding?.data_key ?? ""),
    });
  }
  return { io: { inputs: declared.input_contract.parameters.map((item) => cloneJson(item)), outputs }, droppedOutputs };
}

// ── 写入顺序 ──

function normalizedDeclaration(io: IoDeclaration | BackendWorkflowDeclaredIo): string {
  const pick = (record: Record<string, unknown>, keys: string[]) =>
    Object.fromEntries(keys.filter((key) => record[key] !== undefined).map((key) => [key, record[key]]));
  const inputs = io.input_contract.parameters.map((item) => ({
    ...pick(item as unknown as Record<string, unknown>, ["name", "schema", "default", "title", "description", "unit"]),
    required: Boolean(item.required),
  }));
  const outputs = io.output_contract.outputs.map((item) => ({
    ...pick(item as unknown as Record<string, unknown>, ["name", "schema", "title", "description", "unit"]),
    implicit: Boolean(item.implicit),
  }));
  const bindings = Object.fromEntries(
    Object.entries(io.output_bindings)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, binding]) => {
        const record = binding as Record<string, unknown>;
        return [name, typeof record.data_key === "string" ? { ...record, data_key: record.data_key.trim() } : record];
      }),
  );
  return JSON.stringify({ inputs, outputs, bindings });
}

export function sameDeclaration(a: IoDeclaration | BackendWorkflowDeclaredIo, b: IoDeclaration | BackendWorkflowDeclaredIo): boolean {
  return normalizedDeclaration(a) === normalizedDeclaration(b);
}

export interface IoSavePlan {
  /** 存图前先声明的过渡合同（图里出现了权威合同里还没有的引用时）。 */
  before: IoDeclaration | null;
}

/**
 * 过渡合同 = 期望的参数 + 权威里仍有、期望里没有的参数（图可能还引用着它们），节点输出暂时清空
 * （输出绑定的节点可能尚未存在），物料入口参数照样带透传输出（核心要求）。存图后再与期望比较，
 * 不同就写最终声明。
 */
export function planIoSave(
  current: BackendWorkflowDeclaredIo,
  desired: IoDeclaration,
  referenced: ReadonlySet<string>,
): IoSavePlan {
  const currentNames = new Set(current.input_contract.parameters.map((item) => item.name));
  if (![...referenced].some((name) => !currentNames.has(name))) return { before: null };
  const desiredNames = new Set(desired.input_contract.parameters.map((item) => item.name));
  const parameters = [
    ...desired.input_contract.parameters,
    ...current.input_contract.parameters.filter((item) => !desiredNames.has(item.name)),
  ];
  const implicit = implicitResourceOutputs(parameters, new Set());
  return {
    before: {
      input_contract: { version: 1, parameters },
      output_contract: { version: 1, outputs: implicit.outputs },
      output_bindings: implicit.bindings,
    },
  };
}

/**
 * 模板带来的入口参数与输出（设备包 `@workflow` 的 io / 用户模板保存的画布声明）。输出只收
 * 绑定到模板步骤返回值的那些，`nodeKey` 是展开后的节点 key。
 */
export interface TemplateIoDeclaration {
  inputs: readonly BackendWorkflowInputParameter[];
  outputs: readonly { name: string; schema: JsonObject; title?: string; nodeKey: string; dataKey: string }[];
}

export interface TemplateIoMerge {
  io: EditorWorkflowIo;
  addedInputs: string[];
  addedOutputs: string[];
  /** 与画布已有声明同名但定义不同的条目：保留画布上的。 */
  conflicts: string[];
}

function sameInputDefinition(a: BackendWorkflowInputParameter, b: BackendWorkflowInputParameter): boolean {
  const shape = (item: BackendWorkflowInputParameter) =>
    JSON.stringify({ schema: item.schema, required: Boolean(item.required), default: item.default });
  return shape(a) === shape(b);
}

/**
 * 插入模板时把模板的入口参数（及绑定到步骤返回值的输出）并进画布声明：画布节点照搬了模板
 * 步骤里的 `workflow_input` 引用，不带声明就提交不了（「画布引用了未声明的入口参数」）。
 * 同名同定义的跳过（同一模板插入两次），同名不同定义的保留画布上的并报告。
 */
export function mergeTemplateIo(
  current: EditorWorkflowIo,
  template: TemplateIoDeclaration,
  nodeIdOf: (nodeKey: string) => string | undefined,
): TemplateIoMerge {
  const inputs = [...current.inputs];
  const outputs = [...current.outputs];
  const result: Omit<TemplateIoMerge, "io"> = { addedInputs: [], addedOutputs: [], conflicts: [] };
  for (const input of template.inputs) {
    const existing = inputs.find((item) => item.name === input.name);
    if (!existing) {
      inputs.push(cloneJson(input) as BackendWorkflowInputParameter);
      result.addedInputs.push(input.name);
    } else if (!sameInputDefinition(existing, input)) {
      result.conflicts.push(`入口参数「${input.name}」`);
    }
  }
  for (const output of template.outputs) {
    const nodeId = nodeIdOf(output.nodeKey);
    if (!nodeId) continue;
    if (outputs.some((item) => item.name === output.name)) {
      result.conflicts.push(`输出「${output.name}」`);
      continue;
    }
    outputs.push({
      name: output.name,
      ...(output.title ? { title: output.title } : {}),
      schema: cloneJson(output.schema),
      nodeId,
      dataKey: output.dataKey,
    });
    result.addedOutputs.push(output.name);
  }
  return { io: { inputs, outputs }, ...result };
}

/** 画布里所有 param 顶层引用到的入口参数名。 */
export function referencedEntryNames(paramJsons: Iterable<unknown>, extra: Iterable<string> = []): Set<string> {
  const names = new Set<string>(extra);
  for (const raw of paramJsons) {
    if (typeof raw !== "string") continue;
    try {
      for (const name of entryReferencesOf(JSON.parse(raw || "{}")).values()) names.add(name);
    } catch {
      /* 非法 JSON 由提交校验报告 */
    }
  }
  return names;
}
