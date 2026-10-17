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
| `host/` | Process bootstrap, runtime startup, and routing normalized ingress to Applications. No product workflow. |
| `adapters/` | Translate UI/channel or external protocol formats to internal contracts. Includes provider transports and Plugin ports. |
| `platform/` | Shared Plugin contracts, discovery, validation, lifecycle, and operation dispatch. |
| `composition/` | Select concrete implementations and wire dependencies into runtime/Application ports. |
| `applications/<name>/` | Product workflows, orchestration, and product-specific policy and services. |
| `services/<domain>/` | Contracts or domain capabilities genuinely reused by multiple Applications. |
| `utilities/<capability>/` | Reusable technical operations without product policy. |
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
| `host/` | Node UI launcher and Electron process startup, recovery, and lifecycle | Active Host ownership for process bootstrap; UI server/runtime composition and channel ingress remain separate future slices. |
| `core.js` | Large browser-driven Naver/WordPress publishing implementation plus content and editor helpers | Decompose by publishing platform and Blog use case; migrate callers; delete the legacy facade after verified. Do not move wholesale to `host/`. |
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
| `wordpress-client.js`, `url-service.js`, `url-shortening-service.js`, `slack-service.js`, `browser-launcher.js`, `naver-auth-flow.js`, `auth-session.js` | External service, browser, and authentication integration | Place each under its owning adapter/port; first verify whether a Plugin or newer adapter already owns the production path. |
| `config-loader.js`, `constants.js`, `runtime-config.js`, `runtime-feature-flags.js`, `config/`, `environment/` | Configuration defaults, runtime profiles, environment validation, feature flags, packaged assets | Separate host configuration loading from environment policy and capability/product policy. Preserve startup order and secret boundaries. |
| `license.js`, `license-feature-policy.js`, `publish-quota.js`, `smart-usage/` | Entitlement, feature policy, usage and publish accounting | Determine which rules are shared service contracts and which are Application policy before relocation. Keep remote calls behind adapters. |
| `image-service.js`, `sharp-loader.js`, media adapters/utilities | Image processing and binary/runtime loading | Consolidate generic transformation in `utilities/media/`; keep provider transport and product-specific format choice outside it. |
| `insight-engine.js`, `content-ideas/`, `suggestions/`, `recommendations/`, `memory/`, `knowledge/` | Agent insight, candidate generation, recommendation lifecycle, user/activity memory, and knowledge providers | Preserve distinct state owners and data semantics; map consumers before consolidating or renaming any domain. |
| `updater.js`, `logging/`, `network/`, `identity/`, `connections/`, `account/`, `surface-content/`, `test-fixtures/` | Host support and cross-cutting services | Keep explicit owners; audit whether each is a layer, bounded domain, or adapter support before any move. |

Root tests (`*.test.js`) move with the module or contract they verify. No test
should keep a legacy module alive solely because it imports that module; replace
the test against the new owner and remove the old implementation when its
production callers are gone.

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
