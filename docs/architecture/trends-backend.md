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
      docker/               # Oracle Node/Docker rollback runtime
      workers/              # active Cloudflare Workers runtime
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
- Auto-loads its environment-specific operator file from
  `apps/trends/trends-collector/config/`.

### `apps/trends/trends-api`
- Owns Supabase write/read access for the trends backend.
- Validates collector payloads.
- Upserts trend rows into Supabase.
- Serves filtered JSON/CSV exports.
- Stores operational scrape history in file logs, not in a database `collection_runs` table.
- Receives API-owned runtime configuration from its deployment environment.
- Runs through the API hostname for the selected environment.
- Is reached by the WordPress plugin with the internal token and by BlogGenius
  desktop clients with short-lived user read tokens.
- Keeps runtime implementations separate: `workers/` is the active gateway and
  `docker/` preserves the prior Oracle Node service for rollback.

### `wordpress/trends-download-ui`
- Hosts WordPress integration assets only.
- Calls the Production `trends-api` hostname from WordPress server-side PHP.
- Must not hold Supabase service-role credentials.
- Holds only the internal trends API token needed by the server-side plugin.
- Current starter asset: `wordpress/trends-download-ui/trends-download-ui.php`
  - shortcode: `[trends_download_ui]`
  - config constants: `BG_TRENDS_API_BASE_URL`, `BG_TRENDS_API_TOKEN`

## Runtime Flow
1. Operator uses an environment-specific command under
   `apps/trends/trends-collector/commands/`.
2. Collector fetches trends through `shared/naver-trends-core`.
3. Collector posts payloads to `POST /internal/ingest/naver-trends`.
4. API validates and upserts into Supabase.
5. WordPress requests filtered exports from the API.
   Category selection is multi-select; missing category means all categories.

Operationally, the current topology is:

```text
Mac Studio collector --internal token--> Cloudflare Worker --> Supabase trends.items
WordPress plugin ----internal token-----> Production Worker
BlogGenius app --15-minute user token---> Production Worker HTTPS read endpoints
                         ^
                         |
               Supabase license Edge Function
```

Cloudflare Workers is the current public trends data gateway. Direct Supabase
access is never given to WordPress or the desktop app. The former Oracle
deployment remains available for rollback during stabilization.

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
- `GET /api/v1/public/trends`
- `GET /api/v1/public/trends/meta`
- `POST /api/v1/public/subscriptions`
- `POST /api/v1/public/subscriptions/confirm`
- `POST /api/v1/public/subscriptions/unsubscribe`
- `GET /exports/trends.csv`

`GET /exports/trends.xlsx` is a reserved compatibility route and currently
returns `501 Not Implemented`. CSV is the only implemented export contract.

### Access Classes
- `TRENDS_API_TOKEN` is an internal shared secret for collector, WordPress, and export access.
- Desktop-user reads use short-lived signed tokens issued by the
  `issue-trends-access-token` Supabase Edge Function after the existing license
  and HWID check succeeds.
- User tokens must include `aud=trends-api`, `scope=trends:read`, a valid issuer,
  and a non-expired `exp`. They may read only `/api/v1/trends` and
  `/api/v1/trends/meta`.
- All protected non-health endpoints fail closed when neither access class is valid.
- User request limits are keyed by the token's anonymized license subject, not
  by the reverse proxy socket address. IP-level abuse protection belongs at the
  HTTPS reverse proxy.
- The two `/api/v1/public/trends*` routes are a separate, anonymous, read-only
  contract for the public BlogGenius site. They require an allowed `Origin`
  before returning browser-readable CORS responses; this is a browser boundary,
  not authentication, and callers can still request public trend data outside
  a browser. Production allows only `https://www.bloggenius.kr`; Development
  additionally allows loopback origins for local Site Hosting preview.
- Public metadata returns only categories and available dates/range. Public
  trend reads require one date and one to three categories, accept no other
  filters, cap rows at 150, and return no export or ingest capability. Public
  requests have a per-IP, per-minute in-memory limit; this is best-effort
  isolate-level throttling and does not replace Cloudflare edge rate rules if
  traffic warrants stronger abuse controls.
- These public routes deliberately do not authenticate callers. Their trend
  data is treated as public because it is displayed to any site visitor; query
  bounds reduce response size and database work but do not prove a caller is
  the BlogGenius site. The allowed `Origin` check and CORS response only govern
  browser access. Non-browser clients can set or omit `Origin`, so this is not
  an API key, access-control list, or defense against scripts, scraping, or
  distributed requests. Do not put private, licensed, subscriber, or
  otherwise sensitive data behind these routes.
- The current public rate counter lives in Worker isolate memory. It can reset
  when an isolate is restarted and is not shared across isolates or globally
  coordinated. The `cf-connecting-ip` value supports basic per-IP throttling,
  but IP rotation and distributed traffic can evade a per-IP threshold. The
  public route currently allows 60 requests per minute per observed IP; this
  should be treated as a soft guardrail, not a guaranteed account-wide quota
  or cost ceiling.
- Before broad Production use, configure and validate Cloudflare edge-level
  rate limiting for these paths, monitor Worker and Supabase usage, and confirm
  whether the response `Cache-Control` headers are actually honored by the
  deployed cache path. The Worker sends a 60-second public cache hint, but the
  header alone does not guarantee that every Cloudflare path caches the
  response. If stronger caller verification becomes necessary, evaluate a
  server-validated challenge (for example Turnstile) or a deliberate
  authenticated product flow; a secret embedded in static-site JavaScript is
  public and provides no caller authentication.

### Mailing List Signup and Preferences

The public Astro page submits email, one to five selected categories, and an
explicit consent value to the existing Trends Worker. The Worker applies the
site-origin CORS rule, a small body limit, input validation, and a best-effort
per-IP signup throttle before forwarding the request to the dedicated
`trends-mailing-list` Supabase Edge Function. The static page has no database,
Brevo, or Worker-to-function credentials.

The Edge Function accepts calls only with the private
`TRENDS_NEWSLETTER_WORKER_TOKEN` shared between the Worker and Supabase. It
stores the authoritative list in the `mailing.trends_newsletter_subscribers` table. RLS
is enabled and direct access is revoked from `anon` and `authenticated`; only
server-side `service_role` calls can invoke the mailing RPCs. Email addresses
are normalized to lowercase. The row stores the selected category list, the
consent timestamp and copy version, pending/active/unsubscribed status, and
hashed action tokens. Raw confirmation and unsubscribe tokens are sent only in
links and are not stored in the database.

Signup uses double opt-in. New or previously unsubscribed addresses are
recorded as pending and receive a Brevo confirmation email; confirmation links
expire after 48 hours. Only a successful confirmation changes the row to active.
Resubmitting an active address leaves its existing subscription unchanged and
does not reveal list membership in the API response. Category preference
management for active subscribers is not included in this slice. The
confirmation email also includes a link to cancel the pending request. The
static confirmation and unsubscribe pages call
the Worker's corresponding POST route; no token is consumed by a plain GET.

The three mailing routes require an allowed `Origin` and accept only POST and
OPTIONS. This is a browser boundary, not authentication. The Worker forwards to
the Edge Function URL using the server-only shared token. Configure
`TRENDS_NEWSLETTER_FUNCTION_URL` and `TRENDS_NEWSLETTER_WORKER_TOKEN` as Worker
secrets/variables, and set the matching token as a Supabase function secret.
The function also needs its normal Supabase service credentials plus
`BREVO_API_KEY`, `NEWSLETTER_EMAIL_FROM`, `BLOGGENIUS_ENV`, and
`NEWSLETTER_EMAIL_MODE`. The newsletter sender address is independent of the
license email sender setting. In non-production, mail is sent only when mode
is `allowlist` and the address is in
`NEWSLETTER_EMAIL_ALLOWLIST`; production sends only when mode is `live`. There
is no silent development-to-live fallback.

Signup throttling is currently an in-memory Worker-isolate guardrail and can
reset or be bypassed across isolates/IPs. Origin checks do not prevent direct
scripts. Before making the form broadly available, configure Cloudflare edge
rate limiting for all three mailing paths and consider Turnstile or another
server-validated challenge to reduce email bombing. Monitor Brevo send volume.
The Edge Function also enforces the delivery-mode and development allowlist
before sending confirmation mail.

For environment setup order, Supabase's `mailing` exposed-schema requirement,
Brevo IP allowlisting diagnosis, and the verified Development-to-Production
rollout checklist, see [Trends Backend Deployment](trends-backend-deployment.md#newsletter-signup-deployment-and-verification).

This slice implements subscription, confirmation, and unsubscribe state
changes only. The scheduled daily campaign sender, message generation/link
verification, and automatic delivery recovery remain separate work; campaign
queries must select only `status = 'active'`, and every campaign email must
include a standards-compliant unsubscribe action.

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
