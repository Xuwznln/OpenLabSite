export type WorkflowVariableType =
  | "string"
  | "number"
  | "boolean"
  | "list:string"
  | "list:number";

export interface WorkflowVariable {
  /** Excel/CSV 列名，也是工作流内稳定引用名。 */
  id: string;
  label: string;
  nodeId: string;
  /** 节点 param 内的 gjson/sjson 风格点路径。 */
  path: string;
  type: WorkflowVariableType;
  /** list 变量在同一组内强制共享行数。 */
  group?: string;
  value: unknown;
}

export interface ParameterField {
  path: string;
  type: WorkflowVariableType;
  value: unknown;
}

export interface VariableNode {
  id: string;
  label: string;
  paramJson: string;
}

export function isListVariable(variable: WorkflowVariable): boolean {
  return variable.type.startsWith("list:");
}

/**
 * 变量/参数值只允许 JSON 形状；structuredClone 遇到 Vue reactive proxy 会抛
 * DataCloneError（草稿保存曾因此整体失效），统一走 JSON 深拷贝。
 */
export function cloneJson<T>(value: T): T {
  if (value === null || typeof value !== "object") return value;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** 同一 list group 的所有列始终补齐为相同行数。 */
export function alignListGroups(
  variables: WorkflowVariable[],
): WorkflowVariable[] {
  const lengths = new Map<string, number>();
  for (const variable of variables.filter(isListVariable)) {
    const group = variable.group || "default";
    lengths.set(
      group,
      Math.max(
        lengths.get(group) ?? 0,
        Array.isArray(variable.value) ? variable.value.length : 0,
      ),
    );
  }
  return variables.map((variable) => {
    if (!isListVariable(variable)) return variable;
    const length = lengths.get(variable.group || "default") ?? 0;
    const value = Array.isArray(variable.value) ? [...variable.value] : [];
    while (value.length < length) value.push("");
    return { ...variable, value };
  });
}

export function defaultVariableValue(type: WorkflowVariableType): unknown {
  if (type === "number") return 0;
  if (type === "boolean") return false;
  if (type.startsWith("list:")) return [];
  return "";
}

export function variableId(nodeId: string, path: string): string {
  const base = `${nodeId}_${path}`
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return base || `variable_${Date.now()}`;
}

function scalarType(value: unknown): WorkflowVariableType {
  if (typeof value === "number") return "number";
  if (typeof value === "boolean") return "boolean";
  return "string";
}

/** 将节点参数展开成可直接编辑/关注的叶子字段；标量数组保留为一列。 */
export function flattenParameterFields(
  value: unknown,
  prefix = "",
): ParameterField[] {
  if (Array.isArray(value)) {
    const listType =
      value.length > 0 && value.every((item) => typeof item === "number")
        ? "list:number"
        : "list:string";
    return prefix ? [{ path: prefix, type: listType, value }] : [];
  }

  if (value !== null && typeof value === "object") {
    return Object.entries(value as Record<string, unknown>).flatMap(
      ([key, child]) =>
        flattenParameterFields(child, prefix ? `${prefix}.${key}` : key),
    );
  }

  return prefix ? [{ path: prefix, type: scalarType(value), value }] : [];
}

export function readPath(root: unknown, path: string): unknown {
  let current = root;
  for (const segment of path.split(".").filter(Boolean)) {
    if (current === null || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

export function writePath(
  root: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".").filter(Boolean);
  if (!segments.length) return;
  let current = root;
  for (const segment of segments.slice(0, -1)) {
    const existing = current[segment];
    if (
      existing === null ||
      typeof existing !== "object" ||
      Array.isArray(existing)
    ) {
      current[segment] = {};
    }
    current = current[segment] as Record<string, unknown>;
  }
  current[segments[segments.length - 1]] = value;
}

export function coerceVariableValue(
  type: WorkflowVariableType,
  value: unknown,
): unknown {
  if (type === "number") {
    if (value === "" || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  if (type === "boolean") {
    if (typeof value === "string") {
      return ["true", "1", "yes", "是"].includes(value.trim().toLowerCase());
    }
    return Boolean(value);
  }
  if (type === "list:number") {
    return (Array.isArray(value) ? value : []).map((item) => {
      if (item === "" || item === null || item === undefined) return null;
      const parsed = Number(item);
      return Number.isFinite(parsed) ? parsed : null;
    });
  }
  if (type === "list:string") {
    return (Array.isArray(value) ? value : []).map((item) =>
      item === null || item === undefined ? "" : String(item),
    );
  }
  return value === null || value === undefined ? "" : String(value);
}

export function parseNodeParam(paramJson: string): Record<string, unknown> {
  const parsed = JSON.parse(paramJson || "{}");
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("节点参数必须是 JSON 对象");
  }
  return parsed as Record<string, unknown>;
}

export function applyVariablesToParam(
  paramJson: string,
  variables: WorkflowVariable[],
): Record<string, unknown> {
  const param = parseNodeParam(paramJson);
  for (const variable of variables) {
    writePath(
      param,
      variable.path,
      coerceVariableValue(variable.type, variable.value),
    );
  }
  return param;
}

export function normalizeVariables(value: unknown): WorkflowVariable[] {
  if (!Array.isArray(value)) return [];
  return alignListGroups(value.flatMap((raw) => {
    if (raw === null || typeof raw !== "object") return [];
    const item = raw as Partial<WorkflowVariable>;
    if (!item.id || !item.nodeId || !item.path) return [];
    const type = item.type ?? "string";
    return [
      {
        id: String(item.id),
        label: String(item.label || item.id),
        nodeId: String(item.nodeId),
        path: String(item.path),
        type,
        group: type.startsWith("list:")
          ? String(item.group || "default")
          : undefined,
        value: item.value ?? defaultVariableValue(type),
      },
    ];
  }));
}

/**
 * 参数表落库形状：写入 workflow 定义的 `meta_data.parameter_table`。
 * 版本号用于后续演进时区分旧存档；变量数组是纯 JSON 深拷贝。
 */
export interface ParameterTableMeta {
  version: 1;
  variables: WorkflowVariable[];
}

export function buildParameterTableMeta(
  variables: WorkflowVariable[],
): ParameterTableMeta {
  return { version: 1, variables: cloneJson(variables) };
}

/** 从 meta_data.parameter_table 恢复变量；形状不合法时返回空数组。 */
export function parseParameterTableMeta(value: unknown): WorkflowVariable[] {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }
  const meta = value as Partial<ParameterTableMeta>;
  if (!Array.isArray(meta.variables)) return [];
  return normalizeVariables(meta.variables);
}
