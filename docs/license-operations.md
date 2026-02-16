# License Operations Guide (v4)

이 문서는 BlogGenius v4 라이선스 운영 절차를 정리합니다.

기준:
- 공유 키(`test`, `free`)를 사용하지 않습니다.
- 모든 플랜(`test/free/pro/ultra`)은 고유 `license_key`를 발급해 운영합니다.

## 1. 적용 순서

1. Supabase SQL Editor에서 v4 SQL 적용
  - `sql/supabase_license_v4_unique_keys.sql`
2. 운영용 발급/갱신 SQL 사용
  - `sql/supabase_license_operations.sql`
  - `sql/supabase_issue_pro_license.sql`
  - `sql/supabase_issue_test_free_license.sql`

참고:
- v4 적용 환경에서는 `supabase_license_v4_unique_keys.sql`의 RPC가 기준입니다.

## 2. 기본 운영 원칙

1. `LICENSE_KEY`는 사용자별 고유값을 사용합니다.
2. `email`을 항상 함께 기록합니다.
3. 기기 변경 대응은 `licenses.hwid = null` 재바인딩 방식으로 처리합니다.
4. 월 차감형은 `usage_count/reset_date`를 기준으로 운영합니다.

## 3. 운영 시나리오

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
    tier = 'pro',
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
