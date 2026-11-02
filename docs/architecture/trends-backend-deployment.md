# Trends Backend Deployment

## Purpose
Define the current deployment model for the operator-only trends backend.

This document covers:
- where the trends backend runs
- how WordPress reaches it
- how the collector is scheduled
- how Naver auth is refreshed

This document does not replace the structural contracts in [trends-backend.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend.md). It narrows those contracts into the currently agreed server operation model.

## Newsletter Signup Deployment and Verification

The newsletter signup lifecycle runs through the same Trends Worker as the
authenticated trends API, but on separate public paths. The browser calls the
Worker without a Trends API token. The Worker validates the request and uses a
private shared token when it calls the environment-matched Supabase Edge
Function. Keep all settings environment-specific; never point a Development
Worker at Production Supabase or use the Production Brevo allowlist/mode for a
Development test.

| Component | Development | Production |
| --- | --- | --- |
| Website | `https://www-dev.bloggenius.kr` | `https://www.bloggenius.kr` |
| Trends Worker | `https://trendapi-dev.hangadac.com` | `https://trendapi.hangadac.com` |
| Supabase project | `bvtlwjbmjnfphxlrkzhm` | `hocfjolcthvtgfaxjmse` |
| Edge Function | `/functions/v1/trends-mailing-list` in the matching project | Same path in the matching project |
| Email policy | `NEWSLETTER_EMAIL_MODE=allowlist`, plus the test recipient in `NEWSLETTER_EMAIL_ALLOWLIST` | `NEWSLETTER_EMAIL_MODE=live` only after Production approval |

Before enabling the website form in an environment, check these dependencies
in order:

1. **Database:** apply `supabase/migrations/202611020001_trends_mailing_list.sql`
   to the intended Supabase project. The migration creates the private
   `mailing` schema, subscriber table, and RPCs. Expose `mailing` in the
   project's **Integrations → Data API → Settings → Exposed schemas** so
   PostgREST can route RPC requests. Exposing the schema does not grant
   `anon`/`authenticated` table access; the migration revokes direct access
   and grants the RPC execution path to `service_role`.
2. **Edge Function:** deploy `trends-mailing-list` to the same project. Set
   that project's own `TRENDS_NEWSLETTER_WORKER_TOKEN`, Supabase server key,
   `BREVO_API_KEY` (Brevo **API key**, not SMTP key),
   `NEWSLETTER_EMAIL_FROM`, `BLOGGENIUS_ENV`, `NEWSLETTER_EMAIL_MODE`, and
   environment-matched `NEWSLETTER_CONFIRMATION_URL`. Development also needs
   `NEWSLETTER_EMAIL_ALLOWLIST` containing the intended test address.
3. **Brevo network access:** if the Supabase Edge Function sends through a
   Brevo account with IP access restrictions, authorize the current egress
   IP/address shown by Brevo's security failure before retrying. A Brevo
   `401` can be caused by this IP restriction even when the API key is
   correct. Do not rotate a valid API key as the first response to an IP
   verification failure.
4. **Worker:** set `TRENDS_NEWSLETTER_FUNCTION_URL` to the matching project's
   Edge Function URL and set `TRENDS_NEWSLETTER_WORKER_TOKEN` to the same
   random raw token stored in that project's Edge Function secret. Keep the
   shared token private; if exposed, replace it in both locations. Deploy the
   Worker environment after code changes. Setting a secret and deploying site
   assets are separate operations.
5. **Site:** build/deploy the static site with the matching runtime profile.
   Development uses `./run_dev.sh` and the `www-dev` hostname. The form calls
   the Development Worker base URL embedded in the generated HTML.
6. **End-to-end check:** submit an address permitted by the environment's mail
   policy, confirm the email arrives, click the confirmation link and verify
   the row becomes `active`, then use unsubscribe and verify the row becomes
   `unsubscribed`. Check Worker, Edge Function, PostgREST, and Brevo logs by
   timestamp when a step fails. Do not repeatedly submit while an earlier
   request may have created a `pending` row; a new request rotates its action
   tokens.

### Failure signatures observed during Development validation

- Supabase RPC returns `406` with PostgREST `PGRST106` for
  `/rest/v1/rpc/request_trends_subscription`: `mailing` is not in the project's
  exposed Data API schemas. Add it under Integrations → Data API → Settings;
  reapplying the migration or redeploying the Function does not fix this
  project-level API setting.
- RPC returns `200`, followed by Function log
  `TRENDS_MAILING_LIST_FAILED brevo_http_401`: the database path is working;
  inspect Brevo API-key validity, sender configuration, and IP access controls.
  In the validated incident, allowing the new egress IP fixed delivery; the
  API key itself was valid.
- Function invocation returns `401 unauthorized`: the private Worker token
  did not pass the Edge Function's shared-token check. Use the raw matching
  token in `Authorization: Bearer …`; hashing it locally can compare two
  candidate values, but sending a digest does not authenticate unless that
  digest itself is what both environments store. Rotate any token pasted into
  chat or logs.
- The site displays “구독 기능을 일시적으로 사용할 수 없습니다.”: inspect
  the Dev Worker log. `newsletter integration is not configured` points to a
  missing/invalid Worker Function URL or token; `newsletter backend rejected
  request` includes the Edge Function HTTP status and directs the next check
  to Supabase Function logs.

Development end-to-end validation completed on 2026-11-02 (Asia/Seoul): the
site signup sent a Brevo confirmation email, the confirmation link changed the
subscriber row to active, and unsubscribe updated the row. Production rollout
has not been performed. Daily campaign generation and scheduled bulk delivery
are outside this verified lifecycle slice.

## Current Deployment Model

The existing Node/Docker runtime is preserved under
`apps/trends/trends-api/docker/` as an Oracle rollback option. The active API
runtime is the Cloudflare Workers implementation under
`apps/trends/trends-api/workers/`. Development uses
`trendapi-dev.hangadac.com`; Production uses `trendapi.hangadac.com`. Both are
Cloudflare Custom Domains with Cloudflare-managed DNS and TLS. See the Workers
[deployment guide](../../apps/trends/trends-api/workers/README.md).

The Development Worker uses the Cloudflare Custom Domain
`trendapi-dev.hangadac.com`. Cloudflare manages its DNS record and TLS
certificate, with all paths on that hostname routed to the Worker. The previous
Oracle DNS record and redundant `trendapi-dev.hangadac.com/*` Worker Route were
removed during migration.

Development와 Production은 운영 단위를 공유하지 않는다.

### Development

- Active API: `bloggenius-trends-api` Worker at `trendapi-dev.hangadac.com`
- Legacy Development Docker fallback: `apps/trends/trends-api/docker/deployment/development/`
  - API config: ignored `.env.trends-api.development` in that directory
  - Start with `docker compose up -d --build`
  - Host port `4582` is restricted to the external Caddy container; VCN and host
    firewall rules block public ingress
- Collector 설정:
  `apps/trends/trends-collector/config/.env.trends-collector.development`
- Collector 실행:
  `./apps/trends/trends-collector/commands/collect_development.sh`

Development Docker fallback runbook은
[`apps/trends/trends-api/docker/deployment/development/README.md`](../../apps/trends/trends-api/docker/deployment/development/README.md)이다.

### Production

The trends backend is not packaged like `BlogGenius.app`.

2026-09-30부터 Production API 트래픽은 Cloudflare의
`bloggenius-trends-api-production` Worker가 처리한다. 기존 Oracle Production
컨테이너(`4583`)와 systemd Node 서비스(`4581`)는 전환 안정화 기간 동안 rollback
경로로 유지한다.

The current operating model is:
- run `trends-api` on Cloudflare Workers for Development and Production
- keep the Oracle Docker and systemd deployments available for rollback
- run `trends-collector` on the operator Mac Studio against the API hostname
- let the WordPress plugin call the same API hostname with the internal token
- let BlogGenius desktop clients call only the HTTPS read endpoints with
  short-lived licensed-user tokens

Production `/health` and unauthenticated-read checks passed through the
Cloudflare Edge, and authenticated metadata succeeded through the Production
`workers.dev` hostname before cutover. The Production collector's first live
ingest through the Custom Domain remains the operator's next validation; keep
the Oracle deployment available for rollback until that succeeds.

The earlier Oracle systemd-to-container migration used a blue/green switch from
host `4581` to `4583`. Its legacy rollback procedure is documented in the
[`Oracle Production runbook`](../../apps/trends/trends-api/docker/deployment/production/README.md).

Preferred shape:

```text
Cloudflare Workers
  trendapi-dev.hangadac.com -> Development Worker
  trendapi.hangadac.com     -> Production Worker

Mac Studio
  trends-collector + Naver auth

WordPress
  trends-download-ui plugin -> Production HTTPS API
```

## Why This Model

- It removes the API runtime from the resource-constrained Oracle instance.
- It gives the collector, WordPress, and BlogGenius one policy-enforcing API gateway.
- It keeps the Supabase secret key in the Worker secret store, outside clients.
- It preserves shared-code reuse with the main desktop app.

## Runtime Topology

### `trends-api`
- Active runtime: Cloudflare Worker with separate Development and Production environments.
- Oracle Docker/systemd services are retained as rollback targets during stabilization.
- The Worker owns Supabase read/write access and serves ingest, metadata, and export endpoints.

Legacy Oracle container details:
- Runs as a long-lived hardened container on Oracle Cloud.
- Binds container `4581` to host `4583` for the external Caddy reverse proxy.
- Must not expose host port `4583` directly to the public Internet.

Legacy Production rollback command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/apps/trends/trends-api/docker/src/server.js
```

Production 컨테이너는 내부 `4581`, host `4583`을 사용한다. Production Supabase가 알려진
Development Supabase와 같으면 runtime guard가 시작을 거부한다.

### `trends-collector`
- Runs on the operator Mac Studio in the current topology.
- Uses Playwright and the shared Naver auth session file.
- Posts collected rows to `trends-api`.
- Uses the internal token to call the Production API hostname, currently served by Cloudflare Workers.

Low-level command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/apps/trends/trends-collector/bin/collect.js
```

Canonical operator commands:

```bash
./apps/trends/trends-collector/commands/collect_local.sh
./apps/trends/trends-collector/commands/collect_development.sh
./apps/trends/trends-collector/commands/collect_production.sh --dry-run
```

Production command를 인자 없이 실행하거나 `--date`만 지정하면 payload를 한 번 수집해 날짜와
건수를 보여준 뒤, TTY에서 정확히 `PRODUCTION`을 입력한 경우에만 확인한 동일 payload를
upsert한다. `--dry-run`은 항상 무변경으로 끝나며, 비대화형 자동화는
`--confirm-production`을 명시해야 한다. 두 옵션은 함께 사용할 수 없다.

### WordPress plugin
- Stays in WordPress only.
- Calls the Production `trends-api` hostname from server-side PHP with `wp_remote_get()`.
- Uses the HTTPS hostname and internal token.
- Never receives a Supabase key or the user-token signing secret.

## Legacy Oracle Server Setup (Rollback Only)

### Repository

Clone the repository to a non-webroot server path.

Example:

```bash
git clone <repo-url> /home/ubuntu/Project/NaverAutoBlog
cd /home/ubuntu/Project/NaverAutoBlog
```

### Node runtime

Use Node 24 or newer.

The current recommended install path on Ubuntu is `nvm`, not the distro `apt` package for `nodejs`/`npm`.

Example:

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
source ~/.bashrc
nvm install 24
nvm alias default 24
nvm use 24
```

Install dependencies from the repo root:

```bash
npm ci
```

### Trends environment

Production 전용 API operator environment를 저장소 밖(예:
`/etc/bloggenius/trends-api.production.env`)에 준비한다. Development API 또는 Collector 파일을
복사하거나 공유하지 않는다. Production 배포 단위의 최종 컨테이너 전환은 별도 승인 범위다.

Important values:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TRENDS_NAVER_ID`
- `TRENDS_AUTH_FILE_PATH`
- `TRENDS_API_TOKEN`
- `TRENDS_READ_TOKEN_SECRET`
- `TRENDS_API_HOST=0.0.0.0` because Caddy runs in Docker
- `TRENDS_API_PORT=4581`

Recommended auth path on the server:

```env
TRENDS_AUTH_FILE_PATH=/home/ubuntu/Project/NaverAutoBlog/config/naver_auth.json
```

Using an absolute path is preferred in production, even though relative paths are supported.

### Desktop User Read Access

The desktop app must not receive `TRENDS_API_TOKEN`, `SUPABASE_SECRET_KEY`, or
any other long-lived backend secret.

Deploy the `issue-trends-access-token` Supabase Edge Function in the license
project. Configure these function secrets:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `TRENDS_READ_TOKEN_SECRET`
- optional `TRENDS_READ_TOKEN_ISSUER=bloggenius-license`
- optional `TRENDS_READ_TOKEN_AUDIENCE=trends-api`
- optional `TRENDS_READ_TOKEN_TTL_SECONDS=900`

Configure the matching `TRENDS_READ_TOKEN_SECRET`, issuer, and audience as
Production Worker settings/secrets. The signing secret is shared only between
the Edge Function and `trends-api`; it is never packaged into the desktop app.

BlogGenius desktop clients call only these read endpoints:

```text
GET /api/v1/trends
GET /api/v1/trends/meta
```

The gateway must preserve the `Authorization` header. In the current topology the
collector and WordPress plugin also reach ingest and export routes through the
same HTTPS hostname with `TRENDS_API_TOKEN`. `trends-api` independently rejects
user read tokens on those routes. Source-IP allowlists or a private network can
be added later without changing the desktop token contract.

## WordPress Integration

WordPress should not call Supabase directly.

It should call the Production HTTPS API hostname:

```php
define('BG_TRENDS_API_BASE_URL', 'https://trendapi.hangadac.com');
define('BG_TRENDS_API_TOKEN', '<same-internal-token>');
```

Expected flow:

```text
WordPress UI
  -> WordPress plugin / shortcode
  -> trends-api
  -> Supabase
```

The collector is not in the WordPress request path.

Its path is separate:

```text
trends-collector
  -> trends-api
  -> Supabase
```

## Legacy Oracle HTTPS Boundary (Rollback Only)

The following describes the previous Oracle/Caddy gateway and is retained for
rollback. It is not the active public API path.

1. Point the `trendapi.hangadac.com` DNS `A` record to the Oracle public IP.
2. Open TCP 80 and 443 in the Oracle VCN security rules and host firewall.
3. Install an HTTPS reverse proxy with automatic certificate renewal.
4. Proxy the approved routes to `host.docker.internal:4581` and preserve the
   `Authorization` header.
5. Apply an IP-based request limit at the proxy. The Node API separately limits
   licensed users by token subject.
6. Keep `TRENDS_API_HOST=0.0.0.0` for Docker bridge access, but remove Oracle
   public ingress to TCP 4581 after HTTPS verification succeeds.

Proxied routes in the first operational phase:

```text
GET /health
GET /api/v1/trends
GET /api/v1/trends/meta
POST /internal/ingest/naver-trends       # internal token only
GET /exports/trends.csv                  # internal token only
```

`/exports/trends.xlsx` is not proxied because the API currently reserves that
path with `501 Not Implemented`; the WordPress integration uses CSV.

The collector and WordPress use the same HTTPS hostname with the internal token.
The API authorization layer keeps ingest and export unavailable to user read
tokens. A later hardening step may restrict these routes by source IP or a
separate private hostname.

## Historical Oracle Gateway Checklist

This checklist records the earlier Oracle gateway setup. Current Worker setup
is documented in the [Workers deployment guide](../../apps/trends/trends-api/workers/README.md).
BlogGenius users never copy or manage a trends access token.

### Phase 1: hostname and HTTPS

- Use the dedicated hostname `trendapi.hangadac.com`.
- Add a DNS `A` record pointing that hostname to the Oracle public IP.
- Allow inbound TCP 80 and 443 in both Oracle VCN rules and the instance
  firewall.
- Install Caddy as the HTTPS reverse proxy. The public fully qualified domain
  name `trendapi.hangadac.com` lets Caddy obtain and renew the certificate
  automatically.
- Confirm `https://<hostname>/health` returns the trends API health response.
- Add `host.docker.internal:host-gateway` to the Caddy container and proxy to
  `host.docker.internal:4581`.
- Keep Node on `0.0.0.0:4581`, remove public ingress for 4581, and allow only
  the Docker bridge path to reach the host port.

### Phase 2: secrets and token issuer

- Generate two different high-entropy values:
  - `TRENDS_API_TOKEN`: collector and WordPress internal operations
  - `TRENDS_READ_TOKEN_SECRET`: Edge Function signing and API verification
- Put both values in the Production API operator environment.
- Put only `TRENDS_READ_TOKEN_SECRET` in the Supabase Edge Function secrets.
- Deploy `issue-trends-access-token` in the same Supabase project that owns the
  license RPC.
- Restart `trends-api` and verify that missing or invalid authorization receives
  `401`.

### Phase 3: existing clients

- Change the Mac Studio collector base URL to the HTTPS hostname; keep its
  existing internal token.
- Change `BG_TRENDS_API_BASE_URL` in WordPress to the HTTPS hostname; keep
  `BG_TRENDS_API_TOKEN` equal to the API's `TRENDS_API_TOKEN`.
- Verify WordPress preview and CSV download before enabling desktop reads.

Historical Oracle gateway status on 2026-08-12:

- WordPress was changed from the Docker host gateway URL to
  `https://trendapi.hangadac.com`.
- Caddy continues to proxy through `host.docker.internal:4581`, with the
  Compose `host-gateway` mapping in place.
- Metadata authentication and retrieval were verified through the HTTPS
  hostname.
- `issue-trends-access-token` was deployed to the production license project.
- A real active BlogGenius license successfully received a short-lived token
  and used it through the Oracle HTTPS gateway for both metadata and keyword
  reads.
- The local app API returned 20 aggregated `맛집` keywords for `2026-08-11`.
- If a user read token receives `401`, compare SHA-256 digests of
  `TRENDS_READ_TOKEN_SECRET` in Supabase and Oracle before inspecting claims;
  never print or paste the secret into logs.
- WordPress preview validation must confirm that the selected `trend_date`
  remains in the GET query string; named controls must not be disabled before
  the browser serializes the form.

### Phase 4: BlogGenius integration

- The app requests a user token with its existing license key and HWID.
- The app stores the token in memory only and refreshes it near expiry.
- The app calls only `/api/v1/trends` and `/api/v1/trends/meta` with that token.
- Validate active, expired, and invalid license cases before merging the access
  branch.

## Secret Ownership

| Value | Cloudflare Worker | Supabase Edge Function | WordPress | Mac collector | BlogGenius app |
| --- | --- | --- | --- | --- | --- |
| Supabase secret key | yes | platform secret | no | no | no |
| `TRENDS_API_TOKEN` | yes | no | yes | yes | no |
| `TRENDS_READ_TOKEN_SECRET` | yes | yes | no | no | no |
| 15-minute user token | verifies | issues | no | no | memory only |

The user token contains no license key. Its `sub` is a one-way hash used for
per-license request limiting and operational correlation.

## Legacy Caddy Configuration (Rollback Only)

The production hostname is `trendapi.hangadac.com`. Its DNS `A` record must
point to the Oracle public IP before Caddy requests the certificate.

```caddyfile
trendapi.hangadac.com {
    encode zstd gzip

    @trends_routes {
        path /health /api/v1/trends /api/v1/trends/meta /internal/ingest/naver-trends /exports/trends.csv
    }

    handle @trends_routes {
        reverse_proxy host.docker.internal:4581
    }

    handle {
        respond "Not found" 404
    }

    log {
        output file /var/log/caddy/trendapi-access.log {
            roll_size 20MiB
            roll_keep 5
        }
        format json
    }
}
```

Caddy preserves the incoming `Authorization` header for `reverse_proxy` by
default. Do not copy either trends secret into the Caddyfile. Node remains the
authorization boundary for internal and user tokens.

The Caddy container must map the Linux host gateway. For Docker Compose:

```yaml
services:
  caddy:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

Recreate the Caddy service after changing `extra_hosts`; a configuration reload
alone does not update the container's `/etc/hosts` mapping.

The stock Caddy package does not provide a standard `rate_limit` directive. The
Node API therefore enforces the required per-license limit. Add proxy-level IP
rate limiting only through a deliberately selected Caddy module or an upstream
firewall/CDN; do not paste an unsupported directive into the base Caddyfile.

Validate and reload after editing:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl reload caddy
sudo systemctl status caddy
```

Keep `TRENDS_API_HOST=0.0.0.0` because the Caddy container reaches the host
through the Docker bridge. After HTTPS health verification succeeds, remove
public ingress for TCP 4581 while retaining Docker bridge access.

## Legacy Oracle Service Management (Rollback Only)

### `systemd` for Oracle `trends-api`

When Node is installed with `nvm`, `systemd` does not automatically inherit the interactive shell environment.

Before writing the unit, resolve the real Node path:

```bash
which node
```

Example output:

```bash
/home/ubuntu/.nvm/versions/node/v24.14.1/bin/node
```

Use that absolute path in `ExecStart`.

Recommended unit file:

```ini
# /etc/systemd/system/trends-api.service
[Unit]
Description=BlogGenius Trends API
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=ubuntu
Group=ubuntu
WorkingDirectory=/home/ubuntu/Project/NaverAutoBlog
Environment=HOME=/home/ubuntu
EnvironmentFile=/etc/bloggenius/trends-api.production.env
ExecStart=/home/ubuntu/.nvm/versions/node/v24.14.1/bin/node /home/ubuntu/Project/NaverAutoBlog/apps/trends/trends-api/docker/src/server.js
Restart=always
RestartSec=3
KillSignal=SIGINT

[Install]
WantedBy=multi-user.target
```

Recommended commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now trends-api
sudo systemctl status trends-api
journalctl -u trends-api -f
```

Operational notes:
- keep a Production-only operator environment file as the runtime source of truth; never reuse the
  Development API environment file
- keep `TRENDS_API_HOST=0.0.0.0` while Caddy runs in Docker; protect 4581 at the
  Oracle ingress and host firewall boundaries
- if the Node version changes under `nvm`, update the `ExecStart` path in the unit file and reload `systemd`
- manual restart after deploy:

```bash
sudo systemctl restart trends-api
```

### `cron` for `trends-collector`

Production 자동화는 아직 등록하지 않았다. cron 또는 systemd timer를 도입할 때는 interactive
prompt 대신 `--confirm-production`을 명시하고, 중복 실행 lock·실패 알림·재시도 정책을 함께
설계해야 한다. 옵션 없이 비대화형으로 실행하면 Collector는 수집 전에 실패한다.

If the collector is hosted on the server, prefer the same absolute Node path discovered with `which node`.

Example once-per-day run:

```cron
15 6 * * * cd /home/ubuntu/Project/NaverAutoBlog && ./apps/trends/trends-collector/commands/collect_production.sh --confirm-production >> /home/ubuntu/Project/NaverAutoBlog/logs/trends-collector.log 2>&1
```

이 예시는 승인 계약을 보여주기 위한 형태이며 lock·알림·재시도 설계 전에는 그대로 등록하지
않는다.

## Naver Auth Refresh Model

Naver auth is expected to expire eventually.

The current agreed model is:
- refresh auth from the operator desktop environment
- copy the refreshed `naver_auth.json` to the server
- let the server-side collector reuse that file

Recommended flow:

```text
Desktop login refresh
  -> new config/naver_auth.json
  -> scp / rsync to server
  -> next scheduled collector run reuses refreshed session
```

This is preferred over trying to solve login refresh directly on the headless server in the first phase.

### Suggested sync examples

```bash
scp /Users/delta898/Project/NaverAutoBlog/config/naver_auth.json ubuntu@<server>:/home/ubuntu/Project/NaverAutoBlog/config/naver_auth.json
```

```bash
rsync -av /Users/delta898/Project/NaverAutoBlog/config/naver_auth.json ubuntu@<server>:/home/ubuntu/Project/NaverAutoBlog/config/naver_auth.json
```

## Update Workflow

Recommended update flow on the server:

```bash
cd /home/ubuntu/Project/NaverAutoBlog
git pull
npm ci
sudo systemctl restart trends-api
```

If collector behavior changed materially, run one manual collection after update:

```bash
./apps/trends/trends-collector/commands/collect_production.sh --dry-run
```

## Scope Boundaries

- Do not package the trends backend into the desktop app release artifact.
- Do not place Supabase secrets in WordPress PHP code beyond the internal API token.
- Expose only the HTTPS reverse proxy; never expose the Node port directly.
- Do not treat the collector as part of request/response web traffic.

## Maintenance Note

If deployment assumptions change, update this document together with:
- [trends-backend.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend.md)
- [workspace-layout.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/workspace-layout.md)
- [docs/README.md](/Users/delta898/Project/NaverAutoBlog/docs/README.md)
