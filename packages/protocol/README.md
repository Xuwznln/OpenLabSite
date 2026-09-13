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
import { createEdgeApi, ApiError, BackendBusinessError } from "@openlab/protocol";

const api = createEdgeApi("http://127.0.0.1:8002", { timeoutMs: 10_000 });

try {
  const health = await api.health();
  const roots = await api.domains.materialsV1.instances(true);
  const tasks = await api.domains.workflowBackend.tasks({ page: 1, page_size: 20 });
  console.log({ health, roots, tasks });
} catch (error) {
  if (error instanceof BackendBusinessError) {
    console.error("Backend business error", error.message);
  } else if (error instanceof ApiError) {
    console.error("Request failed", error.status, error.message);
  } else {
    throw error;
  }
}
```

The default endpoint is the backend management API on the caller's computer, not the HostLink device port.
Availability depends on the backend build, process role, and runtime state.

### Real-time notifications

The SDK exposes event-stream URLs; the caller manages subscriptions.
Notifications trigger fresh HTTP reads and are not complete business data.

```ts
const events = new EventSource(api.domains.workflowBackend.eventsUrl());
// Subscribe to documented events and refresh the relevant resources.
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
| `system` | Health, logs, networking, and runtime diagnostics |
| `runtimeV1` | Execution endpoints, commands, and job projections |
| `workflowBackend` | Workflows, tasks, node jobs, and execution control |
| `registry` | Device and material type registry |
| `materialsV1` | Materials, sites, inventory, and change ledger |
| `graphsV1` | Device graphs |
| `telemetryV1` / `historyV1` | Telemetry state and history |
| `decisions` | Status alerts and action-error handling |
| `driverPackages` / `deviceProcesses` | Driver packages and managed device processes |
| `labV1` / `debug` | Laboratory layout and read-only database diagnostics |

Use the [API specification](https://github.com/Xuwznln/OpenLabSite/tree/main/docs/protocol)
and bundled OpenAPI snapshot for role, field, and route details.
The operation catalog describes the contract; it does not enforce backend authorization.

## Errors and mutations

| Error | Handling |
| --- | --- |
| `ApiError`, `status = 0` | Check network access, timeouts, and CORS; retain previous data |
| `ApiError`, 404 / 503 | Distinguish a missing resource, unavailable capability, or service not ready using endpoint semantics |
| `ApiError`, 409 / 422 / 5xx | Handle conflicts, validation failures, or server errors; retain the original body for diagnostics |
| `BackendBusinessError` | Handle the business code from the backend envelope; do not treat it as success |

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
