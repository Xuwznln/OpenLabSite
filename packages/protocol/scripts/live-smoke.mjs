/**
 * 对着一台真实微后端跑通浏览器会用到的读路径与关键写流程。
 *
 *   node packages/protocol/scripts/live-smoke.mjs [http://127.0.0.1:8002] [--write]
 *   pnpm --filter @openlab/protocol smoke -- --write
 *   pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write --step-only
 *
 * 读路径：每个域的列表接口都要 2xx 且形状符合类型的关键字段。
 * --write：创建并删除一条 Workflow 定义；出库一件物料、移动到空位点、删除；
 * 对在线设备提交一个 always_free 动作并等待任务终态。
 */
import { createEdgeApi, ApiError, BackendBusinessError } from "../dist/index.js";

const args = process.argv.slice(2);
const baseUrl = args.find((arg) => !arg.startsWith("--")) ?? process.env.OPENLAB_EDGE_URL ?? "http://127.0.0.1:8002";
const doWrite = args.includes("--write");
const api = createEdgeApi(baseUrl).domains;

const results = [];
function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

async function step(name, fn, { optional = false } = {}) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === "string" ? detail : "");
    return true;
  } catch (error) {
    const unsupported = error instanceof ApiError && error.isUnsupported;
    if (optional && unsupported) {
      record(name, true, `未挂载（${error.status}），按降级处理`);
      return false;
    }
    const message = error instanceof BackendBusinessError ? `业务码 ${error.code}: ${error.message}` : error?.message ?? String(error);
    record(name, false, message);
    return false;
  }
}

function expectKeys(value, keys, label) {
  for (const key of keys) {
    if (!(key in value)) throw new Error(`${label} 缺少字段 ${key}`);
  }
}

const health = await api.system.health();
record("system.health", health.status === "ok", `scheduler=${health.scheduler} execution=${health.execution}`);
const executionReady = health.execution === "ready";
const schedulerLocal = health.scheduler !== "remote";

async function waitUntil(read, predicate) {
  const deadline = Date.now() + 10_000;
  do {
    const value = await read();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  } while (Date.now() < deadline);
  throw new Error("等待工作流状态超时");
}

async function workflowStepSmoke() {
  // 只用调度器原生 manual_confirm，不调用实际设备；三节点验证逐步与转自动。
  const wf = await api.workflowBackend.createWorkflow({ name: `step-smoke-${Date.now()}`, tags: ["smoke"] });
  let task;
  try {
    const nodes = [];
    for (let i = 0; i < 3; i++) {
      nodes.push({ uuid: crypto.randomUUID(), name: `确认 ${i + 1}`, type: "device_action",
        material_uuid: crypto.randomUUID(), action_name: "manual_confirm", action_type: "UniLabJsonCommand",
        meta_data: { target_device_id: "host_node" },
        pose: { x: i * 250, y: 0 }, param: { assignee_user_ids: [], timeout_seconds: 60 },
        execution_policy: { depends_on: i ? [nodes[i - 1].uuid] : [] } });
    }
    await api.workflowBackend.saveGraph(wf.uuid, { revision: wf.revision, nodes, edges: [] });
    task = await api.workflowBackend.createTask({ workflow_uuid: wf.uuid, run_mode: "step" });
    if (task.control_status !== "paused") throw new Error("逐步任务提交后未暂停");
    const initial = await api.workflowBackend.task(task.uuid);
    if (initial.control_revision !== 0) throw new Error("缺少逐步控制版本");
    const first = { type: "step", expected_revision: 0, idempotency_key: crypto.randomUUID() };
    await api.workflowBackend.commandTask(task.uuid, first);
    const approveNext = async () => {
      const records = await waitUntil(() => api.workflowBackend.taskManualConfirmations(task.uuid),
        (items) => items.some((item) => item.status === "pending"));
      const record = records.find((item) => item.status === "pending");
      await api.workflowBackend.decideManualConfirmation(record.uuid, {
        action: "approve", decision_idempotency_key: crypto.randomUUID(),
      });
    };
    await approveNext();
    const paused = await waitUntil(() => api.workflowBackend.task(task.uuid), (value) => value.control_status === "paused");
    await api.workflowBackend.commandTask(task.uuid, first); // 已完成后的同键重放也不能多放行一步
    const runs = await api.workflowBackend.taskNodeRuns(task.uuid);
    if (runs.filter((run) => run.status === "succeeded").length !== 1
      || runs.filter((run) => run.status === "pending").length !== 2) throw new Error("一次点击没有严格只推进一个动作");
    await api.workflowBackend.commandTask(task.uuid, {
      type: "resume", expected_revision: paused.control_revision, idempotency_key: crypto.randomUUID(),
    });
    await approveNext();
    await approveNext();
    const done = await waitUntil(() => api.workflowBackend.task(task.uuid), (value) => value.status === "succeeded");
    if (done.run_mode !== "normal") throw new Error("切换自动失败");
    return `task ${task.uuid}: 暂停 → 单点 → 幂等重放 → 自动 → succeeded`;
  } finally {
    if (task) {
      for (const pending of await api.workflowBackend.taskManualConfirmations(task.uuid)) {
        if (pending.status === "pending") await api.workflowBackend.decideManualConfirmation(pending.uuid, {
          action: "reject", decision_idempotency_key: crypto.randomUUID(),
        });
      }
    }
    await api.workflowBackend.deleteWorkflow(wf.uuid);
  }
}

async function runtimeLogsSmoke() {
  const listing = await api.system.logSources();
  expectKeys(listing, ["sources"], "log sources");
  const readable = listing.sources.filter((source) => source.supported && (source.online || source.managed));
  for (const source of readable) {
    expectKeys(source, ["source_id", "role", "machine_name", "device_ids", "online", "managed", "supported"], "log source");
    const first = await api.system.logs(source.source_id, { limit: 10 });
    expectKeys(first, ["stream_id", "cursor", "lines", "reset", "has_more", "path", "pid"], "log batch");
    if (first.source_id !== source.source_id || first.lines.length > 10) throw new Error("日志来源/限额不匹配");
    // 相同游标交给两个读者：两边都可读取，不存在消费式游标或单客户端占用。
    const [a, b] = await Promise.all([
      api.system.logs(source.source_id, { cursor: first.cursor, limit: 10 }),
      api.system.logs(source.source_id, { cursor: first.cursor, limit: 10 }),
    ]);
    if (a.stream_id === b.stream_id) {
      const common = Math.min(a.lines.length, b.lines.length);
      if (JSON.stringify(a.lines.slice(0, common)) !== JSON.stringify(b.lines.slice(0, common))) throw new Error("日志读取者互相干扰");
    }
  }
  return `${readable.length} 个来源可读（Host / 受管 Slave / 外部 Slave）`;
}

if (args.includes("--logs-only")) {
  await step("system runtime logs", runtimeLogsSmoke);
  process.exit(results.some((item) => !item.ok) ? 1 : 0);
}
if (args.includes("--step-only")) {
  if (!doWrite || !schedulerLocal || !executionReady) throw new Error("--step-only 需要 --write 与带执行面的本机调度微后端");
  await step("workflow step → resume", workflowStepSmoke);
  process.exit(results.some((item) => !item.ok) ? 1 : 0);
}
// 重置只测只读预览；即使 --write 也绝不清空使用者数据。
await step("system.resetPreview", async () => {
  const preview = await api.system.resetPreview();
  expectKeys(preview, ["supported", "pending", "confirmation_token", "backup_path", "detail"], "reset");
});

await step("system.hostlinkPeers", async () => {
  const status = await api.system.hostlinkPeers();
  expectKeys(status, ["role", "peers", "client"], "hostlink");
  return `role=${status.role} peers=${status.peers.length}`;
});
await step("system runtime logs", runtimeLogsSmoke, { optional: !executionReady });
await step("system.schedulerResources", async () => {
  const snapshot = await api.system.schedulerResources();
  expectKeys(snapshot, ["sequence", "requests", "ownerships", "handoffs"], "resources");
}, { optional: true });
await step("system.restartStatus", async () => {
  const status = await api.system.restartStatus();
  expectKeys(status, ["pending", "restarting", "active_jobs", "dispatch_paused"], "restart");
});

await step("runtimeV1.endpoints", async () => {
  const endpoints = await api.runtimeV1.endpoints();
  for (const endpoint of endpoints) {
    expectKeys(endpoint, ["endpoint_uuid", "transport", "state", "device_routes", "action_capabilities"], "endpoint");
    for (const capability of endpoint.action_capabilities) {
      expectKeys(capability, ["device_uuid", "action_name", "availability", "descriptor"], "capability");
    }
  }
  return `${endpoints.length} endpoint(s), ${endpoints.reduce((n, e) => n + e.action_capabilities.length, 0)} capabilities`;
});
await step("runtimeV1.jobs / commands / sessions / outboxes", async () => {
  const [jobs, commands, sessions, adapter, events] = await Promise.all([
    api.runtimeV1.jobs({ limit: 50 }),
    api.runtimeV1.commands({ limit: 50 }),
    api.runtimeV1.sessions({ limit: 50 }),
    api.runtimeV1.adapterCommands({ limit: 50 }),
    api.runtimeV1.backendEvents({ limit: 50 }),
  ]);
  return `jobs=${jobs.length} commands=${commands.length} sessions=${sessions.length} adapter=${adapter.length} events=${events.length}`;
});

await step("materialsV1.instances(roots) / links / lots / reservations / changes / registryClasses", async () => {
  const [roots, all, links, lots, reservations, changes, classes] = await Promise.all([
    api.materialsV1.instances(true),
    api.materialsV1.instances(),
    api.materialsV1.links(),
    api.materialsV1.lots(),
    api.materialsV1.reservations(),
    api.materialsV1.changes(0, 50),
    api.materialsV1.registryClasses(),
  ]);
  for (const aggregate of roots) expectKeys(aggregate, ["material", "position", "data", "sites", "state_hash"], "aggregate");
  return `roots=${roots.length} all=${all.length} links=${links.length} lots=${lots.length} reservations=${reservations.length} changes=${changes.length} classes=${classes.length}`;
});
await step("materialsV1.templates (heavy, on-demand)", async () => {
  const started = Date.now();
  const templates = await api.materialsV1.templates();
  return `${templates.length} templates in ${Date.now() - started} ms`;
});
await step("graphsV1.graphs / livePayload", async () => {
  const [page, live] = await Promise.all([api.graphsV1.graphs(), api.graphsV1.livePayload()]);
  expectKeys(live, ["nodes", "links"], "live payload");
  return `graphs=${page.total} live nodes=${live.nodes.length} links=${live.links.length}`;
});
await step("telemetryV1.states / events", async () => {
  const [states, events] = await Promise.all([api.telemetryV1.states(), api.telemetryV1.events({ limit: 50 })]);
  for (const state of states) expectKeys(state, ["endpoint_uuid", "device_uuid", "properties", "connection_state"], "state");
  return `states=${states.length} events=${events.length}`;
});
await step("historyV1.events", async () => {
  const events = await api.historyV1.events({ limit: 50 });
  return `${events.length} events`;
});
await step("workflowBackend.workflows / tasks", async () => {
  const [workflows, tasks] = await Promise.all([api.workflowBackend.workflows({ page: 1, page_size: 20 }), api.workflowBackend.tasks({ page: 1, page_size: 20 })]);
  return `workflows=${workflows.total} tasks=${tasks.total}`;
}, { optional: true });
await step("registry.entries", async () => {
  const { entries } = await api.registry.entries();
  return `${entries.length} entries`;
}, { optional: true });
await step("decisions.incidents / errorDecisions", async () => {
  const [incidents, errors] = await Promise.all([api.decisions.incidents(), api.decisions.errorDecisions()]);
  return `host_ready=${incidents.host_ready} incidents=${incidents.incidents.length} errors=${errors.items.length}`;
}, { optional: true });
await step("driverPackages.inventory / catalog", async () => {
  const [inventory, catalog] = await Promise.all([api.driverPackages.inventory(), api.driverPackages.catalog()]);
  expectKeys(inventory, ["python", "working_dir", "scan_dirs", "restart_required", "packages", "operations"], "inventory");
  expectKeys(catalog, ["sources", "packages"], "catalog");
  for (const pkg of inventory.packages) expectKeys(pkg, ["name", "enabled", "package_dirs", "device_ids", "mounted", "loaded_device_ids"], "package");
  return `packages=${inventory.packages.length} restart_required=${inventory.restart_required} catalog=${catalog.packages.length}`;
}, { optional: true });
await step("deviceProcesses.list / deviceClasses", async () => {
  const [listing, classes] = await Promise.all([api.deviceProcesses.list(), api.deviceProcesses.deviceClasses()]);
  expectKeys(listing, ["hostlink", "processes"], "listing");
  for (const proc of listing.processes) expectKeys(proc, ["id", "name", "status", "restart_policy", "graph_nodes", "device_ids"], "process");
  return `processes=${listing.processes.length} running=${listing.processes.filter((p) => p.status === "running").length} classes=${classes.length}`;
}, { optional: true });

await step("labV1.layout", async () => {
  const layout = await api.labV1.layout();
  expectKeys(layout, ["layout_key", "revision", "cell_size", "zones", "walls", "created_at_ms", "updated_at_ms"], "layout");
  return `revision=${layout.revision} zones=${layout.zones.length} walls=${layout.walls.length} cell=${layout.cell_size}`;
});

await step("debug.databases + first table", async () => {
  const databases = await api.debug.databases();
  const withTable = databases.databases.find((db) => db.exists && db.tables?.length);
  if (!withTable) return `${databases.databases.length} databases, no tables`;
  const page = await api.debug.table(withTable.database, withTable.tables[0].name, { limit: 5 });
  expectKeys(page, ["columns", "rows", "total_rows"], "table page");
  return `${databases.databases.length} databases · ${withTable.database}.${page.table} rows=${page.total_rows}`;
});

if (doWrite) {
  console.log("\n--- write flows ---");
  if (schedulerLocal && executionReady) await step("workflow step → resume", workflowStepSmoke);
  if (schedulerLocal) {
    await step("workflow create → graph → delete", async () => {
      const wf = await api.workflowBackend.createWorkflow({ name: `smoke-${Date.now().toString(36)}`, tags: ["smoke"] });
      const graph = await api.workflowBackend.graph(wf.uuid);
      expectKeys(graph, ["workflow", "nodes", "edges", "node_templates", "handle_templates"], "graph");
      await api.workflowBackend.deleteWorkflow(wf.uuid);
      return wf.uuid;
    });
  }
  await step("material instantiate → move → delete", async () => {
    const classes = await api.materialsV1.registryClasses();
    const roots = await api.materialsV1.instances(true);
    const preferred = classes.find((c) => /tip/i.test(c.registry_class)) ?? classes[0];
    if (!preferred) throw new Error("registry 没有可实例化的资源类");
    const created = await api.materialsV1.instantiate(preferred.registry_class, `smoke_${Date.now().toString(36)}`);
    const uuid = created.data.root_material_uuid;
    let moved = "未移动（没有空位点）";
    const vacant = roots.flatMap((root) => root.sites.filter((site) => !site.occupied_material_uuid).map((site) => ({ root, site })))[0];
    if (vacant) {
      try {
        await api.materialsV1.move({ material_uuid: uuid, destination_site_uuid: vacant.site.site_uuid, parent_material_uuid: vacant.root.material.material_uuid });
        moved = `已移动到 ${vacant.root.material.resource_id}/${vacant.site.label}`;
      } catch (error) {
        moved = `移动被拒绝：${error?.message ?? error}`;
      }
    }
    const removed = await api.materialsV1.remove(uuid, true);
    return `${preferred.registry_class} → ${uuid.slice(0, 8)} · ${moved} · 删除 ${removed.data.deleted_material_uuids.length} 节点`;
  });
  if (executionReady && schedulerLocal) {
    await step("ad-hoc device action → terminal", async () => {
      const endpoints = await api.runtimeV1.endpoints();
      const capability = endpoints
        .flatMap((endpoint) => endpoint.action_capabilities)
        .find((c) => c.state === "active" && c.descriptor?.always_free && !c.device_uuid.startsWith("host_node") && Object.keys(c.descriptor?.goal ?? {}).length === 0);
      if (!capability) return "没有无参数的 always_free 动作，跳过";
      const task = await api.workflowBackend.createTask({
        execution_kind: "ad_hoc_device_action",
        device_id: capability.device_uuid,
        action_name: capability.action_name,
        action_type: capability.action_type ?? "",
        param: {},
        execution_policy: { always_free: true },
        description: "live-smoke",
      });
      const deadline = Date.now() + 30_000;
      let latest = task;
      while (Date.now() < deadline && ["pending", "running", "canceling"].includes(latest.status)) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        latest = await api.workflowBackend.task(task.uuid);
      }
      const jobs = await api.workflowBackend.taskJobs(task.uuid);
      return `${capability.device_uuid}/${capability.action_name} → ${latest.status} (${jobs.length} job)`;
    });
  }
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
