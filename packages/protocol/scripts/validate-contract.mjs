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
const ROLES = new Set(["host", "backend", "any"]);

const operationIds = new Set();
const routes = new Map();
for (const operation of OPERATIONS) {
  if (operationIds.has(operation.id)) fail(`duplicate operation id ${operation.id}`);
  operationIds.add(operation.id);
  if (!operation.path.startsWith("/api/v1/")) fail(`${operation.id} must use /api/v1`);
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

if (SERVER_DATABASE_KEYS.join("\0") !== ["runtime", "materials", "telemetry", "history"].join("\0")) {
  fail("server database keys drift from the four-database layout");
}

// ── 与微后端导出的 OpenAPI 契约全集对账（openapi/unilabos-openapi.json） ──
// 目录里的每条操作都必须真的存在、角色一致；OpenAPI 里多出来的操作要么进目录，
// 要么是 Backend ↔ Edge 控制面（浏览器不得调用），必须在下面显式登记，防止路由静默漂移。
const CONTROL_PLANE_OPERATIONS = new Set([
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
  "POST /api/v1/telemetry/events",
  "POST /api/v1/history/events",
  "POST /api/v1/history/events/{}/replacement",
  "POST /api/v1/history/payloads",
  "POST /api/v1/materials/changes/ack",
  "POST /api/v1/materials/reservations",
  "POST /api/v1/materials/reservations/batch",
  "POST /api/v1/materials/reservations/{}/consume",
  "POST /api/v1/materials/reservations/{}/quarantine",
  "POST /api/v1/materials/reservations/{}/release",
  "POST /api/v1/materials/snapshots/apply",
  "POST /api/v1/materials/snapshots/compare",
  "POST /api/v1/resource-templates",
]);
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
for (const [key, found] of exported) {
  if (catalogKeys.has(key) || CONTROL_PLANE_OPERATIONS.has(key)) continue;
  if (key.startsWith("GET ") && !found.path.startsWith("/api/v1/")) continue;
  fail(`${key} exists in the microbackend but is neither in the browser catalog nor declared as control-plane`);
}
for (const key of CONTROL_PLANE_OPERATIONS) {
  if (catalogKeys.has(key)) fail(`${key} is control-plane and must not be in the browser catalog`);
  if (!exported.has(key)) fail(`control-plane route ${key} no longer exists in the microbackend — drop it from the list`);
}

console.log(
  `OpenLab protocol ${OPERATIONS.length} Edge operations across ${REQUIRED_DOMAINS.length} domains, ${SERVER_DATABASE_KEYS.length} UniLabOS server databases; ` +
    `OpenAPI snapshot unilabos ${openapi.info.version}: ${exported.size} operations = ${catalogKeys.size} browser + ${CONTROL_PLANE_OPERATIONS.size} control-plane: OK`,
);
