/**
 * 工作流模板：纯前端编排概念，协议无感知。
 *
 * - 模板由三种节点组成：action（设备动作，设备用**角色**占位）、
 *   slot（空位，插入后留在画布上等用户填充）、template（嵌套引用另一个模板）。
 * - 插入画布时递归**展开成真实节点/边**：嵌套模板的入边接到子图入口、
 *   出边接自子图出口；slot 保留为画布上的占位节点，可用设备动作或
 *   另一个模板继续填充（因此空位天然支持再嵌套）。
 * - 提交前画布不允许残留 slot 节点，提交体仍是标准平铺 DAG。
 */

export type TemplateParamMapping = { sourceKey: string; targetKey: string };

export type TemplateNodeSpec =
  | {
      key: string;
      kind: "action";
      role: string;
      actionName: string;
      param?: Record<string, unknown>;
    }
  | { key: string; kind: "slot"; label: string; hint?: string }
  | { key: string; kind: "template"; templateId: string };

export type TemplateEdgeSpec = {
  source: string;
  target: string;
  mappings?: TemplateParamMapping[];
};

/** 设备角色：展开时把 role 映射到具体 device_id；matches 用于在线设备的模糊预选。 */
export type TemplateRole = { role: string; label: string; matches: string[] };

export interface WorkflowTemplate {
  id: string;
  name: string;
  description: string;
  builtin?: boolean;
  roles: TemplateRole[];
  nodes: TemplateNodeSpec[];
  edges: TemplateEdgeSpec[];
}

export interface ExpandedNode {
  key: string;
  type: "action" | "slot";
  role?: string;
  actionName?: string;
  param?: Record<string, unknown>;
  slotLabel?: string;
  slotHint?: string;
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

/** 协议 vessel 资源引用的空模板（id/name 留给用户填）。 */
export function emptyVessel(): Record<string, unknown> {
  return {
    category: "container",
    children: [],
    config: "",
    data: "",
    id: "",
    name: "",
    parent: "",
    pose: {
      orientation: { w: 1, x: 0, y: 0, z: 0 },
      position: { x: 0, y: 0, z: 0 },
    },
    sample_id: "",
    type: "container",
  };
}

export const BUILT_IN_TEMPLATES: WorkflowTemplate[] = [
  {
    id: "evacuate-refill",
    name: "抽真空气氛置换",
    description: "开进气阀 → 抽真空 → 停泵 → 关阀，惰性气氛置换的标准四步。",
    builtin: true,
    roles: [
      { role: "gas_valve", label: "进气电磁阀", matches: ["solenoid", "valve"] },
      { role: "vacuum", label: "真空泵", matches: ["vacuum"] },
    ],
    nodes: [
      { key: "valve_open", kind: "action", role: "gas_valve", actionName: "open" },
      { key: "vac_on", kind: "action", role: "vacuum", actionName: "open" },
      { key: "vac_off", kind: "action", role: "vacuum", actionName: "close" },
      { key: "valve_close", kind: "action", role: "gas_valve", actionName: "close" },
    ],
    edges: [
      { source: "valve_open", target: "vac_on" },
      { source: "vac_on", target: "vac_off" },
      { source: "vac_off", target: "valve_close" },
    ],
  },
  {
    id: "heat-stir-hold",
    name: "加热搅拌保温",
    description: "升温、开搅拌，中间留一个保温阶段空位，结束后停搅拌降温。",
    builtin: true,
    roles: [
      {
        role: "heatchill",
        label: "加热/制冷器",
        matches: ["heatchill", "heater", "chiller", "heat"],
      },
      { role: "stirrer", label: "搅拌器", matches: ["stirrer", "stir"] },
    ],
    nodes: [
      {
        key: "heat_on",
        kind: "action",
        role: "heatchill",
        actionName: "heat_chill_start",
        param: { vessel: emptyVessel(), temp: 60, purpose: "reaction" },
      },
      {
        key: "stir_on",
        kind: "action",
        role: "stirrer",
        actionName: "start_stir",
        param: { vessel: emptyVessel(), stir_speed: 300, purpose: "mixing" },
      },
      {
        key: "hold",
        kind: "slot",
        label: "保温阶段",
        hint: "放监测 / 取样 / 补料等自定义步骤",
      },
      {
        key: "stir_off",
        kind: "action",
        role: "stirrer",
        actionName: "stop_stir",
        param: { vessel: emptyVessel() },
      },
      {
        key: "heat_off",
        kind: "action",
        role: "heatchill",
        actionName: "heat_chill_stop",
        param: { vessel: emptyVessel() },
      },
    ],
    edges: [
      { source: "heat_on", target: "stir_on" },
      { source: "stir_on", target: "hold" },
      { source: "hold", target: "stir_off" },
      { source: "stir_off", target: "heat_off" },
    ],
  },
  {
    id: "workup-filter-rotavap",
    name: "过滤旋蒸后处理",
    description: "过滤 → 转移空位 → 旋蒸浓缩，常规后处理骨架。",
    builtin: true,
    roles: [
      { role: "filter", label: "过滤器", matches: ["filter"] },
      { role: "rotavap", label: "旋转蒸发器", matches: ["rotavap", "rotary"] },
    ],
    nodes: [
      { key: "filt", kind: "action", role: "filter", actionName: "filter" },
      {
        key: "transfer",
        kind: "slot",
        label: "转移操作",
        hint: "滤液转移到旋蒸瓶的步骤",
      },
      { key: "evap", kind: "action", role: "rotavap", actionName: "evaporate" },
    ],
    edges: [
      { source: "filt", target: "transfer" },
      { source: "transfer", target: "evap" },
    ],
  },
  {
    id: "sample-separate",
    name: "取样分液",
    description: "先留取样空位，再接分液器 separate，演示以空位开头的模板。",
    builtin: true,
    roles: [{ role: "separator", label: "分液器", matches: ["separator", "separate"] }],
    nodes: [
      { key: "sample", kind: "slot", label: "取样操作", hint: "从反应器取样的步骤" },
      { key: "sep", kind: "action", role: "separator", actionName: "separate" },
    ],
    edges: [{ source: "sample", target: "sep" }],
  },
  {
    id: "standard-synthesis",
    name: "标准合成流程（嵌套）",
    description:
      "气氛置换 → 投料空位 → 加热搅拌保温 → 过滤旋蒸后处理，嵌套三个子模板并保留其空位。",
    builtin: true,
    roles: [],
    nodes: [
      { key: "prep", kind: "template", templateId: "evacuate-refill" },
      {
        key: "charge",
        kind: "slot",
        label: "投料",
        hint: "加入试剂 / 底物的操作步骤",
      },
      { key: "react", kind: "template", templateId: "heat-stir-hold" },
      { key: "workup", kind: "template", templateId: "workup-filter-rotavap" },
    ],
    edges: [
      { source: "prep", target: "charge" },
      { source: "charge", target: "react" },
      { source: "react", target: "workup" },
    ],
  },
];

export function buildTemplateRegistry(
  userTemplates: WorkflowTemplate[] = [],
): Map<string, WorkflowTemplate> {
  const registry = new Map<string, WorkflowTemplate>();
  for (const tpl of BUILT_IN_TEMPLATES) registry.set(tpl.id, tpl);
  for (const tpl of userTemplates) registry.set(tpl.id, tpl);
  return registry;
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

  function walk(tid: string, prefix: string): { entries: string[]; exits: string[] } {
    if (expanding.includes(tid)) {
      throw new Error(`模板嵌套成环：${[...expanding, tid].join(" → ")}`);
    }
    const tpl = registry.get(tid);
    if (!tpl) throw new Error(`模板不存在：${tid}`);
    expanding.push(tid);

    const members = new Map<string, { entries: string[]; exits: string[] }>();
    for (const spec of tpl.nodes) {
      const key = prefix ? `${prefix}.${spec.key}` : spec.key;
      if (spec.kind === "template") {
        members.set(spec.key, walk(spec.templateId, key));
      } else if (spec.kind === "action") {
        nodes.push({
          key,
          type: "action",
          role: spec.role,
          actionName: spec.actionName,
          param: spec.param,
        });
        members.set(spec.key, { entries: [key], exits: [key] });
      } else {
        nodes.push({ key, type: "slot", slotLabel: spec.label, slotHint: spec.hint });
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

    const targeted = new Set(tpl.edges.map((e) => e.target));
    const sourced = new Set(tpl.edges.map((e) => e.source));
    const entries = tpl.nodes
      .filter((n) => !targeted.has(n.key))
      .flatMap((n) => members.get(n.key)!.entries);
    const exits = tpl.nodes
      .filter((n) => !sourced.has(n.key))
      .flatMap((n) => members.get(n.key)!.exits);

    expanding.pop();
    return { entries, exits };
  }

  walk(templateId, "");
  return { nodes, edges };
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

/** 按角色 matches 在在线设备里做模糊预选。 */
export function suggestDeviceForRole(
  role: TemplateRole,
  deviceIds: string[],
): string {
  const lowered = deviceIds.map((id) => [id, id.toLowerCase()] as const);
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
  }[],
  edges: {
    source: string;
    target: string;
    mappings?: TemplateParamMapping[];
  }[],
): WorkflowTemplate {
  const roles = new Map<string, TemplateRole>();
  const specs: TemplateNodeSpec[] = nodes.map((n) => {
    if (n.type === "slot") {
      return {
        key: n.id,
        kind: "slot",
        label: String(n.data.slotLabel ?? "空位"),
        hint: String(n.data.slotHint ?? ""),
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
    };
  });
  return {
    id: meta.id,
    name: meta.name,
    description: meta.description,
    roles: [...roles.values()],
    nodes: specs,
    edges: edges.map((e) => ({
      source: e.source,
      target: e.target,
      mappings: (e.mappings ?? []).map((m) => ({ ...m })),
    })),
  };
}
