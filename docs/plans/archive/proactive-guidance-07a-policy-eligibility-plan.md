# Proactive Guidance 07a: Policy Context and Eligibility

## Status

- Phase: completed and user-approved on 2026-08-24
- Parent branch: `feature/proactive-guidance-07-policy-ranking`
- Child branch: `feature/proactive-guidance-07a-policy-eligibility`
- Version: unchanged during feature work

## Objective

Canonical Recommendation Candidate가 ranking에 들어가기 전에 owner, 시각, entitlement,
capability/presentation target, setting, quota와 Recommendation history requirement를 만족하는지
판단한다. Policy가 raw application state에 결합하지 않도록 먼저 sanitized Policy Context를
구성한다.

## Implemented Structure

- `src/recommendations/policy/context.js`
  - injected readers와 Capability Registry에서 bounded Policy Context 구성
  - License feature policy, settings, quota와 owner Recommendation projection 정규화
  - secret, config value, capability params, evidence/policy 본문과 exception text 제거
- `src/recommendations/policy/requirements.js`
  - `kind + producer_id` server-owned requirement registry
  - commerce의 `cmd_shopping` requirement
  - producer-specific rule은 kind rule에 추가만 가능하며 상위 requirement를 제거할 수 없음
  - presentation/capability handoff의 intrinsic target availability requirement
  - Candidate metadata가 requirement를 선언하거나 낮추는 경로 없음
- `src/recommendations/policy/eligibility.js`
  - Candidate contract, owner, expiry/future time와 live requirement 판정
  - active exact-dedupe suppression
  - dismissed 7일, action completed 14일 cooldown
  - stable bounded suppression reason

## Fail-Closed Scope

필요한 source만 fail-closed한다. 예를 들어 commerce Candidate는 License context를 알 수 없으면
억제되지만 License requirement가 없는 content Candidate는 영향을 받지 않는다. capability,
setting과 quota도 해당 server-owned requirement가 있을 때만 적용한다.

Recommendation history를 읽을 수 없으면 모든 Candidate를 억제한다. 정상 환경에서는 persistent
또는 bounded volatile lifecycle store가 이 history를 제공한다. store 자체가 없는 상태에서
중복 추천을 fail-open하면 반복 노출 위험이 있으므로 recommendation 기능만 안전하게 닫고 기존
앱 workflow에는 영향을 주지 않는다.

## Current Requirement Matrix

- `commerce_opportunity`: `cmd_shopping=true`
- `content_opportunity`, `setup_guidance`, `workflow_hint`: 별도 License requirement 없음
- 모든 presentation handoff: 등록된 presentation surface
- 모든 capability handoff: 등록된 capability id
- publishing quota: 정책 contract는 지원하지만 현재 Stage 6 Candidate에는 필수 rule 없음

## Validation

- owner-scoped context와 foreign history 제거
- capability/config/license/quota/history payload non-leakage
- source별 failure isolation과 stable diagnostics
- commerce feature unknown/disabled/enabled matrix
- future setting/quota rule의 fail-closed behavior
- presentation/capability availability
- owner/future/expired/history blockers
- active duplicate와 cooldown boundary
- structure guard로 UI/provider/config/License singleton/materializer coupling 차단

Focused tests 23건과 전체 unit regression 686건이 통과했다.

UI, Supabase, provider call, PolicyDecision score/rank와 lifecycle materialization은 변경하지 않는다.
사용자 승인 전에는 commit, parent merge, branch delete 또는 push하지 않는다.
