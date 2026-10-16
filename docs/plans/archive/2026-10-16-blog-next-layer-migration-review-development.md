# `src/blog-next/` Layer Migration

- Branch: `codex/feat/blog-next-layer-migration-review`
- Start date: 2026-10-16
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: merged into `codex/fbr/plugin-architecture-foundation` at `76377261`; focused regressions pass, with unresolved Card News catalog test failures noted below

## User need and goal

The agreed source hierarchy makes ownership clear, but `src/blog-next/` was
outside it. The user asked to document the layer responsibilities, relocate the
existing modules to their proper homes, and remove the legacy directory without
changing publishing or API behavior.

## Scope

- Document UI/API adapter and Application dependency direction and progress
  message ownership in the canonical architecture guides.
- Move Blog execution coordination, cross-Application AI operation lifecycle,
  and Naver progress presentation to their responsibility-based directories.
- Update imports and tests while preserving current service/API behavior.
- Remove `src/blog-next/` and run focused cross-consumer regressions.

## Explicit non-goals

- Changing publishing behavior, public API response contracts, persisted data,
  Plugin contracts, or UI.
- Migrating other legacy product directories.
- Pushing, releasing, or changing unrelated parent-branch work.

## Design and decisions

Application code owns product workflow and sequencing. Shared Services own
capabilities reused across Applications. Adapters translate channel-specific
inputs, outputs, and progress; UI/API adapters invoke Applications, and
Applications never call back into presentation adapters. The AI operation
manager receives its coordinator and error constructor through its options so
the shared lifecycle does not depend on UI API modules.

The legacy folder was classified by responsibility, not moved wholesale:

| Responsibility | Destination |
| --- | --- |
| Blog execution coordination | `src/applications/blog/execution/` |
| Shared cancellable AI operation lifecycle | `src/services/ai/` |
| Naver progress wording/presentation | `src/adapters/ui/` |

Preserve current API error fields and codes; this slice changes ownership and
paths, not user-visible publishing behavior.

## Progress and verification

- 2026-10-16: Created this branch from the clean parent after the user's explicit
  request for a feature branch and initial review.
- 2026-10-16: Traced production consumers and confirmed the AI operation manager
  is shared by Blog, Card News, and SNS, while the coordinator and Naver
  presentation logic are Blog/publishing concerns.
- 2026-10-16: User approved documenting the boundaries and performing the
  responsibility-based migration.
- 2026-10-16: Updated `docs/decisions/2026-10-15-source-directory-layering.md`
  and `docs/architecture/platform-kernel-applications-plugins.md` with the
  adapter/Application call direction, structured progress ownership, and
  scoped migration rule.
- 2026-10-16: Moved the coordinator and its tests to
  `src/applications/blog/execution/`; moved the AI operation manager and tests to
  `src/services/ai/`; moved Naver progress presentation and tests to
  `src/adapters/ui/`. Updated imports/callers and removed `src/blog-next/`.
- 2026-10-16: Review caught a fallback failure-code difference in the moved AI
  operation manager. The manager now accepts a caller-specific fallback code,
  and existing Blog, Card News, and SNS callers preserve their prior
  `MANUSCRIPT_AI_GENERATE_FAILED` response code.
- 2026-10-16: `BLOGGENIUS_ENV=local node --test` for the migrated modules,
  content-service execution/related-post tests, continuous publishing, manual
  SNS, and legacy API routes passed: 132 tests. `git diff --check` and a source
  search for imports from `src/blog-next/` also passed.
- A separate full `card-news.service.test.js` run had five image-model profile/
  catalog failures. Their baseline status was not compared against the parent;
  they remain unresolved and the suite is not reported as passing.
- 2026-10-16: Complete change-set review found no remaining actionable findings.
- 2026-10-16: Committed implementation as `7829f648` and compatibility follow-up
  as `76377261`; fast-forward merged both into the parent branch.
- 2026-10-16: Archived this development record after successful parent merge.

## Remaining risks and manual checks

- The five Card News catalog assertions need separate diagnosis; compare them on
  the parent before attributing them to this change.
- No visual UI change was made, so no manual UI acceptance is needed for this
  migration.
