# Windows Startup Resilience V2 Development

- Branch: `codex/windows-startup-resilience-v2`
- Base branch: `dev`
- Start date: 2026-09-15
- Status: local implementation and regression complete; Windows packaged CI pending

## User need and goal

Some Windows 10/11 users consistently fail before the application UI or normal application logs appear. Startup must prioritize showing a usable first screen, distinguish native/runtime failures from application and renderer failures, recover into a minimal safe mode, and produce a bounded diagnostic package that a user can provide to the developer.

## Scope

1. Replace navigation-only readiness with an explicit renderer bootstrap handshake and startup watchdogs.
2. Start the first window before optional memory, automation, notification, recommendation, and MCP services.
3. Strengthen bootstrap, Chromium, renderer, and launcher diagnostics without collecting configuration or credentials.
4. Improve the Windows external supervisor, including a stabilization window, production `--no-stdio-init`, safe fallback evidence, and short-lived command diagnostics.
5. Verify both packaged normal and safe startup in CI and add focused fault-injection contracts.

## Non-goals

- Enabling `--no-sandbox` by default.
- Disabling GPU acceleration in normal mode.
- Purchasing or configuring an Authenticode certificate.
- Changing feature behavior after successful startup.

## Design and stages

- Stage 01: truthful renderer readiness, early renderer error capture, main-process watchdogs, and phase logging.
- Stage 02: first-screen-first server lifecycle and deferred isolated optional services.
- Stage 03: Windows launcher stabilization and diagnostic bundle improvements.
- Stage 04: packaged normal-mode CI verification and startup fault-injection coverage.

## Decisions and tradeoffs

- `--disable-gpu` remains a safe-mode compatibility switch because making it universal increases CPU rendering cost.
- `--no-sandbox` remains opt-in for diagnosis only because it removes a security boundary.
- `--no-stdio-init` will be considered for packaged Windows launches because the GUI does not depend on standard streams and Electron documents it as protection for systems with a disabled NUL device.
- UI readiness must not depend on successful network access or optional providers; it proves that the local shell and critical renderer lifecycle are usable.
- Authenticode signing remains a release/infrastructure decision requiring certificate ownership and user approval.

## Verification and remaining work

Before implementation, the current `dev` build passed normal and safe startup probes, displayed the Dashboard in a real Electron window, passed 22 focused startup tests, two composed-script structure tests, and the browser UI smoke test with 308 fixture requests. These checks also exposed that packaged Windows CI exercised safe mode but not the normal application graph.

Stage records will contain detailed implementation results and tests. A full unit suite remains required before merging this completed parent into `dev` and requires explicit user approval.

The implementation was consolidated into the Stage 01 branch because renderer
readiness, first-screen service deferral, supervisor behavior, and packaged CI
form one tightly coupled startup contract. The stable design is documented in
[`../../architecture/startup-resilience.md`](../../architecture/startup-resilience.md).
The completed implementation record is archived at
[`../archive/2026-09-15-windows-startup-resilience-v2-01-readiness-development.md`](../archive/2026-09-15-windows-startup-resilience-v2-01-readiness-development.md).

Completed verification on the implementation branch:

- 40 focused startup, renderer, HTTP runtime, logging, and Windows packaging
  contract tests passed.
- A real normal Electron startup reached `view-dashboard-beta` with zero
  captured renderer errors, settled deferred services, and exited cleanly.
- A real minimal safe-mode startup reached its explicit readiness marker and
  exited cleanly.
- The browser UI smoke test passed with 311 fixture requests.
- A real port collision on the configured UI port recovered onto an ephemeral
  loopback port and reached renderer readiness.
- Workflow YAML parsed successfully and `git diff --check` passed during
  implementation.

The explicitly approved full unit suite completed across 332 test files: 1,745
tests passed, zero failed, and one Windows-only integration test was skipped on
macOS. The remaining platform gate is the Windows release workflow's
authoritative C# compilation plus packaged normal/safe probe.
No commit, branch merge, push, tag, package publication, or release has been
performed.
