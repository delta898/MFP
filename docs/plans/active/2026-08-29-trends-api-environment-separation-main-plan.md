# Trends API 환경 분리 Parent 계획

## Branch

`feature/trends-api-environment-separation-main`

## 상태

Stage 1·2·3·4 feature-main 병합 완료. Stage 5 Development 배포·인증 E2E 설계 진행 중. Production
변경과 원격 배포는 승인 전까지 수행하지 않는다.

## 배경과 사용자 필요

BlogGenius Desktop은 Local, Development, Production으로 분리됐지만 `apps/trends/trends-api`는
하나의 `.env`, 하나의 공개 endpoint와 하나의 read-token signing secret만 사용한다. 그 결과
Development Supabase가 발급한 Development 토큰을 Production Trends API가 거부했고, 실제
Development 키워드 탐색에서 `Unauthorized`가 발생했다.

단순히 Production API가 두 signing key를 신뢰하게 만들면 당장의 조회는 가능하지만 다음 문제는
남는다.

- Development 인증 경계가 Production 서비스 안으로 들어간다.
- Trends API 코드 변경을 Production 배포 전 실제 환경에서 검증할 수 없다.
- collector의 수집 대상과 Trends 데이터 저장소도 여전히 하나의 환경에 묶인다.
- Development 장애와 quota가 Production API에 영향을 줄 수 있다.

따라서 Trends API를 같은 저장소 안의 독립 배포 서비스로 유지하면서 runtime과 배포 환경을
분리한다.

## 목표 구조

```text
BlogGenius Local
  -> Local Trends API
  -> Local Supabase trends schema / fixture

BlogGenius Development
  -> https://trendapi-dev.<domain>
  -> Development Trends API service
  -> BlogGenius Development Supabase trends schema
  -> Development read-token signing secret

BlogGenius Production
  -> https://trendapi.<domain>
  -> Production Trends API service
  -> Production Supabase trends schema
  -> Production read-token signing secret
```

환경마다 Trends API는 signing key 하나만 신뢰한다. Production API에 Development key를 추가하지
않는다.

## 설계 원칙

1. `trends-api`는 Desktop과 별도 배포 생명주기를 가진다. 저장소를 바로 분리하지는 않는다.
2. 환경을 명시하지 않으면 API와 collector가 fail-closed로 기동을 거부한다.
3. URL, Supabase target, internal ingest token, read-token secret, issuer와 audience를 하나의 환경
   profile로 취급한다.
4. Secret은 Desktop, Git, 문서와 공개 runtime config에 포함하지 않는다.
5. Development API는 Production DB에 쓰지 않는다.
6. collector도 대상 환경을 명시해야 하며 Development 수집은 Development API로만 전송한다.
7. Production endpoint, service, DB와 Secret은 Development 검증 완료 전 변경하지 않는다.
8. 실제 원격 배포, DNS, Caddy와 systemd 변경은 별도 승인된 rollout 단계에서만 수행한다.

## 제안하는 실행 설정

현재의 모호한 `apps/trends/.env` 자동 로딩을 다음처럼 바꾼다.

```text
TRENDS_ENV=local|development|production

apps/trends/.env.local
apps/trends/.env.development
apps/trends/.env.production
```

실제 파일은 Git에서 제외하고 `.env.*.sample`만 관리한다. 서버에서는 repository 내부 파일보다
systemd `EnvironmentFile` 등 운영자가 소유한 외부 경로를 우선한다.

사용자 편의 실행 명령:

```text
./trends_local.sh
./trends_dev.sh
./trends_local.sh api
./trends_dev.sh api
./trends_local.sh collect
./trends_dev.sh collect
./trends_local.sh status
./trends_dev.sh status
```

인자 없이 실행하면 도움말만 표시하며 수집을 암묵적으로 시작하지 않는다. `api`는 해당 환경의 API
서버, `collect`는 네이버 트렌드 수집과 동일 환경 API를 통한 Supabase upsert를 뜻한다. 사용자에게는
위 shell launcher를 기본 진입점으로 제공하고 하위 npm 명령은 테스트와 자동화에서 사용한다.
Production launcher는 아직 제공하지 않으며, 향후 branch와 target preflight를 통과해야만 실행할 수
있게 별도로 확정한다.

## API와 collector의 환경 분리

`trends-api`만 분리하고 collector가 계속 하나의 `.env`와 endpoint를 사용하면 잘못된 환경에 데이터를
넣을 수 있다. collector도 `TRENDS_ENV`를 필수로 받고 대상 API URL과 internal ingest token의 환경
일치를 검사한다.

```text
collector local       -> Local Trends API만 허용
collector development -> Development Trends API만 허용
collector production  -> Production Trends API만 허용
```

Naver 로그인 세션은 수집 입력이고 Trends DB 자격증명은 아니다. 여러 환경이 같은 운영자 Naver
세션을 사용할 수는 있지만, 수집 결과가 전송되는 endpoint와 ingest token은 환경별로 분리한다.
Production collector는 기존 schedule을 그대로 유지하고, Development collector는 초기 데이터 준비나
명시적 E2E 검사 때만 수동으로 실행하는 것을 기본으로 한다.

## Development 배포 제안: Docker

별도 서버를 추가하지 않고 현재 Oracle 호스트에 논리적으로 분리한다. 현재의 systemd 직접 Node
실행은 Docker Compose 기반의 동일 이미지·별도 instance 구조로 점진적으로 전환하는 것을 권장한다.

```text
one immutable trends-api image
  -> trends-api-development container -> development env/secret/port
  -> trends-api-production container  -> production env/secret/port

trendapi-dev.<domain> -> Caddy -> trends-api-development:<development-port>
trendapi.<domain>     -> Caddy -> trends-api-production:<production-port>
```

- 하나의 versioned Docker image와 환경별 container
- 별도 Compose service 또는 환경별 Compose project
- 별도 environment file
- 별도 port
- 별도 hostname과 TLS route
- 별도 internal token과 read-token secret
- healthcheck, restart policy와 resource limit
- host에는 Node와 npm을 직접 운영하지 않고 Docker runtime만 유지

Production systemd service를 바로 제거하지 않는다. Development container를 먼저 올려 E2E를 검증한
뒤, 동일 image digest를 사용하는 Production container 전환을 별도 rollout으로 수행한다. 전환 시에는
기존 systemd service를 rollback 경로로 남겼다가 안정화 후 제거한다.

Development 데이터는 이미 canonical migration으로 생성되는 BlogGenius Development Supabase의
`trends.items`를 사용한다. 초기 데이터는 Production DB를 직접 공유하지 않고 다음 중 하나로
준비한다.

1. Development collector를 수동 실행해 Development API로 수집
2. 민감정보가 없는 제한된 snapshot fixture를 Development에 적재

초기 권장안은 실제 수집 경로까지 검증할 수 있는 1번이며, CI와 반복 테스트에는 2번을 사용한다.

## Desktop 연결

현재 Desktop trends provider의 기본 URL은 Production endpoint로 고정돼 있다. 환경 profile에
공개값인 Trends API URL을 추가해 다음처럼 선택한다.

```text
local       -> http://127.0.0.1:<local-port>
development -> https://trendapi-dev.<domain>
production  -> https://trendapi.<domain>
```

URL은 공개 연결 정보이므로 Secret이 아니다. 그러나 환경과 URL의 조합을 검증해 Development가
Production endpoint로 잘못 연결되는 것을 차단한다.

## Branch 운영

현재 branch인 `feature/trends-api-environment-separation-main`을 전체 기능의 통합 feature-main으로
사용한다. 각 단계는 이 branch에서 짧은 feature-sub를 만들고 focused 검증과 사용자 승인을 거쳐
feature-main으로 병합·삭제한다. 전체 Development 검증이 끝날 때까지 feature-main을 `dev`에
병합하지 않는다.

## 단계별 feature-sub 계획

### Stage 1 — 환경 계약과 config loader

Status: feature-main merge complete

- `TRENDS_ENV` 계약과 manifest
- 환경별 env 파일 선택과 fail-closed validation
- API·collector 공통 환경 진단
- 기존 `.env` 호환 여부 결정

### Stage 2 — API와 collector runtime 분리

Status: feature-main merge complete

- 환경별 host, port, Supabase target과 token 설정
- collector 대상 환경 guard
- 환경 혼합과 Production write 방지 테스트

### Stage 3 — Desktop Trends endpoint 분리

Status: feature-main merge complete

- BlogGenius runtime profile에 공개 Trends URL 추가
- 환경별 endpoint allowlist/validation
- Development `Unauthorized` 회귀 테스트

### Stage 4 — Docker image와 local container 검증

Status: feature-main merge complete

- Node 24 기반 Trends API Dockerfile
- 환경값이나 Secret을 포함하지 않는 immutable image
- non-root user, healthcheck와 종료 signal 계약
- Local Supabase와 연결한 container smoke
- image tag보다 digest를 배포 identity로 사용하는 계약

### Stage 5 — Development 배포와 인증 E2E

Status: approved topology implementation and preflight in progress

- Development signing secret과 issuer/audience 계약
- Development Supabase trends 데이터 준비 절차
- Development container, hostname과 Caddy route 배포
- Edge Function -> Development Trends API 읽기 smoke
- Production secret과 endpoint 비접촉 증거

확정 topology는 `trendapi-dev.hangadac.com`, 기존 Oracle host의 별도 Development container와
1회 수동 Development collector이다. host port, TLS와 reverse proxy는 외부 server routing이
소유한다. 기존 Production systemd service와
`trendapi.hangadac.com`은 변경하지 않는다.

### Stage 6 — 배포 자동화

- CI에서 unit test 후 immutable image를 Git SHA와 digest로 생성
- Development Compose/Caddy/DNS rollout manifest
- Trends API path-filtered test와 artifact 검증
- Development는 승인된 수동 workflow 또는 서버 deploy script로 정확한 digest 배포
- healthcheck와 read-only smoke 실패 시 이전 digest로 복구
- Production은 Development에서 검증한 동일 digest만 후보로 허용
- Production 배포는 GitHub Environment 승인과 사용자 명시적 승인 없이는 실행하지 않음
- systemd에서 container로 전환하는 rollback, key rotation과 장애 격리 절차
- canonical architecture 문서 승격

처음부터 완전 자동 CD를 만들지는 않는다. 1차는 `test -> image build -> 수동 Development deploy ->
smoke`를 자동화하고, 흐름이 안정된 뒤 Development 자동 배포를 선택한다. Production은 계속 수동
승인 gate를 유지한다. Watchtower처럼 새 tag를 감지해 임의로 교체하는 방식은 사용하지 않는다.

## 이번 feature에서 하지 않을 것

- Production Trends API 즉시 재배포
- Production Secret 회전
- Production collector 변경
- repository 분리
- 실제 발행 정책 변경
- Trends 추천 알고리즘 변경

## 완료 기준

- Local, Development, Production이 서로 다른 Trends URL과 인증 경계를 가진다.
- 환경 미지정 또는 URL·Supabase target 혼합 시 기동 전에 실패한다.
- Development 토큰이 Development API에서만 유효하다.
- Development collector가 Production API/DB에 쓸 수 없다.
- BlogGenius Development 키워드 탐색이 Production Trends API 없이 동작한다.
- Production 서비스와 Secret은 명시적 승인 전까지 변경되지 않는다.

## 논의·결정이 필요한 항목

1. 기존 `apps/trends/.env`를 즉시 폐기할지, 한시적 경고 호환을 둘지
2. Production 실행 명령을 repository에서 제공할지, 서버 운영 명령으로만 남길지
3. Docker image registry를 GHCR로 사용할지
4. Development 배포를 수동 workflow로 시작할지, `dev` 통과 후 자동 배포할지
