# Publish Quota Lifecycle Plan

## Goal

발행 quota를 콘텐츠 작업 단위로 계산하고 실패, 부분 성공, 재시도, 동시 실행에도 중복 차감되지 않게 한다.

## Contract

- quota 단위는 플랫폼 수와 무관한 콘텐츠 발행 작업 1건이다.
- `draft`, `schedule`, `publish`는 대상 플랫폼 중 한 곳 이상 성공하면 1회를 확정한다.
- 모든 대상 플랫폼이 실패하면 예약을 반환한다.
- 콘텐츠 생성, 트렌드/RSS 수집, 쇼핑 대기열 관리는 quota를 사용하지 않는다.
- 동일 `operation_id`는 재시도해도 한 번만 확정한다.
- 실행 전 표시값은 `선택 A건 · 잔여 B회 · 최대 C건 실행`이며 `C = min(A, B)`다.
- unlimited 플랜의 `remaining`은 `-1`이며 선택한 전체 작업을 실행한다.

## Architecture

```text
publish preflight
  -> reserve_publish_quota(operation_id)
  -> platform execution (Naver and/or WordPress)
  -> commit_publish_quota(operation_id) when any platform succeeds
  -> release_publish_quota(operation_id) when every platform fails
```

`license_usage_operations` ledger가 작업 상태를 보존한다. `licenses.usage_count`는 확정 사용량 projection으로 유지하고, quota 예약 가능 여부는 확정 사용량과 현재 period의 active reservation을 합산해 판단한다.

## Operation Identity

- 시트 발행: row identity와 발행 상태를 포함한 안정적인 ID를 사용한다.
- 빠른 포스팅 preview: preview ID를 사용한다.
- 로컬 원고: 요청에서 전달된 ID가 있으면 재사용하고 없으면 실행 시 UUID를 만든다.
- 쇼핑 발행: shopping row identity와 발행 상태를 포함한다.
- ID는 라이선스 내부에서 unique하며 다른 라이선스 간에는 공유하지 않는다.

## Failure Rules

- reserve 실패 시 플랫폼 호출을 시작하지 않는다.
- platform exception을 포함해 성공 결과가 하나도 없으면 release한다.
- 한 플랫폼 성공 후 다른 플랫폼이 실패하거나 예외가 발생하면 commit한다.
- commit 통신 실패는 발행 성공을 실패로 되돌리지 않는다. ledger의 동일 operation ID를 재호출할 수 있도록 오류를 기록하고 사용자에게 사용량 동기화 실패를 알린다.
- release 통신 실패는 원격 reservation TTL 정리 대상이다.
- 오래된 reservation은 다음 reserve 호출에서 만료 처리한다.

## Rollout

1. `sql/supabase_license_quota_v5.sql`을 원격 Supabase에 적용한다.
2. reserve/commit/release를 사용하는 앱을 배포한다.
3. 기존 `check_and_use_license` 호출이 없는지 회귀 검증한다.
4. 안정화 후 legacy 차감 RPC 제거 여부를 결정한다.

## Verification

- Naver만 성공: 1회 확정
- WordPress만 성공: 1회 확정
- 둘 다 성공: 1회 확정
- 둘 다 실패: 0회
- 동일 operation ID 재시도: 추가 차감 없음
- 동시 reserve가 잔여 quota를 초과하지 않음
- draft/schedule/publish가 동일 규칙을 사용함
- 수집 및 생성 전용 경로가 quota RPC를 호출하지 않음

