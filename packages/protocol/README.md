<div align="center">

**English** | [简体中文](README.zh-CN.md)

<img src="https://raw.githubusercontent.com/Xuwznln/OpenLabSite/main/public/brands/openlab.svg" alt="OpenLab" width="64" />

# OpenLab TypeScript SDK

A typed API client for the Uni-Lab-OS backend

`@openlab/protocol` · TypeScript · ESM · Node.js 22+ · Apache-2.0

[Project](https://github.com/Xuwznln/OpenLabSite) · [API specification](https://github.com/Xuwznln/OpenLabSite/tree/main/docs/protocol) · [Changelog](CHANGELOG.md) · [Issues](https://github.com/Xuwznln/OpenLabSite/issues)

</div>

---

## Overview

This framework-independent SDK provides backend API clients, request and response types, normalized errors,
a machine-readable operation catalog, and an OpenAPI snapshot. It supports browser applications, Node.js tools,
and automated tests without depending on Vue or application state management.

The package name remains `@openlab/protocol`, and the existing `createEdgeApi` entry point is preserved.
It accesses backend APIs; it does not execute device drivers, schedule workflows, or access databases directly.
Version 3.x targets the Uni-Lab-OS V1.0 API contract (the unified 0.13 line): V1 response envelopes, no
authentication on the management API, and `POST /api/v1/inventory/commands` as the single material write entry point.

## Installation and requirements

- Node.js 22+; browser consumers need ESM support and appropriate CORS/network access.
- The only runtime dependency is `axios`.
- ESM, TypeScript declarations, declaration maps, and source maps are provided. There is no CommonJS entry point.

### In this workspace

The application consumes the SDK through `workspace:*`:

```bash
pnpm install --frozen-lockfile
pnpm --filter @openlab/protocol build
```

### Install a source-built package

If an npm release is not available, build a tarball from this repository:

```bash
pnpm --dir packages/protocol pack --pack-destination ../../artifacts
# From your consumer project, use the actual filename produced above:
npm install /path/to/openlab-protocol-<version>.tgz
```

The `prepack` hook runs contract checks and tests.
After a release is published, install an available version with `npm install @openlab/protocol@<version>`.
A version in the source tree does not by itself mean that version is published on npm.

## Quick start

```ts
import { createEdgeApi, ApiError, BackendBusinessError, isCapabilityUnavailable } from "@openlab/protocol";

const api = createEdgeApi("http://127.0.0.1:8002", { timeoutMs: 10_000 });

try {
  const health = await api.health();
  const roots = await api.domains.inventory.instances({ rootsOnly: true });
  const tasks = await api.domains.workflowBackend.tasks({ page: 1, page_size: 20 });
  console.log({ health, roots, tasks });
} catch (error) {
  if (isCapabilityUnavailable(error)) {
    console.warn("Not provided by this process, or the Host is restarting", error);
  } else if (error instanceof BackendBusinessError) {
    console.error("Backend business error", error.code, error.symbol, error.message);
  } else if (error instanceof ApiError) {
    console.error("Request failed", error.status, error.message);
  } else {
    throw error;
  }
}
```

Every `/api/v1` JSON route returns a V1 envelope (`{ code, data }` / `{ code, error: { msg, code?, details? } }`);
the transport unwraps it, so client methods resolve to `data`. A non-zero `code` rejects with `BackendBusinessError`
(also on HTTP 200). Every JSON route is an envelope, including `/health`, `/readiness`, `POST /inventory/commands`
(a rejection is a failure envelope with `error.details.command_id`) and the process-management routes under `/v1/*`;
only event streams and file downloads are not.

The default endpoint is the backend management API on the caller's computer, not the HostLink device port.
Availability depends on the backend build, process role, and runtime state.

### No authentication

The management API is not authenticated: the core removed the control token (`X-UniLab-Token`, `unilab token`)
and the V1 station API key, so requests carry no credentials and there is no "unauthorized" business code.
Restrict access at the network boundary (lab LAN, reverse proxy).

### Host restarts (business code 5001)

While the Host child process starts or restarts, Host-owned routes return HTTP 200 + code 5001 + `Retry-After`.
GET requests are retried with a bounded backoff (default: 2 retries, at most 3 s each; 1 s when the browser
cannot read `Retry-After` cross-origin). Writes are never retried automatically.

```ts
const api = createEdgeApi(url, { unavailableRetry: { retries: 4, delayMs: 1_000, maxDelayMs: 3_000 } });
const noRetry = createEdgeApi(url, { unavailableRetry: false });
```

### Material writes

All material mutations go through `POST /api/v1/inventory/commands`. The `inventory` client builds the
`materials.v1` idempotency envelope with every typed field filled in and returns the `MutationResult`;
a rejected command throws `InventoryCommandRejectedError` (a `BackendBusinessError` with the business code
and `error_code` as `symbol`).

```ts
const tree = await api.domains.inventory.instantiate("demo_tips_24", "tips_01");
await api.domains.inventory.patch(tree.data.root_material_uuid, { barcode: "BC-1" });
await api.domains.inventory.typedCommand("material.move", { edge_uuid: "…", parent_uuid: "…" });
```

### Real-time notifications

The SDK exposes event-stream URLs; the caller manages subscriptions.
Notifications trigger fresh HTTP reads and are not complete business data.

```ts
import { WORKFLOW_EVENT_NAMES } from "@openlab/protocol";

const events = new EventSource(api.domains.workflowBackend.eventsUrl());
// workflow.runtime.changed / workflow.authoring.changed / station.error_handling.changed / stream.reset
for (const name of WORKFLOW_EVENT_NAMES) events.addEventListener(name, () => refresh());
// Close the stream when the view unmounts or its connection changes:
events.close();
```

Node.js consumers should supply their own compatible SSE client when needed.

## Public exports

| Entry point | Contents |
| --- | --- |
| `@openlab/protocol` | Clients, types, error classes, and public helpers |
| `@openlab/protocol/catalog` | Operation catalog and lookup helpers |
| `@openlab/protocol/openapi` | Generated OpenAPI types |
| `@openlab/protocol/openapi.json` | Backend-exported OpenAPI snapshot |
| `@openlab/protocol/package.json` | Package metadata |

Do not import internal `dist/` paths.

```ts
import { operationsOf, findOperation } from "@openlab/protocol/catalog";
import type { OpenApiPaths, OpenApiComponents } from "@openlab/protocol";

const operations = operationsOf("driver-packages");
const createTask = findOperation("workflow.task.create");
type HealthOperation = OpenApiPaths["/api/v1/health"]["get"];
type InstallRequest = OpenApiComponents["schemas"]["DriverPackageInstallRequest"];
```

## API domains

| `api.domains.*` | Purpose |
| --- | --- |
| `system` | Health, readiness, logs, networking, restart/reset, and runtime diagnostics |
| `runtimeV1` | Execution endpoints, commands, and job projections |
| `workflowBackend` | Workflows, graphs, incremental editing, tasks, task commands, interventions, and authoring |
| `runHistory` / `scheduler` | V1 run history; monitor snapshot, timeline, drain, and recovery |
| `registry` | Device and material type registry |
| `inventory` | V1 inventory reads (`/inventory/*`) and all material writes (`/inventory/commands`) |
| `materialsV1` | Remaining dev routes: material trees, registry classes, topology links, device notification, executions |
| `graphsV1` / `chemicalsV1` | Device graphs; chemical definitions |
| `telemetryV1` / `deviceState` / `historyV1` | Telemetry, V1 device-state views, and Host history (`/edge/history`) |
| `decisions` | Status alerts and action-error decisions |
| `driverPackages` / `deviceProcesses` | Driver packages and managed device processes |
| `labV1` / `processManagement` / `debug` | Lab profile and layout grid; V1 process management (`/v1/*`); read-only database diagnostics |

Use the [API specification](https://github.com/Xuwznln/OpenLabSite/tree/main/docs/protocol)
and bundled OpenAPI snapshot for role, field, and route details.
The operation catalog describes the contract; it does not enforce backend authorization.

## Errors and mutations

| Error | Handling |
| --- | --- |
| `ApiError`, `status = 0` | Check network access, timeouts, and CORS; retain previous data |
| `ApiError`, 404 / 503 | Route not mounted in this process, or the reset maintenance gate; treat as unavailable |
| `BackendBusinessError` | Business failure from the V1 envelope (`code`, `symbol`, `details`; `isNotFound`, `isConflict`, `isInvalidInput`, `isUnavailable`); do not treat it as success |
| `InventoryCommandRejectedError` / `TaskCommandRejectedError` | A rejected inventory command or task command (`status: "rejected"`) |

Use `isCapabilityUnavailable(error)` to show a degraded state for 404 / 503 / code 5001.
Material mutations use idempotency envelopes, and workflow mutations may require revision checks.
Do not blindly retry writes or regenerate idempotency keys. Follow the relevant endpoint's recovery rules.
Poll long-running operations with a delay and deadline, handling every terminal state rather than busy-waiting.

## Versioning and compatibility

The SDK follows SemVer; the HTTP API version in `/api/v1` is independent.
Tests ensure `OPENLAB_PROTOCOL_VERSION` matches the package version.

Compatibility depends on both the `unilabos` version and whether a particular build includes the required endpoints.
See [CHANGELOG.md](CHANGELOG.md) for version/build requirements and explicitly degrade unsupported features.

## Maintenance and releases

```bash
pnpm --filter @openlab/protocol check
pnpm --filter @openlab/protocol test
pnpm --filter @openlab/protocol build
```

Contract changes require synchronized backend, snapshot, generated-type, catalog, and test changes,
plus live smoke tests against an isolated backend.
Documentation and metadata updates should not regenerate or alter the API contract.

Before releasing:

1. Update the version constant, package version, and changelog with compatibility requirements.
2. Pass contract and application checks; inspect tarball exports, types, documentation, and license.
3. Verify npm scope permissions, the target version, and publisher identity.
4. Publish from trusted CI supporting npm provenance. Local packaging does not publish anything.
5. Verify an installation from npm. Never put access tokens in source files or documentation.

These instructions do not configure or trigger an npm release automatically.

## License

[Apache License 2.0](LICENSE). The backend, device drivers, and third-party marks retain their own licenses.
