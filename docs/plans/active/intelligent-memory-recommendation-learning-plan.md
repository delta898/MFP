# Intelligent Memory: Recommendation Provenance and Learning

## Status

- Phase: implemented backend foundation
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-recommendation-learning`

## Goal

Keep enough provenance to explain and learn from a topic recommendation without
mistaking generation or exposure for user preference.

## Recommendation Context

Each grounded idea can carry schema version 1 context:

- recommendation run id;
- selected candidate id and original topic seed;
- ranking policy id/version, rank, score, and score breakdown;
- bounded source references.

Providers are asked to return the candidate id they used. Unknown or omitted ids
are not guessed from title similarity. Such ideas remain usable but do not create
candidate-specific learning evidence.

The compact context is persisted with the generated `content_idea` artifact. It
describes how the idea was produced; it is not itself a positive preference.

## Outcome Boundary

The reusable learning service accepts only:

- `selected`;
- `saved`;
- `drafted`;
- `published`;
- `feedback`.

It deliberately rejects `observed` and does not emit exposure events before the
product UI exists. Outcomes require both run and candidate identity and use a
stable evidence id so retries are idempotent.

## Feedback Loop

Telegram artifact feedback retains the recommendation context in the lifecycle
event. The owner-profile feedback projection exposes that context, allowing the
ranking policy to match feedback by candidate id even when the generated article
title differs from the original topic seed. Legacy feedback still falls back to
bounded subject matching.

## Step 10 Handoff

The future UI must:

1. retain the returned recommendation context with each visible idea;
2. call the outcome service only after an actual user action succeeds;
3. use a unique result/click reference as the outcome discriminator;
4. avoid recording passive visibility as interest;
5. keep recommendation failure non-blocking for the writing workflow.

The first UI iteration should expose a small recommendation lane and validate
the selected/saved handoff before adding richer feedback controls.
