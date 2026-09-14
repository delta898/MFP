# Windows Startup Resilience Development Record

## Branch

- Branch: `codex/fix/windows-startup-resilience`
- Base/parent branch: `dev`
- Start date: 2026-09-14
- Status: completed; parent merge approved

## User Need

Some Windows 10 and Windows 11 users consistently cannot launch BlogGenius. A Windows 11 25H2 report records exit code `-36861` (`0xFFFF7003`) even for `--version`, with no application log. The product must preserve enough evidence to diagnose failures, recover into a reduced startup mode where possible, and clearly guide the user when recovery also fails.

## Goal

Establish a layered Windows startup path that can observe failures before Electron JavaScript starts, retain early boot evidence once JavaScript starts, retry one early abnormal exit in a constrained safe mode, and produce a privacy-conscious diagnostic package for developer support.

## Scope

- Add an application-independent Windows launcher with a normal-start/one-time-safe-retry contract.
- Add dependency-light Electron bootstrap logging and fixed writable log/crash locations.
- Add explicit normal and safe startup modes.
- Prevent optional memory, MCP, automation, and background services from blocking safe-mode UI startup.
- Record main, renderer, GPU/utility child, navigation, and promise failures.
- Provide an actionable failure dialog and diagnostic collection path.
- Add focused contracts and a packaged Windows startup gate to the release workflow.
- Keep the packaged Electron runtime and updater paths compatible with the launcher layout.

## Explicit Non-goals

- Do not enable `--no-sandbox` by default or as an automatic recovery option.
- Do not automatically upload logs or private user data.
- Do not claim that safe mode resolves every `0xFFFF7003` failure; failures before Electron JavaScript may remain environment- or runtime-specific.
- Do not publish, tag, merge, or release as part of this branch without separate user approval.
- Do not change unrelated Blog UI or design-system behavior.

## Proposed Design

The Windows release root will contain a minimal native launcher and a renamed Electron runtime. The launcher writes its own log before creating Electron, passes an absolute readiness-marker path, and watches until the runtime either creates the marker or exits. An abnormal exit before readiness triggers exactly one safe-mode attempt. A second early failure stops the loop and presents the diagnostic directory to the user.

Electron startup will use a dependency-light bootstrap logger before loading the application graph. Safe mode disables hardware acceleration and skips optional native memory, remote MCP, automation, Telegram, RSS, recommendation-delivery, and startup-discovery work while retaining the local UI and settings path. `--no-sandbox` remains a manual diagnostic-only switch.

## Affected Boundaries

- `src/gui/` Electron startup and diagnostics
- `src/ui-server.js` and `src/ui-runtime/http-server-runtime.js` startup options
- `src/memory/` optional native memory initialization
- `src/updater.js` packaged executable/relaunch ownership
- `scripts/windows/` native launcher, installer, and packaging verification
- `.github/workflows/build.yml` Windows package construction and startup gate
- Focused launcher, startup, logging, and packaging tests

## Decisions and Tradeoffs

- Use an external launcher because an Electron process cannot log or relaunch itself if it exits before JavaScript begins.
- Retry only an abnormal pre-readiness exit and only once, preventing crash loops and avoiding fallback after a normal user exit.
- Keep hardware acceleration enabled in normal mode. Safe mode may disable it at a performance cost.
- Never add `--no-sandbox` automatically because it removes Chromium process isolation and creates a material security regression.
- Store diagnostics under `%LOCALAPPDATA%\BlogGenius` with a temporary-directory fallback instead of relying on the installation directory being writable.
- Generate local diagnostic material only; transmission remains an explicit user action.

## Implementation Stages

1. Add startup contracts, bootstrap logging, Electron failure events, and safe-mode service boundaries.
2. Add and package the Windows launcher with readiness handshake and one-time fallback.
3. Preserve updater and installer behavior with the launcher/runtime split.
4. Add focused automated verification and a packaged Windows startup gate.
5. Document results, remaining compatibility risks, and manual Windows checks.

## Progress

- 2026-09-14: user approved separate-branch implementation of early logging, normal-to-safe fallback, and developer-facing crash diagnostics.
- 2026-09-14: created this branch from clean `dev` at `8d4763e`.
- 2026-09-14: confirmed the existing Playwright browser uses sandbox-disabling arguments, while the Electron UI process has no explicit GPU or sandbox startup policy.
- 2026-09-14: confirmed `0xFFFF7003` is a Crashpad handler-registration termination code and that `--version` failure places the highest-priority boundary before the application dependency graph.
- 2026-09-14: added the dependency-light launcher/bootstrap log chain, fixed diagnostic directories, crash-dump collection, Electron fatal-process coverage, and a minimal safe-mode UI that does not load the normal application graph.
- 2026-09-14: kept Chromium sandboxing enabled in all automatic paths; safe mode disables GPU acceleration and optional/background services only.
- 2026-09-14: integrated the launcher/runtime split into GitHub Actions, local Windows packaging, icons, and updater relaunch ownership.
- 2026-09-14: changed the supervisor to exit as soon as renderer readiness is recorded. This preserves Windows updater compatibility by ensuring the launcher executable is no longer locked while the app is running.
- 2026-09-14: added a clean startup-probe switch so CI can verify packaged safe-mode rendering without force-killing the runtime and accidentally generating a false crash report.

## Verification Plan

- Focused Node tests for startup option normalization, safe-mode service suppression, diagnostics, and packaging contracts.
- Static native-launcher contracts for early failure, safe retry, readiness, loop prevention, packaging, and icon preservation.
- Windows CI package probe for `--version`, safe-mode renderer readiness, and clean probe shutdown.
- Existing focused UI/server tests for any startup boundary changed.
- Full unit suite only after explicit user approval, as required before merge.

## Current Risks

- A Crashpad failure occurring before Electron JavaScript may also affect the safe-mode Electron attempt; the launcher improves evidence and guidance but cannot repair an incompatible Electron binary or blocked process creation.
- Introducing a launcher/runtime split touches updater and installer assumptions about `process.execPath`; these paths require focused integration coverage.
- A native launcher must avoid new runtime dependencies and ultimately be code-signed together with the Electron executable and installer for production trust.
- Safe mode must not mutate or erase the user's normal profile, configuration, or last valid local data.

## Result

The branch now implements a two-layer startup safety system. The external Windows launcher records evidence before Electron starts and retries one pre-readiness abnormal exit in safe mode. Electron then records phase and process failures from its earliest JavaScript entry, writes readiness and crash material to a stable location, and uses a dependency-minimal safe screen when recovery is required. A double failure produces a local diagnostic ZIP and explicit support guidance without automatic upload.

Focused and full automated verification passed on the current host. Native compilation and packaged startup behavior remain gated by the Windows GitHub Actions job because the current development host is macOS.

### Focused Verification (2026-09-14)

- JavaScript syntax checks passed for the Electron entry, startup helpers, safe server, UI startup boundaries, and updater.
- 40 focused Node tests passed covering startup policy/bootstrap, Electron ordering contracts, minimal safe mode, optional-service suppression, updater behavior, and Windows packaging contracts.
- The approved full unit suite passed: 1,710 passed, 0 failed, and 1 Windows-only integration test was skipped on the macOS host (1,711 total).
- `git diff --check` passed.
- Native C# compilation and the packaged Electron probe cannot run on the current macOS host; the Windows 2025 build job now performs both checks before release assets are assembled.
