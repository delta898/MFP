# Trend Posting Handoff

Updated: 2026-08-12

## Read First

Read [trend-posting-plan.md](./trend-posting-plan.md) before changing code. It is the agreed product, security, and delivery contract.

The branch hierarchy is fixed:

```text
main -> dev -> feature/trend-posting-main -> feature sub branches
```

Do not merge or commit changes automatically. Tell the user when a logical commit is ready, then wait for the user to commit.

## Current Branch And Commit State

Current work branch: `feature/trend-posting-access`

Integration branch: `feature/trend-posting-main`

The integration branch currently contains planning commits only:

- `46ed528 docs: plan trend posting feature`
- `cc609f8 docs: define trend posting branch flow`

The access foundation was committed as:

```text
564a1e5 feat: secure trends read access
```

Follow-up hardening and production-topology documentation are currently being
prepared on the same access branch. Do not merge it into the integration branch
until the Oracle HTTPS endpoint and Edge Function have been validated together.

## Confirmed Production Topology

```text
Mac Studio
  scheduled trends collector
  -> Oracle Cloud trends-api

Oracle Cloud
  trends-api Node systemd service (currently listens on 0.0.0.0:4581)
  public HTTPS hostname: trendapi.hangadac.com
  Caddy Docker container -> host.docker.internal:4581
  WordPress plugin
  -> Supabase trends data

Supabase
  trends database
  license RPCs and Edge Functions
```

The WordPress plugin source is `wordpress/trends-download-ui/trends-download-ui.php`. Its `BG_TRENDS_API_BASE_URL` points to the Oracle Cloud server, confirming that the Oracle trends API is the intended central gateway.

Production HTTPS verification completed on 2026-08-12:

- `https://trendapi.hangadac.com/health` returned HTTP/2 200
- Caddy obtained a valid public certificate
- the Caddy Docker container reaches the host Node service through
  `host.docker.internal:4581`
- an unauthenticated request to `/api/v1/trends/meta` returned HTTP/2 401
- the same metadata endpoint returned HTTP/2 200 with the existing internal
  token and read the production Supabase trend metadata successfully
- the Caddy Compose service maps `host.docker.internal:host-gateway`
- WordPress now uses `https://trendapi.hangadac.com` as
  `BG_TRENDS_API_BASE_URL` while retaining the existing internal token

During the WordPress migration check, a pre-existing preview form defect was
identified: the JavaScript loading state disabled the named `trend_date` input
before the browser serialized the GET form. The selected date was therefore
omitted and the server silently fell back to the latest metadata date. The
plugin now keeps the date control submit-capable while the preview request is
in progress.

The current recommended production hardening is:

- expose the Oracle API through an HTTPS reverse proxy and let endpoint-level
  authorization distinguish user reads from internal operations
- keep port `4581` inaccessible from the public Internet after the proxy works
- preserve `Authorization` through the reverse proxy
- keep ingest and CSV export endpoints internal-token-only even though the
  WordPress plugin and collector reach them through the same HTTPS hostname

## Access Branch Changes

Changed files:

- `supabase/functions/issue-trends-access-token/index.ts`
- `apps/trends/trends-api/src/server.js`
- `apps/trends/trends-api/src/server.test.js`
- `apps/trends/.env.sample`
- `apps/trends/trends-api/README.md`
- `docs/architecture/trends-backend.md`
- `docs/architecture/trends-backend-deployment.md`
- `deno.lock`

Implemented behavior:

1. New Supabase Edge Function `issue-trends-access-token` accepts a license key and HWID.
2. It reuses the existing `check_license_status` RPC with server-side credentials.
3. A valid license receives a 15-minute HS256 token with:
   - `iss=bloggenius-license`
   - `aud=trends-api`
   - `scope=trends:read`
   - hashed license-key subject
   - `iat` and `exp`
4. `trends-api` fails closed for every endpoint except `/health`.
5. `TRENDS_API_TOKEN` authorizes ingest, WordPress, and exports.
6. User read tokens authorize only `GET /api/v1/trends` and `GET /api/v1/trends/meta`.
7. Read tokens are verified for HMAC signature, issuer, audience, scope, and expiry.
8. User-token reads use an in-process per-license-subject fixed-window rate limit, default 120 requests per minute. The reverse proxy owns the separate IP rate limit.

Required deployment secrets, never commit them:

```text
Oracle apps/trends/.env
  TRENDS_API_TOKEN=<internal-only secret>
  TRENDS_READ_TOKEN_SECRET=<shared Edge Function/API secret>

Supabase Edge Function secrets
  TRENDS_READ_TOKEN_SECRET=<same value as Oracle>
  optional TRENDS_READ_TOKEN_ISSUER=bloggenius-license
  optional TRENDS_READ_TOKEN_AUDIENCE=trends-api
  optional TRENDS_READ_TOKEN_TTL_SECONDS=900
```

`TRENDS_API_TOKEN` and `TRENDS_READ_TOKEN_SECRET` must be different values. The desktop app must never contain either secret.

## Validation Already Run

Passed:

```text
node --test apps/trends/trends-api/src/server.test.js
deno check supabase/functions/issue-trends-access-token/index.ts
git diff --check
```

The full `npm run test:unit` ran 387 tests: 386 passed. The only failure was the pre-existing `apps/trends/trends-api/src/server.test.js` HTTP listener test because the local sandbox rejected binding `127.0.0.1` with `EPERM`. The exact same targeted trends API test passed when run with permission to open a local listener.

## Next Work

After the user validates the Oracle HTTPS endpoint, deploys the Edge Function,
and merges the access branch into `feature/trend-posting-main`, continue with
`feature/trend-posting-query`:

1. Add desktop-local trend posting API endpoints.
2. Acquire and cache the short-lived read token through the new Edge Function.
3. Query Oracle `trends-api` over the HTTPS read proxy.
4. Validate multiple categories and today/7-day/custom date ranges.
5. Aggregate normalized duplicate keywords into one display row.
6. Add focused unit tests before UI work.

Do not begin UI implementation until the query response contract is tested and merged into the integration branch.
