# Keyword Gateway

BlogGenius 데스크톱을 대신해 Naver Search Ads와 Blog Search API를 호출하는
서버 전용 runtime이다. 네이버 자격증명은 이 서버의 환경변수에만 저장한다.

## Access Flow

1. 데스크톱이 `issue-keyword-access-token` Supabase Edge Function에 기존
   `licenseKey + HWID`를 보낸다.
2. Edge Function이 라이선스를 검증하고 15분 수명의 토큰을 발급한다.
3. 데스크톱이 토큰과 분석 입력을 Gateway에 보낸다.
4. Gateway는 `aud=keyword-gateway`, `scope=keyword:analyze`를 검증한 뒤
   네이버 API를 호출한다.

Gateway에는 라이선스 키나 HWID가 전달되지 않는다. JWT의 `sub`는 라이선스
키를 SHA-256으로 익명화한 값이다.

## Run

```bash
cp apps/keyword-gateway/.env.sample apps/keyword-gateway/.env
set -a
source apps/keyword-gateway/.env
set +a
npm run keyword:gateway
```

운영 환경에서는 `.env` 대신 권한이 제한된 service environment 또는 secret
manager를 사용한다. secret 갱신 후 Gateway process만 재시작하면 데스크톱
업데이트 없이 키를 교체할 수 있다.

## Endpoints

- `GET /health`
- `POST /api/v1/keyword-research/analyze`

분석 endpoint는 Bearer token이 필수다. 입력 키워드와 연관 후보 상한은 서버
정책값으로 강제되며 클라이언트 요청으로 높일 수 없다.

## Policy Variables

- `KEYWORD_MAX_INPUT_COUNT` (default `3`)
- `KEYWORD_MAX_RELATED_CANDIDATES` (default `8`, 모든 입력 키워드의 합계)
- `KEYWORD_DEFAULT_RELATED_CANDIDATES` (default `8`)
- `KEYWORD_MIN_SEARCH_VOLUME` (default `300`)
- `KEYWORD_RATE_LIMIT_PER_MINUTE` (default `20`, license subject 기준)
- `KEYWORD_IP_RATE_LIMIT_PER_MINUTE` (default `60`)
- `KEYWORD_MAX_CONCURRENT_REQUESTS` (default `8`)
- `KEYWORD_SEARCHAD_CACHE_TTL_MS` (default 6 hours)
- `KEYWORD_BLOG_CACHE_TTL_MS` (default 1 hour)
- `KEYWORD_CACHE_MAX_ENTRIES` (default `2000` per cache)

## Secret Variables

- `KEYWORD_ACCESS_TOKEN_SECRET`
- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`

`KEYWORD_ACCESS_TOKEN_SECRET`은 Supabase Edge Function과 Gateway에 같은 값을
설정한다. 트렌드 토큰 secret과는 별도 값을 사용한다.
