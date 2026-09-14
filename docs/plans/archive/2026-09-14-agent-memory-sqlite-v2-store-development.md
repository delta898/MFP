# Agent Memory SQLite V2 Store Development

## Branch

- Branch: `codex/feature/agent-memory-sqlite-v2-store`
- Base/parent branch: `codex/feature/agent-memory-sqlite-v2`
- Start date: 2026-09-14
- Status: complete; ready for parent integration

## User Need and Goal

Implement a maintained, bounded local memory store that preserves the graph-shaped insight and recommendation behavior without Kuzu's native storage amplification. This stage must make SQLite V2 independently testable before it becomes the production default.

## Scope

- A `node:sqlite` adapter and V2 schema under `src/memory/`.
- Event-first domain tables, explicit relation tables, and efficient indexed insight queries.
- Public `KuzuEventStore`-equivalent memory contract implemented by SQLite.
- Recommendation creation, transitions, observations, cooldown, discovery, feedback, and handoff compatibility.
- Retention, integrity, WAL checkpoint, incremental vacuum, and size diagnostics.
- Focused real-database and service integration tests.

## Non-goals

- Selecting V2 as the production default in this stage.
- Opening, importing, or deleting Kuzu V1 data.
- Removing the Kuzu dependency before SQLite contract parity is verified.
- Release or deployment work.

## Proposed Design

- Keep async public methods while containing synchronous `node:sqlite` calls inside a small adapter.
- Store immutable event facts and recommendation candidates once.
- Update only mutable recommendation state fields during lifecycle transitions.
- Represent simple ownership with foreign keys and true many-to-many evidence links with join tables.
- Maintain bounded projection tables for owner topic affinity and other frequently requested summaries.
- Apply TTL plus per-owner caps in bounded maintenance batches after initialization.

## Implementation Stages

1. Inventory and codify the existing event-store API and query behavior.
2. Add the SQLite adapter, schema-version contract, transactions, health checks, and diagnostics.
3. Implement event, artifact, relation, profile, and insight operations.
4. Implement optimized recommendation persistence and preserve lifecycle contracts.
5. Add retention and physical-file maintenance.
6. Run focused contract, integration, and storage-growth verification.

## Decisions and Tradeoffs

- Typed relational tables are preferred over a fully generic EAV graph because current queries are fixed one-to-four-hop paths and benefit from foreign keys and targeted indexes.
- A generic relation projection may be retained for extensible insight traversal, but canonical domain ownership remains explicit.
- Empty V2 history is a known empty persistent history, not a storage failure; initial recommendation refresh must still create content suggestions.

## Progress

- Branch and development record created.
- Added a contained `node:sqlite` adapter with WAL, foreign keys, busy timeout, defensive mode, quick-check, checkpoint, incremental-vacuum, and physical diagnostics.
- Added the SQLite V2 event-first schema for owners, users, conversations, events, messages, actions, jobs, settings, artifacts, topic facets, preferences, domain knowledge, recommendations, and recommendation lifecycle events.
- Added bounded suggestion/confirmation projections and explicit suggestion-to-action relations so later feedback can reuse the original feedback identity without retaining an unbounded graph.
- Replaced mutable full-recommendation rewrites with immutable candidate/policy JSON plus scalar lifecycle updates. Observational events do not update the recommendation projection.
- Added topic-affinity projections that survive raw topic artifact retention and retain graph-shaped owner/topic insight.
- Connected topic registration, shopping memory, content-idea artifacts, activity evidence, owner profiles, feedback learning, recommendation center listing, interaction, and handoff to the SQLite store contract.
- Added bounded recommendation, event, message, artifact, and topic-insight maintenance.
- Extracted payload compaction into a storage-neutral codec; SQLite V2 no longer imports or inherits the Kuzu event store.
- A real-file stress check with 1,800 recommendation creations plus 1,800 rotations produced a 12.1 MB SQLite database with zero free pages, compared with the diagnosed 2,139 MB Kuzu file for a similar logical recommendation count.

## Verification

- SQLite repository and event-store tests: 15 focused cases passing, including transactions, identity, topic insight, activity projection, content-idea feedback, suggestion feedback, recommendation UI handoff, retention, and growth.
- Memory, recommendation, recommendation-center, recommendation-refresh, topic, and keyword-discovery focused regression: 245 tests passing.
- Full unit suite: 1,725 passing, 0 failing, 1 Windows-only test skipped on macOS.

## Manual Checks Still Required

- None for this non-default stage beyond reviewing behavior through focused integration fixtures. Packaged Windows acceptance belongs to the cutover stage.

## Final Result

SQLite V2 now provides the complete public memory-store contract without loading or inheriting Kuzu. It keeps graph-shaped insights through typed ownership, evidence, facet, and suggestion-action relations; stores immutable recommendation payloads once; and bounds raw facts and projections through explicit retention. Production selection and legacy retirement intentionally remain in Stage 2.

## Remaining Risks

- SQLite synchronous calls must be small and retention must be batched.
- Production cutover, corrupt-V2 quarantine/reseed, background maintenance scheduling, physical size thresholds, and V1 deletion remain in the Kuzu-retirement stage.
