# Local Supabase Development

BlogGenius의 database schema는 `supabase/migrations/`가 유일한 현행 원천이다. 과거처럼
개별 SQL 파일을 골라 SQL Editor에 실행하지 않는다.

## 구조

```text
supabase/
├── migrations/   # 빈 DB부터 적용되는 순서 있는 canonical schema
├── seed.sql       # local/development 전용 가짜 자료
├── operations/   # 라이선스 발급·콘텐츠 등록 등 명시적 운영 작업
├── activation/   # Function과 secret 준비 후 별도 활성화할 Cron
├── archive/      # superseded/recovery/test 역사 자료
└── tests/        # 로컬 schema/RLS/RPC contract
```

`archive/`는 참고 이력이며 실행 대상이 아니다. `operations/`와 `activation/`도 migration에
자동 포함되지 않는다.

## 일상 개발 흐름

```bash
npm run env:local:start
npm run env:local:reset
npm run env:local:verify
```

- `env:local:start`: DB, REST, Auth, Edge Runtime 중심의 로컬 스택을 시작한다. Stage 4B의
  schema 개발에 필요하지 않은 Realtime, Storage API, image proxy, Studio는 기본 기동에서 제외한다.
- `env:local:reset`: local target preflight를 통과한 뒤 DB를 비우고 migration과 seed를 다시 적용한다.
- `env:local:verify`: custom table/function 수, RLS, 폐기 테이블 부재, 가짜 seed와 RPC 권한을 확인한다.

로컬 URL과 key는 `supabase start/status`가 생성하는 개발용 값이다. Git에 저장하지 않는다.
실행 profile에는 `BLOGGENIUS_ENV=local`과 local 전용 public connection source를 사용한다.

## Canonical baseline

- `public`: 23 application tables
- `trends`: 1 application table
- migration baseline: 44 functions
- activation 단계: Cron invoke functions 2개
- 모든 custom table: RLS enabled
- anon/authenticated: table direct access 없음, 명시된 desktop RPC만 실행 가능
- service role: server/Edge Function용 table·RPC access

운영 감사에서 확인한 `_del_*` 잔존 테이블과 과거 `license_access_keys`, `license_policies`,
`free_license_usages`는 baseline에 포함하지 않는다.

## 변경 규칙

1. 이미 공유된 migration을 수정하지 않고 새 timestamp migration을 추가한다.
2. 실제 사용자, 이메일, HWID, 결제, 사용량, Storage object를 seed에 넣지 않는다.
3. Cron, Function, secret 배포는 local DB migration과 분리한다.
4. production migration과 operator action은 target-aware preflight와 별도 승인을 거친다.

Storage bucket 정의 자체는 migration과 DB contract로 검증한다. Storage API·Realtime·Studio까지
필요한 통합 검증은 해당 서비스를 명시적으로 기동하거나 Stage 5 hosted development에서 수행한다.
