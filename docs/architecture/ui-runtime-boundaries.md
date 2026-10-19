# UI Runtime Boundaries

## Purpose
This document captures the current runtime boundaries after the CLI-removal refactor work. The UI/Electron path is the primary product surface, and shared business/runtime logic should live outside the Host entrypoints and `src/ui-server.js`.

## Entry Points
- `src/host/launcher.js`
  - Node-side UI launcher bootstrap.
  - Starts the web UI server and opens the browser when used outside Electron.
- `src/host/electron/`
  - Electron process startup, safe-mode recovery, diagnostics, and lifecycle.
- `src/ui-server.js`
  - UI runtime composition root.
  - Wires shared runtimes, API handlers, and HTTP server lifecycle.
  - Should not keep large business workflows inline.

## Shared Runtime Modules
- `src/adapters/ui/controller-common.js`
  - Shared HTTP controller error-response and method-allowlist translation used by UI API adapters.
- `src/adapters/ui/account/`
  - Account/session/license/system endpoint translation and response projection; account/license overview assembly belongs to `src/applications/account/overview/` and desktop update lifecycle belongs to Host.
- `src/adapters/ui/keyword-research/keywords/service.js`
  - Maps keyword UI requests and smart-usage session fields to the injected Keyword Research service and returns its API-facing usage metadata.
- `src/adapters/ui/blog/continuous-publishing/service.js`
  - Active UI endpoint coordinator for queue, runner, automation, shopping capture, and Blog dashboard operations. It reuses the existing Blog queue-management and automation Applications; the remaining workflow orchestration is transitional and should move into those owning Applications in bounded slices.
- `src/adapters/ui/blog/trend-posting/`
  - The active Blog trend-query UI path. It reads already-imported Trend API data and exposes metadata, keyword queries, recent topics, and topic saves; it does not collect trends.
- `src/adapters/ui/blog/smart-comments/`
  - Owns Smart Comment HTTP routing, response translation, and settings request mapping. The Smart Comments Application owns the workflow; `src/composition/blog-smart-comments.js` wires its Naver collector and AI Generation port, while `src/adapters/storage/blog/smart-comment-settings.js` persists its settings.
- `src/adapters/ui/content/content-api/service.js`
  - Maps the existing content endpoints to injected Application and provider ports. This is a transitional multi-feature facade; split it by UI feature as endpoint workflows are migrated, without duplicating Application behavior.
- `src/adapters/ui/blog/topic-recommendations/service.js`
  - Maps Blog topic recommendation requests, usage metadata, cache behavior, and learning outcomes to the existing recommendation runtime ports.
- `src/composition/ui-api-routes.js`
  - Transitional product API assembly. The former `src/ui-api/` directory is removed; continue moving concrete wiring into feature composition as APIs are redesigned.
- `src/adapters/naver/auth-flow.js`
  - Single implementation path for interactive Naver login protocol and credential-state capture.
- `src/adapters/naver/auth-session.js`
  - Naver session verification, process-local check cache, session-state persistence, and logout cleanup shared by UI, Blog, Shopping, and Naver publishing composition.
- `src/runtime-feature-flags.js`
  - Plan/feature flag normalization and limits.
- `src/adapters/ui/account/session/session-runtime.js`
  - UI login-flow progress state and Google Sheets preflight response mapping. Naver session verification and its process-local cache live in the Naver adapter.
- `src/adapters/ui/http/http-utils.js`
  - UI request/response, static path, MIME, and JSON body transport helpers.
- `src/host/ui/http-server-runtime.js`
  - UI HTTP server lifecycle and request dispatch bootstrap.
- `src/adapters/ui/assets/composition/html-composition.js`
  - Synchronous, fail-fast composition of the UI shell and feature HTML partials.
  - Rejects missing, escaping, non-HTML, and cyclic include paths before the server listens.
- `src/adapters/ui/assets/composition/css-composition.js`
  - Synchronous composition of ordered base, layout, component, and feature CSS modules.
- `src/adapters/ui/assets/composition/js-composition.js`
  - Synchronous, ordered composition of foundation, shell, and feature JavaScript modules.
  - Rejects invalid, escaping, missing, non-JavaScript, and cyclic include paths.
- `src/adapters/ui/assets/composition/text-composition.js`
  - Shared safe path, extension, missing-file, and cycle enforcement for UI text assets.
- `src/adapters/ui/http/query-values.js`
  - Shared UI query value parsing; product DTO sorting stays in the Content API adapter.
- `src/adapters/ui/content/content-api/sorting.js`
  - Blog topic and Shopping content list sorting for the existing Content API response.
- `src/composition/api/ui-api-runtime.js`
  - API route assembly, handler caching, and request context wiring.
- `src/applications/recommendations/center/application.js`
  - Owns owner-scoped Recommendation listing and explicit open/snooze/dismiss/discovery/confirmation workflows.
  - Accepts Recommendation identities only and delegates side-effect resolution to the trusted handoff service.
  - `src/adapters/ui/recommendations/center/controller.js` maps its transport-neutral errors to HTTP status and API codes.
- `src/services/recommendations/delivery/refresh-service.js`
  - Composes Memory, operational state, bounded Knowledge, producers and policy evaluation for an on-demand refresh.
  - Coalesces concurrent refreshes and applies a 15-minute process-local TTL; it does not own background scheduling.
- `src/services/recommendations/delivery/scheduler.js`
  - Starts the same refresh pipeline after HTTP listen and owns periodic timing, persisted next-run state,
    single catch-up, concurrent-run coalescing and provider-failure backoff.
  - It never imports UI modules or reimplements producer/policy decisions.
- `src/composition/recommendations/runtime.js`
  - Wires recommendation stores, producers, policy, refresh workflow and scheduler at the application composition boundary.
- `src/host/configuration/ui-config-file.js`
  - Runtime config source resolution, raw file reads, revision hashing, and default template generation.
- `src/adapters/ui/settings/settings-fields.js`
  - UI settings field projection/request parsing and Shopping image request helpers; it is a transitional UI adapter consumed through composition.
- `src/applications/blog/automation/auto-publish-policy.js`
  - Blog auto-publish configuration normalization and validation used by the UI boundary.
- `src/adapters/ui/http/query-values.js` and `src/adapters/ui/content/content-api/sorting.js`
  - Shared UI query parsing and content-list sorting mechanics.
- `src/applications/blog/publishing/quick-publish-state.js`
  - Blog quick-publish dedupe and preview session state; receives transient workspace lifecycle through an injected adapter.
- `src/ui-runtime/publish-actions-runtime.js`
  - Quick publish, local markdown publish, multi-platform publish orchestration.
- `src/ui-runtime/content-actions-runtime.js`
  - Blog/shopping row actions, topic/shopping batch operations.
- `src/applications/sns/distribution/automation-scheduler.js`
  - SNS RSS discovery and distribution scheduling plus SNS-owned process-local run state.
- `src/applications/sns/distribution/automation-application.js`
  - Coordinates RSS discovery followed by SNS distribution for a scheduled SNS cycle.
- `src/applications/blog/publishing/selected-topic-batch-publisher.js`
  - Explicit one-shot selected/ready topic batch publishing used by Agent and Telegram entry points. It is separate from Blog queue auto-publishing, which remains owned by `src/applications/blog/automation/` and `src/applications/blog/queue-management/`.
- `src/adapters/ui/blog/automation/service.js`
  - Preserves the current Blog UI/API automation response contract while translating to separate SNS status and Blog batch-publishing ports. It does not own or schedule either workflow.
- `src/utilities/network/internal-ui-origin.js`
  - Shared normalization for internal loopback calls into the UI server.

## Dashboard Composition Boundary

Dashboard is a UI screen that composes read models from feature-owned APIs; it does not own the underlying queue, account, site-hosting, recommendation, or publishing state. Its markup is `ui/partials/views/dashboard.html`, its browser controller is `ui/scripts/features/dashboard/dashboard.js`, and its styles are `ui/styles/features/dashboard.css` and `dashboard-responsive.css`. Keep this presentation and navigation behavior in the UI layer. Blog's operations overview and publishing result statistics are assembled in `src/applications/blog/operations-reporting/`, even when a UI API service requests them. Keep these projections limited to read DTOs and leave their source state with the Blog Application and other owning capabilities.

The former `dashboard-activities.json` recorder was not read by Dashboard or Agent Memory. Its writer, store, and call sites are removed. Existing files are preserved as inert user data; separate Agent Memory event and lifecycle records remain independent.

## UI-First Boundary
There is no user-facing CLI command surface anymore. Login, license, publishing, and automation flows are expected to run through the app UI.

## Dependency Direction
1. Entry points compose dependencies.
2. Runtime modules encapsulate workflows/state for one concern.
3. Domain/services/utilities remain reusable by both Electron and the web UI runtime.

The desired direction is:

`host entrypoints -> composition -> UI adapters and Host services -> product Applications and shared services`

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
When `관심 없음` succeeds, the interaction response may contain one server-selected replacement DTO.
The browser replaces only that card in place and cannot request a provider or inject a source. If no
grounded replacement is created, it falls back to the normal owner-scoped list read.
The Recommendation Center Application derives the installation-local owner, records lifecycle interactions and passes only that
owner plus Recommendation id to `src/services/recommendations/handoff/service.js`. Presentation targets are
allowlisted again in the browser before navigation. An empty first read may invoke one bounded,
server-side evaluation so the center is usable before proactive scheduling exists. App-start and
background triggers remain outside this surface.

## Practical Rules
- Keep UI transport and endpoint translation under `src/adapters/ui/`; keep server lifecycle under `src/host/ui/`; keep screen workflows in their owning `src/applications/<product>/` directory. `src/ui-runtime/` is a migration-only directory and must not receive new modules.
- Keep `ui/index.html` as the bounded document shell and place feature markup in
  `ui/partials/views/`. Large views such as blog and settings use nested tab
  partials. Use 500 lines as a review prompt for a partial and 800 as its hard
  ceiling. Keep the shell at or below 300 recommended / 400 maximum lines.
  Composition must finish before browser script execution.
- Keep `ui/styles.css` as the ordered CSS manifest and cascade-layer source of truth.
  Add styles to the matching `tokens`, `base`, `components`, `features`, or
  `utilities` layer; do not add unlayered product rules or use the reserved
  `overrides` and `legacy` layers without a documented exception. Preserve order
  within the owning layer. Treat 900 lines as a review prompt and 1,400 as the
  hard ceiling for a CSS module.
- Keep `ui/app.js` as the ordered classic-script manifest. Place shared bootstrap
  and browser primitives in `ui/scripts/foundation/`, application-wide shell,
  navigation, and lifecycle behavior in `ui/scripts/shell/`, reusable UI behavior
  in `ui/scripts/shared/`, and screen behavior in `ui/scripts/features/<vertical>/`.
  Use product names such as `blog/`, `shopping/`, `card-news/`, `sns/`, and
  `settings/`; keep Dashboard presentation under `features/dashboard/`. A browser
  controller that reads or updates the DOM stays in `ui/`, not in
  `src/applications/<name>/`; Applications own the corresponding business flow
  and read-model composition. Use 800 lines as the review prompt and 1,400 as
  the hard ceiling for a JavaScript module.
  The transitional `legacy-actions-controllers.js` has a 2,500-line review prompt
  and a 2,800-line hard ceiling while behavior continues to move into feature modules.
- Keep `ui/scripts/features/content-workspace/` only for the legacy combined
  Blog/Shopping content screen whose modules still mix both verticals. Do not put
  new behavior there; split a module by responsibility when its callers and shared
  state can be migrated together. Keep genuinely reusable publishing controls in
  `ui/scripts/shared/publishing/`; product-specific controls belong with their
  product UI. Keep third-party browser code in `ui/scripts/vendor/`.
- Apply the same two-stage size policy to manifests by include count: HTML 25
  recommended / 40 maximum, CSS 120 / 160, and JavaScript 150 / 200. These are
  growth limits; valid ordering, unique/reachable includes, and successful
  composition remain mandatory regardless of count.
- Do not introduce duplicate top-level function declarations in the composed UI
  script. Keep one `DOMContentLoaded` bootstrap and one action-binding path.
- Avoid adding new behavior to the legacy action controller; extract it into a
  focused feature module. Its size warning is a prompt to continue that transition,
  while the hard ceiling prevents unbounded growth.
- When multiple entry paths need the same behavior, extract a shared module before changing one side further.
- `src/ui-server.js` should keep wiring, not full workflow implementations. Use
  1,200 lines as a review prompt and 1,500 as its hard composition-root ceiling;
  move new policy or field-mapping behavior into a focused runtime module.
- Shared modules should remain usable even if the launcher or packaging changes again later.
