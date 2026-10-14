# Shared Plugin Host and Discovery

- Branch: `codex/feat/shared-plugin-host-discovery`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Base commit: `0ecfed96edc7d7ef158012c0372bce182ad02884`
- Status: Complete; fast-forward merged into the parent branch at `9afecd07`.

## User need and goal

The plugin architecture needs a shared Host whose live plugin inventory and operation metadata can be queried. The user approved a simple Settings discovery view focused on showing real metadata and runtime state, without exposing Application-to-Plugin relationships.

## Scope under discussion

- Trace current Host construction and lifetime, plugin catalog/composition, and app API/UI boundaries.
- Keep bundled plugin metadata distinct from live Host state and expose a secret-free joined query contract.
- Add a read-only Settings Beta plugin inventory and details view.
- Add focused registry/runtime/API/UI contract coverage and update architecture documentation.

## Explicit non-goals until separately agreed

- No implementation before the user approves the design.
- No plugin enable/disable UI or mutation endpoints unless added to the agreed scope.
- No plugin installation/removal, package download, community plugin execution, or Telegram/MCP routing.
- No migration of existing publishing or content-generation product flows into the new Host.
- No merge into `dev`; this sub-feature's parent is the architecture foundation FBR.

## Design questions

1. ~~Does one app-level Host own all instantiated plugins, or does a runtime coordinator own Hosts per Application?~~ Resolved: one process-wide shared Host manages runtime Plugin instances for multiple Applications.
2. Which data is catalog metadata (bundled/available) and which is runtime state (composed/enabled/operations)?
3. What minimal, secret-free query contract should the Host expose?
4. Where should a user-facing read-only list and detail view live, if included in this stage?
5. What lifecycle and failure behavior should discovery report when a plugin is unavailable, disabled, or still executing?

## Initial investigation findings

- `src/platform/plugin-host.js` is an in-memory per-instance runtime Host. It knows only successfully registered descriptors and exposes `listPlugins()` (id/name/version/runtime state/active execution count), `listOperations()` (enabled plugins only), `execute()`, and `setEnabled()`.
- `src/composition/core-plugin-registry.js` is a bundled factory catalog. Its current public `list()` returns IDs only; metadata and operation descriptions live on instantiated Plugin descriptors, not catalog entries.
- `src/composition/plugin-runtime-composition.js` instantiates only IDs explicitly selected by each composition root.
- `src/composition/wordpress-publishing.js` and `src/composition/generated-wordpress-publishing.js` each create their own Host. They are isolated pilot systems and are not wired into product UI/API. Therefore no process-wide live Host or product-visible Plugin inventory exists yet.
- `src/ui-server.js` creates one `createUiApiRouteRuntime()` for the running UI server. That runtime lazily creates route handlers/services; Settings Beta is served through `src/ui-api/routes/settings.routes.js` and `src/ui-api/services/settings.service.js`. This is a plausible process-lifetime integration seam, but the new Plugin Host should not be placed inside Settings service ownership.
- Current Core Plugin descriptors expose `id`, `name`, `version`, and operation IDs/descriptions. They do not yet declare a user-facing summary, category, dependency/readiness metadata, or explicit lifecycle source.

## Agreed design

1. Keep three concepts distinct:
   - **Bundled catalog**: all Core Plugins shipped with BlogGenius and static, safe metadata.
   - **Shared runtime manager/Host**: one app-process owner for instantiated Plugin runtimes and their lifecycle/operations.
   - **Application composition**: selects the Plugin IDs required by a use case and dispatches through the shared runtime manager; it does not create private Hosts per workflow.
2. The Plugin catalog is the source for identity, package version, summary, and declared operations. Runtime state comes only from the Host. Query results join them without exposing injected dependencies or credentials.
3. Discovery is read-only: it shows bundled, loaded, enabled/disabled/transitioning, active execution count, and operation names/descriptions. No enable/disable or install/remove controls.
4. Add a top-level Settings “플러그인” tab with a “Core” sub-tab. Community Plugins remain hidden. The pilot prioritizes useful information over visual polish.
5. Do not show Application-to-Plugin relationships; those are internal composition details.
6. Distinguish “bundled” from “currently loaded”. “Not loaded” is informational, not an error. Readiness/credential checks and third-party calls are out of scope.

Tradeoff: a single process Host enables consistent inventory and lifecycle control, but requires composition to register/load Plugins into that Host safely and preserve “instantiate only what an Application needs.” A facade over private per-Application Hosts is a smaller transition, but global enablement and cross-Application discovery would be ambiguous and fragmented.

## Decisions

- Use one process-wide shared Plugin Host for Plugins used by multiple Applications. Application composition still selects the needed Plugins; it dispatches through the shared Host rather than constructing private Hosts.
- Add a read-only Core Plugin inventory/detail view under a top-level Settings “플러그인” tab; keep community category hidden.
- Never expose Application-to-Plugin relationships in the UI.
- Existing product publication flows are not yet migrated into the new architecture. The Settings view can therefore show bundled Plugins as `not_loaded`; it must explain that status without suggesting a failure.

## Progress and verification

- Created the sub-feature from the current parent FBR tip.
- Preserved an existing uncommitted change in the parent plan document; it is unrelated working-tree state and must not be silently included in this sub-feature's commit.
- Added static Core Plugin metadata to the explicit catalog and joined it with runtime Host state through `src/composition/core-plugin-runtime.js`.
- Added `GET /api/v1/plugins/core` and `GET /api/v1/plugins/core/:id` read-only endpoints; unknown plugin IDs return 404 and non-GET methods return 405.
- Allowed Application composition roots to receive the same runtime, so they share a single Host and avoid duplicate Plugin registration. Default composition remains convenient for isolated pilots.
- Added Settings Beta “플러그인” → “Core” inventory/details UI, including loading, error, refresh, and not-loaded states. No application mapping, secret/dependency detail, community tab, or mutation controls are exposed.
- Updated the platform architecture document to describe the shared runtime and current integration boundary.
- Focused runtime/registry/Application/API/UI-contract tests passed: 36 passed, 0 failed. UI browser smoke remains to be run.

## Final result

- Implemented read-only shared Core Plugin discovery and documented its current host integration boundary. Focused verification and browser smoke passed; merged into `codex/fbr/plugin-architecture-foundation` with commit `9afecd07`.
