# 개발·운영 환경 분리 Main Plan

> 작성일: 2026-08-27
> 상태: 설계 및 착수 준비
> Parent branch: `feature/development-environment-main`
> 기준 branch: `dev`

## 1. 목표

BlogGenius의 일상 개발과 자동 테스트가 운영 Supabase 및 실제 사용자·결제·알림·발행 데이터에 영향을 주지 않도록 실행 환경과 배포 경계를 분리한다.

기본 환경은 다음 세 가지다.

| 환경 | 용도 | 외부 영향 원칙 |
| --- | --- | --- |
| `local` | 기능 개발, 단위·통합 테스트, DB reset | 가짜 데이터만 사용하고 실제 발행·결제·알림을 차단한다. |
| `development` | Edge Function, webhook, 원격 연결 등 hosted 통합 테스트 | 별도 Supabase project와 테스트 provider만 사용한다. |
| `production` | 정식 사용자 서비스 | 승인된 release만 배포하며 모든 변경을 명시적으로 확인한다. |

별도 `staging`은 현재 만들지 않는다. 팀 규모나 무중단 승격 검증이 실제로 필요해질 때 같은 계약으로 추가한다.

## 2. 핵심 원칙

### 2.1 branch와 runtime environment는 관련되지만 동일하지 않다

- `feature/*`는 기본적으로 `local`에서 검증한다.
- `dev`에 통합된 변경만 `development` 원격 환경의 후보가 된다.
- 승인된 `release/*` 또는 `main`만 `production` 배포 후보가 된다.
- branch 이름만으로 환경을 묵시적으로 선택하지 않는다. 실행·배포 명령은 항상 target을 명시한다.

### 2.2 production fallback을 금지한다

- 환경값이 없거나 잘못되면 production을 기본으로 사용하지 않고 실행을 중단한다.
- 개발 build와 테스트는 production Supabase endpoint를 가리키면 실패한다.
- reset, seed, fixture, 테스트용 RPC는 production target에서 항상 거부한다.

### 2.3 공개 설정과 server secret을 분리한다

- 앱에는 선택된 환경의 Supabase URL과 publishable key만 전달한다.
- service-role key, provider secret, webhook secret, PortOne secret은 환경별 server secret store에서만 관리한다.
- 실제 secret, 사용자 이메일, HWID, 결제 데이터는 Git과 seed에 넣지 않는다.

### 2.4 DB 변경은 재현 가능해야 한다

- 현재 운영 schema를 baseline으로 고정한다.
- 이후 변경은 `supabase/migrations/`의 순서 있는 migration만 사용한다.
- `supabase/seed.sql`은 local/development 전용 가짜 데이터만 포함한다.
- 기존 `sql/*.sql`은 schema, data seed, 운영 작업, 테스트·복원 도구로 분류하며 무조건 합쳐서 migration으로 만들지 않는다.

## 3. 현재 구조에서 확인된 문제

- `LICENSE_CHK_URL`과 `LICENSE_CHK_KEY` 한 쌍이 라이선스, runtime config, AI model catalog, 키워드 탐색, surface content, knowledge gateway에 공통 사용된다.
- 명시적인 `local / development / production` runtime profile이 없다.
- `src/config/secret.js`가 build와 runtime의 Supabase 연결값 공급원 역할을 하며 환경 선택 책임까지 함께 가진다.
- `sql/` 아래에 schema 생성, 누적 hotfix, seed, production restore, 테스트 SQL이 섞여 있다.
- `supabase/migrations/`와 재현 가능한 `supabase/seed.sql`이 없다.
- Supabase CLI의 linked project가 하나뿐이라 잘못된 명령이 운영 project로 향할 여지가 있다.
- Edge Function, DB, Cron, secrets를 하나의 target manifest와 preflight로 검증하는 배포 경로가 없다.
- 현재 GitHub release build는 하나의 Supabase 연결값을 주입하므로 정식 production build와 개발 build의 계약이 분리되어 있지 않다.

## 4. 목표 구조

```text
명시적 target
  -> Environment Resolver
      -> public desktop config (URL, publishable key, environment id)
      -> server deployment config (project ref, function/cron manifest)
      -> secret store references
  -> Safety Policy
      -> production fallback 금지
      -> destructive command 차단
      -> live publish/payment/notification 차단
  -> Supabase Lifecycle
      -> ordered migrations
      -> non-production seed
      -> function/secret/cron deployment
      -> schema drift check
```

환경 계약의 canonical 이름은 `BLOGGENIUS_ENV=local|development|production`으로 시작한다. 기존 `LICENSE_CHK_URL/KEY`는 호환 입력으로 잠시 유지할 수 있지만, 새 resolver 밖에서 직접 읽는 코드는 제거한다.

## 5. 단계별 feature-sub 계획

각 단계는 별도 feature-sub branch에서 구현·검증한 뒤 parent인 `feature/development-environment-main`에 merge한다. 다음 단계는 이전 단계가 parent에 반영된 뒤 시작한다.

### Stage 1 — 환경 계약과 현황 inventory

Branch: `feature/development-environment-01-contract`

작업:

- 환경 enum, 설정 source 우선순위, 허용되는 branch/target 관계를 문서와 코드 계약으로 정의한다.
- Supabase를 사용하는 desktop client, Edge Function, SQL, Cron, Storage/Auth 항목을 inventory로 만든다.
- 기존 `sql/*.sql`을 `migration 후보 / seed / 운영 작업 / 테스트·복원 / 폐기 검토`로 분류한다.
- 현재 linked project를 production으로 명명하되 secret 값은 문서화하지 않는다.
- production baseline을 얻고 검증하는 절차를 정한다. 이 단계에서는 운영 schema를 변경하지 않는다.

검증:

- inventory 누락을 찾는 구조 테스트
- 환경 이름 및 설정 source 계약 단위 테스트
- production 변경 없음 확인

승인 지점:

- hosted development Supabase project 생성 방식과 이름
- production baseline 생성·대조 방식

### Stage 2 — Runtime profile과 fail-closed 보호

Branch: `feature/development-environment-02-runtime-profile`

작업:

- environment resolver를 도입하고 Supabase client들이 resolver 결과만 사용하게 한다.
- 시작 로그와 진단 API에 secret을 제외한 environment name과 endpoint host를 표시한다.
- 개발 실행 명령이 environment 미지정 또는 production endpoint 사용 시 실패하도록 한다.
- production release build만 production public config를 주입할 수 있게 build 계약을 분리한다.
- `src/config/secret.js`의 역할을 환경별 생성 산출물로 축소하고 저장소 내 secret 관리 방식을 정리한다.

검증:

- 각 profile의 설정 선택과 우선순위 단위 테스트
- 누락·오타·교차 endpoint에 대한 실패 테스트
- 로그와 API에 key가 노출되지 않는지 구조 테스트

### Stage 3 — Target-aware CLI와 배포 안전장치

Branch: `feature/development-environment-03-deploy-guard`

작업:

- DB·Function·Cron 작업에 `--target local|development|production`을 필수화한다.
- 실행 전 environment, project name, project ref, 작업 종류를 preflight로 출력한다.
- production은 승인 flag와 허용 branch를 함께 검사한다.
- reset, seed, fixture, 테스트 도구는 production에서 무조건 fail-closed한다.
- Supabase CLI link 상태를 target manifest와 대조해 잘못된 project 배포를 차단한다.

검증:

- 잘못된 target/ref/branch 조합의 거부 테스트
- production destructive operation이 실행 전에 차단되는 테스트
- dry-run 출력 snapshot/contract 테스트

### Stage 4A — Production schema read-only audit

Branch: `feature/development-environment-04a-production-schema-audit`

작업:

- 별도 사용자 승인을 받은 뒤 production을 schema-only, read-only로 조사한다.
- table, column, constraint, index, RPC, RLS, policy, grant와 extension을 수집한다.
- Edge Function, Cron, Storage bucket/policy와 Auth 설정은 DB schema와 별도 inventory로 대조한다.
- production 실제 schema, 기존 SQL 의도, 현재 애플리케이션 코드·테스트 계약을 객체별로 3자 대조한다.
- 차이를 `production-only drift / repo-only unapplied / superseded / operator data / platform-managed / intentional environment difference`로 분류한다.
- baseline에 포함할 객체와 제외할 객체를 review 가능한 audit report로 확정한다.

주의:

- production schema는 현재 배포 형상의 증거이지 원하는 설계의 유일한 정답이 아니다.
- 실제 사용자 row, Auth 사용자, 이메일, HWID, 결제 데이터, Storage object, Vault 값과 secret은 수집하지 않는다.
- 이 단계는 production migration history를 수정하거나 SQL·Function을 배포하지 않는다.
- production read-only 접근도 feature 개발 승인과 별개로 사용자가 명시적으로 승인해야 한다.

검증:

- audit 대상과 제외 대상 검토
- inventory에 없는 production 객체 및 production에 없는 repo 객체 보고
- 모든 차이에 분류와 처리 결정이 있는지 확인
- production 변경이 없었음을 명령·감사 기록으로 확인

### Stage 4B — Migration baseline과 local Supabase 재현

Branch: `feature/development-environment-04b-local-supabase`

작업:

- Stage 4A에서 승인한 객체만으로 초기 baseline migration을 작성한다.
- 기존 누적 SQL 중 baseline 이후 필요한 변경만 순서 있는 migration으로 전환한다.
- 가짜 account, license, plan, usage, recommendation 자료를 `supabase/seed.sql`에 작성한다.
- 로컬 Supabase config와 `db reset` 기반 개발·테스트 명령을 만든다.
- Storage bucket, RLS, RPC, extension, Cron 의존성을 migration 검증 범위에 포함한다.

주의:

- 기존 SQL을 순서대로 합치거나 무조건 재실행하지 않는다.
- hotfix·restore·pause·test SQL은 schema migration과 분리한다.
- 기존 production migration history를 임의로 조작하지 않는다.

검증:

- 빈 local DB에서 `db reset` 성공
- seed 후 핵심 RPC/RLS contract 테스트
- reset을 반복해도 같은 schema가 생성되는지 확인
- Stage 4A audit report와 비교해 설명할 수 없는 managed-schema 차이가 없는지 확인

### Stage 5 — Hosted development 환경 구성

Branch: `feature/development-environment-05-hosted-development`

작업:

- 별도 development Supabase project에 동일 migration을 적용한다.
- Edge Function과 환경별 secrets를 development target으로 배포한다.
- Auth, Storage, Cron, rate limit, provider budget을 development 정책으로 구성한다.
- 이메일·Telegram은 sink 또는 allowlist로 제한하고 실제 블로그 발행 capability를 차단한다.
- PortOne 연동 전까지도 payment capability가 production으로 향하지 않도록 test-only 계약을 둔다.

검증:

- desktop development profile에서 라이선스·키워드·모델 카탈로그·knowledge gateway smoke test
- 실제 사용자·발행·알림·결제로 외부 영향이 없음을 확인
- Edge Function과 DB migration version의 일치 확인

### Stage 6 — CI, drift 검증, production 승격 절차

Branch: `feature/development-environment-06-release-gate`

작업:

- CI에서 local DB reset과 핵심 통합 테스트를 실행한다.
- development 배포 후 schema/function drift를 검사한다.
- production에는 자동 배포하지 않고 dry-run 결과와 승인 checklist를 생성한다.
- 동일 migration artifact를 development 검증 후 production에 승격한다.
- 장애 시 migration rollback보다 forward fix를 기본으로 하고, 데이터 복구 절차는 별도 runbook으로 둔다.

검증:

- feature -> local, dev -> hosted development, release/main -> production 후보 흐름 확인
- 동일 commit/migration set의 환경별 승격 증명
- production 배포 승인과 감사 로그 확인

## 6. 외부 준비가 필요한 항목

다음 항목은 코드만으로 임의 생성하거나 결정하지 않는다.

- 별도 hosted development Supabase organization/project 생성 및 project ref
- development와 production의 GitHub Environment/secrets 등록
- 별도 승인된 production schema read-only audit 권한과 검증 가능한 자료
- development용 provider 계정·예산, 이메일/Telegram sink, 이후 PortOne test channel

필요 시 각 Stage 착수 시점에 정확한 값이 아니라 준비 여부와 적용 권한만 사용자에게 확인한다.

## 7. 완료 기준

아래 흐름이 반복 가능해야 환경 분리가 완료된 것으로 본다.

```text
local db reset
  -> 자동 테스트
  -> development migration/function 배포
  -> hosted 통합 테스트
  -> production dry-run
  -> 사용자 승인
  -> 동일 artifact production 배포
```

추가 완료 조건:

- 개발 실행과 테스트가 production endpoint에 닿지 않는다.
- target이 모호하면 모든 변경 명령이 중단된다.
- 새 개발자가 운영 데이터 없이 local 환경을 재생성할 수 있다.
- DB, Function, Cron, Storage/Auth 정책의 적용 상태를 환경별로 확인할 수 있다.
- secret이 Git, desktop 로그, seed, 테스트 결과에 노출되지 않는다.

## 8. 이번 parent 작업의 범위

이 parent에서는 Stage 1~6을 순차 통합하되 production에 실제 schema/function 변경을 배포하는 행위는 자동으로 포함하지 않는다. production 적용은 전체 검증 후 별도 승인된 release 작업으로 수행한다.
