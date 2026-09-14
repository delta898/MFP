# SQLite V2 for Local Agent Memory

## Status

Accepted on 2026-09-15.

## Context

The Kuzu-backed local memory reached 2,139MB while its live logical content was
roughly 13.5MB. About 71% of the file was free pages, and repeated recommendation
lifecycle updates had accumulated a large stale string heap. A clean export and
import reduced the same logical data to about 43MB. Kuzu is also no longer
maintained, and its native runtime increases Windows packaging and startup risk.

The memory is useful for recommendations and derived insight but is not critical
user-owned business data. Local owner identity is already stored independently.

## Decision

Use Electron 44's bundled `node:sqlite` runtime for Agent Memory V2. Preserve the
logical graph through typed tables, foreign keys, join tables, and bounded insight
projections. Keep source events immutable, write recommendation candidate/policy
JSON once, and update only scalar lifecycle state.

V2 starts empty. Kuzu V1 is never opened or migrated. After V2 passes generation,
transactional probe, and integrity checks and writes a durable marker, exact V1
paths are deleted. A corrupt or oversized V2 is quarantined and rebuilt once; a
second failure degrades only intelligent memory for that run.

## Consequences

- Recommendation, topic, activity, feedback, and profile consumers keep the same
  async memory-store contract.
- Raw data and projections have explicit TTLs and caps, with periodic bounded
  maintenance and physical size thresholds.
- Owner identity survives reseeding, while recommendation history may disappear.
- No Kuzu native module or source tree is shipped in desktop packages.
- Direct `node:sqlite` usage remains behind a small adapter because its Node 24
  API is still release-candidate quality.

## Alternatives Considered

- Keep Kuzu and periodically rebuild it: preserves the engine but retains an
  unmaintained native dependency and repeats the amplification risk.
- SQLite without graph projections: simpler storage, but weakens efficient owner,
  topic, evidence, and feedback insight queries.
- DuckDB or embedded PostgreSQL-compatible runtimes: stronger for analytical or
  server workloads, but unnecessarily heavy for bounded single-user local memory.
