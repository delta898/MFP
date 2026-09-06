# Proactive Guidance 07b: Explainable Ranking and Diversity

## Status

- Phase: completed on 2026-08-24 under approved non-UI workflow
- Parent branch: `feature/proactive-guidance-07-policy-ranking`
- Child branch: `feature/proactive-guidance-07b-ranking-diversity`
- Version: unchanged during feature work

## Objective

07a eligibility를 통과한 Candidate에만 canonical `0..1` 점수를 부여하고, score의 근거와
이번 evaluation에서 선택 또는 지연된 이유를 분리한다. random이나 provider 원점수에 의존하지
않고 같은 Candidate와 Policy Context에는 같은 결과를 낸다.

## Implemented Boundaries

- `scoring.js`: grounding, owner relevance, freshness, urgency, readiness의 weighted score
- `diversity.js`: kind-first selection, per-kind/semantic/per-run/rolling-day capacity
- `ranking.js`: eligibility-approved entry만 scoring과 diversity로 전달
- score breakdown에는 categorical summary만 남기고 evidence text/features를 복사하지 않음
- selection membership을 diversity로 정한 뒤 최종 rank는 score와 stable tie-breaker로 부여

## Limits

- evaluation당 최대 6개
- kind당 최대 2개
- content/commerce Jaccard similarity `>= 0.75` 억제
- 최근 24시간 materialization 최대 10개
- rolling cap은 Stage 10 delivery cap과 별개

UI, lifecycle write, materializer, external provider와 Supabase는 변경하지 않는다.

Focused tests 20건과 전체 unit regression 698건이 통과했다.
