import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { OPERATIONS, operationsOf } from "../src/catalog";
import { createEdgeApi } from "../src/client";
import {
  ApiError,
  createHttpTransport,
  createSystemApi,
  hostlinkPeerState,
  type HostLinkPeer,
  type HostLinkStatus,
  type ProtocolDomain,
} from "../src/common";
import { createDeviceProcessesApi } from "../src/device-processes";
import { createDriverPackagesApi } from "../src/driver-packages";
import { createLabV1Api } from "../src/lab-v1";
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
  "registry",
  "materials-v1",
  "graphs-v1",
  "telemetry-v1",
  "history-v1",
  "decisions",
  "driver-packages",
  "device-processes",
  "lab-v1",
  "debug",
];

describe("system 协议与传输层", () => {
  it("URL 数组参数使用 FastAPI 可识别的重复 query key", () => {
    const http = createHttpTransport("http://edge.local");
    expect(http.url("/api/v1/history/events", { event_types: ["job_result", "job_log"] }))
      .toBe("http://edge.local/api/v1/history/events?event_types=job_result&event_types=job_log");
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
      hostlinkPeers: () => api.hostlinkPeers(),
      schedulerResources: () => api.schedulerResources(),
      restartStatus: () => api.restartStatus(),
      requestRestart: () => api.requestRestart({ mode: "quiescent" }),
      cancelRestart: () => api.cancelRestart(),
    });
    expect(called).toEqual(catalogOps("system"));
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

  it("非 2xx 归一为 ApiError（status + 后端 detail），404/503 标记为不支持", async () => {
    const mock = createMockHttp();
    const api = createSystemApi(mock.http);
    mock.nextResponse = { status: 503, data: { detail: "scheduler authority is remote" } };
    const error = await api.schedulerResources().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 503, message: "scheduler authority is remote" });
    expect((error as ApiError).isUnsupported).toBe(true);
    expect((error as ApiError).isNetwork).toBe(false);
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
      "registry",
      "materialsV1",
      "graphsV1",
      "telemetryV1",
      "historyV1",
      "decisions",
      "driverPackages",
      "deviceProcesses",
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
      logs: () => api.logs(DUMMY_ID, 50),
    });
    expect(called).toEqual(catalogOps("device-processes"));
    const logs = mock.calls.find((call) => call.url.endsWith("/logs"));
    expect(logs?.params).toEqual({ tail: 50 });
  });

  it("覆盖 lab-v1 域全部 HTTP 操作，PUT 原样携带 revision 乐观锁", async () => {
    const mock = createMockHttp();
    const api = createLabV1Api(mock.http);
    const write = { revision: 3, cell_size: 100, zones: [{ id: "prep", name: "样品制备区", color: "#2e5bff", cells: ["0,0"] }], walls: ["1,1"] };
    const called = await collectCalls(mock, {
      layout: () => api.layout(),
      saveLayout: () => api.saveLayout(write),
      resetLayout: () => api.resetLayout(),
    });
    expect(called).toEqual(catalogOps("lab-v1"));
    const put = mock.calls.find((call) => call.method === "PUT");
    expect(put?.data).toEqual(write);
  });
});
