# Trends Backend Deployment

## Purpose
Define the current deployment model for the operator-only trends backend.

This document covers:
- where the trends backend runs
- how WordPress reaches it
- how the collector is scheduled
- how Naver auth is refreshed

This document does not replace the structural contracts in [trends-backend.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend.md). It narrows those contracts into the currently agreed server operation model.

## Current Deployment Model

Development와 Production은 운영 단위를 공유하지 않는다.

### Development

- 배포 단위: `apps/trends/trends-api/deployment/development/`
- API 설정: 같은 폴더의 ignored `.env.trends-api.development`
- 실행: 해당 폴더에서 `docker compose up -d --build`
- host boundary: `4582`, 외부 Caddy 컨테이너가 Development HTTPS hostname을 소유하며
  VCN과 host firewall은 4582의 공인 ingress를 차단
- Collector 설정:
  `apps/trends/trends-collector/config/.env.trends-collector.development`
- Collector 실행:
  `./apps/trends/trends-collector/commands/collect_development.sh`

재배포와 검증의 canonical runbook은
[`apps/trends/trends-api/deployment/development/README.md`](../../apps/trends/trends-api/deployment/development/README.md)이다.

### Production

The trends backend is not packaged like `BlogGenius.app`.

The current operating model is:
- run `trends-api` as a systemd Node service on Oracle Cloud Free Tier
- run `trends-collector` on the operator Mac Studio against the Oracle API
- let the WordPress plugin call the Oracle API with the internal token
- let BlogGenius desktop clients call only the HTTPS read endpoints with
  short-lived licensed-user tokens

Preferred shape:

```text
Oracle Cloud
  /home/ubuntu/Project/NaverAutoBlog/
    apps/trends/
    shared/naver-trends-core/
    bin/

Mac Studio
  trends-collector + Naver auth

WordPress
  trends-download-ui plugin -> Oracle HTTPS API
```

## Why This Model

- It avoids creating a separate packaging pipeline for the trends runtime too early.
- It keeps WordPress and the Node trends runtime operationally separate.
- It gives WordPress and BlogGenius one central, policy-enforcing data gateway.
- It keeps the Supabase secret key on the Node backend only.
- It preserves shared-code reuse with the main desktop app.

## Runtime Topology

### `trends-api`
- Runs as a long-lived service on Oracle Cloud.
- Binds to `0.0.0.0:4581` so the Docker bridge can reach the host service.
- Must not expose port `4581` directly to the public Internet.
- Owns Supabase read/write access.
- Serves ingest, metadata, and export endpoints.

Legacy Production command (Production container 전환 전까지):

```bash
node /home/ubuntu/Project/NaverAutoBlog/apps/trends/trends-api/src/server.js
```

### `trends-collector`
- Runs on the operator Mac Studio in the current topology.
- Uses Playwright and the shared Naver auth session file.
- Posts collected rows to `trends-api`.
- Uses the internal token to call the Oracle ingest endpoint.

Low-level command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/apps/trends/trends-collector/bin/collect.js
```

### WordPress plugin
- Stays in WordPress only.
- Calls Oracle `trends-api` from server-side PHP with `wp_remote_get()`.
- Uses the HTTPS hostname and internal token.
- Never receives a Supabase key or the user-token signing secret.

## Server Setup

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

Configure the same `TRENDS_READ_TOKEN_SECRET`, issuer, and audience in the
Production API operator environment. The secret is shared only between the Edge
Function and `trends-api`; it is never packaged into the desktop app.

BlogGenius desktop clients call only these read endpoints:

```text
GET /api/v1/trends
GET /api/v1/trends/meta
```

The proxy must preserve the `Authorization` header. In the current topology the
collector and WordPress plugin also reach ingest and export routes through the
same HTTPS hostname with `TRENDS_API_TOKEN`. `trends-api` independently rejects
user read tokens on those routes. Source-IP allowlists or a private network can
be added later without changing the desktop token contract.

## WordPress Integration

WordPress should not call Supabase directly.

It should call the Oracle HTTPS API:

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

## Public HTTPS Boundary

The Oracle instance currently has only a public IP. Before desktop integration:

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
GET /exports/trends.xlsx                 # internal token only
```

The collector and WordPress use the same HTTPS hostname with the internal token.
The API authorization layer keeps ingest and export unavailable to user read
tokens. A later hardening step may restrict these routes by source IP or a
separate private hostname.

## Operator Action Checklist

The operator performs these steps once. BlogGenius users never copy or manage a
trends access token.

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
  - `TRENDS_READ_TOKEN_SECRET`: Edge Function signing and Oracle verification
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
  `BG_TRENDS_API_TOKEN` equal to Oracle `TRENDS_API_TOKEN`.
- Verify WordPress preview and CSV download before enabling desktop reads.

Operational status on 2026-08-12:

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

| Value | Oracle | Supabase Edge Function | WordPress | Mac collector | BlogGenius app |
| --- | --- | --- | --- | --- | --- |
| Supabase secret key | yes | platform secret | no | no | no |
| `TRENDS_API_TOKEN` | yes | no | yes | yes | no |
| `TRENDS_READ_TOKEN_SECRET` | yes | yes | no | no | no |
| 15-minute user token | verifies | issues | no | no | memory only |

The user token contains no license key. Its `sub` is a one-way hash used for
per-license request limiting and operational correlation.

## Caddy Configuration

The production hostname is `trendapi.hangadac.com`. Its DNS `A` record must
point to the Oracle public IP before Caddy requests the certificate.

```caddyfile
trendapi.hangadac.com {
    encode zstd gzip

    @trends_routes {
        path /health /api/v1/trends /api/v1/trends/meta /internal/ingest/naver-trends /exports/trends.csv /exports/trends.xlsx
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

## Service Management

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
ExecStart=/home/ubuntu/.nvm/versions/node/v24.14.1/bin/node /home/ubuntu/Project/NaverAutoBlog/apps/trends/trends-api/src/server.js
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

If the collector is hosted on the server, prefer the same absolute Node path discovered with `which node`.

Example once-per-day run:

```cron
15 6 * * * cd /home/ubuntu/Project/NaverAutoBlog && /home/ubuntu/.nvm/versions/node/v24.14.1/bin/node /home/ubuntu/Project/NaverAutoBlog/bin/trends-collector >> /home/ubuntu/Project/NaverAutoBlog/logs/trends-collector.log 2>&1
```

This keeps the collector stateless and easy to retry.

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
node /home/ubuntu/Project/NaverAutoBlog/bin/trends-collector
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
