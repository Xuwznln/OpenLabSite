/**
 * 循环容器节点（编辑器概念 ↔ 后端 `type="loop"` 节点）。
 *
 * 画布上循环是一个**容器**（Vue Flow 父节点，成员 `parentNode` 指向它），运行时由本机
 * 调度器逐轮执行循环体：`for` 固定轮数；`while` 每轮前判定条件——设备状态字段
 * （device_state）或某个节点最近一次的返回值（node_output）。循环体节点参数里可写
 * `{{loop.index}}` / `{{loop.iteration}}` / `{{loop.count}}` 引用当前轮次。
 *
 * 这里只放纯数据换算：节点 data（表单形态） ↔ 后端 LoopSpec（提交 / 克隆 / 模板）。
 */
import type { InjectionKey } from "vue";
import type { BackendLoopCondition, BackendLoopProgress, BackendLoopSpec, JsonValue } from "@openlab/protocol";

export const LOOP_NODE_TYPE = "loop";

/** 标题栏高度（成员从它下面开始排）；与组框头同一量级 */
export const LOOP_HEADER_HEIGHT = 58;

/** 编辑器 provide 给循环框节点的操作；运行画布不 provide，循环框只展示。 */
export interface LoopActions {
  edit: (loopId: string) => void;
  /** 保留成员节点（换算成绝对坐标），只去掉循环框 */
  dissolve: (loopId: string) => void;
  /** 删除循环框与全部成员 */
  remove: (loopId: string) => void;
  memberCount: (loopId: string) => number;
}

export const LOOP_ACTIONS_KEY: InjectionKey<LoopActions> = Symbol("canvas-loop-actions");

export type LoopMode = "for" | "while";
export type LoopConditionSource = "device_state" | "node_output";
export type LoopOp = BackendLoopCondition["op"];

export const LOOP_OPS: LoopOp[] = ["==", "!=", ">", ">=", "<", "<=", "contains", "exists"];

export const DEFAULT_MAX_ITERATIONS = 1000;

/** 循环节点 `data`：表单原样保存，提交时才换算成 LoopSpec。 */
export interface LoopNodeData {
  label: string;
  mode: LoopMode;
  count: number;
  conditionSource: LoopConditionSource;
  /** device_state：设备 id + 状态字段 */
  deviceId: string;
  field: string;
  /** node_output：被引用节点的编辑器 id（提交时换成 uuid）+ 返回值路径 */
  conditionNodeId: string;
  dataKey: string;
  op: LoopOp;
  /** 对比值原文；提交时按 JSON 解析（解析不了当字符串） */
  value: string;
  maxIterations: number;
  intervalSeconds: number;
  [key: string]: unknown;
}

export function defaultLoopNodeData(mode: LoopMode = "for"): LoopNodeData {
  return {
    label: mode === "for" ? "重复 ×3" : "循环 while",
    mode,
    count: 3,
    conditionSource: "device_state",
    deviceId: "",
    field: "",
    conditionNodeId: "",
    dataKey: "",
    op: mode === "for" ? "==" : "<",
    value: "",
    maxIterations: DEFAULT_MAX_ITERATIONS,
    intervalSeconds: mode === "for" ? 0 : 1,
  };
}

/** 对比值：能按 JSON 解析（数字 / 布尔 / null / 数组）就用解析值，否则当字符串。 */
export function parseLoopValue(text: string): JsonValue {
  const trimmed = text.trim();
  if (!trimmed) return "";
  try {
    return JSON.parse(trimmed) as JsonValue;
  } catch {
    return trimmed;
  }
}

export function formatLoopValue(value: unknown): string {
  if (value === undefined || value === null) return "";
  if (typeof value === "string") return value;
  return JSON.stringify(value);
}

export function describeLoopNode(data: Partial<LoopNodeData>): string {
  if (data.mode === "for") return `重复 ×${Number(data.count ?? 0) || "?"}`;
  const op = data.op ?? "==";
  const rhs = op === "exists" ? "" : ` ${String(data.value ?? "")}`;
  const subject =
    data.conditionSource === "node_output"
      ? `节点输出${data.dataKey ? `.${data.dataKey}` : ""}`
      : `${data.deviceId || "设备"}.${data.field || "字段"}`;
  return `当 ${subject} ${op === "exists" ? "存在" : op}${rhs} 时重复`;
}

export interface LoopSpecBuild {
  spec: BackendLoopSpec;
  /** 配置不完整时的一句话原因（提交前拦下） */
  error?: string;
}

/**
 * 节点 data → 后端 LoopSpec。`resolveNodeRef` 把被引用节点的编辑器 id 换成提交体里的
 * 身份（uuid）；模板保存时换成步骤 key。
 */
export function loopSpecFromNodeData(
  data: Partial<LoopNodeData>,
  resolveNodeRef: (editorNodeId: string) => string | undefined,
  options: { hasBody: boolean } = { hasBody: true },
): LoopSpecBuild {
  const mode: LoopMode = data.mode === "while" ? "while" : "for";
  const interval = Math.max(0, Number(data.intervalSeconds ?? 0) || 0);
  if (mode === "for") {
    const count = Math.floor(Number(data.count ?? 0));
    if (!Number.isFinite(count) || count < 1) {
      return { spec: { mode, count: 1 }, error: "for 循环的次数必须是 ≥ 1 的整数" };
    }
    return { spec: { mode, count, interval_seconds: interval } };
  }
  const op: LoopOp = LOOP_OPS.includes(data.op as LoopOp) ? (data.op as LoopOp) : "==";
  const condition: BackendLoopCondition = { source: data.conditionSource === "node_output" ? "node_output" : "device_state", op };
  if (op !== "exists") condition.value = parseLoopValue(String(data.value ?? ""));
  if (condition.source === "device_state") {
    condition.device_id = String(data.deviceId ?? "").trim();
    condition.field = String(data.field ?? "").trim();
    if (!condition.device_id || !condition.field) {
      return { spec: { mode, condition }, error: "while 循环需要选择设备与状态字段" };
    }
  } else {
    const nodeId = String(data.conditionNodeId ?? "").trim();
    const ref = nodeId ? resolveNodeRef(nodeId) : undefined;
    if (!ref) return { spec: { mode, condition }, error: "while 循环引用的节点不存在，请重新选择" };
    condition.node_uuid = ref;
    condition.data_key = String(data.dataKey ?? "").trim();
  }
  if (op !== "exists" && String(data.value ?? "").trim() === "") {
    return { spec: { mode, condition }, error: `比较运算 ${op} 需要对比值` };
  }
  const maxIterations = Math.floor(Number(data.maxIterations ?? DEFAULT_MAX_ITERATIONS));
  const spec: BackendLoopSpec = {
    mode,
    condition,
    max_iterations: Number.isFinite(maxIterations) && maxIterations >= 1 ? maxIterations : DEFAULT_MAX_ITERATIONS,
    interval_seconds: interval,
  };
  if (!options.hasBody && interval <= 0) {
    return { spec, error: "空循环体的 while 循环（等到某状态）必须设置轮询间隔" };
  }
  return { spec };
}

/**
 * 后端 LoopSpec → 节点 data（克隆已保存的工作流 / 插入设备包模板）。
 * `resolveNodeId` 把 condition 里的节点身份（uuid 或模板步骤 key）换回编辑器节点 id。
 */
export function loopNodeDataFromSpec(
  spec: Record<string, unknown> | BackendLoopSpec | undefined,
  label: string,
  resolveNodeId: (ref: string) => string | undefined = () => undefined,
): LoopNodeData {
  const raw = (spec ?? {}) as Record<string, unknown>;
  const mode: LoopMode = raw.mode === "while" ? "while" : "for";
  const data = defaultLoopNodeData(mode);
  data.label = label || data.label;
  if (mode === "for") {
    const count = Math.floor(Number(raw.count ?? 1));
    data.count = Number.isFinite(count) && count >= 1 ? count : 1;
    data.label = label || describeLoopNode(data);
  }
  const condition = (raw.condition ?? null) as Record<string, unknown> | null;
  if (condition) {
    data.conditionSource = condition.source === "node_output" ? "node_output" : "device_state";
    data.deviceId = String(condition.device_id ?? "");
    data.field = String(condition.field ?? "");
    const ref = String(condition.node_uuid ?? condition.node_key ?? "");
    data.conditionNodeId = ref ? (resolveNodeId(ref) ?? "") : "";
    data.dataKey = String(condition.data_key ?? "");
    data.op = LOOP_OPS.includes(condition.op as LoopOp) ? (condition.op as LoopOp) : "==";
    data.value = formatLoopValue(condition.value);
  }
  const maxIterations = Math.floor(Number(raw.max_iterations ?? DEFAULT_MAX_ITERATIONS));
  data.maxIterations = Number.isFinite(maxIterations) && maxIterations >= 1 ? maxIterations : DEFAULT_MAX_ITERATIONS;
  const interval = Number(raw.interval_seconds ?? (mode === "for" ? 0 : 1));
  data.intervalSeconds = Number.isFinite(interval) && interval >= 0 ? interval : 0;
  return data;
}

/** 运行进度一句话：`第 2/3 轮` / `第 5 轮（≤100）`。 */
export function describeLoopProgress(progress: Partial<BackendLoopProgress> | undefined, status: string): string {
  if (!progress || typeof progress.iteration !== "number") return "";
  const current = progress.iteration + 1;
  if (progress.mode === "for" && typeof progress.count === "number") {
    return status === "succeeded" ? `${progress.count} 轮完成` : `第 ${current}/${progress.count} 轮`;
  }
  if (status === "succeeded") return `${current} 轮后结束`;
  const cap = typeof progress.max_iterations === "number" ? `（上限 ${progress.max_iterations}）` : "";
  return `第 ${current} 轮${cap}`;
}

/** 容器 id → 成员 id（按 parentNode，直接成员）。 */
export function loopMembers(
  nodes: Iterable<{ id: string; type?: string; parentNode?: string }>,
  loopId: string,
): string[] {
  const members: string[] = [];
  for (const node of nodes) if (node.parentNode === loopId) members.push(node.id);
  return members;
}

/** 节点的最近循环祖先（编辑器 id）；组框等非循环父级被跳过。 */
export function nearestLoopAncestor(
  nodeId: string,
  nodes: ReadonlyMap<string, { type?: string; parentNode?: string }>,
): string | undefined {
  const seen = new Set<string>();
  let current = nodes.get(nodeId)?.parentNode;
  while (current && !seen.has(current)) {
    seen.add(current);
    const node = nodes.get(current);
    if (!node) return undefined;
    if (node.type === LOOP_NODE_TYPE) return current;
    current = node.parentNode;
  }
  return undefined;
}
