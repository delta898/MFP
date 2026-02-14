# License Operations Guide (운영 가이드)

이 문서는 무료 사용자 전환을 포함한 BlogGenius 라이선스 운영 절차를 정리한 문서입니다.

## 1. 목적

- 무료(`LICENSE_KEY=free`) 사용자 유료 전환
- 유료 키 발급/갱신/중지
- 무한 라이선스/구독형 라이선스 운영
- 기기 변경(HWID 재바인딩) 대응

## 2. 전제 조건

- Supabase에 아래 SQL이 적용되어 있어야 합니다.
- `sql/supabase_license_v2.sql`
- `sql/supabase_license_precheck.sql`

운영 템플릿 SQL 파일:
- `sql/supabase_license_operations.sql`

## 3. 무료 사용자 -> 유료 전환 표준 절차

1. 운영자가 새 유료 키를 발급합니다.
2. Supabase SQL Editor에서 `sql/supabase_license_operations.sql`의 A(차감형) 또는 B(무한형) 쿼리를 실행합니다.
3. 사용자에게 유료 키를 전달합니다.
4. 사용자는 `config/config.txt`에서 `LICENSE_KEY`를 새 키로 변경합니다.
5. 사용자 첫 실행 시 유료 키가 HWID에 자동 바인딩됩니다.

중요:
- 무료 잔여분은 유료로 합산하지 않습니다.
- `free_license_usages` 레코드는 삭제할 필요가 없습니다.

## 4. 운영 시나리오별 작업

### 4.1 차감형 유료 키 발급

- 파일: `sql/supabase_license_operations.sql`
- 섹션: `A`
- 조정 항목: `license_key`, `usage_limit`, `reset_date`, `tier`

### 4.2 평생 무한 키 발급

- 파일: `sql/supabase_license_operations.sql`
- 섹션: `B`
- 조정 항목: `license_key`, `tier`

### 4.3 기간형(구독형) 무한 키

- 파일: `sql/supabase_license_operations.sql`
- 섹션: `C`
- 조정 항목: `license_key`, `interval`

### 4.4 해지/정지

- 파일: `sql/supabase_license_operations.sql`
- 섹션: `D`

### 4.5 기기 변경 대응(HWID 초기화)

- 파일: `sql/supabase_license_operations.sql`
- 섹션: `E`

### 4.6 차감형 사용량 수동 리셋

- 파일: `sql/supabase_license_operations.sql`
- 섹션: `F`

## 5. 월 리셋 동작 원리

- 무료 사용자는 `free_license_usages`가 월 주기로 자동 리셋됩니다.
- 차감형 유료는 `licenses.reset_date` 도달 시 다음 호출에서 자동 리셋됩니다.
- 무한형(`license_mode='unlimited'`)은 차감되지 않습니다.

## 6. 점검 체크리스트

1. `licenses.status='active'` 인가
2. `license_mode` 값이 의도대로 설정되었는가 (`metered`/`unlimited`)
3. 차감형의 `usage_limit`, `usage_count`, `reset_date`가 정상인가
4. 구독형의 `expires_at`이 의도한 만료 시각인가
5. HWID 재바인딩이 필요하면 `hwid=null`로 초기화했는가

## 7. 장애 대응 힌트

- 증상: "유효하지 않은 라이선스 키"
  - `licenses.license_key` 오타 여부 확인
- 증상: "다른 기기에 바인딩된 라이선스"
  - 운영자가 `hwid=null`로 초기화 후 재실행 안내
- 증상: "사용 횟수 모두 사용"
  - 차감형이면 `usage_count`/`usage_limit` 점검, 필요 시 F 섹션 실행
- 증상: "만료된 라이선스"
  - `expires_at` 연장 또는 라이선스 재발급
