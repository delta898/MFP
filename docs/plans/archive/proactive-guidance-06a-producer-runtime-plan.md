# Proactive Guidance Stage 06a: Producer Runtime

## Status

- Phase: completed and user-approved on 2026-08-24
- Parent: `feature/proactive-guidance-main`
- Branch: `feature/proactive-guidance-06a-producer-runtime`

## Scope

Create a small runtime that executes independent Recommendation Producers and returns only
validated canonical candidates plus bounded internal diagnostics.

Producer declaration:

```text
id: stable identifier
version: positive integer
kinds: non-empty subset of canonical Recommendation kinds
produce(input, context) -> { candidates }
```

Runtime result:

```text
schema_version
run_id
owner_user_id
candidates
diagnostics
```

## Invariants

- producer IDs are unique and identifier-safe;
- every raw candidate's `producer_id` matches the declaration;
- every candidate kind is declared by that producer;
- every candidate owner matches the runtime owner;
- candidates pass `validateRecommendationCandidate` before leaving the runtime;
- first valid candidate wins duplicate `candidate_id` or `dedupe_key` collisions;
- producer output and total output are bounded;
- producer execution order determines stable result order even when work runs concurrently;
- one producer throw or invalid result does not reject the whole run;
- diagnostics expose stable codes/counts only and omit exception messages and raw candidate values;
- no Recommendation policy, materializer, lifecycle store, channel or UI dependency is imported.

## Owner Boundary

The runtime resolves the owner from explicit `owner_user_id` or the existing owner-memory context.
If no owner exists, it executes no producer and returns an `OWNER_CONTEXT_MISSING` diagnostic.
Producer output cannot create or change owner identity.

## Limits

- default maximum 20 candidates per producer;
- default maximum 50 candidates per run;
- diagnostics retain at most 50 invalid/failure entries;
- limits may be lowered by the caller but cannot exceed these ceilings.

## Tests

- valid multi-producer run preserves declaration order;
- one throw does not block another producer;
- missing owner short-circuits without producer calls;
- invalid shape, owner, producer and kind are isolated;
- duplicate candidate ID and dedupe key are deterministic;
- per-producer and total bounds are enforced;
- diagnostics contain no exception or raw candidate text;
- structure guard prevents policy/materializer/lifecycle/UI imports.

## Verification

- producer runtime tests: 7 passed;
- Stage 6 structure guards: 4 passed;
- full unit regression: 631 passed;
- no visible UI surface changed, so user UI testing is not required for 06a.
