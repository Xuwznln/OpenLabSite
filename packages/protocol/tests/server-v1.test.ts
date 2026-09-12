import { describe, expect, it } from "vitest";
import { createDebugApi } from "../src/debug";
import { createGraphsV1Api } from "../src/graphs-v1";
import { createHistoryV1Api } from "../src/history-v1";
import { createMaterialsV1Api, materialsMutation } from "../src/materials-v1";
import { createRuntimeV1Api } from "../src/runtime-v1";
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

  it("覆盖 materials-v1 全部读写操作", async () => {
    const mock = createMockHttp();
    const api = createMaterialsV1Api(mock.http);
    const called = await collectCalls(mock, {
      templates: () => api.templates(),
      template: () => api.template(DUMMY_ID),
      createTemplate: () => api.createTemplate({ name: "t" }),
      putTemplate: () => api.putTemplate(DUMMY_ID, { name: "t" }),
      deleteTemplate: () => api.deleteTemplate(DUMMY_ID),
      registryClasses: () => api.registryClasses(),
      instances: () => api.instances(),
      byResourceId: () => api.byResourceId(DUMMY_ID),
      instance: () => api.instance(DUMMY_ID),
      tree: () => api.tree(DUMMY_ID),
      instantiate: () => api.instantiate("PRCXI_1000uL_Tips", "tips-1"),
      createTree: () =>
        api.createTree({
          nodes: [{ client_ref: "root", identity: { resource_id: "r", name: "r", template_name: "t" } }],
        }),
      patch: () => api.patch(DUMMY_ID, { display_name: "x" }),
      putData: () => api.putData(DUMMY_ID, { substances: [] }),
      putPosition: () => api.putPosition(DUMMY_ID, { position_x: 1, position_y: 2, position_z: 0 }),
      remove: () => api.remove(DUMMY_ID),
      move: () => api.move({ material_uuid: DUMMY_ID, destination_site_uuid: DUMMY_ID }),
      transfer: () =>
        api.transfer({
          source_device_id: "a",
          target_device_id: "b",
          items: [{ material_uuid: DUMMY_ID, target_material_uuid: DUMMY_ID }],
        }),
      notifyDevice: () => api.notifyDevice({ device_id: "a", resource_uuids: [DUMMY_ID] }),
      links: () => api.links(),
      upsertLink: () => api.upsertLink({ source_material_uuid: DUMMY_ID, target_material_uuid: DUMMY_ID }),
      deleteLink: () => api.deleteLink(DUMMY_ID),
      lots: () => api.lots(),
      lot: () => api.lot(DUMMY_ID),
      inboundLot: () => api.inboundLot({ template_uuid: DUMMY_ID, unit: "mL", quantity: 1 }),
      reservations: () => api.reservations(),
      reservation: () => api.reservation(DUMMY_ID),
      reservationByJob: () => api.reservationByJob(DUMMY_ID),
      changes: () => api.changes(),
    });
    expect(called).toEqual(catalogOps("materials-v1"));
  });

  it("materials 写请求使用 materials.v1 幂等信封", async () => {
    const mock = createMockHttp();
    const api = createMaterialsV1Api(mock.http);
    await api.instantiate("PRCXI_1000uL_Tips", "tips-1", "BC-1", { commandUuid: "cmd-1" });
    const body = mock.calls[0]?.data as Record<string, unknown>;
    expect(body).toMatchObject({
      protocol_version: "materials.v1",
      command_uuid: "cmd-1",
      effect_key: "instantiate_material:cmd-1",
      operation: "instantiate_material",
      // 微后端契约（KNOWN_ACTOR_TYPES）：浏览器 / 操作员写操作显式携带 human，不依赖默认值 edge
      actor_type: "human",
      payload: { registry_class: "PRCXI_1000uL_Tips", name: "tips-1", barcode: "BC-1" },
    });

    const envelope = materialsMutation("delete_material", { material_uuid: "m" });
    expect(envelope.command_uuid).toMatch(/[0-9a-f-]{8,}/);
    expect(envelope.effect_key).toBe(`delete_material:${envelope.command_uuid}`);
    expect(envelope.preconditions).toEqual([]);
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

  it("覆盖 history-v1 全部只读操作", async () => {
    const mock = createMockHttp();
    const api = createHistoryV1Api(mock.http);
    const called = await collectCalls(mock, {
      payload: () => api.payload(DUMMY_ID),
      events: () => api.events(),
      event: () => api.event(DUMMY_ID),
      replacementChain: () => api.replacementChain(DUMMY_ID),
    });
    expect(called).toEqual(catalogOps("history-v1"));
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
