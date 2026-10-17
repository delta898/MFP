# Shared Logging Layer Migration

## Branch

- Branch: `codex/fbr/source-layer-logging`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/source-layer-reorganization`
- Status: Implementation and focused verification complete; awaiting integration

## User Need and Goal

The source root should contain only `README.md` and owned directories. The
shared logging facade is a reusable technical capability without product
policy. The agreed target is `src/utilities/logging/`; move the logger and
runtime log-path helper there, update their callers, and remove legacy paths
without changing logging behavior.

## Scope

- Move `src/logger.js` and `src/logging/runtime-log-path.js` to
  `src/utilities/logging/`.
- Update all production imports, including Host and lazily loaded callers.
- Move logger and runtime-log-path tests with their implementations and keep
  assertions against the new owner.
- Remove the obsolete root logger package entry; `src/utilities/**/*.js` is
  already included in the packaged JavaScript allowlist.
- Update `src/README.md` and the parent development record.

## Explicit Non-goals

- Do not redesign logger configuration, transports, retention, formatting, or
  recent-log storage.
- Do not migrate other root facades or modify product behavior.
- Do not run a broad test suite without explicit approval.
- Do not commit, merge, push, or release without the user's request.

## Design and Stages

1. Verify every static/dynamic caller, test reference, and packaging/build
   reference to the root logger.
2. Relocate the logger, runtime path helper, and their tests, fixing internal
   relative imports for the new directory.
3. Update every production caller to `logging/logger` and remove root imports.
4. Update package inclusion and source ownership docs; search again to ensure
   no production caller refers to the removed root path.
5. Run the moved logger contract test, focused startup/runtime logging tests,
   and `git diff --check`. Do not claim packaged-build verification unless a
   non-production build can be safely run without credentials or side effects.

## Decisions and Tradeoffs

- 2026-10-17: Selected as the first root-removal slice after the direct-root
  inventory. After reviewing the target hierarchy, the user confirmed that
  reusable technical behavior belongs under `src/utilities/`; logging and
  runtime path mechanics therefore move together to `src/utilities/logging/`.
- Preserve the current singleton API and log behavior. Configuration injection
  redesign, if needed, is a separate architecture change.

## Progress

- 2026-10-17: Created from
  `codex/fbr/source-layer-reorganization` after merging and deleting the
  completed root inventory child.
- 2026-10-17: Static source search found 28 logger import/reference sites in
  production modules. The logger depends on `config-loader.js` and
  `logging/runtime-log-path.js`; its contract test reads the implementation by
  path. The package allowlist names `src/logger.js` but does not yet include
  `src/logging/**/*.js`.
- 2026-10-17: Initially staged the singleton implementation under `src/logging/`.
  After the hierarchy review, moved the complete logging capability and tests
  to `src/utilities/logging/`, updated all callers and the architecture map,
  and retained the existing generic utilities package inclusion. Logger
  behavior and public methods are unchanged.
- 2026-10-17: An initial focused run without the project test environment
  failed during existing OAuth config initialization (`BLOGGENIUS_ENV` was
  unset), before the affected tests ran. Re-running with the unit runner's
  `BLOGGENIUS_ENV=local` setting passed all 77 selected tests.
- 2026-10-17: Rechecked the final paths and package inclusion; repository search
  found no stale `src/logging/` or root logger imports. `git diff --check`
  passed, and the focused suite passed all 77 tests after the final relocation.
  No full unit suite or packaged build was run.

## Verification and Handoff

- Implementation is ready for review and parent integration; changes remain
  uncommitted on this child branch.
- Remaining risk: packaging manifests can be stale even when local Node tests
  pass, so the package allowlist and final source search are explicit gates.
