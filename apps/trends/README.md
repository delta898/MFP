# Trends System

BlogGenius의 트렌드 백엔드는 역할별로 분리되어 있습니다.

- `trends-api/`: 장기 실행되는 조회·저장 API 소스
- `trends-collector/`: 네이버 Creator Advisor 수집기
- `shared/lib/`: 두 프로그램이 공유하는 환경·검증 코드
- `trends-api/deployment/local/`: Local API Compose 배포 단위
- `trends-api/deployment/development/`: Development API 배포 단위

## 환경 파일

이름만 보고 소유자를 알 수 있도록 파일을 분리합니다.

- Collector Local: `apps/trends/trends-collector/config/.env.trends-collector.local`
- Collector Development: `apps/trends/trends-collector/config/.env.trends-collector.development`
- Collector Production: `apps/trends/trends-collector/config/.env.trends-collector.production`
- Local Edge Functions: `supabase/functions/.env`
- Development API: `apps/trends/trends-api/deployment/development/.env.trends-api.development`
- Production API: `apps/trends/trends-api/deployment/production/.env.trends-api.production`

각 실제 파일은 Git에서 제외됩니다. 같은 위치의 `.sample` 또는 `.example`을 복사해 한 번만
설정합니다. Desktop용 저장소 루트 `.env.development`와는 별개입니다.

Local에서는 `./run_local.sh`가 두 Local 파일을 sample에서 자동 생성한다. 단기 read token의 signing
secret은 공식 Supabase Local Functions 파일이 소유하며, Collector 파일에는 ingest token만 둔다.

## 수집

```bash
./apps/trends/trends-collector/commands/collect_local.sh
./apps/trends/trends-collector/commands/collect_development.sh
./apps/trends/trends-collector/commands/collect_production.sh --dry-run
```

날짜를 지정할 수도 있습니다.

```bash
./apps/trends/trends-collector/commands/collect_development.sh --date=-1d
```

세 스크립트는 수집만 담당합니다. API 서버를 직접 실행하는 `api` 명령은 제공하지 않습니다.
Development API 운영은 [배포 안내](trends-api/deployment/development/README.md)를 따릅니다.

Production script는 인자 없이 실행하면 한 번 수집한 payload를 요약한 뒤 `PRODUCTION` 확인을
받습니다. `--dry-run`은 무변경, `--confirm-production`은 CI/cron을 위한 명시적 실제 반영
모드이며 둘을 함께 쓸 수 없습니다.
