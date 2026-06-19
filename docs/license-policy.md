# License Policy (BlogGenius v4)

이 문서는 BlogGenius의 플랜 기반 라이선스 정책(v4, 고유키 통합)과 2026-06-19에 확정한 feature/quota 목표 계약을 정리합니다. 현재 구현과 목표 계약의 차이는 9절에 기록합니다.

## 1. 정책 요약

- 공유 키(`test`, `free`)는 사용하지 않습니다.
- 모든 플랜은 고유 라이선스 키(권장: 16-byte 랜덤) 기반으로 동작합니다.
- 플랜: `test`, `free`, `pro`, `ultra`
- `test`: 모든 기능 허용, 1회성 20회(`quota_cycle=none`)
- `free`: 일부 기능, 월 15회(`quota_cycle=monthly`)
- `pro`: 모든 기능 허용, 월 100회
- `ultra`: 모든 기능 허용, 무제한
- test 1회성 규칙:
  - `test -> 만료` 후에는 자동 전환하지 않음
  - 계속 사용하려면 앱의 라이선스 화면에서 업그레이드 진행
  - 이메일 등록은 플랜 변경 없이 이메일 연결만 수행
  - 업그레이드는 플랜 전환만 수행(현재는 `free`만 지원)
  - `test -> (free/pro/ultra) 사용 이력 발생 -> test` 재진입은 차단
  - `test` 소진 후에는 다시 `test` 사용 불가
- quota 단위는 콘텐츠 발행 작업 1건이다.
- 네이버와 WordPress에 함께 발행해도 동일 콘텐츠 작업이면 1회만 사용한다.
- `draft`, `schedule`, `publish`는 대상 플랫폼 중 하나 이상이 정상 처리되면 1회 사용한다.
- 모든 플랫폼 실패, 콘텐츠 생성만 수행, 트렌드/RSS 수집, 앱 로그인, 키워드 조사는 사용량을 차감하지 않는다.

## 2. 구조

라이선스 검증/차감은 Supabase RPC에서 처리합니다.

- 사전 검증(무차감): `check_license_status`
- 실제 차감: `check_and_use_license`

앱 역할:
- `LICENSE_KEY`를 읽어 RPC에 전달
- `LICENSE_KEY`가 비어 있으면 `issue_test_license(p_hwid)`로 test 키 자동 발급 시도
- 발급 성공 시 `config/license.key`에 자동 저장
- HWID와 함께 RPC 호출
- 앱의 라이선스 화면에서 이메일 인증 후 현재 키에 이메일 연결
- 앱의 라이선스 화면에서 이메일 인증 후 기존 키 복구
- 앱의 라이선스 화면에서 플랜 전환

서버 역할:
- 입력된 `license_key`로 라이선스 단건 조회
- 플랜 정책/기능 조회
- 차감/거부/잔여 반환
- 월 리셋 플랜은 `reset_date` 또는 `next_quota_reset_at` 기준으로 리셋 처리

## 3. 테이블

### 3.1 `public.license_plans`

플랜 정책/기능의 단일 기준 테이블

- `plan_code`: `test`, `free`, `pro`, `ultra` ...
- `quota_mode`: `metered` or `unlimited`
- `quota_limit`, `quota_cycle`
- `features` (jsonb): 기능 플래그/제한값

### 3.2 `public.licenses`

모든 플랜의 고유 라이선스를 저장하는 테이블

- `license_key` (UNIQUE)
- `status` (`active`, `paused`, `expired`, ...)
- `plan_code`
- `hwid`, `email`
- `usage_limit`, `usage_count`, `reset_date` (필요 시 override)
- `license_mode` (`metered`, `unlimited`)
- `expires_at`

### 3.3 `public.license_device_states` (선택)

기기 단위 test 1회성 정책 강제 테이블

- `hwid_hash` (PK)
- `test_started_at`, `test_exhausted_at`
- `non_test_used`

이 테이블을 통해 test 재진입 차단을 강제합니다.

### 3.4 `public.payment_events` (구독 운영 시 권장)

결제 웹훅 중복 처리 및 감사 로그용

- `provider`, `event_id` (UNIQUE)
- `event_type`, `payload_json`, `processed_at`

## 4. RPC 동작

모든 키는 동일 경로로 처리합니다.

1. `licenses.license_key` 조회
2. `status`, `expires_at`, `hwid` 확인
3. `plan_code` 기반으로 `license_plans` 조회
4. `metered`면 차감, `unlimited`면 무차감 승인
5. `quota_cycle=monthly`면 리셋 시점 도달 시 카운트 리셋

## 5. 설정 값

`config/license.key`:

```txt
발급받은_라이선스_키
```

- 최초 실행에서는 빈 값이어도 test 키 자동 발급/저장 후 진행됩니다.
- 공유 키(`test`, `free`)는 사용하지 않습니다.
- 플랜 변경 시에도 새로 발급받은 고유 키를 사용합니다.

## 6. 기능 제한(Feature Flags)

`license_plans.features`에는 플랜별 차이가 있는 필수 boolean만 저장합니다. 필수 키 누락이나 boolean이 아닌 값은 정책 오류입니다.

목표 계약:

```json
{
  "cmd_batch": true,
  "cmd_trends": false,
  "cmd_shopping": false,
  "enable_related_posts_auto_link": false
}
```

- `cmd_batch`: 수동 다중/자동 발행. 현재 모든 플랜에서 `true`.
- `cmd_trends`: 네이버 트렌드 수집. 허용 시 날짜 지정도 기본 허용. RSS에는 적용하지 않음.
- `cmd_shopping`: 쇼핑 콘텐츠 수집·생성·발행 실행. 데이터와 대기열은 보존.
- `enable_related_posts_auto_link`: 연관 글 자동 연결. pro 이상 활성화.

라이선스 feature에서 제거할 키:

- `cmd_pub`
- `image_generation`
- `max_blog_posts_per_run`
- `max_shopping_posts_per_run`
- `enable_trends_date_override`

`image_generation`이라는 콘텐츠 옵션은 유지한다. 이는 사용자가 해당 글에서 이미지를 생성할지 선택하는 값이며 라이선스 entitlement가 아니다.

## 7. SQL 반영 메모

- v4 적용 SQL:
  - `sql/supabase_license_v4_unique_keys.sql` (권장)
  - 포함 RPC: `issue_test_license`, `check_license_status`, `check_and_use_license`
- v4 적용 후에는 RPC가 고유키 전용 경로로 동작합니다.

## 8. 라이선스 UI 운영 원칙

현재 사용자 노출 라이선스 흐름은 앱 UI에서 제공합니다.

- 상태 조회: 현재 플랜/한도/사용/잔여 확인
- 등록: 이메일 연결(등록) 전용, 플랜 변경 없음
- 복구: 등록된 이메일 기준 라이선스 복구
- 업그레이드: 플랜 전환 전용(현재 정책/구성에 따라 가능한 플랜만 노출)

운영 정책:

- 등록(`register`)과 플랜 변경(`upgrade`)은 분리합니다.
- `register` 성공 시에도 현재 플랜/쿼터는 즉시 변경되지 않습니다.
- 플랜 전환은 `upgrade` 경로로만 처리합니다.

## 9. Usage 처리 목표와 현재 차이

목표 처리:

1. 최신 잔여량으로 `선택 A건 · 잔여 B회 · 최대 C건 실행`을 계산한다.
2. 콘텐츠 작업별 고유 `operation_id`로 quota 1회를 예약한다.
3. 대상 플랫폼 중 하나 이상 성공하면 commit한다.
4. 모든 플랫폼이 실패하면 release한다.
5. 동일 operation id 재시도는 추가 차감하지 않는다.

현재 v4 `check_and_use_license`는 발행 전에 즉시 `usage_count + 1`을 수행한다. 따라서 실패·재시도·다중 플랫폼 정책이 목표 계약과 다르며 코드/RPC 마이그레이션이 필요하다. 트렌드 수집 경로도 현재 차감 RPC를 호출하므로 제거해야 한다.

Supabase 반영 순서에 주의한다. 저장소 코드는 새 계약을 지원하지만, 원격 Supabase의 제거 대상 키는 이 앱 버전이 배포된 뒤 삭제한다.
