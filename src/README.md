# `src/` ownership and migration map

This file is the working index for source ownership and legacy migration. The
accepted rules live in [`docs/decisions/2026-10-15-source-directory-layering.md`](../docs/decisions/2026-10-15-source-directory-layering.md)
and the current platform architecture in
[`docs/architecture/platform-kernel-applications-plugins.md`](../docs/architecture/platform-kernel-applications-plugins.md).
If this index and those documents disagree, update the index to match an
explicitly accepted architecture decision; do not create a second set of layer
rules here.

## Root invariant

The completed migration leaves only this `README.md` and directories directly
under `src/`. Source files and their tests live in the directory that owns the
behavior. Do not move a module just to make the root empty: first move its
callers to the correct contract, verify the new path, and remove the superseded
implementation.

## Placement rules

| Owner | Responsibility |
| --- | --- |
| `host/` | Process bootstrap, runtime startup, update lifecycle, and routing normalized ingress to Applications. No product workflow. |
| `adapters/` | Translate UI/channel or external protocol formats to internal contracts. Includes provider transports and Plugin ports. |
| `platform/` | Shared Plugin contracts, discovery, validation, lifecycle, and operation dispatch. |
| `composition/` | Select concrete implementations and wire dependencies into runtime/Application ports. |
| `applications/<name>/` | Product workflows, orchestration, and product-specific policy and services. |
| `services/<domain>/` | Contracts or domain capabilities genuinely reused by multiple Applications. |
| `utilities/<capability>/` | Reusable technical operations without product policy. |
| `utilities/browser/` | Shared local Playwright browser startup and launch-option normalization; no product workflow or provider authentication policy. |
| Supporting domains | Keep established ownership such as `agent/`, `capabilities/`, `environment/`, `knowledge/`, `memory/`, and `recommendations/` explicit; move them only when a real boundary requires it. |

UI rendering remains in `ui/`. UI/API adapters call Applications; Applications
do not call back into presentation adapters. Plugin implementations remain in
`packages/plugins/` and own their complete declared capability.

## Initial ownership inventory

This is a first-pass inventory, not permission to move every named directory.
The `current` locations below contain mixed responsibilities in several cases;
the destination is intentionally left open until production callers, dynamic
loads, tests, persistence, and external contracts have been traced.

| Current area | Observed responsibility | Migration disposition |
| --- | --- | --- |
| `host/`, `applications/`, `adapters/`, `composition/`, `platform/`, `utilities/` | Active target-layer implementations | Keep as target homes; refine only when a concrete ownership conflict is found. |
| `services/url-shortening/`, `adapters/url-shortening/`, `composition/url-shortening.js` | Shared URL-shortening behavior, provider-specific Bitly transport, and runtime wiring | Current Bitly config and external request details stay outside consuming Applications; a replacement provider can be selected at composition without changing the service contract. |
| `host/` | Node UI launcher and Electron process startup, recovery, and lifecycle | Active Host ownership for process bootstrap; UI server/runtime composition and channel ingress remain separate future slices. |
| `core.js` | Legacy Naver publishing implementation plus content and editor helpers; WordPress manuscript publication has moved to Blog Publishing Application | Decompose by publishing platform and Blog use case; migrate remaining callers; delete the legacy facade after verified. Do not move wholesale to `host/`. |
| `utils.js` | Mixed Google Sheets, AI/provider calls, content parsing, workspace, HTTP, and other helpers | Split by owning Application, adapter, service, or utility; migrate callers per responsibility. Do not move wholesale to `utilities/`. |
| `ui-server.js`, `runtime-hooks.js` | UI server composition/routing and mutable runtime hook registration | Migrate UI/API ingress and composition separately; keep normalized startup and channel routing in `host/`. `main.js` and `gui/` have moved to `host/` in the Host bootstrap slice. |
| `content/`, `continuous-publishing/` | Blog manuscript/publishing, Shopping content, queue and automation policies, plus shared-looking helpers | Split by owning Application and true cross-Application contract; preserve queue/persistence behavior and retire old paths per slice. |
| `site-hosting/` | Site Hosting project/site policy, repositories, contract validation, and Cloudflare-facing connection behavior | Separate Site Hosting Application policy from external adapters and shared utilities; verify the Astro Plugin replacement path before deleting anything. |
| `keyword-discovery/`, `keyword-research/`, `trend-posting/`, `keyword-manager.js`, `trend-manager.js` | Keyword and trend collection, research, suggestion, and posting paths | Trace UI/API, scheduled, and legacy callers to determine which Application owns each workflow and which provider code is an adapter. |
| `ai/`, `ai-model-config.js`, `ai-model-catalog.js` | Model catalog/configuration, runtime policy, provider response handling, transport registry, and connection checks | Separate shared AI service contracts, host/provider adapters, and settings presentation. Preserve the catalog source-of-truth and credential boundaries. |
| `shopping-manager.js` and Shopping portions of `content/`, `utils.js`, `continuous-publishing/` | Shopping Connect product workflows and data access | Treat as an Application migration; identify Google Sheets and publishing ports separately. |
| `ui-api/`, `ui-runtime/`, `internal-api/` | Request routing/controllers, HTTP runtime composition, request schemas | Align each responsibility with Host or `adapters/ui/`; keep screen rendering under `ui/`. Preserve route contracts during staged caller migration. Electron startup has moved to `host/electron/`. |
| `channels/`, `mcp/`, Telegram/Slack root modules | Telegram/MCP ingress and response rendering, outbound messaging, and network policy | Trace channel protocol versus transport ownership; converge channel-facing code on explicit adapters without moving Agent/Application behavior outward. |
| `google-drive-spreadsheets.js`, `google-oauth.js`, `google-sheets/`, `adapters/storage/` | Google OAuth, Drive discovery, and spreadsheet storage gateways | Consolidate by external protocol and storage contracts after all import paths and credential owners are known. |
| `slack-service.js`, `naver-auth-flow.js`, `auth-session.js` | External service, messaging, and authentication integration | Place each under its owning adapter/port; first verify whether a Plugin or newer adapter already owns the production path. |
| `config-loader.js`, `constants.js`, `runtime-config.js`, `runtime-feature-flags.js`, `config/`, `environment/` | Configuration defaults, runtime profiles, environment validation, feature flags, packaged assets | Separate host configuration loading from environment policy and capability/product policy. Preserve startup order and secret boundaries. |
| `license.js`, `license-feature-policy.js`, `publish-quota.js`, `smart-usage/` | Entitlement, feature policy, usage and publish accounting | Determine which rules are shared service contracts and which are Application policy before relocation. Keep remote calls behind adapters. |
| `image-service.js`, `utilities/media/sharp-loader.js`, media adapters/utilities | Shared image processing/runtime loading plus a legacy Blog image facade | Sharp loading and generic transformation now live in `utilities/media/`; migrate the remaining Blog facade and its platform-format policy through Blog Application contracts before removing it. |
| `insight-engine.js`, `content-ideas/`, `suggestions/`, `recommendations/`, `memory/`, `knowledge/` | Agent insight, candidate generation, recommendation lifecycle, user/activity memory, and knowledge providers | Preserve distinct state owners and data semantics; map consumers before consolidating or renaming any domain. |
| `network/`, `identity/`, `connections/`, `account/`, `surface-content/`, `test-fixtures/` | Host support and cross-cutting services | Keep explicit owners; audit whether each is a layer, bounded domain, or adapter support before any move. |

Root tests (`*.test.js`) move with the module or contract they verify. No test
should keep a legacy module alive solely because it imports that module; replace
the test against the new owner and remove the old implementation when its
production callers are gone.

## Direct-root file inventory

This inventory records production responsibilities and representative direct
callers found by source search. Caller examples are not an exhaustive call graph:
some dependencies are passed through runtime factories, loaded conditionally,
or referenced by scripts and contract tests. Before deleting a module, repeat
the search for static imports, dynamic `require()`/`import()`, package/build
inclusion, tests, and runtime injection paths. `package.json` still packages
several root modules explicitly, so relocation also requires updating that
packaging list.

| Root files | Current responsibility and observed callers | Target ownership / deletion gate |
| --- | --- | --- |
| `ai-model-catalog.js`, `ai-model-config.js` | Bundled model catalog bridge and model selection/profile normalization. Used by AI transport/catalog modules, `config-loader.js`, Card News Application, settings services, and UI server. | Consolidate under the existing AI service/config boundary after settings and configuration consumers depend on that contract; remove root compatibility imports. Keep the catalog's single source of truth. |
| `auth-session.js`, `naver-auth-flow.js` | Naver authentication-session checks/state and interactive login flow. Used by Core, Shopping, trend collection, UI server, and Naver publishing composition. | Separate provider authentication integration from Application-level login workflows; preserve credential paths and session persistence. |
| `utilities/browser/browser-launcher.js` | Shared local Playwright startup, channel fallback, and launch-option normalization. Used by Core, authentication flows, Shopping, trend collection, UI server, and Naver publishing composition. | Keep as a shared technical utility; provider authentication and product workflows consume it through the utility boundary. |
| `host/updater.js` | Desktop update checks, downloads, integrity validation, platform-specific apply/rollback, and restart lifecycle. Composed by the UI server and covered by a Windows child-process fixture. | Keep in Host, which owns the desktop process lifecycle; UI/API routes only expose update operations. |
| `config-loader.js`, `constants.js`, `runtime-config.js`, `runtime-feature-flags.js` | Configuration loading/defaults, package version constants, remotely fetched runtime configuration, and feature-policy normalization. These cross into AI, content profiles, Card News, environment, MCP, UI, publishing, and Utilities. | Decompose between Host configuration composition, environment/config adapters, and capability/Application policy. Do not relocate the loader wholesale; preserve startup order, packaged defaults, secret boundaries, and remote-config cache behavior. |
| `core.js` | Mixed 2,700-line legacy facade: browser-driven Naver publishing, editor interactions, related-post helpers, Telegram request parsing, and insight generation. Still used by `ui-server.js`, Blog runtime composition and UI-runtime fallbacks, and `insight-engine.js`. WordPress manuscript preparation/publication now belongs to Blog Publishing Application. | Split by Blog Application workflow, publishing adapters, channel parsing, and Agent capability. Remove each legacy function only after its replacement contract has production callers and tests; do not move the facade wholesale. |
| `google-drive-spreadsheets.js`, `google-oauth.js` | Google Drive spreadsheet discovery/creation and OAuth/PKCE/token lifecycle. Drive helper is reached from legacy API routes; OAuth is used by UI/API routes and `utils.js`. | Place external protocol work in storage/identity adapters and inject it through Application/UI ports. Preserve token storage, OAuth callback, and spreadsheet creation behavior. |
| `image-service.js` | Blog/platform image optimization policy (`optimizeImageForPlatform` and format conversion); now consumes generic Sharp loading and transformation from `utilities/media/`. Used by Blog composition, `core.js`, and `utils.js`. | Move Blog-specific format policy behind Blog Application/publishing contracts; keep only provider-neutral transformations in `utilities/media/`. Delete this facade after all three caller paths move. |
| `insight-engine.js` | Agent insight summarization, currently calling `Core.generateSimpleInsight`; used by Telegram Bot service. | Move orchestration under Agent/insight capability and route model generation through the AI capability contract; remove the Core dependency. |
| `keyword-manager.js`, `trend-manager.js` | Legacy keyword processing and a Naver trend collector assembled from browser/auth/config/logger dependencies. UI server injects TrendManager into `ui-runtime/trend-actions-runtime`; KeywordManager is imported by keyword research and Utility paths. | Move user workflows into the owning keyword/trend Application; put Naver/browser transport behind adapters and compose dependencies outside the UI runtime. Verify scheduled/CLI entrypoints before deleting either facade. |
| `license-feature-policy.js`, `license.js`, `publish-quota.js` | License feature validation and Supabase-backed registration/status/usage operations; publish quota operation IDs and settlement policy. Used by UI/API, Telegram, Shopping, Utilities, keyword research, and publish runtimes. | Separate licensing/usage contracts and provider adapters from Application policy. Keep quota semantics and idempotency stable; remove direct provider access from consumers before deleting the facade. |
| `runtime-hooks.js` | Mutable process-wide hook registry consumed by MCP runtime, Telegram Bot service, and UI server. | Replace global mutation with explicit composition dependencies at the owning Host/runtime boundary; remove the singleton only when all registration and retrieval sites are migrated. |
| `shopping-manager.js` | Large Shopping Connect workflow: product URL scraping, product/media processing, AI copy generation, and post composition. UI server, content service, and UI runtime call its methods; it still calls `Utils.callWritingText`. | Decompose into Shopping Application use cases plus injected product, AI, storage, and publishing ports. Preserve spreadsheet and posting contracts; migrate the remaining legacy AI path before deleting this module. |
| `slack-service.js`, `telegram-service.js`, `telegram-network-policy.js` | Outbound Slack/Telegram protocol clients and Telegram error handling, retry, IPv4 fallback, and polling policy. UI server uses the clients; Telegram Bot service also uses Telegram transport policy. | Put protocol clients and transport-specific policy under `adapters/messaging/` (or existing provider adapter homes); keep message intent and Agent behavior above the adapter. |
| `telegram-bot.service.js`, `telegram-pairing.service.js` | Telegram inbound bot lifecycle, channel request/response coordination, pairing state, and integration with Agent, Capabilities, Memory, and recommendations. Used by UI server/settings service and by the pairing service. | Separate channel ingress/rendering from Agent/Application orchestration and pairing transport. Preserve pairing expiry and polling lifecycle; migrate runtime composition before deleting root modules. |
| Root tests: `ai-model-config.test.js`, `auth-session.test.js`, `google-drive-spreadsheets.test.js`, `google-oauth-config.test.js`, `license-feature-policy.test.js`, `publish-quota.test.js`, `runtime-config.test.js`, `runtime-feature-flags.test.js`, `shopping-manager.test.js`, `telegram-bot-network-contract.test.js`, `telegram-network-policy.test.js`, `telegram-pairing.service.test.js`, `telegram-service.test.js`, `ui-server.boundary.test.js`, `ui-server.settings.test.js`, `utils.card-news-sheet.test.js`, `utils.chat-model.test.js`, `utils.gemini-call.test.js`, `utils.sns-sheet.test.js`, `utils.text-cancellation.test.js` | Root tests verify module-specific behavior, compatibility contracts, or legacy source structure. Some behavior-focused tests already verify extracted Application/adapter contracts but remain at root because the root facade/test relocation is unfinished. | Move tests alongside their new owner or contract. Replace source-text tests with contract tests when responsibility moves; do not retain a dead facade just to preserve a legacy test path. |
| `ui-server.js` | UI HTTP server, broad dependency composition, OAuth callback, settings normalization, service construction, API wiring, and shutdown. It imports most root facades and many Application/API modules; `host/electron/electron-main.js`, `host/launcher.js`, and UI E2E scripts start it. | Reduce to a Host-facing UI ingress/composition boundary. Move protocol translation to `adapters/ui/`, dependency assembly to `composition/`, and product workflows to Applications; preserve routes and lifecycle while callers migrate. |
| `utils.js` | Mixed 4,700-line compatibility facade for AI text/image generation, Google Sheets, workspace/file handling, parsing, related posts, feeds, memory, and publishing helpers. Imported by Core, auth, Shopping, keyword research, Applications, and settings services; `ShoppingManager` still calls `callWritingText`. | Inventory and migrate method-by-method into AI adapters/services, storage adapters, the owning Application, or `utilities/`. Remove each facade method and its tests after all direct and injected callers move; never relocate the whole file. |

### Migration order and gates from the root inventory

1. Preserve the completed Host bootstrap, updater, media-loader, logging, and browser utility slices. The logger,
   runtime log-path helper, and their tests now live in `utilities/logging/`;
   production imports and developer scripts use that path. `package.json`
   already includes the complete utilities tree. See the [logging migration record](../docs/plans/archive/2026-10-17-source-layer-logging-development.md).
2. For every subsequent move, update `package.json` packaged-file lists as well
   as source imports and tests; the list now names 12 root modules explicitly
   and includes owned-directory patterns. The Naver trend collector is a later
   candidate; its UI runtime caller must first invoke an Application-owned use
   case, and scheduled/CLI callers must be checked before deletion.
3. Migrate provider-facing services (Google, messaging, WordPress, URL) by
   changing composition and Application call paths, not by changing filenames
   alone. Preserve credentials, callbacks, retries, and external payloads.
4. Decompose Shopping and Blog facades by workflow. `core.js`, `utils.js`, and
   `config-loader.js` are late-stage removals because each mixes multiple
   responsibilities and has broad caller graphs.
5. Treat `ui-server.js` as an orchestration reduction project after service
   contracts are injectable; do not shift product policy into Host merely to
   shrink the file.

The inventory is a migration guide, not an automatic move list. Each next slice
must re-run caller and packaging searches, update its own development record,
and pause for user input if the change would alter persistence, product policy,
or an external contract.

## Migration sequence

1. Complete the file-level caller/dependency and dynamic-load audit for the
   ambiguous rows above. Record open ownership decisions in the active
   development plan and ask before crossing a product/data/compatibility
   boundary.
2. Select a small vertical slice with a clear Application owner. Change its
   invocation path through the correct adapter/composition contract, move the
   implementation and tests, and delete its old path after focused verification.
3. Repeat for each product workflow and shared integration; do not combine
   unrelated product migrations into one move.
4. Decompose the remaining root facades (`core.js`, `utils.js`, and startup
   modules) after their callers have target contracts. Keep only genuine Host
   bootstrap and routing in `host/`.
5. Add a structural test for the root invariant once all currently tracked root
   modules can be removed; keep it passing in every later slice.

Each migration slice must update this index and the relevant architecture docs
when ownership changes. Record deletion gates and user-visible behavior in the
slice's development record.
