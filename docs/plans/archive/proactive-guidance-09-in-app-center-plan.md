# Proactive Guidance Stage 9: In-App Recommendation Center

## Status

- Phase: completed and UI-verified on 2026-08-25
- Parent integration branch: `feature/proactive-guidance-main`
- Branch: `feature/proactive-guidance-09-in-app-center`
- Version: unchanged during feature work
- Review gate: automated verification and user UI test completed

## Objective

Telegram 설정 여부와 관계없이 canonical Recommendation을 앱에서 확인하고, 근거를 검토한 뒤
presentation 이동이나 trusted Capability handoff를 시작할 수 있는 기본 surface를 제공한다.

## Product Surface

- Dashboard 상단에 `추천과 안내` 센터를 둔다.
- sidebar의 Dashboard 항목과 센터 header에는 현재 actionable count를 표시한다.
- 카드에는 kind, status, title, summary, explanation, freshness, evidence와 source를 표시한다.
- action이 있는 카드만 `관련 화면 열기` 또는 저장된 label의 실행 버튼을 노출한다.
- 모든 actionable 카드는 `나중에`와 `관심 없음`을 지원한다.
- 새 recommendation toast는 한 번에 최신 한 건만 표시하고 browser-local seen id 목록으로 반복을 막는다.
- Dashboard 첫 조회에서 actionable recommendation이 없으면 memory, operational state와 bounded Knowledge를
  한 번 평가해 센터를 채운다. 이후 자동 재조회는 process-local 15분 TTL을 적용하고, 사용자가 누른
  `새로고침`만 TTL을 명시적으로 우회한다.

별도 top-level navigation view는 만들지 않는다. 초기 recommendation 수가 적고 Dashboard가 이미 앱의
상태 요약 surface이므로, Stage 9에서는 새로운 정보 구조를 추가하는 것보다 카드 흐름을 검증한다.

## API Boundary

- `GET /api/v1/recommendations?limit=N`
- `POST /api/v1/recommendations/interaction`
  - body: `recommendation_id`, `interaction=open|snooze|dismiss`
- `POST /api/v1/recommendations/confirmation`
  - body: `recommendation_id`, `confirmation_id`, `decision=accept|reject`

owner id는 request에서 받지 않고 local authenticated owner context에서만 결정한다. `open`은
`recommendation.opened`를 기록한 뒤 Stage 8 handoff service에 recommendation id만 전달한다.
client capability id, params, target override와 confirmation policy는 허용하지 않는다.

## Lifecycle Semantics

- list는 due snooze/expiry를 reconcile한 뒤 `available`, `action_failed`만 반환한다.
- `나중에`는 server-owned 24시간 snooze다.
- `관심 없음`은 explicit `not_helpful` feedback을 기록한 뒤 dismiss한다.
- presentation 이동은 action lifecycle을 만들지 않는다.
- Capability confirmation reject는 recommendation을 available로 유지한다.
- Capability success/failure/retry는 Stage 8 lifecycle을 그대로 사용한다.

## UI Safety

- DOM은 textContent 기반으로 만들고 evidence source URL은 `https:`만 링크한다.
- presentation surface는 UI-side allowlist로만 navigation한다.
- mobile quick mode에서 지원하지 않는 settings/logs/shopping surface는 잘못된 화면으로 우회하지 않고
  데스크톱 화면 사용 안내를 표시한다.
- raw params, internal policy, owner id와 evidence features는 API/DOM에 노출하지 않는다.

## Empty and Failure States

- bounded 평가 후에도 정책을 통과한 Recommendation이 없으면 정상 empty state를 표시한다.
- persistent memory가 unavailable이어도 volatile store 상태와 함께 UI는 계속 동작한다.
- list failure는 기존 Dashboard polling을 막지 않고 센터 안에서만 retry 상태를 표시한다.
- 한 interaction 실패는 해당 카드만 복구하고 다른 카드를 유지한다.

## Tests

- owner-scoped actionable listing, reconcile, DTO redaction과 ordering
- open/snooze/dismiss/confirmation lifecycle
- route method and endpoint dispatch
- unsafe request keys and invalid interaction rejection
- UI composition, unique DOM ids, script/CSS module boundaries
- browser smoke and responsive layout
- full unit regression

## Out of Scope

- app startup/background candidate evaluation and delivery scheduling (Stage 10). Dashboard 진입 시의
  on-demand bounded evaluation은 빈 Product MVP를 피하기 위한 Stage 9 surface 책임으로 유지한다.
- Telegram/OS notification delivery
- recommendation analytics funnel and learning weights (Stage 11)
- admin authoring or historic backfill
- version bump, release, remote push
