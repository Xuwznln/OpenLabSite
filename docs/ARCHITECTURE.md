# OpenLab Architecture

## Design Goals

OpenLab separates laboratory presentation from Edge execution while keeping the Uni-Lab-OS
microbackend authoritative. The repository has two independently buildable deliverables:

1. `@openlab/protocol` — framework-agnostic wire contracts and the typed HTTP client;
2. OpenLab Web — the Vue application consuming that package.

## Dependency Direction

```text
views / components
      ↓
stores  (connection · devices · scheduler · decisions · entity-cache · lab · pinned-metrics)
      ↓
@openlab/protocol
      └─ createEdgeApi(baseUrl).domains.{system, runtimeV1, workflowBackend, registry,
                                        materialsV1, graphsV1, telemetryV1, historyV1,
                                        decisions, driverPackages, deviceProcesses, debug}
```

Dependencies never point upward. The protocol package cannot import Vue, stores, UI
components, Python code, or SQLite files.

## Runtime Boundaries

### Web application

- owns interaction design, visualization, local drafts, variable sheets, user preferences,
  and the merged device catalog (`stores/devices.ts`);
- composes documented protocol operations only;
- never redefines state machines, IDs, timestamps, or event names;
- degrades explicitly when the connected process lacks a capability (role-aware pages);
- keeps purely human annotations that the microbackend has no API for in the browser
  only, scoped by microbackend address and exportable as JSON: the lab layout
  (zones / walls, `features/lab-layout.ts`), editor drafts, manual-confirm assignees.
  Device positions are never stored locally — they come from materials.v1.

Per-attempt execution data is read from the Workflow Authority (tasks + node jobs,
`features/task-jobs.ts` resolves device/action from the frozen task snapshot); the
runtime.v1 `execution_job` projection is empty under local scheduling and only appears
in the diagnostics page.

### Protocol package

- owns request/response types, client behaviour, endpoint catalog (`catalog.ts`) and the
  Backend-envelope / materials.v1 mutation helpers;
- implements the wire specification in `docs/protocol/conventions.md`; the package README
  documents usage, boundaries and the release procedure;
- compiles with standalone `tsc`; `validate-contract.mjs` checks catalog integrity, role
  annotations and forbids control-plane routes; vitest checks client ↔ catalog parity and
  that `OPENLAB_PROTOCOL_VERSION` equals the package version;
- `scripts/live-smoke.mjs` exercises every browser read path and the key write flows
  against a running microbackend;
- is published to npm on its own semver line (`@openlab/protocol`); the web application
  consumes it through the workspace link and never imports `dist/` internals.

### Uni-Lab-OS microbackend

- owns scheduling, device/material locks, material transactions, device execution,
  persistence and audit across four SQLite databases (`runtime`, `materials`, `telemetry`,
  `history`);
- runs either as a Host (devices + optional local Workflow Authority) or as a standalone
  scheduling authority (`--role backend`, adds Registry Authority);
- on a Host, also manages device drivers: `driver-packages` fetches driver source trees (GitHub
  repository, archive URL or local directory) into `unilabos_data/driver_packages/`, pre-installs
  their `pyproject` dependencies with `uv`, and mounts the trees like `--devices` on the next (safe)
  restart — the package itself is never `pip install`ed;
  `device-processes` runs configured devices as supervised local Slave child processes
  (crash isolation, backoff restarts, per-process logs) that join the Host over HostLink
  (`docs/protocol/driver-packages.md`). The list of *what* can be installed is not the
  microbackend's: the browser reads the `awesome-lab-devices` index directly
  (`features/device-index.ts`) and only hands the chosen `spec` to the Edge;
- exposes the HTTP API described in `docs/protocol/`; OpenLab cannot depend on anything not
  in that contract without extending the protocol first.

## Real-time model

HTTP is the only source of truth. Two SSE streams (`/api/v1/events`,
`/api/v1/materials/events`) carry invalidation notices; stores re-read HTTP on each notice
and on a slow poll. Reconnection needs no replay: runtime jobs, telemetry latest state,
history events and materials aggregates are all durable projections.

## Build Graph

```text
protocol:check   tsc → catalog validation
protocol:test    client ↔ catalog parity, envelopes, idempotency envelope
app:test         pure-function unit tests (src/**/*.test.ts)
app:build        vue-tsc -b → vite build
build            protocol:check → protocol:test → app:build
```

GitHub Actions runs the protocol gate as a separate job before the web build and Pages deploy.

## Change Policy

- UI-only change: `app:build`.
- Protocol-compatible client refactor: protocol and app builds.
- Wire/schema/state-machine change: protocol code + `docs/protocol` + microbackend
  implementation/tests + app build. Add the route to `catalog.ts` with its `role`, and cover
  the client method in `packages/protocol/tests`.
