# Intelligent Memory: Derived Owner Profile

## Status

- Phase: implemented
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-owner-profile`

## Goal

Provide a rebuildable, explainable owner profile projection before attaching a
topic recommender or another intelligence service.

## Projection Contract

`getOwnerProfileProjection()` derives schema version 1 from owner activity and
topic semantics. It contains:

- ranked keyword, category, and platform facets with evidence count, recency,
  and the source facet id;
- activity distributions by domain, stage, and evidence strength;
- recent subjects with their source event/artifact reference;
- explicit feedback polarity counts and recent evidence;
- scan/support/exclusion/truncation diagnostics.

The projection is generated on read and is not persisted as a new source fact.
Every item retains evidence references so consumers can explain or rebuild it.

## Policy Boundary

This phase deliberately avoids a single opaque interest score. Numeric weights,
recency decay, cross-domain mixing, and recommendation diversity are service
policy and can change later without migrating the graph. Frequency and recency
are exposed as facts, not silently converted into user preference.

## Verification

- pure projection fixtures for facet ordering, activity evidence, and feedback;
- disabled-store shape compatibility;
- isolated Kuzu read using saved topic and lifecycle feedback evidence;
- retrieval context reuses the activity/topic reads already in the packet and
  includes the projection under `owner_memory.profile` without duplicate graph queries.
