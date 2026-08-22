# Recommendation Lifecycle Uses Event Facts and a Current-State Projection

## Status

Accepted on 2026-08-23.

## Context

Proactive Guidance needs durable, owner-scoped recommendations that can be delivered through
the app and optional adapters, then snoozed, dismissed, acted on or expired. The existing
`SuggestionNode` mixes generic product suggestions with Agent confirmations and lacks canonical
candidate, policy, expiry and retry identity. It is therefore not a safe lifecycle store.

The current Kuzu event store also materializes most typed nodes after creating an EventNode
without a shared transaction. Recommendation commands need stronger retry and projection
consistency without forcing a risky rewrite of all existing memory writes.

## Decision

### Facts and Projection

Immutable `recommendation.*` EventNodes are the source of truth. A single owner-scoped
`RecommendationNode` stores the current projection and the validated canonical Recommendation
JSON. Candidate and Policy remain snapshots in that JSON rather than independent graph nodes.
The pure lifecycle reducer must be able to replay every projection state.

`OwnerOWNS_RECOMMENDATION` and `EventHAS_RECOMMENDATION` make ownership and provenance explicit.
Every repository read also checks the owner property; a recommendation id alone is insufficient.

### Lifecycle and Time

State-changing events use explicit transition rules. Snooze completion is recorded as
`recommendation.reactivated`; ordinary reads never mutate state. A bounded reconciliation
operation records due reactivation and expiry, while a later scheduler owns periodic execution.
Recommendations in `action_in_progress` do not expire until the action resolves.

Stage 3 extends the observational vocabulary with `recommendation.feedback_recorded`. It accepts
only `helpful` and `not_helpful` and does not change projection state by itself; negative feedback
uses a separate explicit dismiss transition.

All commands and repeated observational events require a caller-supplied `operation_id`.
The event id is a stable hash of owner, recommendation, event type and operation. Same-process
commands are serialized per recommendation, and creates are serialized per owner/dedupe key.

Active dedupe covers `available`, `snoozed`, `action_in_progress` and `action_failed`. Terminal
records are never reopened; a later opportunity receives a new recommendation id.

### Transaction Boundary

Each persistent Recommendation command commits its deterministic EventNode, current projection,
owner relation and event relation in one Recommendation-scoped Kuzu transaction. A failure rolls
back and is returned safely. This does not change the transaction behavior of existing memory
writes, and Recommendation domain rules stay outside `event-store.js`.

### Compatibility and Failure Behavior

Migration marker `004_recommendation_lifecycle` creates only new schema. It never scans or
backfills historic SuggestionNode data.

If Kuzu is disabled or cannot initialize, Recommendation uses a bounded process-local volatile
store with equivalent lifecycle and dedupe semantics. Its data is lost at restart and is not
automatically merged. Once persistent mode has started, query or write failures roll back and do
not silently switch to volatile storage, avoiding split-brain state and hidden defects.

## Consequences

- New Recommendation UI, producer and capability stages can share one lifecycle API.
- Listing and dedupe stay efficient without treating a mutable projection as original evidence.
- Retry-safe writes do not leave an event/projection partial state during normal commands.
- Historic Suggestion facts remain intact and require no lossy migration.
- Full projection repair from a damaged database remains a later audit/hardening feature.
- Volatile mode preserves app availability but is explicitly diagnostic and non-durable.
