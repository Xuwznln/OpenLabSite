/**
 * 工作流即节点（入口参数 / 输出 / 发布 / 组合调用 / 暂停改参）、化学品定义与就绪探针的客户端契约。
 */
import { describe, expect, it } from "vitest";
import { ApiError, BackendBusinessError, createSystemApi } from "../src/common";
import { CHEMICAL_BUSINESS_CODES, createChemicalsV1Api } from "../src/chemicals-v1";
import {
  createWorkflowBackendApi,
  declaredWorkflowIo,
  isWorkflowInputReference,
  workflowInputReference,
  type BackendCompositeInvocationInput,
  type BackendWorkflowIODeclareInput,
} from "../src/workflow-backend";
import { DUMMY_ID, catalogOps, collectCalls, createMockHttp } from "./helpers";

const NUMBER = { type: "number" };
const ok = (data: unknown, status = 200) => ({ status, data: { code: 0, data } });

describe("workflow I/O 与组合调用", () => {
  it("PUT /io 原样传输合同、按返回值路径的输出绑定与 node_params 引用", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    const body: BackendWorkflowIODeclareInput = {
      revision: 4,
      input_contract: { version: 1, parameters: [
        { name: "volume", schema: NUMBER, required: true, title: "体积" },
        { name: "speed", schema: NUMBER, default: 2 },
      ] },
      output_contract: { version: 1, outputs: [{ name: "total", schema: NUMBER }] },
      output_bindings: { total: { kind: "node_output", workflow_node_uuid: "n2", data_key: "result.total" } },
      node_params: { n1: { volume: workflowInputReference("volume") } },
    };
    mock.nextResponse = ok({ workflow: { revision: 5 } });
    await api.declareIo("wf-1", body);
    expect(mock.calls[0]).toMatchObject({ method: "PUT", url: "http://edge.local/api/v1/workflows/wf-1/io", data: body });

    mock.nextResponse = { status: 200, data: { code: 1000, error: { msg: "参数无效：workflow_io_invalid（/input_contract/parameters/0/name）" } } };
    await expect(api.declareIo("wf-1", body)).rejects.toMatchObject({ code: 1000 });
  });

  it("发布：201 信封解出单条；列表与最新发布目录都是数组", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    const publication = { uuid: "p1", workflow_uuid: "wf-1", revision: 5, inputs: [{ name: "volume", schema: NUMBER }], outputs: [] };
    mock.nextResponse = ok(publication, 201);
    await expect(api.publishWorkflow("wf-1", { revision: 5 })).resolves.toEqual(publication);
    expect(mock.calls[0]).toMatchObject({ method: "POST", url: "http://edge.local/api/v1/workflows/wf-1/publications", data: { revision: 5 } });

    mock.nextResponse = ok([publication]);
    await expect(api.workflowPublications("wf-1")).resolves.toHaveLength(1);
    mock.nextResponse = ok([publication]);
    await api.latestPublications();
    expect(mock.calls.at(-1)).toMatchObject({ method: "GET", url: "http://edge.local/api/v1/workflow-publications" });

    mock.nextResponse = { status: 200, data: { code: 3003, error: { msg: "状态冲突" } } };
    const stale = await api.publishWorkflow("wf-1", { revision: 4 }).catch((error: unknown) => error);
    expect(stale).toBeInstanceOf(BackendBusinessError);
    expect((stale as BackendBusinessError).isConflict).toBe(true);
  });

  it("组合调用实参可以是静态值或父工作流入口参数引用", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    const body: BackendCompositeInvocationInput = {
      revision: 3,
      child_workflow_uuid: "child",
      child_revision: 7,
      pose: { x: 10, y: 20 },
      arguments: { volume: workflowInputReference("amount"), label: "A1" },
    };
    mock.nextResponse = ok({ invocation_uuid: "inv", contract_pin: { child_workflow_revision: 7 }, graph: { nodes: [] } }, 201);
    const result = await api.insertCompositeInvocation("parent", body);
    expect(result.invocation_uuid).toBe("inv");
    expect(mock.calls[0]).toMatchObject({
      method: "POST",
      url: "http://edge.local/api/v1/workflows/parent/composite-invocations",
      data: body,
    });
  });

  it("任务可带入口参数；暂停改参走 PATCH 并保留 revision 与幂等键", async () => {
    const mock = createMockHttp();
    const api = createWorkflowBackendApi(mock.http);
    mock.nextResponse = ok({ uuid: "t1", input: { volume: 3, speed: 2 } }, 201);
    const task = await api.createTask({ workflow_uuid: "wf-1", input: { volume: 3 }, idempotency_key: "run-1" });
    expect(task.input).toEqual({ volume: 3, speed: 2 });
    expect(mock.calls[0]?.data).toEqual({ workflow_uuid: "wf-1", input: { volume: 3 }, idempotency_key: "run-1" });

    const edit = { expected_revision: 2, input: { temperature: 30 }, idempotency_key: "edit-1" };
    mock.nextResponse = ok({ uuid: "t1", control_revision: 3, input: { volume: 3, temperature: 30 } });
    expect((await api.editTaskInput("t1", edit)).control_revision).toBe(3);
    expect(mock.calls[1]).toMatchObject({ method: "PATCH", url: "http://edge.local/api/v1/workflow-tasks/t1/input", data: edit });

    mock.nextResponse = { status: 200, data: { code: 3003, error: { msg: "状态冲突：入口参数 'volume' 已被已下发的节点使用，不能修改" } } };
    await expect(api.editTaskInput("t1", edit)).rejects.toMatchObject({ code: 3003, message: expect.stringContaining("volume") });
  });

  it("入口参数引用判定与服务端 entry_reference 一致", () => {
    expect(isWorkflowInputReference(workflowInputReference("v"))).toBe(true);
    expect(isWorkflowInputReference({ kind: "workflow_input", parameter: "v", extra: 1 })).toBe(true);
    expect(isWorkflowInputReference({ kind: "workflow_input" })).toBe(false);
    expect(isWorkflowInputReference({ kind: "node_output", parameter: "v" })).toBe(false);
    expect(isWorkflowInputReference(["workflow_input"])).toBe(false);
    expect(isWorkflowInputReference(null)).toBe(false);
  });

  it("declaredWorkflowIo 读 meta_data.unilab，缺省给空合同、跳过不认识的条目", () => {
    expect(declaredWorkflowIo({ meta_data: {} })).toEqual({
      input_contract: { version: 1, parameters: [] },
      output_contract: { version: 1, outputs: [] },
      output_bindings: {},
    });
    expect(declaredWorkflowIo(null).input_contract.parameters).toEqual([]);
    const io = declaredWorkflowIo({
      meta_data: {
        unilab: {
          input_contract: { version: 1, parameters: [{ name: "volume", schema: NUMBER, required: true }, { name: "" }, "x"] },
          output_contract: { version: 1, outputs: [{ name: "total", schema: NUMBER }] },
          output_bindings: { total: { kind: "node_output", workflow_node_uuid: "n", data_key: "" }, bad: 1 },
        },
      },
    });
    expect(io.input_contract.parameters.map((item) => item.name)).toEqual(["volume"]);
    expect(io.output_contract.outputs.map((item) => item.name)).toEqual(["total"]);
    expect(Object.keys(io.output_bindings)).toEqual(["total"]);
  });
});

describe("chemicals-v1 化学品定义", () => {
  it("覆盖 chemicals-v1 全部 HTTP 操作，且不多不少", async () => {
    const mock = createMockHttp();
    const api = createChemicalsV1Api(mock.http);
    const reply = () => (mock.nextResponse = ok({}));
    const called = await collectCalls(mock, {
      list: () => (reply(), api.chemicals({ q: "水" })),
      create: () => (reply(), api.createChemical({ name: "水", cas: "7732-18-5" })),
      get: () => (reply(), api.chemical(DUMMY_ID)),
      update: () => (reply(), api.updateChemical(DUMMY_ID, { expected_version: 1, description: "去离子" })),
      remove: () => (reply(), api.deleteChemical(DUMMY_ID, 2)),
    });
    expect(called).toEqual(catalogOps("chemicals-v1"));
    expect(mock.calls[0]?.params).toEqual({ q: "水" });
    expect(mock.calls.at(-1)?.params).toEqual({ expected_version: 2 });
  });

  it("业务失败按信封抛错：参数错误是 1000，重复与过期是 3003", async () => {
    const mock = createMockHttp();
    const api = createChemicalsV1Api(mock.http);
    mock.nextResponse = { status: 200, data: { code: 1000, error: { msg: "CAS 登记号校验位不正确：'7732-18-4'" } } };
    await expect(api.createChemical({ name: "坏的", cas: "7732-18-4" })).rejects.toMatchObject({
      code: CHEMICAL_BUSINESS_CODES.invalidInput,
      message: expect.stringContaining("校验位"),
    });
    mock.nextResponse = { status: 200, data: { code: 3003, error: { msg: "版本已过期" } } };
    await expect(api.deleteChemical("c1", 1)).rejects.toMatchObject({ code: CHEMICAL_BUSINESS_CODES.conflict });
    mock.nextResponse = { status: 200, data: { code: 0 } };
    await expect(api.deleteChemical("c1", 2)).resolves.toBeUndefined();
  });
});

describe("system.readiness 就绪探针", () => {
  it("200 与 503 都返回同形状正文；不认识的 503 与其他错误照常抛", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    const ready = { status: "ready", scheduler: "local", execution: "ready", reasons: [] };
    mock.nextResponse = { status: 200, data: ready };
    await expect(api.readiness()).resolves.toEqual(ready);
    expect(mock.calls[0]).toMatchObject({ method: "GET", url: "http://edge.local/api/v1/readiness", timeout: 4_000 });

    mock.nextResponse = {
      status: 503,
      data: { status: "not_ready", scheduler: "local", execution: "starting", reasons: ["执行适配器尚未注册（设备初始化中）"] },
    };
    await expect(api.readiness()).resolves.toMatchObject({ status: "not_ready", execution: "starting", reasons: [expect.any(String)] });

    mock.nextResponse = { status: 503, data: { detail: "maintenance" } };
    await expect(api.readiness()).rejects.toBeInstanceOf(ApiError);
    mock.nextResponse = { status: 404, data: { detail: "Not Found" } };
    await expect(api.readiness({ timeoutMs: 1_000 })).rejects.toMatchObject({ status: 404 });
    expect(mock.calls.at(-1)?.timeout).toBe(1_000);
  });
});
