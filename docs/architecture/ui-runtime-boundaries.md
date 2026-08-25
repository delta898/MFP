# UI Runtime Boundaries

## Purpose
This document captures the current runtime boundaries after the CLI-removal refactor work. The UI/Electron path is the primary product surface, and shared business/runtime logic should live outside `src/main.js` and `src/ui-server.js`.

## Entry Points
- `src/main.js`
  - Node-side UI launcher bootstrap.
  - Starts the web UI server and opens the browser when used outside Electron.
- `src/ui-server.js`
  - UI runtime composition root.
  - Wires shared runtimes, API handlers, and HTTP server lifecycle.
  - Should not keep large business workflows inline.

## Shared Runtime Modules
- `src/naver-auth-flow.js`
  - Single implementation path for interactive Naver login flow.
- `src/runtime-feature-flags.js`
  - Plan/feature flag normalization and limits.
- `src/ui-runtime/session-runtime.js`
  - UI session state, cached auth checks, Google Sheets preflight state.
- `src/ui-runtime/http-utils.js`
  - Generic request/response/static file helpers.
- `src/ui-runtime/http-server-runtime.js`
  - HTTP server lifecycle and request dispatch bootstrap.
- `src/ui-runtime/html-composition-runtime.js`
  - Synchronous, fail-fast composition of the UI shell and feature HTML partials.
  - Rejects missing, escaping, non-HTML, and cyclic include paths before the server listens.
- `src/ui-runtime/css-composition-runtime.js`
  - Synchronous composition of ordered base, layout, component, and feature CSS modules.
- `src/ui-runtime/js-composition-runtime.js`
  - Synchronous, ordered composition of foundation, shell, and feature JavaScript modules.
  - Rejects invalid, escaping, missing, non-JavaScript, and cyclic include paths.
- `src/ui-runtime/text-composition-runtime.js`
  - Shared safe path, extension, missing-file, and cycle enforcement for UI text assets.
- `src/ui-runtime/api-route-runtime.js`
  - API route assembly, handler caching, legacy API bridge wiring.
- `src/ui-api/services/recommendation-center.service.js`
  - Owner-scoped Recommendation listing and explicit open/snooze/dismiss/confirmation interactions.
  - Accepts Recommendation identities only and delegates side-effect resolution to the trusted handoff service.
- `src/ui-api/services/recommendation-refresh.service.js`
  - Composes Memory, operational state, bounded Knowledge, producers and policy evaluation for an on-demand refresh.
  - Coalesces concurrent refreshes and applies a 15-minute process-local TTL; it does not own background scheduling.
- `src/recommendations/delivery/scheduler.js`
  - Starts the same refresh pipeline after HTTP listen and owns periodic timing, persisted next-run state,
    single catch-up, concurrent-run coalescing and provider-failure backoff.
  - It never imports UI modules or reimplements producer/policy decisions.
- `src/ui-runtime/config-file-runtime.js`
  - Config file source resolution, read/write helpers, revision helpers.
- `src/ui-runtime/settings-fields-runtime.js`
  - Major settings field projection, request parsing, runtime config application,
    and shopping image/config persistence policy.
- `src/ui-runtime/automation-policy-runtime.js`
  - Automation schedule, trend/publish option, reuse-history, and shopping policy
    normalization shared by the UI runners.
- `src/ui-runtime/ui-helpers-runtime.js`
  - UI-focused sort/query/activity utilities.
- `src/ui-runtime/quick-publish-runtime.js`
  - Quick publish dedupe cache and preview session state.
- `src/ui-runtime/publish-actions-runtime.js`
  - Quick publish, local markdown publish, multi-platform publish orchestration.
- `src/ui-runtime/content-actions-runtime.js`
  - Blog/shopping row actions, topic/shopping batch operations.
- `src/ui-runtime/trend-actions-runtime.js`
  - Trend collection, trends-to-topics, keywords-to-topics workflows.
- `src/ui-runtime/auto-runner-runtime.js`
  - Long-lived scheduler state and next-run scheduling.
- `src/ui-runtime/auto-cycle-runtime.js`
  - Blog/shopping auto-cycle execution, RSS collection, auto publish orchestration.

## UI-First Boundary
There is no user-facing CLI command surface anymore. Login, license, publishing, and automation flows are expected to run through the app UI.

## Dependency Direction
1. Entry points compose dependencies.
2. Runtime modules encapsulate workflows/state for one concern.
3. Domain/services/utilities remain reusable by both Electron and the web UI runtime.

The desired direction is:

`main/ui-server -> runtime modules -> services/utils/core`

Not:

`services/core -> main/ui-server`

## Recommendation Center Boundary

The Dashboard `뜻밖의 발견` center reads only public content/commerce opportunity DTOs. Operational
guidance candidates remain available to future delivery surfaces but are not rendered as a mostly-empty
Dashboard section. The UI may request an
allowlisted interaction but never receives capability ids, params, policy internals or owner identity.
The three-card discovery batch reserves one backend-selected slot each for Trends, News and confirmed
owner content history. The News slot may come from a stored corpus or bounded query source; the browser
only renders the resulting public hint and does not select providers or rebalance sources. The public
hint distinguishes stored material as `발견 뉴스` and query-based Naver Search material as
`네이버 뉴스` without exposing provider ids or other policy internals.
The UI API derives the installation-local owner, records lifecycle interactions and passes only that
owner plus Recommendation id to `src/recommendations/handoff/service.js`. Presentation targets are
allowlisted again in the browser before navigation. An empty first read may invoke one bounded,
server-side evaluation so the center is usable before proactive scheduling exists. App-start and
background triggers remain outside this surface.

## Practical Rules
- When a UI workflow grows beyond a few helpers, move it into `src/ui-runtime/`.
- Keep `ui/index.html` as the bounded document shell and place feature markup in
  `ui/partials/views/`. Large views such as blog and settings use nested tab
  partials, and every HTML partial is guarded at 500 lines or fewer.
  Composition must finish before browser script execution.
- Keep `ui/styles.css` as the ordered CSS manifest. Add styles to the matching
  `ui/styles/{base,layout,components,features}/` module without reordering existing
  includes; every CSS module is guarded at 900 lines or fewer.
- Keep `ui/app.js` as the ordered classic-script manifest. Place shared bootstrap
  and utilities in `ui/scripts/foundation/`, navigation and view orchestration in
  `ui/scripts/shell/`, and product behavior in `ui/scripts/features/`.
- Do not introduce duplicate top-level function declarations in the composed UI
  script. Keep one `DOMContentLoaded` bootstrap and one action-binding path.
- Keep the remaining legacy action controller below its enforced 2,600-line
  transition boundary; extract new behavior into a focused feature module instead
  of extending that controller.
- When multiple entry paths need the same behavior, extract a shared module before changing one side further.
- `src/ui-server.js` should keep wiring, not full workflow implementations.
- Keep `src/ui-server.js` below the enforced 1,200-line composition-root boundary;
  move new policy or field-mapping behavior into a focused runtime module.
- Shared modules should remain usable even if the launcher or packaging changes again later.
