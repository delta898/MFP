# Intelligent Memory: Activity Lifecycle Foundation

## Status

- Phase: implemented, awaiting review/commit
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-activity-lifecycle`

## Goal

Record explicit user and system activity as owner-scoped facts that can support
many future services. Topic recommendation is an initial consumer, not the data
model's purpose.

This phase defines and verifies the shared event contract. Product write paths
are connected in following, separately reviewable changes so memory collection
cannot accidentally change publishing behavior.

## Evidence Boundary

The lifecycle is shared across `blog`, `shopping`, and `sns`:

```text
observed -> generated -> saved -> selected -> drafted -> published -> feedback
```

These names are evidence categories, not an assumption that every item passes
through every stage. In particular:

- `observed` does not imply user interest;
- `generated` does not imply selection;
- `saved` does not imply writing intent;
- `selected` requires an explicit action;
- `drafted` requires confirmed remote draft storage;
- `published` requires confirmed publication;
- `feedback` requires an explicit response.

Scheduled registration is not treated as publication. A later phase may add a
separate scheduling fact if a product service needs it.

## Event Contract

Lifecycle events use an explicit type:

```text
activity.lifecycle.<domain>.<stage>
```

The compact payload contains:

- `schema_version`
- `domain`, `stage`, and categorical `strength`
- `subject` and/or a stable `entity_ref`
- `source` write path
- optional `platform` and external `result_ref`
- optional stable `evidence_id`
- compact source-specific `metadata`

Owner identity remains separate from actor and channel. This allows a durable
local owner to accumulate evidence from UI, automation, Telegram, and future
adapters without pretending those actors are the same.

## Idempotency and Failure Policy

When a caller supplies `evidence_id`, the event id is a deterministic hash and a
retry returns the existing event. The id must identify one factual outcome, for
example one operation, platform, and stage—not merely a UI request.

Memory is secondary to the business operation. Product integrations use the
best-effort recorder: a GraphDB failure is logged but must not turn a successful
draft or publication into a user-visible failure.

## Retrieval

Owner activity retrieval combines:

- existing artifact facts such as saved topics and shopping items;
- lifecycle event facts such as selected, drafted, published, and feedback.

Both keep their provenance (`artifact` or `event`). Numeric preference scores
are projections and are not written into these source events.

## Integration Sequence

After this foundation is verified, connect actual success boundaries in small
changes:

1. Blog quick posting and local manuscript paths;
2. Shopping manual and automatic publication paths;
3. SNS manual and RSS/Buffer distribution paths;
4. existing feedback callbacks where their subject/domain is unambiguous.

Each integration records selection after validation and terminal stages only
after platform-confirmed success. Partial multi-platform success creates one
fact per successful platform.

## Verification

- reject unknown domains, stages, and strengths;
- reject evidence without subject/entity reference or source;
- parse only contract event types;
- preserve owner isolation;
- return one event for repeated stable `evidence_id`;
- combine lifecycle events with existing artifact signals;
- keep the disabled-memory fallback non-blocking.

Full unit and release suites remain part of pre-release validation.

## Implementation Verification

- Contract parsing classified a `blog/published/strong` event and rejected types outside the controlled namespace.
- An isolated Kuzu database combined one saved topic artifact with one published lifecycle event for the local owner.
- Repeating the same `evidence_id` returned the existing event with `deduplicated: true`.
- A second owner's SNS selection remained absent from the local owner's summary.
- Owner retrieval scans only the `activity.lifecycle.` event namespace instead of allowing unrelated messages and agent events to displace lifecycle evidence.
