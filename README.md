# OpenLab

在线使用：[OpenLabSite](https://xuwznln.github.io/OpenLabSite/) · [本地启动教程](docs/LOCAL_START.md)

项目署名：[上海交通大学 ReThinkLab](https://thinklab.sjtu.edu.cn/) · [北京中关村学院](https://www.bza.edu.cn/) · [DeepModeling](https://github.com/deepmodeling)

欢迎在 [GitHub](https://github.com/Xuwznln/OpenLabSite) Star、反馈问题与参与贡献。

默认连接本机后端 `http://127.0.0.1:8002`，不默认连接公共演示服务。
旧版保存的公共演示地址会一次性迁移为默认地址；随后仍可手动设置远程后端。

> OpenLabSite 当前仅发布通用版；下文遗留的领域工具及主题说明仅适用于旧仓库
> `archive/domain-editions-20260913`。本版不支持学科切换或 `?theme=`，详见
> [通用版边界](docs/GENERAL_EDITION.md)。物料管理、装配和实验室地图保持可用。

OpenLab is the local-first operations console for the Uni-Lab-OS backend. It gives a
laboratory one static web application for device operation, material tracking, workflow
authoring and execution, live telemetry, audit history and runtime diagnostics.

The browser connects directly to a Uni-Lab-OS management endpoint (default
`http://127.0.0.1:8002`). The backend stays the system of record: OpenLab never reads
databases or requires a cloud control plane.

## Project Status

OpenLab tracks the Uni-Lab-OS backend HTTP API (`unilabos/server/api/`). The wire
protocol (v1, `/api/v1`) is specified in [`docs/protocol/`](./docs/protocol/README.md) —
[`conventions.md`](./docs/protocol/conventions.md) is the normative text — and implemented by
[`@openlab/protocol`](./packages/protocol/README.md), a standalone package published
separately from the web application, validated on its own and smoke-tested against a live
backend.

## Pages

| Area | Page | Backed by |
| --- | --- | --- |
| Overview | 运行总览 | health, runtime endpoints, workflow tasks, telemetry, decisions |
| Workspace | 设备 | runtime.v1 endpoint capabilities + telemetry states; ad-hoc actions via workflow tasks |
|  | 物料 | materials.v1 tree, sites, instantiate / move / transfer / edit / delete, lots, ledger |
|  | 实验室地图 · 装配视图 | materials positions and site occupancy; 2.5D tree drill-down |
|  | 运行监控 | runtime jobs, telemetry, history and materials change streams |
| Workflows | 实验流程 · 编排画布 · 任务排程 | Workflow Authority (definitions, graph, tasks, node jobs, authoring, SSE) |
| Alerts | 异常审批 · 状态告警 | error-decisions, status-incidents, open interventions |
| System | 执行历史 · 注册表 · 驱动包 · 系统诊断 · 数据库浏览 | history.v1, Registry Authority, driver-packages + device-processes (source trees fetched from GitHub into `unilabos_data`, deps via uv, safe restart, supervised local Slave processes), HostLink / scheduler / restart, read-only four-database browser |
| Tools | 领域工具 | molar-mass, DNA/PCR, CIF viewer (frontend-only) |
| System | 实时日志 | Host / managed Slave / remote Slave, bounded HTTP cursor reads, level/search filters, pause/follow/copy/download |

Pages are role-aware: connecting to a `--role backend` scheduling authority shows the
workflow and registry surfaces and clearly marks device/telemetry/decision pages as living on
the Host; connecting to a Host without a local scheduler disables workflow writes.

## Architecture

```text
OpenLab Web (Vue 3 · Pinia · Naive UI)
        │  typed HTTP JSON + two SSE invalidation streams
        ▼
@openlab/protocol  (12 domains · 118 operations · catalog + tests + live smoke · published separately)
        │
        ▼
Uni-Lab-OS backend :8002
  ├─ runtime.db    runtime.v1, Workflow Authority, Registry Authority
  ├─ materials.db  materials.v1, device graphs
  ├─ telemetry.db  latest device state, telemetry events
  └─ history.db    payloads, append-only history stream
```

Repository structure:

```text
.
├── packages/protocol/       @openlab/protocol: framework-agnostic client, catalog, tests, live smoke (npm package)
├── docs/protocol/           protocol specification: conventions (normative) + per-domain contracts
├── src/stores/              connection, devices, scheduler, decisions, entity cache
├── src/views/               operational surfaces
├── src/components/          shared UI components
├── src/features/            pure-function helpers (param forms, dry run, variables)
├── src/vibe-cases/          reference domain workbench for AI-assisted customization
└── .github/workflows/       protocol gate + Pages deployment
```

See [Architecture](./docs/ARCHITECTURE.md) and the [protocol overview](./docs/protocol/README.md).

## Requirements

- Node.js 22 or later
- pnpm 10.30.3 (declared in `packageManager`)
- a reachable Uni-Lab-OS backend (`unilab -g graph.json` or `unilab --role backend`)

## Development

```bash
pnpm install --frozen-lockfile
pnpm run dev            # http://localhost:5180, talks directly to http://127.0.0.1:8002 (no proxy by default)
```

Validation:

```bash
pnpm run protocol:check   # standalone protocol compile + catalog validation
pnpm run protocol:test    # client ↔ catalog parity, envelopes, idempotency
pnpm run app:test         # frontend pure-function unit tests
pnpm run app:build        # vue-tsc + production bundle
pnpm run build            # complete release gate
pnpm --filter @openlab/protocol smoke -- http://127.0.0.1:8002 --write   # live smoke against a running Host
```

## Connecting

The "backend address" is simply the management port of a `unilab` process
(`unilab --port 8002`, default `8002`). It is editable in the top-right connection popover and
stored in browser local storage. You only need to touch it to reach a *different* process:

- another Host (`http://<host>:8002`) — devices, materials, telemetry, decisions, and (with
  local scheduling) the Workflow Authority;
- a `unilab --role backend` process — scheduling authority with Workflow and Registry
  Authority but no device execution surface.

Where the address comes from by default:

| How the page is served | Default address | Why |
| --- | --- | --- |
| `pnpm run dev` (`localhost:5180`) | `http://127.0.0.1:8002` | direct connection; the backend allows CORS |
| `pnpm run dev` with `OPENLAB_EDGE_PROXY_TARGET` set | the page itself | opt-in: Vite proxies `/api` to a backend the browser cannot reach directly (remote tunnel, HTTPS mixed content) |
| GitHub Pages / any static host | `http://127.0.0.1:8002` | the UI is remote, the process is local |
| Behind a reverse proxy that serves both the site and `/api` | the page itself | detected on first visit via `GET /api/v1/health` on the page origin |

Set a different build-time default with `VITE_DEFAULT_EDGE_URL` (see `.env.example`).

### HTTPS page, `http://` backend

The hosted site is served over HTTPS while `unilab` speaks plain HTTP. Browsers apply their
mixed-content rules:

- `http://127.0.0.1` / `localhost` is a "potentially trustworthy origin" — Chrome, Edge and Firefox
  allow the request; Safari blocks it.
- `http://192.168.x.x` (any LAN address) is blocked by default. The connection popover detects
  this and shows the fixes inline: allow "Insecure content" for the site in the browser's site
  settings (one-time), forward the remote port to `127.0.0.1` with `netsh interface portproxy`
  on Windows, open the site over `http://`, or reverse-proxy `/api` on the same origin.

The backend answers Chrome's Private Network Access preflight
(`Access-Control-Allow-Private-Network: true`), so once the browser lets the request through,
nothing else needs to be configured.

### Driver package index

The "驱动包" page lists installable device driver packages from
[awesome-lab-devices](https://github.com/Xuwznln/awesome-lab-devices) (`index.json`, read directly
by the browser) and sends the chosen `spec` (a GitHub repository URL) to the connected backend,
which downloads the source tree into `unilabos_data/driver_packages/`, mounts it like `--devices`, and
pre-installs its `pyproject` dependencies with `uv` (no `pip install` of the package itself). Override
the index with `VITE_OPENLAB_DEVICE_INDEX_URL` at build time or
temporarily in the page (intranet mirror / fork). Lab-private packages can be listed on the Edge side
in `unilabos_data/driver_package_catalog.json` using the same JSON shape.

### Site index

The "站点" catalog next to the domain switcher lists front-end sites from
[awesome-lab-sites](https://github.com/Xuwznln/awesome-lab-sites) (`index.json`, read directly by
the browser): the general OpenLab site, per-domain entry points (`?theme=organic|biology|materials`
on the same deployment, applied at startup), and community forks. Override the index with
`VITE_OPENLAB_SITE_INDEX_URL` at build time. The `unilab` backend landing page reads the same
index for its "推荐前端" cards.

## Deployment

Static Vite build with hash routing and relative base path. The backend does not host
the UI. GitHub Actions checks the protocol and application, builds `dist/` (not committed),
and deploys an artifact directly to this repository's GitHub Pages:
[OpenLabSite](https://xuwznln.github.io/OpenLabSite/).
Set Settings → Pages → Source to **GitHub Actions**. No deploy key or cross-repository push
is used. Pull requests only validate; deployment runs on `main`.
Operators connect to their own backend (default `http://127.0.0.1:8002`).

## AI-assisted Domain Adaptation

Domain workbenches are implemented by modifying Vue source code rather than loading runtime
plugins. Read [AGENTS.md](./AGENTS.md), the [Vibe guide](./docs/VIBE_GUIDE.md) and the
[reference case](./src/vibe-cases/README.md). When a capability is missing, the UI should
provide a clear degraded state and propose a protocol change; it must not invent an
undocumented endpoint.

## Security

- OpenLab does not proxy traffic through a project-operated cloud service.
- Do not commit credentials, laboratory data, or database files.
- Production deployments should restrict backend CORS origins and bind the management API
  to trusted interfaces.
- Material writes use the materials.v1 idempotency envelope; workflow graph writes use
  revision optimistic locking.

## Contributing

Protocol changes require synchronized updates to `packages/protocol/` (types, catalog,
tests), `docs/protocol/`, the backend implementation, and affected views — the checklist
is [`conventions.md §11`](./docs/protocol/conventions.md#11-契约治理新增或修改一个端点). Run
`pnpm run build` before submitting changes.

## Releasing

- **Web application**: `pnpm run build` produces `dist/` for static hosting (GitHub Pages workflow
  in `.github/workflows/`). The site fetches the driver package index from
  [awesome-lab-devices](https://github.com/Xuwznln/awesome-lab-devices) and the site index from
  [awesome-lab-sites](https://github.com/Xuwznln/awesome-lab-sites) at runtime.
- **`@openlab/protocol`**: bump `version` in `packages/protocol/package.json` and
  `OPENLAB_PROTOCOL_VERSION` in `packages/protocol/src/common.ts` (a test keeps them equal), add a
  [CHANGELOG](./packages/protocol/CHANGELOG.md) entry with the minimum compatible unilabos version,
  then `pnpm --filter @openlab/protocol publish` (`prepack` runs the contract check and tests). The
  application keeps consuming it through `workspace:*`.
