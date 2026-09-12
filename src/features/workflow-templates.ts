/**
 * 工作流模板：编排概念，两个来源同一形状。
 *
 * - **设备包模板**（驱动包里 `@workflow` 声明，随注册表上报到 Registry Authority，
 *   `GET /api/v1/registry/workflow-templates`，见 templateFromRegistry）与
 *   用户模板（"存为模板"，localStorage）。站点自身不再内置任何模板。
 * - 模板由四种节点组成：action（设备动作，设备用**角色**占位）、
 *   slot（空位，插入后留在画布上等用户填充）、template（嵌套引用另一个模板）、
 *   loop（循环容器：`parent` 指向它的节点是循环体，运行时逐轮执行）。
 * - 插入画布时递归**展开成真实节点/边**：嵌套模板的入边接到子图入口、
 *   出边接自子图出口；slot 保留为画布上的占位节点，可用设备动作或
 *   另一个模板继续填充（因此空位天然支持再嵌套）；循环体成员带 parent。
 * - 提交前画布不允许残留 slot 节点，提交体是平铺 DAG + 循环容器的 parent_uuid。
 */
import type { RegistryWorkflowTemplate } from "@openlab/protocol";
import { loopSpecFromNodeData, type LoopNodeData } from "./workflow-loops";

export type TemplateParamMapping = { sourceKey: string; targetKey: string };

export type TemplateNodeSpec =
  | {
      key: string;
      kind: "action";
      role: string;
      actionName: string;
      /** 步骤名（@workflow `name=`），全流程说明里作为该步标题 */
      name?: string;
      /** 这一步做什么 / 该看到什么（@workflow `description=`） */
      description?: string;
      param?: Record<string, unknown>;
      /** 步骤库存需求（@workflow `inventory=[...]`）→ 画布节点 requirementsJson */
      inventoryRequirements?: Record<string, unknown>[];
      /** 所在循环节点的 key（循环体成员） */
      parent?: string;
    }
  | { key: string; kind: "slot"; label: string; hint?: string; parent?: string }
  | { key: string; kind: "template"; templateId: string; parent?: string }
  | {
      key: string;
      kind: "loop";
      name?: string;
      description?: string;
      /** LoopSpec（后端契约）；node_output 条件里用 `node_key` 引用模板步骤 */
      param: Record<string, unknown>;
      parent?: string;
    };

/** 操作指引：运行前准备 / 预期效果 / 注意事项（`@workflow(guide=...)`）。 */
export interface TemplateGuide {
  preparation: string[];
  expected: string[];
  notes: string[];
}

export type TemplateEdgeSpec = {
  source: string;
  target: string;
  mappings?: TemplateParamMapping[];
};

/**
 * 设备角色：展开时把 role 映射到具体 device_id。
 * matches 用于按设备 id 子串模糊预选；deviceClass（`ctx.run_template` 的设备类）
 * 优先按在线设备的注册表类精确预选。
 */
export type TemplateRole = {
  role: string;
  label: string;
  matches: string[];
  deviceClass?: string;
};

export type TemplateSource = "user" | "registry";

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  /** 缺省 "user"（早期 localStorage 里保存的用户模板没有该字段） */
  source?: TemplateSource;
  tags?: string[];
  /** 设备包模板的来源包名（面板徽标"设备包 · site_demo"） */
  packageName?: string;
  /** 操作指引；与步骤 name / description 组成"全流程"说明 */
  guide?: TemplateGuide;
  roles: TemplateRole[];
  nodes: TemplateNodeSpec[];
  edges: TemplateEdgeSpec[];
}

export function templateSource(tpl: WorkflowTemplate): TemplateSource {
  return tpl.source ?? "user";
}

/** 全流程说明里的一步：序号 + 标题 + 谁来做（角色）+ 做什么。 */
export interface TemplateProcedureStep {
  index: number;
  title: string;
  roleLabel: string;
  actionName: string;
  description: string;
  kind: "action" | "slot" | "loop";
  /** 循环嵌套深度（0 = 顶层），全流程说明按它缩进 */
  depth: number;
}

/** 循环节点的一句话摘要（模板卡片 / 画布标题）。 */
export function describeLoopSpec(param: Record<string, unknown> | undefined): string {
  const mode = String(param?.mode ?? "");
  if (mode === "for") return `重复 ×${Number(param?.count ?? 0) || "?"}`;
  if (mode !== "while") return "循环";
  const condition = (param?.condition ?? {}) as Record<string, unknown>;
  const op = String(condition.op ?? "==");
  const rhs = op === "exists" ? "" : ` ${JSON.stringify(condition.value ?? null)}`;
  const subject =
    condition.source === "device_state"
      ? `${String(condition.device_id ?? "")}.${String(condition.field ?? "")}`
      : `步骤输出${condition.data_key ? `.${String(condition.data_key)}` : ""}`;
  return `当 ${subject} ${op === "exists" ? "存在" : op}${rhs} 时重复`;
}

/**
 * 模板的"全流程"：按模板声明序列出每一步（设备包模板就是 @workflow 的 ctx.run 顺序；
 * 嵌套模板节点跳过，由其自身的说明负责；循环节点算一步，循环体按深度缩进）。
 * 有 guide 或任一步有说明才值得展示。
 */
export function templateProcedure(tpl: WorkflowTemplate): TemplateProcedureStep[] {
  const roleLabels = new Map(tpl.roles.map((role) => [role.role, role.label]));
  const parents = new Map(tpl.nodes.map((node) => [node.key, node.parent] as const));
  const depthOf = (key: string): number => {
    let depth = 0;
    let current = parents.get(key);
    while (current) {
      depth += 1;
      current = parents.get(current);
    }
    return depth;
  };
  const steps: TemplateProcedureStep[] = [];
  for (const node of tpl.nodes) {
    if (node.kind === "template") continue;
    const depth = depthOf(node.key);
    if (node.kind === "slot") {
      steps.push({
        index: steps.length + 1,
        title: node.label,
        roleLabel: "",
        actionName: "",
        description: node.hint ?? "",
        kind: "slot",
        depth,
      });
      continue;
    }
    if (node.kind === "loop") {
      steps.push({
        index: steps.length + 1,
        title: node.name || describeLoopSpec(node.param),
        roleLabel: "",
        actionName: describeLoopSpec(node.param),
        description: node.description ?? "",
        kind: "loop",
        depth,
      });
      continue;
    }
    steps.push({
      index: steps.length + 1,
      title: node.name || node.actionName,
      roleLabel: roleLabels.get(node.role) ?? node.role,
      actionName: node.actionName,
      description: node.description ?? "",
      kind: "action",
      depth,
    });
  }
  return steps;
}

export function hasTemplateGuide(tpl: WorkflowTemplate): boolean {
  const guide = tpl.guide;
  if (guide && (guide.preparation.length || guide.expected.length || guide.notes.length)) return true;
  return tpl.nodes.some((node) => (node.kind === "action" || node.kind === "loop") && Boolean(node.description));
}

export interface ExpandedNode {
  key: string;
  type: "action" | "slot" | "loop";
  role?: string;
  actionName?: string;
  param?: Record<string, unknown>;
  inventoryRequirements?: Record<string, unknown>[];
  slotLabel?: string;
  slotHint?: string;
  /** loop：显示名与 LoopSpec */
  name?: string;
  loopSpec?: Record<string, unknown>;
  /** 所在循环容器（展开后的 key） */
  parent?: string;
}

export interface ExpandedEdge {
  source: string;
  target: string;
  mappings: TemplateParamMapping[];
}

export interface ExpandedGraph {
  nodes: ExpandedNode[];
  edges: ExpandedEdge[];
}

/**
 * 设备包（注册表）→ 用户，后者同 id 覆盖前者。
 * 设备包模板 id 带 `registry:` 前缀，与用户模板 `user-*` 不会撞。
 */
export function buildTemplateRegistry(
  userTemplates: WorkflowTemplate[] = [],
  registryTemplates: WorkflowTemplate[] = [],
): Map<string, WorkflowTemplate> {
  const registry = new Map<string, WorkflowTemplate>();
  for (const tpl of registryTemplates) registry.set(tpl.id, tpl);
  for (const tpl of userTemplates) registry.set(tpl.id, tpl);
  return registry;
}

export const REGISTRY_TEMPLATE_ID_PREFIX = "registry:";

/**
 * 设备包 `@workflow` 模板（Registry Authority 条目）→ 编排模板。
 *
 * 角色与节点已是同一形状，只做字段风格转换；`run_template` 的类角色带上
 * deviceClass 供插入时按注册表类预选设备。slot / 嵌套模板节点原样透传
 * （当前后端只产出 action 链，保留是为了形状兼容）。
 */
/** 来源包名：后端给的 `package`，旧 Host 没有时从条目名 `module:qualname` 的顶层包推导。 */
export function registryTemplatePackage(entry: Pick<RegistryWorkflowTemplate, "id" | "package">): string {
  if (entry.package?.trim()) return entry.package.trim();
  const module = entry.id.split(":")[0] ?? "";
  return module.split(".")[0] ?? "";
}

export function templateFromRegistry(entry: RegistryWorkflowTemplate): WorkflowTemplate {
  const packageName = registryTemplatePackage(entry);
  return {
    id: `${REGISTRY_TEMPLATE_ID_PREFIX}${entry.uuid}`,
    name: entry.display_name,
    description: entry.description || `设备包模板 · ${entry.id}`,
    source: "registry",
    packageName: packageName || undefined,
    tags: [...(entry.tags ?? [])],
    roles: entry.roles.map((role) => ({
      role: role.role,
      label: role.label,
      matches: [...(role.matches ?? [])],
      deviceClass: role.kind === "class" ? role.device_class : undefined,
    })),
    nodes: entry.nodes.map((node): TemplateNodeSpec => {
      const parent = node.parent || undefined;
      if (node.kind === "slot") {
        return { key: node.key, kind: "slot", label: node.name ?? "空位", parent };
      }
      if (node.kind === "template") {
        return { key: node.key, kind: "template", templateId: String(node.role ?? ""), parent };
      }
      if (node.kind === "loop") {
        return {
          key: node.key,
          kind: "loop",
          name: node.name || undefined,
          description: node.description || undefined,
          param: { ...(node.param ?? {}) },
          parent,
        };
      }
      const param = node.param && Object.keys(node.param).length ? { ...node.param } : undefined;
      const inventoryRequirements = node.inventory_requirements?.length
        ? node.inventory_requirements.map((item) => ({ ...item }))
        : undefined;
      return {
        key: node.key,
        kind: "action",
        role: node.role ?? "",
        actionName: node.action_name ?? "",
        name: node.name || undefined,
        description: node.description || undefined,
        param,
        inventoryRequirements,
        parent,
      };
    }),
    edges: entry.edges.map((edge) => ({ source: edge.source, target: edge.target })),
    guide: entry.guide
      ? {
          preparation: [...(entry.guide.preparation ?? [])],
          expected: [...(entry.guide.expected ?? [])],
          notes: [...(entry.guide.notes ?? [])],
        }
      : undefined,
  };
}

/**
 * 递归展开模板为平铺节点/边。
 *
 * 嵌套拼接语义：指向 template 节点的边接到子图**全部入口**（层内无入边的成员），
 * 从 template 节点出发的边接自子图**全部出口**。展开路径上出现重复模板即视为
 * 嵌套成环，直接报错。
 */
export function expandTemplate(
  templateId: string,
  registry: Map<string, WorkflowTemplate>,
): ExpandedGraph {
  const nodes: ExpandedNode[] = [];
  const edges: ExpandedEdge[] = [];
  const expanding: string[] = [];

  function walk(
    tid: string,
    prefix: string,
    inheritedParent: string | undefined,
  ): { entries: string[]; exits: string[] } {
    if (expanding.includes(tid)) {
      throw new Error(`模板嵌套成环：${[...expanding, tid].join(" → ")}`);
    }
    const tpl = registry.get(tid);
    if (!tpl) throw new Error(`模板不存在：${tid}`);
    expanding.push(tid);

    const keyOf = (spec: TemplateNodeSpec) => (prefix ? `${prefix}.${spec.key}` : spec.key);
    // 循环体成员的父级：本模板里的 loop 节点（展开后的 key）；模板自身在别的循环体里时继承
    const parentOf = (spec: TemplateNodeSpec): string | undefined => {
      if (!spec.parent) return inheritedParent;
      const container = tpl.nodes.find((n) => n.key === spec.parent);
      if (!container || container.kind !== "loop") {
        throw new Error(`模板 ${tid} 的节点 ${spec.key} 的 parent ${spec.parent} 不是循环节点`);
      }
      return keyOf(container);
    };

    const members = new Map<string, { entries: string[]; exits: string[] }>();
    for (const spec of tpl.nodes) {
      const key = keyOf(spec);
      const parent = parentOf(spec);
      if (spec.kind === "template") {
        members.set(spec.key, walk(spec.templateId, key, parent));
      } else if (spec.kind === "action") {
        nodes.push({
          key,
          type: "action",
          role: spec.role,
          actionName: spec.actionName,
          param: spec.param,
          inventoryRequirements: spec.inventoryRequirements,
          parent,
        });
        members.set(spec.key, { entries: [key], exits: [key] });
      } else if (spec.kind === "loop") {
        nodes.push({
          key,
          type: "loop",
          name: spec.name,
          loopSpec: rekeyLoopSpec(spec.param, keyOf, tpl),
          parent,
        });
        members.set(spec.key, { entries: [key], exits: [key] });
      } else {
        nodes.push({ key, type: "slot", slotLabel: spec.label, slotHint: spec.hint, parent });
        members.set(spec.key, { entries: [key], exits: [key] });
      }
    }

    for (const edge of tpl.edges) {
      const src = members.get(edge.source);
      const dst = members.get(edge.target);
      if (!src || !dst) {
        throw new Error(`模板 ${tid} 的边引用了不存在的节点：${edge.source} → ${edge.target}`);
      }
      for (const s of src.exits) {
        for (const t of dst.entries) {
          edges.push({
            source: s,
            target: t,
            mappings: (edge.mappings ?? []).map((m) => ({ ...m })),
          });
        }
      }
    }

    // 模板的入口/出口只看顶层成员（循环体成员的顺序由循环容器代表）
    const targeted = new Set(tpl.edges.map((e) => e.target));
    const sourced = new Set(tpl.edges.map((e) => e.source));
    const topLevel = tpl.nodes.filter((n) => !n.parent);
    const entries = topLevel
      .filter((n) => !targeted.has(n.key))
      .flatMap((n) => members.get(n.key)!.entries);
    const exits = topLevel
      .filter((n) => !sourced.has(n.key))
      .flatMap((n) => members.get(n.key)!.exits);

    expanding.pop();
    return { entries, exits };
  }

  walk(templateId, "", undefined);
  return { nodes, edges };
}

/** 循环 LoopSpec 里 node_output 条件的 `node_key`（模板步骤 key）换成展开后的 key。 */
function rekeyLoopSpec(
  param: Record<string, unknown>,
  keyOf: (spec: TemplateNodeSpec) => string,
  tpl: WorkflowTemplate,
): Record<string, unknown> {
  const spec = { ...param };
  const condition = spec.condition as Record<string, unknown> | undefined;
  if (condition && typeof condition.node_key === "string") {
    const target = tpl.nodes.find((n) => n.key === condition.node_key);
    if (!target) throw new Error(`循环条件引用了不存在的步骤：${condition.node_key}`);
    spec.condition = { ...condition, node_key: keyOf(target) };
  }
  return spec;
}

/** 递归收集展开后用到的全部设备角色（去重，保持出现顺序）。 */
export function collectRoles(
  templateId: string,
  registry: Map<string, WorkflowTemplate>,
): TemplateRole[] {
  const seen = new Map<string, TemplateRole>();
  const expanding: string[] = [];

  function walk(tid: string) {
    if (expanding.includes(tid)) return; // 环让 expandTemplate 负责报错
    const tpl = registry.get(tid);
    if (!tpl) return;
    expanding.push(tid);
    for (const role of tpl.roles) {
      if (!seen.has(role.role)) seen.set(role.role, role);
    }
    for (const spec of tpl.nodes) {
      if (spec.kind === "template") walk(spec.templateId);
    }
    expanding.pop();
  }

  walk(templateId);
  return [...seen.values()];
}

export interface TemplateStats {
  actions: number;
  slots: number;
  nested: boolean;
}

export function templateStats(
  templateId: string,
  registry: Map<string, WorkflowTemplate>,
): TemplateStats {
  const tpl = registry.get(templateId);
  const nested = tpl?.nodes.some((n) => n.kind === "template") ?? false;
  try {
    const { nodes } = expandTemplate(templateId, registry);
    return {
      actions: nodes.filter((n) => n.type === "action").length,
      slots: nodes.filter((n) => n.type === "slot").length,
      nested,
    };
  } catch {
    return { actions: 0, slots: 0, nested };
  }
}

/** 角色预选可用的在线设备：id 必填，className 是注册表设备类（endpoint route 的 registry_name）。 */
export interface RoleDeviceCandidate {
  id: string;
  className?: string;
}

/**
 * 为角色预选设备：类角色（deviceClass）先按注册表类精确匹配——恰有一台直接选中，
 * 多台不猜（留空让用户点选）；否则按 matches 在设备 id 里做子串模糊匹配。
 */
export function suggestDeviceForRole(
  role: TemplateRole,
  devices: Array<string | RoleDeviceCandidate>,
): string {
  const candidates: RoleDeviceCandidate[] = devices.map((item) =>
    typeof item === "string" ? { id: item } : item,
  );
  if (role.deviceClass) {
    const sameClass = candidates.filter((item) => item.className === role.deviceClass);
    if (sameClass.length === 1) return sameClass[0].id;
    if (sameClass.length > 1) return "";
  }
  const lowered = candidates.map((item) => [item.id, item.id.toLowerCase()] as const);
  for (const keyword of role.matches) {
    const hit = lowered.find(([, low]) => low.includes(keyword.toLowerCase()));
    if (hit) return hit[0];
  }
  return "";
}

/**
 * 把当前画布（含 slot 节点）保存为用户模板。
 * 同一设备归并为同一角色，换实验室时一次映射即可整体迁移。
 */
export function templateFromCanvas(
  meta: { id: string; name: string; description: string },
  nodes: {
    id: string;
    type?: string;
    data: Record<string, unknown>;
    /** 所在循环框的节点 id（循环体成员） */
    parent?: string;
  }[],
  edges: {
    source: string;
    target: string;
    mappings?: TemplateParamMapping[];
  }[],
): WorkflowTemplate {
  const roles = new Map<string, TemplateRole>();
  const nodeIds = new Set(nodes.map((n) => n.id));
  const specs: TemplateNodeSpec[] = nodes.map((n) => {
    const parent = n.parent && nodeIds.has(n.parent) ? n.parent : undefined;
    if (n.type === "slot") {
      return {
        key: n.id,
        kind: "slot",
        label: String(n.data.slotLabel ?? "空位"),
        hint: String(n.data.slotHint ?? ""),
        parent,
      };
    }
    if (n.type === "loop") {
      // 模板里 node_output 条件用步骤 key（= 节点 id）引用；表单 data 里的 conditionNodeId 就是节点 id
      const built = loopSpecFromNodeData(n.data as Partial<LoopNodeData>, (id) => (nodeIds.has(id) ? id : undefined), {
        hasBody: nodes.some((m) => m.parent === n.id),
      });
      const param: Record<string, unknown> = { ...built.spec };
      const condition = param.condition as Record<string, unknown> | undefined;
      if (condition && typeof condition.node_uuid === "string") {
        param.condition = { ...condition, node_key: condition.node_uuid };
        delete (param.condition as Record<string, unknown>).node_uuid;
      }
      return {
        key: n.id,
        kind: "loop",
        name: String(n.data.label ?? "") || undefined,
        param,
        parent,
      };
    }
    const deviceId = String(n.data.deviceId ?? "");
    const role = deviceId || "device";
    if (!roles.has(role)) {
      roles.set(role, {
        role,
        label: deviceId || "设备",
        matches: deviceId ? [deviceId.toLowerCase()] : [],
      });
    }
    let param: Record<string, unknown> | undefined;
    try {
      const parsed = JSON.parse(String(n.data.paramJson ?? "{}"));
      if (parsed && typeof parsed === "object" && Object.keys(parsed).length) {
        param = parsed as Record<string, unknown>;
      }
    } catch {
      param = undefined;
    }
    return {
      key: n.id,
      kind: "action",
      role,
      actionName: String(n.data.actionName ?? ""),
      param,
      parent,
    };
  });
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    source: "user",
    roles: [...roles.values()],
    nodes: specs,
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      mappings: (e.mappings ?? []).map((m) => ({ ...m })),
    })),
  };
}
