# Windows Self-update Bootstrap

- Branch: `codex/fix/windows-self-update-bootstrap`
- Base/parent branch: `release/v0.4.3`
- Start date: 2026-09-06
- Status: In progress

## User need

On multiple Windows computers, BlogGenius downloaded and extracted an update but restarted without applying it. A packaged Electron PoC reproduced the failure and proved a launch method that survives the parent process.

## Goal

Apply the verified Windows launch method to BlogGenius, make restart failures visible instead of simulating a restart with a page reload, and preserve the existing update integrity and completion-receipt behavior.

## Scope

- Start a short PowerShell bootstrap without Node's Windows detached flag.
- Let the bootstrap use local `Start-Process` to launch the existing update helper independently.
- Keep the ready handshake before BlogGenius exits.
- Preserve SHA-256 validation, extracted source validation, file replacement, relaunch, failure markers, and completion receipt.
- Show restart-launch failures in the update progress UI and keep the running app open.
- Add focused regression coverage for the process boundary and UI behavior.

## Non-goals

- No change to update downloads, release discovery, or macOS apply behavior.
- No change to Windows signing or installer format.
- No version bump, tag, packaging, or release publication in this branch.

## Design

The application writes the existing long-lived apply helper and a new short bootstrap script. It starts the bootstrap as a normal child process. The bootstrap launches the apply helper with `Start-Process` and exits. BlogGenius waits for the apply helper's ready marker; only then does it exit. This avoids Node/libuv's `DETACHED_PROCESS` behavior while keeping the apply helper alive after the parent exits.

The renderer awaits the restart endpoint. If it fails, it shows the returned error and restores usable update controls. It does not reload the page and therefore cannot make a failed restart look successful.

## Decisions and evidence

- The packaged Electron 44.2.0 PoC reproduced the current detached PowerShell exit with code 0 and no script log.
- The same unsigned package succeeded with the normal bootstrap plus `Start-Process`; the helper survived the Electron parent.
- Changing only `-File` to `-EncodedCommand` was rejected because it does not remove the detached process flag that caused the reproduced failure.
- Windows trust status remains observable, but unsigned status alone did not prevent the verified bootstrap method from working.

## Implementation progress

- Added an ASCII bootstrap script beside the existing apply helper and JSON specification.
- The application launches the bootstrap without Node's detached flag.
- The bootstrap launches the long-lived helper through local `Start-Process` using an encoded helper invocation, then waits for the helper ready marker.
- BlogGenius now waits for both the helper ready marker and a clean bootstrap exit before closing.
- Kept the existing update apply, completion receipt, failure marker, relaunch, and preservation behavior.
- Removed the renderer's unconditional page reload after a restart request.
- Restart endpoint errors now remain visible in the update progress UI and leave controls usable.
- Added a Windows-only integration test that runs the production bootstrap, exits its parent process, applies a harmless sentinel file, and verifies completion state.
- Advanced the release checkpoint metadata to `0.4.3-dev8` for Windows integration and affected-machine acceptance.

## Verification

- Focused updater and PoC tests: 15 passed; Windows integration test skipped on macOS as designed.
- Full unit suite: 1,469 passed, 1 Windows-only integration test skipped, 0 failed.
- Browser UI smoke test: passed (202 fixture requests).
- JavaScript syntax, workflow YAML, and Git diff checks: passed.
- Actual Windows production-bootstrap workflow remains available through manual dispatch; branch push does not run it automatically.

## Result and remaining checks

The implementation is locally complete. Final acceptance is a packaged `dev7 -> dev8` BlogGenius update on an affected Windows machine. The Windows-only production-bootstrap workflow is available as an optional manual diagnostic and is not a release gate for this checkpoint.
