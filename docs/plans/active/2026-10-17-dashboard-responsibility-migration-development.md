# Dashboard Responsibility Migration

## Branch

- Branch: `codex/fbr/dashboard-responsibility-migration`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: Verified; ready for parent merge

## User Need and Goal

The Dashboard should follow the established directory architecture. It is an application screen that composes existing capabilities, not a separately distributable Plugin. Move each responsibility to its proper layer, keep the UI as an adapter, and remove superseded legacy paths after callers are migrated.

## Scope

- Trace the Dashboard UI, read APIs, application/service composition, activity history, and all callers.
- Assign each responsibility to an existing architectural layer and document any needed boundary decision.
- Relocate Dashboard-owned code by responsibility, update imports/tests/docs, and remove obsolete paths.
- Remove the unconsumed dashboard activity recorder/store and all write-only call sites; preserve any existing activity JSON files on disk.
- Preserve existing Dashboard behavior and API/data contracts unless a boundary correction requires a separately agreed change.

## Explicit Non-goals

- Do not package Dashboard as a Plugin.
- Do not redesign Dashboard UX or change its data semantics.
- Do not move unrelated features merely because their names or APIs contain “dashboard”.
- Do not alter persistence formats or migrate user data as part of this structure change.
- Do not delete existing `dashboard-activities.json` user data.
- Do not push, release, or merge into the parent without user authorization.

## Initial Inventory

- Dashboard presentation is in `ui/partials/views/dashboard-beta.html`, `ui/scripts/features/dashboard/dashboard-beta.js`, and `ui/styles/features/dashboard-beta*.css`.
- Dashboard-specific Blog read models were initially under `src/dashboard/`; they are now located in `src/applications/blog/dashboard/`.
- A write-only activity recorder previously persisted events through `src/activity/dashboard-activity-store.js`; it was not consumed by Dashboard or Agent Memory.
- HTTP endpoints are spread across the system and continuous-publishing UI API services/controllers/routes.
- Ownership and composition boundaries require caller-level tracing before files are moved.

## Proposed Work Stages

1. Trace current runtime flows, import graph, state ownership, and test/documentation references.
2. Decide and record ownership for Dashboard composition/read models, activity history, HTTP presentation, and static UI assets.
3. Move Blog-only Dashboard read models under the Blog Application and move Dashboard browser logic out of the shell-feature directory; preserve view, styling, and API contracts. (Completed.)
4. Remove the unused write-only activity recorder, its storage module and call sites, and tests. Do not remove existing persisted activity JSON files. (Completed.)
5. Remove superseded source paths and update architecture docs and this record.
6. Run focused tests and the agreed broader validation; note any manual UI verification still needed.

## Decisions and Tradeoffs

- Dashboard is a product-level overview that composes capabilities; it is not a Plugin boundary.
- Avoid moving feature-owned APIs or state into a Dashboard module just because Dashboard reads them.
- Keep presentation at the UI adapter boundary and keep capability state with its owning feature.
- Blog read-model DTO projections belong to the Blog Application. Dashboard browser behavior belongs to `ui/scripts/features/dashboard/`; markup/styles stay in `ui/partials/views/` and `ui/styles/features/`. Feature APIs and their source state remain with their owning feature.
- 2026-10-17: User confirmed removal of the write-only activity recording system and all call sites. Preserve existing activity JSON files; no active code reads them.

## Progress

- 2026-10-17: Created this branch from `codex/fbr/plugin-architecture-foundation` with a clean working tree.
- Initial search found Dashboard presentation assets, two Dashboard read-model modules, a cross-capability activity store, and separate system/continuous-publishing read APIs. Full call-flow inventory is pending.
- Full flow trace: Dashboard Beta renders readiness, Blog operations, and Blog result statistics from separate feature-owned endpoints; it has no activity-feed reader. The Blog read-model helpers were only used by continuous-publishing read endpoints. Dashboard markup and CSS already live in UI presentation directories; the browser controller has been moved from `features/shell/` to `features/dashboard/`.
- `listRecentDashboardActivities()` had no call sites. The old archived activity-feed plan proposed an API and UI card, neither of which exists. The recorder writes only to its rolling JSON file and is not an Agent Memory source; its writer, store, and call sites are being removed while existing JSON files are preserved. Separate Agent Memory lifecycle/message records remain untouched.

## Verification and Remaining Work

- Rehomed Blog dashboard read models and the Dashboard browser controller; removed the write-only dashboard activity recorder and its call sites. Existing persisted JSON files are not touched.
- Focused verification passed: 156 relevant tests across Dashboard contracts, Blog dashboard/API, settings, and affected UI runtimes; changed JavaScript files pass `node --check`; `git diff --check` passes. After the broad suite exposed an obsolete source assertion tied to the removed activity summary, removed that assertion and its now-unused runtime calculation; the WordPress warning payload remains covered by the focused runtime test.
- Full unit verification passed using `BLOGGENIUS_ENV=local node scripts/run-unit-tests.js`: 2,407 tests, 2,406 passed, 0 failed, 1 skipped. The first sandboxed run could not bind loopback sockets in five tests; rerunning with local loopback access resolved all five.
- `npm run test:unit` could not pass its `pretest` security audit because the sandbox could not resolve `registry.npmjs.org`; `npm audit --audit-level=high` remains unverified due to network access. This is separate from the passing complete unit suite.
- Final visual acceptance remains with the user; no visual or API behavior changes were intended.
