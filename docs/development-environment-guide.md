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

이 명령은 저장된 환경을 전환하지 않는다. BlogGenius의 환경은 `app:local`,
`app:development` 또는 보호된 `app:production` 명령으로 앱을 실행할 때 선택된다.

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

다음 명령 하나로 Local secret을 준비하고, Local Supabase와 Local Trends API를 시작한 뒤 URL과
publishable key를 자동으로 읽어 앱에 전달한다.
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

첫 실행에서는 Git에서 제외된 다음 파일을 sample로부터 자동으로 만들고 권한을 `600`으로 제한한다.

- `supabase/functions/.env`: Local Edge Function이 단기 Trends read token을 서명하는 secret
- `apps/trends/trends-collector/config/.env.trends-collector.local`: Collector가 Local Trends API에
  적재할 때 사용하는 내부 token

기존 Collector 파일에 `TRENDS_READ_TOKEN_SECRET`이 있으면 Functions 파일로 한 번 이전한 뒤
Collector 파일에서는 제거한다. 이전 구조에서 남은 `SUPABASE_URL`, `SUPABASE_SECRET_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, `TRENDS_SUPABASE_TARGET_ENV`도 함께 제거한다. Collector는 Supabase에
직접 쓰지 않고 `TRENDS_API_TOKEN`으로 Local Trends API에 수집 결과를 전달한다.
고정 Local endpoint는 `TRENDS_API_BASE_URL` 하나로 표현하므로 과거의 중복
`TRENDS_API_HOST`·`TRENDS_API_PORT` 항목도 정리한다.
두 secret 값은 앱 환경이나 로그로 전달하지 않는다.
이때 Local Supabase가 이미 실행 중이면 새 Functions secret을 반영하기 위해 기존 데이터를 보존하는
`supabase stop` 후 한 번만 다시 시작한다. 이후 실행에서는 불필요한 재시작을 하지 않는다.

`run_local.sh`의 준비 순서는 Local secret 준비 → Local Supabase 시작 → loopback
`127.0.0.1:4581`의 Local Trends API 시작 → BlogGenius Desktop 실행이다.

## 3.1 환경별 라이선스 파일

개발 앱은 Production 라이선스를 Local 또는 Development 환경의 대체값으로 사용하지 않는다.
각 컴퓨터는 환경별 파일을 독립적으로 소유하며, 파일이 없으면 기존 HWID 기반 자동 발급 절차로
해당 환경의 테스트 라이선스를 만들어 저장한다.

| 실행 환경 | 사용자 데이터 영역의 라이선스 파일 |
| --- | --- |
| Local | `config/license.local.key` |
| Development | `config/license.development.key` |
| Production | `config/license.key` |

같은 파일명이라도 컴퓨터마다 로컬 파일이 다르므로 여러 개발 장비는 서로 다른 HWID 라이선스를
사용한다. 세 파일은 모두 Git 관리 대상이 아니다. 환경을 선택하지 못했거나 해당 환경 파일이
없을 때 다른 환경의 파일로 fallback하지 않는다.

Electron 실행에서는 `app.getPath('userData')/config`가 사용자 데이터 영역이다. Electron을 통하지
않는 CLI 실행에서는 기존처럼 선택한 runtime root의 `config`를 사용한다. 앱 폴더에 남아 있는
동일 환경의 기존 키는 Electron 첫 실행에서 사용자 데이터 영역으로 복사하고 원본은 보존한다.

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
- 지정한 테스트 채널로 단건 수동 발행 허용
- 예약·일괄·자동 발행과 실제 결제 차단
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

Development에서 자동·예약·일괄 발행은 공통 runtime guard가 다음 코드로 차단한다.

```text
LIVE_PUBLISH_BLOCKED_BY_ENVIRONMENT
```

사용자가 직접 실행한 단건 Blog·Shopping·SNS 발행은 Development에서 허용된다. 개발자는 운영
계정이 아닌 테스트용 Naver Blog, WordPress와 SNS 채널을 설정해야 한다. Local 또는 환경 미선택
상태의 수동 발행은 `MANUAL_PUBLISH_BLOCKED_BY_ENVIRONMENT`로 차단한다.

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

### Production을 소스에서 실행하기

패키징 전에 실제 Production 공개 연결과 runtime 동작을 빠르게 확인해야 할 때는 보호된 source
launcher를 사용한다. 이 명령은 `main` 또는 `release/*` branch에서만 동작하며 feature·dev branch와
detached HEAD에서는 시작 전에 실패한다.

저장소 루트의 `.env.production.sample`을 `.env.production`으로 복사해 공개 Desktop 연결값을 한
번 설정한다. 실제 파일은 Git에 포함되지 않는다.

```dotenv
BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_NAME="BlogGenius Production"
BLOGGENIUS_PRODUCTION_SUPABASE_PROJECT_REF="..."
BLOGGENIUS_PRODUCTION_SUPABASE_URL="https://....supabase.co"
BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY="..."
BLOGGENIUS_PRODUCTION_TRENDS_API_URL="https://trendapi.example.com"
```

Google Desktop OAuth 설정은 기존 `.env.oauth`을 재사용한다. `.env.production`에는 service-role
key, DB password, provider secret, `TRENDS_API_TOKEN`, `TRENDS_READ_TOKEN_SECRET`을 넣지 않는다.
launcher도 이들 server-only secret이 파일에 있으면 실행을 거부한다.

```bash
./run_production.sh
# 또는
npm run app:production
```

launcher는 다음을 순서대로 수행한다.

1. 현재 branch가 `main` 또는 `release/*`인지 검사
2. Production Supabase project ref·URL과 Trends API 연결 검증
3. branch, project identity와 endpoint host만 출력
4. 자동 발행·결제·알림 등 실제 부작용이 활성화됨을 경고
5. 대화형 터미널에서 정확히 `PRODUCTION`을 입력한 경우에만 Electron source runtime 시작

이 명령은 Production DB migration·reset·seed를 수행하지 않으며 앱을 package하지도 않는다.
실행 전 `config/config.json`의 자동 발행 대상과 Naver·WordPress·SNS 계정이 실제 운영 대상임을
반드시 확인한다.

### Source run과 패키징 검증의 구분

- `run_production.sh`: Production backend 연결과 source runtime 동작을 빠르게 확인
- `-dev`·`-rc` tag build: 앱 번들 경로, 포함 자산, generated config, updater와 플랫폼 packaging 확인

따라서 source run이 성공해도 release artifact 검증을 생략하지 않는다.

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
Immutable Supabase release artifact 생성
  -> Development migration / Function 상태 읽기
  -> 현재 artifact와 exact match 검사
  -> 공개 HTTP smoke
  -> sanitized development evidence 저장
```

Local Supabase reset과 schema contract 검사는 기능 개발 중 필요할 때 개발자가 명시적으로 실행한다.
CI 승격 검증은 hosted Development 상태를 기준으로 하며 Local Supabase를 매번 재구축하지 않는다.

Release artifact는 다음을 하나의 fingerprint로 묶는다.

- canonical migration 파일과 적용 순서
- Edge Function과 shared module
- Function별 `verify_jwt` 정책
- environment manifest
- 정확한 Git commit SHA

Supabase 변경이 포함된 경우, 환경 운영자가 공식 Supabase CLI로 Development에 먼저 적용한다.
현재 CI는 Development를 자동 배포하지 않는다.

적용 후 `dev` 브랜치에서 `development-drift` workflow를 실행한다.

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

### 6.6 Trends API Production 전환

Trends API는 Supabase Production 적용과 별개의 runtime 전환이다. 현재 실제 트래픽은 host
`4581`의 legacy systemd가 처리하며, 준비된 Production 컨테이너를 바로 그 port에 덮어쓰지
않는다.

1. `npm run trends:production:transition:preflight`로 설정 계약을 읽기 전용 검사한다.
2. 별도 승인 후 후보 컨테이너를 host `4583`에 병행 기동한다.
3. 후보의 health, 무인증 `401`, internal/user token 경계를 확인한다.
4. 다시 승인받은 뒤 Caddy upstream만 `4581`에서 `4583`으로 바꾼다.
5. systemd는 관찰 기간 동안 rollback 경로로 유지한다.
6. 실패하면 Caddy를 `4581`로 먼저 되돌리고 원인을 조사한다.

실행 명령과 중단 조건은
[Trends API Production 전환 runbook](../apps/trends/trends-api/deployment/production/README.md)을
따른다. Production preflight와 GitHub `production-checklist`는 모두 배포 승인 자료일 뿐, 그
자체로 DB·컨테이너·Caddy를 변경하지 않는다.

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

## 9. 최초 설치 상태 재현

Development 앱의 설정과 최초 bootstrap을 다시 검증할 때는 루트의 `clear_dev.sh`를 사용한다.
대화형 터미널에서는 전체 초기화와 Development 사용자 초기화 여부를 묻고 삭제 예정 목록을 보여준
뒤 실제 삭제 여부를 `[y/N]`으로 확인한다. 각 질문에서 Enter를 누르면
`--no-full --local-only --dry-run`과 같은 결과가 된다. 비대화형 실행에서는
`--full`/`--no-full`, `--reset-development-user`/`--local-only`, `--apply`/`--dry-run`을 모두 명시해야
하며, 선택이 빠지면 기본값을 조용히 적용하지 않고 중단한다.

```bash
./clear_dev.sh
./clear_dev.sh --apply
./clear_dev.sh --full
./clear_dev.sh --full --apply
```

`--full`은 앱이 만든 사용자 설정, memory와 추천 상태, workspace의 앱 관리 하위 경로, 일반 로그,
Electron userData와 환경별 로컬 라이선스를 초기화한다. 사용자가 따로 만든 `config.json.bak*`,
custom workspace의 임의 원고·파일, 소스, sample, `.env.*`, 개발 secret 및 OS 진단 영역의 crash와
diagnostics 자료는 보존한다. 앱을 종료한 상태에서만 실제 삭제할 수 있다.

신규 Development 사용자의 라이선스 발급 과정까지 다시 검증해야 할 때만 다음 옵션을 추가한다.

```bash
./clear_dev.sh --full --reset-development-user
./clear_dev.sh --full --reset-development-user --apply
```

이 옵션은 현재 기기의 Development 라이선스, 연결된 사용량, HWID 시험 사용 상태, 인증 코드와
사용자별 rate-limit만 대상으로 한다. project ref와 URL/DB URL이 서로 일치하고 Production과 다른
경우에만 실행되며, `--yes`를 지정해도 원격 삭제 확인 문구는 생략되지 않는다. 공유 모델·정책·캐시,
다른 사용자 및 Production 데이터는 변경하지 않는다. 전체 옵션과 예시는 `./clear_dev.sh --help`로
확인한다.
