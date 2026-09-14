# Agent Memory SQLite V2 Development

## Branch

- Branch: `codex/feature/agent-memory-sqlite-v2`
- Base branch: `dev`
- Start date: 2026-09-14
- Status: active

## User Need

The deployed Kuzu-backed agent memory can grow from a small logical data set to multiple gigabytes. Kuzu is no longer maintained, and loading its native component also expands the Windows startup failure surface. Recommendation memory is rebuildable, but topic, activity, relationship, and insight behavior must continue to work through the replacement store.

## Goal

Replace Kuzu with an Electron-bundled SQLite V2 memory store, preserve the public memory and recommendation contracts, bound data retention and physical growth, then retire legacy Kuzu V1 files only after SQLite passes a startup health gate.

## Scope

- SQLite V2 event-first persistence with explicit entities and relations.
- Recommendation lifecycle storage without repeated mutable JSON rewrites.
- Existing content-topic, keyword, recommendation, activity, handoff, and owner-profile integrations.
- Bounded retention, WAL maintenance, integrity checks, and disposable-store recovery.
- Seamless V2 cutover, Kuzu dependency removal, and idempotent legacy V1 cleanup.
- Windows packaged-startup and storage-growth verification.

## Non-goals

- Migrating Kuzu V1 recommendation or memory history into V2.
- Changing account, credential, configuration, writing, or publishing storage.
- Release version changes, tagging, pushing, packaging publication, or deployment.
- Adding a remote graph database or vector-search provider.

## Design

SQLite is the physical store while graph semantics remain in the memory contract. Immutable events are recorded first, typed domain tables and relation tables preserve evidence links, and bounded insight projections provide efficient reads. Local owner identity remains in `data/identity/owner.json`.

The feature is split into two reviewable stages:

1. [SQLite V2 Store](../archive/2026-09-14-agent-memory-sqlite-v2-store-development.md): storage adapter, schema, contract parity, recommendation integration, insight projection, and retention. Completed and integrated into the parent.
2. [Kuzu Retirement](../archive/2026-09-15-agent-memory-sqlite-v2-retirement-development.md): activate V2 by default, apply the health gate and fallback, remove the Kuzu runtime, and clean V1 files after V2 succeeds. Completed; awaiting parent integration.

## Decisions and Tradeoffs

- V1 history is discarded rather than migrated because it is rebuildable recommendation/intelligence data and reading the oversized native DB during upgrade adds risk.
- `node:sqlite` is preferred over another npm native addon because Electron 44 already bundles it; the adapter boundary contains its release-candidate API risk.
- Raw facts have bounded retention while compact insight projections retain decayed long-term learning.
- V2 never falls back to opening V1. A V2 failure disables intelligent memory for that run while core application workflows continue.

## Progress

- Confirmed Electron 44.2.0 can load `node:sqlite` and provides SQLite JSON, FTS5, and recursive CTE support.
- Diagnosed the current 2,139 MB Kuzu file: about 71% free pages and a 512 MB recommendation JSON allocation for roughly 5.7 MB of current JSON.
- Verified a lossless Kuzu export/import rebuild reduces the same logical data to about 43 MB, confirming physical amplification rather than legitimate content volume.
- Completed and integrated the bounded SQLite V2 store stage into this parent at `c7c8e5b`.
- The cutover stage now selects SQLite exclusively, health-gates legacy deletion, quarantines/reseeds damaged V2 files, schedules retention, and removes the Kuzu runtime and packaging dependency.

## Verification Plan

- Focused SQLite schema, transaction, lifecycle, retention, and fallback tests during implementation.
- Real-file high-churn and repeated-reopen storage-growth regression.
- Existing recommendation, memory, API, and browser integration tests.
- Windows packaged `--version`, startup, V1-upgrade, cleanup-retry, and safe-mode checks.
- Full unit suite before each completed stage merge, subject to explicit approval.

## Manual Checks Still Required

- Upgrade from a large V1 database on affected Windows 10 and Windows 11 systems.
- Confirm the UI appears, fresh content recommendations are generated, handoff works, and V1 files are eventually removed.

## Remaining Risks

- `node:sqlite` is release-candidate API in the Electron 44 Node runtime, so all direct calls must stay behind the adapter.
- Synchronous SQLite operations must remain short and bounded to avoid blocking Electron's main process.
- File locks can delay cleanup on Windows; deletion must remain retryable and non-fatal.
