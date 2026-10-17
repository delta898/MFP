# Host Bootstrap Layer Migration

## Branch

- Branch: `codex/fbr/source-layer-host-bootstrap`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/source-layer-reorganization`
- Status: Verified; ready to merge into parent branch

## User Need and Goal

Move process startup and Electron lifecycle ownership into the accepted `src/host/` layer. Update actual launch paths and references so this is a boundary migration, not a folder-only move. Preserve startup behavior and packaged app behavior.

## Scope

- Move the Node/UI launcher from `src/main.js` into `src/host/`.
- Move Electron startup and its private support modules/tests from `src/gui/` into a host-owned Electron runtime location.
- Update package entrypoints, scripts, packaging globs, dynamic imports, path calculations, and structural contract tests that refer to the old paths.
- Update `src/README.md` and architecture documentation to reflect the resulting ownership.

## Explicit Non-goals

- Do not reorganize `ui-api/`, `ui-runtime/`, `ui/`, MCP/channel ingress, or product Applications in this slice.
- Do not change startup behavior, user-data paths, runtime configuration, launch flags, or recovery policy.
- Do not remove the launcher or Electron startup functionality.
- Do not commit, merge, push, or release without the user's request.

## Design and Migration Stages

1. Trace all references to `src/main.js`, `src/gui/`, runtime-relative paths, and packaging/test contracts.
2. Move launcher and Electron lifecycle modules under `src/host/` while keeping their behavior intact.
3. Update every launch/packaging/test caller and verify no production caller points to the old paths.
4. Run focused startup and packaging contract tests; report any manual packaged-launch check needed.

## Decisions and Tradeoffs

- 2026-10-17: The user authorized a staged source-layer reorganization and emphasized that dependency/call paths must change with ownership.
- 2026-10-17: `main.js` and `gui/` are selected as the first code slice because their observed responsibilities are process bootstrap, Electron lifecycle, and startup recovery, which map directly to `host/`; they do not own product workflow policy.
- Preserve `src/ui-api/`, `src/ui-runtime/`, and `ui/` for later slices; the accepted architecture treats their presentation and routing boundaries separately.

## Progress

- 2026-10-17: Created this child branch from `codex/fbr/source-layer-reorganization`.
- 2026-10-17: Reference audit found `package.json` Electron/UI entrypoints, the Node launcher’s dynamic Electron import, a packaged script inclusion, Electron-relative asset/UI/config paths, and startup contract tests with direct `src/gui/` paths.
- 2026-10-17: Moved the Node launcher to `src/host/launcher.js` and Electron startup/support modules to `src/host/electron/`; updated internal require paths, icon path, package entrypoints, launch script, pkg inclusion, and current contract test references.
- 2026-10-17: Updated the directory map and current architecture notes to record Host ownership. No startup policy or user-data location was intentionally changed.
- 2026-10-17: The first focused test run exposed one stale assertion expecting the pre-move `ui-server` import path (39 passed, 1 failed); the assertion was updated. A follow-up active-reference search also caught the launcher's string-based Electron import, which was updated and covered by a new entrypoint contract assertion.
- 2026-10-17: Final focused verification passed (41 passed, 0 failed).

## Verification and Remaining Work

- The final focused set passes: 41 tests across Host startup, package entrypoint, packaged-asset configuration, and Dashboard’s native Electron menu contract. `node --check` passes for both Host entrypoints. A source/config/docs search finds no active references to `src/main.js`, `src/gui/`, or `gui/electron-main` outside historical records and this development plan.
- The user confirmed that the Dashboard launches and exits normally from this branch.
- Packaged-app launch was not separately checked; automated checks do not validate a packaged launch.
