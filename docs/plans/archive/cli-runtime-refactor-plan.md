# CLI Runtime Refactor Plan

## Goal
- Reduce duplication caused by the legacy CLI-first structure.
- Keep the Electron/UI runtime as the primary product surface.
- Remove the user-facing CLI entry once shared runtime boundaries are stable.

## What Changed
- Extracted shared runtime helpers out of `src/main.js` and `src/ui-server.js`.
- Moved UI/session, quick publish, publish orchestration, trend actions, content actions, auto-runner state, auto-cycle orchestration, API route assembly, config file helpers, and HTTP server lifecycle into `src/ui-runtime/`.
- Simplified `src/main.js` into a UI launcher instead of a commander-based command surface.
- Removed the legacy command modules under `src/commands/`.
- Added canonical runtime boundary documentation in `docs/architecture/ui-runtime-boundaries.md`.

## Result
- `src/main.js` is now launcher-only.
- `src/ui-server.js` is primarily a composition root.
- Shared runtime/business logic is no longer organized around CLI commands.

## Follow-up
- Keep future runtime features UI-first.
- Avoid reintroducing command-only control paths for login, license, publish, or automation flows.
