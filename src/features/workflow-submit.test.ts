import { describe, expect, it, vi } from "vitest";
import type { BackendWorkflow, BackendWorkflowGraph, BackendWorkflowTask } from "@openlab/protocol";
import { ApiError, BackendBusinessError } from "@openlab/protocol";
import {
  buildAuthorityGraph,
  placeholderMaterialUuid,
  SubmitGraphError,
  submitWorkflow,
  UUID_NAMESPACE_URL,
  uuidV5,
  WORKFLOW_NAMESPACE,
  type SubmitWorkflowApi,
} from "./workflow-submit";

const PUMP = "11111111-1111-4111-8111-111111111111";
const HEATER = "22222222-2222-4222-8222-222222222222";

const resolveDevice = (deviceId: string) => {
  if (deviceId === "pump_1") {
    return { materialUuid: PUMP, action: () => ({ actionType: "UniLabJsonCommand", alwaysFree: false }) };
  }
  if (deviceId === "heater_1") {
    return { materialUuid: HEATER, action: (name: string) => (name === "read_temp" ? { actionType: "UniLabJsonCommand", alwaysFree: true } : undefined) };
  }
  // host_node：在设备目录里（有动作能力）但物料权威里没有根物料；这个 Host 没有 manual_confirm 动作
  if (deviceId === "host_node") {
    return { materialUuid: undefined, action: (name: string) => (name === "manual_confirm" ? undefined : { actionType: "UniLabJsonCommand" }) };
  }
  return undefined;
};

/** 带人工确认能力的 Host（host_node 与第二个执行节点 host_node_b 都暴露 manual_confirm）。 */
const resolveDeviceWithConfirm = (deviceId: string) => {
  if (deviceId === "host_node" || deviceId === "host_node_b") {
    return { materialUuid: undefined, action: (name: string) => (name === "manual_confirm" ? { actionType: "UniLabJsonCommand", alwaysFree: true } : undefined) };
  }
  return resolveDevice(deviceId);
};

const actionNode = (id: string, deviceId: string, actionName: string, x: number, extra: Record<string, unknown> = {}) => ({
  id,
  type: "action",
  position: { x, y: 100.4 },
  data: { deviceId, actionName, actionType: "goal", paramJson: '{"volume": 5}', requirementsJson: "[]", ...extra },
});

describe("uuid v5 与后端一致", () => {
  it("WORKFLOW_NAMESPACE = uuid5(NAMESPACE_URL, unilabos://workflow)，占位 uuid 与 Python uuid.uuid5 逐位相同", async () => {
    expect(await uuidV5(UUID_NAMESPACE_URL, "unilabos://workflow")).toBe(WORKFLOW_NAMESPACE);
    // 由 python -c "uuid.uuid5(uuid.uuid5(uuid.NAMESPACE_URL, 'unilabos://workflow'), 'device:host_node')" 得到
    expect(await placeholderMaterialUuid("host_node")).toBe("3396cc01-4a35-5d9a-9160-91bbb8be900b");
    expect(await placeholderMaterialUuid("pump_1")).toBe("72ccac60-1a61-542a-9cd7-100b5ee58efb");
  });
});

describe("buildAuthorityGraph", () => {
  it("顺序连线 → depends_on，边为空；设备节点绑定 material_uuid 与 registry action_type；人工确认节点无设备", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "pump_1", "dispense", 80),
        actionNode("n2", "heater_1", "read_temp", 420),
        { id: "n3", type: "manual", position: { x: 760, y: 100 }, data: { label: "检查", prompt: "看颜色" } },
      ],
      edges: [
        { source: "n1", target: "n2", mappings: [] },
        { source: "n2", target: "n3", mappings: [] },
        { source: "n1", target: "n3", mappings: [] },
      ],
      disabled: new Set(["n3"]),
      resolveDevice,
    });
    const [n1, n2, n3] = build.nodes;
    expect(build.uuidByNodeId.size).toBe(3);
    expect(n1.type).toBe("device_action");
    expect(n1.material_uuid).toBe(PUMP);
    expect(n1.action_type).toBe("UniLabJsonCommand");
    expect(n1.execution_policy).toEqual({});
    expect(n1.param).toEqual({ volume: 5 });
    expect(n1.pose).toEqual({ x: 80, y: 100 });
    expect(n1.meta_data).toEqual({ target_device_id: "pump_1", editor_node_id: "n1" });
    expect(n2.execution_policy).toEqual({ depends_on: [build.uuidByNodeId.get("n1")], always_free: true });
    expect(n3.type).toBe("manual_confirm");
    expect(n3.material_uuid).toBeUndefined();
    expect(n3.param).toEqual({ label: "检查", prompt: "看颜色" });
    expect(n3.disabled).toBe(true);
    expect(n3.execution_policy).toEqual({ depends_on: [build.uuidByNodeId.get("n2"), build.uuidByNodeId.get("n1")] });
    // 这个 Host 的 host_node 没有 manual_confirm：人工确认退回裸节点并提醒
    expect(build.warnings).toHaveLength(1);
    expect(build.warnings[0]).toContain("manual_confirm");
    // n3 已 disabled，不算"不能本地运行"
    expect(build.notLocallyExecutable).toEqual([]);
  });

  it("循环容器：提交为 type=loop（param=LoopSpec），成员带 parent_uuid，node_output 条件引用换成 uuid", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n0", "pump_1", "dispense", 0),
        {
          id: "L1",
          type: "loop",
          position: { x: 300, y: 60 },
          data: { label: "三轮", mode: "for", count: 3, intervalSeconds: 0 },
        },
        { ...actionNode("n1", "pump_1", "dispense", 340, { paramJson: '{"volume": "{{loop.iteration}}"}' }), loopId: "L1" },
        { ...actionNode("n2", "heater_1", "read_temp", 620), loopId: "L1" },
        {
          id: "L2",
          type: "loop",
          position: { x: 900, y: 60 },
          data: {
            label: "直到达温",
            mode: "while",
            conditionSource: "node_output",
            conditionNodeId: "n2",
            dataKey: "temperature",
            op: "<",
            value: "80",
            maxIterations: 20,
            intervalSeconds: 2,
          },
        },
        {
          id: "L3",
          type: "loop",
          position: { x: 1200, y: 60 },
          data: {
            label: "等待就绪",
            mode: "while",
            conditionSource: "device_state",
            deviceId: "heater_1",
            field: "ready",
            op: "==",
            value: "false",
            maxIterations: 100,
            intervalSeconds: 1.5,
          },
        },
      ],
      edges: [
        { source: "n0", target: "L1", mappings: [] },
        { source: "n1", target: "n2", mappings: [] },
        { source: "L1", target: "L2", mappings: [] },
        { source: "L2", target: "L3", mappings: [] },
      ],
      disabled: new Set(),
      resolveDevice,
    });
    const byId = new Map(build.nodes.map((node) => [String(node.meta_data?.editor_node_id), node]));
    const loop = byId.get("L1")!;
    expect(loop.type).toBe("loop");
    expect(loop.param).toEqual({ mode: "for", count: 3, interval_seconds: 0 });
    expect(loop.execution_policy).toEqual({ depends_on: [build.uuidByNodeId.get("n0")] });
    expect(loop.parent_uuid).toBeUndefined();
    expect(byId.get("n1")!.parent_uuid).toBe(loop.uuid);
    expect(byId.get("n1")!.param).toEqual({ volume: "{{loop.iteration}}" });
    expect(byId.get("n2")!.parent_uuid).toBe(loop.uuid);
    expect(byId.get("n2")!.execution_policy).toEqual({ depends_on: [build.uuidByNodeId.get("n1")], always_free: true });
    // while 条件：引用的节点编辑器 id → 权威 uuid；对比值按 JSON 解析
    expect(byId.get("L2")!.param).toEqual({
      mode: "while",
      condition: { source: "node_output", op: "<", value: 80, node_uuid: build.uuidByNodeId.get("n2"), data_key: "temperature" },
      max_iterations: 20,
      interval_seconds: 2,
    });
    expect(byId.get("L3")!.param).toEqual({
      mode: "while",
      condition: { source: "device_state", op: "==", value: false, device_id: "heater_1", field: "ready" },
      max_iterations: 100,
      interval_seconds: 1.5,
    });
    // 循环是本机可执行的
    expect(build.notLocallyExecutable).toEqual([]);
  });

  it("循环配置不完整时提交前拦下", async () => {
    await expect(
      buildAuthorityGraph({
        nodes: [
          {
            id: "L1",
            type: "loop",
            position: { x: 0, y: 0 },
            data: { label: "等状态", mode: "while", conditionSource: "device_state", deviceId: "", field: "", op: "==", value: "1" },
          },
        ],
        edges: [],
        disabled: new Set(),
        resolveDevice,
      }),
    ).rejects.toThrow(SubmitGraphError);
    // 空循环体的 while 必须有轮询间隔
    await expect(
      buildAuthorityGraph({
        nodes: [
          {
            id: "L1",
            type: "loop",
            position: { x: 0, y: 0 },
            data: { label: "等状态", mode: "while", conditionSource: "device_state", deviceId: "heater_1", field: "ready", op: "==", value: "false", intervalSeconds: 0 },
          },
        ],
        edges: [],
        disabled: new Set(),
        resolveDevice,
      }),
    ).rejects.toThrow(/轮询间隔/);
  });

  it("模板插入成组：成员节点 meta_data.editor_group 记所属组，组框本身不进提交体", async () => {
    const group = { id: "g1", name: "位点操作演示", description: "装载 → 转移 → 查看", template_id: "registry:u1" };
    const build = await buildAuthorityGraph({
      nodes: [
        { id: "g1", type: "group", position: { x: 0, y: 0 }, data: { groupName: group.name } },
        { ...actionNode("n1", "pump_1", "dispense", 80), group },
        { ...actionNode("n2", "heater_1", "read_temp", 420), group: { id: "g2", name: "手动组", description: "" } },
        actionNode("n3", "pump_1", "dispense", 760),
      ],
      edges: [{ source: "n1", target: "n2", mappings: [] }],
      disabled: new Set(),
      resolveDevice,
    });
    expect(build.nodes.map((node) => node.meta_data?.editor_node_id)).toEqual(["n1", "n2", "n3"]);
    expect(build.nodes[0].meta_data?.editor_group).toEqual(group);
    expect(build.nodes[1].meta_data?.editor_group).toEqual({ id: "g2", name: "手动组", description: "" });
    expect(build.nodes[2].meta_data).not.toHaveProperty("editor_group");
  });

  it("host_node / 无根物料的设备用与后端相同的占位 material_uuid，不报错；完全未知的设备只给提醒", async () => {
    const build = await buildAuthorityGraph({
      nodes: [actionNode("n1", "host_node", "create_resource", 0), actionNode("n2", "future_device", "run", 300)],
      edges: [{ source: "n1", target: "n2", mappings: [] }],
      disabled: new Set(),
      resolveDevice,
    });
    expect(build.nodes[0].material_uuid).toBe("3396cc01-4a35-5d9a-9160-91bbb8be900b");
    expect(build.nodes[0].action_type).toBe("UniLabJsonCommand");
    expect(build.nodes[1].material_uuid).toBe(await placeholderMaterialUuid("future_device"));
    expect(build.nodes[1].action_type).toBe("goal");
    expect(build.warnings).toHaveLength(1);
    expect(build.warnings[0]).toContain("future_device");
    expect(build.warnings[0]).not.toContain("host_node");
  });

  it("Host 没有 manual_confirm 动作时：人工确认退回裸节点并被标为不能本地运行", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "pump_1", "dispense", 0),
        { id: "m1", type: "manual", position: { x: 0, y: 0 }, data: { label: "检查", prompt: "" } },
      ],
      edges: [{ source: "n1", target: "m1", mappings: [] }],
      disabled: new Set(),
      resolveDevice,
    });
    expect(build.nodes[1].type).toBe("manual_confirm");
    expect(build.notLocallyExecutable).toEqual([{ id: "m1", name: "检查", type: "manual_confirm" }]);
  });

  it("Host 提供 host_node/manual_confirm 时：人工确认提交为 host_node 的设备动作，本地可运行", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "pump_1", "dispense", 0),
        { id: "m1", type: "manual", position: { x: 300, y: 0 }, data: { label: "检查颜色", prompt: "看一眼", assignees: [], timeoutSeconds: 600 } },
      ],
      edges: [{ source: "n1", target: "m1", mappings: [] }],
      disabled: new Set(),
      resolveDevice: resolveDeviceWithConfirm,
    });
    const confirm = build.nodes[1];
    expect(confirm.type).toBe("device_action");
    expect(confirm.action_name).toBe("manual_confirm");
    expect(confirm.action_type).toBe("UniLabJsonCommand");
    expect(confirm.material_uuid).toBe(await placeholderMaterialUuid("host_node"));
    expect(confirm.param).toEqual({ assignee_user_ids: [], timeout_seconds: 600 });
    expect(confirm.execution_policy).toEqual({ depends_on: [build.uuidByNodeId.get("n1")], always_free: true });
    expect(confirm.meta_data).toEqual({ target_device_id: "host_node", editor_node_id: "m1", manual_confirm: { label: "检查颜色", prompt: "看一眼" } });
    expect(build.notLocallyExecutable).toEqual([]);
  });

  it("多个执行节点：人工确认按节点上选定的 hostId 提交，指派人空列表按原样提交", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        { id: "m1", type: "manual", position: { x: 0, y: 0 }, data: { label: "B 站确认", prompt: "", hostId: "host_node_b", assignees: [], timeoutSeconds: 0 } },
        { id: "m2", type: "manual", position: { x: 300, y: 0 }, data: { label: "指派确认", prompt: "", hostId: "host_node", assignees: ["alice", ""] } },
        { id: "m3", type: "manual", position: { x: 600, y: 0 }, data: { label: "丢失的执行节点", prompt: "", hostId: "host_node_gone" } },
      ],
      edges: [],
      disabled: new Set(),
      resolveDevice: resolveDeviceWithConfirm,
    });
    expect(build.nodes[0].meta_data?.target_device_id).toBe("host_node_b");
    expect(build.nodes[0].material_uuid).toBe(await placeholderMaterialUuid("host_node_b"));
    expect(build.nodes[0].param).toEqual({ assignee_user_ids: [], timeout_seconds: 3600 });
    expect(build.nodes[1].param).toEqual({ assignee_user_ids: ["alice"], timeout_seconds: 3600 });
    // 选定的执行节点不在线：退回裸节点 + 提醒，运行前会被拦
    expect(build.nodes[2].type).toBe("manual_confirm");
    expect(build.warnings.some((w) => w.includes("host_node_gone"))).toBe(true);
    expect(build.notLocallyExecutable.map((n) => n.id)).toEqual(["m3"]);
  });

  it("人工确认严格区分 assignee_user_ids 缺失与显式空列表", async () => {
    const missing = await buildAuthorityGraph({
      nodes: [{ id: "m1", type: "manual", position: { x: 0, y: 0 }, data: { label: "未配置" } }],
      edges: [],
      disabled: new Set(),
      resolveDevice: resolveDeviceWithConfirm,
    });
    expect(missing.nodes[0]?.param).toEqual({ timeout_seconds: 3600 });
    expect(Object.prototype.hasOwnProperty.call(missing.nodes[0]?.param ?? {}, "assignee_user_ids")).toBe(false);

    const unrestricted = await buildAuthorityGraph({
      nodes: [{ id: "m2", type: "manual", position: { x: 0, y: 0 }, data: { label: "任何人", assignees: [] } }],
      edges: [],
      disabled: new Set(),
      resolveDevice: resolveDeviceWithConfirm,
    });
    expect(unrestricted.nodes[0]?.param).toEqual({ assignee_user_ids: [], timeout_seconds: 3600 });
  });

  it("复用草稿里的稳定 uuid，不合法的重新分配", async () => {
    const build = await buildAuthorityGraph({
      nodes: [actionNode("n1", "pump_1", "dispense", 0, { uuid: PUMP }), actionNode("n2", "pump_1", "dispense", 0, { uuid: "n2-temp" })],
      edges: [],
      disabled: new Set(),
      resolveDevice,
    });
    expect(build.uuidByNodeId.get("n1")).toBe(PUMP);
    expect(build.uuidByNodeId.get("n2")).toMatch(/^[0-9a-f-]{36}$/);
    expect(build.uuidByNodeId.get("n2")).not.toBe("n2-temp");
  });

  it("导入草稿中重复的节点 uuid 自动修复为唯一身份，并保留第一次出现的 uuid", async () => {
    const duplicate = "1b9e7066-e1f6-4922-8099-c31869589f09";
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "host_node", "test_latency", 0, { uuid: duplicate }),
        actionNode("n3", "host_node", "test_latency", 300, { uuid: duplicate }),
      ],
      edges: [{ source: "n1", target: "n3", mappings: [] }],
      disabled: new Set(),
      resolveDevice,
    });
    const first = build.uuidByNodeId.get("n1");
    const second = build.uuidByNodeId.get("n3");
    expect(first).toBe(duplicate);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).not.toBe(duplicate);
    expect(new Set(build.nodes.map((node) => node.uuid)).size).toBe(2);
    expect(build.warnings).toContain(
      `节点 n3 与 n1 复用了同一个 UUID ${duplicate}，已为当前节点重新分配唯一 UUID`,
    );
    expect(build.nodes[1]?.execution_policy).toEqual({ depends_on: [first] });
  });

  it("新建定义不复用导入草稿携带的旧节点 uuid", async () => {
    const imported = "1b9e7066-e1f6-4922-8099-c31869589f09";
    const build = await buildAuthorityGraph({
      nodes: [actionNode("n1", "host_node", "test_latency", 0, { uuid: imported })],
      edges: [],
      disabled: new Set(),
      reuseExistingUuids: false,
      resolveDevice,
    });
    expect(build.nodes[0]?.uuid).toMatch(/^[0-9a-f-]{36}$/);
    expect(build.nodes[0]?.uuid).not.toBe(imported);
  });

  it("接受后端生成的 v7 节点 uuid，并把旧导出的数字人工指派转成字符串", async () => {
    const v7 = "018f0c6e-7b2a-7000-8000-000000000001";
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "host_node", "manual_confirm", 0, {
          uuid: v7,
          paramJson: JSON.stringify({ assignee_user_ids: [1, " alice ", ""] }),
        }),
      ],
      edges: [],
      disabled: new Set(),
      resolveDevice: resolveDeviceWithConfirm,
    });
    expect(build.nodes[0]?.uuid).toBe(v7);
    expect(build.nodes[0]?.param).toEqual({ assignee_user_ids: ["1", "alice"] });
  });

  it("带数量的库存需求映射为 lot InventoryRequirement，缺 key 给出提醒", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "pump_1", "dispense", 0, {
          requirementsJson: JSON.stringify([{ template_id: "33333333-3333-4333-8333-333333333333", quantity: 40, unit: "ml" }]),
        }),
      ],
      edges: [],
      disabled: new Set(),
      resolveDevice,
    });
    expect(build.nodes[0].meta_data?.inventory_requirements).toEqual([
      { key: "inventory", kind: "lot", template_uuid: "33333333-3333-4333-8333-333333333333", quantity: 40, unit: "ml" },
    ]);
    expect(build.warnings).toHaveLength(1);
  });

  it("不带数量或显式 kind=material 的库存需求映射为 material（按件选一件实例）", async () => {
    const build = await buildAuthorityGraph({
      nodes: [
        actionNode("n1", "host_node", "apply_deduct_resource", 0, {
          requirementsJson: JSON.stringify([
            { key: "resource", template_uuid: "44444444-4444-4444-8444-444444444444" },
            { key: "plate", kind: "material", template_uuid: "55555555-5555-4555-8555-555555555555", quantity: 3 },
          ]),
        }),
      ],
      edges: [],
      disabled: new Set(),
      resolveDevice,
    });
    expect(build.nodes[0].meta_data?.inventory_requirements).toEqual([
      { key: "resource", kind: "material", template_uuid: "44444444-4444-4444-8444-444444444444" },
      { key: "plate", kind: "material", template_uuid: "55555555-5555-4555-8555-555555555555" },
    ]);
    expect(build.warnings).toHaveLength(0);
  });

  it("带参数传递的连线、坏 JSON、空位都拒绝提交并说清原因", async () => {
    const base = { disabled: new Set<string>(), resolveDevice };
    await expect(
      buildAuthorityGraph({
        ...base,
        nodes: [actionNode("n1", "pump_1", "dispense", 0), actionNode("n2", "pump_1", "dispense", 0)],
        edges: [{ source: "n1", target: "n2", mappings: [{ sourceKey: "volume", targetKey: "volume" }] }],
      }),
    ).rejects.toThrow(/参数传递/);
    await expect(buildAuthorityGraph({ ...base, nodes: [actionNode("n1", "pump_1", "dispense", 0, { paramJson: "{oops" })], edges: [] })).rejects.toThrow(/JSON/);
    await expect(buildAuthorityGraph({ ...base, nodes: [{ id: "s1", type: "slot", position: { x: 0, y: 0 }, data: {} }], edges: [] })).rejects.toThrow(/空位/);
    await expect(buildAuthorityGraph({ ...base, nodes: [actionNode("n1", "", "x", 0)], edges: [] })).rejects.toThrow(SubmitGraphError);
  });
});

describe("submitWorkflow", () => {
  const workflow = (revision: number): BackendWorkflow =>
    ({ uuid: "wf-1", name: "流程", tags: [], revision, create_time: "", update_time: "", meta_data: {} }) as BackendWorkflow;
  const graphOf = (revision: number): BackendWorkflowGraph =>
    ({ workflow: workflow(revision), nodes: [], edges: [], node_templates: [], handle_templates: [] }) as unknown as BackendWorkflowGraph;
  const task = { uuid: "task-1", status: "pending" } as unknown as BackendWorkflowTask;

  function fakeApi(overrides: Partial<SubmitWorkflowApi> = {}): SubmitWorkflowApi & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      createWorkflow: vi.fn(async () => (calls.push("create"), workflow(1))),
      updateWorkflow: vi.fn(async () => (calls.push("update"), workflow(3))),
      workflow: vi.fn(async () => (calls.push("get"), workflow(4))),
      saveGraph: vi.fn(async (_uuid, body) => (calls.push(`save@${body.revision}`), graphOf(body.revision + 1))),
      createTask: vi.fn(async () => (calls.push("task"), task)),
      ...overrides,
    };
  }

  it("新建：创建定义 → 用返回的 revision 存图 → 建任务", async () => {
    const api = fakeApi();
    const result = await submitWorkflow(api, { name: "流程", nodes: [] });
    expect(api.calls).toEqual(["create", "save@1", "task"]);
    expect(result.created).toBe(true);
    expect(result.workflow.revision).toBe(2);
    expect(result.task?.uuid).toBe("task-1");
    expect(vi.mocked(api.createWorkflow).mock.calls[0][0].meta_data).toEqual({ source: "openlab-editor" });
    expect(api.createTask).toHaveBeenCalledWith(expect.objectContaining({ run_mode: "normal" }));
  });

  it("逐步运行只改变任务运行方式，仍只提交一个完整工作流", async () => {
    const api = fakeApi();
    await submitWorkflow(api, { name: "逐步实验", nodes: [], runMode: "step" });
    expect(api.calls).toEqual(["create", "save@1", "task"]);
    expect(api.createTask).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ run_mode: "step", workflow_uuid: "wf-1" }));
  });

  it("已绑定定义：更新元数据后存图；revision 冲突重读一次再存；saveOnly 不建任务", async () => {
    let first = true;
    const api = fakeApi({
      saveGraph: vi.fn(async (_uuid, body) => {
        if (first) {
          first = false;
          throw new BackendBusinessError({ code: 3003, error: { msg: "revision mismatch" } });
        }
        return graphOf(body.revision + 1);
      }),
    });
    const result = await submitWorkflow(api, { workflowUuid: "wf-1", name: "流程", nodes: [], saveOnly: true });
    expect(api.calls).toEqual(["update", "get"]);
    expect(vi.mocked(api.saveGraph).mock.calls.map((call) => call[1].revision)).toEqual([3, 4]);
    expect(result.task).toBeNull();
    expect(result.created).toBe(false);
  });

  it("绑定的定义已被删除时退回新建", async () => {
    const api = fakeApi({
      updateWorkflow: vi.fn(async () => {
        throw new BackendBusinessError({ code: 3002, error: { msg: "not found" } });
      }),
    });
    const result = await submitWorkflow(api, { workflowUuid: "gone", name: "流程", nodes: [] });
    expect(result.created).toBe(true);
    expect(api.calls).toEqual(["create", "save@1", "task"]);
  });

  it("旧进程以 HTTP 404 表示绑定定义不存在时退回新建", async () => {
    const api = fakeApi({
      updateWorkflow: vi.fn(async () => {
        throw new ApiError(404, "workflow not found");
      }),
    });
    const result = await submitWorkflow(api, { workflowUuid: "gone", name: "流程", nodes: [] });
    expect(result.created).toBe(true);
    expect(api.calls).toEqual(["create", "save@1", "task"]);
  });
});
