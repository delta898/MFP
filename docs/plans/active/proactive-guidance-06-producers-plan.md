# Proactive Guidance Stage 6: Recommendation Producers

## Status

- Phase: stage 6 complete; stage 7 design next
- Parent integration branch: `feature/proactive-guidance-main`
- Current child branch: none
- Version: unchanged during feature work

## Goal

정규화된 Knowledge, owner facts와 system state를 근거 있는 canonical Recommendation
Candidate로 변환한다. Producer는 후보와 근거만 만들며 노출 여부, 점수, lifecycle 저장과
실제 capability 실행을 결정하지 않는다.

## Work Split

### 06a Producer Runtime

- Status: completed and user-approved on 2026-08-24

- common producer declaration and runner
- producer failure isolation and bounded diagnostics
- canonical candidate validation, producer/owner/kind ownership checks
- stable ordering, candidate/dedupe collision handling and output bounds
- no policy, materialization, delivery or UI integration

### 06b Content Producers

- Status: completed and user-approved on 2026-08-24

- trend content opportunity
- news content opportunity
- explicit input, validated owner topic and Trends provenance for news queries
- at most one query per source family and three news queries per evaluation
- article/event grouping without broad fallback queries

### 06c Operational Producers

- Status: completed and user-approved on 2026-08-24

- setup guidance
- failed job recovery
- workflow and pending-action guidance
- sanitized system facts and presentation-only handoff

### 06d Commerce Producer

- Status: completed and user-approved on 2026-08-24

- trend commerce opportunity
- requires explicit product/shopping or measured commerce evidence
- zero candidates when commerce grounding is insufficient

Each child starts from the latest integration branch and is committed or merged only after user
approval.

## Shared Boundaries

- New producer logic lives in `src/recommendations/producers/`, not `src/suggestions/`.
- Input is already collected owner/system/Knowledge context; vendor response parsing does not belong
  in a producer.
- Output must pass the canonical Recommendation Candidate validator.
- External Knowledge remains `observed / weak` and never becomes owner activity by observation.
- A producer cannot add policy, rank, status, lifecycle event or materialized recommendation fields.
- Producer errors cannot block other producers or the caller's primary workflow.
- Diagnostics contain bounded producer IDs and stable error codes, never raw input, response or
  exception text.
- Stage 7 owns eligibility, ranking, cooldown, diversity and capability availability.
- Stage 8 owns trusted action resolution and side effects.
- Stage 9 owns the in-app presentation surface.

## News Query Policy

News Search requires an explicit topic. Stage 06b may derive bounded topics from:

1. current explicit input;
2. owner topics backed by saved, selected, drafted or published facts;
3. current Trends observations with their own provenance.

It must not use generic literals such as `뉴스`, `오늘` or `최신`. A Trends-only opportunity is
labelled as Trends evidence and never described as owner writing history.

## Validation Milestones

- each child has isolated unit tests and full unit regression;
- 06b includes a live normalized news Snapshot fixture based on the Stage 5 contract;
- no UI test is required until a stage changes a visible surface;
- review output includes representative candidates and empty/failure cases.
