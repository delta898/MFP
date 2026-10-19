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
| `host/network/` | Process-wide Node network startup policy applied by the Node launcher and Electron entrypoint. Keep transport/provider behavior in its owning adapter or Plugin. |
| `adapters/` | Translate UI/channel or external protocol formats to internal contracts. Includes provider transports and Plugin ports. |
| `adapters/naver/` | Naver authentication session checks and interactive login protocol, plus Naver-specific browser/feed adapters. |
| `platform/` | Shared Plugin contracts, discovery, validation, lifecycle, and operation dispatch. |
| `composition/` | Select concrete implementations and wire dependencies into runtime/Application ports. |
| `applications/<name>/` | Product workflows, orchestration, and product-specific policy and services. |
| `services/<domain>/` | Contracts or domain capabilities genuinely reused by multiple Applications. |
| `services/licensing/` | Provider-neutral license feature validation, quota settlement, and smart-usage policy/service contracts. |
| `services/licensing/license-service.js` | License workflows and entitlement/status caching, using injected identity, key persistence, and provider API ports. |
| `adapters/licensing/supabase/` | Supabase RPC and Edge Function protocol translation for license operations; credentials and device identity are supplied by Host composition. |
| `host/licensing/device-identity.js` | Host-local device identity lookup supplied to licensing workflows through composition. |
| `utilities/<capability>/` | Reusable technical operations without product policy. |
| `utilities/browser/` | Shared local Playwright browser startup and launch-option normalization; no product workflow or provider authentication policy. |
| `host/agent/` | Host-owned request interpretation, planning, confirmation orchestration, and capability dispatch. It does not own channel-specific parsers or persistence adapters. |
| `host/agent/planning/content-requests/` | Channel-neutral content request bundle contract, validation, capability-backed preparation, and action/preview planning. |
| `host/mcp/` | Remote MCP service lifecycle and stdio/HTTP executable bootstraps; concrete MCP transports and runtime services are supplied through composition. |
| `host/configuration/mcp-remote-config.js` | MCP runtime configuration projection and bearer-token generation; pure settings normalization is in `services/mcp/`. |
| `services/mcp/` | Provider-neutral MCP remote endpoint configuration defaults and normalization. |
| `adapters/messaging/telegram/` | Telegram request parsing, legacy content-request translation, and Telegram-specific Agent response/message/keyboard rendering. |
| `adapters/messaging/mcp/` | MCP protocol/transports under `server/`, tool request translation, and confirmation-token serialization. |
| `adapters/storage/confirmations/` | Confirmation state storage, expiry, correlation, and optional JSON persistence. Inject into Host Agent Runtime. |
| `capabilities/capability-id.js` | Canonical Agent capability identifier builder shared by capability registration, Agent contracts, and recommendation policy. |
| Supporting domains | Keep `services/knowledge/` and `services/memory/` contracts/domain behavior distinct from `adapters/knowledge/` provider transports and `adapters/storage/memory/` persistence. `host/memory/` owns process lifecycle. |

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
| `host/configuration/environment/` | Canonical runtime environment contract, profile resolver, manifest, environment-scoped OAuth selection, and generated build-config sample/artifact | Host resolves the selected environment before Supabase clients are created; packaged secret artifact is generated by `scripts/environment/build-config.js` and is not committed. |
| `services/runtime-environment/` | Cross-Application policy for environment-controlled publishing and other external effects | Keep runtime effect policy independent from Host profile selection and operator deployment authorization. |
| `adapters/supabase/public-connection.js` | Normalize the resolved public Supabase connection for client-owning adapters | Keep all Supabase client owners on this adapter contract; runtime profile resolution does not own provider adapter details. |
| `scripts/environment/` | Build-config CLI, deployment/branch policy, release artifact checks, and schema-audit tooling | Operator/deployment tooling stays outside `src/` and is never imported by desktop runtime modules. |
| `host/cloudflare/oauth-scopes.js` | Cloudflare connection service provider-specific requested OAuth scopes | Keep Cloudflare scopes beside the Cloudflare Host adapter; generic OAuth environment selection stays under Host configuration. |
| `host/`, `applications/`, `adapters/`, `composition/`, `platform/`, `utilities/` | Active target-layer implementations | Keep as target homes; refine only when a concrete ownership conflict is found. |
| `services/url-shortening/`, `adapters/url-shortening/`, `composition/url-shortening.js` | Shared URL-shortening behavior, provider-specific Bitly transport, and runtime wiring | Current Bitly config and external request details stay outside consuming Applications; a replacement provider can be selected at composition without changing the service contract. |
| `adapters/commerce/shopping-product-gateway.js` | Shopping product-recovery request/response mapping over the Knowledge Server Gateway contract | Keep external snapshot validation and transport mapping here; Shopping Applications decide when recovery is useful. |
| `applications/settings/writing-profile/` | Settings-menu workflow for reading, updating, analyzing, and previewing the shared Blog/Shopping writing profile | Keep the UI in `ui/`, HTTP request/response translation in `adapters/ui/`, profile persistence in `adapters/storage/writing-profiles/`, reference fetching in `adapters/web/`, and model generation behind injected AI Generation. |
| `applications/blog/manuscript-drafts/` | Blog manuscript draft lifecycle, preview validation, image-slot state, and publication preparation | Keep Blog draft policy here; selected-file materialization and transient workspace cleanup are filesystem adapters under `adapters/storage/manuscript-drafts/`. |
| `adapters/storage/google-sheets/publish-options.js` | Google Sheets option-cell parsing, encoding, and state mapping for Blog and Shopping rows | Keep persisted field mapping here and shared value normalization in `services/content-writing/`; do not import Application policy into the storage adapter. |
| `adapters/knowledge/blog-reference-search.js` | Translates Blog reference searches to the Knowledge Server Gateway snapshot contract and validates returned references | Keep the optional-reference failure policy in Blog Posting; select and inject this adapter in composition. |
| `utilities/markdown/selected-files.js`, `utilities/text/related-post-selection.js` | Reusable Markdown file selection normalization and text-based related-post ranking mechanics | Keep reusable technical mechanics here; Blog Posting owns when/how related posts are applied. |
| `services/related-posts/` | Shared retrieval/selection contract for Naver and WordPress related-post candidates | Provider HTTP/RSS mechanics live in `adapters/web/related-posts/`; Blog and Shopping Applications decide when and how many posts are included. |
| `applications/settings/ai-models/` | Settings-menu workflow for selecting and saving text, image, and chat models and checking their configured connection | Keep catalog, model/provider support, and connection verification behind AI Gateway; keep HTTP error mapping and config file access at the boundary. |
| `applications/settings/app-preferences/` | Application-level listen-address and Naver input-speed preferences, including validation and restart decisions | Persist through the injected config repository; keep filesystem/config-path mechanics in the service/adapter boundary. |
| `applications/settings/core-connections/` | Settings workflow for validating and saving the shared content-store, Naver account, and WordPress connection fields | Persist through the injected config repository; keep provider authentication and network checks in their provider adapters or Plugins. |
| `applications/settings/optional-services/` | Settings workflow for storing optional provider connection credentials and notification delivery preferences, with safe reads and runtime activation boundaries | Keep connection inspection and message/short-link transport in provider adapters or Plugins; SNS distribution policy has its own Application. |
| `applications/site-hosting/` | Site Hosting project/site workflows, contract validation, navigation rules, Astro import analysis, and Vault knowledge collection | Keep workspace persistence in storage adapters, Amade catalog transport in catalog adapters, Electron integration in Host, and Astro build/deploy in the Site Hosting Plugin. |
| `composition/site-hosting-application.js` | Site Hosting runtime assembly for Application services, filesystem repositories, Amade catalog, Astro Plugin adapter, and desktop Host ports | Keep the Application dependent only on injected ports; select concrete implementations here. |
| `applications/settings/external-connections/` | Settings workflow for Telegram inbound activation and remote MCP endpoint configuration, including safe status reads | Delegate process lifecycle to Host/runtime ports; never return the stored remote MCP token. |
| `applications/blog/queue-management/` | Blog topic capture, saved/ready state, queue membership, row ordering, and queue read models | Owns editing and ordering of prepared topics. Does not own the timer or execute/publish the queue. |
| `applications/blog/automation/` | Blog recurring-publishing policy, allowed-time calculation, next-run projection, and scheduler | Consumes ready topics through the existing queue contract; it does not duplicate queue storage or mutation rules. |
| `applications/blog/queue-execution/` | Blog queue-item readiness and Site Hosting target execution orchestration | Keep the queue workflow with Blog; invoke Site Hosting through its injected service port and reuse Blog queue readiness. |
| `applications/shopping/content-preparation/topic-capture.js` | Validates and prepares Shopping content rows before saving or enqueueing | Shopping owns its content policy; persist through the injected Sheets boundary. |
| `services/topics/contract.js`, `services/content-delivery/contract.js` | Shared persisted topic statuses and cross-Application delivery-plan contract | Keep only contracts shared across Blog, Shopping, and queue execution; product policy remains in each Application. |
| `adapters/storage/blog/automation-settings.js` | Atomic persistence for this device's recurring-publishing settings | Keep the existing `continuous_publishing.json` path and document format; the adapter receives validation/default behavior from its caller. |
| `adapters/storage/google-sheets/topic-queue-order.js` | Maps Blog queue row moves to the Google Sheets API request format | Keep spreadsheet request construction out of the Blog queue policy. |
| `composition/content-lifecycle-adapters.js` | Wires Blog, Shopping, and Site Hosting execution ports into the shared queue runner | Keep concrete execution mapping here; Applications and UI/API adapters consume the injected registry. |
| `applications/sns/distribution/settings-application.js` | SNS distribution policy and settings persistence, including the Application-owned channel selection limit | Keep Buffer credential inspection/publishing in the Social Publisher Plugin; consume its configured credentials through the existing runtime boundary. |
| `applications/card-news/source-settings/` | Card News source registry settings workflow, surfaced by the Settings menu | Reuse Card News source normalization; persist through the injected config repository and keep file access at the boundary. |
| `adapters/ui/settings/` | Settings HTTP routes, controller response mapping, and transitional service composition/API compatibility boundary | Delegate user workflows to their vertical Applications; keep screen rendering in `ui/`, provider protocols in their adapters/Plugins, and remove compatibility handlers after their last production callers migrate. |
| `adapters/ui/plugins/` | Read-only HTTP adapter for the Core Plugin inventory shown by Settings | Query the shared Plugin Runtime; catalog, lifecycle, and operation state remain Platform-owned. |
| `host/` | Node UI launcher and Electron process startup, recovery, and lifecycle | Active Host ownership for process bootstrap; UI server/runtime composition and channel ingress remain separate future slices. |
| `core.js` | Removed after production callers moved to Blog Applications and Naver Publisher Plugin; unused Telegram parsing and stale scripts that called the deleted Core API were retired | No root Core facade remains. Blog manuscript preparation and related-post policy belong to Blog Posting; publication request preparation belongs to Blog Publishing; Naver browser interaction belongs to `packages/plugins/core/naver-publisher/`. |
| `utils.js` | Removed after migrating active related-post and Naver URL formatting callers to explicit service, adapter, and utility boundaries | Do not recreate the root facade. |
| `composition/ui-server.js` | Transitional UI dependency composition and API wiring | The root `ui-server.js` has been removed. HTTP startup/deferred Memory initialization live in `host/ui/startup.js`; Google OAuth callback response translation lives in `adapters/ui/google/oauth-callback.js`; runtime dependencies for Telegram and remote MCP are injected explicitly. Continue decomposing product assembly by Application/runtime. |
| `applications/blog/writing/`, `applications/blog/posting/blog-reference-context.js` | Blog-owned writing policy, prompt assets, image planning, per-topic overrides, and reference-context orchestration | Keep Blog generation and posting policy with the Blog Application; shared profile contracts and provider transports remain in their owning service/adapter boundaries. |
| `applications/shopping/generation/` | Shopping-owned writing profile/editorial prompt policies and AI text generation through the shared AI Generation service | Continue migrating Shopping use cases here by responsibility; keep common Blog/Shopping profile projection and strategy primitives shared until a true common contract is established. |
| `adapters/storage/site-hosting/` | Project/site filesystem repositories | Keep workspace paths, atomic manifests, archive containment, and site file I/O here; persisted paths remain `workspace/site-hosting/`. |
| `adapters/catalogs/amade/` | Remote Amade style/template catalog transport, integrity checks, and template cache materialization | Keep Amade-specific remote protocol and cache behavior outside Applications; use the Application contract for Site Hosting compatibility. |
| `host/cloudflare/` | Desktop Cloudflare OAuth callback, encrypted credential store, and account connection lifecycle | The Astro Site Hosting Plugin owns build/deploy/provider resource operations; Host owns app credentials and desktop OAuth lifecycle. |
| `host/electron/site-screenshot.js` | Electron-backed screenshot capture for Site Hosting previews | Keep Electron runtime use in Host and inject capture through the Astro Site Hosting composition. |
| `host/electron/site-hosting-desktop.js` | Electron directory/archive dialogs, system open actions, and ZIP extraction port used by Site Hosting | Keep desktop runtime and Electron-only packages out of the Application. |
| `applications/blog/keyword-discovery/`, `applications/blog/keyword-research/` | Blog keyword exploration from imported trends/Memory, keyword metrics analysis, and title recommendations | Keep exploration and research as distinct Blog Application use cases; share only the keyword-list parser utility. In-app trend scraping remains retired. |
| `adapters/supabase/functions/keyword-research-client.js` | Supabase Edge Function transport for keyword research, including authenticated request context and response/error translation | Keep the Edge Function protocol here; the Blog Application receives its operation port through Composition and knows no Supabase details. |
| `utilities/text/keyword-input.js` | Parsing and normalization of user-entered keyword lists | Share the input contract between Blog keyword discovery and keyword research; keep analysis limits and product policy in the Blog Application. |
| `utilities/async/cancellation.js` | Provider-neutral local cancellation helpers used by Applications and shared workflows. | AI generation requests route through the AI Generation service and AI Gateway Plugin; cancellation here stops local work and does not assert remote job cancellation. |
| `applications/shopping/content-preparation/` | Shopping Connect content preparation and data access | The content-preparation Application is still transitional: split provider scraping/media effects into adapters and keep workflow policy in the Application. Keep Google Sheets and publishing ports separate. |
| `adapters/ui/assets/composition/`, `adapters/ui/http/`, `adapters/ui/account/session/`, `adapters/ui/content/content-api/`, `adapters/ui/shopping/publishing/`, `host/ui/`, `composition/api/ui-api-runtime.js`, `composition/recommendations/runtime.js`, `applications/blog/publishing/` | UI asset/HTTP/session and content API adapters, Host-owned HTTP server lifecycle, UI and Recommendation composition, Blog publishing workflows and state | Keep route/controller translation under `adapters/ui/<vertical>/`, product workflows in Applications, service composition in `composition/`, and browser presentation in `ui/`. The transitional `src/ui-runtime/` root has been removed; do not recreate it. |
| `adapters/ui/<vertical>/` | HTTP route, controller, and channel-specific response mapping grouped by user-facing vertical (Blog, Card News, SNS, Account, Site Hosting, and others) | Call owning Applications or service ports and map results/errors to HTTP responses; keep product workflows out of controllers and route handlers. |
| `adapters/ui/errors.js` | Shared HTTP API error shape used by the UI transport boundary | Keep HTTP status and API error metadata here; domain/application errors remain transport-neutral. |
| `composition/ui-api-routes.js` | Transitional assembly of product HTTP routes, controllers, and UI endpoint services | Split assembly by Application/runtime boundary when route ownership changes; no `src/ui-api/` directory remains. |
| Telegram/Slack root modules | Telegram/Slack lifecycle/orchestration plus outbound messaging | Keep channel protocol translation/rendering in explicit adapters; keep Agent/Application behavior above the adapter boundary. Telegram parsing, content-request mapping, network policy, HTTP client, and response rendering now live under `adapters/messaging/telegram/`. |
| `google-drive-spreadsheets.js`, `google-oauth.js`, `google-sheets/` | Google OAuth/token lifecycle, Drive file operations, shared Sheets transport, and menu-specific spreadsheet workflows | Provider mechanics now live under `adapters/google/`; SNS and Card News use the shared Sheets client for authenticated transport. Keep menu-specific stores and use cases with their owning Applications/adapters. Do not create one oversized Google Plugin. |
| `slack-service.js` | External messaging integration | Place under its owning messaging adapter after verifying provider transport and all production callers. |
| `host/configuration/runtime-config.js`, `host/application-metadata.js`, `host/configuration/`, `host/update-defaults.js`, `adapters/naver/publishing-defaults.js` | Host runtime settings snapshot, package metadata, runtime paths, updater defaults, and Naver publishing defaults | Host startup owns runtime configuration assembly. Composition injects the snapshot into runtime-bound adapters and Applications; continue extracting product policy instead of adding direct global imports. |
| `host/configuration/` | Runtime root/path resolution, user config document loading, packaged default asset initialization, and Host runtime settings assembly | Keep filesystem/bootstrap configuration here; domain-specific policy should move to its Application/service owner. |
| `services/licensing/feature-access.js` | Normalizes license feature maps and evaluates shared feature entitlements for Blog, Shopping, and SNS workflows | Keep entitlement interpretation with the shared licensing service; local publishing counts and product workflow limits remain with their Applications. |
| `adapters/storage/license-keys/` | License key file path selection, secure file writes, and legacy-path migration | Keep license file persistence in the storage adapter; callers receive values through injected/runtime configuration boundaries. |
| `services/content-writing/` | Shared Blog/Shopping writing-profile schema, defaults, projections, style, and strategy policies | Keep menu-specific workflows in Applications; profile repository persistence and external reference fetching are transitional and still need layer extraction. |
| `services/content-delivery/single-publish-target.js` | Shared manuscript publish-target cardinality contract | Keep the broader queue lifecycle allowlist separate because it includes Site Hosting. |
| `content/` | Transitional mixed legacy modules: manuscript draft orchestration and workspace I/O, writing-profile persistence, Google Sheets option mapping, related-content selection, and Knowledge reference gateway wiring | Continue responsibility-by-responsibility migration; do not add new code here. Track remaining splits in `docs/plans/active/2026-10-19-content-domain-layer-reorganization-development.md`. |
| `applications/shopping/generation/prompts/` | Shopping manuscript generation prompt asset | Keep this product-specific writing policy with the Shopping Generation Application. |
| `services/licensing/`, `adapters/licensing/supabase/`, `host/licensing/`, `composition/licensing.js` | Licensing policy/workflows, Supabase protocol, device identity, and runtime assembly | Callers receive licensing ports through composition. Blog reference search and Shopping product recovery are now assembled at their Application composition boundaries; Utilities and Applications do not import the licensing runtime. |
| `utilities/media/` | Provider-neutral image optimization and Sharp runtime loading | Generic buffer transformations live here. Blog Publishing Application owns target-specific output formats and receives the optimization service through composition. |
| `utilities/markdown/` | Provider-neutral Markdown image-block parsing | Keep provider-specific rendering or formatting in its adapter/Application. |
| `adapters/naver/publishing/` | Naver editor-specific related-post formatting | Keep Naver markup and editor constraints out of Blog policy. |
| `adapters/web/style-reference-fetcher.js` | Safe public HTML retrieval for writing-reference analysis | Settings Application receives the fetch operation through composition; it does not own DNS or HTTP transport. |
| `adapters/web/blog-reference-content-fetcher.js` | Public Blog reference HTTP retrieval and readable-content extraction for Blog writing | Blog Posting receives the fetch operation through composition; Blog reference selection and context assembly remain in the Blog Application. |
| `adapters/web/rss-feed-client.js` | RSS/Atom HTTP retrieval and feed parsing invocation | SNS discovery receives the fetch operation from composition; SNS workflow policy remains in its Application. |
| `applications/blog/topic-recommendations/`, `services/recommendations/`, `services/memory/`, `adapters/storage/memory/`, `host/memory/`, `services/knowledge/`, `adapters/knowledge/` | Blog topic-idea generation, shared Recommendation lifecycle, Memory domain semantics and persistence/runtime, and Knowledge contracts/providers | Blog topic generation consumes imported Knowledge and shared Recommendation services. Keep Knowledge, Memory, Blog topic policy, and Recommendations distinct. Memory insight generation and projections belong to `services/memory/`; provider and database mechanics stay in adapters, and process lifecycle stays in Host. |
| `services/surface-content/` | Shared surface payload contract, validation, bounded cache, and last-known-good fallback for Sidebar, Dashboard, Account, and Help | Keep Supabase RPC and Storage translation in `adapters/supabase/surface-content-provider.js`; UI request/response translation stays in `adapters/ui/content/surface/`. |
| `adapters/supabase/surface-content-provider.js` | Supabase RPC transport, Storage asset-path validation, and public media URL resolution for surface content | Keep provider-specific transport and asset details here; the shared service receives canonical media through the injected resolver. |
| `test-fixtures/` | Shared test-only fixtures | Keep test support out of production layers. Local Memory owner identity persistence lives in `adapters/storage/memory/local-owner-identity.js`. |
| `applications/account/overview/` | Account/license overview assembly for identity, subscription, quota, capabilities, device, and connection read models | Keep account-specific projection and live Naver/WordPress connection-check orchestration here; inject provider checks and verification storage. UI route/controller live in `adapters/ui/account/`. |
| `applications/recommendations/center/` | Owner-scoped recommendation center workflows: listing, lifecycle interaction, discovery refresh, and confirmation handoff | Keep Recommendation transitions and application errors here; HTTP status/API error mapping belongs to `adapters/ui/recommendations/center/`. |
| `adapters/storage/connection-verifications/` | Persistent verification snapshots keyed by credential signatures | Store only credential hashes and connection status metadata; signature generation and trust-window policy live in `services/connection-verification/`. |
| `services/connection-verification/` | Shared credential-signature and verification trust-window policy | Keep signature identity and display-trust rules shared; do not persist state or inspect live provider connectivity here. |
| `services/configuration-readiness/` | Shared setup readiness decision used by Account overview, System status, and Blog generation readiness | This is configuration-completeness policy, not live connection inspection. Keep the cross-Application calculation here; callers must not reimplement it. |
| `adapters/ui/controller-common.js` | Shared HTTP controller error and method handling used by UI adapters | Keep generic request/response translation here; UI adapters call Application and Service ports. |

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
| `services/ai/model-configuration.js` | Model selection/profile normalization. Used by AI config, Host runtime configuration, Card News Application, settings services, and UI server. | Shared AI service; resolve catalog and transport information through the AI Gateway Plugin. |
| `adapters/naver/auth-session.js`, `adapters/naver/auth-flow.js` | Naver authentication-session checks/state and interactive login flow. Used by Core, Shopping, UI server, Naver smart-comment collection, and Naver publishing composition. | Keep Naver browser authentication protocol and session handling in the Naver adapter; UI login status and HTTP behavior remain at the UI boundary. |
| `utilities/browser/browser-launcher.js` | Shared local Playwright startup, channel fallback, and launch-option normalization. Product callers provide headless and channel settings. | Keep as a shared technical utility; provider authentication and product workflows consume it through the utility boundary. It must not load the global configuration facade. |
| `host/updater.js` | Desktop update checks, downloads, integrity validation, platform-specific apply/rollback, and restart lifecycle. Receives runtime configuration from UI-server composition and is covered by a Windows child-process fixture. | Keep in Host, which owns the desktop process lifecycle; UI/API routes only expose update operations. |
| `host/configuration/runtime-config.js`, `host/application-metadata.js`, `host/configuration/`, `host/update-defaults.js`, `adapters/naver/publishing-defaults.js`, `applications/blog/writing/prompts/paths.js` | Host runtime configuration snapshot, package version, runtime-path defaults, updater defaults, Naver publishing defaults, and Blog prompt asset paths | Keep defaults beside their owner. Continue decomposing the Host snapshot's remaining product-policy fields through composition and Application/service contracts; preserve startup order, packaged defaults, and secret boundaries. |
| `core.js` | Removed. Its active responsibilities now have explicit owners: Blog Posting Application, Blog Publishing Application, and Naver Publisher Plugin. The unused Telegram fallback parser and manual scripts that exercised the removed Core API were retired. | Do not recreate the mixed facade; keep these owners separate and prevent new root-level compatibility facades. |
| `adapters/google/auth/`, `adapters/google/drive/`, `adapters/google/sheets/`, `adapters/storage/google-sheets/` | OAuth/PKCE and token refresh; Drive spreadsheet discovery/creation; shared Sheets transport, spreadsheet-reference parsing, range helpers, sheet preparation, and Blog/Shopping/keyword/trend stores. UI runtimes, services, Telegram, and capabilities receive the Sheets port through composition; SNS and Card News gateways use it for strict sheet preparation. | Keep provider protocol and persistence grouped under the adapter boundary; consuming workflows receive the injected `GoogleSheets` port. Preserve token storage, OAuth callback, Drive files, sheet initialization, and event-recording behavior. |
| `utilities/media/image-optimization-service.js` | Provider-neutral AVIF/WebP buffer transformation using the shared Sharp loader. Blog Publishing Application supplies the target format and optimization setting through composition. | Keep target selection and file preparation in the owning Application; do not add platform-specific policy to this utility. |
| `runtime-config.js`, `runtime-hooks.js`, `runtime-feature-flags.js` | Removed. The desktop did not call the Runtime Config RPC; feature-access policy moved into `services/licensing/feature-access.js`; Telegram and MCP now receive Host dependencies through Composition. | Keep remote RPC/database policy separate from desktop runtime, and use explicit dependency injection rather than a process-wide mutable hook registry. |
| `applications/shopping/content-preparation/application.js` | Transitional Shopping Connect workflow for product scraping, product/media processing, and post composition. UI/API runtime still calls this Application entrypoint; generated copy goes through the injected Shopping Generation Application and shared AI Gateway service. | Continue decomposing by responsibility: move product-source protocols and media I/O into adapters, keep Shopping policy/orchestration in the Application, and remove the transitional internals after callers migrate. Preserve spreadsheet and publishing contracts. |
| `slack-service.js` | Outbound Slack protocol client. UI server composes and uses this client. | Put protocol clients under `adapters/messaging/`; keep message intent and Agent behavior above the adapter. |
| `adapters/messaging/telegram/service.js` | Telegram HTTP client for notifications and connection verification, composed by the UI server. | Telegram protocol operations live beside Telegram-specific network policy under this adapter. |
| `adapters/messaging/telegram/network-policy.js` | Telegram API error classification/redaction, IPv4 retry decision, and inbound polling backoff used by outbound service and inbound bot runtime. | Provider protocol/runtime policy lives beside the Telegram adapter; message/product intent remains in consumers. |
| `adapters/messaging/telegram/agent-renderer.js` | Telegram Markdown responses and inline keyboards for Agent results, confirmations, recommendations, artifacts, and content requests; called by `telegram-bot.service.js`. | Keep Telegram message and callback payload formatting at the channel adapter boundary; Agent execution and callback handling remain in the Host/service orchestration path. |
| `telegram-bot.service.js`, `telegram-pairing.service.js` | Telegram inbound bot lifecycle, channel request/response coordination, pairing state, and integration with Agent, Capabilities, Memory, and recommendations. Used by UI server/settings service and by the pairing service. | Separate channel ingress/rendering from Agent/Application orchestration and pairing transport. Preserve pairing expiry and polling lifecycle; migrate runtime composition before deleting root modules. |
| Root tests: `telegram-bot-network-contract.test.js`, `telegram-pairing.service.test.js`, `ui-server.boundary.test.js`, `ui-server.settings.test.js` | Root tests verify module-specific behavior, compatibility contracts, or legacy source structure. Licensing feature-access tests now live beside their shared service. Shopping content-preparation tests live beside their Application; Google OAuth, Drive, and Sheets storage tests live beside their adapters. | Keep tests beside the owning module or contract; do not retain a dead facade just to preserve a legacy test path. |
| `composition/ui-server.js` | Transitional dependency composition and API wiring for UI runtime; invoked by `host/electron/electron-main.js`, `host/launcher.js`, and UI E2E scripts. | Keep remaining assembly in Composition while product/runtime groups are extracted. Host startup and deferred Memory initialization are in `host/ui/startup.js`; Google OAuth callback HTTP response handling is in `adapters/ui/google/oauth-callback.js`; Electron shutdown owns its direct Host Memory lifecycle dependency. Continue splitting composition by Application/runtime. |

### Migration order and gates from the root inventory

1. Preserve the completed Host bootstrap, updater, media-loader, logging, and browser utility slices. The logger,
   runtime log-path helper, and their tests now live in `utilities/logging/`;
   production imports and developer scripts use that path. Host startup now supplies
   the log level and runtime root explicitly; the logger no longer loads the global
   configuration facade. Browser launch mechanics receive product options from
   their callers, the updater receives runtime configuration at composition, and
   the runtime-config API requires an injected config object. `package.json`
   already includes the complete utilities tree. See the [logging migration record](../docs/plans/archive/2026-10-17-source-layer-logging-development.md).
2. For every subsequent move, update `package.json` packaged-file lists as well
   as source imports and tests; the list now names 11 root modules explicitly
   and includes owned-directory patterns. The Naver trend collector is a later
   candidate; its UI runtime caller must first invoke an Application-owned use
   case, and scheduled/CLI callers must be checked before deletion.
3. Migrate provider-facing services (Google, messaging, WordPress, URL) by
   changing composition and Application call paths, not by changing filenames
   alone. Preserve credentials, callbacks, retries, and external payloads.
4. Decompose the remaining Shopping and shared utility facades by workflow.
   The root `config-loader.js` has been removed. Its Host bootstrap and runtime
   settings snapshot live under `host/configuration/`; Application and adapter
   consumers receive configuration through Composition. Continue moving
   product-specific policy out of the flat Host snapshot as those contracts are
   touched. `core.js` and `utils.js` have also been removed after their active
   responsibilities moved to their owners.
5. Treat `composition/ui-server.js` as an orchestration reduction project after service
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
4. Decompose the remaining startup modules
   after their callers have target contracts. Keep only genuine Host
   bootstrap and routing in `host/`.
5. Add a structural test for the root invariant once all currently tracked root
   modules can be removed; keep it passing in every later slice.

Each migration slice must update this index and the relevant architecture docs
when ownership changes. Record deletion gates and user-visible behavior in the
slice's development record.
