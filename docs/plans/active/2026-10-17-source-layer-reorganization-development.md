# Source Layer Reorganization

## Branch

- Branch: `codex/fbr/source-layer-reorganization`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: Root inventory and logger slice complete; ongoing reorganization continues on this parent branch

## User Need and Goal

Legacy code accumulated in top-level `src/` files and product-named directories without consistent layer ownership. Reorganize it by changing callers and dependency direction to the accepted architecture boundaries, not by relocating files while preserving the same coupling. The eventual root invariant is that `src/` contains only `README.md` and directories, with all source and tests owned by an appropriate layer.

## Scope

- Inventory `src/` files and active production dependency paths; identify responsibility, current callers, target layer, tests, and deletion/migration gates.
- Establish `src/README.md` as the practical source ownership map, aligned with the accepted directory-layering decision and architecture documentation.
- Break implementation into independently reviewable slices. For each slice, update callers to the target contract, migrate tests/docs, and remove superseded legacy implementations when verified.
- Keep user-visible behavior, persistence, and external contracts stable unless a concrete change requires a user decision.
- Ask the user when responsibility, compatibility, data ownership, product behavior, or an architectural boundary is ambiguous; do not make those decisions by assumption.
- Finish with no source files directly under `src/` other than `README.md` and add a narrow structural guard for that invariant.

## Explicit Non-goals

- Do not rename or relocate all directories in one bulk operation.
- Do not create Plugins merely to satisfy the folder layout; Plugin work remains governed by the independence and completeness criteria already recorded in architecture docs.
- Do not redesign product UX or change business behavior as incidental cleanup.
- Do not delete user data, persisted history, external contracts, or compatibility paths without a verified ownership and migration decision.
- Do not merge into `dev`, push, release, or change versions as part of this parent feature without explicit user direction.

## Proposed Stages

1. **Ownership inventory and root map**: trace root files, legacy product directories, composition/adapter paths, imports, dynamic loads, tests, and package/build references. Record current and target ownership plus migration gates in `src/README.md`; identify unresolved decisions before moving affected code. No broad code movement in this stage.
2. **Application workflow slices**: migrate one independently reviewable workflow at a time from legacy product directories into its Application, route entrypoints through the appropriate adapter and composition, verify callers, then delete the superseded path. Candidate areas include Blog content/continuous publishing, Site Hosting, Shopping, and keyword/trend workflows; exact ordering will follow the Stage 1 dependency map and user decisions.
3. **Shared service and adapter slices**: separate reusable domain contracts from external-system/protocol implementations and product policy. Candidates include AI/model management, Google integrations, WordPress/Naver/Telegram/Slack, media, and licensing. Do not move a responsibility until its owning Application or shared contract is explicit.
4. **Host and channel ingress slices**: reduce `core.js`, `utils.js`, `ui-server.js`, and other root facades by moving callers to their target contracts, then keep only genuine process bootstrap/routing in Host. Align `ui-api/`, `ui-runtime/`, `gui/`, `channels/`, and `mcp/` with the accepted adapter/Host boundaries after each entrypoint is traced.
5. **Root invariant and completion**: relocate remaining single-responsibility root modules, delete obsolete facades, document the final ownership map, add a structural test that allows only `src/README.md` and directories at `src/` root, and run agreed focused/full validation.

Stages 2–4 may be reordered or split further based on the inventory and dependency graph. The initial inventory and logger migration used short-lived child branches. By the user's direction on 2026-10-17, after logger is merged, continue subsequent stages directly on this parent branch, committing each completed slice here.

## Decisions and Tradeoffs

- 2026-10-17: User confirmed that the essential work is changing invocation paths to honor layer boundaries, not merely moving files to destination folders.
- 2026-10-17: User authorized a dedicated feature branch and asked to be consulted for unclear boundaries or decisions. User will perform hands-on checks when needed; pause at those gates with specific test flows or options.
- Preserve the accepted `docs/decisions/2026-10-15-source-directory-layering.md` as the placement authority. This plan and `src/README.md` operationalize it; they must not invent competing ownership rules.
- Treat `core.js` and `utils.js` as responsibility inventories, not as modules to move wholesale into `host/` or `utilities/`.

## Initial Findings

- The working tree was clean on `codex/fbr/plugin-architecture-foundation` before branch creation.
- `src/` currently has around 721 files, around 62 files directly at its root, and many established directories. Root facades include `core.js`, `utils.js`, `ui-server.js`, `main.js`, configuration/runtime modules, and external integrations.
- Responsibility-focused directories already exist for `applications/`, `adapters/`, `composition/`, `platform/`, `services/`, and `utilities/`; legacy and transitional areas remain alongside them, including `content/`, `continuous-publishing/`, `site-hosting/`, `keyword-research/`, `trend-posting/`, `ai/`, `ui-api/`, and `ui-runtime/`.
- The accepted layering decision and platform architecture document describe the target layers and migration policy, but there is not yet a complete file-level current-to-target inventory for all of `src/`.

## Progress

- 2026-10-17: Created this parent feature branch from `codex/fbr/plugin-architecture-foundation` with a clean working tree.
- 2026-10-17: Added the initial `src/README.md` with the root invariant, links to normative architecture, a first-pass inventory, and migration gates. Ambiguous rows are explicitly left open rather than assigned by name alone.
- 2026-10-17: Caller search confirms `core.js` is still active in Blog publishing/Application composition and legacy UI runtimes; UI-runtime fallbacks call `Core.publishToBlog` and `Core.publishToWordPress`, Blog Publishing Application still calls Core for WordPress, and `insight-engine.js` calls `Core.generateSimpleInsight`. `utils.js` is imported across configuration, authentication, Blog/Shopping/SNS runtime, keyword research, and Applications; Shopping still calls `Utils.callWritingText`. Neither facade can be safely relocated or deleted as one step.
- 2026-10-17: Completed the file-level root inventory in [`src/README.md`](../../../src/README.md), including every direct-root production module and test, representative callers, ownership targets, package inclusion (15 root modules named explicitly in `package.json`), and deletion gates. See the [Root Ownership Inventory development record](../archive/2026-10-17-source-layer-root-inventory-development.md). Static source search does not prove the absence of dynamic loads or injection; each code slice must repeat those checks.
- 2026-10-17: Began the next contained migration, logger ownership. The logger and runtime log-path helper are shared technical behavior without product policy, so they belong under `src/utilities/logging/`. The child relocates the implementation and tests, updates direct callers, and removes the root and interim logging paths without changing logging behavior.
- 2026-10-17: The Naver trend collector remains a later candidate. Its UI path is `ui-server.js` → `ui-runtime/trend-actions-runtime.js` → injected `TrendManager.fetchTrends()`, while a separate collector implementation is used under `apps/trends`. The migration must invoke an Application-owned action and keep provider collection behind composition; verify any additional callers before removing the root wrapper.
- 2026-10-18: Selected URL shortening as the next contained migration on the parent branch. `url-shortening-service.js` owns provider-neutral fallback behavior, `url-service.js` contains Bitly HTTP protocol details, and `ui-server.js` currently composes the Bitly credential/provider wiring. Target: `services/url-shortening/` for reusable service behavior, `adapters/url-shortening/` for Bitly transport, and `composition/` for provider/config selection. Preserve existing URL fallback and `NOTIFY_BITLY_TOKEN` behavior; do not introduce new providers or alter consuming Applications.
- 2026-10-17: Completed manual confirmation of the first independently reviewable slice, [`Host Bootstrap Layer Migration`](2026-10-17-source-layer-host-bootstrap-development.md): the Dashboard launches and exits normally after moving process launch and Electron lifecycle under `src/host/`.
- 2026-10-17: Merged the independently reviewed [`Media Runtime Loader Layer Migration`](2026-10-17-source-layer-media-runtime-loader-development.md) into the parent. Sharp loading and its tests now belong to `utilities/media/`; shared media optimization, Card News publishing, and the legacy Blog image facade use the new path. Focused verification passed (19/19).

## Verification and Remaining Work

- The root ownership map is complete for direct-root files and tests. Host bootstrap passed focused automated checks and the user's manual Dashboard launch/exit check. The media-loader slice passed its focused tests and is integrated into this parent branch.
- 2026-10-17: Completed and merged the [shared logging layer migration](../archive/2026-10-17-source-layer-logging-development.md) from child `codex/fbr/source-layer-logging` at commit `95bac52c`. Logger, runtime log-path helper, and tests now live under `src/utilities/logging/`; focused verification passed (77/77).
- 2026-10-18: Reorganized URL shortening on the parent branch. Provider-neutral fallback behavior now lives in `services/url-shortening/`, Bitly HTTP behavior in `adapters/url-shortening/`, and the configured Bitly provider/credential wiring in `composition/url-shortening.js`. UI server now consumes the composed service; the three obsolete root files were removed. Focused URL shortening, UI-server boundary/settings, Card News publishing, and SNS distribution checks passed (40/40).
- 2026-10-18: Slack inspection found a mixed module combining webhook transport, product-specific notification policy, and branded test-message behavior, so it was deferred pending a responsibility-level decomposition. The shared Playwright launcher was a clear technical utility: moved implementation and focused tests to `utilities/browser/`, updated production and developer-script callers, removed its explicit root package entry (the utilities tree is already packaged), and updated the source map and architecture ownership docs. Focused checks passed (11/11 with `BLOGGENIUS_ENV=local`); the first invocation without an environment failed during existing config initialization before tests loaded.
- 2026-10-18: Selected the updater as a contained Host migration. Its only production composition caller is the UI server; the remaining tracked source caller is the Windows updater test fixture. The implementation owns desktop update download/apply/restart lifecycle and already depends on Host configuration, so it belongs under `host/`; keep UI request handling at the existing API boundary and preserve update paths and behavior.
- 2026-10-18: Completed the updater move. The implementation, unit tests, Windows integration test, and bootstrap fixture now live under `src/host/`; the UI server imports the Host module, and the Host package glob includes the relocated files. Focused updater, system-controller, and UI-server boundary verification passed (20 passed, 1 Windows-only test skipped).
- 2026-10-18: WordPress caller tracing confirmed that `wordpress-client.js` is not dead: Core's legacy manuscript publishing path and credential/readiness checks still use it. The WordPress category endpoint was a safe completed slice because runtime composition already provides Blog Publishing Application → WordPress Publisher Plugin. Removed the category service's direct-client/config-file fallback and added contract coverage for delegation and missing-Application handling. Focused verification passed (2/2 with `BLOGGENIUS_ENV=local`). Remaining client callers and the credential-input boundary are recorded in `src/README.md`; do not remove the client until those paths are migrated.
- 2026-10-18: Extended WordPress Publisher Plugin with `connection.inspect` and routed saved-credential readiness plus settings-form candidate verification through Blog Publishing Application → Plugin. Candidate credentials are operation input only; the Plugin reports connection/permission results without returning or persisting the credentials. Root `wordpress-client.js` now has only Core's legacy manuscript publishing caller; that workflow remains the deletion gate for the client. Focused Plugin, Application, connection/readiness, session API, category API, and UI composition tests passed (37/37); `git diff --check` passed.
- 2026-10-18: Migrated directory-based WordPress manuscript preparation from `Core.publishToWordPress()` into `BlogPublishingApplication.publishWordPressManuscript()`. Investigation confirmed it has no dedicated UI but is still called by quick-publish, preview-confirmation, and Shopping handlers; keep this internal use case to preserve those active flows. The Application reads Markdown/images, applies WordPress image preparation and FTC/CTA URL reuse, assembles the Plugin request, and retains draft fallback for missing images. Both UI runtimes now require the Application method; Core no longer owns WordPress publication and no direct `WordPressClient` production references remain. Removed root `wordpress-client.js` and its tests. Focused Blog publishing, Plugin, runtime, and composition tests passed (59/59); `git diff --check` passed.
- 2026-10-18: Moved Telegram transport/runtime policy and its unit test to `src/adapters/messaging/telegram/network-policy.js`. Outbound `telegram-service.js` and inbound `telegram-bot.service.js` now import the adapter-owned module; package inclusion is covered by the existing `src/adapters/**/*.js` glob. Public functions and Korean user guidance are unchanged.
- Workflow decision (2026-10-17): continue all remaining source reorganization stages directly on `codex/fbr/source-layer-reorganization`, committing each completed stage there. Do not create further child feature branches for this effort.
- Remaining: migrate root modules in small, reviewable stages, changing call paths and deleting legacy roots after verification. Consult the user at any product/data/compatibility boundary. Full unit suite remains a parent-to-`dev` gate and requires explicit user approval.
