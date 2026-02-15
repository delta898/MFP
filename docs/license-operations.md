# License Operations Guide (v3)

이 문서는 BlogGenius v3 라이선스 운영 절차를 정리합니다.

## 1. 적용 순서

1. Supabase SQL Editor에서 `sql/supabase_license_v3.sql` 실행
2. 필요 시 `sql/supabase_license_precheck.sql` 실행 (사전검증 함수만 갱신할 때)

## 2. 기본 정책 확인

- 기본 키: `test`
- 공용 키:
  - `test` -> `test` 플랜
  - `free` -> `free` 플랜
- 유료 키: `licenses` 테이블에 발급
- test 1회성:
  - `test -> free` 전환 허용
  - `free/pro/ultra` 사용 이력 이후 `test` 재사용 불가
  - `test` 소진 후 재사용 불가

## 3. 운영 시나리오

### 3.1 유료 키 신규 발급 (metered / pro)

`sql/supabase_license_operations.sql`의 A 섹션 사용

- `license_key`, `email`, `usage_limit`, `plan_code` 수정
- 기본 권장: `plan_code='pro'`, `license_mode='metered'`

### 3.2 무제한 키 발급 (ultra)

`sql/supabase_license_operations.sql`의 B 섹션 사용

- `plan_code='ultra'`
- `license_mode='unlimited'`

### 3.3 기간형(구독형) 무제한

`sql/supabase_license_operations.sql`의 C 섹션 사용

- `expires_at`만 연장/갱신

### 3.4 test/free 정책 수정

`license_plans` 테이블만 수정하면 즉시 반영됩니다.

예시:

```sql
update public.license_plans
set quota_limit = 30,
    quota_cycle = 'monthly',
    updated_at = timezone('utc', now())
where plan_code = 'free';
```

날짜 지정 트렌드(`trends --date`) 권한까지 함께 조정하려면:

```sql
update public.license_plans
set features = jsonb_set(coalesce(features, '{}'::jsonb), '{enable_trends_date_override}', 'false'::jsonb, true),
    updated_at = timezone('utc', now())
where plan_code = 'free';
```

### 3.5 기본 키를 test -> free로 바꾸기

```sql
update public.license_access_keys
set is_default = (access_key = 'free'),
    updated_at = timezone('utc', now());
```

## 4. free -> 유료 전환

1. 유료 키 발급 (`licenses` insert/upsert)
2. 사용자에게 새 키 전달
3. 사용자가 `config/config.txt`에서 `LICENSE_KEY` 변경
4. 첫 실행 시 HWID 자동 바인딩

참고:
- test/free 카운트는 유료로 합산하지 않습니다.
- 공용(test/free) 카운터는 `free_license_usages`에 유지됩니다.
- test 재사용 차단 상태는 `license_device_states`에 유지됩니다.

## 5. 점검 체크리스트

1. `license_plans.status='active'` 인가
2. `license_access_keys` 매핑이 올바른가 (`test`, `free`)
3. 유료 키의 `status`, `plan_code`, `license_mode`, `expires_at` 값이 맞는가
4. HWID 재바인딩이 필요하면 `licenses.hwid = null` 처리했는가
5. test 재진입 이슈 점검 시 `license_device_states.non_test_used/test_exhausted_at` 확인
