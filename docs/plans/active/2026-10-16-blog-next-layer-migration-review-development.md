# `src/blog-next/` Layer Migration

- Branch: `codex/feat/blog-next-layer-migration-review`
- Start date: 2026-10-16
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: implementation complete; focused regressions pass, with unrelated Card News catalog test failures noted below

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
- Committing, merging, pushing, releasing, or changing the parent branch.

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
- 2026-10-16: `BLOGGENIUS_ENV=local node --test` for the migrated modules,
  content-service execution/related-post tests, continuous publishing, manual
  SNS, and legacy API routes passed: 131 tests.
- A separate full `card-news.service.test.js` run passed shared-operation tests
  but had five failures in image-model profile/catalog assertions. Those catalog
  paths were not changed in this slice; the suite is not reported as passing.
- `git diff --check` and a repository search for imports from `src/blog-next/`
  are the final checks before handoff.

## Remaining risks and manual checks

- The five Card News catalog assertions need separate diagnosis; determine whether
  they were already failing on the parent before attributing them to this change.
- No visual UI change was made, so no manual UI acceptance is needed for this
  migration.
