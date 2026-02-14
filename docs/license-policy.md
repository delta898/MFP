# License Policy (BlogGenius)

이 문서는 현재 BlogGenius 라이선스 정책과 운영 방식을 정리한 문서입니다.

## 1. 정책 요약

- 기본 라이선스 키: `free`
- 무료 정책: **월 리셋 15회**
- 차감 대상:
  - `pub` (실행 1회당 1차감)
  - `auto` (실행 1회당 1차감)
  - `trends` (트렌드 시트 반영 직전 1차감)
  - `batch` (**포스트 건당 차감**)
  - `shopping` (**포스트 건당 차감**)
- 미차감:
  - `login`
  - `gen`
  - `keywords`
- 유료 전환 시 무료 잔여분: **무시** (합산하지 않음)
- 무한 라이선스 지원: `license_mode = 'unlimited'`

## 2. 전체 구조

라이선스 검증은 앱에서 직접 계산하지 않고, Supabase RPC(`check_and_use_license`)에서 처리합니다.

- 앱 역할:
  - `config/config.txt`의 `LICENSE_KEY` 읽기
  - 빈 값이면 `free`로 정규화
  - HWID와 함께 RPC 호출
- 서버 역할:
  - 무료/유료/무한 정책 판단
  - 사용 횟수 차감/거부
  - 잔여 횟수 반환

### 2.1 사전 체크 vs 실제 차감

- `batch`, `shopping`:
  - 실행 시작 시 사전 검증 RPC(`check_license_status`)로 유효성/잔여 조회(무차감)
  - 실제 차감은 각 포스트 발행 직전 `check_and_use_license` 호출 시 발생
- `auto`, `pub`, `trends`:
  - 해당 핵심 동작 직전에 `check_and_use_license` 호출(즉시 차감)
- `gen`, `keywords`, `login`:
  - 라이선스 차감 호출 없음

## 3. 테이블

### 3.1 `public.licenses` (유료/구독)

기존 테이블 유지 + 아래 컬럼 사용:

- `license_key` : 라이선스 키
- `email` : 운영 식별용 사용자 이메일 (권장 필수)
- `status` : `active`일 때만 승인
- `hwid` : 최초 승인 시 바인딩
- `usage_limit`, `usage_count`, `reset_date` : metered(차감형) 정책
- `license_mode` : `metered` or `unlimited`
- `expires_at` : 기간형 라이선스 만료 시각 (null 가능)

### 3.2 `public.license_policies` (무료 정책 관리)

- `policy_key='free_default'`
- `quota=15`
- `reset_cycle='monthly'`

정책은 DB 값으로 관리하므로 앱 재배포 없이 변경 가능합니다.

### 3.3 `public.free_license_usages` (무료 사용자 사용량)

- `hwid_hash` : HWID SHA-256 해시 (원문 HWID 미저장)
- `usage_limit`, `usage_count`
- `period_start`, `period_end`

무료 사용자는 최초 호출 시 자동 생성됩니다.

## 4. RPC 동작 규칙 (`check_and_use_license`)

### 4.1 Free 경로 (`LICENSE_KEY`가 비었거나 `free`)

1. `license_policies.free_default` 조회
2. `hwid_hash` 기준 무료 row 조회/생성
3. 월 리셋 시점 도달 시 `usage_count=0`으로 초기화
4. 잔여가 있으면 `usage_count + 1` 후 승인
5. 없으면 거부 (`remaining=0`)

### 4.2 유료 metered 경로

1. `licenses.license_key` 조회
2. `status='active'` 확인
3. `expires_at` 만료 여부 확인
4. HWID 최초 바인딩/불일치 차단
5. `usage_limit/usage_count/reset_date` 기준 차감

### 4.3 유료 unlimited 경로

조건: `license_mode='unlimited'`

- 차감 없이 승인
- 반환값: `remaining = -1` (앱 로그에서는 `무제한`으로 표시)
- `expires_at`가 있으면 만료 시 거부

## 5. 앱 설정

`config/config.txt` 또는 `config/config.txt.sample`:

```txt
LICENSE_KEY = free
```

- 빈 값도 내부에서 `free`로 처리됨
- 유료 전환 시 발급 키로 변경

## 6. 운영 SQL 예시

### 6.1 평생 무한 라이선스

```sql
update public.licenses
set license_mode = 'unlimited',
    expires_at = null,
    status = 'active'
where license_key = 'YOUR_KEY';
```

### 6.2 30일 구독형 무한 라이선스

```sql
update public.licenses
set license_mode = 'unlimited',
    expires_at = now() + interval '30 days',
    status = 'active'
where license_key = 'YOUR_KEY';
```

### 6.3 차감형으로 복귀

```sql
update public.licenses
set license_mode = 'metered',
    expires_at = null
where license_key = 'YOUR_KEY';
```

### 6.4 무료 정책 변경 (예: 월 30회)

```sql
update public.license_policies
set quota = 30,
    reset_cycle = 'monthly',
    updated_at = timezone('utc', now())
where policy_key = 'free_default';
```

## 7. 보안 원칙

- RLS 활성화: `license_policies`, `free_license_usages`
- `anon/authenticated`의 테이블 직접 권한 제거
- 앱은 테이블 직접 접근 대신 RPC만 사용
- 무료 사용자 식별은 HWID 원문 대신 해시값 사용
- 운영 식별은 `licenses.email` 기준으로 관리 (권장)

## 8. 변경 이력 (현재 기준)

- 무료 기본키 도입: `free`
- 무료 정책: 월 15회
- 무한 라이선스(`unlimited`) 도입
- 유료/무료 정책 분리 운영
