# License Operations Guide (v4)

이 문서는 BlogGenius v4 라이선스 운영 절차를 정리합니다.

기준:
- 공유 키(`test`, `free`)를 사용하지 않습니다.
- 모든 플랜(`test/free/pro/ultra`)은 고유 `license_key`를 발급해 운영합니다.

## 1. 적용 순서

1. Supabase SQL Editor에서 v4 SQL 적용
  - `sql/supabase_license_v4_unique_keys.sql`
2. 발행 quota v5 migration 적용
  - `sql/supabase_license_quota_v5.sql`
3. 운영용 발급/갱신 SQL 사용
  - `sql/supabase_license_operations.sql`
  - `sql/supabase_issue_pro_license.sql`
  - `sql/supabase_issue_test_free_license.sql`
4. 라이선스 등록 메일 발송 함수 배포
  - `supabase/functions/send-license-code/index.ts`
  - 함수 시크릿: `BREVO_API_KEY`, `LICENSE_EMAIL_FROM`

참고:
- v4 적용 환경에서는 `supabase_license_v4_unique_keys.sql`의 RPC가 기준입니다.

## 2. 기본 운영 원칙

1. `LICENSE_KEY`는 사용자별 고유값을 사용합니다.
2. `email`을 항상 함께 기록합니다.
3. 기기 변경 대응은 `licenses.hwid = null` 재바인딩 방식으로 처리합니다.
4. 월 차감형은 `usage_count/reset_date`를 기준으로 운영합니다.
5. 최초 실행의 test 플랜은 앱이 `issue_test_license` RPC로 자동 발급/저장합니다.
6. test 사용량 소진 시에는 자동 전환하지 않고, 앱의 계정 화면에서 이메일을 입력해 Free Plan으로 전환합니다.
7. feature JSON은 필수 키 네 개를 모두 포함하며 누락을 허용하지 않습니다.
8. 발행 사용량은 `reserve_publish_quota -> commit_publish_quota|release_publish_quota` 순서로 처리합니다.
9. `license_usage_operations`가 동일 operation ID의 중복 차감과 부분 성공 재발행을 방지합니다.

### 2.1 목표 feature JSON

권장 초기 운영값은 다음과 같습니다.

| Plan | cmd_batch | cmd_trends | cmd_shopping | enable_related_posts_auto_link |
|---|---:|---:|---:|---:|
| test | true | true | true | true |
| free | true | false | false | false |
| pro | true | true | true | true |
| ultra | true | true | true | true |

`test`는 유료 기능을 체험할 수 있도록 전체 허용하고, `free`는 기본 발행 중심으로 운영하는 권장안이다. 실제 상품 정책은 `license_plans`가 기준이다.

각 플랜의 `features` 예시:

```json
{
  "cmd_batch": true,
  "cmd_trends": false,
  "cmd_shopping": false,
  "enable_related_posts_auto_link": false
}
```

제거 대상 키:

- `cmd_pub`
- `image_generation`
- `max_blog_posts_per_run`
- `max_shopping_posts_per_run`
- `enable_trends_date_override`

주의: 저장소 코드는 새 feature 계약을 지원한다. 원격 Supabase에서는 이 앱 버전을 배포한 뒤 제거 대상 키를 삭제한다.

## 3. 운영 시나리오

### 3.-1 최초 실행 자동 test 발급

- 사용자가 `config/license.key` 없이 앱을 실행하면 자동으로 `issue_test_license(p_hwid)`를 호출합니다.
- 발급 성공 시 앱이 `config/license.key`를 자동 저장합니다.
- 운영자 개입은 기본적으로 필요하지 않습니다.
- 실패 시(네트워크/DB/RPC 오류)만 운영자가 키를 수동 발급해 전달합니다.

### 3.-2 등록 절차

- 목적: 현재 사용 중인 라이선스에 이메일 연결 (플랜 변경 없음)
- 흐름:
  1. 사용자 이메일 입력
  2. 인증 코드 요청/전송 (기본 300초 유효)
  3. 인증 코드 검증
  4. 현재 라이선스에 이메일 연결
- 구현 RPC:
  - `request_license_registration(p_email text)`
  - `verify_license_registration(p_email text, p_code text, p_hwid text, p_license_key text)`
- 메일 발송:
  - Edge Function `send-license-code` 호출
  - 함수 내부에서 Brevo Transactional Email API를 통해 인증 코드 메일 발송
  - 인증 코드 row는 RPC 요청 시 먼저 생성되고, 앱이 메일 발송 결과를 다시 기록합니다.
  - `license_registration_codes.send_status`:
    - `created`: 코드 생성 후 아직 발송 결과가 기록되지 않음
    - `sent`: Edge Function/Brevo 발송 성공
    - `failed`: Edge Function/Brevo 발송 실패
  - `failed` row는 운영 감사 로그로 보존합니다. `send_error`, `send_provider_status`로 실패 원인을 확인합니다.
- 유효시간 설정:
  - `app_runtime_configs.config_key='license_registration_code_ttl_seconds'`
  - 값이 없으면 기본값 `300초(5분)` 사용

### 3.-3 복구 절차

- 목적: 재설치/신규 기기에서 이메일 인증으로 기존 키 복구
- 흐름:
  1. 사용자 이메일 입력
  2. 등록 이메일 여부 확인 (미등록이면 즉시 안내 후 종료)
  3. 인증 코드 요청/전송
  4. 인증 코드 검증
  5. 기존 라이선스 키 로컬 저장
- 구현 RPC:
  - `request_license_recovery(p_email text)`
  - `verify_license_recovery(p_email text, p_code text, p_hwid text)`
- 참고:
  - 등록 이메일이 없으면 메일을 발송하지 않고 `등록된 이메일이 없습니다` 메시지를 반환합니다.
  - 등록과 같은 `license_registration_codes` 테이블을 사용하며, 메일 발송 성공/실패 상태를 동일하게 기록합니다.

### 3.-4 업그레이드 절차

- 목적: 플랜 전환만 수행 (`register`와 분리)
- 현재 정책: `free` 업그레이드만 지원
- 구현 RPC:
  - `upgrade_license_plan(p_license_key text, p_hwid text, p_target_plan text, p_email text)`
- 참고:
  - 이메일 미연결 상태에서 업그레이드 실행 시 앱이 등록 절차를 먼저 진행한 뒤 업그레이드를 재시도합니다.

#### 3.-2-a 메일 발송 함수 설정(1회)

Supabase CLI 기준 예시:

```bash
supabase functions deploy send-license-code --project-ref <PROJECT_REF> --no-verify-jwt
supabase secrets set BREVO_API_KEY=<YOUR_BREVO_KEY> --project-ref <PROJECT_REF>
supabase secrets set LICENSE_EMAIL_FROM="BlogGenius <license@your-domain.com>" --project-ref <PROJECT_REF>
```

체크 포인트:
- `send-license-code` 함수는 앱에서 익명 호출하므로 `--no-verify-jwt`로 배포해야 합니다.
- Brevo 발신 도메인/발신자(sender)가 인증되어 있어야 합니다.
- `BREVO_API_KEY`는 Brevo API 키(`xkeysib-...`)를 사용합니다.
- 시크릿 누락 시 앱의 등록 흐름은 실패해야 정상입니다(보안상 코드 미노출).

#### 3.-2-b 장애 대응 가이드

- 증상: `status=401` (Edge Function returned non-2xx)
  - 원인: 함수 JWT 검증 활성화
  - 조치: `--no-verify-jwt` 옵션으로 함수 재배포

- 증상: `status=400 Either of htmlContent or textContent is required`
  - 원인: Brevo payload 형식 오류
  - 조치: 함수 코드 최신화 후 재배포 (`htmlContent`, `textContent` 사용)

- 증상: `status=502 email_provider_error`
  - 원인: Brevo 인증/발신자 설정/쿼터 문제
  - 조치:
    1. Brevo API 키 재확인 (`xkeysib-...`)
    2. `LICENSE_EMAIL_FROM` 발신자 인증 상태 확인
    3. 함수 로그에서 `provider_response.message` 확인

- 증상: 인증 코드 메일 미수신
  - 조치:
    1. 스팸함 확인
    2. Brevo Sender 인증 확인
    3. Brevo 계정 제한(일일 한도/심사 상태) 확인
    4. Edge Function 로그에서 4xx/5xx 상세 메시지 확인

### 3.0 가장 빠른 발급 (권장)

파일: `sql/supabase_issue_pro_license.sql`

운영자 순서:
1. SQL 파일 열기
2. `params` CTE의 값 수정 (`p_email`, `p_usage_limit`, `p_note`)
3. 실행 후 반환된 `license_key`를 사용자에게 전달
4. 사용자는 `config/license.key`에 입력

test/free 고유키를 빠르게 발급하려면:

- 파일: `sql/supabase_issue_test_free_license.sql`
- 수정할 값:
  - `p_plan_code` (`test` 또는 `free`)
  - `p_email`
  - `p_usage_limit_override` (선택)
  - `p_note`
- 실행 결과: `license_key` 반환 (이 값을 사용자에게 전달)

### 3.1 test 플랜 고유키 발급

- 권장: `sql/supabase_issue_test_free_license.sql` 사용 (`p_plan_code='test'`)
- 기본값: 20회, 1회성(`reset_date=null`)

### 3.2 free 플랜 고유키 발급 (월 갱신형)

- 권장: `sql/supabase_issue_test_free_license.sql` 사용 (`p_plan_code='free'`)
- 기본값: 월 15회(`reset_date=now + 1 month`)

### 3.3 pro / ultra 발급

- `pro`(차감형), `ultra`(무제한) 발급은 `sql/supabase_license_operations.sql`의 A/B 섹션 사용
- `ultra` 구독형은 C 섹션(`expires_at`)으로 운영

### 3.4 플랜 전환 (free -> pro 등)

권장:
- 동일 사용자라면 **기존 key 유지 + plan 변경** 방식으로 운영하면 사용자 안내가 단순합니다.

예시:
```sql
update public.licenses
set plan_code = 'pro',
    status = 'active',
    usage_limit = 300,
    usage_count = 0,
    reset_date = timezone('utc', now()) + interval '1 month',
    license_mode = 'metered',
    expires_at = null,
    updated_at = timezone('utc', now()),
    note = 'upgraded from free to pro'
where license_key = 'FREE-KEY-REPLACE-ME';
```

대안:
- 새 키를 발급해 전달해도 됩니다. (보안/운영 정책에 따라 선택)

### 3.5 비활성화 / 환불 / 해지

```sql
update public.licenses
set status = 'inactive',
    updated_at = timezone('utc', now()),
    note = 'deactivated by operator'
where license_key = 'LICENSE-KEY-REPLACE-ME';
```

### 3.6 HWID 재바인딩

```sql
update public.licenses
set hwid = null,
    updated_at = timezone('utc', now()),
    note = 'hwid reset by operator'
where license_key = 'LICENSE-KEY-REPLACE-ME';
```

## 4. 사용자 안내 템플릿

1. 발급 안내:
  - `LICENSE_KEY`를 전달하고 `config/license.key`에 입력하도록 안내
2. 플랜 전환 안내:
  - 기존 키 유지 전환이면 별도 조치 없음
  - 새 키 발급 전환이면 `config/license.key`의 키 교체 안내
3. 기기 변경 안내:
  - 운영자가 HWID reset 후 재실행 요청

## 5. 점검 체크리스트

1. `public.licenses.status='active'` 인가
2. `plan_code`, `license_mode`, `usage_limit`, `reset_date`, `expires_at` 값이 정책과 일치하는가
3. `email`이 정확히 입력되어 있는가
4. 필요 시 `hwid` 재바인딩(`null`)이 처리되었는가
5. 차감형 플랜에서 `usage_count <= usage_limit` 상태인가

## 6. SQL 파일 역할 요약

- `sql/supabase_issue_pro_license.sql`
  - 운영자가 빠르게 pro 키를 발급할 때 사용
- `sql/supabase_issue_test_free_license.sql`
  - 운영자가 test/free 고유키를 빠르게 발급할 때 사용
- `sql/supabase_license_operations.sql`
  - 발급/갱신/비활성화/HWID 재바인딩 운영 작업
