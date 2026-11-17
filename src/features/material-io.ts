/**
 * 人工物料节点 `material_io`（Uni-Lab-OS 核心 `protocol/runtime/material_io.py`）：人工装入 / 取走 / 补量。
 *
 * 调度器在权威侧本地执行：锁定 `mount` 的库位（unload / refill 另锁 `material`），停下开人工确认单，
 * 确认后一条 `material.io` 库存命令在一个事务里改库存；不派发设备动作。确认单与 `manual_confirm` 同一套
 * （异常审批页可批准 / 拒绝），拒绝 / 超时节点失败、库存不变。
 *
 * 画布节点 data 只存节点名与 `param` 原文（对象），表单字段由它派生、保存时整份写回，
 * 保证源码 / 模板写出的引用（`{uuid}`、工作流输入）不被表单改形。这里只放纯函数。
 */

export type MaterialIoMode = "load" | "unload" | "refill";

/** 后端节点类型；画布（Vue Flow）节点类型用同一个名字。 */
export const MATERIAL_IO_NODE_TYPE = "material_io";
export const MATERIAL_IO_MODES: readonly MaterialIoMode[] = ["load", "unload", "refill"];
export const DEFAULT_MATERIAL_IO_TIMEOUT_S = 3600;
const MAX_TIMEOUT_S = 86_400;

export const MATERIAL_IO_MODE_LABELS: Record<MaterialIoMode, string> = {
  load: "装入",
  unload: "取走",
  refill: "补量",
};

/** 与核心 `DEFAULT_STEP_NAMES` 相同的缺省节点名。 */
export const MATERIAL_IO_DEFAULT_NAMES: Record<MaterialIoMode, string> = {
  load: "人工装入",
  unload: "人工取走",
  refill: "人工补量",
};

export const UNLOAD_DISPOSITION_LABELS = { detach: "解除挂载（物料保留在库）", soft_delete: "软删除" } as const;
export const UNLOAD_SCOPE_LABELS = { material_only: "只处理物料本身", material_with_contents: "连同内容物" } as const;

/** 画布节点 data。 */
export interface MaterialIoNodeData {
  label: string;
  param: Record<string, unknown>;
  [key: string]: unknown;
}

/** 编辑表单（字符串字段；对象 / 引用以 JSON 原文出现，保存时按 JSON 解析）。 */
export interface MaterialIoForm {
  label: string;
  mode: MaterialIoMode;
  mount: string;
  site: string;
  resourceTemplate: string;
  material: string;
  materialName: string;
  barcode: string;
  quantity: number | null;
  quantityUnit: string;
  /** load 的试剂身份（name / cas 二选一或都给；reagent_info_uuid 走原文保留） */
  reagentName: string;
  reagentCas: string;
  disposition: "detach" | "soft_delete";
  scope: "material_only" | "material_with_contents";
  timeoutSeconds: number;
  /** 可确认的用户；空列表 = 任何人可确认（核心要求显式给出，表单总是写出） */
  assignees: string[];
  /** 表单不展示、但要原样带回的 reagent 字段（reagent_info_uuid / 浓度 / 密度 / 描述…） */
  reagentExtra: Record<string, unknown>;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function isMode(value: unknown): value is MaterialIoMode {
  return value === "load" || value === "unload" || value === "refill";
}

/** 字段值 → 表单文本：字符串原样；对象（`{uuid}`、工作流输入、上游结果引用）以 JSON 原文出现。 */
function textOf(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

/** 表单文本 → 字段值：以 `{` 开头按 JSON 解析（引用 / `{uuid}`），否则是去空白的字符串。 */
function valueOf(text: string): unknown {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return trimmed;
    }
  }
  return trimmed;
}

export function defaultMaterialIoParam(mode: MaterialIoMode = "load"): Record<string, unknown> {
  return { mode, timeout_seconds: DEFAULT_MATERIAL_IO_TIMEOUT_S, assignee_user_ids: [] };
}

export function defaultMaterialIoData(mode: MaterialIoMode = "load"): MaterialIoNodeData {
  return { label: MATERIAL_IO_DEFAULT_NAMES[mode], param: defaultMaterialIoParam(mode) };
}

export function materialIoForm(data: Partial<MaterialIoNodeData>): MaterialIoForm {
  const param = asRecord(data.param) ?? {};
  const mode: MaterialIoMode = isMode(param.mode) ? param.mode : "load";
  const reagent = asRecord(param.reagent) ?? {};
  const { quantity, quantity_unit: quantityUnit, name, cas, ...reagentExtra } = reagent;
  const timeout = Number(param.timeout_seconds);
  return {
    label: String(data.label ?? "") || MATERIAL_IO_DEFAULT_NAMES[mode],
    mode,
    mount: textOf(param.mount),
    site: textOf(param.site),
    resourceTemplate: textOf(param.resource_template),
    material: textOf(param.material),
    materialName: textOf(param.material_name),
    barcode: textOf(param.barcode),
    quantity: typeof quantity === "number" && Number.isFinite(quantity) ? quantity : null,
    quantityUnit: textOf(quantityUnit),
    reagentName: textOf(name),
    reagentCas: textOf(cas),
    disposition: param.disposition === "detach" ? "detach" : "soft_delete",
    scope: param.scope === "material_with_contents" ? "material_with_contents" : "material_only",
    timeoutSeconds: Number.isInteger(timeout) && timeout >= 1 ? timeout : DEFAULT_MATERIAL_IO_TIMEOUT_S,
    assignees: Array.isArray(param.assignee_user_ids) ? param.assignee_user_ids.map((item) => String(item).trim()).filter(Boolean) : [],
    reagentExtra,
  };
}

export interface MaterialIoBuild {
  param: Record<string, unknown>;
  /** 不满足核心规则时的一句话原因（保存 / 提交前拦下） */
  error?: string;
}

/**
 * 表单 → 节点 param，按模式只写允许的字段（核心对未知 / 禁止字段报 1000）。
 * 规则与核心 `normalize_material_io_param` 一致：mount / site 必填；load 要 resource_template；
 * unload 要 material + disposition + scope（detach 只能 material_only）；refill 要 material + 数量与单位。
 */
export function materialIoParam(form: MaterialIoForm): MaterialIoBuild {
  const param: Record<string, unknown> = { mode: form.mode };
  const mount = valueOf(form.mount);
  const site = valueOf(form.site);
  if (mount !== "") param.mount = mount;
  if (site !== "") param.site = site;
  const errors: string[] = [];
  if (mount === "") errors.push("请填写挂载物料（库位所属的物料）");
  if (site === "") errors.push("请填写库位");
  const quantity = form.quantity;
  const hasQuantity = typeof quantity === "number" && Number.isFinite(quantity) && quantity > 0;
  const unit = form.quantityUnit.trim();
  if (form.mode === "load") {
    const template = valueOf(form.resourceTemplate);
    if (template === "") errors.push("装入需要资源模板");
    else param.resource_template = template;
    if (form.materialName.trim()) param.material_name = valueOf(form.materialName);
    if (form.barcode.trim()) param.barcode = form.barcode.trim();
    const name = form.reagentName.trim();
    const cas = form.reagentCas.trim();
    const hasIdentity = Boolean(name || cas || form.reagentExtra.reagent_info_uuid);
    if (hasQuantity || unit || hasIdentity) {
      if (!hasQuantity || !unit) errors.push("装入试剂需要数量（正数）和单位");
      if (!hasIdentity) errors.push("装入试剂需要名称或 CAS");
      param.reagent = {
        ...form.reagentExtra,
        ...(hasQuantity ? { quantity } : {}),
        ...(unit ? { quantity_unit: unit } : {}),
        ...(name ? { name } : {}),
        ...(cas ? { cas } : {}),
      };
    }
  } else {
    const material = valueOf(form.material);
    if (material === "") errors.push(form.mode === "unload" ? "请填写要取走的物料" : "请填写要补量的物料");
    else param.material = material;
    if (form.mode === "unload") {
      if (form.disposition === "detach" && form.scope !== "material_only") errors.push("解除挂载只能处理物料本身；连内容物一起请用软删除");
      param.disposition = form.disposition;
      param.scope = form.scope;
    } else {
      if (!hasQuantity || !unit) errors.push("补量需要数量（正数）和单位");
      param.reagent = { ...(hasQuantity ? { quantity } : {}), ...(unit ? { quantity_unit: unit } : {}) };
    }
  }
  const timeout = Math.round(Number(form.timeoutSeconds));
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > MAX_TIMEOUT_S) errors.push(`确认超时必须是 1..${MAX_TIMEOUT_S} 秒`);
  else param.timeout_seconds = timeout;
  param.assignee_user_ids = [...new Set(form.assignees.map((item) => item.trim()).filter(Boolean))];
  return errors.length ? { param, error: errors.join("；") } : { param };
}

/** 已保存 / 模板里的 param 是否满足核心规则（提交前校验，不改写 param）。 */
export function materialIoParamError(param: Record<string, unknown> | undefined): string | undefined {
  return materialIoParam(materialIoForm({ param: param ?? {} })).error;
}

/** 物料 / 库位引用的一句话：字符串原样，`{uuid}` 取短 uuid，工作流输入 / 上游结果按来源描述。 */
export function describeMaterialRef(value: unknown): string {
  if (typeof value === "string") return value;
  const record = asRecord(value);
  if (!record) return "";
  if (record.kind === "workflow_input") return `入口参数 ${String(record.parameter ?? "")}`;
  if (record.kind === "node_output") return `上游步骤结果${record.data_key ? ` .${String(record.data_key)}` : ""}`;
  if (typeof record.uuid === "string") return `物料 ${record.uuid.slice(0, 8)}`;
  return JSON.stringify(record);
}

/** 节点摘要：`装入 · 挂载物料 / 库位 · 模板`、`取走 · …（软删除）`、`补量 20 mL`。 */
export function describeMaterialIo(param: Record<string, unknown> | undefined): string {
  const record = param ?? {};
  const mode = isMode(record.mode) ? record.mode : null;
  if (!mode) return "人工物料";
  const where = [describeMaterialRef(record.mount), describeMaterialRef(record.site)].filter(Boolean).join(" / ");
  const parts: string[] = [MATERIAL_IO_MODE_LABELS[mode]];
  if (where) parts.push(where);
  if (mode === "load" && record.resource_template !== undefined) parts.push(describeMaterialRef(record.resource_template));
  if (mode !== "load" && record.material !== undefined) parts.push(describeMaterialRef(record.material));
  const reagent = asRecord(record.reagent);
  if (reagent && reagent.quantity !== undefined) {
    const quantity = typeof reagent.quantity === "number" ? String(reagent.quantity) : describeMaterialRef(reagent.quantity);
    parts.push(`${quantity} ${String(reagent.quantity_unit ?? "")}`.trim());
  }
  if (mode === "unload" && record.disposition) {
    parts.push(record.disposition === "detach" ? "解除挂载" : "软删除");
  }
  return parts.join(" · ");
}
