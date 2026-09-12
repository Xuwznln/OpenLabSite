/**
 * 设备包 @workflow 模板 ↔ 编排模板：注册表条目转换、两源合并、按设备类预选。
 */
import { describe, expect, it } from "vitest";
import type { RegistryWorkflowTemplate } from "@openlab/protocol";
import {
  REGISTRY_TEMPLATE_ID_PREFIX,
  buildTemplateRegistry,
  collectRoles,
  expandTemplate,
  hasTemplateGuide,
  suggestDeviceForRole,
  templateFromCanvas,
  templateFromRegistry,
  templateProcedure,
  templateSource,
  templateStats,
  type WorkflowTemplate,
} from "./workflow-templates";

/** 后端 build_workflow_template_payload 的输出形状（site_demo 的 site_tour）。 */
const SITE_TOUR: RegistryWorkflowTemplate = {
  id: "site_demo.workflows:site_tour",
  registry_type: "workflow",
  uuid: "6c4a2f9e-3b1d-5f0a-9c2e-7d8b1a4e5f60",
  display_name: "位点操作演示",
  description: "装载 -> 转移 -> 查看",
  tags: ["site-demo"],
  package: "site_demo",
  module: "site_demo.workflows",
  roles: [
    {
      role: "class:sample_rack_demo",
      label: "sample_rack_demo",
      kind: "class",
      device_class: "sample_rack_demo",
      matches: ["sample_rack_demo"],
    },
    { role: "sample_rack", label: "sample_rack", kind: "device", device_id: "sample_rack", matches: ["sample_rack"] },
  ],
  nodes: [
    {
      key: "step-0",
      kind: "action",
      role: "class:sample_rack_demo",
      action_name: "load_sample",
      name: "装载样品",
      param: { site: "A2", sample_name: "wf-sample" },
      inventory_requirements: [{ key: "water", kind: "lot", quantity: 40, unit: "ml" }],
    },
    { key: "step-1", kind: "action", role: "sample_rack", action_name: "transfer_sample", name: "转移样品", param: { from_label: "A2", to_label: "B1" } },
    { key: "step-2", kind: "action", role: "sample_rack", action_name: "inspect_sites", name: "查看位点", param: {} },
  ],
  edges: [
    { source: "step-0", target: "step-1" },
    { source: "step-1", target: "step-2" },
  ],
};

describe("templateFromRegistry", () => {
  it("把注册表条目转成同形编排模板：类角色带 deviceClass，空 param 省略，库存需求保留", () => {
    const tpl = templateFromRegistry(SITE_TOUR);
    expect(tpl.id).toBe(`${REGISTRY_TEMPLATE_ID_PREFIX}${SITE_TOUR.uuid}`);
    expect(tpl.name).toBe("位点操作演示");
    expect(templateSource(tpl)).toBe("registry");
    expect(tpl.packageName).toBe("site_demo");
    // 旧 Host 不带 package：从条目名 module:qualname 的顶层包推导
    const { package: _omitted, ...legacy } = SITE_TOUR;
    expect(templateFromRegistry(legacy).packageName).toBe("site_demo");
    expect(tpl.roles).toEqual([
      { role: "class:sample_rack_demo", label: "sample_rack_demo", matches: ["sample_rack_demo"], deviceClass: "sample_rack_demo" },
      { role: "sample_rack", label: "sample_rack", matches: ["sample_rack"], deviceClass: undefined },
    ]);
    expect(tpl.nodes[0]).toEqual({
      key: "step-0",
      kind: "action",
      role: "class:sample_rack_demo",
      actionName: "load_sample",
      name: "装载样品",
      description: undefined,
      param: { site: "A2", sample_name: "wf-sample" },
      inventoryRequirements: [{ key: "water", kind: "lot", quantity: 40, unit: "ml" }],
    });
    expect(tpl.guide).toBeUndefined();
    expect(tpl.nodes[2]).toMatchObject({ kind: "action", actionName: "inspect_sites", param: undefined, inventoryRequirements: undefined });
    expect(tpl.edges).toEqual(SITE_TOUR.edges);
  });

  it("展开成串行链并透传库存需求；统计口径与用户模板一致", () => {
    const registry = buildTemplateRegistry([], [templateFromRegistry(SITE_TOUR)]);
    const id = `${REGISTRY_TEMPLATE_ID_PREFIX}${SITE_TOUR.uuid}`;
    const { nodes, edges } = expandTemplate(id, registry);
    expect(nodes.map((n) => n.actionName)).toEqual(["load_sample", "transfer_sample", "inspect_sites"]);
    expect(nodes[0].inventoryRequirements).toEqual([{ key: "water", kind: "lot", quantity: 40, unit: "ml" }]);
    expect(edges.map((e) => `${e.source}>${e.target}`)).toEqual(["step-0>step-1", "step-1>step-2"]);
    expect(templateStats(id, registry)).toEqual({ actions: 3, slots: 0, nested: false });
    expect(collectRoles(id, registry).map((r) => r.role)).toEqual(["class:sample_rack_demo", "sample_rack"]);
  });
});

describe("模板全流程说明（guide + 步骤 description）", () => {
  const GUIDED: RegistryWorkflowTemplate = {
    ...SITE_TOUR,
    id: "site_demo.workflows:guided",
    uuid: "7d5b3a0f-4c2e-5a1b-8d3f-9e0c1b2a3d4e",
    nodes: SITE_TOUR.nodes.map((node, index) =>
      index === 0 ? { ...node, description: "创建名为 wf-sample 的样品并放到 A2" } : node,
    ),
    guide: {
      preparation: ["设备页确认 sample_rack 在线", "A2、B1 位点为空"],
      expected: ["B1 被 wf-sample 占用，A2 为空"],
      notes: [],
    },
  };

  it("guide 与步骤说明进模板；步骤清单按声明序带角色与动作", () => {
    const tpl = templateFromRegistry(GUIDED);
    expect(tpl.guide).toEqual(GUIDED.guide);
    expect(hasTemplateGuide(tpl)).toBe(true);
    expect(templateProcedure(tpl)).toEqual([
      { index: 1, title: "装载样品", roleLabel: "sample_rack_demo", actionName: "load_sample", description: "创建名为 wf-sample 的样品并放到 A2", kind: "action", depth: 0 },
      { index: 2, title: "转移样品", roleLabel: "sample_rack", actionName: "transfer_sample", description: "", kind: "action", depth: 0 },
      { index: 3, title: "查看位点", roleLabel: "sample_rack", actionName: "inspect_sites", description: "", kind: "action", depth: 0 },
    ]);
  });

  it("设备包模板里的循环：loop 节点 + parent 成员，展开后保留容器归属与条件引用", () => {
    const entry: RegistryWorkflowTemplate = {
      ...SITE_TOUR,
      uuid: "loop-tpl",
      nodes: [
        { key: "step-0", kind: "action", role: "sample_rack", action_name: "prep", name: "准备" },
        {
          key: "step-1",
          kind: "loop",
          name: "直到就绪",
          param: { mode: "while", condition: { source: "node_output", node_key: "step-3", data_key: "ready", op: "==", value: false }, max_iterations: 10 },
        },
        { key: "step-2", kind: "action", role: "sample_rack", action_name: "work", name: "干活", parent: "step-1" },
        { key: "step-3", kind: "action", role: "sample_rack", action_name: "probe", name: "探测", parent: "step-1" },
        { key: "step-4", kind: "action", role: "sample_rack", action_name: "done", name: "收尾" },
      ],
      edges: [
        { source: "step-0", target: "step-1" },
        { source: "step-2", target: "step-3" },
        { source: "step-1", target: "step-4" },
      ],
    };
    const tpl = templateFromRegistry(entry);
    expect(tpl.nodes[1]).toEqual({
      key: "step-1",
      kind: "loop",
      name: "直到就绪",
      description: undefined,
      param: entry.nodes[1].param,
      parent: undefined,
    });
    expect(tpl.nodes[2]).toMatchObject({ kind: "action", parent: "step-1" });
    expect(templateProcedure(tpl).map((step) => [step.kind, step.depth])).toEqual([
      ["action", 0],
      ["loop", 0],
      ["action", 1],
      ["action", 1],
      ["action", 0],
    ]);
    const registry = buildTemplateRegistry([], [tpl]);
    const expanded = expandTemplate(tpl.id, registry);
    expect(expanded.nodes.map((n) => [n.key, n.type, n.parent])).toEqual([
      ["step-0", "action", undefined],
      ["step-1", "loop", undefined],
      ["step-2", "action", "step-1"],
      ["step-3", "action", "step-1"],
      ["step-4", "action", undefined],
    ]);
    expect(expanded.nodes[1].loopSpec).toEqual(entry.nodes[1].param);
    expect(expanded.edges.map((e) => `${e.source}->${e.target}`)).toEqual(["step-0->step-1", "step-2->step-3", "step-1->step-4"]);
    expect(templateStats(tpl.id, registry)).toEqual({ actions: 4, slots: 0, nested: false });
  });

  it("没有 guide 也没有任一步说明的模板不显示流程说明入口；空 guide 等同没有", () => {
    expect(hasTemplateGuide(templateFromRegistry(SITE_TOUR))).toBe(false);
    expect(
      hasTemplateGuide(templateFromRegistry({ ...SITE_TOUR, guide: { preparation: [], expected: [], notes: [] } })),
    ).toBe(false);
    // 用户模板：步骤清单照常可列（标题退化为动作名），空位与嵌套分别处理
    const heat: WorkflowTemplate = {
      id: "user-heat",
      name: "加热搅拌保温",
      description: "",
      source: "user",
      roles: [{ role: "heatchill", label: "加热器", matches: ["heat"] }],
      nodes: [
        { key: "heat_on", kind: "action", role: "heatchill", actionName: "heat_chill_start" },
        { key: "hold", kind: "slot", label: "保温阶段", hint: "放监测 / 取样等自定义步骤" },
        { key: "heat_off", kind: "action", role: "heatchill", actionName: "heat_chill_stop" },
      ],
      edges: [
        { source: "heat_on", target: "hold" },
        { source: "hold", target: "heat_off" },
      ],
    };
    expect(templateProcedure(heat).map((s) => `${s.index}.${s.title}`)).toEqual([
      "1.heat_chill_start", "2.保温阶段", "3.heat_chill_stop",
    ]);
    const nested: WorkflowTemplate = {
      id: "user-nested",
      name: "嵌套",
      description: "",
      source: "user",
      roles: [],
      nodes: [
        { key: "charge", kind: "slot", label: "投料", hint: "加入试剂 / 底物的操作步骤" },
        { key: "react", kind: "template", templateId: "user-heat" },
      ],
      edges: [{ source: "charge", target: "react" }],
    };
    const steps = templateProcedure(nested);
    expect(steps.map((s) => s.kind)).toEqual(["slot"]);
    expect(steps[0]).toMatchObject({ index: 1, title: "投料", description: "加入试剂 / 底物的操作步骤" });
  });
});

describe("buildTemplateRegistry", () => {
  it("设备包 → 用户两源共存，站点不再内置模板；早期无 source 字段的用户模板按 user 处理", () => {
    const user = templateFromCanvas(
      { id: "user-1", name: "我的", description: "" },
      [{ id: "n1", type: "action", data: { deviceId: "pump", actionName: "run", paramJson: "{}" } }],
      [],
    );
    expect(buildTemplateRegistry().size).toBe(0);
    const registry = buildTemplateRegistry([user], [templateFromRegistry(SITE_TOUR)]);
    expect(registry.size).toBe(2);
    expect(templateSource(registry.get("user-1")!)).toBe("user");
    expect(templateSource(registry.get(`${REGISTRY_TEMPLATE_ID_PREFIX}${SITE_TOUR.uuid}`)!)).toBe("registry");
    const legacyUser = { ...user, source: undefined };
    expect(templateSource(legacyUser)).toBe("user");
  });
});

describe("suggestDeviceForRole", () => {
  const devices = [
    { id: "sample_rack", className: "sample_rack_demo" },
    { id: "bench", className: "material_bench_demo" },
    { id: "vacuum_pump_1", className: "pump" },
  ];

  it("类角色按注册表类精确预选；多台同类不猜", () => {
    const [classRole, deviceRole] = templateFromRegistry(SITE_TOUR).roles;
    expect(suggestDeviceForRole(classRole, devices)).toBe("sample_rack");
    expect(suggestDeviceForRole(deviceRole, devices)).toBe("sample_rack");
    expect(
      suggestDeviceForRole(classRole, [...devices, { id: "sample_rack_2", className: "sample_rack_demo" }]),
    ).toBe("");
  });

  it("没有类信息时回退到 id 子串匹配；纯 id 列表仍兼容", () => {
    const role = { role: "vacuum", label: "真空泵", matches: ["vacuum"] };
    expect(suggestDeviceForRole(role, devices)).toBe("vacuum_pump_1");
    expect(suggestDeviceForRole(role, ["heater", "Vacuum-A"])).toBe("Vacuum-A");
    expect(suggestDeviceForRole(role, ["heater"])).toBe("");
  });
});
