# License Policy (BlogGenius v4)

이 문서는 BlogGenius의 플랜 기반 라이선스 정책(v4, 고유키 통합)을 정리합니다.

## 1. 정책 요약

- 공유 키(`test`, `free`)는 사용하지 않습니다.
- 모든 플랜은 고유 라이선스 키(권장: 16-byte 랜덤) 기반으로 동작합니다.
- 플랜: `test`, `free`, `pro`, `ultra`
- `test`: 모든 기능 허용, 1회성 20회(`quota_cycle=none`)
- `free`: 일부 기능, 월 15회(`quota_cycle=monthly`)
- `pro`: 모든 기능 허용, 월 100회
- `ultra`: 모든 기능 허용, 무제한
- 날짜 지정 트렌드(`trends --date`)는 feature flag(`enable_trends_date_override`)로 제어합니다.
- test 1회성 규칙:
  - `test -> 만료` 후에는 자동 전환하지 않음
  - 계속 사용하려면 `license upgrade` 실행
  - `license register`는 플랜 변경 없이 이메일 연결만 수행
  - `license upgrade`는 플랜 전환만 수행(현재는 `free`만 지원)
  - `test -> (free/pro/ultra) 사용 이력 발생 -> test` 재진입은 차단
  - `test` 소진 후에는 다시 `test` 사용 불가
- 차감 대상:
  - `pub` (실행 1회당 1차감)
  - `trends` (트렌드 시트 반영 직전 1차감)
  - `batch` (포스트 건당 차감)
  - `shopping` (포스트 건당 차감)
- 미차감:
  - `login`
  - `gen`
  - `keywords`

## 2. 구조

라이선스 검증/차감은 Supabase RPC에서 처리합니다.

- 사전 검증(무차감): `check_license_status`
- 실제 차감: `check_and_use_license`

앱 역할:
- `LICENSE_KEY`를 읽어 RPC에 전달
- `LICENSE_KEY`가 비어 있으면 `issue_test_license(p_hwid)`로 test 키 자동 발급 시도
- 발급 성공 시 `config/license.key`에 자동 저장
- HWID와 함께 RPC 호출
- `license register` 명령으로 이메일 인증 후 현재 키에 이메일 연결
- `license recover` 명령으로 이메일 인증 후 기존 키 복구
- `license upgrade` 명령으로 플랜 전환

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

`license_plans.features`에 json으로 저장합니다.

예시:

```json
{
  "cmd_pub": true,
  "cmd_batch": true,
  "cmd_trends": false,
  "cmd_shopping": false,
  "image_generation": true,
  "max_blog_posts_per_run": 3,
  "max_shopping_posts_per_run": 3,
  "enable_related_posts_auto_link": false,
  "enable_trends_date_override": false
}
```

## 7. SQL 반영 메모

- v4 적용 SQL:
  - `sql/supabase_license_v4_unique_keys.sql` (권장)
  - 포함 RPC: `issue_test_license`, `check_license_status`, `check_and_use_license`
- v4 적용 후에는 RPC가 고유키 전용 경로로 동작합니다.
