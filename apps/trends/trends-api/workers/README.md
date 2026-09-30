# Trends API on Cloudflare Workers

This is a separate implementation of the existing Trends API contract. The
Docker implementation remains under `../docker/` as an Oracle rollback path.
The Cloudflare Workers are now the active API endpoints; the public hostnames
used by WordPress, the collector, and desktop clients remain unchanged.

| Environment | Worker | API hostname | `workers.dev` fallback |
| --- | --- | --- | --- |
| Development | `bloggenius-trends-api` | `trendapi-dev.hangadac.com` | `bloggenius-trends-api.delta898.workers.dev` |
| Production | `bloggenius-trends-api-production` | `trendapi.hangadac.com` | `bloggenius-trends-api-production.delta898.workers.dev` |

Cloudflare Custom Domains own DNS and TLS for the API hostnames. Each hostname
routes all paths to its Worker. The Production Oracle Docker service remains
available during the stabilization period; do not decommission it until
Production collection and client reads have been verified.

## Local development

Install the Wrangler CLI dependency and run the Worker locally:

```bash
cd apps/trends/trends-api/workers
npm install
npm run dev
```

Create an ignored `.dev.vars` file with Development-only values:

```dotenv
SUPABASE_URL=https://<development-project>.supabase.co
SUPABASE_SECRET_KEY=<development-server-secret>
TRENDS_API_TOKEN=<development-internal-token>
TRENDS_READ_TOKEN_SECRET=<development-read-token-secret>
```

The local Worker is served by Wrangler on `http://localhost:8787`. It exposes
the same routes as the Docker API.

## Deploy

Authenticate Wrangler once with the Cloudflare account that owns the Worker:

```bash
npx wrangler login
```

First deploy the Development Worker. This creates its `workers.dev` endpoint;
until secrets are configured, only `/health` is useful and protected routes
fail closed:

```bash
npm run deploy:development
```

Then set each Development secret:

```bash
npm run secret:development -- SUPABASE_URL
npm run secret:development -- SUPABASE_SECRET_KEY
npm run secret:development -- TRENDS_API_TOKEN
npm run secret:development -- TRENDS_READ_TOKEN_SECRET
```

Wrangler prompts for each value. `secret put` immediately creates and deploys a
Worker version, so each command publishes a version; enter only Development
values here. Production uses the matching `--env production` configuration and
independent secrets:

```bash
npm run secret:production -- SUPABASE_URL
npm run secret:production -- SUPABASE_SECRET_KEY
npm run secret:production -- TRENDS_API_TOKEN
npm run secret:production -- TRENDS_READ_TOKEN_SECRET
npm run deploy:production
```

These commands create or update each Worker's `workers.dev` endpoint and its
Custom Domain. Cloudflare provisions DNS and TLS for the Custom Domain and can
replace an existing A record; remove a conflicting CNAME first. After
migrating a hostname from a Worker Route, remove the old `hostname/*` route in
the dashboard. The Custom Domain already sends every path to the Worker, so the
old route is redundant. Keep Development and Production secrets separate.

For rollback, remove the Production Custom Domain and restore the saved Oracle
DNS record for `trendapi.hangadac.com`; keep the Oracle API available until the
Worker-backed Production API has passed read and ingest validation.

The Development Worker should show exactly two domains in Workers & Pages:
its `workers.dev` address and the `trendapi-dev.hangadac.com` Custom Domain.
Delete a stale `trendapi-dev.hangadac.com/*` entry under **Routes**, if present;
do not delete the Custom Domain. Production should similarly show its own
`workers.dev` address and `trendapi.hangadac.com` Custom Domain.

## Validation and rollback

Check each environment without exposing a token:

```bash
curl -i https://trendapi-dev.hangadac.com/health
curl -i https://trendapi.hangadac.com/health
curl -i https://trendapi.hangadac.com/api/v1/trends/meta
```

Expected results are `200` with the matching environment from `/health`, and
`401 Unauthorized` from the unauthenticated metadata request. For an
authenticated metadata check, use that environment's internal token locally;
never paste a secret into chat or commit it. The Production authenticated read
has passed through `workers.dev`. The Production ingest path writes to live
Supabase and should be verified by the operator's normal collector run.

After a DNS cutover, a local resolver may continue using the old Oracle address
until its cache expires. Compare `dig +short trendapi.hangadac.com A` with
`dscacheutil -q host -a name trendapi.hangadac.com`; on macOS, clear the resolver
cache with `sudo dscacheutil -flushcache` and `sudo killall -HUP mDNSResponder`.
An ordinary request that still shows Caddy does not prove the Custom Domain
failed if the local resolver still returns the old Oracle IP.

If rollback is needed, keep the Oracle service running, remove the Production
Custom Domain from the Worker, and restore the saved pre-cutover Oracle DNS
record for `trendapi.hangadac.com`. Then check `/health` and authenticated
metadata before directing clients back to the Oracle service. The WordPress and
collector URLs do not need to change because the hostname is preserved.

## Routes and access

- `GET /health`: unauthenticated health and runtime environment.
- `POST /internal/ingest/naver-trends`: internal bearer token and matching
  `X-Trends-Environment` required.
- `GET /api/v1/trends` and `/api/v1/trends/meta`: internal bearer token or a
  licensed short-lived `trends:read` JWT.
- `GET /exports/trends.csv`: internal bearer token only.
- `GET /exports/trends.xlsx`: reserved `501` response, internal bearer only.

Secrets are Wrangler secrets and must not be placed in `wrangler.toml`. Use
distinct Development and Production values. Set each Worker's
`TRENDS_READ_TOKEN_SECRET` to the exact matching secret in that environment's
`issue-trends-access-token` Supabase Edge Function. Keep `TRENDS_API_TOKEN` in
sync with the corresponding collector and WordPress integration. The Supabase
server key must never be sent to clients.

## Runtime notes

The Worker uses Web Crypto for HS256 verification and PostgREST/RPC over `fetch`;
it does not bundle Node or Docker. Metadata caching and per-license rate windows
are isolate-local, matching the prior process-local approach but not providing a
globally shared limit/cache across Cloudflare isolates. If global enforcement is
required, add an explicitly selected Cloudflare coordination primitive before
relying on this Worker as the Production gateway.

The Cloudflare Free plan also has a per-invocation CPU limit. The API is mostly
network I/O, but validate representative request and payload sizes against the
current [Workers pricing limits](https://developers.cloudflare.com/workers/platform/pricing/)
before decommissioning the Oracle rollback service.
