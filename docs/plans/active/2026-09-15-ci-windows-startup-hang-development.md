# CI Windows Startup Hang Fix

- branch: `codex/fix/ci-windows-startup-hang`
- base/parent: `release/v0.5.0`
- started: 2026-09-15
- status: in_progress

## Problem

`Verify Packaged Windows Startup` hung 17m58s until manually cancelled. The only
unbounded wait is the `--version` probe (`Start-Process -Wait`, no timeout).
Suspected root cause: the Electron runtime ignores `--version` and launches the
full GUI (no explicit handling in our code), so it never exits on headless CI.

## Changes

1. Bound the `--version` probe (120s + kill + launcher.log dump).
2. `timeout-minutes: 25` backstop on the win build job.
3. Explicit `--version`/`--help` handling in `electron-main.js` (print + exit(0)
   before window creation), independent of Electron internals.
4. Upload launcher/chromium/bootstrap logs as artifacts on failure.

## Verification

- Contract tests for the new handling + existing unit suite.
- Real CI run on next tag (user-triggered).
