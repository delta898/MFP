# Proactive Guidance Uses a Canonical Recommendation Contract

## Status

Accepted on 2026-08-23.

## Context

BlogGenius has two recommendation-like paths with different maturity and scope.

- `src/suggestions/` creates lightweight operational suggestions from memory and
  knowledge for `agent.suggestions.get`.
- `src/recommendations/` creates grounded topic candidates with stable identity,
  ranking provenance and outcome learning for Quick Posting.

The product now needs content, commerce, setup, recovery and workflow guidance
that can combine owner activity, system state, Trends, News and future MCP
knowledge, then hand off safely to an existing product surface or capability.
Extending both existing paths independently would create overlapping product
semantics and incompatible lifecycle records.

`SuggestionNode` is also not a clean destination for the new lifecycle because
it currently stores both generic suggestions and Agent confirmation requests.

## Decision

### Canonical Vocabulary

New product behavior uses `Recommendation` as the canonical domain term.
`Suggestion` remains only where required for compatibility with existing Agent,
Telegram, memory and API contracts during the staged migration.

The canonical layers are separate:

1. `RecommendationCandidate`: producer output before eligibility and ranking;
2. `PolicyDecision`: rebuildable eligibility, score and ranking projection;
3. `Recommendation`: owner-scoped product record materialized after policy.

### Evidence Boundary

Evidence keeps its semantic kind, stage, strength, observed time, expiry and
source reference. Provider and transport are provenance rather than
Recommendation kinds. External Knowledge is recorded as `observed / weak`; a
fetch or passive recommendation exposure is not owner interest.

Raw provider responses and credentials are not valid Recommendation data.
Public DTOs omit owner identity, internal ranking features, dedupe material and
capability parameters.

### Handoff Boundary

A Recommendation has at most one primary handoff.

- `presentation` opens an allowlisted surface or fills bounded presentation data
  without a domain side effect.
- `capability` identifies an intended capability action, but the server resolves
  it from the stored Recommendation and the Capability Registry controls current
  validation, preview, entitlement, quota and confirmation.

The client cannot lower confirmation policy or execute arbitrary capability
parameters supplied in a browser request.

Stage 8 implements this boundary with an owner-scoped handoff service. A
confirmation stores only a bounded Recommendation correlation, and approval
re-resolves the stored Recommendation and Capability instead of trusting the
confirmation's action snapshot. The lifecycle enters `action_in_progress` only
immediately before execution; reject leaves it available and execution failure
leaves it retryable as `action_failed`.

### Persistence and Compatibility

New Recommendation lifecycle writes use a dedicated projection and
`recommendation.*` events. Stage 3 will move new generic product suggestion
writes to this path while preserving the existing `agent.suggestions.get`
response through an adapter.

Historic `SuggestionNode` and `suggestion.*` records are not backfilled. They
remain legacy facts because they lack canonical identity, evidence, policy,
expiry and handoff information. Existing feedback may be read through a
compatibility adapter when useful. Agent confirmation semantics remain shared;
the store supports a generic bounded correlation for trusted workflows but does
not contain Recommendation business logic.

### Delivery Boundary

The in-app Recommendation Center is the primary product surface and does not
depend on Telegram configuration. Telegram, OS notifications and other channels
are optional delivery adapters after the in-app path is stable.

## Consequences

- New recommendation kinds share one strict, versioned contract.
- Existing topic ranking and learning can be retained behind a canonical adapter.
- Generic suggestion compatibility can be removed later without rewriting
  historic graph facts.
- Recommendation UI can show explainable evidence without exposing internal
  action or owner data.
- Adding News or MCP knowledge does not couple Recommendation policy to a vendor.
- Stage 1 changes no runtime, storage, API or UI behavior; later stages perform
  the controlled write-path and product migration.
