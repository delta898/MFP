# Source Root Ownership Inventory

## Branch

- Branch: `codex/fbr/source-layer-root-inventory`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/source-layer-reorganization`
- Status: Inventory complete; ready to merge into parent

## User Need and Goal

The long-term target is for `src/` to contain only `README.md` and owned
directories. The main work is to trace production call paths and reassign
responsibilities to the correct layer, then remove superseded legacy paths.
Before selecting more migrations, turn the first-pass root map into a
file-level ownership and dependency inventory that identifies shared facades,
their callers, and safe migration gates.

## Scope

- Inventory every source and test file directly under `src/`.
- Trace static imports, dynamic loads, package/scripts references, and
  representative call chains for each root implementation.
- Classify each root file by its actual responsibility and candidate target
  layer, explicitly separating mixed modules such as `core.js`, `utils.js`,
  and `config-loader.js`.
- Update `src/README.md` and this parent plan with migration sequencing,
  dependencies, and decisions that require user input.

## Explicit Non-goals

- Do not move or delete source files in this inventory slice.
- Do not choose product/data/compatibility behavior where ownership is unclear;
  record the ambiguity and ask the user before implementation.
- Do not create Plugin packages to satisfy directory placement.
- Do not run a broad test suite or change user-visible behavior.
- Do not commit, merge, push, or release without the user's request.

## Design and Migration Stages

1. Enumerate root source and test files and locate all current importers,
   dynamic paths, package inclusion, scripts, and relevant build references.
2. Classify direct root modules and compare their actual responsibilities with
   existing Applications, adapters, services, utilities, Host, and composition.
3. Trace mixed facades at function/call-chain level where file-level ownership
   is insufficient; record migration order and deletion gates.
4. Update the source ownership map and identify the next concrete migration
   slice without moving code in this branch.

## Decisions and Tradeoffs

- 2026-10-17: The user directed that child branches should be completed,
  merged into the parent, and deleted before creating the next child. This
  branch follows that sequence.
- 2026-10-17: The Host bootstrap and Sharp loader slices are now integrated
  into the parent. This stage is an inventory/documentation slice; implementation
  migrations will use subsequent child branches.
- Keep current ownership documented separately from target placement. A
  directory or filename alone does not prove that its responsibility belongs
  to that layer.

## Progress

- 2026-10-17: Created this child from
  `codex/fbr/source-layer-reorganization` after merging and deleting the
  Host bootstrap and media-loader children.
- 2026-10-17: Completed the direct-root source and test listing. The source
  map now records all production root modules, all 26 root test files,
  representative static callers, target ownership, and the caller/data/package
  gates for removal.
- 2026-10-17: Caller search confirms important live legacy paths: UI runtime
  publishing fallbacks still call `Core.publishToBlog` and
  `Core.publishToWordPress`; Blog Publishing Application still receives Core
  for WordPress publishing; `insight-engine.js` calls
  `Core.generateSimpleInsight`; Shopping still calls
  `Utils.callWritingText`; Blog image policy remains in `image-service.js`.
- 2026-10-17: `package.json` explicitly packages 15 root modules. A move is
  incomplete until package inclusion, scripts/fixtures, and any conditional
  runtime loads are checked along with production imports.
- 2026-10-17: The Naver trend collector wrapper has a direct UI path from
  `ui-server.js` through `ui-runtime/trend-actions-runtime.js`, and a separate
  collector implementation is used by `apps/trends`. Its Blog UI caller should
  invoke an Application-owned action, with provider collection composed behind
  that boundary; verify separate scheduled/CLI callers before removing the root
  wrapper.
- 2026-10-17: Selected `logger.js` as the next code slice. Its responsibility
  is unambiguous shared logging, `src/logging/` already owns runtime log-path
  behavior, and its direct callers can be updated to the shared logging home
  without changing product policy or persistence.
- 2026-10-17: Importer examples are static source-search results, not an
  exhaustive runtime graph. The inventory explicitly requires a fresh search
  for dynamic imports, injection paths, package/build inclusion, and test
  contracts before each deletion.

## Verification and Remaining Work

- Updated `src/README.md` with a complete direct-root file/test inventory,
  representative live callers, target owners, packaging notes, and a staged
  migration order. No source implementation was changed.
- Verified package inclusion and representative call chains with source
  searches. Path/reference checks and `git diff --check` passed; no source
  tests were needed for this documentation-only slice.
