# 개발·운영 환경 분리 Stage 4B — Local Supabase 재현

> 작성일: 2026-08-27
> 상태: 구현·검증 완료, handoff 대기
> Parent branch: `feature/development-environment-main`
> Branch: `feature/development-environment-04b-local-supabase`

## 목표

Stage 4A에서 확인한 운영 구조와 현재 애플리케이션 계약을 기준으로, 빈 로컬 Supabase를 반복해서 같은 상태로 만들 수 있는 단일 SQL 원천을 구축한다.

## 결과 구조

```text
supabase/
├── migrations/   # 현재 스키마의 유일한 순서 있는 원천
├── seed.sql       # local/development 전용 가짜 데이터
├── operations/   # 관리자가 의도적으로 실행하는 작업
├── activation/   # Function/secret 준비 후 활성화할 Cron 등
└── archive/      # 폐기·복구·과거 테스트 SQL
```

기존 `sql/`은 Stage 4B 완료 시 제거한다. 동일한 정의를 두 위치에 남기지 않는다.

## 분류 원칙

- `migrations`: 테이블, 함수, 인덱스, RLS, 명시적 grant, Storage bucket의 현재 정의
- `seed.sql`: 실제 사용자와 무관한 로컬 테스트용 plan/license/runtime/content 최소 자료
- `operations`: 라이선스 발급처럼 입력값과 운영자 의도가 필요한 작업
- `activation`: 외부 Function URL과 secret이 준비된 뒤 실행할 Cron 등록
- `archive`: superseded schema, 과거 hotfix 원본, production 복구 및 일회성 테스트 도구

운영의 `_del_*` 잔존 테이블, 실제 사용자 row, Auth 사용자, Storage object, Vault/secret은 포함하지 않는다.

## 구현 순서

1. 현재 SQL을 객체와 최종 정의 기준으로 분류한다.
2. `public.licenses`의 누락된 기반 구조를 명시하고, 현재 유효한 변경만 순서 있는 migration으로 옮긴다.
3. 내부 helper RPC의 권한과 함수 `search_path`를 명시적으로 강화한다.
4. 로컬 전용 가짜 seed를 작성한다.
5. `supabase db reset`을 두 번 실행하여 반복 재현성을 확인한다.
6. 테이블·함수·RLS·grant·Storage 및 핵심 RPC contract를 자동 검증한다.

## 안전 경계

- 모든 DB 변경은 로컬 Docker Supabase에만 적용한다.
- production migration history와 운영 객체는 변경하지 않는다.
- Cron은 migration 중 자동 활성화하지 않는다.
- seed에는 실제 이메일, HWID, license key, 결제·사용량·콘텐츠 자료를 넣지 않는다.

## 완료 기준

- 빈 로컬 DB에서 migration과 seed가 오류 없이 적용된다.
- reset을 반복해도 동일한 custom schema가 만들어진다.
- Stage 4A 포함 대상 23개 `public` 테이블과 `trends.items`, 46개 함수가 설명 가능한 상태로 재현된다.
- 모든 custom table에 RLS가 켜지고 직접 table 접근은 차단된다.
- 공개 RPC와 service-role 전용 RPC가 코드 호출 계약과 일치한다.
- `sql/`에 별도의 현행 SQL 원천이 남지 않는다.
