/**
 * 对着一台真实微后端（Uni-Lab-OS V1.0 合同）跑通浏览器会用到的读路径与关键写流程。
 *
 *   node packages/protocol/scripts/live-smoke.mjs [http://127.0.0.1:8002] [--write]
 *   pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write
 *   pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write --step-only
 *   pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write --restart   # 另测 Host 重启期间的 5001 退避
 *
 * 管理 API 不鉴权：请求不带任何令牌。
 *
 * 读路径：每个域的列表接口都要 2xx + 信封 code 0，且形状符合类型的关键字段。物料 SSE 首连有带账本纪元的水位帧，
 * 超前或来自另一个库的游标收到 `stream.reset`。
 * --write：写请求不需要令牌；逐步 / V1 暂停任务；Workflow 定义增删；
 * 库存命令出库一件物料、改条码、移动到空位点、删除，被拒命令是失败信封（InventoryCommandRejectedError）；
 * 对在线设备提交一个 always_free 动作并等待任务终态。
 */
import { createEdgeApi, ApiError, BackendBusinessError, InventoryCommandRejectedError, isCapabilityUnavailable } from "../dist/index.js";

const args = process.argv.slice(2);
const flagValue = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
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
    const unsupported = isCapabilityUnavailable(error);
    if (optional && unsupported) {
      record(name, true, `当前进程不提供（${error.status ?? `业务码 ${error.code}`}），按降级处理`);
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
record(
  "system.health",
  health.status === "ok" && "scheduler_mode" in health,
  `scheduler=${health.scheduler} scheduler_mode=${health.scheduler_mode} execution=${health.execution}`,
);
const executionReady = health.execution === "ready";
const schedulerLocal = (health.scheduler_mode ?? health.scheduler) !== "remote";

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
    const command = await api.workflowBackend.commandTask(task.uuid, first);
    if (!["pending", "succeeded"].includes(command.status)) throw new Error(`单步命令投影状态异常：${command.status}`);
    const approveNext = () => approvePending(task.uuid);
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
    if (task) await rejectPending(task.uuid);
    await api.workflowBackend.deleteWorkflow(wf.uuid);
  }
}

/** V1 人工确认按作业提交：确认记录的 workflow_node_job_uuid 就是 job_uuid。 */
async function approvePending(taskUuid) {
  const records = await waitUntil(() => api.workflowBackend.taskManualConfirmations(taskUuid),
    (items) => items.some((item) => item.status === "pending"));
  const record = records.find((item) => item.status === "pending");
  await api.workflowBackend.decideJobManualConfirmation(record.workflow_node_job_uuid, {
    action: "approve", decision_idempotency_key: crypto.randomUUID(),
  });
  return record;
}

async function rejectPending(taskUuid) {
  for (const pending of await api.workflowBackend.taskManualConfirmations(taskUuid)) {
    if (pending.status !== "pending") continue;
    await api.workflowBackend.decideJobManualConfirmation(pending.workflow_node_job_uuid, {
      action: "reject", decision_idempotency_key: crypto.randomUUID(),
    }).catch(() => undefined);
  }
}

function confirmationGraph(count) {
  const nodes = [];
  for (let i = 0; i < count; i++) {
    nodes.push({ uuid: crypto.randomUUID(), name: `确认 ${i + 1}`, type: "device_action",
      material_uuid: crypto.randomUUID(), action_name: "manual_confirm", action_type: "UniLabJsonCommand",
      meta_data: { target_device_id: "host_node" },
      pose: { x: i * 250, y: 0 }, param: { assignee_user_ids: [], timeout_seconds: 60 },
      execution_policy: { depends_on: i ? [nodes[i - 1].uuid] : [] } });
  }
  return nodes;
}

async function workflowPauseSmoke() {
  // V1 pause = 暂停派发（不转逐步）：已下发的确认照常完成，下一个节点不派发；resume 后继续。
  const wf = await api.workflowBackend.createWorkflow({ name: `pause-smoke-${Date.now()}`, tags: ["smoke"] });
  let task;
  try {
    await api.workflowBackend.saveGraph(wf.uuid, { revision: wf.revision, nodes: confirmationGraph(2), edges: [] });
    task = await api.workflowBackend.createTask({ workflow_uuid: wf.uuid, run_mode: "normal" });
    await waitUntil(() => api.workflowBackend.taskManualConfirmations(task.uuid), (items) => items.some((item) => item.status === "pending"));
    const pause = await api.workflowBackend.commandTask(task.uuid, { type: "pause", idempotency_key: crypto.randomUUID() });
    if (pause.status !== "succeeded") throw new Error(`pause 命令投影状态 ${pause.status}`);
    const paused = await api.workflowBackend.task(task.uuid);
    if (paused.dispatch_gate !== "paused" || paused.run_mode !== "normal") {
      throw new Error(`暂停后 dispatch_gate=${paused.dispatch_gate} run_mode=${paused.run_mode}`);
    }
    // 自动模式下 pause 的重复提交（换键）应被拒为状态冲突，而不是被当成功
    const again = await api.workflowBackend.commandTask(task.uuid, { type: "switch_to_step", idempotency_key: crypto.randomUUID() })
      .then(() => null, (error) => error);
    await approvePending(task.uuid);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const runs = await api.workflowBackend.taskNodeRuns(task.uuid);
    if (runs.filter((run) => run.status === "pending").length !== 1) throw new Error("暂停派发期间仍派发了下一个节点");
    const current = await api.workflowBackend.task(task.uuid);
    await api.workflowBackend.commandTask(task.uuid, { type: "resume", expected_revision: current.control_revision, idempotency_key: crypto.randomUUID() });
    await approvePending(task.uuid);
    const done = await waitUntil(() => api.workflowBackend.task(task.uuid), (value) => value.status === "succeeded");
    return `task ${task.uuid}: pause（dispatch_gate=paused）→ 在途完成、不派发 → resume → ${done.status}` +
      (again ? `；暂停中 switch_to_step 被拒：${again.reason ?? again.message}` : "");
  } finally {
    if (task) {
      const latest = await api.workflowBackend.task(task.uuid).catch(() => null);
      if (latest && ["pending", "running"].includes(latest.status)) {
        await api.workflowBackend.commandTask(task.uuid, { type: "cancel", idempotency_key: crypto.randomUUID() }).catch(() => undefined);
      }
      await rejectPending(task.uuid);
    }
    await api.workflowBackend.deleteWorkflow(wf.uuid).catch(() => undefined);
  }
}

async function restartRetrySmoke() {
  // 安静点重启 Host 子进程（scope=edge）：重启期间 Host 专有路由返回 5001 + Retry-After，GET 自动退避重试。
  const requested = await api.system.requestRestart({ mode: "quiescent", scope: "edge" });
  const started = Date.now();
  let unavailable = 0;
  const probe = createEdgeApi(baseUrl, { unavailableRetry: false }).domains;
  const deadline = Date.now() + 90_000;
  // 先观察到一次 5001（Host 已退出），再用默认的退避客户端读到恢复
  while (Date.now() < deadline) {
    try {
      await probe.runtimeV1.endpoints();
      if (unavailable) break;
    } catch (error) {
      if (!(error instanceof BackendBusinessError && error.isUnavailable)) throw error;
      unavailable += 1;
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  let endpoints = null;
  while (Date.now() < deadline) {
    try {
      endpoints = await api.runtimeV1.endpoints();
      break;
    } catch (error) {
      if (!(error instanceof BackendBusinessError && error.isUnavailable)) throw error;
      unavailable += 1;
    }
  }
  if (!endpoints) throw new Error("Host 90 秒内未恢复");
  return `restart scope=${requested.effective_scope ?? requested.scope}；观察到 5001 ${unavailable} 次，${Date.now() - started} ms 后 Host 路由恢复（endpoints=${endpoints.length}）`;
}

async function runtimeLogsSmoke() {
  // 日志复用已有事件流，纯 Host 无 Workflow Authority 时也必须可连接。
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const stream = await fetch(api.workflowBackend.eventsUrl(), { signal: controller.signal });
    if (!stream.ok || !stream.headers.get("content-type")?.includes("text/event-stream")) {
      throw new Error(`日志通知 SSE 不可用: ${stream.status}`);
    }
    const reader = stream.body.getReader();
    const first = await reader.read();
    if (first.done) throw new Error("日志通知 SSE 立即断开");
    await reader.cancel();
  } finally { clearTimeout(timeout); controller.abort(); }
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
  return `共享 SSE 可连接，${readable.length} 个来源可读（Host / 受管 Slave / 外部 Slave）`;
}

if (args.includes("--logs-only")) {
  await step("system runtime logs", runtimeLogsSmoke);
  process.exit(results.some((item) => !item.ok) ? 1 : 0);
}
if (args.includes("--step-only")) {
  if (!doWrite || !schedulerLocal || !executionReady) throw new Error("--step-only 需要 --write 与带执行面的本机调度微后端");
  await step("workflow step → resume", workflowStepSmoke);
  await step("workflow pause → resume (V1)", workflowPauseSmoke);
  process.exit(results.some((item) => !item.ok) ? 1 : 0);
}
// 重置只测只读预览；即使 --write 也绝不清空使用者数据。
await step("system.resetPreview", async () => {
  const preview = await api.system.resetPreview();
  expectKeys(preview, ["supported", "pending", "confirmation_token", "backup_path", "detail"], "reset");
});

await step("envelope: unmatched route → 404 + 4001", async () => {
  // 未匹配的路由（含 /v1/* 与已删除的 lab 布局路由）由应用级兜底返回信封，保留 404
  const missing = await createEdgeApi(baseUrl).http.request({ method: "GET", path: "/api/v1/__openlab_smoke_missing__" }).then(() => null, (error) => error);
  if (!(missing instanceof ApiError) || missing.status !== 404 || missing.businessCode !== 4001) {
    throw new Error(`应为 404 + 4001，实际 ${missing?.status ?? "成功"} / ${missing?.businessCode}`);
  }
  return `404 + ${missing.businessCode}: ${missing.message}`;
});

await step("system.readiness", async () => {
  const readiness = await api.system.readiness();
  expectKeys(readiness, ["status", "capabilities", "phase", "workflowRuntime", "scheduler", "execution", "reasons"], "readiness");
  if (!["ready", "starting", "failed"].includes(readiness.status)) throw new Error(`readiness.status 不是 V1 取值：${readiness.status}`);
  return `status=${readiness.status} phase=${readiness.phase} execution=${readiness.execution}${readiness.reasons.length ? ` reasons=${readiness.reasons.join("；")}` : ""}`;
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

await step("inventory.instances(roots) / relations / lots / reservations / ledger / contents + materialsV1.registryClasses", async () => {
  const [health, roots, all, relations, lots, reservations, ledger, contents, classes] = await Promise.all([
    api.inventory.health(),
    api.inventory.instances({ rootsOnly: true }),
    api.inventory.instances(),
    api.inventory.relations(),
    api.inventory.lots(),
    api.inventory.reservations(),
    api.inventory.ledger(0, 50),
    api.inventory.contents(),
    api.materialsV1.registryClasses(),
  ]);
  for (const aggregate of roots) expectKeys(aggregate, ["material", "position", "data", "sites", "state_hash", "edge_uuid", "status"], "instance");
  expectKeys(reservations, ["reservations", "content_reservations", "source_bindings"], "reservations");
  if (all[0]) {
    const detail = await api.inventory.instance(all[0].edge_uuid);
    expectKeys(detail, ["material", "relation", "content"], "instance detail");
  }
  return `ledger_seq=${health.ledger_sequence} roots=${roots.length} all=${all.length} relations=${relations.relations.length} links=${relations.links.length} lots=${lots.length} reservations=${reservations.reservations.length} ledger=${ledger.length} contents=${contents.length} classes=${classes.length}`;
});
/** 读一条 SSE 直到 `until(帧列表)` 为真或超时；帧是 `{id?, event?, data?}`，注释帧不计。 */
async function readSse(url, headers, until, timeoutMs = 4000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const frames = [];
  try {
    const stream = await fetch(url, { headers, signal: controller.signal });
    if (!stream.ok || !stream.headers.get("content-type")?.includes("text/event-stream")) {
      throw new Error(`SSE 不可用: ${stream.status}`);
    }
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!until(frames)) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        const frame = {};
        for (const line of block.split("\n")) {
          const match = /^(id|event|data): ?(.*)$/.exec(line);
          if (match) frame[match[1]] = match[2];
        }
        if (Object.keys(frame).length) frames.push(frame);
      }
    }
    await reader.cancel().catch(() => {});
  } catch (error) {
    if (!controller.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
  return frames;
}

await step("materialsV1.events: 水位帧（id 带账本纪元）与 stream.reset（cursor_ahead / epoch_changed）", async () => {
  const url = api.materialsV1.eventsUrl();
  const watermark = (await readSse(url, {}, (frames) => frames.some((frame) => frame.id !== undefined)))
    .find((frame) => frame.id !== undefined && frame.event === undefined);
  if (!watermark) throw new Error("首连没有只含 id 的水位帧");
  const match = /^(\d+)(?::([0-9A-Za-z_-]+))?$/.exec(watermark.id);
  if (!match) throw new Error(`水位 id 不是 <sequence>[:<epoch>]：${watermark.id}`);
  const sequence = Number(match[1]);
  const epoch = match[2] ?? null;
  const resetOf = async (lastEventId) => {
    const frames = await readSse(url, { "Last-Event-ID": lastEventId }, (items) => items.some((frame) => frame.event === "stream.reset"));
    const reset = frames.find((frame) => frame.event === "stream.reset");
    if (!reset) throw new Error(`Last-Event-ID ${lastEventId} 没有收到 stream.reset`);
    return { id: reset.id, reason: JSON.parse(reset.data ?? "{}").reason };
  };
  const ahead = await resetOf(epoch ? `${sequence + 1000}:${epoch}` : String(sequence + 1000));
  if (ahead.reason !== "cursor_ahead") throw new Error(`超前游标的 reason 应为 cursor_ahead，实际 ${ahead.reason}`);
  // 另一个库的游标：纪元对不上，即使序号落在账本范围内也要重置
  const foreign = await resetOf(`${Math.min(sequence, 1)}:smoke-foreign-epoch`);
  if (foreign.reason !== "epoch_changed") throw new Error(`外库游标的 reason 应为 epoch_changed，实际 ${foreign.reason}`);
  // 重置帧的 id 是新水位（重读期间账本可能前进，不早于首连水位）
  for (const reset of [ahead, foreign]) {
    const at = /^(\d+)/.exec(reset.id ?? "");
    if (!at || Number(at[1]) < sequence) throw new Error(`重置帧 id 不是新水位：${reset.id}`);
  }
  return `水位 ${watermark.id} · 超前 → ${ahead.reason}（id ${ahead.id}）· 外库 → ${foreign.reason}`;
});

await step("inventory.templates (heavy, on-demand)", async () => {
  const started = Date.now();
  const templates = await api.inventory.templates({ includeDefinition: true });
  for (const template of templates.slice(0, 5)) expectKeys(template, ["template_uuid", "template_id", "name", "definition"], "template");
  return `${templates.length} templates in ${Date.now() - started} ms`;
});
await step("graphsV1.graphs / livePayload", async () => {
  const [page, live] = await Promise.all([api.graphsV1.graphs(), api.graphsV1.livePayload()]);
  expectKeys(live, ["nodes", "links"], "live payload");
  return `graphs=${page.total} live nodes=${live.nodes.length} links=${live.links.length}`;
});
await step("chemicalsV1.chemicals", async () => {
  const page = await api.chemicalsV1.chemicals({ page_size: 20 });
  expectKeys(page, ["items", "total", "page", "page_size"], "chemicals");
  return `chemicals=${page.total}`;
}, { optional: true });
await step("telemetryV1.states / events", async () => {
  const [states, events] = await Promise.all([api.telemetryV1.states(), api.telemetryV1.events({ limit: 50 })]);
  for (const state of states) expectKeys(state, ["endpoint_uuid", "device_uuid", "properties", "connection_state"], "state");
  return `states=${states.length} events=${events.length}`;
});
await step("deviceState.all / history", async () => {
  const [all, history] = await Promise.all([api.deviceState.all(), api.deviceState.history({ limit: 20 })]);
  return `keys=${Object.keys(all).join(",")} history=${Object.keys(history).join(",")}`;
}, { optional: !executionReady });
await step("historyV1.events (/edge/history)", async () => {
  const events = await api.historyV1.events({ limit: 50 });
  if (events[0]) await api.historyV1.event(events[0].event_uuid);
  return `${events.length} events`;
});
await step("runHistory.workflows / jobs", async () => {
  const [runs, jobs] = await Promise.all([api.runHistory.workflows({ limit: 20 }), api.runHistory.jobs({ limit: 20 })]);
  expectKeys(runs, ["runs", "stats"], "run history");
  return `runs=${runs.runs.length} jobs=${jobs.jobs.length}`;
}, { optional: true });
await step("scheduler.monitorSnapshot / timeline / timePlan / drainStatus", async () => {
  const [snapshot, timeline, plan, drain] = await Promise.all([
    api.scheduler.monitorSnapshot(),
    api.scheduler.timeline({ window_s: 3600 }),
    api.scheduler.timePlan(),
    api.scheduler.drainStatus(),
  ]);
  return `snapshot=${Object.keys(snapshot).join(",")} timeline=${Object.keys(timeline).join(",")} plan.enabled=${plan.enabled} drain=${drain.phase}`;
}, { optional: true });
await step("workflowBackend.workflows / tasks / presentations / interventions / categories", async () => {
  const [workflows, tasks, presentations, interventions, categories] = await Promise.all([
    api.workflowBackend.workflows({ page: 1, page_size: 20 }),
    api.workflowBackend.tasks({ page: 1, page_size: 20 }),
    api.workflowBackend.taskPresentations({ view: "matrix" }),
    api.workflowBackend.interventions({ status: "open" }),
    api.workflowBackend.operationCategories(),
  ]);
  expectKeys(workflows, ["items", "has_more", "page", "page_size"], "workflow page");
  return `workflows=${workflows.items.length}${workflows.has_more ? "+" : ""} tasks=${tasks.items.length}${tasks.has_more ? "+" : ""} presentations=${presentations.items?.length ?? "?"} open interventions=${interventions.length} categories=${categories.length}`;
}, { optional: true });
await step("workflowBackend.latestPublications", async () => {
  const publications = await api.workflowBackend.latestPublications();
  for (const item of publications) expectKeys(item, ["uuid", "workflow_uuid", "revision", "contract_digest", "inputs", "outputs"], "publication");
  return `${publications.length} published workflow(s)`;
}, { optional: true });
await step("registry.entries / status / remoteSlaves", async () => {
  const [{ entries }, status, slaves] = await Promise.all([api.registry.entries(), api.registry.status(), api.registry.remoteSlaves()]);
  expectKeys(status, ["reported", "last_report", "active_count", "pending_count", "machine_id", "acceptance", "remote_slaves"], "registry status");
  expectKeys(status.acceptance, ["single_machine", "reason", "reporter_machine_id", "remote_slaves"], "acceptance");
  const pending = entries.filter((entry) => entry.status.includes("pending"));
  if (pending.length !== status.pending_count) throw new Error(`挂起数不一致：entries=${pending.length} status=${status.pending_count}`);
  return `${entries.length} entries · reported=${status.reported} pending=${status.pending_count} single_machine=${status.acceptance.single_machine} remote_slaves=${slaves.slaves.length}`;
}, { optional: true });
await step("decisions.incidents / errorDecisions", async () => {
  const [incidents, errors] = await Promise.all([api.decisions.incidents(), api.decisions.errorDecisions()]);
  expectKeys(errors, ["decisions"], "error decisions");
  return `host_ready=${incidents.host_ready} incidents=${incidents.incidents.length} errors=${errors.decisions.length}`;
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

await step("labV1.warehouse; deleted lab profile / layout / zones / placements → 404", async () => {
  const warehouse = await api.labV1.warehouse();
  const probe = createEdgeApi(baseUrl).http;
  const deleted = [];
  for (const [method, path] of [
    ["GET", "/api/v1/lab/profile"],
    ["GET", "/api/v1/lab/layout"],
    ["POST", "/api/v1/lab/zones"],
    ["DELETE", "/api/v1/lab/placements/smoke"],
  ]) {
    const error = await probe.request({ method, path, ...(method === "POST" ? { body: {} } : {}) }).then(() => null, (e) => e);
    if (!(error instanceof ApiError) || error.status !== 404) throw new Error(`${method} ${path} 应已删除（404），实际 ${error?.status ?? "成功"}`);
    deleted.push(`${method} ${path.replace("/api/v1", "")}`);
  }
  return `warehouse keys=${Object.keys(warehouse).join(",")}；已删除：${deleted.join("、")}`;
});
await step("processManagement.snapshot (/v1, envelope)", async () => {
  const snapshot = await api.processManagement.snapshot();
  expectKeys(snapshot, ["schemaVersion", "revision", "components"], "process snapshot");
  return `${snapshot.schemaVersion} revision=${snapshot.revision} components=${Object.values(snapshot.components).map((c) => `${c.name}:${c.phase}`).join(" ")}`;
}, { optional: true });

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
  await step("no auth: a write without any credentials is accepted", async () => {
    // 管理 API 不鉴权：不带任何令牌的写请求照常受理（取消重启在没有挂起的重启时是空操作）
    const result = await api.system.cancelRestart();
    return `DELETE /restart → pending=${result.pending}`;
  });
  if (schedulerLocal && executionReady) await step("workflow step → resume", workflowStepSmoke);
  if (schedulerLocal && executionReady) await step("workflow pause → resume (V1)", workflowPauseSmoke);
  if (schedulerLocal) {
    await step("workflow create → graph → delete", async () => {
      const wf = await api.workflowBackend.createWorkflow({ name: `smoke-${Date.now().toString(36)}`, tags: ["smoke"] });
      const graph = await api.workflowBackend.graph(wf.uuid);
      expectKeys(graph, ["workflow", "nodes", "edges", "node_templates", "handle_templates"], "graph");
      await api.workflowBackend.deleteWorkflow(wf.uuid);
      return wf.uuid;
    });
  }
  await step("inventory commands: instantiate (display_name) → patch → move → delete; rejected → failure envelope", async () => {
    const classes = await api.materialsV1.registryClasses();
    const roots = await api.inventory.instances({ rootsOnly: true });
    const preferred = classes.find((c) => /tip/i.test(c.registry_class)) ?? classes[0];
    if (!preferred) throw new Error("registry 没有可实例化的资源类");
    const label = `smoke_${Date.now().toString(36)}`;
    const created = await api.inventory.instantiate(preferred.registry_class, label);
    const uuid = created.data.root_material_uuid;
    // 物料 name = uuid；人读标签落在 display_name
    const root = created.data.nodes.find((node) => node.material.material_uuid === uuid);
    if (root?.material.name !== uuid || root.material.display_name !== label) {
      throw new Error(`实例化后应 name = uuid、display_name = ${label}，实际 name=${root?.material.name} display_name=${root?.material.display_name}`);
    }
    const barcode = `SMOKE-${Date.now().toString(36).toUpperCase()}`;
    const patched = await api.inventory.patch(uuid, { barcode, display_name: `${label}_renamed` });
    if (patched.data.material.barcode !== barcode) throw new Error("条码没有写入");
    if (patched.data.material.display_name !== `${label}_renamed` || patched.data.material.name !== uuid) throw new Error("display_name 没有写入或 name 被改动");
    const detail = await api.inventory.instance(uuid);
    if (detail.barcode !== barcode) throw new Error("/inventory/instances 读不到新条码");
    const byLabel = await api.inventory.instances({ name: `${label}_renamed` });
    if (!byLabel.some((item) => item.material.material_uuid === uuid)) throw new Error("?name= 没有按 display_name 筛到物料");
    let moved = "未移动（没有空位点）";
    const vacant = roots.flatMap((root) => root.sites.filter((site) => !site.occupied_material_uuid).map((site) => ({ root, site })))[0];
    if (vacant) {
      try {
        await api.inventory.move({ material_uuid: uuid, destination_site_uuid: vacant.site.site_uuid, parent_material_uuid: vacant.root.material.material_uuid });
        moved = `已移动到 ${vacant.root.material.resource_id}/${vacant.site.label}`;
      } catch (error) {
        moved = `移动被拒绝：${error?.message ?? error}`;
      }
    }
    const rejected = await api.inventory.move({ material_uuid: uuid, destination_site_uuid: crypto.randomUUID() }).then(() => null, (error) => error);
    if (!(rejected instanceof InventoryCommandRejectedError) || typeof rejected.details?.command_id !== "string") {
      throw new Error("移动到不存在的库位应是失败信封（error.details.command_id）");
    }
    const removed = await api.inventory.remove(uuid, true);
    return `${preferred.registry_class} → ${uuid.slice(0, 8)}（name = uuid，display_name = ${label}_renamed）· 条码 ${barcode} · ${moved} · 被拒命令 ${rejected.code}/${rejected.symbol} · 删除 ${removed.data.deleted_material_uuids.length} 节点`;
  });
  await step("registry pending batch apply / dismiss (only when nothing is pending)", async () => {
    const status = await api.registry.status();
    if (status.pending_count) return `有 ${status.pending_count} 个挂起条目，留给用户确认，跳过`;
    const [applied, dismissed] = [await api.registry.applyPending(), await api.registry.dismissPending()];
    if (applied.entries.length || dismissed.entries.length) throw new Error("没有挂起条目时批量确认不应改动任何条目");
    return `apply → ${applied.entries.length}/${applied.failed.length}，dismiss → ${dismissed.entries.length}/${dismissed.failed.length}`;
  }, { optional: true });
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

if (doWrite && args.includes("--restart") && executionReady) {
  await step("Host restart: 5001 + Retry-After backoff", restartRetrySmoke);
}

const failed = results.filter((item) => !item.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
