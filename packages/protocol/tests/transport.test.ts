import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { AxiosInstance } from "axios";
import { describe, expect, it } from "vitest";
import { OPERATIONS, operationsOf } from "../src/catalog";
import { createEdgeApi } from "../src/client";
import {
  ApiError,
  BACKEND_BUSINESS_CODES,
  BackendBusinessError,
  createHttpTransport,
  createSystemApi,
  hostlinkPeerState,
  isBackendEnvelope,
  isCapabilityUnavailable,
  parseRetryAfter,
  type HostLinkPeer,
  type HostLinkStatus,
  type ProtocolDomain,
} from "../src/common";
import { createDeviceProcessesApi } from "../src/device-processes";
import { createDriverPackagesApi } from "../src/driver-packages";
import { createLabV1Api } from "../src/lab-v1";
import { createProcessManagementApi } from "../src/process-management";
import { catalogOps, collectCalls, createMockHttp, DUMMY_ID } from "./helpers";

/** 运行栈实测样本（host 进程 /api/v1/hostlink/peers 原样收录）。 */
const HOSTLINK_FIXTURE = JSON.parse(
  readFileSync(
    fileURLToPath(new URL("./fixtures/hostlink-peers-v1.json", import.meta.url)),
    "utf-8",
  ),
) as HostLinkStatus;

const DOMAINS: ProtocolDomain[] = [
  "system",
  "runtime-v1",
  "workflow",
  "run-history",
  "scheduler",
  "registry",
  "inventory",
  "materials-v1",
  "graphs-v1",
  "chemicals-v1",
  "telemetry-v1",
  "device-state",
  "history-v1",
  "decisions",
  "driver-packages",
  "device-processes",
  "lab-v1",
  "process-management",
  "debug",
];

describe("system 协议与传输层", () => {
  it("URL 数组参数使用 FastAPI 可识别的重复 query key", () => {
    const http = createHttpTransport("http://edge.local");
    expect(http.url("/api/v1/edge/history/events", { event_types: ["job_result", "job_log"] }))
      .toBe("http://edge.local/api/v1/edge/history/events?event_types=job_result&event_types=job_log");
  });

  it("目录按域分区后双向一致，且 method+path 跨域唯一", () => {
    const fromDomainContracts = new Set(DOMAINS.flatMap((domain) => [...catalogOps(domain)]));
    const fromCatalog = new Set(
      OPERATIONS.filter(({ method }) => method !== "SSE").map(
        ({ method, path }) => `${method} ${path.replace(/\{[^}]+\}/g, "{}")}`,
      ),
    );
    expect(fromDomainContracts).toEqual(fromCatalog);

    const byOp = new Map<string, string[]>();
    for (const op of OPERATIONS) {
      if (op.method === "SSE") continue;
      const key = `${op.method} ${op.path.replace(/\{[^}]+\}/g, "{}")}`;
      byOp.set(key, [...(byOp.get(key) ?? []), op.domain]);
    }
    for (const [key, opDomains] of byOp) {
      expect(opDomains, key).toHaveLength(1);
    }
    for (const domain of DOMAINS) {
      expect(operationsOf(domain).length, domain).toBeGreaterThan(0);
    }
  });

  it("覆盖 system 域全部 HTTP 操作", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    const called = await collectCalls(mock, {
      health: () => api.health(),
      readiness: () => api.readiness(),
      ping: () => api.ping(1.5),
      hostlinkPeers: () => api.hostlinkPeers(),
      logSources: () => api.logSources(),
      logs: () => api.logs("host"),
      schedulerResources: () => api.schedulerResources(),
      restartStatus: () => api.restartStatus(),
      requestRestart: () => api.requestRestart({ mode: "quiescent" }),
      resetPreview: () => api.resetPreview(),
      requestReset: () => api.requestReset({ confirmation_token: "test-only", confirmation: "清空全部数据" }),
      cancelRestart: () => api.cancelRestart(),
    });
    expect(called).toEqual(catalogOps("system"));
  });

  it("日志按来源与不透明游标读取，两个页面可以复用同一游标", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    const cursor = `${"a".repeat(24)}:1024`;
    await api.logs("slave:机器 A/1", { cursor, limit: 500 });
    await api.logs("slave:机器 A/1", { cursor, limit: 500 });
    expect(mock.calls[0]).toEqual(mock.calls[1]);
    expect(mock.calls[0]).toMatchObject({ method: "GET", params: { source_id: "slave:机器 A/1", cursor, limit: 500 } });
  });

  it("health 允许同源能力探测使用短超时，但仍走 system 域路由", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    await api.health({ timeoutMs: 1_500 });
    expect(mock.calls[0]).toMatchObject({
      method: "GET",
      url: "http://edge.local/api/v1/health",
      timeout: 1_500,
    });
  });

  it("非 2xx 归一为 ApiError（status + 后端 detail / 信封 msg），404/503 标记为不支持", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextResponse = { status: 404, data: { detail: "Not Found" } };
    const error = await api.schedulerResources().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, message: "Not Found" });
    expect((error as ApiError).isUnsupported).toBe(true);
    expect((error as ApiError).isNetwork).toBe(false);
    expect(isCapabilityUnavailable(error)).toBe(true);

    // 全量重置维护闸门：HTTP 503 + 信封 5001
    mock.nextResponse = { status: 503, data: { code: 5001, error: { msg: "正在全量重置，停止接受业务请求" } } };
    const gate = await api.restartStatus().catch((e: unknown) => e);
    expect(gate).toMatchObject({ status: 503, message: "正在全量重置，停止接受业务请求", businessCode: 5001 });
  });

  it("V1 信封：code 0 解包 data，code != 0 抛 BackendBusinessError（符号码 / details）", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextResponse = { status: 200, data: { code: 0, data: { sequence: 3, requests: [], ownerships: [], handoffs: [] } } };
    await expect(api.schedulerResources()).resolves.toEqual({ sequence: 3, requests: [], ownerships: [], handoffs: [] });

    mock.nextResponse = { status: 200, data: { code: 0 } };
    await expect(api.cancelRestart()).resolves.toBeUndefined();

    mock.nextResponse = {
      status: 200,
      data: { code: 3003, error: { msg: "预检失败", code: "preflight_failed", details: { blockers: ["x"] } } },
    };
    const error = await api.requestRestart().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendBusinessError);
    expect(error).toMatchObject({ code: 3003, symbol: "preflight_failed", details: { blockers: ["x"] }, message: "预检失败" });
    expect((error as BackendBusinessError).isConflict).toBe(true);

    for (const code of [3002, 4001, 6000]) {
      expect(new BackendBusinessError({ code, error: { msg: "x" } }).isNotFound, String(code)).toBe(true);
    }
    expect(isBackendEnvelope({ code: 0, data: [] })).toBe(true);
    // 带 code 字段的业务 DTO（除 code / data / error 外还有别的键）不是信封
    expect(isBackendEnvelope({ command_id: "c", status: "rejected", code: 4001 })).toBe(false);
  });

  it("GET 遇 5001（Host 启动 / 重启中）按 Retry-After 有限退避重试；写请求不重试", async () => {
    const waits: number[] = [];
    let calls = 0;
    const responses = [
      { status: 200, data: { code: 5001, error: { msg: "Host 执行进程暂不可用" } }, headers: { "retry-after": "3" } },
      { status: 200, data: { code: 5001, error: { msg: "Host 执行进程暂不可用" } }, headers: {} },
      { status: 200, data: { code: 0, data: { pending: false } } },
    ];
    const instance = {
      request: async () => responses[Math.min(calls++, responses.length - 1)],
    } as unknown as AxiosInstance;
    const http = createHttpTransport("http://edge.local", {
      axios: instance,
      sleep: async (ms) => {
        waits.push(ms);
      },
      unavailableRetry: { retries: 2, delayMs: 500, maxDelayMs: 2_000 },
    });
    await expect(http.request({ method: "GET", path: "/api/v1/restart" })).resolves.toEqual({ pending: false });
    // 第一次读到 Retry-After: 3 → 按上限 2000；第二次读不到（跨源）→ 缺省 500
    expect(waits).toEqual([2_000, 500]);

    calls = 0;
    waits.length = 0;
    const write = await http.request({ method: "POST", path: "/api/v1/restart", body: {} }).catch((e: unknown) => e);
    expect(write).toBeInstanceOf(BackendBusinessError);
    expect(write).toMatchObject({ code: 5001, retryAfterMs: 3_000 });
    expect(waits).toEqual([]);
    expect(isCapabilityUnavailable(write)).toBe(true);

    // 重试用尽仍是 5001：抛出，页面按「暂不可用」降级
    let unavailableCalls = 0;
    const always = {
      request: async () => {
        unavailableCalls += 1;
        return { status: 200, data: { code: 5001, error: { msg: "scheduler authority is remote" } } };
      },
    } as unknown as AxiosInstance;
    const exhausted = createHttpTransport("http://edge.local", { axios: always, sleep: async () => undefined });
    await expect(exhausted.request({ method: "GET", path: "/api/v1/timeline" })).rejects.toMatchObject({ code: 5001 });
    expect(unavailableCalls).toBe(3);
    expect(parseRetryAfter("2")).toBe(2_000);
    expect(parseRetryAfter(undefined)).toBeUndefined();
  });

  it("health / readiness 也是信封；readiness 503 + 5001 返回 error.details 里的摘要", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextResponse = { status: 200, data: { code: 0, data: { status: "ok", scheduler: "ready", scheduler_mode: "local", execution: "ready" } } };
    await expect(api.health()).resolves.toMatchObject({ scheduler_mode: "local", execution: "ready" });
    mock.nextResponse = {
      status: 503,
      data: {
        code: 5001,
        error: {
          msg: "Host 子进程未接入控制面",
          code: "not_ready",
          details: { status: "starting", phase: "host_restarting", scheduler: "local", execution: "restarting", reasons: ["Host 子进程未接入控制面"] },
        },
      },
    };
    await expect(api.readiness()).resolves.toMatchObject({ status: "starting", phase: "host_restarting", execution: "restarting" });
  });

  it("未匹配的路由是 404 + 信封 4001（ApiError，按「不支持」降级）", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextResponse = { status: 404, data: { code: 4001, error: { msg: "Not Found" } } };
    const error = await api.restartStatus().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 404, businessCode: 4001, message: "Not Found" });
    expect(isCapabilityUnavailable(error)).toBe(true);
  });

  it("网络层失败归一为 ApiError(status=0)", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextNetworkError = new Error("timeout of 10000ms exceeded");
    const error = await api.health().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(0);
    expect((error as ApiError).isNetwork).toBe(true);
  });

  it("HostLink peers 字段级契约：真实样本完整解析（含 devices 映射与 ros 下发）", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextResponse = { status: 200, data: HOSTLINK_FIXTURE };
    const status = await api.hostlinkPeers();

    expect(status.role).toBe("host");
    expect(status.owner).toBe("edge-microbackend");
    expect(status.host_id).toBe("DESKTOP_A3GT1OF");
    expect(status.host_node_id).toBe("host_node");
    expect(status.protocol_version).toBe(1);
    expect(status.client).toBeNull();
    expect(status.ros?.domain_id).toBe(64);
    expect(status.ros?.static_peers).toEqual(["198.18.0.1"]);

    const peer = status.peers[0]!;
    expect(peer.node_id).toBe("device:MockPump1");
    expect(peer.role).toBe("slave");
    expect(peer.device_ids).toEqual(["MockPump1"]);
    const device = peer.devices?.MockPump1;
    expect(device?.registry_name).toBe("virtual_transfer_pump");
    expect(device?.actions).toContain("transfer");
    expect(typeof device?.action_value_mappings).toBe("object");
  });

  it("HostLink 判活：online 是唯一依据，列表保留断连 peer", () => {
    const retained = HOSTLINK_FIXTURE.peers[0]!;
    expect(retained.connected).toBe(false);
    expect(hostlinkPeerState(retained)).toBe("disconnected");

    const stale: HostLinkPeer = { ...retained, connected: true, online: false };
    expect(hostlinkPeerState(stale)).toBe("stale");

    const online: HostLinkPeer = { ...retained, connected: true, online: true };
    expect(hostlinkPeerState(online)).toBe("online");
    expect([retained, stale, online].filter((p) => p.online).length).toBe(1);
  });

  it("createEdgeApi 门面：分域命名空间齐备", () => {
    const api = createEdgeApi("http://edge.local");
    expect(typeof api.health).toBe("function");
    for (const domain of [
      "system",
      "runtimeV1",
      "workflowBackend",
      "runHistory",
      "scheduler",
      "registry",
      "inventory",
      "materialsV1",
      "graphsV1",
      "chemicalsV1",
      "telemetryV1",
      "deviceState",
      "historyV1",
      "decisions",
      "driverPackages",
      "deviceProcesses",
      "labV1",
      "processManagement",
      "debug",
    ] as const) {
      expect(typeof api.domains[domain], domain).toBe("object");
    }
    expect(api.health).toBe(api.domains.system.health);
    expect(api.domains.workflowBackend.eventsUrl()).toBe("http://edge.local/api/v1/events");
    expect(api.domains.materialsV1.eventsUrl()).toBe("http://edge.local/api/v1/materials/events");
  });

  it("覆盖 driver-packages 域全部 HTTP 操作，install 缺省 enable=true / upgrade=false", async () => {
    const mock = createMockHttp();
    const api = createDriverPackagesApi(mock.http);
    const called = await collectCalls(mock, {
      inventory: () => api.inventory(),
      catalog: () => api.catalog(),
      install: () => api.install({ spec: "git+https://example.com/acme/devices.git" }),
      operations: () => api.operations(),
      operation: () => api.operation(DUMMY_ID),
      changes: () => api.changes(),
      confirmOperation: () => api.confirmOperation(DUMMY_ID, { expected_version: 1, reason: "现场已确认" }),
      recoverOperation: () => api.recoverOperation(DUMMY_ID, { expected_version: 1, reason: "重试" }),
      setEnabled: () => api.setEnabled(DUMMY_ID, false),
      uninstall: () => api.uninstall(DUMMY_ID),
      graphs: () => api.graphs(DUMMY_ID),
      graph: () => api.graph(DUMMY_ID, DUMMY_ID),
      launchGraph: () => api.launchGraph(DUMMY_ID, DUMMY_ID),
    });
    expect(called).toEqual(catalogOps("driver-packages"));
    const install = mock.calls.find((call) => call.url.endsWith("/install"));
    expect(install?.data).toEqual({ spec: "git+https://example.com/acme/devices.git", enable: true, upgrade: false, name: "" });
  });

  it("覆盖 device-processes 域全部 HTTP 操作", async () => {
    const mock = createMockHttp();
    const api = createDeviceProcessesApi(mock.http);
    const called = await collectCalls(mock, {
      list: () => api.list(),
      deviceClasses: () => api.deviceClasses(),
      create: () => api.create({ name: "泵站", devices: [{ id: "pump_1", class: "acme_pump" }], package_names: ["acme-devices"] }),
      get: () => api.get(DUMMY_ID),
      update: () => api.update(DUMMY_ID, { name: "泵站 2" }),
      remove: () => api.remove(DUMMY_ID),
      start: () => api.start(DUMMY_ID),
      stop: () => api.stop(DUMMY_ID),
      restart: () => api.restart(DUMMY_ID),
    });
    expect(called).toEqual(catalogOps("device-processes"));
    // 日志统一由 system.logs 提供，设备进程域不再保留旧快照入口。
    expect(api).not.toHaveProperty("logs");
    expect(mock.calls.some((call) => call.url.endsWith("/logs"))).toBe(false);
  });

  it("覆盖 lab-v1 域全部 HTTP 操作；网格经 PUT /lab/profile 的 grid 原样携带 revision 乐观锁", async () => {
    const mock = createMockHttp();
    const api = createLabV1Api(mock.http);
    const write = { revision: 3, cell_size: 100, zones: [{ id: "prep", name: "样品制备区", color: "#2e5bff", cells: ["0,0"] }], walls: ["1,1"] };
    const called = await collectCalls(mock, {
      profile: () => api.profile(),
      updateProfile: () => api.updateProfile({ name: "实验室 A" }),
      layoutView: () => api.layoutView(),
      warehouse: () => api.warehouse(),
      upsertZone: () => api.upsertZone({ zone_id: "z1", name: "台面" }),
      deleteZone: () => api.deleteZone(DUMMY_ID),
      upsertPlacement: () => api.upsertPlacement({ subject_id: "s1", zone_id: "z1" }),
      deletePlacement: () => api.deletePlacement(DUMMY_ID),
      assembly: () => api.assembly(DUMMY_ID),
      seedDemo: () => api.seedDemo(),
    });
    expect(called).toEqual(catalogOps("lab-v1"));

    mock.calls.length = 0;
    const grid = { ...write, layout_key: "default", create_time: "", update_time: "" };
    mock.nextResponse = { status: 200, data: { code: 0, data: { zones: [], placements: [], storage_summary: {}, grid } } };
    await expect(api.layout()).resolves.toEqual(grid);
    mock.nextResponse = { status: 200, data: { code: 0, data: { name: "x", grid: { ...grid, revision: 4 } } } };
    await expect(api.saveLayout(write)).resolves.toMatchObject({ revision: 4 });
    mock.nextResponse = { status: 200, data: { code: 0, data: { name: "x", grid: { ...grid, revision: 0 } } } };
    await api.resetLayout();
    expect(mock.calls.map((call) => [call.method, call.url, call.data])).toEqual([
      ["GET", "http://edge.local/api/v1/lab/layout", undefined],
      ["PUT", "http://edge.local/api/v1/lab/profile", { grid: write }],
      ["PUT", "http://edge.local/api/v1/lab/profile", { grid: null }],
    ]);
  });

  it("覆盖 process-management 域：/v1 路由也是信封，V1 符号码在 error.code", async () => {
    const mock = createMockHttp();
    const api = createProcessManagementApi(mock.http);
    const called = await collectCalls(mock, {
      snapshot: () => api.snapshot(),
      submitOperation: () => api.submitOperation({ operationId: "op-1", command: "scheduler.drain" }),
      operation: () => api.operation(DUMMY_ID),
      logs: () => api.logs(DUMMY_ID, 4096),
    });
    expect(called).toEqual(catalogOps("process-management"));
    expect(mock.calls[1]?.data).toEqual({ parameters: {}, operationId: "op-1", command: "scheduler.drain" });

    mock.nextResponse = { status: 200, data: { code: 3003, error: { msg: "快照修订已变化", code: "revision_conflict" } } };
    const error = await api.submitOperation({ operationId: "op-2", command: "workspace.restart", expectedRevision: 1 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BackendBusinessError);
    expect(error).toMatchObject({ code: 3003, symbol: "revision_conflict", message: "快照修订已变化" });
    expect((error as BackendBusinessError).isConflict).toBe(true);
    // 提交操作是 HTTP 202 + 成功信封
    mock.nextResponse = { status: 202, data: { code: 0, data: { schemaVersion: "unilab-workspace-host/v1", operationId: "op-3", phase: "accepted" } } };
    await expect(api.submitOperation({ operationId: "op-3", command: "scheduler.resume" })).resolves.toMatchObject({ operationId: "op-3" });
    mock.nextResponse = { status: 200, data: { code: 4001, error: { msg: "操作不存在", code: "operation_not_found" } } };
    const missing = await api.operation("op-x").catch((e: unknown) => e);
    expect(missing).toMatchObject({ code: 4001, symbol: "operation_not_found" });
    expect((missing as BackendBusinessError).isNotFound).toBe(true);
  });
});

describe("请求头（管理 API 不鉴权）", () => {
  /** 只记录 method + 每次请求的 headers；所有请求回 200 空对象。 */
  function recordingApi() {
    const seen: Array<{ method: string; headers: Record<string, string> | undefined }> = [];
    const instance = {
      request: async (config: { method?: string; headers?: Record<string, string> }) => {
        seen.push({ method: String(config.method), headers: config.headers });
        return { status: 200, data: {} };
      },
    } as unknown as AxiosInstance;
    const api = createEdgeApi("http://edge.local", { axios: instance });
    return { seen, api };
  }

  it("写请求只带 Content-Type（有正文时），不带 X-UniLab-Token / Authorization；读请求不带任何头", async () => {
    const { seen, api } = recordingApi();
    await api.domains.system.requestRestart({ mode: "quiescent" });
    await api.domains.workflowBackend.updateWorkflow("wf-1", { name: "x" });
    await api.domains.system.cancelRestart();
    await api.domains.system.restartStatus();
    await api.domains.processManagement.submitOperation({ operationId: "op", command: "scheduler.resume" });
    expect(seen).toEqual([
      { method: "POST", headers: { "Content-Type": "application/json" } },
      { method: "PUT", headers: { "Content-Type": "application/json" } },
      { method: "DELETE", headers: undefined },
      { method: "GET", headers: undefined },
      { method: "POST", headers: { "Content-Type": "application/json" } },
    ]);
  });

  it("业务码表不再有「未授权」1002；401 不是能力不可用", () => {
    expect(Object.values(BACKEND_BUSINESS_CODES)).not.toContain(1002);
    expect(new ApiError(401, "x", { code: 1002 }).isUnsupported).toBe(false);
  });
});

