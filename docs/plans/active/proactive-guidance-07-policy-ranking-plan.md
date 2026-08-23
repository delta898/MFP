# Proactive Guidance Stage 7: Policy and Ranking

## Status

- Phase: 07a and 07b complete; 07c implementation next
- Parent integration branch: `feature/proactive-guidance-main`
- Stage integration branch: `feature/proactive-guidance-07-policy-ranking`
- Current child branch: none
- Version: unchanged during feature work

## Objective

Stage 6의 canonical Recommendation Candidate를 대상으로 현재 노출 가능한지 판단하고,
설명 가능한 `0..1` 점수와 결정적인 순위를 부여한 뒤 eligible Candidate만 기존 lifecycle
store에 materialize한다. 후보 생성, 실행 capability resolution, UI delivery와 학습은 이
단계에 섞지 않는다.

## Why This Stage Is Split

Policy가 live config, License, Capability Registry와 Recommendation history를 직접 읽으면서
점수와 저장까지 한 번에 처리하면 테스트가 어렵고 Stage 8/10과 책임이 겹친다. 다음 세
child로 나눈다.

### 07a Policy Context and Eligibility

- Branch: `feature/proactive-guidance-07a-policy-eligibility`
- Status: completed and user-approved on 2026-08-24
- secret 없는 owner-scoped Policy Context collector
- server-owned requirement registry
- expiry, entitlement, capability, settings, quota, active dedupe와 cooldown 판정
- Candidate나 client metadata가 자기 requirement를 낮추지 못하는 경계

### 07b Explainable Ranking and Diversity

- Branch: `feature/proactive-guidance-07b-ranking-diversity`
- Status: completed on 2026-08-24 under approved non-UI workflow
- canonical `0..1` score와 bounded breakdown
- deterministic tie-breaking
- kind diversity, semantic-near-duplicate suppression과 per-run limit
- rolling daily materialization cap

### 07c Evaluation and Materialization

- Branch: `feature/proactive-guidance-07c-policy-evaluation`
- Candidate -> Eligibility -> Ranking -> PolicyDecision orchestration
- eligible Candidate만 기존 Recommendation Materializer/Lifecycle Store로 전달
- suppressed Candidate는 저장하지 않고 bounded diagnostics만 반환
- 한 후보의 정책/저장 실패가 다른 후보를 막지 않는 failure isolation

각 child는 최신 Stage 7 integration branch에서 시작하고 사용자 승인 뒤에만 commit과
fast-forward merge한다. 세 child 완료 후 Stage 7 integration branch를 상위 proactive
guidance branch에 merge한다.

## Policy Context Contract

Collector는 dependency injection으로 다음의 live fact를 읽고 boolean/count/identity만 남긴다.

- `owner_user_id`, `observed_at`
- registered capability ids와 availability
- validated License feature booleans
- 필요한 setting readiness booleans
- quota state: `known`, `unlimited`, `remaining`
- 같은 owner의 최근 Recommendation projection
  - recommendation id, kind, dedupe key, status, available/last-event/expiry time
- collector diagnostics: stable source와 error code만 허용

API key, config value, capability params, Recommendation evidence 본문, provider raw payload와
exception text는 Policy Context에 들어가지 않는다. owner가 다르거나 requirement에 필요한
fact를 확인할 수 없으면 해당 requirement는 fail-closed한다. requirement가 없는 후보까지
전역적으로 차단하지 않는다.

## Server-Owned Requirement Registry

Candidate metadata와 client 입력은 eligibility requirement의 source of truth가 아니다.
정책 코드가 `kind + producer_id` 기준의 선언을 소유한다.

초기 rule은 다음과 같다.

| Candidate kind | Initial hard requirement | Reason |
| --- | --- | --- |
| `content_opportunity` | 없음 | 글감 검토 자체는 publish quota를 소비하지 않음 |
| `commerce_opportunity` | License `cmd_shopping=true` | 사용할 수 없는 쇼핑 기능의 기회를 노출하지 않음 |
| `setup_guidance` | 없음 | missing setting 자체가 이 후보의 근거임 |
| `recovery_action` | 등록된 presentation surface | 복구 화면으로 이동할 수 있어야 함 |
| `workflow_hint` | 없음 | 현재는 비실행형 안내임 |

향후 Stage 8이 trusted action을 부여하면 policy registry에 required capability, setting과
quota class를 추가한다. 후보가 `requires_publish_quota=false` 같은 값을 선언해 차단을
우회할 수는 없다.

현재 Stage 6 후보 중 publish quota를 필수로 소비하는 action은 없다. 따라서 Stage 7은 quota
계약과 판정 경계를 구현하지만 현재 후보를 잔여 publish quota만으로 억제하지 않는다.
Stage 8 실행 시 최신 quota를 반드시 다시 검증한다.

## Eligibility Rules

아래 순서로 suppression reason을 누적하되 최대 12개로 제한한다.

1. owner identity 불일치 또는 Candidate contract 오류
2. Candidate 만료 또는 미래 생성 시각
3. server requirement의 License feature/capability/setting/quota 불충족
4. 같은 dedupe key의 active Recommendation 존재
5. 같은 dedupe key의 최근 terminal outcome cooldown
6. 명시적인 negative feedback/dismiss outcome cooldown

Version 1 cooldown:

- `dismissed` 또는 explicit `not_helpful`: 7일
- `action_completed`: 14일
- `expired`: 추가 cooldown 없음
- `available`, `snoozed`, `action_in_progress`, `action_failed`: active dedupe로 차단

Setup/recovery producer는 current state가 해소되면 후보 자체를 만들지 않는다. Policy는 이
producer 사실을 재추론하지 않으며, 동일 dedupe의 terminal history만 적용한다.

## Ranking Policy v1

- policy id: `proactive-guidance-ranking-v1`
- policy version: `1`
- score range: `0..1`
- random selection 없음
- 입력 순서가 달라도 같은 후보와 context면 같은 score/order

Score components:

| Component | Weight | Basis |
| --- | ---: | --- |
| grounding quality | 0.30 | evidence strength와 서로 다른 evidence kind |
| owner relevance | 0.25 | explicit, published, drafted, selected, saved stage |
| freshness | 0.20 | observed/expiry 시각과 Candidate remaining lifetime |
| operational urgency | 0.15 | recent failure, pending work, missing setup 또는 opportunity 성격 |
| action readiness | 0.10 | 현재 presentation/capability readiness; null handoff는 중립값 |

각 component는 `0..1`로 정규화한 뒤 weight를 적용한다. operational urgency는 kind만 보는
무제한 bonus가 아니라 producer가 이미 검증한 최근 failure/pending/config/opportunity
evidence 분류를 bounded 값으로 반영한다. breakdown에는 component score, weight와 사용한
categorical fact만 남기며 raw evidence/features를 복사하지 않는다. 동점에서는 다음
우선순위를 사용한다.

`recovery_action -> workflow_hint -> setup_guidance -> commerce_opportunity -> content_opportunity`

이는 긴급 운영 문제를 먼저 보여주기 위한 tie-breaker이며 evidence score를 뒤집지 않는다.

## Diversity and Capacity

- 한 evaluation에서 최대 6개 materialization 대상
- 우선 각 kind의 최고 후보 한 개씩 round-robin으로 확보
- 이후 score 순으로 남은 slot을 채움
- kind당 최대 2개
- content/commerce 내부 token Jaccard similarity `>= 0.75`면 낮은 후보 억제
- 같은 dedupe key는 eligibility 단계에서 이미 한 건만 허용
- 최근 24시간 신규 materialization 최대 10개
- rolling 24시간 cap은 Stage 10의 Telegram/toast delivery limit와 별개

diversity, per-run limit와 daily cap으로 밀린 후보는 rank 0, `eligible=false`와 stable
suppression reason을 갖는다. 다음 evaluation에서 조건이 바뀌면 다시 평가할 수 있으며
suppressed Candidate 자체는 lifecycle store에 저장하지 않는다.

## Evaluation Result

Evaluator는 다음을 반환한다.

- `policy_id`, `policy_version`, `owner_user_id`, `evaluated_at`
- materialized/persisted Recommendation 목록
- eligible이었지만 store unavailable/write failure로 volatile 결과가 된 목록
- suppressed Candidate identity와 bounded reason code
- source별 bounded diagnostics

모든 PolicyDecision은 canonical validator를 통과해야 한다. rank는 최종 eligible 대상에만
`1..N`, suppressed 대상은 `0`이다. lifecycle의 `recommendation.created`는 materializer가
기록하며 policy evaluator가 별도 중복 event를 쓰지 않는다.

## Relationship to Existing Topic Ranking

`topic-ranking-v1`은 Quick Posting 전용 legacy/specialized lane으로 유지한다. Stage 7에서
그 점수나 random high-score-band 선택을 공통 policy에 복사하지 않는다. Canonical producer
Candidate는 새 deterministic policy를 사용하고, 기존 topic adapter는 후속 전환 시점까지
현재 동작을 보존한다. 과거 Policy snapshot이나 SuggestionNode를 backfill하지 않는다.

## Failure and Security Boundaries

- collector source 하나의 실패는 그 source requirement에만 영향
- policy는 CONFIG/License singleton을 직접 import하지 않음
- client-supplied score, rank, requirements와 owner id를 신뢰하지 않음
- suppressed Candidate/evidence를 persistence나 preference로 기록하지 않음
- passive evaluation과 ranking은 사용자 관심/선호 evidence가 아님
- diagnostics에 raw exception, config, license payload나 evidence text를 넣지 않음

## Test Strategy

### 07a

- owner-scoped sanitized context
- missing/false/true requirement matrix와 fail-closed behavior
- shopping entitlement, presentation availability와 future quota requirement
- active dedupe와 terminal cooldown 경계 시각
- secret/raw payload non-leakage

### 07b

- canonical score `0..1`과 complete explainable breakdown
- evidence strength/stage/freshness ordering
- deterministic ties and input-order independence
- first-per-kind diversity, max two per kind와 semantic suppression
- per-run 6개, rolling 24-hour 10개 cap

### 07c

- Stage 6 여러 producer Candidate의 end-to-end policy evaluation
- eligible-only materialization and canonical lifecycle event
- duplicate/cooldown suppression
- one-candidate failure isolation and bounded diagnostics
- persistent/volatile store behavior
- full unit regression and structure guard

UI surface를 변경하지 않으므로 Stage 7에는 사용자 UI test가 없다.

## Out of Scope

- recommendation id 기반 capability/params resolution과 side effects (Stage 8)
- Recommendation Center API/UI, badge/toast와 사용자 UI test (Stage 9)
- startup/background scheduling과 delivery frequency (Stage 10)
- 새로운 learning weight 자동 반영과 funnel analytics (Stage 11)
- 기존 topic recommendation의 즉시 제거 또는 historic data migration
- Supabase SQL/Edge Function과 release version 변경

## Review Gate

각 child의 구현, 문서화와 unit/integration regression 완료 후 결과를 사용자에게 공유한다.
사용자 승인 전에는 해당 child를 commit/merge/delete하거나 원격 push하지 않는다.
