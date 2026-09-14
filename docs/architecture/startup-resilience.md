# Application Startup Resilience

## Purpose

BlogGenius startup is successful only when a usable local renderer shell has
completed its critical initialization. Loading a URL or creating a window is
not sufficient evidence. Startup recovery is designed to leave useful evidence
even when the normal application logger never loads.

## Startup sequence

1. The Windows launcher creates the diagnostic directories and starts Chromium
   file logging before Electron starts.
2. The Electron bootstrap logger records the run ID, runtime versions, paths,
   single-instance decision, and every application-module load boundary.
3. The loopback UI server starts without waiting for memory, automation,
   notifications, recommendation delivery, or remote MCP.
4. `ui/startup-guard.js` loads before the composed application script and
   captures bounded `error` and `unhandledrejection` evidence.
5. The renderer lifecycle marks readiness only after critical navigation is
   bound and an active view exists. Electron independently polls this marker.
6. Memory and optional services start after renderer readiness. Each boundary
   is isolated and time-bounded so failure cannot retract the usable first
   screen.

The Electron process also watches for startup timeout, failed navigation,
renderer loss, GPU-process loss, and a persistently unresponsive window.

## Node outbound network policy

The application keeps IPv4 and IPv6 available. At process entry, Node's network
family-selection attempt window is widened from its short default to 1500ms.
This accommodates public endpoints whose IPv4 TCP handshake is slower while an
advertised IPv6 route is unavailable, without breaking IPv6-only or NAT64
networks. The policy applies to the Electron main/application server process;
Chromium and launched browser processes retain their own network stacks.

Provider-specific compatibility remains explicit. Telegram retries a failed
dual-stack connection over IPv4 only for network-family errors. Telegram inbound
long polling uses IPv4 directly because a failed family race otherwise produces
rapid repeated requests. Authentication, permission, conflict, and rate-limit
responses never trigger an IPv4 retry.

Local capabilities and channel adapters call the running UI API through the
loopback origin derived from the canonical `LISTEN_PORT`. `LISTEN_HOST` controls
server binding only; `0.0.0.0` is never used as a client destination. There is no
separate `UI_SERVER_PORT` setting.

## Windows supervisor and safe mode

The distributed `BlogGenius.exe` is a small external supervisor. The Electron
binary is installed next to it as `BlogGenius-runtime.exe`. This boundary can
observe native/runtime termination that happens before JavaScript executes.

Normal startup keeps GPU acceleration and Chromium sandboxing enabled. The
supervisor adds `--no-stdio-init` because the packaged GUI does not use standard
streams and this protects startup on Windows systems whose NUL device is
unavailable. After the renderer-ready checkpoint, normal startup must remain
alive for a short stability window.

If normal startup exits or times out before readiness, the supervisor retries
once with:

- `--bloggenius-safe-mode`
- `--disable-gpu`
- `--no-stdio-init`

Safe mode loads a separate minimal loopback page and does not load the normal
application module graph or start memory and background features. It exists for
diagnosis and recovery guidance, not normal operation.

Electron/Chromium command-line switches supplied by the user are passed through,
so `--disable-gpu` and `--no-sandbox` are accepted. `--no-sandbox` is never
added automatically because it removes a security boundary. `--disable-gpu` is
not a normal default because software rendering can increase CPU use and reduce
graphics performance.

## Diagnostics

On Windows the stable root is:

`%LOCALAPPDATA%\BlogGenius`

Relevant files are:

- `logs\launcher.log`: launcher entry, Windows build, process architecture,
  runtime version, attempts, checkpoints, timeouts, and decimal/hex exit codes.
- `logs\bootstrap.log`: earliest JavaScript phases, run IDs, module boundaries,
  renderer evidence, readiness, service settlement, and shutdown.
- `logs\chromium-normal.log` and `logs\chromium-safe.log`: Chromium/native
  process output captured independently from the application logger.
- `logs\*.log`: bounded operational logs, including error stacks in production.
- `crashes\`: local Electron crash dumps. Dumps are not uploaded automatically.
- `diagnostics\BlogGenius-diagnostics-*.zip`: bounded support bundle created
  after failed startup or successful safe-mode recovery.

If LocalAppData cannot be used, startup falls back to the system temporary
directory. All persistent log files rotate at bounded sizes. Diagnostic bundles
include only a bounded number and size of recent logs and crash dumps; users
must send a bundle explicitly.

When handling a report, request the newest ZIP first. Correlate entries by the
bootstrap `runId` and compare the last phase with the launcher exit code. An
exit such as `-36861` should also be read in its unsigned hexadecimal form
(`0xFFFF7003`); the phase evidence is required to determine whether it occurred
before Electron, in the main process, or in the renderer.

## Verification gates

Focused contracts cover early logging, safe-mode isolation, explicit renderer
readiness, deferred services, port-conflict fallback, command-line policy, log
bounds, and diagnostic packaging. The browser smoke test covers the composed UI
flow. Windows release CI compiles the supervisor, probes `--version`, then runs
packaged normal and safe renderer-ready probes and verifies clean process exit.

The Windows CI runner is the authoritative compilation check for the C#
supervisor. Local non-Windows tests validate its source contract but do not
replace compilation and packaged execution on Windows.
