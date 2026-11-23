import { describe, expect, it } from "vitest";
import { BackendBusinessError } from "../src/common";
import { createDebugApi } from "../src/debug";
import { createGraphsV1Api } from "../src/graphs-v1";
import { createDeviceStateApi } from "../src/device-state";
import { createHistoryV1Api } from "../src/history-v1";
import { createInventoryApi, InventoryCommandRejectedError } from "../src/inventory";
import { createMaterialsV1Api, materialsMutation } from "../src/materials-v1";
import { createRunHistoryApi } from "../src/run-history";
import { createRuntimeV1Api } from "../src/runtime-v1";
import { createSchedulerApi } from "../src/scheduler";
import { createTelemetryV1Api } from "../src/telemetry-v1";
import { catalogOps, collectCalls, createMockHttp, DUMMY_ID } from "./helpers";

const OK_ENVELOPE = { status: 200, data: { code: 0, data: {} } };

describe("UniLabOS 四库 v1 浏览器接口", () => {
  it("覆盖 runtime-v1 全部只读操作", async () => {
    const mock = createMockHttp();
    const api = createRuntimeV1Api(mock.http);
    const called = await collectCalls(mock, {
      sessions: () => api.sessions(),
      session: () => api.session(DUMMY_ID),
      endpoints: () => api.endpoints(),
      endpoint: () => api.endpoint(DUMMY_ID),
      commands: () => api.commands(),
      command: () => api.command(DUMMY_ID),
      jobs: () => api.jobs(),
      job: () => api.job(DUMMY_ID),
      adapterCommands: () => api.adapterCommands(),
      adapterCommand: () => api.adapterCommand(DUMMY_ID),
      backendEvents: () => api.backendEvents(),
      backendEvent: () => api.backendEvent(DUMMY_ID),
    });
    expect(called).toEqual(catalogOps("runtime-v1"));
  });

  it("覆盖 inventory 全部读写操作：读走 /inventory/*，写一律 POST /inventory/commands", async () => {
    const mock = createMockHttp();
    const api = createInventoryApi(mock.http);
    const completed = { status: 200, data: { code: 0, data: { command_id: "c", status: "completed", result: { protocol_version: "materials.v1" } } } };
    const write = <T>(run: () => Promise<T>) => () => {
      mock.nextResponse = completed;
      return run();
    };
    const called = await collectCalls(mock, {
      health: () => api.health(),
      instances: () => api.instances(),
      instance: () => api.instance(DUMMY_ID),
      templates: () => api.templates(),
      template: () => api.template(DUMMY_ID),
      lots: () => api.lots(),
      lot: () => api.lot(DUMMY_ID),
      reservations: () => api.reservations(),
      reservation: () => api.reservation(DUMMY_ID),
      workflowReservations: () => api.workflowReservations(DUMMY_ID),
      relations: () => api.relations(),
      contents: () => api.contents(),
      snapshot: () => api.snapshot(),
      ledger: () => api.ledger(),
      outboxBacklog: () => api.outboxBacklog(),
      outboxEvents: () => api.outboxEvents(),
      syncCursors: () => api.syncCursors(),
      processedCommands: () => api.processedCommands(),
      ingressReservations: () => api.ingressReservations(),
      ingressReservation: () => api.ingressReservation(DUMMY_ID),
      reserveIngress: () =>
        api.reserveIngress({ idempotency_key: "k", carrier_material_uuid: DUMMY_ID, candidate_site_uuids: [DUMMY_ID], ttl_seconds: 60 }),
      markIngressInTransit: () => api.markIngressInTransit(DUMMY_ID),
      receiveIngress: () => api.receiveIngress(DUMMY_ID),
      cancelIngress: () => api.cancelIngress(DUMMY_ID, "不需要了"),
      command: write(() => api.command({ command_id: "c", type: "material.move", payload: {} })),
      typedCommand: write(() => api.typedCommand("inventory.lot.correct", { lot_id: "l" })),
      createTemplate: write(() => api.createTemplate({ name: "t" })),
      putTemplate: write(() => api.putTemplate(DUMMY_ID, { name: "t" })),
      deleteTemplate: write(() => api.deleteTemplate(DUMMY_ID)),
      instantiate: write(() => api.instantiate("PRCXI_1000uL_Tips", "tips-1")),
      createTree: write(() =>
        api.createTree({ nodes: [{ client_ref: "root", identity: { resource_id: "r", name: "r", template_name: "t" } }] }),
      ),
      patch: write(() => api.patch(DUMMY_ID, { display_name: "x" })),
      putData: write(() => api.putData(DUMMY_ID, { substances: [] })),
      putPosition: write(() => api.putPosition(DUMMY_ID, { position_x: 1, position_y: 2, position_z: 0 })),
      remove: write(() => api.remove(DUMMY_ID)),
      move: write(() => api.move({ material_uuid: DUMMY_ID, destination_site_uuid: DUMMY_ID })),
      transfer: write(() =>
        api.transfer({ source_device_id: "a", target_device_id: "b", items: [{ material_uuid: DUMMY_ID, target_material_uuid: DUMMY_ID }] }),
      ),
      inboundLot: write(() => api.inboundLot({ template_uuid: DUMMY_ID, unit: "mL", quantity: 1 })),
    });
    expect(called).toEqual(catalogOps("inventory"));
    // 列表默认取全集（dev 扩展 all=true，与旧 /materials/* 等价）
    expect(mock.calls[1]).toMatchObject({ url: "http://edge.local/api/v1/inventory/instances", params: { all: "true" } });
  });

  it("库存列表解开 V1 信封与具名数组", async () => {
    const mock = createMockHttp();
    const api = createInventoryApi(mock.http);
    mock.nextResponse = { status: 200, data: { code: 0, data: { instances: [{ edge_uuid: "m1" }] } } };
    await expect(api.instances({ rootsOnly: true })).resolves.toEqual([{ edge_uuid: "m1" }]);
    expect(mock.calls[0]?.params).toEqual({ roots_only: "true", all: "true" });
    mock.nextResponse = { status: 200, data: { code: 0, data: { lots: [{ lot_id: "l1" }] } } };
    await expect(api.lots({ include_quarantined: false })).resolves.toEqual([{ lot_id: "l1" }]);
    expect(mock.calls[1]?.params).toEqual({ include_quarantined: "false" });
    mock.nextResponse = { status: 200, data: { code: 0, data: { entries: [{ sequence: 7 }] } } };
    await expect(api.ledger(6, 50)).resolves.toEqual([{ sequence: 7 }]);
    expect(mock.calls[2]?.params).toEqual({ after_id: 6, limit: 50 });
  });

  it("dev 变更信封经命令入口提交：路径参数进 target_uuid，chemical_uuid 的省略 / null / uuid 原样传输", async () => {
    const mock = createMockHttp();
    const api = createInventoryApi(mock.http);
    const completed = () => {
      mock.nextResponse = { status: 200, data: { code: 0, data: { command_id: "c", status: "completed", result: { data: {} } } } };
    };
    completed();
    await api.putData(DUMMY_ID, {
      substances: [
        { name: "水", quantity: 1, quantity_unit: "mL", physical_state: "liquid", composition: [], meta_data: {}, chemical_uuid: "c1" },
        { name: "乙醇", quantity: 2, quantity_unit: "mL", physical_state: "liquid", composition: [], meta_data: {}, chemical_uuid: null },
        { name: "未动", quantity: 3, quantity_unit: "mL", physical_state: "liquid", composition: [], meta_data: {} },
      ],
    });
    completed();
    await api.putPosition(DUMMY_ID, { position_x: 1 });
    completed();
    await api.patch(DUMMY_ID, { barcode: "BC-9" });
    const [data, position, patch] = mock.calls.map(
      (call) => call.data as { operation: string; effect_key: string; target_uuid?: string; payload: Record<string, unknown> },
    );
    expect(mock.calls.every((call) => call.method === "POST" && call.url === "http://edge.local/api/v1/inventory/commands")).toBe(true);
    // 微后端 put_data 只接受 put_data / update_data / update_substances，put_position 只接受 put_position / update_position
    expect(data.operation).toBe("put_data");
    expect(data.target_uuid).toBe(DUMMY_ID);
    expect(data.effect_key.startsWith("put_data:")).toBe(true);
    expect(position.operation).toBe("put_position");
    expect(position.target_uuid).toBe(DUMMY_ID);
    expect(patch).toMatchObject({ operation: "patch_material", target_uuid: DUMMY_ID, payload: { barcode: "BC-9", display_name: null } });
    // 物料 name = uuid、不可修改：MaterialPatch 没有 name 字段，带上会被 1000 拒绝
    expect(patch.payload).not.toHaveProperty("name");
    const substances = data.payload.substances as Record<string, unknown>[];
    expect(substances[0]!.chemical_uuid).toBe("c1");
    expect(substances[1]).toHaveProperty("chemical_uuid", null);
    expect(substances[2]).not.toHaveProperty("chemical_uuid");
    // 命令入口按类型化请求体的完整 dump 比对：缺省字段补齐，只读字段（chemical / chemical_unlinked）不发
    expect(data.payload).toMatchObject({ data: {}, sites_initialized: false, unknown_counter: null, state_status: "created", observed_at_ms: 0 });
    expect(position.payload).toMatchObject({ position_x: 1, position_y: null, position_z: null, layout: "x-y", extra: {} });
  });

  it("库存命令的类型化请求体字段齐全：移动 / 转运 / 批次入库（含 V1 库位与分区）", async () => {
    const mock = createMockHttp();
    const api = createInventoryApi(mock.http);
    const ok = () => {
      mock.nextResponse = { status: 200, data: { code: 0, data: { command_id: "c", status: "completed", result: { data: {} } } } };
    };
    ok();
    await api.move({ material_uuid: "m", destination_site_uuid: "s" });
    ok();
    await api.transfer({ source_device_id: "a", target_device_id: "b", items: [{ material_uuid: "m", target_material_uuid: "t" }] });
    ok();
    await api.inboundLot({ template_uuid: "tpl", unit: "ul", quantity: 20 });
    const [move, transfer, lot] = mock.calls.map((call) => (call.data as { payload: unknown }).payload);
    expect(move).toEqual({ material_uuid: "m", destination_site_uuid: "s", parent_material_uuid: null });
    expect(transfer).toEqual({ source_device_id: "a", target_device_id: "b", items: [{ material_uuid: "m", target_material_uuid: "t", target_site: null }] });
    expect(lot).toEqual({
      lot_uuid: null, template_uuid: "tpl", batch_no: "", unit: "ul", quantity: 20, expiry_at_ms: null,
      location_site_uuid: null, warehouse_zone_id: "",
    });
  });

  it("建树带树级 placement：省略即 null，给了落位则 site 缺省补 null（命令入口按完整 dump 比对）", async () => {
    const mock = createMockHttp();
    const api = createInventoryApi(mock.http);
    const ok = () => {
      mock.nextResponse = { status: 200, data: { code: 0, data: { command_id: "c", status: "completed", result: { data: {} } } } };
    };
    const nodes = [{ client_ref: "root", identity: { resource_id: "r", name: "r", template_name: "t" } }];
    ok();
    await api.createTree({ nodes });
    ok();
    await api.createTree({ nodes, placement: { parent_material_uuid: "deck" } });
    ok();
    await api.createTree({ nodes, placement: { parent_material_uuid: "deck", site: "A1" } });
    const [bare, parentOnly, onSite] = mock.calls.map((call) => call.data as { operation: string; payload: unknown });
    expect(bare).toMatchObject({ operation: "create_material_tree", payload: { nodes, placement: null } });
    expect(parentOnly!.payload).toEqual({ nodes, placement: { parent_material_uuid: "deck", site: null } });
    expect(onSite!.payload).toEqual({ nodes, placement: { parent_material_uuid: "deck", site: "A1" } });
  });

  it("库存命令使用 materials.v1 幂等信封；完成信封解出 MutationResult，失败信封抛 InventoryCommandRejectedError", async () => {
    const mock = createMockHttp();
    const api = createInventoryApi(mock.http);
    mock.nextResponse = {
      status: 200,
      data: {
        code: 0,
        data: { command_id: "cmd-1", status: "completed", result: { protocol_version: "materials.v1", command_uuid: "cmd-1", data: { root_material_uuid: "m" } }, replayed: false },
      },
    };
    const result = await api.instantiate("PRCXI_1000uL_Tips", "tips-1", "BC-1", { commandUuid: "cmd-1" });
    expect(result).toMatchObject({ command_uuid: "cmd-1", data: { root_material_uuid: "m" } });
    const body = mock.calls[0]?.data as Record<string, unknown>;
    expect(body).toMatchObject({
      protocol_version: "materials.v1",
      command_uuid: "cmd-1",
      effect_key: "instantiate_material:cmd-1",
      operation: "instantiate_material",
      // 微后端契约（KNOWN_ACTOR_TYPES）：浏览器 / 操作员写操作显式携带 human，不依赖默认值 edge
      actor_type: "human",
      // 实例化发人读标签 display_name（同时作 PLR 根名）；物料 name 由权威写成 uuid
      payload: { registry_class: "PRCXI_1000uL_Tips", display_name: "tips-1", barcode: "BC-1" },
    });
    expect(body).not.toHaveProperty("target_uuid");

    mock.nextResponse = {
      status: 200,
      data: { code: 6007, error: { msg: "site occupied", code: "conflict:site_occupied", details: { command_id: "cmd-2", replayed: true } } },
    };
    const error = await api.move({ material_uuid: "m", destination_site_uuid: "s" }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(InventoryCommandRejectedError);
    expect(error).toMatchObject({
      code: 6007,
      symbol: "conflict:site_occupied",
      message: "site occupied",
      details: { command_id: "cmd-2", replayed: true },
      result: { command_id: "cmd-2", status: "rejected", error: "site occupied", error_code: "conflict:site_occupied", code: 6007, replayed: true },
    });
    expect((error as InventoryCommandRejectedError).isConflict).toBe(true);

    // 原样命令不抛拒绝：失败信封还原成 status=rejected 的结果，调用方按 status 判断
    mock.nextResponse = { status: 200, data: { code: 1000, error: { msg: "x", code: "invalid", details: { command_id: "c3", replayed: false } } } };
    await expect(api.command({ command_id: "c3", type: "material.move", payload: {} })).resolves.toEqual({
      command_id: "c3", status: "rejected", error: "x", error_code: "invalid", code: 1000, replayed: false,
    });
    // 不是命令拒绝的业务失败（没有 details.command_id，如请求体不是 JSON 对象）照常抛
    mock.nextResponse = { status: 200, data: { code: 1000, error: { msg: "body: Input should be a valid dictionary" } } };
    const invalid = await api.command({ command_id: "c4" }).catch((e: unknown) => e);
    expect(invalid).toBeInstanceOf(BackendBusinessError);
    expect(invalid).not.toBeInstanceOf(InventoryCommandRejectedError);

    // 模板写入带全 ResourceTemplateWrite 字段（命令入口按类型化请求体的完整 dump 比对）
    mock.nextResponse = { status: 200, data: { code: 0, data: { command_id: "t0", status: "completed", result: { data: {} } } } };
    await api.createTemplate({ name: "tube", resource_type: "container", class_name: "Resource" });
    expect((mock.calls.at(-1)?.data as { payload: unknown }).payload).toEqual({
      template_uuid: null, name: "tube", display_name: null, resource_type: "container", class_name: "Resource", module_name: null,
      template_version: "1", category: [], available_sites: [], handles: [], definition: {}, status: "active",
    });

    // V1 类型化命令
    mock.nextResponse = { status: 200, data: { code: 0, data: { command_id: "t1", status: "completed", result: { moved: true } } } };
    await expect(api.typedCommand("material.move", { edge_uuid: "m" }, { commandId: "t1", expectedVersion: 3 })).resolves.toEqual({ moved: true });
    expect(mock.calls.at(-1)?.data).toEqual({ command_id: "t1", type: "material.move", payload: { edge_uuid: "m" }, expected_version: 3 });

    const envelope = materialsMutation("delete_material", { material_uuid: "m" });
    expect(envelope.command_uuid).toMatch(/[0-9a-f-]{8,}/);
    expect(envelope.effect_key).toBe(`delete_material:${envelope.command_uuid}`);
    expect(envelope.preconditions).toEqual([]);
  });

  it("覆盖 materials-v1 剩余 dev 路由（读写主体已迁到 inventory）", async () => {
    const mock = createMockHttp();
    const api = createMaterialsV1Api(mock.http);
    const called = await collectCalls(mock, {
      registryClasses: () => api.registryClasses(),
      byResourceId: () => api.byResourceId(DUMMY_ID),
      tree: () => api.tree(DUMMY_ID),
      notifyDevice: () => api.notifyDevice({ device_id: "a", resource_uuids: [DUMMY_ID] }),
      upsertLink: () => api.upsertLink({ source_material_uuid: DUMMY_ID, target_material_uuid: DUMMY_ID }),
      deleteLink: () => api.deleteLink(DUMMY_ID),
      reservationByJob: () => api.reservationByJob(DUMMY_ID),
      executions: () => api.executions(),
      execution: () => api.execution(DUMMY_ID),
      previewInventory: () => api.previewInventory({ requirements: [] }),
    });
    expect(called).toEqual(catalogOps("materials-v1"));
    expect(api).not.toHaveProperty("instances");
    expect(api).not.toHaveProperty("instantiate");
  });

  it("覆盖 graphs-v1 全部操作并解包 Backend 信封", async () => {
    const mock = createMockHttp();
    const api = createGraphsV1Api(mock.http);
    const called = await collectCalls(mock, {
      graphs: () => {
        mock.nextResponse = OK_ENVELOPE;
        return api.graphs();
      },
      graph: () => {
        mock.nextResponse = OK_ENVELOPE;
        return api.graph(DUMMY_ID);
      },
      payload: () => {
        mock.nextResponse = OK_ENVELOPE;
        return api.payload(DUMMY_ID);
      },
      livePayload: () => {
        mock.nextResponse = OK_ENVELOPE;
        return api.livePayload();
      },
      upsert: () => {
        mock.nextResponse = OK_ENVELOPE;
        return api.upsert({ name: "g", payload: { nodes: [], links: [] } });
      },
      remove: () => {
        mock.nextResponse = { status: 200, data: { code: 0 } };
        return api.remove(DUMMY_ID);
      },
    });
    expect(called).toEqual(catalogOps("graphs-v1"));

    mock.nextResponse = { status: 200, data: { code: 3002, error: "graph not found" } };
    await expect(api.graph("missing")).rejects.toMatchObject({
      name: "BackendBusinessError",
      code: 3002,
      message: "graph not found",
    });
  });

  it("覆盖 telemetry-v1 全部只读操作", async () => {
    const mock = createMockHttp();
    const api = createTelemetryV1Api(mock.http);
    const called = await collectCalls(mock, {
      events: () => api.events(),
      event: () => api.event(DUMMY_ID),
      sourceCursor: () => api.sourceCursor(DUMMY_ID),
      states: () => api.states(),
      state: () => api.state(DUMMY_ID, DUMMY_ID),
    });
    expect(called).toEqual(catalogOps("telemetry-v1"));
  });

  it("覆盖 history-v1 全部只读操作（Host 存储已搬到 /edge/history）", async () => {
    const mock = createMockHttp();
    const api = createHistoryV1Api(mock.http);
    const called = await collectCalls(mock, {
      payload: () => api.payload(DUMMY_ID),
      events: () => api.events(),
      event: () => api.event(DUMMY_ID),
      replacementChain: () => api.replacementChain(DUMMY_ID),
    });
    expect(called).toEqual(catalogOps("history-v1"));
    expect([...called].every((key) => key.includes("/api/v1/edge/history/"))).toBe(true);
  });

  it("覆盖 run-history / scheduler / device-state 只读与运维操作", async () => {
    const mock = createMockHttp();
    const runs = createRunHistoryApi(mock.http);
    expect(
      await collectCalls(mock, {
        workflows: () => runs.workflows({ state: "completed", limit: 20 }),
        workflow: () => runs.workflow(DUMMY_ID),
        jobs: () => runs.jobs({ workflow_id: "w" }),
      }),
    ).toEqual(catalogOps("run-history"));

    const schedulerMock = createMockHttp();
    const scheduler = createSchedulerApi(schedulerMock.http);
    expect(
      await collectCalls(schedulerMock, {
        monitorSnapshot: () => scheduler.monitorSnapshot(),
        timeline: () => scheduler.timeline({ window_s: 600 }),
        timePlan: () => scheduler.timePlan(),
        reschedule: () => scheduler.reschedule(),
        drainStatus: () => scheduler.drainStatus(),
        drain: () => scheduler.drain(),
        resumeDrain: () => scheduler.resumeDrain(),
        inventoryRecovery: () => scheduler.inventoryRecovery(),
        reconcileInventory: () => scheduler.reconcileInventory({} as never),
        physicalRecovery: () => scheduler.physicalRecovery(),
        settlePhysicalRecovery: () => scheduler.settlePhysicalRecovery(DUMMY_ID, {} as never),
        releasePhysicalRecovery: () => scheduler.releasePhysicalRecovery(DUMMY_ID, {} as never),
      }),
    ).toEqual(catalogOps("scheduler"));

    const stateMock = createMockHttp();
    const deviceState = createDeviceStateApi(stateMock.http);
    expect(
      await collectCalls(stateMock, {
        all: () => deviceState.all(),
        history: () => deviceState.history({ limit: 10 }),
        device: () => deviceState.device(DUMMY_ID),
        propertyHistory: () => deviceState.propertyHistory(DUMMY_ID, "temperature"),
      }),
    ).toEqual(catalogOps("device-state"));
    expect(stateMock.calls[3]?.params).toEqual({ property: "temperature" });
  });

  it("覆盖 debug 域全部只读操作", async () => {
    const mock = createMockHttp();
    const api = createDebugApi(mock.http);
    const called = await collectCalls(mock, {
      databases: () => api.databases(),
      table: () => api.table(DUMMY_ID, DUMMY_ID, { limit: 20, descending: false }),
    });
    expect(called).toEqual(catalogOps("debug"));
    expect(mock.calls[1]?.params).toEqual({ limit: 20, descending: "false" });
  });

  it("history event_types 保持数组并使用重复 query key 序列化", async () => {
    const mock = createMockHttp();
    const api = createHistoryV1Api(mock.http);
    await api.events({ event_types: ["job_result", "job_log"] });
    expect(mock.calls[0]?.params).toEqual({ event_types: ["job_result", "job_log"] });
    expect(mock.calls[0]?.paramsSerializer).toEqual({ indexes: null });
  });
});
