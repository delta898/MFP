# Trends API 환경 분리 Stage 5 개발 기록

## Branch

`feature/trends-api-environment-05-development-e2e`

## 목표

- Stage 4에서 검증한 동일 Trends API image를 별도 Development instance로 실행한다.
- BlogGenius Development Supabase와 Development API가 signing secret·issuer·audience를 공유하게 한다.
- Development collector가 Development API와 DB에만 쓰는지 검증한다.
- BlogGenius Development의 키워드 탐색이 Production API 없이 동작하는 E2E 증거를 만든다.

## 배포 경계

- 기존 `trendapi.hangadac.com` Production systemd service, Production Supabase, Production Secret과
  collector schedule은 변경하지 않는다.
- Development는 별도 container 이름, environment file과 hostname을 사용한다.
- host port, TLS 종료와 reverse proxy 종류는 외부 server routing이 소유한다.
- repository는 배포 manifest와 검증 도구만 소유한다. 실제 Secret과 서버 environment file은
  operator 또는 배포 환경이 소유한다.
- Development Supabase `trends` schema는 canonical migration chain으로 준비한다.
- hosted PostgREST에도 `trends` schema가 노출되어야 하지만 `anon`·`authenticated` 직접 권한은
  migration에서 계속 차단한다.

## 확정 topology

```text
BlogGenius Development
  -> Development Supabase issue-trends-access-token
  -> short-lived Development read token
  -> https://trendapi-dev.hangadac.com
  -> external server routing
  -> bloggenius-trends-api-development container:4581
  -> BlogGenius Development Supabase trends schema
```

## Secret 소유권

- `TRENDS_READ_TOKEN_SECRET`: Development Supabase Edge Function과 Development API server에만 같은
  값을 둔다.
- `TRENDS_API_TOKEN`: Development collector와 Development API server만 공유한다.
- `SUPABASE_SECRET_KEY`: Development API server만 소유한다.
- URL, issuer, audience, environment 이름은 공개 설정이지만 환경 일치 검증을 거친다.
- Development와 Production Secret을 교차 신뢰하거나 하나의 server env file에 함께 두지 않는다.

## 구현 순서

1. Development 배포 manifest와 fail-closed preflight를 만든다.
2. Development Supabase migration/schema/function 배포 상태를 read-only로 확인한다.
3. Development용 signing secret·issuer·audience를 Edge Function과 server에 설정한다.
4. 별도 hostname의 외부 routing에 Development container를 연결한다.
5. health, internal read, short-lived user token read, collector ingest를 순서대로 smoke한다.
6. Production endpoint·DB·service가 변경되지 않았다는 증거를 남긴다.

## 결정사항

- Development hostname은 `trendapi-dev.hangadac.com`을 사용한다.
- 기존 Oracle host에 Production systemd와 분리된 Development container를 배포한다.
- 컨테이너는 내부 port `4581`에서 서비스를 제공하고 host port·TLS·reverse proxy는 외부 server
  routing에서 결정한다.
- Development 초기 데이터는 자동 schedule 없이 collector를 1회 수동 실행해 준비한다.
- BlogGenius repository는 특정 Caddy/Nginx나 host port에 의존하지 않고 HTTPS 공개 URL만 계약한다.

## 범위 밖

- Production systemd의 Docker 전환 또는 제거
- Production key rotation
- GHCR와 자동 배포 workflow
- Development 자동 CD

## 검증 계획

- 배포 manifest와 Secret 비포함 contract test
- Development Supabase schema/function readiness
- Development container health와 인증 경계 smoke
- short-lived token의 issuer/audience/environment 일치 검증
- Development collector ingest와 Desktop read E2E
- Production 비접촉 증거

## 과정과 결과

- 확정 topology를 Secret이 없는 Development manifest와 별도 Compose로 코드화했다.
- preflight는 hostname, port, Supabase target, issuer/audience, 필수 Secret 존재 여부와 Production
  collision fence를 확인하며 Secret 값은 출력하지 않는다.
- Development Supabase project의 local/remote migration chain 23개가 일치함을 읽기 전용으로 확인했다.
- `issue-trends-access-token`을 포함한 required Edge Function 5개가 모두 `ACTIVE`임을 확인했다.
- Development Supabase의 `TRENDS_READ_TOKEN_SECRET`, issuer와 audience가 API server runtime file과
  SHA-256 기준으로 모두 일치함을 확인했다.
- hosted Data API에 `trends` schema를 노출한 뒤 server secret key로 `trends.get_items_meta` RPC가
  정상 응답했다. 현재 Development trends 데이터는 `0`건이므로 1회 collector 실행은 아직 필요하다.
- 현재 원격 container·Caddy·DNS는 변경하지 않았고 Production service에도 접근하지 않았다.
