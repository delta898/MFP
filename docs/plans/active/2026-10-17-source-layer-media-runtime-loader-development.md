# Media Runtime Loader Layer Migration

## Branch

- Branch: `codex/fbr/source-layer-media-loader`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/source-layer-reorganization`
- Status: Focused verification passed

## User Need and Goal

Place existing source code according to architectural ownership and change its
call paths accordingly. The shared optional Sharp module loader is currently a
root-level file even though its consumers are the shared media utility, Blog
publishing, and Card News publishing.

## Scope

- Move `sharp-loader.js` and its focused tests under `src/utilities/media/`.
- Update all production and test imports to the new utility path.
- Preserve package/runtime lookup behavior, including the fallback path derived
  from the loader's location.
- Record the media utility ownership in the architecture decision.

## Explicit Non-goals

- Do not migrate the legacy platform-specific `image-service.js` facade in
  this slice; its format choices are Blog publishing policy and its callers
  require a separate workflow migration.
- Do not change image formats, optimization settings, Card News watermarking,
  package composition, or user-visible behavior.
- Do not reorganize other root modules or run a broad regression suite.
- Do not commit, merge, push, or release without the user's request.

## Design and Migration Stages

1. Trace all runtime, packaging, test, and dynamic references to the loader.
2. Move the loader into `utilities/media/`, update callers and retain the
   previous package-resource search fallback semantics.
3. Check the changed paths, syntax, stale references, and the final diff.

## Decisions and Tradeoffs

- 2026-10-17: The user authorized continuing the staged source-layer
  reorganization. The media loader is classified as a reusable technical
  operation: it resolves the optional native image-processing module for
  existing media consumers and owns no product-specific format or workflow
  policy.
- Keep the higher-level product policy in its current owner for a separate
  slice; moving the loader does not make `image-service.js` a shared utility.

## Progress

- 2026-10-17: Created this child branch from
  `codex/fbr/source-layer-reorganization`.
- 2026-10-17: Caller audit found direct production imports from the shared
  image-optimization utility and Card News outgoing-image Application service.
  The legacy Blog image facade also imports the loader and remains explicitly
  out of scope except for updating its import path.
- 2026-10-17: The loader derives one fallback resource directory from
  `__dirname`; preserve the same repository/package root after relocation.
- 2026-10-17: Moved the loader and its tests to `src/utilities/media/`, updated
  the shared media utility, Card News publishing service, and the legacy Blog
  image facade to import from the new owner. Adjusted the `__dirname` fallback
  to resolve to the same package root as before.

## Verification and Remaining Work

- Focused verification passed: 19 tests across the Sharp loader, shared image
  optimization service, and Card News outgoing-image service.
- `node --check` passed for all changed runtime modules; `git diff --check`
  passed. An active-path search found no import of the old root-level loader.
- Added a regression assertion that the relocated loader still searches the
  same repository/package-root fallback.
- Packaged-app launch was not repeated; package lookup behavior and packaging
  configuration were not changed beyond preserving the loader's existing
  `__dirname` fallback root.
