# Smart Capability Usage Hardening Plan

## Goal

스마트 기능의 월 제공량을 Supabase 정책으로 운영하면서 중복 요청, 공급자 성공 후
commit 장애, 동시 실행에도 외부 호출과 사용량이 의도치 않게 중복되지 않도록 한다.

## Confirmed product policy

| Plan | `content_idea` | `keyword_discovery` | `title_recommendation` |
| --- | ---: | ---: | ---: |
| `test` | 40 | 40 | 40 |
| `free` | 20 | 20 | 20 |
| `pro` | 80 | 80 | 80 |
| `ultra` | 300 | 300 | 300 |

- 세 기능의 플랜별 월 제공량은 동일하다.
- 한도와 세션 규칙의 runtime source of truth는 `license_plans`다.
- 월 주기는 Asia/Seoul 기준 매월 1일 00:00에 갱신한다.
- 사용 가능한 외부 공급자 결과를 사용자에게 반환한 요청만 차감한다.
- 입력 오류, 캐시 hit, 공급자 실패, 유효 결과가 없는 응답은 차감하지 않는다.
- 월 제공량 소진 시 기능 실행을 막고 기존 플랜/업그레이드 action을 안내한다.

## Boundary

```text
UI logical request
  -> stable session_id + operation_id
  -> Smart Usage Runtime (execution owner)
  -> Supabase reserve (quota authority)
  -> provider action
  -> Supabase commit or local reconciliation queue
  -> feature result + usage state
```

Supabase는 플랜, 월 주기, 세션 요청 예산, 차감 원장을 책임진다. 앱의 Smart Usage
Runtime은 외부 공급자 호출의 단일 실행, 결과 replay, commit 재시도를 책임진다. UI는
operation ID를 생성·재사용하지만 quota 상태나 플랜 설정을 직접 변경하지 않는다.

## Operation identity contract

- `session_id`: 추천 surface를 연 시점부터 닫을 때까지 유지한다.
- `operation_id`: 사용자가 시작한 논리적 외부 요청 한 건에 하나를 발급한다.
- HTTP 재시도와 동일 버튼 요청의 coalescing에는 기존 operation ID를 재사용한다.
- 사용자가 명시적으로 새 결과를 요청하면 같은 session ID와 새 operation ID를 사용한다.
- Supabase uniqueness는 `(license_id, capability, operation_id)`를 유지한다.

## Reserve response contract

현재 boolean `idempotent`만으로는 공급자 실행 가능 여부를 판단할 수 없다. RPC 응답은
최소한 다음 상태를 구분해야 한다.

| `operation_state` | `execute_allowed` | Runtime action |
| --- | --- | --- |
| `newly_reserved` | `true` | 공급자 호출 시작 |
| `already_reserved` | `false` | 동일 in-flight Promise를 기다리거나 처리 중 응답 |
| `already_committed` | `false` | 저장된 결과 replay 또는 이미 처리됨 응답 |
| `released` | 정책에 따라 | 만료와 공급자 idempotency를 확인한 뒤 명시적 재시도 |

`success: true`는 quota RPC 자체의 성공 여부이고, `execute_allowed: true`만 새 공급자
호출을 허가한다.

## Runtime execution registry

Smart Usage Runtime은 `capability + operation_id`를 키로 다음 상태를 관리한다.

- `in_flight`: 동시 요청이 같은 Promise를 공유한다.
- `provider_succeeded`: 사용 가능한 결과가 생성됐고 commit 대기 또는 재시도 중이다.
- `committed`: 결과와 사용량이 확정됐다.
- `provider_failed`: 공급자 결과가 없으며 reservation을 release한다.

완료 결과 cache는 reservation TTL보다 길게 유지해 즉시 transport retry를 replay한다.
재시작 후 결과 payload replay까지 보장할 필요가 있는 capability는 후속 durable result
store를 사용한다. 결과 payload에 비밀키나 원문 prompt를 저장하지 않는다.

## Commit failure reconciliation

공급자 성공과 quota commit은 하나의 원격 transaction으로 묶을 수 없으므로 다음
outbox 형태로 복구한다.

1. 공급자에서 usable result를 받는다.
2. `capability`, `session_id`, `operation_id`, 안전한 metadata를 local reconciliation
   store에 원자적으로 기록한다.
3. 같은 operation ID로 `commit_smart_usage`를 호출한다.
4. commit 성공 시 outbox row를 완료 처리하고 결과와 최신 usage를 반환한다.
5. commit 통신 실패 시 결과는 성공으로 반환하되 `usage_sync_pending: true`를 포함한다.
6. 앱 시작, 계정 사용량 새로고침, 다음 스마트 기능 실행 전에 pending commit을 재시도한다.
7. commit은 idempotent하므로 성공 응답을 잃어도 같은 operation ID로 재호출한다.

공급자 성공 이후에는 `release_smart_usage`를 호출하지 않는다. release는 provider action이
실패해 usable result가 없을 때만 허용한다.

## Exhaustion UX contract

- 월 소진: `SMART_USAGE_EXHAUSTED`, HTTP 429, 기능별 usage snapshot 반환
- 세션 요청 소진: `SMART_SESSION_REQUEST_LIMIT`, HTTP 429, 새 surface/session 안내
- 월 소진 UI: 실행 버튼 비활성화, 남은 횟수 0 표시, 기존 `upgrade_free` 또는 플랜 보기
  action 노출
- 사용량 서버 장애: 소진으로 가장하지 않고 일시 장애 상태로 표시

## Database rollout artifacts

- 최초 설치: `sql/supabase_smart_capability_usage_v1.sql`
- 정책 재적용/변경: `sql/supabase_smart_capability_usage_policy.sql`
- 운영 절차: `docs/license-operations.md`

최초 migration과 정책 SQL의 플랜 값은 항상 동일해야 한다. 앱 배포 전에 migration을
적용하고 RPC smoke test를 완료한다.

## Implementation sequence

1. reserve RPC에 `operation_state`와 `execute_allowed` 계약 추가
2. runtime in-flight/result registry 구현
3. local reconciliation store와 commit retry 구현
4. provider 성공과 provider 실패 catch 경로 분리
5. 소진 오류를 기존 계정 upgrade action과 연결
6. 정규 단위 테스트 목록에 smart usage 테스트 편입
7. 스테이징 Supabase migration 및 동시성 smoke test
8. 앱 배포 후 운영 usage 조회 검증

## Verification

- 동일 operation ID 동시 요청이 공급자를 한 번만 호출한다.
- committed operation 재요청이 공급자를 다시 호출하지 않는다.
- 공급자 실패는 release되고 월 사용량을 소비하지 않는다.
- 공급자 성공 후 첫 commit 실패에도 결과가 반환되고 release되지 않는다.
- pending commit은 재시작 이후 같은 operation ID로 확정된다.
- cache hit는 reserve RPC와 월 사용량을 소비하지 않는다.
- 월 한도 소진 시 공급자를 호출하지 않고 업그레이드 action을 제공한다.
- Test 40 / Free 20 / Pro 80 / Ultra 300 정책이 status RPC에 반영된다.
