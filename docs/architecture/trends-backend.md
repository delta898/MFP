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
- Is expected to run as a local Node service on the WordPress server.

### `wordpress/trends-download-ui`
- Hosts WordPress integration assets only.
- Should call `apps/trends/trends-api` from WordPress server-side PHP.
- Must not hold Supabase service-role credentials.
- Should normally call `trends-api` over `127.0.0.1`, not over a public Internet endpoint.
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

Operationally, the current preferred topology is:
- `trends-api` on the WordPress server
- WordPress PHP -> `127.0.0.1`
- collector on the same server
- auth refreshed from desktop and copied to the server

## Collector Contract

### Environment
- `TRENDS_NAVER_ID` or `NAVER_ID`
- `TRENDS_AUTH_FILE_PATH`
- `TRENDS_TARGET_DATE` or `TREND_DATE`
- `TRENDS_HEADLESS`
- `TRENDS_API_BASE_URL`
- `TRENDS_API_TOKEN`
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
- `TRENDS_META_SCAN_LIMIT`

Legacy compatibility:
- `SUPABASE_SERVICE_ROLE_KEY` is still accepted as a fallback during migration

### Endpoints
- `GET /health`
- `POST /internal/ingest/naver-trends`
- `GET /api/v1/trends`
- `GET /api/v1/trends/meta`
- `GET /exports/trends.csv`
- `GET /exports/trends.xlsx`

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
- Reference SQL lives at [apps/trends/trends-api/sql/001_create_naver_trends.sql](/Users/delta898/Project/NaverAutoBlog/apps/trends/trends-api/sql/001_create_naver_trends.sql).
- Existing installs can be hardened with [apps/trends/trends-api/sql/002_harden_trends_access.sql](/Users/delta898/Project/NaverAutoBlog/apps/trends/trends-api/sql/002_harden_trends_access.sql).
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
