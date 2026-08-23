# Proactive Guidance Main Plan

## Status

- Phase: stage 6c complete; stage 6d design next
- Started: 2026-08-23
- Integration branch: `feature/proactive-guidance-main`
- Current child branch: none
- Release version: undecided until release preparation

## Product Goal

사용자 행동, 설정과 작업 상태, Trends 및 외부 Knowledge를 결합해 근거가
있고 실행 가능한 다음 행동을 제안한다. 앱의 `추천과 안내` 센터를 기본 전달
표면으로 두고, 사용자의 선택은 기존 Agent Runtime과 Capability Registry를
통해 안전하게 후속 작업으로 이어진다.

단순 알림이나 문구 생성기가 아니라 아래 전체 흐름을 제품 기반으로 만든다.

```text
owner activity / settings / job history
                 +
Trends / News / future MCP knowledge
                 ↓
Recommendation Producers
                 ↓
eligibility / ranking / dedupe / delivery policy
                 ↓
Recommendation lifecycle store
                 ↓
in-app Recommendation Center
                 ↓
presentation handoff or Capability execution
                 ↓
Agent Runtime -> outcome events -> Memory
```

## Core Decisions

- 신규 도메인 명칭은 `Recommendation`으로 통일한다.
- 기존 `src/suggestions/`는 즉시 삭제하지 않고 호환 adapter로 점진 전환한다.
- 기존 topic recommendation은 범용 계약을 사용하는 전문 추천 lane으로 유지한다.
- `SuggestionNode`에 새 lifecycle을 계속 누적하지 않고 신규 recommendation
  projection과 `recommendation.*` 이벤트를 설계한다. 과거 `SuggestionNode`는
  backfill하지 않고 당시의 legacy 사실로 보존한다.
- 앱 자체의 영속적인 추천 센터가 기본 채널이다. Telegram은 선택적인 delivery
  adapter이며 제품 동작의 전제 조건이 아니다.
- 추천 생성과 외부 Knowledge 조회를 분리한다. Recommendation은 vendor 응답이
  아니라 정규화된 Knowledge Snapshot만 소비한다.
- 외부 API 운영 credential은 사용자에게 요구하거나 데스크톱에 포함하지 않는다.
  BlogGenius가 관리하는 server-side secret과 license-aware gateway를 사용한다.
- 단순 화면 이동과 실제 부작용을 만드는 capability 실행을 구분한다.
- 설정 변경, 사용량 소비, 저장, 발행은 기존 capability validation, preview,
  entitlement, quota와 confirmation 경로를 우회하지 않는다.
- 외부 정보 조회나 추천 노출만으로 사용자 선호를 추론하지 않는다. 사실을 먼저
  기록하고 명시적 반응과 성공한 outcome에서만 학습한다.
- 사용자에게 보이는 추천 근거는 시스템 evidence로 생성하며 AI가 인기·수요·개인
  이력을 창작하지 않는다. 알 수 없는 근거는 글쓰기 이력으로 추측하지 않는다.
- 명시적인 부정 feedback은 일반 recent-activity 제한과 별도로 보존하고 후보를
  eligibility 단계에서 억제한다.

## Branch Protocol

1. 각 단계는 최신 `feature/proactive-guidance-main`에서 별도 child branch로 시작한다.
2. child branch를 만들기 전에 해당 단계의 상세 설계를 공유하고 필요한 결정을 확정한다.
3. 확정된 설계는 코드보다 먼저 또는 코드와 함께 `docs/`에 반영한다.
4. backend 단계는 설계 검토와 unit/integration test 결과를 사용자에게 공유한다.
5. UI가 포함된 단계는 자동 검증 후 사용자에게 실제 UI 테스트를 요청한다.
6. 사용자 승인 전에는 commit, merge 또는 push하지 않는다.
7. 승인 후 conventional commit을 만들고 integration branch에 fast-forward merge한다.
8. merge가 확인되면 완료된 child branch를 삭제한다.
9. 모든 단계가 끝날 때까지 integration branch를 `dev`에 merge하지 않는다.
10. 정상 feature 작업 중에는 버전을 올리지 않고 배포 직전에 결정한다.

## Work Stages

### 1. Contracts and Consolidation

- Branch: `feature/proactive-guidance-01-contracts`
- Canonical Recommendation Candidate, Recommendation, Evidence, Handoff 계약
- recommendation kind와 lifecycle vocabulary
- `src/suggestions/`와 topic recommendation의 점진 통합 ADR
- public UI DTO와 server-only action descriptor 경계
- 외부 Knowledge evidence 계약
- 기존 기능은 변경하지 않는 contract/validator foundation

### 2. Lifecycle Store

- Branch: `feature/proactive-guidance-02-lifecycle-store`
- Status: completed on 2026-08-23
- owner-scoped recommendation projection
- `recommendation.*` event facts
- stable identity, dedupe, expiry, snooze와 상태 전이
- retry-safe/idempotent lifecycle writes
- Kuzu unavailable 시 fail-open product behavior

### 3. Legacy Adapters

- Branch: `feature/proactive-guidance-03-legacy-adapters`
- Status: completed and merged into the integration branch on 2026-08-23
- 기존 generic suggestion을 canonical recommendation candidate로 변환
- 기존 topic recommendation provenance와 outcome 계약 연결
- `agent.suggestions.get`, Telegram renderer와 빠른 포스팅 UI 호환 유지
- 신규 product suggestion write path는 Recommendation으로 전환하되 과거
  `SuggestionNode`는 옮기지 않고 필요한 feedback만 adapter로 읽음
- 신규 코드가 `src/suggestions/`에 누적되지 않도록 구조 guard 추가

### 4. External Knowledge Gateway

- Branch: `feature/proactive-guidance-04-external-knowledge-gateway`
- Status: completed and user-accepted on 2026-08-23; remaining recommendation quality work is in backlog
- server-managed provider credential
- license verification, cache, rate limit, backoff와 quota protection
- normalized Trends/News Knowledge Snapshot 응답
- secret이 Git, desktop config, response, log에 노출되지 않는 경계
- provider 장애가 추천과 앱 전체를 막지 않는 failure isolation

### 5. News Provider

- Branch: `feature/proactive-guidance-05-news-provider`
- Status: completed, live-verified and user-approved on 2026-08-23
- 구현 전 Naver News/Search, SerpApi와 기타 후보의 품질, 비용, quota, 약관 비교
- 한국어 뉴스에 적합한 provider 하나 실제 연결
- headline, summary, publisher, published time, URL과 topic 정규화
- freshness, duplicate event/article, source attribution 정책
- 기존 SerpApi Trends와 사용자 key 방식은 별도 일감으로 유지하고 이번 단계에서 제외
- 미래 `news + mcp_tool` transport가 같은 normalized contract를 만족하도록 검증

### 6. Recommendation Producers

- Branches:
  - `feature/proactive-guidance-06a-producer-runtime`
  - `feature/proactive-guidance-06b-content-producers`
  - `feature/proactive-guidance-06c-operational-producers`
  - `feature/proactive-guidance-06d-commerce-producer`
- Status: detailed design confirmed; 06a through 06c completed; 06d design next
- trend content opportunity
- news content opportunity
- trend commerce opportunity
- setup guidance
- failed job recovery
- workflow and pending-action guidance
- producer는 후보와 근거만 생성하고 노출 순위나 사용자 선호를 결정하지 않음

### 7. Policy and Ranking

- Branch: `feature/proactive-guidance-07-policy-ranking`
- evidence strength/freshness와 owner relevance
- capability availability, settings, entitlement와 quota eligibility
- cooldown, dedupe, daily cap와 category diversity
- versioned policy와 explainable score breakdown
- 사용할 수 없거나 이미 완료한 행동의 추천 차단

### 8. Capability Handoff

- Branch: `feature/proactive-guidance-08-capability-handoff`
- recommendation id 기반 server-side action resolution
- client-supplied capability/params 변조 차단
- current-state validation, preview, entitlement, quota와 confirmation 재사용
- action start, success, failure와 retry lifecycle 기록
- presentation handoff와 side-effecting capability execution 분리

### 9. In-App Recommendation Center

- Branch: `feature/proactive-guidance-09-in-app-center`
- Dashboard 중심 `추천과 안내` 카드
- sidebar/header badge와 제한적인 new-item toast
- evidence, reason, source와 freshness 표시
- 실행, 관련 화면 열기, 나중에 보기, 관심 없음
- persisted completion/expiry state
- Telegram 미설정 상태에서 완전한 제품 동작

### 10. Proactive Delivery

- Branch: `feature/proactive-guidance-10-proactive-delivery`
- app startup 및 bounded background evaluation
- configurable refresh, cooldown, daily limit와 catch-up policy
- provider error backoff와 quota-aware scheduling
- 작업 중인 사용자를 방해하지 않는 badge/toast policy
- 앱 시작 성능과 offline behavior 보호

### 11. Learning and Hardening

- Branch: `feature/proactive-guidance-11-learning-hardening`
- dismiss, snooze, action, saved, drafted, published와 explicit feedback outcome
- passive exposure와 knowledge fetch를 preference에서 제외
- recommendation funnel, policy, provider cost와 cache observability
- duplicate/orphan audit와 full regression suite
- canonical architecture docs 승격과 완료 계획 archive

## Delivery Milestones

### Foundation: stages 1-3

- 기존 추천 자산을 깨지 않고 하나의 확장 가능한 계약으로 연결한다.

### Knowledge MVP: stages 4-7

- server-managed external news와 기존 Trends를 사용자 근거와 결합해 설명 가능한
  추천 후보와 노출 정책을 만든다.

### Product MVP: stages 8-9

- 앱에서 근거를 확인하고 안전한 후속 액션을 실행할 수 있다.

### Proactive Release: stages 10-11

- 추천이 적절한 시점에 능동적으로 갱신되고 실제 outcome을 통해 정책이 개선된다.

## Product Success Signals

- recommendation available -> opened
- opened -> handoff/action started
- action started -> completed
- recommendation -> saved/drafted/published
- dismiss/snooze frequency by kind and policy version
- duplicate, expired-before-use와 unavailable-capability suppression
- provider cache hit, failure, latency, quota와 cost

이 수치는 관측과 정책 개선에 사용하며 단순 노출을 사용자 선호로 승격하지 않는다.

## Principal Risks

- 빈도와 중복 정책이 약하면 추천 센터가 스팸 표면이 된다.
- 외부 Knowledge의 오래된 정보나 제목만으로 과도한 결론을 낼 수 있다.
- developer credential을 desktop에 넣으면 키와 공용 quota가 노출된다.
- raw client action descriptor를 신뢰하면 임의 capability 실행 경로가 생긴다.
- 기존 suggestion과 새 recommendation을 장기간 병행하면 세 번째 추천 체계가 된다.
- 추천 생성이 앱 시작이나 핵심 발행 workflow를 막아서는 안 된다.
- 외부 provider에 owner history를 그대로 보내면 불필요한 개인정보 노출이 생긴다.

## Deferred Work

- Telegram-enabled environment에서 Stage 3 canonical recommendation feedback callback 실제 smoke test
- Telegram recommendation delivery adapter
- OS-level desktop push notification
- email or Slack delivery
- full external MCP consumer implementation
- multi-account recommendation isolation
- autonomous publication without explicit product policy and confirmation
