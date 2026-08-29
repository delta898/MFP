# Trends API 환경 분리 Stage 4 개발 기록

## Branch

`feature/trends-api-environment-04-docker-local`

## 목표

- Trends API를 Node 24 기반의 재현 가능한 container image로 만든다.
- image와 build context에 환경 파일, Supabase key, API token 같은 운영값을 포함하지 않는다.
- Local Supabase와 실제로 연결되는 container smoke를 검증한다.
- 사용자는 내부 Docker 명령 대신 기존 `./trends_local.sh api`를 계속 사용한다.

## 설계와 결정사항

- Docker build context는 repository root를 사용하되 Dockerfile 전용 ignore 규칙으로 API와 필수
  shared source만 전달한다.
- API package는 자신의 runtime dependency와 lockfile을 소유한다. Desktop 전체 dependency를 image에
  설치하지 않는다.
- 하나의 immutable image를 Local·Development·Production에서 재사용하고 환경 차이는 runtime
  environment로만 공급한다.
- Local Compose는 Git에서 제외된 `apps/trends/.env.local`을 runtime에만 읽는다.
- Local PostgREST에는 `trends` schema를 노출하지만 migration에서 `anon`·`authenticated` 권한을
  계속 제거하여 backend secret 전용 접근 경계를 유지한다.
- container 안의 Local Supabase 주소는 `host.docker.internal:54321`을 사용하고 Linux host-gateway
  mapping도 선언한다.
- API는 container 안에서 `0.0.0.0:4581`에 bind하지만 host에는 `127.0.0.1:4581`로만 공개한다.
- non-root, read-only filesystem, capability drop, no-new-privileges와 healthcheck를 기본값으로 둔다.
- `./trends_local.sh api`는 Compose를 foreground로 실행한다. `collect`는 host에서 별도 실행하며
  container API의 `/health` 환경을 검증한 뒤 ingest한다.

## 사용자 준비사항

- Docker Desktop과 Local Supabase가 실행 가능해야 한다.
- `apps/trends/.env.local` 파일이 있어야 한다. 내부 API/read token이 비어 있으면 launcher가
  per-machine Local 값으로 한 번 생성하며 collector와 공유한다.
- Supabase admin key는 현재 Local stack에서 자동으로 확인하므로 수동 복사하지 않는다.
- 실제 Secret 값은 Git, Dockerfile, Compose, image layer에 기록하지 않는다.

## 범위 밖

- Development 원격 배포와 hostname/Caddy 구성
- Production systemd 제거 또는 container 전환
- GHCR push와 배포 자동화
- collector Docker화

## 검증 계획

- Dockerfile·Compose의 Secret 비포함 및 hardening contract test
- Node 24 image build
- container healthcheck
- Local Supabase를 이용한 인증된 meta read smoke
- 정상 종료와 재기동 검증
- 전체 unit regression과 `git diff --check`

## 결과

- Node 24 `bookworm-slim` 기반 Trends API image와 API 전용 dependency lockfile을 추가했다.
- Dockerfile 전용 allowlist build context를 사용해 환경 파일과 repository의 다른 자료가 image build로
  전달되지 않게 했다.
- image는 `node` 사용자, read-only filesystem, capability drop, no-new-privileges, healthcheck로
  실행된다.
- image metadata에서 Supabase/API/read Secret이 0개임을 확인했다. 검증한 Local image 크기는 약
  83.7 MB다.
- Local Compose는 API를 host loopback에만 공개하고 `host.docker.internal`을 통해 Local Supabase에
  연결한다.
- `./trends_local.sh api`가 Local Supabase의 현재 admin key를 권한 제한 임시 파일로만 공급한다.
  Local API/read token은 비어 있을 때 ignored `.env.local`에 한 번 생성해 host collector와 공유한다.
- 공유 정규화 모듈이 Desktop root dependency에 암묵적으로 의존하던 문제를 발견해 Trends API가
  `moment-timezone`을 직접 소유하도록 수정했다.
- Local PostgREST에 `trends` schema를 명시적으로 노출하고 기존 backend-only grant/RLS 경계를
  유지했다.
- 실제 container의 Local health, 인증된 meta RPC 조회, restart 후 health, 정상 종료와 정리를 모두
  검증했다.
- Docker·launcher focused test 12개와 전체 unit test 1,098개가 통과했고 `git diff --check`도
  통과했다.
