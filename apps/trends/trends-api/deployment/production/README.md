# Trends API Production 전환 준비 및 실행 안내

이 폴더는 현재 host `4581`에서 실행 중인 legacy systemd Trends API를 Production 컨테이너로
안전하게 전환하기 위한 배포 단위다. 평소 재배포 안내가 아니라 **병행 후보 검증 → 승인 → 트래픽
전환 → 관찰 → legacy 제거** 순서를 위한 runbook이다.

현재 저장소 상태만으로는 Production을 변경하지 않는다. 아래에서 `승인 후 실행`으로 표시한
명령은 Production 서버·트래픽을 변경하므로 사용자의 별도 승인을 받은 뒤에만 수행한다.

## 고정 토폴로지

```text
전환 전
  trendapi.hangadac.com -> Caddy -> host:4581 -> legacy systemd Node

병행 검증 중
  Caddy는 계속 host:4581 사용
  host:4583 -> bloggenius-trends-api-production:4581 (후보 컨테이너)

전환 후
  trendapi.hangadac.com -> Caddy -> host:4583 -> Production 컨테이너
  legacy systemd는 rollback을 위해 host:4581에서 잠시 유지
```

- `4581`: 기존 systemd 서비스 및 rollback upstream
- `4583`: Production 후보 컨테이너 전용 host port
- 컨테이너 내부 listen port: `4581`
- `4583`은 Oracle VCN 및 host firewall의 공인 ingress에서 차단한다.
- Caddy·DNS·TLS는 서버 공용 인프라의 책임이며 Compose가 수정하지 않는다.

## 1. 로컬 준비 검사 — 안전, 부작용 없음

Production 실제 값은 이 폴더의 ignored 파일 하나에만 둔다.

```bash
cd apps/trends/trends-api/deployment/production
cp .env.trends-api.production.example .env.trends-api.production
chmod 600 .env.trends-api.production
```

다음 값을 기존 Production systemd 환경과 Production Supabase 설정에서 옮긴다.

- `SUPABASE_URL`: Production Supabase URL
- `SUPABASE_SECRET_KEY`: Production server-side secret key
- `TRENDS_API_TOKEN`: Production Collector/WordPress와 공유하는 내부 token
- `TRENDS_READ_TOKEN_SECRET`: Production Edge Function과 공유하는 단기 token 서명 secret

값을 새로 만들거나 회전시키는 단계가 아니다. 기존 값과 다르면 현재 client 또는 Edge Function이
인증에 실패할 수 있다. 파일을 저장소에 추가하거나 값을 로그에 출력하지 않는다.

저장소 root에서 다음 검사를 실행한다.

```bash
npm run trends:production:transition:preflight
```

이 명령은 파일과 배포 계약만 읽는다. DB, secret, Oracle, Caddy, systemd, Docker를 변경하지 않는다.
결과가 `READY FOR CANDIDATE VALIDATION`이어야 다음 단계의 후보 기동을 검토할 수 있다.

기존 Production `TRENDS_API_TOKEN`이 24자 미만이면 기존 Collector와 WordPress 호환성을 위해
후보 검증은 허용하되 `trends_api_token_rotation_recommended` 경고를 표시한다. 이 경고는 무시할
보안 문제가 아니라, 컨테이너 전환 안정화 후 API·Collector·WordPress를 함께 갱신하는 별도
credential rotation 작업으로 해결한다. 빈 token이나 placeholder는 계속 실패한다. 단기 사용자
token 서명에 쓰는 `TRENDS_READ_TOKEN_SECRET`의 최소 길이는 완화하지 않는다.

Compose 문법도 secret을 출력하지 않는 방식으로 확인한다.

```bash
cd apps/trends/trends-api/deployment/production
docker compose config --quiet
```

## 2. 전환 직전 read-only inventory

실제 서버 상태가 문서와 같은지 먼저 확인한다. 다음은 상태 조회만 한다.

```bash
sudo systemctl status trends-api --no-pager
sudo ss -ltnp | grep -E ':(4581|4583)\b'
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'
curl -sS 'https://trendapi.hangadac.com/health?check=legacy'
```

확인 기준:

- legacy systemd가 정상이며 host `4581`을 사용한다.
- host `4583`은 비어 있다.
- 공개 health가 `200`이다.
- Caddy의 Production upstream이 아직 `host.docker.internal:4581`이다.
- Production `.env`의 Supabase host와 기존 systemd 환경의 Supabase host가 같다.
  secret 원문을 비교하지 말고 필요하면 로컬에서 digest만 비교한다.

## 3. Production 후보 병행 기동 — 승인 후 실행

이 단계부터 Oracle의 Production 서비스 상태를 변경한다. 사용자의 명시적 승인을 받은 뒤
Production 서버의 저장소 checkout에서 실행한다.

```bash
cd apps/trends/trends-api/deployment/production
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 trends-api-production
```

후보는 `4583`에서만 검증하며 Caddy는 아직 바꾸지 않는다.

```bash
curl -sS http://127.0.0.1:4583/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:4583/api/v1/trends/meta
```

health는 `environment: production`을 포함한 `200`, 인증 없는 metadata 요청은 `401`이어야 한다.
그 다음 기존 Production internal token과 단기 사용자 token으로 후보의 ingest/read 경계를 각각
검증한다. token 값을 명령행, 화면 캡처, CI 로그에 남기지 않는다. 이 단계에서는 실제 수집
upsert나 발행을 실행하지 않는다.

후보 확인 중에도 다음 공개 endpoint는 계속 legacy systemd를 가리켜야 한다.

```bash
curl -sS 'https://trendapi.hangadac.com/health?check=before-cutover'
```

## 4. Caddy 전환 — 별도 승인 후 실행

후보 검증 결과를 사용자에게 보고하고 별도 승인을 받은 뒤에만 Production Caddy의 upstream을
다음과 같이 한 줄 변경한다.

```text
host.docker.internal:4581  ->  host.docker.internal:4583
```

route allowlist는 아래 다섯 경로를 유지해야 한다.

```text
/health
/internal/ingest/naver-trends
/api/v1/trends
/api/v1/trends/meta
/exports/trends.csv
```

`/exports/trends.xlsx`는 현재 API가 `501 Not Implemented`를 반환하는 예약 경로이므로 공개
allowlist에 넣지 않는다. WordPress 다운로드는 CSV를 사용한다.

Caddy 설정을 검증·reload한 뒤 외부 HTTPS에서 health, 무인증 `401`, 유효한 사용자 token read,
WordPress preview/export 순으로 smoke한다. 이 시점에도 systemd는 중지하지 않는다.

## 5. 즉시 rollback

전환 후 health, 인증, 조회, WordPress 중 하나라도 실패하면 새 원인을 고치기 전에 Caddy upstream을
`host.docker.internal:4581`로 되돌리고 reload한다. 공개 health와 조회가 복구된 뒤 후보 로그를
조사한다. rollback이 확인되기 전에는 legacy systemd를 중지하거나 환경 파일을 삭제하지 않는다.

후보만 중지해야 할 때:

```bash
cd apps/trends/trends-api/deployment/production
docker compose stop trends-api-production
```

## 6. 안정화 후 legacy 제거 — 별도 후속 승인

충분한 관찰 기간과 실제 Collector/WordPress/BlogGenius read 검증을 통과한 뒤에만 systemd를
disable한다. unit과 기존 환경 파일 삭제는 그보다 더 늦은 별도 정리 작업으로 취급한다. 안정화
기간에는 `4581` rollback 경로를 보존한다.

## Production Desktop 검증과의 관계

Trends API 전환 준비는 BlogGenius Production 승인을 대신하지 않는다. Desktop 후보는 먼저
성공한 Development workflow artifact를 근거로 GitHub Actions의
`Validate Environment Promotion → production-checklist`를 수동 실행한다. 생성된 checklist는
Production 배포를 수행하지 않으며, 동일 artifact·migration·검증 증거와 사용자 승인이 준비됐는지
확인하는 자료다.
