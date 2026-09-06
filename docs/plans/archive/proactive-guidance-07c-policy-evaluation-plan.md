# Proactive Guidance 07c: Policy Evaluation and Materialization

## Status

- Phase: completed on 2026-08-24 under approved non-UI workflow
- Parent branch: `feature/proactive-guidance-07-policy-ranking`
- Child branch: `feature/proactive-guidance-07c-policy-evaluation`
- Version: unchanged during feature work

## Objective

Stage 6 Candidate를 07a eligibility와 07b ranking에 통과시키고 canonical PolicyDecision을
만든 뒤 최종 eligible Candidate만 기존 Recommendation Materializer/Lifecycle Store에 전달한다.

## Boundaries

- invalid/ineligible/diversity-cap Candidate도 valid suppressed PolicyDecision으로 설명
- suppressed Candidate는 lifecycle store에 기록하지 않음
- selected Candidate만 rank `1..N`과 eligible policy로 materialize
- Candidate ID/dedupe run collision defense-in-depth
- materializer unavailable/failure는 candidate별 bounded diagnostic
- volatile lifecycle fallback은 결과에 명시하되 기존 workflow를 막지 않음
- evaluator는 `recommendation.created` event를 직접 쓰지 않고 기존 materializer만 사용

UI, execution capability, external provider, Supabase와 기존 topic ranking은 변경하지 않는다.

Focused/integration tests 16건과 전체 unit regression 706건이 통과했다.
