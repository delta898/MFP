# Agent Memory SQLite V2 Cutover and Kuzu Retirement Development

## Branch

- Branch: `codex/feature/agent-memory-sqlite-v2-retirement`
- Base/parent branch: `codex/feature/agent-memory-sqlite-v2`
- Start date: 2026-09-15
- Status: complete; committed and ready for parent integration

## User Need and Goal

Activate the bounded SQLite V2 store seamlessly for deployed users, never reopen the oversized Kuzu V1 database, and remove V1 only after V2 has passed a durable health gate. A damaged disposable V2 store must be quarantined and rebuilt without preventing the main application UI from starting.

## Scope

- Select SQLite V2 as the only persistent agent-memory backend.
- Verify schema generation, integrity, owner identity, and a write/read/delete probe before declaring V2 healthy.
- Quarantine a failed V2 database family and retry once with a fresh database.
- Keep core application workflows available through the bounded volatile/disabled fallback if reseeding fails.
- Run bounded retention and physical maintenance without delaying startup indefinitely.
- Delete legacy `agent_memory_db` only after the V2 health marker is durable; retry non-fatally when Windows file locking prevents deletion.
- Remove Kuzu runtime imports, dependency, reset tooling, warnings, and stale documentation.
- Add startup, recovery, cleanup, and package-contract tests.

## Non-goals

- Importing any Kuzu V1 content.
- Preserving disposable recommendation history across the cutover.
- Changing owner identity in `data/identity/owner.json`.
- Release version changes, packaging publication, deployment, or pushing branches.

## Proposed Design

`src/memory/store.js` remains the composition boundary. It constructs SQLite V2 without touching Kuzu, initializes it behind a single promise, and invokes a lifecycle helper that owns health markers, quarantine, bounded maintenance, and legacy cleanup. The marker is written atomically only after a transactional write/read/delete probe and `quick_check` succeed. V1 cleanup is idempotent and never makes initialization fail.

The V2 database family consists of the main file plus `-wal` and `-shm`. Corrupt or incompatible files are renamed into a bounded quarantine location before one clean retry. Old quarantine files are capped. Physical size thresholds trigger increasingly strong local maintenance; exceeding the disposable-store rebuild threshold quarantines and reseeds on a later controlled initialization rather than opening V1.

## Implementation Stages

1. Codify lifecycle paths, health marker, atomic writes, quarantine, and cleanup behavior.
2. Switch the production memory composition root to SQLite V2 with one-shot recovery and fallback.
3. Schedule bounded maintenance and expose safe diagnostics.
4. Remove Kuzu dependency/imports/scripts and update architecture and decision documents.
5. Run focused startup, storage, recommendation, and package-contract regression tests.

## Decisions and Tradeoffs

- V1 cleanup is gated by V2 health, but V1 is never used as a fallback.
- V2 is disposable; quarantine plus reseed is safer than complex in-place repair.
- Cleanup failures are logged and retried on later starts because Windows file locks are expected operational conditions.
- Synchronous SQLite work stays bounded and maintenance is deferred from the critical UI startup path.

## Verification Plan

- Focused lifecycle tests for first launch, existing healthy V2, corrupt V2, failed reseed, marker durability, and locked V1 cleanup.
- Memory and recommendation service regression tests.
- Package and source inventory checks proving Kuzu is no longer shipped or imported.
- Full unit suite before parent merge, subject to explicit approval.

## Progress

- Replaced the Kuzu composition root with a stable SQLite V2 facade. Calls made before normal UI startup now pass through the same health gate instead of opening the database directly.
- Added generation validation, transactional write/read/delete probing, `quick_check`, and atomic health-marker persistence.
- Added one-shot corrupt/oversized V2 quarantine and fresh-store recovery. A second failure swaps the facade to bounded volatile/disabled memory without breaking existing service references.
- Added idempotent post-health cleanup for the exact Kuzu V1 file family; Windows lock failures are retained for the next startup and do not block the UI.
- Added bounded quarantine retention, six-hour background retention maintenance, 128/256/512MB physical thresholds, and clean SQLite shutdown from Electron's `before-quit` boundary.
- Removed Kuzu source, recommendation repository, compatibility service, manual reset/debug scripts, npm dependency, native unpack rules, and packaged source cleanup.
- Updated Telegram wording, architecture documentation, and the accepted SQLite V2 decision record.

## Verification

- Lifecycle/store focused tests: 27 passing, including a real corrupt SQLite file, future-generation rejection, fresh reseed, durable marker, and post-health legacy directory deletion.
- Memory, recommendation, content-topic, keyword-discovery, package, and Windows packaging focused regression: 266 passing, 0 failing.
- Electron startup and UI server boundary regression: 14 passing, 0 failing.
- Package-lock-only install audit: consistent dependency tree and zero reported vulnerabilities; Kuzu is absent from manifests and lock data.
- Full unit suite: 1,734 passing, 0 failing, 1 Windows-only test skipped on macOS.

## Final Result

SQLite V2 is now the sole persistent Agent Memory backend. Startup and early
service calls share one health gate, damaged or oversized disposable memory is
quarantined and reseeded, and Kuzu V1 is deleted only after a durable V2 success.
Kuzu is no longer imported, packaged, or declared as a dependency. Existing
topic, activity, recommendation, feedback, and handoff consumers retain their
public memory contract.

## Manual Checks Still Required

- Packaged Windows 10/11 upgrade with a large existing V1 directory.
- UI startup, recommendation regeneration, restart persistence, legacy cleanup, and deliberate corrupt-V2 recovery.

## Remaining Risks

- `node:sqlite` remains release-candidate API in Electron 44's Node runtime.
- Windows antivirus or filesystem locks may delay cleanup or quarantine rename; these operations must remain non-fatal and retryable.
