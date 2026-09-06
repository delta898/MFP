# Windows Update Helper Launch PoC

- Branch: `codex/poc/windows-update-helper-launch`
- Base/parent branch: `release/v0.4.3`
- Start date: 2026-09-06
- Status: In progress

## User need

Windows self-update repeatedly downloads and extracts the update, but the PowerShell apply helper exits before its script body starts. The same behavior was reproduced on two Windows computers. Before changing BlogGenius again, the helper launch boundary needs a small, isolated proof of concept.

## Goal

Reproduce the current packaged-Electron launch failure and compare it with a safer two-step launcher without replacing application files. Capture enough evidence to distinguish a process-launch defect from Windows trust or policy enforcement.

## Scope

- Package a minimal unsigned Electron application with the same Electron dependency used by BlogGenius.
- Compare the current detached PowerShell launch with a non-detached bootstrap that uses local `Start-Process` for the long-lived helper.
- Verify that the helper starts and remains alive after the Electron parent exits.
- Record executable/script signature state and relevant Windows policy event summaries.
- Store all PoC output under a new temporary directory.

## Non-goals

- Do not modify or replace BlogGenius application files.
- Do not change the production updater yet.
- Do not bypass Windows security policy.
- Do not publish or tag a release as part of the PoC.

## Proposed design

The packaged PoC executable accepts one launch mode. Each mode starts a harmless helper which writes a ready marker, waits until the Electron parent exits, and writes a survived marker.

1. `current`: reproduce `spawn(powershell, ..., { detached: true })`.
2. `bootstrap`: start a short PowerShell bootstrap without Node's detached flag; the bootstrap uses Windows `Start-Process` to launch the helper independently.

A PowerShell runner executes both modes sequentially, checks their marker files, records Authenticode state, and captures relevant policy events when accessible.

## Decisions and tradeoffs

- `-EncodedCommand` is not the primary candidate because it changes argument transport but does not avoid Node/libuv's Windows detached-process behavior.
- A native updater executable remains a possible long-term choice, but it adds a new binary and build boundary before the actual launch defect has been isolated.
- Code signing is observed separately. An unsigned package may produce reputation warnings or policy blocks, but unsigned status alone does not explain PowerShell exiting with code 0 on multiple ordinary Windows systems.

## Verification plan

- Static contract test for the PoC's safety boundary and launch modes.
- Package and execute the PoC on Windows x64.
- Confirm the expected current-mode failure and bootstrap-mode success on the affected machines.
- Use the result to select the BlogGenius updater implementation.

## Automated verification

- `node --test scripts/windows-update-launch-poc.test.js`: passed (2 tests)
- `node --check scripts/windows/update-launch-poc/app/main.js`: passed
- Git diff whitespace check: passed
- Workflow YAML parse check: passed

Windows execution remains required because macOS cannot exercise the failing process-creation boundary.

## Progress

- Confirmed that the current updater launches PowerShell with `detached: true`.
- Found matching Node.js/libuv Windows behavior: the detached flag applies `DETACHED_PROCESS`, and PowerShell may exit before executing its script without a console handle.
- Confirmed that current unit tests mock the ready marker and therefore cannot exercise this OS boundary.
- Added a minimal packaged Electron harness comparing the current detached launch with a two-step `Start-Process` bootstrap.
- Added a harmless marker-based runner and Windows trust/policy evidence report.
- Added an isolated Windows Actions workflow so the PoC is exercised by an actual unsigned packaged executable.

## Result

The isolated PoC and evidence collector are ready. Final result is pending execution of the unsigned packaged PoC on Windows.
