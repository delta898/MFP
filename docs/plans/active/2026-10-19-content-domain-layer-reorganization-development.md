# Content Domain Layer Reorganization

## Branch

- Branch: `codex/fbr/config-loader-reorganization`
- Start date: 2026-10-19
- Base/parent branch: `codex/fbr/source-layer-reorganization`
- Status: Complete; focused automated tests and manual product verification remain pending

## User need and goal

The legacy `src/content/` and `src/content-ideas/` roots mix Blog and Shopping workflows, shared domain behavior, persistence, provider transport, and technical helpers. Reorganize by product responsibility and architecture layer, migrate callers with each slice, and remove both legacy roots when no production dependencies remain.

## Scope

- Move Blog topic-idea workflow into the Blog Application while keeping the cross-application Recommendation lifecycle in `src/services/recommendations/`.
- Split `src/content/` by actual responsibility: shared writing-profile services and storage, Blog writing/posting policy, manuscript workflow and workspace adapters, provider/reference adapters, and generic utilities.
- Migrate production callers and tests in the same verified slices; update canonical architecture and source ownership documentation.
- Preserve user-visible behavior, persisted formats, prompts, API contracts, and external side effects.

## Explicit non-goals

- Do not merge Recommendations with Memory or Knowledge.
- Do not change Blog or Shopping product behavior, recommendation ranking, prompt content, storage schema, or provider configuration as incidental cleanup.
- Do not create Plugins for code that is not independently complete and distributable.
- Do not run the full unit suite, merge, push, or release without the required approval/instruction.

## Proposed stages

1. Move content-idea generation orchestration into `applications/blog/`, inject it through composition, keep `services/recommendations/` as the shared recommendation lifecycle, and preserve channel capability translation.
2. Split shared writing-profile contracts/policy, persistence adapters, Settings workflow, and Blog/Shopping consumers.
3. Move Blog generation and publication policy/prompt assets into Blog Application use cases.
4. Separate manuscript workflow orchestration from filesystem/workspace and Markdown adapters/utilities.
5. Resolve reference fetching/search, publishing target contracts, and Sheets row mapping against existing service/adapter contracts; migrate callers and remove duplicated paths.
6. Remove `src/content/` and `src/content-ideas/` after production, test, packaging, and documentation references are gone; run focused verification and record remaining manual checks.

## Decisions and tradeoffs

- 2026-10-19: User approved the staged reorganization. Product use cases belong under `src/applications/<product>/`; UI presentation stays in `ui/`; provider protocols and persistence stay in adapters; shared cross-Application contracts stay in services; generic technical behavior stays in utilities.
- 2026-10-19: `content-ideas` is Blog-owned generation policy, not trend collection. It consumes imported Knowledge and shared Recommendation services. Keep those domains distinct.
- 2026-10-19: Work continues on the current branch; no new feature branch was requested.

## Progress

- 2026-10-19: Caller audit confirmed the content-idea path is active through the capability registry and Blog UI recommendation endpoint, with Telegram/MCP also constructing the same registry. `src/content/` is a mixed-responsibility inventory; no bulk relocation is appropriate.
- 2026-10-19: Moved topic candidate generation and AI drafting from `src/content-ideas/` into `src/applications/blog/topic-recommendations/`. Moved capability registry construction of the Blog Application into `src/composition/capability-runtime.js`; the capability remains a channel-neutral translator/materialization boundary. UI, Telegram, and MCP now compose the same Application path. Shared candidate generation/ranking and Recommendation lifecycle stay in `services/recommendations/`; Knowledge stays in its own service/adapter boundary. Removed `src/content-ideas/`.
- 2026-10-19: Focused verification passed 18 tests across the Blog topic-recommendation Application/provider, Agent capability translation, and UI recommendation service. Remaining `src/content/` modules are not yet migrated: they combine shared writing profiles, Blog policy, manuscript/workspace work, provider transports, target contracts, and Sheets row mapping. Continue by responsibility slices rather than a bulk move.
- 2026-10-19: Moved Blog prompt composition, image-mode/plan rules, per-post writing overrides, prompt assets, and optional reference-context orchestration to `applications/blog/writing/` and `applications/blog/posting/`; migrated their direct Application, queue, UI runtime, Settings preview, Google Sheets mapping, and config-path callers. Focused Blog writing/posting/queue/Settings-preview/Sheet/UI-service verification passed 97/97.
- 2026-10-19: Moved the shared Blog/Shopping writing-profile schema/default, projections, common prompt primitives, writing style/strategy, and legacy preference resolution to `src/services/content-writing/`; migrated production callers and tests. Kept Settings profile workflow in its Application and repository persistence, preview orchestration, reference analysis/fetching, manuscript/workspace, target and Sheet mapping code in `src/content/` pending dedicated boundary splits. Focused shared-service, Blog/Shopping/Settings caller and structural-contract verification passed 138/138. Updated the stale image-mode structural assertions to match the current owner and safeguards.
- 2026-10-19: Moved provider-neutral image-block parsing to `src/utilities/markdown/` and Naver editor-related-post formatting to `src/adapters/naver/publishing/`; migrated Core, Blog Publishing, Site Hosting, and related tests. Focused Blog Publishing, Site Hosting, Core, and Naver adapter verification passed 38/38.
- 2026-10-19: Moved profile preview and reference-fingerprint analysis into `applications/settings/writing-profile/`; moved public HTML/DNS-safe reference fetching to `adapters/web/` and wired it through `composition/settings-writing-profile.js`. The Application now receives the fetch port instead of constructing the HTTP adapter. Settings profile and composition focused verification passed 44/44.
- 2026-10-19: Moved the single manuscript publication-target contract to `services/content-delivery/` and migrated Blog, Shopping, UI runtime, and manuscript callers. Focused target, queue, Shopping content preparation, manuscript, and publish runtime verification passed 130/130.
- 2026-10-19: Moved Blog manuscript image-prompt context, related-post finalization, and pasted-Markdown related-post handling into `applications/blog/posting/`; updated API and draft callers. Focused posting workflow and Blog UI contract verification passed 28/28.
- 2026-10-19: Finished the remaining `src/content/` migration by placing Blog manuscript-draft workflow and preview under `applications/blog/manuscript-drafts/`, file-workspace persistence under `adapters/storage/manuscript-drafts/`, Google Sheets option codecs under `adapters/storage/google-sheets/`, writing-profile JSON persistence under `adapters/storage/writing-profiles/`, Knowledge reference transport under `adapters/knowledge/`, and reusable selected-file/related-post mechanics under `utilities/`. Injected the writing-profile repository through Settings composition and moved optional-reference failure policy into Blog Posting. Moved associated tests and updated direct callers and structural checks. Removed `src/content/`; `src/content-ideas/` had already been removed.

## Verification and handoff

- Run focused Application, capability/channel, API, and affected product tests per slice; verify no production references to removed legacy paths and run `git diff --check`.
- Do not run the full suite before explicit user approval.
- User owns final desktop/UI visual validation unless they explicitly ask for assistance.

## Completion notes

Both legacy roots have been removed. `src/content/` no longer owns source files; remaining strings such as `local-markdown-preview-*` are UI class names, and `src/content/posts` in the Amade template contract is a generated site-content destination, not a BlogGenius source module.

The manuscript-draft Application still performs local draft filesystem operations through its injected filesystem dependency. Its use-case policy now has a product owner and the standalone temporary-workspace operations are adapters, but a deeper repository-port extraction is a separate boundary improvement and is recorded as follow-up rather than hidden by a filename move. Focused tests have not been rerun in this final slice.
