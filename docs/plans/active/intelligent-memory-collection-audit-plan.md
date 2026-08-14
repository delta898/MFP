# Intelligent Memory: Collection Integrity Audit

## Status

- Phase: implemented
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-collection-audit`

## Goal

Make collection quality observable before recommendation services depend on it.
The audit covers owner linkage, provenance completeness, bounded logical duplicate
detection, and scan truncation without rewriting existing facts.

## Design

- Every new event stores a compact `payload.provenance` envelope after the
  event-specific payload summary is produced.
- The envelope preserves `channel`, actor, conversation, message, request, and
  source identity without changing the existing Kuzu schema.
- `getOwnerCollectionAudit()` derives an owner-scoped report from at most 500
  recent events and artifacts and combines it with global orphan counts.
- Existing events without the envelope remain valid legacy facts. They are
  reported as missing provenance rather than silently rewritten.
- Duplicate detection uses controlled references such as request, evidence,
  artifact, suggestion, or message id. It is diagnostic and does not delete data.

## Safety Boundary

This phase is additive. It does not reset the embedded database, mutate historic
payloads, or introduce an incompatible node-table migration. A later explicit
backfill may be added only if a service requires historic channel-level analysis.

## Verification

- syntax-check the store and audit module;
- verify a complete envelope, a legacy missing envelope, and a repeated logical
  request using pure fixtures;
- use an isolated Kuzu database to confirm new payload persistence, owner stats,
  and zero orphan relations.
