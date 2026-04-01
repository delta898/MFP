# Trends API

Operator-only API service responsible for:
- ingest validation
- Supabase upsert
- filtered CSV/XLSX export endpoints
- default storage target: `trends.items`
- WordPress download UI should treat category as multi-select

This runtime is intentionally separate from the desktop app packaging flow.

## Run

```bash
cp apps/trends/.env.sample apps/trends/.env
npm run trends:api
```

From any shell directory you can also run:

```bash
node /Users/delta898/Project/NaverAutoBlog/bin/trends-api
```

Important env keys:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TRENDS_API_TOKEN`
- `TRENDS_API_HOST`
- `TRENDS_API_PORT`

Compatibility note:
- prefer the new Supabase `sb_secret_...` key via `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` is still accepted as a legacy fallback
- shared `.env` is auto-loaded from `apps/trends/`

Supabase note:
- because the default storage target is the custom schema `trends.items`, add `trends` to Supabase `API Settings -> Exposed schemas`
- run the grant statements in `apps/trends/trends-api/sql/001_create_naver_trends.sql` so the Data API can access that schema

## Endpoints

- `GET /health`
- `POST /internal/ingest/naver-trends`
- `GET /api/v1/trends`
- `GET /api/v1/trends/meta`
- `GET /exports/trends.csv`
- `GET /exports/trends.xlsx`

## Example

```bash
curl "http://127.0.0.1:4581/api/v1/trends?date_from=2026-04-01&date_to=2026-04-02&category=맛집&category=국내여행"
```

```bash
curl "http://127.0.0.1:4581/api/v1/trends/meta"
```

Category filter rules:
- no `category` or `categories` parameter: all categories
- repeated `category` parameters: multi-select
- `categories=맛집,국내여행`: comma-separated multi-select
- `category=ALL` or `category=*`: all categories
