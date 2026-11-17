import { readFileSync } from "node:fs";
import { OPERATIONS, operationsOf } from "../dist/catalog.js";
import { createEdgeApi, SERVER_DATABASE_KEYS } from "../dist/index.js";

function fail(message) {
  throw new Error(`OpenLab protocol contract invalid: ${message}`);
}

const openapi = JSON.parse(readFileSync(new URL("../openapi/unilabos-openapi.json", import.meta.url), "utf8"));

// Import the public package entry in plain Node.js as part of the admission
// gate. Vite resolves extensionless imports, while published ESM does not.
if (typeof createEdgeApi !== "function") {
  fail("public ESM entry does not expose the runtime client");
}

const REQUIRED_DOMAINS = [
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
const ROLES = new Set(["host", "backend", "any"]);

const operationIds = new Set();
const routes = new Map();
for (const operation of OPERATIONS) {
  if (operationIds.has(operation.id)) fail(`duplicate operation id ${operation.id}`);
  operationIds.add(operation.id);
  // V1 进程管理路由按 V1 原样不带 /api 前缀；其余一律 /api/v1。
  const prefix = operation.domain === "process-management" ? "/v1/" : "/api/v1/";
  if (!operation.path.startsWith(prefix)) fail(`${operation.id} must use ${prefix}`);
  if (!operation.id.startsWith(`${operation.domain}.`)) {
    fail(`${operation.id} must be prefixed with its domain ${operation.domain}`);
  }
  if (!REQUIRED_DOMAINS.includes(operation.domain)) {
    fail(`${operation.id} uses unknown domain ${operation.domain}`);
  }
  if (!ROLES.has(operation.role)) fail(`${operation.id} has unknown role ${operation.role}`);
  if (typeof operation.mutates !== "boolean") fail(`${operation.id} must declare mutates`);
  if ((operation.method === "GET" || operation.method === "SSE") && operation.mutates) {
    fail(`${operation.id} is a read but declares mutates=true`);
  }
  if (operation.method === "SSE") continue;
  const key = `${operation.method} ${operation.path.replace(/\{[^}]+\}/g, "{}")}`;
  if (routes.has(key)) fail(`route ${key} is declared by both ${routes.get(key)} and ${operation.id}`);
  routes.set(key, operation.id);
}

for (const domain of REQUIRED_DOMAINS) {
  if (operationsOf(domain).length === 0) fail(`domain ${domain} has no operation`);
}

// 注册表域与 Workflow Authority 同归属（本机持有调度权威时挂载，两种角色都可能），role=any；
// 人工决策只在带执行面的 host 进程挂载。
for (const operation of operationsOf("registry")) {
  if (operation.role !== "any") fail(`${operation.id} follows the scheduling authority and must be role=any`);
}
for (const operation of operationsOf("decisions")) {
  if (operation.role !== "host") fail(`${operation.id} must be host-only`);
}
// 驱动包装进的是 Host 进程自己的解释器、受管进程是 Host 拉起的本机子进程，同样 host-only。
for (const domain of ["driver-packages", "device-processes"]) {
  for (const operation of operationsOf(domain)) {
    if (operation.role !== "host") fail(`${operation.id} must be host-only`);
  }
}

// SSE 失效通知流：workflow 与 materials 各一条。
const sse = OPERATIONS.filter((operation) => operation.method === "SSE").map((operation) => operation.path);
if (sse.join("\0") !== ["/api/v1/events", "/api/v1/materials/events"].join("\0")) {
  fail(`unexpected SSE catalog: ${sse.join(", ")}`);
}

// 全部 JSON 路由都是 V1 信封（探针、库存命令入口、/v1/* 进程管理也不例外）；只有 SSE 与文件下载不包信封。
const raw = OPERATIONS.filter((operation) => "raw" in operation).map((operation) => operation.id);
if (raw.length) fail(`every catalog route is a V1 envelope, but these declare raw: ${raw.join(", ")}`);

if (SERVER_DATABASE_KEYS.join("\0") !== ["runtime", "materials", "telemetry", "history"].join("\0")) {
  fail("server database keys drift from the four-database layout");
}

// ── 与微后端导出的 OpenAPI 契约全集对账（openapi/unilabos-openapi.json） ──
// 目录里的每条操作都必须真的存在、角色一致；OpenAPI 里多出来的操作必须显式归类，防止路由静默漂移：
// - CONTROL_PLANE_OPERATIONS：Backend ↔ Edge / 设备 / 工站的内部通道，浏览器不得调用；
// - UNADOPTED_OPERATIONS：浏览器可以调用、但 OpenLabSite 还没有页面与客户端的 V1 控制台面（附理由）。
const CONTROL_PLANE_OPERATIONS = new Set([
  // runtime.v1 控制面（Host ↔ 调度权威）
  "PUT /api/v1/runtime/sessions/{}",
  "PUT /api/v1/runtime/endpoints/{}/snapshot",
  "POST /api/v1/runtime/commands",
  "POST /api/v1/runtime/jobs",
  "POST /api/v1/runtime/jobs/{}/transitions",
  "POST /api/v1/runtime/jobs/{}/feedback",
  "POST /api/v1/runtime/jobs/{}/cancel",
  "POST /api/v1/runtime/jobs/{}/error-gate/open",
  "POST /api/v1/runtime/jobs/{}/error-gate/decision",
  "POST /api/v1/runtime/adapter-commands",
  "POST /api/v1/runtime/adapter-commands/claim",
  "POST /api/v1/runtime/adapter-commands/ack",
  "POST /api/v1/runtime/backend-events",
  "POST /api/v1/runtime/backend-events/claim",
  "POST /api/v1/runtime/backend-events/ack",
  // 执行开始屏障（Host 派发前 / 开始后回报）
  "POST /api/v1/workflow-node-jobs/{}/begin",
  "POST /api/v1/workflow-node-jobs/{}/started",
  // 遥测 / 设备状态 / 历史写入（设备与 Host 上报）
  "POST /api/v1/telemetry/events",
  "POST /api/v1/device-state/report",
  "POST /api/v1/edge/history/events",
  "POST /api/v1/edge/history/events/{}/replacement",
  "POST /api/v1/edge/history/payloads",
  // 物料权威 ↔ Host 同步与物理执行结算（调度器）
  "POST /api/v1/materials/changes/ack",
  "POST /api/v1/materials/snapshots/compare",
  "POST /api/v1/materials/executions/prepare",
  "POST /api/v1/materials/executions/validate",
  "POST /api/v1/materials/executions/settle",
  "POST /api/v1/materials/executions/{}/release",
  // 注册表上报（Host 启动时）
  "GET /api/v1/registry/digest",
  "POST /api/v1/registry/reports",
  "POST /api/v1/resource-templates",
  // V1 工站调用（工站 → 调度权威发起工作流），浏览器不调
  "POST /api/v1/station/workflow-invocations",
]);
const UNADOPTED_GROUPS = {
  // V1 试剂 / 样品 / 当前内容物是 material_substance 上的角色；OpenLabSite 经物料内容物 + 化学品定义管理它们。
  "content-contract": [
    "GET /api/v1/compounds/{}",
    "GET /api/v1/current-substances",
    "POST /api/v1/current-substances",
    "GET /api/v1/current-substances/{}",
    "PUT /api/v1/current-substances/{}",
    "DELETE /api/v1/current-substances/{}",
    "GET /api/v1/materials/{}/current-substance",
    "GET /api/v1/materials/{}/reagent-history",
    "GET /api/v1/materials/{}/substance-history",
    "GET /api/v1/reagent-history/{}",
    "GET /api/v1/substance-history/{}",
    "GET /api/v1/reagent-infos",
    "POST /api/v1/reagent-infos",
    "POST /api/v1/reagent-infos/batch",
    "POST /api/v1/reagent-infos/import",
    "GET /api/v1/reagent-infos/{}",
    "PUT /api/v1/reagent-infos/{}",
    "DELETE /api/v1/reagent-infos/{}",
    "GET /api/v1/reagent-infos/{}/structure-3d",
    "GET /api/v1/reagents",
    "POST /api/v1/reagents",
    "POST /api/v1/reagents/batch",
    "POST /api/v1/reagents/import",
    "GET /api/v1/reagents/{}",
    "PUT /api/v1/reagents/{}",
    "DELETE /api/v1/reagents/{}",
    "GET /api/v1/samples",
    "POST /api/v1/samples",
    "GET /api/v1/samples/{}",
    "PUT /api/v1/samples/{}",
    "DELETE /api/v1/samples/{}",
  ],
  // V1 Backend 资源合同（uuid / parent_uuid 命名的物料与模板 CRUD）；OpenLabSite 读 /inventory/*，写走 /inventory/commands。
  "resource-contract": [
    "GET /api/v1/materials",
    "POST /api/v1/materials",
    "GET /api/v1/materials/{}",
    "PUT /api/v1/materials/{}",
    "DELETE /api/v1/materials/{}",
    "GET /api/v1/materials/graph",
    "GET /api/v1/materials/{}/ledger",
    "GET /api/v1/materials/{}/sites",
    "GET /api/v1/materials/{}/states",
    "POST /api/v1/materials/{}/states",
    "GET /api/v1/materials/{}/states/latest",
    "POST /api/v1/materials/sites/resolve-identities",
    "GET /api/v1/material-models/{}",
    "GET /api/v1/material-shapes",
    "GET /api/v1/material-states/{}",
    "GET /api/v1/sites/{}",
    "GET /api/v1/resource-templates",
    "GET /api/v1/resource-templates/{}",
    "PUT /api/v1/resource-templates/{}",
    "DELETE /api/v1/resource-templates/{}",
    "GET /api/v1/resources",
  ],
  // V1 工站异常处置台（手动处理会话、资源处置、控制命令）；OpenLabSite 的异常面是 /error-decisions + /status-incidents + 干预。
  stations: [
    "GET /api/v1/stations/{}/error-handling",
    "GET /api/v1/stations/{}/events",
    "POST /api/v1/stations/{}/resume",
    "POST /api/v1/stations/{}/errors/{}/decision",
    "GET /api/v1/stations/{}/control-commands/{}",
    "POST /api/v1/stations/{}/control-commands/{}/apply",
    "GET /api/v1/stations/{}/manual-actions/{}",
    "POST /api/v1/stations/{}/manual-actions/{}/review",
    "POST /api/v1/stations/{}/manual-actions/{}/stop",
    "GET /api/v1/stations/{}/manual-action-jobs/{}/review",
    "POST /api/v1/stations/{}/manual-action-jobs/{}/review",
    "GET /api/v1/stations/{}/resource-dispositions",
    "POST /api/v1/stations/{}/resource-dispositions",
    "GET /api/v1/stations/{}/resource-usage",
    "GET /api/v1/stations/{}/sessions/{}",
    "POST /api/v1/stations/{}/sessions/{}/complete",
    "POST /api/v1/stations/{}/sessions/{}/return",
    "GET /api/v1/stations/{}/sessions/{}/inventory",
    "POST /api/v1/stations/{}/sessions/{}/inventory-corrections",
    "POST /api/v1/stations/{}/sessions/{}/manual-actions",
    "GET /api/v1/stations/{}/sessions/{}/devices/{}/actions",
  ],
  // V1 设备视图与旧 Resp 路由；OpenLabSite 的设备目录由 runtime endpoints + 物料根 + 遥测合成。
  "device-views": [
    "GET /api/v1/devices",
    "GET /api/v1/devices/{}/actions",
    "GET /api/v1/devices/{}/actions/{}/schema",
    "GET /api/v1/actions",
    "GET /api/v1/online-devices",
    "GET /api/v1/authoring/device-catalog",
    "POST /api/v1/job/add",
    "GET /api/v1/job/{}/status",
  ],
  // V1 四通道监控 SSE；OpenLabSite 的失效通知只用 /api/v1/events 与 /api/v1/materials/events。
  "monitor-sse": ["GET /api/v1/monitor/events"],
};
const UNADOPTED_OPERATIONS = new Set(Object.values(UNADOPTED_GROUPS).flat());
const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];
const normalize = (path) => path.replace(/\{[^}]+\}/g, "{}");
const meta = openapi.info?.["x-openlab-protocol"];
if (!meta || meta.api_version !== "v1") fail("openapi snapshot is not a contract export (missing info.x-openlab-protocol)");

const exported = new Map();
for (const [path, item] of Object.entries(openapi.paths)) {
  for (const method of HTTP_METHODS) {
    if (item[method]) exported.set(`${method.toUpperCase()} ${normalize(path)}`, { path, role: item[method]["x-openlab-role"] });
  }
}
const catalogKeys = new Set();
for (const operation of OPERATIONS) {
  const key = `${operation.method === "SSE" ? "GET" : operation.method} ${normalize(operation.path)}`;
  catalogKeys.add(key);
  const found = exported.get(key);
  if (!found) fail(`${operation.id} (${key}) is not in the microbackend OpenAPI export — remove it or sync the snapshot`);
  if (found.role !== operation.role) fail(`${operation.id} role ${operation.role} differs from OpenAPI x-openlab-role ${found.role}`);
}
for (const [key] of exported) {
  if (catalogKeys.has(key) || CONTROL_PLANE_OPERATIONS.has(key) || UNADOPTED_OPERATIONS.has(key)) continue;
  fail(`${key} exists in the microbackend but is neither in the browser catalog nor declared as control-plane / unadopted`);
}
for (const key of CONTROL_PLANE_OPERATIONS) {
  if (catalogKeys.has(key)) fail(`${key} is control-plane and must not be in the browser catalog`);
  if (UNADOPTED_OPERATIONS.has(key)) fail(`${key} is declared both control-plane and unadopted`);
  if (!exported.has(key)) fail(`control-plane route ${key} no longer exists in the microbackend — drop it from the list`);
}
for (const key of UNADOPTED_OPERATIONS) {
  if (catalogKeys.has(key)) fail(`${key} is in the browser catalog — drop it from the unadopted list`);
  if (!exported.has(key)) fail(`unadopted route ${key} no longer exists in the microbackend — drop it from the list`);
}

console.log(
  `OpenLab protocol ${OPERATIONS.length} Edge operations across ${REQUIRED_DOMAINS.length} domains, ${SERVER_DATABASE_KEYS.length} UniLabOS server databases; ` +
    `OpenAPI snapshot unilabos ${openapi.info.version}: ${exported.size} operations = ${catalogKeys.size} browser + ` +
    `${CONTROL_PLANE_OPERATIONS.size} control-plane + ${UNADOPTED_OPERATIONS.size} unadopted V1 console: OK`,
);
