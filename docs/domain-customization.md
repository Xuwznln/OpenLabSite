# Domain customization

OpenLab keeps laboratory-specific presentation separate from the Edge protocol. The organic,
biology, and materials workbenches share the same Workflow Authority and the same
`runtime.db` / `materials.db` / `telemetry.db` / `history.db` boundary. Switching a theme never
changes endpoint paths, database ownership, or device execution semantics.

## What a domain theme can change

- navigation labels, page titles, copy, accent color, and summary content;
- a local professional tool shown at `#/toolkit`;
- workflow print-sheet labels and the scanner operator experience;
- reference components maintained in a downstream fork.

The current examples are:

| Theme | Tool | Browser data behavior |
| --- | --- | --- |
| Organic synthesis | Chemical formula parser, molar mass, g-to-mmol conversion | Local calculation only |
| Life science | DNA sequence QC, reverse complement, translation, PCR Master Mix | Local calculation only |
| Materials research | CIF parser and projected crystal-cell preview | Local file/text parsing only |

Theme metadata lives in `src/features/domain-themes.ts`. Each tool is an ordinary Vue component,
so a laboratory can review, test, fork, and replace it without a proprietary runtime plugin.
Pure calculations live in `src/features/` and have Vitest coverage.

## Default theme and distribution model

A first visit (no `openlab:domain-theme` in localStorage) always lands on the **general** theme
(`DEFAULT_LAB_THEME_ID`). The organic / biology / materials themes are reference examples and
are never preselected for the user.

The intended distribution model mirrors driver packages: the site ships with the general theme,
and domain-specific site bundles are published through a separate index repository
(`awesome-lab-sites`, alongside [awesome-lab-devices](https://github.com/Xuwznln/awesome-lab-devices))
that the browser reads directly, in the same way `src/features/device-index.ts` reads
`index.json` today.

## Scanner-gun recording

The global shell recognizes a keyboard-wedge scan outside text fields and opens the scanner
drawer. A scan queries the canonical `GET /api/v1/materials/instances` projection and matches the
aggregate's `material.barcode`. Every event is also kept in a browser-local, 100-row operator
ledger that can be exported as CSV. This ledger is deliberately not a material mutation: OpenLab
does not invent a write endpoint or bypass command UUID, effect-key, and aggregate-version rules.

## Provisioning demo materials

There is no browser-side "reset library" operation. Demo devices and labware come from the
device graph a Host starts with (`unilab -g graph.json`) and from the materials authority:
the 物料 page can instantiate labware by registry class (`POST /api/v1/materials/instantiate`),
move it onto a device site, and delete it, all through the materials.v1 idempotency envelope.
The Uni-Lab-OS demo repositories (site / workstation / LAN / exception demos) provide
reproducible graphs and `@workflow` templates that appear in the workflow list at startup.

## Experiment-sheet printing

The create-and-print action opens a print target before the asynchronous request to avoid popup
blocking, but fills it only after `POST /api/v1/workflow-tasks` returns successfully. The sheet
therefore contains the real Workflow and Task UUIDs. Failed task creation closes the pending
window. Existing tasks and local editor drafts can be printed separately; a draft is visibly
marked as not submitted.

## Adding another domain

1. Add a typed entry to `LAB_THEME_IDS` and `LAB_THEMES`.
2. Add a pure calculation/parser module plus tests when the domain needs a local tool.
3. Add the corresponding Vue component to `DomainToolkitView.vue`.
4. Keep protocol and database contracts unchanged unless the capability truly requires a new
   Edge operation; in that case, propose and validate the protocol change first.
5. Run `pnpm run app:test`, `pnpm run protocol:check`, and `pnpm run build`.
