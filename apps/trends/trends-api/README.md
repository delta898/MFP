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
- `TRENDS_READ_TOKEN_SECRET` (when desktop-user read access is enabled)
- `TRENDS_API_HOST`
- `TRENDS_API_PORT`

Compatibility note:
- prefer the new Supabase `sb_secret_...` key via `SUPABASE_SECRET_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` is still accepted as a legacy fallback
- shared `.env` is auto-loaded from `apps/trends/`

Supabase note:
- because the default storage target is the custom schema `trends.items`, add `trends` to Supabase `API Settings -> Exposed schemas`
- run `apps/trends/trends-api/sql/001_create_naver_trends.sql` for a fresh install
- if the table already exists and Supabase shows `RLS disabled` / `UNRESTRICTED`, run `apps/trends/trends-api/sql/002_harden_trends_access.sql`
- run `apps/trends/trends-api/sql/003_add_trends_meta_function.sql` to install the database-side metadata aggregate
- the intended production posture is backend-only access via `SUPABASE_SECRET_KEY`; `anon` / `authenticated` should not have direct access to `trends.items`

## Endpoints

- `GET /health`
- `POST /internal/ingest/naver-trends`
- `GET /api/v1/trends`
- `GET /api/v1/trends/meta`
- `GET /exports/trends.csv`
- `GET /exports/trends.xlsx`

All endpoints except `GET /health` require authorization. The service no longer
falls back to unauthenticated access when `TRENDS_API_TOKEN` is absent.

- Collector, WordPress, and CSV export requests require
  `Authorization: Bearer <TRENDS_API_TOKEN>`.
- `GET /api/v1/trends` and `GET /api/v1/trends/meta` also accept a short-lived
  user read token with `scope=trends:read`, issued by the
  `issue-trends-access-token` Supabase Edge Function.
- User read tokens require a matching `TRENDS_READ_TOKEN_SECRET`, issuer, and
  audience. They cannot access ingest or export endpoints.

## Resource Protection

- Metadata is aggregated by one Supabase RPC instead of scanning rows through the API.
- Identical metadata requests use a five-minute in-process cache and share refresh work.
- Concurrent HTTP requests default to 8 and excess requests receive `503`.
- Ingest request bodies default to a 1 MiB limit.
- Incoming request timeout defaults to 30 seconds.
- Supabase requests time out after 7 seconds by default.
- User-token read requests are limited per source IP, defaulting to 120 per minute.

These limits can be adjusted with:
- `TRENDS_META_CACHE_TTL_MS`
- `TRENDS_API_MAX_CONCURRENT_REQUESTS`
- `TRENDS_API_MAX_BODY_BYTES`
- `TRENDS_API_REQUEST_TIMEOUT_MS`
- `TRENDS_API_UPSTREAM_TIMEOUT_MS`
- `TRENDS_API_READ_RATE_LIMIT_PER_MINUTE`
- `TRENDS_READ_TOKEN_ISSUER`
- `TRENDS_READ_TOKEN_AUDIENCE`

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
