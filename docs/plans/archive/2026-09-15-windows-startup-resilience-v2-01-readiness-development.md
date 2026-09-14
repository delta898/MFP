# Windows Startup Resilience V2 Stage 01: Readiness

- Branch: `codex/windows-startup-resilience-v2-01-readiness`
- Base/parent branch: `codex/windows-startup-resilience-v2`
- Start date: 2026-09-15
- Status: complete; approved for parent integration

## Goal

Make the startup success signal mean that the renderer has actually completed its critical local bootstrap, and ensure that missing, failed, or hung renderer initialization is logged and recovered before the Windows supervisor's outer timeout.

## Scope

- Add an independently loaded renderer startup guard before the composed application script.
- Capture bounded `error` and `unhandledrejection` evidence before application code executes.
- Add an explicit local readiness handshake after critical synchronous renderer setup.
- Log renderer console errors and startup milestones in the Electron main process.
- Add bounded startup and unresponsive watchdog behavior.
- Protect and identify early main-process phases such as user-data resolution, module loading, menu creation, window creation, and safe-mode relaunch.
- Update focused startup and UI composition tests.

## Non-goals

- Broad feature or visual changes.
- Enabling `--no-sandbox` or disabling GPU acceleration in normal mode.
- Authenticode certificate acquisition or release publication.

## Proposed contract

The static startup guard records renderer failures through a local same-origin endpoint. The composed renderer script marks its critical lifecycle complete only after the initial shell bindings and startup calls have been scheduled safely. The main process accepts readiness only after a bounded probe observes that marker. Navigation completion and first paint remain useful milestones but cannot independently mark startup successful.

## Verification plan

- Startup bootstrap/policy/Electron contract tests.
- UI composition and renderer script structure tests.
- Focused HTTP route tests for bounded renderer diagnostics.
- Normal and safe startup probes.
- Browser UI smoke when the complete readiness slice is reviewable.

## Progress and result

The stage was intentionally expanded to complete the tightly coupled startup
contract in one reviewable branch instead of leaving readiness dependent on
unfinished later stages.

- Added an independent renderer startup guard before the composed application
  bundle, with bounded early error and rejected-promise capture.
- Replaced `did-finish-load` success with an explicit renderer lifecycle
  handshake that requires critical navigation binding and an active view.
- Added main-process startup/module/window phases, global startup and renderer
  watchdogs, renderer console evidence, GPU/renderer loss handling, and bounded
  safe relaunch behavior.
- Moved SQLite memory and optional automation, Telegram, Card News,
  recommendation, SNS discovery, and remote MCP startup behind the first-screen
  checkpoint. Optional failures are isolated and recorded.
- Added single-instance handling and recovery from a configured loopback port
  collision to an ephemeral loopback port.
- Kept Playwright out of the initial module graph.
- Strengthened bootstrap and operational log rotation, run correlation, error
  stacks, and write-failure fallback.
- Upgraded the Windows external launcher with Windows/runtime evidence,
  Chromium file logging, a readiness stability window, safe-mode recovery, and
  bounded ZIP diagnostics.
- Added packaged normal and safe startup probes to Windows release CI.

Verification completed:

- 40 focused tests passed.
- Real normal and safe Electron startup probes passed with clean exit.
- Normal readiness reported `view-dashboard-beta`, navigation bound, and zero
  captured renderer errors; deferred services settled before probe exit.
- Browser UI smoke passed with 311 fixture requests.
- A configured-port collision recovered to an ephemeral local port in a real
  Electron probe.

Windows launcher source compilation cannot be performed on the current macOS
host because the release launcher uses the Windows .NET Framework compiler.
The release workflow remains the authoritative compiled/package test. The
explicitly approved full unit suite completed across 332 files with 1,745
passing tests, zero failures, and one expected Windows-only integration skip.
