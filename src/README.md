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
| `adapters/naver/` | Naver authentication session checks and interactive login protocol, plus Naver-specific browser/feed adapters. |
| `platform/` | Shared Plugin contracts, discovery, validation, lifecycle, and operation dispatch. |
| `composition/` | Select concrete implementations and wire dependencies into runtime/Application ports. |
| `applications/<name>/` | Product workflows, orchestration, and product-specific policy and services. |
| `services/<domain>/` | Contracts or domain capabilities genuinely reused by multiple Applications. |
| `utilities/<capability>/` | Reusable technical operations without product policy. |
| `utilities/browser/` | Shared local Playwright browser startup and launch-option normalization; no product workflow or provider authentication policy. |
| `host/agent/` | Host-owned request interpretation, planning, confirmation orchestration, and capability dispatch. It does not own channel-specific parsers or persistence adapters. |
| `adapters/messaging/telegram/` | Telegram request parsing, legacy content-request translation, and Telegram-specific Agent response/message/keyboard rendering. |
| `adapters/storage/confirmations/` | Confirmation state storage, expiry, correlation, and optional JSON persistence. Inject into Host Agent Runtime. |
| `capabilities/capability-id.js` | Canonical capability identifier builder shared by capability registration, Plugin host, Agent contracts, and recommendation policy. |
| Supporting domains | Keep established ownership such as `capabilities/`, `environment/`, `knowledge/`, `memory/`, and `recommendations/` explicit; move them only when a real boundary requires it. |

The former `src/agent/` feature-root has been removed after its Host runtime,
channel parsing, capability identifier, and confirmation storage responsibilities
were moved to their layer owners. `src/host/agent/` is a Host subdomain, not a
new top-level feature root.

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
| `adapters/commerce/shopping-product-gateway.js` | Shopping product-recovery request/response mapping over the Knowledge Server Gateway contract | Keep external snapshot validation and transport mapping here; Shopping Applications decide when recovery is useful. |
| `applications/settings/writing-profile/` | Settings-menu workflow for reading, updating, analyzing, and previewing the shared Blog/Shopping writing profile | Keep the UI in `ui/`, HTTP request/response translation in `adapters/ui/`, profile persistence and analyzers in their existing content modules, and model generation behind the injected AI Generation capability. |
| `applications/settings/ai-models/` | Settings-menu workflow for selecting and saving text, image, and chat models and checking their configured connection | Keep catalog, model/provider support, and connection verification behind AI Gateway; keep HTTP error mapping and config file access at the boundary. |
| `applications/settings/app-preferences/` | Application-level listen-address and Naver input-speed preferences, including validation and restart decisions | Persist through the injected config repository; keep filesystem/config-path mechanics in the service/adapter boundary. |
| `applications/settings/core-connections/` | Settings workflow for validating and saving the shared content-store, Naver account, and WordPress connection fields | Persist through the injected config repository; keep provider authentication and network checks in their provider adapters or Plugins. |
| `applications/settings/optional-services/` | Settings workflow for storing optional provider connection credentials and notification delivery preferences, with safe reads and runtime activation boundaries | Keep connection inspection and message/short-link transport in provider adapters or Plugins; SNS distribution policy has its own Application. |
| `applications/settings/external-connections/` | Settings workflow for Telegram inbound activation and remote MCP endpoint configuration, including safe status reads | Delegate process lifecycle to Host/runtime ports; never return the stored remote MCP token. |
| `applications/sns/distribution/settings-application.js` | SNS distribution policy and settings persistence, including the Application-owned channel selection limit | Keep Buffer credential inspection/publishing in the Social Publisher Plugin; consume its configured credentials through the existing runtime boundary. |
| `applications/card-news/source-settings/` | Card News source registry settings workflow, surfaced by the Settings menu | Reuse Card News source normalization; persist through the injected config repository and keep file access at the boundary. |
| `adapters/ui/settings/` | Settings HTTP routes, controller response mapping, and transitional service composition/API compatibility boundary | Delegate user workflows to their vertical Applications; keep screen rendering in `ui/`, provider protocols in their adapters/Plugins, and remove compatibility handlers after their last production callers migrate. |
| `adapters/ui/plugins/` | Read-only HTTP adapter for the Core Plugin inventory shown by Settings | Query the shared Plugin Runtime; catalog, lifecycle, and operation state remain Platform-owned. |
| `host/` | Node UI launcher and Electron process startup, recovery, and lifecycle | Active Host ownership for process bootstrap; UI server/runtime composition and channel ingress remain separate future slices. |
| `core.js` | Legacy Naver publishing implementation plus content and editor helpers; WordPress manuscript publication has moved to Blog Publishing Application | Decompose by publishing platform and Blog use case; migrate remaining callers; delete the legacy facade after verified. Do not move wholesale to `host/`. |
| `utils.js` | Mixed Google Sheets, AI/provider calls, content parsing, workspace, HTTP, and other helpers | Split by owning Application, adapter, service, or utility; migrate callers per responsibility. Do not move wholesale to `utilities/`. |
| `ui-server.js`, `runtime-hooks.js` | UI server composition/routing and mutable runtime hook registration | Migrate UI/API ingress and composition separately; keep normalized startup and channel routing in `host/`. `main.js` and `gui/` have moved to `host/` in the Host bootstrap slice. |
| `content/`, `continuous-publishing/` | Blog manuscript/publishing, Shopping content, queue and automation policies, plus shared-looking helpers | Split by owning Application and true cross-Application contract; preserve queue/persistence behavior and retire old paths per slice. |
| `applications/shopping/generation/` | Shopping-owned writing profile/editorial prompt policies and AI text generation through the shared AI Generation service | Continue migrating Shopping use cases here by responsibility; keep common Blog/Shopping profile projection and strategy primitives shared until a true common contract is established. |
| `site-hosting/` | Site Hosting project/site policy, repositories, contract validation, and Cloudflare-facing connection behavior | Separate Site Hosting Application policy from external adapters and shared utilities; verify the Astro Plugin replacement path before deleting anything. |
| `keyword-discovery/`, `keyword-research/`, `trend-posting/`, `keyword-manager.js` | Keyword research and trend-to-topic workflows for trends imported through the trends API; in-app trend scraping has been retired. | Keep imported trend lookup and topic conversion connected to the owning Application/API; do not restore a second in-app collector. |
| `utilities/async/cancellation.js` | Provider-neutral local cancellation helpers used by Applications and shared workflows. | AI generation requests route through the AI Generation service and AI Gateway Plugin; cancellation here stops local work and does not assert remote job cancellation. |
| `shopping-manager.js` and Shopping portions of `content/`, `utils.js`, `continuous-publishing/` | Shopping Connect product workflows and data access | Treat as an Application migration; identify Google Sheets and publishing ports separately. |
| `ui-api/`, `ui-runtime/`, `internal-api/` | Request routing/controllers, HTTP runtime composition, request schemas | Align each responsibility with Host or `adapters/ui/`; keep screen rendering under `ui/`. Preserve route contracts during staged caller migration. Electron startup has moved to `host/electron/`. |
| `mcp/`, Telegram/Slack root modules | MCP ingress and Telegram/Slack lifecycle/orchestration plus outbound messaging | Keep channel protocol translation/rendering in explicit adapters; keep Agent/Application behavior above the adapter boundary. Telegram parsing, content-request mapping, network policy, HTTP client, and response rendering now live under `adapters/messaging/telegram/`. |
| `google-drive-spreadsheets.js`, `google-oauth.js`, `google-sheets/`, `adapters/storage/` | Google OAuth, Drive discovery, and spreadsheet storage gateways | Consolidate by external protocol and storage contracts after all import paths and credential owners are known. |
| `slack-service.js` | External messaging integration | Place under its owning messaging adapter after verifying provider transport and all production callers. |
| `config-loader.js`, `constants.js`, `runtime-config.js`, `runtime-feature-flags.js`, `config/`, `environment/` | Configuration defaults, runtime profiles, environment validation, feature flags, packaged assets | Separate host configuration loading from environment policy and capability/product policy. Preserve startup order and secret boundaries. |
| `license.js`, `license-feature-policy.js`, `publish-quota.js`, `smart-usage/` | Entitlement, feature policy, usage and publish accounting | Determine which rules are shared service contracts and which are Application policy before relocation. Keep remote calls behind adapters. |
| `image-service.js`, `utilities/media/sharp-loader.js`, media adapters/utilities | Shared image processing/runtime loading plus a legacy Blog image facade | Sharp loading and generic transformation now live in `utilities/media/`; migrate the remaining Blog facade and its platform-format policy through Blog Application contracts before removing it. |
| `insight-engine.js`, `content-ideas/`, `suggestions/`, `recommendations/`, `memory/`, `knowledge/` | Agent insight, candidate generation, recommendation lifecycle, user/activity memory, and knowledge providers | Preserve distinct state owners and data semantics; map consumers before consolidating or renaming any domain. |
| `network/`, `identity/`, `connections/`, `surface-content/`, `test-fixtures/` | Host support and cross-cutting services | Keep explicit owners; audit whether each is a layer, bounded domain, or adapter support before any move. |
| `applications/account/overview/` | Account/license overview assembly for identity, subscription, quota, capabilities, device, and connection read models | Keep account-specific projection and actions here; remote license and connection checks are injected ports. UI route/controller live in `adapters/ui/account/`. |
| `services/configuration-readiness/` | Shared setup readiness decision used by Account overview, System status, and Blog generation readiness | Keep this cross-Application configuration policy in one service; callers must not reimplement the decision. |
| `adapters/ui/controller-common.js` | Shared HTTP controller error and method handling used by UI API controllers | Keep generic request/response translation here; do not couple new UI adapters back to the legacy `ui-api` directory. |

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
| `services/ai/model-configuration.js` | Model selection/profile normalization. Used by AI config, `config-loader.js`, Card News Application, settings services, and UI server. | Shared AI service; resolve catalog and transport information through the AI Gateway Plugin. |
| `adapters/naver/auth-session.js`, `adapters/naver/auth-flow.js` | Naver authentication-session checks/state and interactive login flow. Used by Core, Shopping, UI server, Naver smart-comment collection, and Naver publishing composition. | Keep Naver browser authentication protocol and session handling in the Naver adapter; UI login status and HTTP behavior remain at the UI boundary. |
| `utilities/browser/browser-launcher.js` | Shared local Playwright startup, channel fallback, and launch-option normalization. Used by Core, authentication flows, Shopping, trend collection, UI server, and Naver publishing composition. | Keep as a shared technical utility; provider authentication and product workflows consume it through the utility boundary. |
| `host/updater.js` | Desktop update checks, downloads, integrity validation, platform-specific apply/rollback, and restart lifecycle. Composed by the UI server and covered by a Windows child-process fixture. | Keep in Host, which owns the desktop process lifecycle; UI/API routes only expose update operations. |
| `config-loader.js`, `constants.js`, `runtime-config.js`, `runtime-feature-flags.js` | Configuration loading/defaults, package version constants, remotely fetched runtime configuration, and feature-policy normalization. These cross into AI, content profiles, Card News, environment, MCP, UI, publishing, and Utilities. | Decompose between Host configuration composition, environment/config adapters, and capability/Application policy. Do not relocate the loader wholesale; preserve startup order, packaged defaults, secret boundaries, and remote-config cache behavior. |
| `core.js` | Mixed 2,700-line legacy facade: browser-driven Naver publishing, editor interactions, related-post helpers, Telegram request parsing, and insight generation. Still used by `ui-server.js`, Blog runtime composition and UI-runtime fallbacks, and `insight-engine.js`. WordPress manuscript preparation/publication now belongs to Blog Publishing Application. | Split by Blog Application workflow, publishing adapters, channel parsing, and Agent capability. Remove each legacy function only after its replacement contract has production callers and tests; do not move the facade wholesale. |
| `google-drive-spreadsheets.js`, `google-oauth.js` | Google Drive spreadsheet discovery/creation and OAuth/PKCE/token lifecycle. Drive helper is reached from legacy API routes; OAuth is used by UI/API routes and `utils.js`. | Place external protocol work in storage/identity adapters and inject it through Application/UI ports. Preserve token storage, OAuth callback, and spreadsheet creation behavior. |
| `image-service.js` | Blog/platform image optimization policy (`optimizeImageForPlatform` and format conversion); now consumes generic Sharp loading and transformation from `utilities/media/`. Used by Blog composition, `core.js`, and `utils.js`. | Move Blog-specific format policy behind Blog Application/publishing contracts; keep only provider-neutral transformations in `utilities/media/`. Delete this facade after all three caller paths move. |
| `insight-engine.js` | Agent insight summarization, currently calling `Core.generateSimpleInsight`; used by Telegram Bot service. | Move orchestration under Agent/insight capability and route model generation through the AI capability contract; remove the Core dependency. |
| `keyword-manager.js` | Legacy keyword workflow facade still imported by keyword research and Utility paths. The old root `trend-manager.js` collector has been removed; imported trends remain available through the trends API and can be converted to topics. | Move keyword workflows to the owning Application and remove this facade after callers migrate. |
| `license-feature-policy.js`, `license.js`, `publish-quota.js` | License feature validation and Supabase-backed registration/status/usage operations; publish quota operation IDs and settlement policy. Used by UI/API, Telegram, Shopping, Utilities, keyword research, and publish runtimes. | Separate licensing/usage contracts and provider adapters from Application policy. Keep quota semantics and idempotency stable; remove direct provider access from consumers before deleting the facade. |
| `runtime-hooks.js` | Mutable process-wide hook registry consumed by MCP runtime, Telegram Bot service, and UI server. | Replace global mutation with explicit composition dependencies at the owning Host/runtime boundary; remove the singleton only when all registration and retrieval sites are migrated. |
| `shopping-manager.js` | Transitional Shopping Connect workflow for product scraping, product/media processing, and post composition. UI/API runtime still calls its facade; generated copy now goes through the injected Shopping Generation Application and shared AI Gateway service. | Continue decomposing by responsibility: move product-source protocols to adapters, keep Shopping policy/orchestration in `src/applications/shopping/`, and remove this facade after all callers have migrated. Preserve spreadsheet and publishing contracts. |
| `slack-service.js` | Outbound Slack protocol client. UI server composes and uses this client. | Put protocol clients under `adapters/messaging/`; keep message intent and Agent behavior above the adapter. |
| `adapters/messaging/telegram/service.js` | Telegram HTTP client for notifications and connection verification, composed by the UI server. | Telegram protocol operations live beside Telegram-specific network policy under this adapter. |
| `adapters/messaging/telegram/network-policy.js` | Telegram API error classification/redaction, IPv4 retry decision, and inbound polling backoff used by outbound service and inbound bot runtime. | Provider protocol/runtime policy lives beside the Telegram adapter; message/product intent remains in consumers. |
| `adapters/messaging/telegram/agent-renderer.js` | Telegram Markdown responses and inline keyboards for Agent results, confirmations, suggestions, artifacts, and content requests; called by `telegram-bot.service.js`. | Keep Telegram message and callback payload formatting at the channel adapter boundary; Agent execution and callback handling remain in the Host/service orchestration path. |
| `telegram-bot.service.js`, `telegram-pairing.service.js` | Telegram inbound bot lifecycle, channel request/response coordination, pairing state, and integration with Agent, Capabilities, Memory, and recommendations. Used by UI server/settings service and by the pairing service. | Separate channel ingress/rendering from Agent/Application orchestration and pairing transport. Preserve pairing expiry and polling lifecycle; migrate runtime composition before deleting root modules. |
| Root tests: `google-drive-spreadsheets.test.js`, `google-oauth-config.test.js`, `license-feature-policy.test.js`, `publish-quota.test.js`, `runtime-config.test.js`, `runtime-feature-flags.test.js`, `shopping-manager.test.js`, `telegram-bot-network-contract.test.js`, `telegram-pairing.service.test.js`, `ui-server.boundary.test.js`, `ui-server.settings.test.js`, `utils.card-news-sheet.test.js`, `utils.sns-sheet.test.js` | Root tests verify module-specific behavior, compatibility contracts, or legacy source structure. Some behavior-focused tests already verify extracted Application/adapter contracts but remain at root because the root facade/test relocation is unfinished. | Move tests alongside their new owner or contract. Replace source-text tests with contract tests when responsibility moves; do not retain a dead facade just to preserve a legacy test path. |
| `ui-server.js` | UI HTTP server, broad dependency composition, OAuth callback, settings normalization, service construction, API wiring, and shutdown. It imports most root facades and many Application/API modules; `host/electron/electron-main.js`, `host/launcher.js`, and UI E2E scripts start it. | Reduce to a Host-facing UI ingress/composition boundary. Move protocol translation to `adapters/ui/`, dependency assembly to `composition/`, and product workflows to Applications; preserve routes and lifecycle while callers migrate. |
| `utils.js` | Mixed compatibility facade for Google Sheets, workspace/file handling, parsing, related posts, feeds, memory, and publishing helpers. AI Provider text/image transport has been removed; AI callers use the AI Generation service and Gateway Plugin. | Inventory and migrate each remaining helper into its owning Application, adapter, service, or `utilities/`; never relocate the whole file. |

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
