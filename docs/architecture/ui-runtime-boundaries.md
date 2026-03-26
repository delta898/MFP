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
- `src/ui-runtime/api-route-runtime.js`
  - API route assembly, handler caching, legacy API bridge wiring.
- `src/ui-runtime/config-file-runtime.js`
  - Config file source resolution, read/write helpers, revision helpers.
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

## Practical Rules
- When a UI workflow grows beyond a few helpers, move it into `src/ui-runtime/`.
- When multiple entry paths need the same behavior, extract a shared module before changing one side further.
- `src/ui-server.js` should keep wiring, not full workflow implementations.
- Shared modules should remain usable even if the launcher or packaging changes again later.
