# Trends API Development 배포 안내

이 폴더만으로 Development Trends API를 배포하고 재시작합니다. Caddy·DNS·TLS는 서버의 공용
인프라가 담당하며 이 프로젝트는 host port `4582`에 API를 제공합니다. Oracle VCN과 host
firewall에서는 4582를 외부에 공개하지 않습니다.

## 최초 1회 설정

저장소를 clone하고 대상 브랜치를 checkout한 뒤 이 폴더로 이동합니다.

```bash
cd apps/trends/trends-api/deployment/development
cp .env.trends-api.development.example .env.trends-api.development
chmod 600 .env.trends-api.development
```

`.env.trends-api.development`에 다음 네 값만 설정합니다.

- `SUPABASE_SECRET_KEY`: Development Supabase의 server-side secret key
- `TRENDS_API_TOKEN`: Development Collector와 공유하는 충분히 긴 내부 token
- `TRENDS_READ_TOKEN_SECRET`: Development Edge Function과 공유하는 단기 token 서명 secret
- `TRENDS_PRODUCTION_SUPABASE_URL`: 실수로 Production DB를 가리키지 않는지 비교할 공개 URL

실제 파일은 Git에서 제외됩니다. 값을 저장소나 운영 명령 로그에 출력하지 않습니다.

설정을 검사합니다.

```bash
npm run trends:development:preflight
```

## 실행과 재배포

최초 실행 또는 소스가 변경된 재배포:

```bash
cd apps/trends/trends-api/deployment/development
docker compose up -d --build
```

이미 만들어진 동일 image를 단순 재시작할 때만 다음 명령으로 충분합니다.

```bash
docker compose up -d
```

상태와 로그:

```bash
docker compose ps
docker compose logs --tail=100 trends-api-development
```

중지:

```bash
docker compose down
```

## 확인

서버 내부 loopback 확인:

```bash
curl -sS http://127.0.0.1:4582/health
curl -sS -o /dev/null -w '%{http_code}\n' \
  http://127.0.0.1:4582/api/v1/trends/meta
```

첫 요청은 `environment: development`를 포함한 `200`, 두 번째 인증 없는 요청은 `401`이어야
합니다. 외부 HTTPS도 동일하게 확인합니다.

```bash
curl -sS 'https://trendapi-dev.hangadac.com/health?check=development'
curl -sS -o /dev/null -w '%{http_code}\n' \
  https://trendapi-dev.hangadac.com/api/v1/trends/meta
```

## 외부 Caddy 연결

Caddy 설정은 서버 공용 인프라의 책임이며 최초 1회만 연결합니다. 일반 재배포 때 수정하지
않습니다. Caddy가 별도 컨테이너이므로 승인된 경로를 `host.docker.internal:4582`로 전달합니다.
TCP 4582는 Caddy의 host gateway 접근에만 쓰고 공인 ingress에서는 차단합니다.

```caddyfile
trendapi-dev.example.com {
    @trends_routes {
        path /health /internal/ingest/naver-trends /api/v1/trends /api/v1/trends/meta /exports/trends.csv /exports/trends.xlsx
    }
    handle @trends_routes {
        reverse_proxy host.docker.internal:4582
    }
    handle {
        respond "Not found" 404
    }
}
```

## 업데이트 절차

```bash
git pull
npm run trends:development:preflight
cd apps/trends/trends-api/deployment/development
docker compose up -d --build
docker compose ps
curl -sS 'https://trendapi-dev.hangadac.com/health?check=development'
```

그 뒤 운영자 PC에서 `./collect_trends_dev.sh`를 실행해 수집·upsert까지 확인합니다.

## 문제 해결

- `404`: Caddy의 승인 경로에 ingest 또는 조회 경로가 빠졌는지 확인합니다.
- `401` (인증 없는 조회): 정상입니다. token을 포함한 Collector 요청만 성공해야 합니다.
- Collector의 환경 불일치: API `/health`가 `development`를 반환하는지 확인합니다.
- 설정 변경 미반영: `docker compose up -d --force-recreate`로 컨테이너를 다시 만듭니다.
- 코드 변경 미반영: `--build`를 붙여 image를 다시 만듭니다.

이 배포 단위는 Production Compose나 Production 데이터베이스를 변경하지 않습니다.
