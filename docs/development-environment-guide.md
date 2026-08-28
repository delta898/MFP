# BlogGenius 개발 환경 가이드

이 문서는 BlogGenius를 개발할 때 `local`, `development`, `production` 환경을 어떻게 구분하고
선택하는지, 브랜치별 개발·검증·승격 흐름이 어떻게 이어지는지를 설명한다.

## 1. 가장 먼저 알아둘 이름

브랜치 이름과 실행 환경 이름은 서로 다르다.

| 구분 | 이름 |
| --- | --- |
| 통합 개발 브랜치 | `dev` |
| 원격 개발 실행 환경 | `development` |
| 환경 선택 변수 | `BLOGGENIUS_ENV` |

따라서 원격 개발 환경을 선택할 때는 반드시 다음 값을 사용한다.

```dotenv
BLOGGENIUS_ENV=development
```

`BLOGGENIUS_ENV=dev`는 지원하지 않으며 환경 미설정으로 처리한다.

## 2. 환경과 브랜치의 관계

언제든 다음 명령으로 Local 실행 여부와 Development 설정 상태를 확인할 수 있다.

```bash
npm run env:status
```

이 명령은 저장된 환경을 전환하지 않는다. BlogGenius의 환경은 `app:local` 또는
`app:development`로 앱을 실행할 때 선택된다.

| 개발 단계 | 일반적인 브랜치 | 실행 환경 | Supabase 대상 |
| --- | --- | --- | --- |
| 기능 개발 | `feature/*` | `local` | 개발자 PC의 Supabase Docker |
| 통합 검증 | `dev` | `development` | BlogGenius Development Supabase |
| 릴리즈 검증 | `release/*` | Development에서 검증한 동일 변경 묶음 사용 | Production 후보 검사만 수행 |
| 정식 운영 | `main` 또는 정식 패키지 | `production` | 운영 Supabase |

환경 선택은 브랜치를 자동으로 바꾸지 않고, 브랜치도 환경을 자동 선택하지 않는다. 대신 배포
preflight가 허용되지 않은 브랜치와 target 조합을 차단한다.

- `feature/*`: `local`만 변경 작업 허용
- `dev`: `local`, `development` 허용
- `release/*`, `main`: production 후보가 될 수 있음
- 분류되지 않은 브랜치와 detached HEAD: 기본적으로 `local`만 허용

## 3. Local 환경

Local은 일상적인 기능 개발, migration 작성, DB reset과 자동 테스트를 위한 기본 환경이다.

### 개발 PC의 Google OAuth 앱 설정

Local과 Development 앱은 공통으로 저장소 루트의 Git 제외 파일 `.env.oauth`에서 Google Desktop
OAuth 앱 설정을 읽는다. `config/google-oauth.env.sample`을 참고해 개발 컴퓨터마다 한 번 준비한다.

```dotenv
GOOGLE_OAUTH_CLIENT_ID="..."
GOOGLE_OAUTH_CLIENT_SECRET="..."
```

이 파일은 실행 환경이나 Supabase endpoint를 선택하지 않으며 위 두 key만 로더에 반영된다. 실제
값은 Git, `config.json`, Runtime Config DB와 문서에 넣지 않는다. 설치형 앱의 Client Secret은
배포본에서 추출 가능하다는 전제를 가지며, 공용 provider quota를 보호하는 server secret과 구분한다.

사용자 access/refresh token은 계속 `config/google_oauth_tokens.json`에 저장된다. `.env.oauth`을
다른 개발 PC에 준비해도 사용자 Google 연결 상태가 복사되는 것은 아니므로 각 PC에서 한 번씩
Google 계정을 연결해야 한다.

### 특성

- 개발자 PC의 Docker Supabase 사용
- 가짜 seed 데이터만 사용
- DB reset 가능
- 실제 사용자·운영 데이터와 분리
- Naver·WordPress·SNS 실제 발행 차단
- 실제 결제·알림 차단

### Local Supabase 시작과 검증

```bash
npm run env:local:start
npm run env:local:reset
npm run env:local:verify
```

- `env:local:start`: DB, REST, Auth, Edge Runtime 중심의 로컬 Supabase를 시작한다.
- `env:local:reset`: preflight 후 DB를 비우고 canonical migration과 local seed를 다시 적용한다.
- `env:local:verify`: schema, RLS, RPC와 seed 계약을 확인한다.

Supabase migration이나 seed를 변경한 뒤 Local 앱을 테스트할 때는 다음 편의 스크립트를 사용할 수 있다.

```bash
./run_local_reset.sh
```

검증을 마친 뒤 필요하지 않으면 컨테이너를 종료한다.

```bash
supabase stop --no-backup
```

### BlogGenius 앱을 Local로 실행하기

다음 명령 하나로 Local Supabase를 시작하고, URL과 publishable key를 자동으로 읽어 앱에 전달한다.
개발 런처는 Electron의 macOS 사용자 데이터 폴더가 아니라 저장소 루트의
`config/config.json`을 사용한다.

```bash
npm run app:local
# 또는
./run_local.sh
```

시작 로그에서 다음과 같은 상태를 확인한다.

```text
[Runtime Environment] local / 127.0.0.1:54321
```

## 3.1 환경별 라이선스 파일

개발 앱은 Production 라이선스를 Local 또는 Development 환경의 대체값으로 사용하지 않는다.
각 컴퓨터는 환경별 파일을 독립적으로 소유하며, 파일이 없으면 기존 HWID 기반 자동 발급 절차로
해당 환경의 테스트 라이선스를 만들어 저장한다.

| 실행 환경 | 라이선스 파일 |
| --- | --- |
| Local | `config/license.local.key` |
| Development | `config/license.development.key` |
| Production | `config/license.key` |

같은 파일명이라도 컴퓨터마다 로컬 파일이 다르므로 여러 개발 장비는 서로 다른 HWID 라이선스를
사용한다. 세 파일은 모두 Git 관리 대상이 아니다. 환경을 선택하지 못했거나 해당 환경 파일이
없을 때 다른 환경의 파일로 fallback하지 않는다.

Local DB reset은 DB에 저장된 HWID 라이선스도 제거하므로 `npm run env:local:reset`과
`./run_local_reset.sh`가 `license.local.key`만 함께 지운다. Development와 Production
라이선스 파일은 보존되며, 다음 Local 실행에서 이 컴퓨터의 키가 자동으로 다시 발급된다.

## 4. Development 환경

Development는 `dev` 브랜치에 통합된 변경을 운영과 분리된 원격 Supabase에서 검증하는 환경이다.
앱 설정은 Local 실행과 마찬가지로 저장소 루트의 `config/config.json`을 사용하고,
Supabase 공개 연결 정보만 `.env.development`에서 읽는다.

### 특성

- Production과 다른 Supabase project 사용
- 실제 서버와 유사한 DB·Edge Function 통합 검증
- DB reset 금지
- 실제 발행·결제 차단
- 알림은 sink 또는 명시적 allowlist만 허용
- 유료 provider 호출과 Cron 활성화는 별도 승인 범위

### 로컬 `.env.development` 설정

저장소 루트의 `.env.development`는 Git에 포함되지 않는다. 다음과 같이 development 공개 연결과
개발자용 DB 연결 정보를 한 번만 기록한다. 환경 선택은 실행 명령이 담당하므로
`BLOGGENIUS_ENV`를 파일에 기록할 필요가 없다.

```dotenv
BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME="BlogGenius Development"
BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF="..."
BLOGGENIUS_DEVELOPMENT_SUPABASE_URL="https://....supabase.co"
BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY="..."
BLOGGENIUS_DEVELOPMENT_SUPABASE_DB_URL="..."
```

공백이나 특수문자가 포함된 값은 반드시 따옴표로 감싼다. `.env.development`는 readiness와
smoke script 및 Development 앱 실행기가 자체 parser로 읽는다.

### Development 연결 검사

```bash
npm run env:development:ready
npm run env:development:smoke
```

- `ready`: 필수 공개 설정과 development 안전 정책을 검사한다.
- `smoke`: DB를 변경하지 않고 REST와 Edge Function 공개 접근 계약을 검사한다.

### BlogGenius 앱을 Development로 실행하기

다음 명령은 `.env.development`를 읽고 환경을 `development`로 지정한 뒤 앱을 실행한다.

```bash
npm run app:development
# 또는
./run_dev.sh
```

시작 로그에서 development host를 확인한다.

```text
[Runtime Environment] development / <development-project>.supabase.co
```

Development에서도 실제 발행은 공통 runtime guard가 다음 코드로 차단한다.

```text
LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT
```

## 5. Production 환경

Production은 실제 사용자·라이선스·사용량·발행·알림·결제가 연결되는 운영 환경이다. 일상 개발자가
임의로 선택하는 환경이 아니다.

### 안전 정책

- `database-reset`, development seed, test fixture는 항상 금지
- `release/*` 또는 `main`만 production 후보
- 동일 artifact의 development 검증 필요
- production project ref 재확인 필요
- 사용자 최종 승인 필요
- 실제 적용 전 backup/PITR와 복구 계획 확인

정식 패키지는 release build 과정에서 무시된 `src/config/secret.js`를 생성한다. 이 파일에는
production 공개 Supabase 연결값과 Google Desktop OAuth 앱 설정이 포함된다.

```js
{
  BLOGGENIUS_ENV: 'production',
  SUPABASE_URL: '...',
  SUPABASE_PUBLISHABLE_KEY: '...',
  GOOGLE_OAUTH_CLIENT_ID: '...',
  GOOGLE_OAUTH_CLIENT_SECRET: '...'
}
```

Service-role key, DB password, provider Secret과 결제 Secret은 desktop build에 포함하지 않는다.
Google 설치형 앱의 Client Secret은 이 server secret 목록에 포함하지 않는다.

GitHub tag build에는 다음 두 repository secret도 필요하다.

- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_CLIENT_SECRET`

값이 없거나 한 쌍이 완전하지 않으면 release build config 검증이 실패한다. Client 설정을 바꾼
경우 새 앱 버전을 배포하고, Google에서 기존 token을 더 이상 인정하지 않으면 사용자에게 다시
연결하도록 안내한다.

## 6. 브랜치별 개발 workflow

### 6.1 Feature 개발

```text
dev
  └─ feature-main
       └─ feature-sub
```

1. Parent feature branch에서 독립적으로 검토 가능한 sub-feature branch를 만든다.
2. `local` Supabase에서 개발한다.
3. DB 구조를 변경한다면 새 timestamp migration을 추가한다.
4. Local DB reset과 contract 검사를 수행한다.
5. 변경 범위에 맞는 집중 테스트를 수행한다.
6. 필요한 전체 회귀 테스트를 수행한다.
7. 사용자 확인과 승인을 받는다.
8. Sub-feature를 commit하고 parent에 merge한다.
9. 요청에 따라 merge된 sub-feature branch를 삭제한다.

Feature 단계에서는 hosted development나 production을 변경하지 않는다.

### 6.2 Parent feature 완료

1. Parent에 모든 단계가 반영됐는지 확인한다.
2. 전체 회귀 테스트와 관련 문서를 현행화한다.
3. 사용자 승인을 받는다.
4. 명시적 요청이 있을 때 parent를 `dev`에 merge한다.
5. 요청에 따라 완료된 feature branch를 삭제한다.

### 6.3 `dev` 통합 검증

`dev` push 후 Environment Validation CI는 다음을 수행한다.

```text
Local Supabase 시작
  -> DB reset
  -> canonical migration + seed 적용
  -> schema contract 검사
  -> 전체 unit test
  -> immutable Supabase release artifact 생성
```

Release artifact는 다음을 하나의 fingerprint로 묶는다.

- canonical migration 파일과 적용 순서
- Edge Function과 shared module
- Function별 `verify_jwt` 정책
- environment manifest
- 정확한 Git commit SHA

Supabase 변경이 포함된 경우, 환경 운영자가 공식 Supabase CLI로 Development에 먼저 적용한다.
현재 CI는 Development를 자동 배포하지 않는다.

적용 후 `dev` 브랜치에서 `development-drift` workflow를 실행한다.

```text
Development migration 이력 읽기
  -> Function ACTIVE/JWT 정책 읽기
  -> 현재 artifact와 exact match 검사
  -> 공개 HTTP smoke
  -> sanitized development evidence 저장
```

첫 `dev` push 시 원격 Development가 아직 갱신되지 않았다면 drift job 실패가 정상이다. Development
적용을 마친 후 같은 commit에서 workflow를 다시 실행한다.

문서(`docs/**`, Markdown)와 루트의 편의 실행 스크립트(`run_*.sh`)만 변경한 push 또는 PR은
환경 검증을 실행하지 않는다. 애플리케이션, Supabase, 환경 스크립트나 패키지 변경이 함께 있으면
전체 검증을 실행한다.

### 6.4 Release 후보 검증

여기서 artifact는 별도의 사용자 파일이나 완성된 설치 패키지를 뜻하지 않는다. 정확한 Git commit,
DB migration, Edge Function 코드와 JWT 정책을 묶어 fingerprint를 만든 검증 단위다. Development에
실제로 반영해 통과한 것과 Production 후보가 완전히 같은지를 확인하는 용도로 사용한다.

검증된 `dev` commit에서 `release/vX.Y.Z`를 만든다. Release branch에서 수동
`production-checklist` workflow를 실행하고, 성공한 Development workflow의 run ID를 입력한다.

Checklist는 다음 동일성을 확인한다.

```text
현재 release commit
  = Development에서 검증한 commit
  = migration / Function artifact
```

하나라도 다르면 차단한다. 통과 결과도 배포 완료가 아니라 다음 상태다.

```text
ready_for_user_approval
```

### 6.5 Production 적용

Production 적용은 현재 자동화 범위에 포함되지 않는다. 별도 요청과 승인 후 다음 순서로 진행한다.

1. Production read-only schema audit
2. Backup/PITR와 복구 가능 시점 확인
3. Production preflight
4. Production project ref 재입력
5. 영향 범위와 중단 조건 확인
6. 사용자 최종 승인
7. Development에서 검증한 동일 artifact 적용
8. Read-only smoke 및 결과 기록

장애 대응은 기존 migration을 되돌리는 방식보다 새 migration을 통한 forward fix를 기본으로 한다.
세부 절차는 [Supabase Forward Fix와 데이터 복구 Runbook](supabase-recovery-runbook.md)을 따른다.

## 7. GitHub Development Environment 준비

GitHub 저장소에 `development` Environment를 만들고 아래 항목을 등록한다.

Variables:

- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_NAME`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PROJECT_REF`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_URL`

Secrets:

- `SUPABASE_ACCESS_TOKEN`
- `SUPABASE_DB_PASSWORD`
- `BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY`

Production credential은 Stage 6 workflow에 등록하지 않는다. 실제 Production 적용 절차가 별도 승인된
후 최소 권한과 GitHub `production` Environment approval을 포함해 구성한다.

## 8. 빠른 선택 기준

```text
기능을 개발한다
  -> feature branch + local

합쳐진 기능을 원격 서버 환경에서 검증한다
  -> dev branch + development

릴리즈를 준비한다
  -> release branch + 검증된 development artifact

실제 운영에 적용한다
  -> 사용자 별도 승인 + production
```

환경이 불명확하거나 필수 연결값이 빠진 경우 BlogGenius는 Production으로 fallback하지 않는다.
Supabase 기반 기능과 실제 발행을 비활성화하는 fail-closed 상태로 시작한다.
