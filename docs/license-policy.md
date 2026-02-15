# License Policy (BlogGenius v3)

이 문서는 BlogGenius의 플랜 기반 라이선스 정책(v3)을 정리합니다.

## 1. 정책 요약

- 기본 라이선스 키: `test`
- 플랜: `test`, `free`, `pro`, `ultra`
- `test`: 모든 기능 허용, 1회성 20회(`quota_cycle=none`)
- `free`: 일부/무료 플랜, 월 15회(`quota_cycle=monthly`)
- `pro`: 모든 기능 허용, 월 100회
- `ultra`: 모든 기능 허용, 무제한
- test 플랜 1회성 규칙:
  - `test -> 만료 -> free` 전환은 허용
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

라이선스 검증/차감은 모두 Supabase RPC에서 처리합니다.

- 사전 검증(무차감): `check_license_status`
- 실제 차감: `check_and_use_license`

앱 역할:
- `LICENSE_KEY` 읽기
- 빈 값이면 `test`로 정규화
- HWID와 함께 RPC 호출

서버 역할:
- 키가 공용키(`test`, `free`)인지 개별 유료키인지 판단
- 플랜 정책/기능 조회
- 차감/거부/잔여 반환

## 3. 테이블

### 3.1 `public.license_plans`

플랜 정책/기능의 단일 기준 테이블

- `plan_code`: `test`, `free`, `pro`, `ultra` ...
- `quota_mode`: `metered` or `unlimited`
- `quota_limit`, `quota_cycle`
- `features` (jsonb): 기능 플래그/제한값

### 3.2 `public.license_access_keys`

공용 키 매핑 테이블

- `access_key`: `test`, `free`
- `plan_code`
- `is_default` (`test=true`)

### 3.3 `public.licenses`

개별 유료 키 테이블(기존 유지)

- `license_key`, `status`, `hwid`, `email`
- `plan_code` (`pro`, `ultra` 등)
- `usage_limit`, `usage_count`, `reset_date` (필요 시 개별 override)
- `license_mode` (`metered`, `unlimited`)
- `expires_at`

### 3.4 `public.free_license_usages`

공용 키(test/free) 사용량 카운터

- `hwid_hash` + `access_key` 조합으로 카운트
- `usage_limit`, `usage_count`, `period_start`, `period_end`

### 3.5 `public.license_device_states`

기기 단위 1회성 정책 강제 테이블

- `hwid_hash` (PK)
- `test_started_at`, `test_exhausted_at`
- `non_test_used` (free/pro/ultra 사용 이력)

이 테이블로 `test` 재진입 차단을 강제합니다.

## 4. RPC 동작

### 4.1 공용 키 경로 (`test`, `free`)

1. `license_access_keys`에서 플랜 결정
2. `license_plans`에서 quota/features 조회
3. `free_license_usages`에서 `hwid_hash + access_key` 카운트 처리
4. `quota_cycle` 기준 리셋 후 차감

### 4.2 개별 유료 키 경로

1. `licenses.license_key` 조회
2. `status`, `expires_at`, `hwid` 확인
3. `licenses.plan_code`로 `license_plans` 조회
4. `metered`면 차감, `unlimited`면 무차감 승인

## 5. 설정 값

`config/config.txt`:

```txt
LICENSE_KEY = test
```

- 빈 값도 내부에서 `test`로 처리됩니다.
- 정식 무료 플랜은 `LICENSE_KEY = free`로 사용 가능합니다.

## 6. 기능 제한(Feature Flags)

`license_plans.features`에 json으로 저장합니다.

예시:

```json
{
  "cmd_batch": true,
  "cmd_shopping": true,
  "image_generation": true,
  "enable_related_posts_auto_link": true,
  "max_blog_posts_per_run": 3
}
```

현재 앱은 잔여 횟수 중심으로 동작하며, 기능 플래그는 RPC 응답으로 함께 반환됩니다.
후속 단계에서 명령별 게이트를 이 값 기준으로 확장할 수 있습니다.

## 7. 적용 SQL

- `sql/supabase_license_v3.sql` (권장, 최초/마이그레이션)
- `sql/supabase_license_precheck.sql` (사전검증 RPC만 재배포할 때)
