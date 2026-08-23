# Proactive Guidance Stage 8: Trusted Capability Handoff

## Status

- Phase: completed on 2026-08-24 under approved non-UI workflow
- Parent integration branch: `feature/proactive-guidance-main`
- Branch: `feature/proactive-guidance-08-capability-handoff`
- Version: unchanged during feature work

## Objective

저장된 Recommendation의 primary handoff를 서버에서 다시 조회하고, presentation 이동과
side-effecting Capability 실행을 분리한다. 앱은 recommendation id와 confirmation decision만
보낼 수 있으며 capability id, params, confirmation policy를 선택하거나 낮출 수 없다.

## Trusted Resolution Boundary

1. 인증된 runtime context에서 owner id를 얻는다.
2. owner-scoped lifecycle store에서 recommendation id를 조회한다.
3. 현재 status와 expiry를 확인한다.
4. 저장된 canonical `candidate.handoff`만 읽는다.
5. capability handoff면 Registry에서 type, validation, preview와 confirmation policy를 다시 읽는다.
6. 실행 직전에 validation을 다시 수행하므로 entitlement, quota와 설정의 최신 상태를 사용한다.

브라우저가 `capability_id`, `params`, owner override 또는 `requires_confirmation`을 보내면
handoff service가 요청을 거부한다. public Recommendation DTO는 계속 capability label만 노출한다.

## Presentation and Capability

- `presentation`: allowlisted target와 safe payload를 반환할 뿐 side effect나 action lifecycle을 만들지 않는다.
- `capability`: server-stored params로 preview를 만들고 Registry 정책이 `never`가 아닌 경우 기존
  Confirmation Store에 recommendation correlation을 저장한다.
- confirmation 생성만으로 `action_in_progress`가 되지 않는다. 거절 시 Recommendation은 그대로 남는다.

## Lifecycle and Failure Policy

- 실제 Registry execute 직전 `recommendation.action_started`
- 정상 execute 뒤 `recommendation.action_completed`
- execute exception 또는 explicit unsuccessful result 뒤 `recommendation.action_failed`
- `action_failed`는 새로운 operation으로 재시도 가능
- capability 성공 후 completion event 기록만 실패한 경우 `action_in_progress`를 유지하고 중복 실행을
  차단한다. 자동 보상이나 outbox reconciliation은 후속 운영 hardening 범위다.
- lifecycle metadata에는 capability id와 stable error code만 남기고 raw exception/result/params는 남기지 않는다.

## Confirmation Correlation

Confirmation Store는 bounded string 네 개만 허용하는 generic correlation을 보존한다.

- `kind`
- `owner_id`
- `resource_id`
- `operation_id`

승인 시 저장된 action snapshot을 실행하지 않고 Recommendation과 Capability Registry를 다시 조회한다.
따라서 승인 대기 중 설정, 권한, quota 또는 capability 등록 상태가 달라져도 최신 검증을 통과해야 한다.

## Tests

- presentation/capability separation
- client capability/params injection rejection
- owner isolation, expiry와 invalid lifecycle state
- current-state validation at prepare and confirmation time
- required confirmation accept/reject and no premature lifecycle transition
- direct no-confirm execution
- success/failure/retry lifecycle
- confirmation persistence correlation normalization
- full unit regression

Stage 8은 UI/API route를 변경하지 않으므로 사용자 UI test가 없다.

## Out of Scope

- Recommendation Center routes and UI (Stage 9)
- capability가 없는 Stage 6 content/commerce 후보에 임의 action 매핑
- delivery scheduler (Stage 10)
- crash recovery outbox and stale `action_in_progress` reconciliation
- version bump, release, remote push
