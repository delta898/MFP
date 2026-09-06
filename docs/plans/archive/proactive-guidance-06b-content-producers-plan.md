# Proactive Guidance Stage 06b: Content Producers

## Status

- Phase: completed and user-approved on 2026-08-24
- Parent: `feature/proactive-guidance-main`
- Branch: `feature/proactive-guidance-06b-content-producers`
- Approved: 2026-08-24

## Goal

Combine explicit input, validated owner activity, Trends and News into grounded canonical
`content_opportunity` candidates. A producer reports evidence and a possible topic only; later stages
own eligibility, ranking, lifecycle materialization and action handoff.

## Architecture

```text
explicit input / owner activity / canonical Trends
                         |
                         v
                bounded News query plan
                         |
                         v
             content Knowledge collector
                         |
                         v
          content-opportunity-v1 producer
                         |
                         v
        canonical Recommendation Candidate[]
```

## Knowledge Boundary

- Naver Trends moves from a legacy `timestamp/metadata` item DTO to the strict canonical Trends
  Snapshot contract.
- Existing content-idea consumers retain a bounded compatibility read for already configured legacy
  Trends providers.
- News and Trends provider payload interpretation ends in `src/knowledge/`; producers consume only
  normalized Snapshot fields and collector provenance.
- SerpApi activation and user-key UX remain outside this stage.

## News Query Plan

An evaluation may choose at most one topic from each lane, in this order:

1. current explicit input;
2. owner activity whose stage is `saved`, `selected`, `drafted` or `published`;
3. a current Trends observation.

The plan is capped at three unique topics. It rejects empty or generic-only values such as `뉴스`,
`최신`, `오늘` and `추천`. Generated recommendations, recommendation exposure and external Trends
observation alone do not become owner interest.

## Collector Limits

- fetch Trends at most once when canonical Trends were not supplied;
- fetch News at most once per planned topic and at most three times per evaluation;
- use an explicit content-recommendation News route;
- never send an empty News query;
- isolate each provider/query failure;
- retain stable error codes only and never credential, raw response or exception text.

## Candidate Model

`content-opportunity-v1` produces one candidate per normalized topic and merges evidence for that
topic instead of emitting separate Trend and News recommendations.

- explicit request evidence is `owner_activity / explicit`;
- saved or selected owner activity is `owner_activity / medium|strong` according to its fact;
- Trends and News are always `knowledge / observed / weak`;
- duplicate articles are removed by URL and then normalized title;
- at most three representative News articles are attached to one candidate;
- deterministic copy must not claim popularity, demand or owner history without matching evidence;
- candidate identity and dedupe keys are stable from producer version and normalized topic;
- no policy, score, lifecycle state, capability params or side effects are added;
- handoff remains `null` until Stage 8.

## Compatibility and Safety

- The existing content-idea engine continues to accept canonical and legacy Trends items during the
  transition.
- A stale but unexpired Snapshot may remain evidence for Stage 7 to assess; expired evidence is not
  used to create a candidate.
- Article grouping is query-topic based. Semantic event clustering and AI-authored claims are not
  introduced in this stage.
- No visible UI surface changes in 06b.

## Tests

- canonical Naver Trends Snapshot and strict registry validation;
- existing content-idea Trends behavior remains compatible;
- query lanes, ordering, dedupe, generic rejection and maximum call count;
- generated-only activity cannot seed a News query;
- collector failure isolation and sanitized diagnostics;
- combined explicit/owner/Trend/News evidence without false owner attribution;
- URL/title article dedupe and three-article bound;
- stable candidate identity, expiry and empty-evidence behavior;
- structure guard prevents policy, materializer, lifecycle, UI and Telegram imports;
- full unit regression.

## Verification

- query plan, collector, producer and common runtime composition tests passed;
- canonical and legacy content-idea Trends compatibility tests passed;
- Knowledge and Recommendation structure guards passed;
- full unit regression: 643 passed;
- no visible UI surface changed, so user UI testing is not required for 06b.
