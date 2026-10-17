# Card News Responsibility Migration

## Branch

- Branch: `codex/fbr/card-news-responsibility-migration`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: Implementation and verification complete; ready to merge into parent

## User Need and Goal

The Card News vertical still has most implementation files under the legacy `src/card-news/` directory. The user wants it reorganized by architectural layer and existing independent Plugins reused at integration boundaries. As with the Blog and SNS migrations, the intended end state is to remove `src/card-news/` after each responsibility has a verified owner and all callers have moved.

## Scope

- Inventory every Card News module, production caller, test, and composition seam.
- Move Card News workflows and product-specific policies into `src/applications/card-news/`, grouped by real capabilities.
- Place Google Sheets and local filesystem persistence behind storage adapters; keep existing Google Drive public-media and Social Publisher Plugin boundaries.
- Keep feed parsing in shared feed utilities and treat RSS/HTTP access as an external adapter.
- Ensure AI text/image generation continues through the shared AI Generation service (backed by AI Gateway Plugin), and social publication continues through the Social Publisher adapter/Plugin.
- Update imports, tests, test discovery, architecture ownership docs, and this development record in coordinated slices.
- Remove `src/card-news/` once production imports and tests no longer depend on it.

## Explicit Non-goals

- Do not redesign Card News user flows or UI presentation.
- Do not change persisted project, generation, or Google Sheets ledger formats unless required to preserve the existing contract during relocation.
- Do not change model catalog or provider behavior, Social Publisher/Buffer semantics, or product limits.
- Do not deploy, publish externally, or migrate user data.
- Do not push or release this feature as part of this branch task.

## Proposed Ownership

| Responsibility | Target |
| --- | --- |
| Card News use cases, project lifecycle, generation, sources/RSS intake, publishing, management synchronization | `src/applications/card-news/` grouped under `projects/`, `generation/`, `sources/`, `publishing/`, and `management/` as warranted by current files |
| Card News local project persistence and Google Sheets ledger transport/store | `src/adapters/storage/card-news/` |
| Card News public-document and RSS HTTP access | `src/adapters/feeds/` or another focused external adapter path chosen after tracing its parsing boundary |
| Shared feed entry parsing and feed ordering | Existing `src/utilities/feeds/` |
| Image format transformation | Existing `src/utilities/media/`; Card News watermark/signature policy remains Card News-owned |
| AI generation | Existing Card News Generation Application over shared `services/ai/generation` and AI Gateway Plugin |
| Social publication | Existing Card News publishing workflow over `adapters/plugins/social-publisher` and Social Publisher Plugin |
| HTTP/UI API controllers and routes | Existing `src/ui-api/` and UI presentation boundary; only update their dependency wiring |
| Concrete dependency graph | Existing composition root; split composition only if a distinct responsibility requires it |

## Implementation Stages

1. Complete production/test caller inventory and finalize ownership for every file under `src/card-news/`.
2. Relocate Card News domain/workflow modules and tests by capability; update all imports and the directory architecture document.
3. Relocate external persistence and feed/document adapters to adapter-owned directories; keep shared feed/media utilities shared.
4. Verify AI Gateway and Social Publisher Plugin paths remain the only provider integration routes; remove superseded legacy implementations and delete `src/card-news/`.
5. Run focused Card News, plugin-boundary, storage/feed, API, and composition tests; update this record with results and remaining manual UI checks.

## Decisions and Tradeoffs

- Product-specific business policy belongs under `applications/card-news/`; the directory name alone does not make every file an Application concern.
- Provider/product-neutral plugin operations remain behind the existing adapters. Card News will not call Buffer or AI provider clients directly.
- Card News-specific formats and persistence schemas remain product-specific even when implemented by adapters; shared technical behavior remains in utilities.
- Preserve current persistence and UI/API contracts during this structure-only migration. Any discovered behavior or data-contract redesign will be documented and isolated before implementation.

## Progress

- 2026-10-17: Created this feature branch from `codex/fbr/plugin-architecture-foundation` with a clean working tree.
- Initial scan confirms `src/applications/card-news/generation/application.js` already routes text and image work through shared AI Generation, and `src/card-news/publishing-service.js` already receives Social Publisher through the host adapter. Most other Card News modules and imports still sit under `src/card-news/`.
- Production callers include `src/ui-server.js`, `src/ui-runtime/api-route-runtime.js`, `src/ui-api/services/settings.service.js`, and Card News composition/API services. The UI API factory moved from `src/ui-api/services/` to `src/applications/card-news/application.js`; its route/controller contract remains unchanged. The composition root now supplies the project repository and source service explicitly.

## Verification and Remaining Work

- Moved the full legacy `src/card-news/` implementation into `src/applications/card-news/`, `src/adapters/storage/card-news/`, and `src/adapters/feeds/` by responsibility; the old directory is empty and removed from packaging inputs.
- Moved the Card News orchestrating service into the Application layer and made its project repository and configured source service explicit dependencies. UI routes and HTTP contracts remain unchanged.
- 2026-10-17: Removed `Core.generateContent()` and `Core.prepareImages()` after moving prompt assembly, manuscript persistence, image block processing, and image progress reporting into Blog Posting Application. Composition now injects the required utilities/configuration directly; it no longer passes Core into the posting Application. Migrated the old Core profile/cancellation tests to the Application contract and removed `src/core.writing-profile.test.js`.
- Reused shared AI Generation, Social Publisher, Google Drive public media transport, and feed/media utilities; no new provider SDK path was introduced.
- Moved ledger identity normalization into the Card News domain so storage adapters do not depend on Application workflow modules.
- Updated architecture ownership documentation, package file selection, and shell contract fixtures that asserted old source paths.
- Focused checks passed: 145 tests across Card News Applications/adapters; 90 Application/publishing/source/generation tests; and 45 UI API/runtime/shell-contract tests. `git diff --check` passed.
- 2026-10-17: Full unit suite passed: 2,409 passed, 0 failed, 1 skipped (2,410 total). Initial sandbox execution blocked five loopback-listen tests; rerunning in an environment permitting `127.0.0.1` listeners passed. The `npm run test:unit` wrapper stopped at its pre-test `npm audit` gate, which reported 9 dependency advisories, so the repository unit runner was invoked directly. No dependency changes were made.
- Browser smoke was not run because this is a structure migration and existing UI behavior/routes are intended to remain unchanged. Final visual acceptance remains with the user.
