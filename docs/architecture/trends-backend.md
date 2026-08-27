# Trends Backend

## Purpose
Define the operator-only Naver trends backend that lives alongside the desktop app without becoming part of the desktop release artifact.

Operational deployment for this backend is documented separately in [trends-backend-deployment.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend-deployment.md).

## Execution Surfaces

```text
src/                        # existing BlogGenius desktop app
apps/
  trends/
    trends-collector/       # operator-only Node CLI
    trends-api/             # operator-only ingest/export API
shared/
  naver-trends-core/        # shared Playwright collection and normalization logic
wordpress/
  trends-download-ui/       # WordPress integration assets
```

## Responsibilities

### `shared/naver-trends-core`
- Owns Playwright-based Naver Creator Advisor trend collection helpers.
- Exposes reusable collection and normalization contracts.
- May be consumed by both the desktop app and operator-only apps.

### `apps/trends/trends-collector`
- Runs one-shot Naver trend collection.
- Calls `shared/naver-trends-core`.
- Sends normalized payloads to the internal ingest API.
- Does not write to Supabase directly.
- Auto-loads the shared environment file from `apps/trends/.env`.

### `apps/trends/trends-api`
- Owns Supabase write/read access for the trends backend.
- Validates collector payloads.
- Upserts trend rows into Supabase.
- Serves filtered JSON/CSV exports.
- Stores operational scrape history in file logs, not in a database `collection_runs` table.
- Auto-loads the shared environment file from `apps/trends/.env`.
- Runs as the central Node service on Oracle Cloud Free Tier.
- Is reached by the WordPress plugin with the internal token and by BlogGenius
  desktop clients with short-lived user read tokens.

### `wordpress/trends-download-ui`
- Hosts WordPress integration assets only.
- Calls the Oracle Cloud `trends-api` from WordPress server-side PHP.
- Must not hold Supabase service-role credentials.
- Holds only the internal trends API token needed by the server-side plugin.
- Current starter asset: `wordpress/trends-download-ui/trends-download-ui.php`
  - shortcode: `[trends_download_ui]`
  - config constants: `BG_TRENDS_API_BASE_URL`, `BG_TRENDS_API_TOKEN`

## Runtime Flow
1. Operator runs `npm run trends:collector` from the repo root, or `node /Users/delta898/Project/NaverAutoBlog/bin/trends-collector` from any shell directory.
2. Collector fetches trends through `shared/naver-trends-core`.
3. Collector posts payloads to `POST /internal/ingest/naver-trends`.
4. API validates and upserts into Supabase.
5. WordPress requests filtered exports from the API.
   Category selection is multi-select; missing category means all categories.

Operationally, the current topology is:

```text
Mac Studio collector --internal token--> Oracle Cloud trends-api --> Supabase trends.items
WordPress plugin ----internal token-----> Oracle Cloud trends-api
BlogGenius app --15-minute user token---> Oracle Cloud HTTPS read endpoints
                         ^
                         |
               Supabase license Edge Function
```

Oracle Cloud is the only public trends data gateway. Direct Supabase access is
never given to WordPress or the desktop app.

## Collector Contract

### Environment
- `TRENDS_NAVER_ID` or `NAVER_ID`
- `TRENDS_AUTH_FILE_PATH`
- `TRENDS_TARGET_DATE` or `TREND_DATE`
- `TRENDS_HEADLESS`
- `TRENDS_API_BASE_URL`
- `TRENDS_API_TOKEN`
- `TRENDS_READ_TOKEN_SECRET`
- `TRENDS_READ_TOKEN_ISSUER`
- `TRENDS_READ_TOKEN_AUDIENCE`
- `TRENDS_SOURCE`
- `TRENDS_DRY_RUN`
- `TRENDS_BROWSER_CHANNEL`
- `TRENDS_BROWSER_WINDOW_SIZE`

### Payload Sent To API
```json
{
  "source": "naver_creator_advisor",
  "trendDate": "2026-04-02",
  "collectedAt": "2026-04-02T00:30:00.000Z",
  "itemCount": 2,
  "items": [
    {
      "category": "맛집",
      "keyword": "성수 맛집",
      "variation": "+48",
      "changeRaw": "▲ 48",
      "changeType": "up",
      "changeAmount": 48,
      "displayOrder": 1
    }
  ]
}
```

## API Contract

### Environment
- `TRENDS_API_HOST`
- `TRENDS_API_PORT`
- `TRENDS_API_TOKEN`
- `TRENDS_SUPABASE_SCHEMA`
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TRENDS_SUPABASE_TABLE`
- `TRENDS_SUPABASE_ON_CONFLICT`
- `TRENDS_EXPORT_MAX_ROWS`
- `TRENDS_SUPABASE_META_FUNCTION`
- `TRENDS_META_CACHE_TTL_MS`
- `TRENDS_API_MAX_CONCURRENT_REQUESTS`
- `TRENDS_API_MAX_BODY_BYTES`
- `TRENDS_API_REQUEST_TIMEOUT_MS`
- `TRENDS_API_UPSTREAM_TIMEOUT_MS`

Legacy compatibility:
- `SUPABASE_SERVICE_ROLE_KEY` is still accepted as a fallback during migration

### Endpoints
- `GET /health`
- `POST /internal/ingest/naver-trends`
- `GET /api/v1/trends`
- `GET /api/v1/trends/meta`
- `GET /exports/trends.csv`
- `GET /exports/trends.xlsx`

### Access Classes
- `TRENDS_API_TOKEN` is an internal shared secret for collector, WordPress, and export access.
- Desktop-user reads use short-lived signed tokens issued by the
  `issue-trends-access-token` Supabase Edge Function after the existing license
  and HWID check succeeds.
- User tokens must include `aud=trends-api`, `scope=trends:read`, a valid issuer,
  and a non-expired `exp`. They may read only `/api/v1/trends` and
  `/api/v1/trends/meta`.
- All non-health endpoints fail closed when neither access class is valid.
- User request limits are keyed by the token's anonymized license subject, not
  by the reverse proxy socket address. IP-level abuse protection belongs at the
  HTTPS reverse proxy.

### Desktop Token Lifecycle

The 15-minute token is not user-managed configuration.

1. BlogGenius reads its already saved license key and current HWID.
2. The app requests a token from `issue-trends-access-token`.
3. The Edge Function validates the license and returns a signed read token.
4. The app keeps the token in memory only and reuses it until shortly before
   expiry.
5. The app refreshes once before expiry or once after an authentication failure.
6. App exit discards the token. No long-lived server secret is persisted in the
   desktop configuration.

### Query Filters
- `trend_date`
- `date_from`
- `date_to`
- `category` (repeatable)
- `categories` (comma-separated multi-select)
- `keyword`
- `source`
- `change_type`
- `change_amount_min`
- `change_amount_max`
- `limit`

### Category Filter Semantics
- No category parameter means `ALL`
- Repeated `category` parameters mean multi-select
- `categories=맛집,국내여행` is also accepted
- `category=ALL` or `category=*` disables category filtering

### Current Export Status
- CSV export is implemented.
- XLSX export is intentionally stubbed with `501 Not Implemented` until a concrete workbook format is defined.

## Supabase Schema
- The canonical table definition is [202608270016_create_naver_trends.sql](/Users/delta898/Project/NaverAutoBlog/supabase/migrations/202608270016_create_naver_trends.sql).
- Access hardening is [202608270017_harden_trends_access.sql](/Users/delta898/Project/NaverAutoBlog/supabase/migrations/202608270017_harden_trends_access.sql).
- Metadata aggregation is [202608270018_add_trends_meta_function.sql](/Users/delta898/Project/NaverAutoBlog/supabase/migrations/202608270018_add_trends_meta_function.sql).
- Default schema/table: `trends.items`
- Supabase project setup must also expose the `trends` schema in `API Settings -> Exposed schemas`.
- Security posture:
  - `trends.items` is intended for backend-only access through `SUPABASE_SECRET_KEY`
  - `anon` and `authenticated` should not have direct table privileges
  - RLS should remain enabled on `trends.items`
- Default upsert conflict key:
  - `source`
  - `trend_date`
  - `category`
  - `keyword`
- Metadata reads use the backend-only `trends.get_items_meta` aggregate function.
- The API keeps a short in-process metadata cache and collapses concurrent refreshes.

### Row Shape
- `source`
- `trend_date`
- `collected_at`
- `category`
- `keyword`
- `change_raw`
- `change_type`
- `change_amount`
- `display_order` (`category` 내부 노출 순서)
- `metadata`

## Packaging Rule
- Root desktop packaging excludes `apps/` and `wordpress/`.
- `shared/` stays available for transitive desktop-app imports.
- Operator-only environment files, deployment manifests, and secrets must not live under `shared/`.
- Trends backend deployment currently uses repository clone + Node runtime, not desktop-style packaging.
