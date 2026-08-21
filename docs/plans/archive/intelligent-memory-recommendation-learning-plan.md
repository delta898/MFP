# Intelligent Memory: Recommendation Provenance and Learning

## Status

- Phase: implemented backend foundation and first product UI
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

## Step 10 Product UI

The Quick Posting screen now:

1. shows up to three compact grounded recommendations above the existing input
   mode switch;
2. retains the returned recommendation context with each idea;
3. fills the existing subject, keyword, and instruction fields rather than
   creating a second writing workflow;
4. reuses the existing topics append action for `글감 저장`;
5. records explicit selection, successful save, draft, publish, and negative
   feedback outcomes while avoiding passive exposure events;
6. keeps recommendation loading and outcome failures non-blocking for the
   writing workflow.

Trend Posting remains the manual discovery surface. Recommendations may contain
Naver trend evidence through the knowledge route, but the same recommendation
panel is not duplicated in the Trend Posting tab.
