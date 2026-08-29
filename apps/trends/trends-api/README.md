# Trends API

트렌드 수집 payload를 검증해 Supabase에 저장하고 조회·내보내기 API를 제공하는 서버입니다.
Desktop 앱 패키지와 독립된 장기 실행 서비스입니다.

## 실행 원칙

- Development 서버는 `deployment/development/`의 Compose로만 운영합니다.
- 운영자가 Node 진입점을 직접 실행하는 `api` 명령은 제공하지 않습니다.
- Local API 컨테이너 실행기는 자동 검증용 내부 도구로만 유지합니다.
- Production 배포 방식은 별도 승인 전까지 기존 서비스에 영향을 주지 않습니다.

Development 설치·재배포 명령은 [Development 배포 안내](deployment/development/README.md)를
참조합니다.

## 권한 경계

- `GET /health`만 인증 없이 허용합니다.
- Collector ingest 및 export는 `TRENDS_API_TOKEN`을 사용합니다.
- Desktop read endpoint는 Supabase Edge Function이 발급한 단기 사용자 토큰을 사용합니다.
- `SUPABASE_SECRET_KEY`, 내부 API token, 서명 secret은 Desktop에 포함하지 않습니다.

## Endpoints

- `GET /health`
- `POST /internal/ingest/naver-trends`
- `GET /api/v1/trends`
- `GET /api/v1/trends/meta`
- `GET /exports/trends.csv`
- `GET /exports/trends.xlsx`

기본 저장 대상은 `trends.items`입니다. Supabase의 exposed schema에 `trends`가 포함되어야 하며,
DB 정의의 source of truth는 루트 `supabase/migrations/`입니다.
