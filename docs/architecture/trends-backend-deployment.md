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

The trends backend is not packaged like `BlogGenius.app`.

The current operating model is:
- clone this repository onto the WordPress server at a separate path
- run `trends-api` on that server as a local Node service
- run `trends-collector` on that server on demand or by schedule
- let WordPress PHP call `trends-api` over `127.0.0.1`

Preferred shape:

```text
WordPress server
  /var/www/html/                 # WordPress web root
  /home/ubuntu/Project/NaverAutoBlog/
    apps/trends/
    shared/naver-trends-core/
    bin/
    config/naver_auth.json
```

## Why This Model

- It avoids creating a separate packaging pipeline for the trends runtime too early.
- It keeps WordPress and the Node trends runtime operationally separate while still colocating them on one machine.
- It lets WordPress use `127.0.0.1`, so the trends API does not need to be public.
- It keeps the Supabase secret key on the Node backend only.
- It preserves shared-code reuse with the main desktop app.

## Runtime Topology

### `trends-api`
- Runs as a long-lived local service on the WordPress server.
- Binds to `127.0.0.1` by default.
- Owns Supabase read/write access.
- Serves ingest, metadata, and export endpoints.

Recommended command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/bin/trends-api
```

### `trends-collector`
- Runs on the same server.
- Uses Playwright and the shared Naver auth session file.
- Posts collected rows to `trends-api`.
- Should be run by `cron` or `systemd timer`, not as a long-lived daemon.

Recommended command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/bin/trends-collector
```

### WordPress plugin
- Stays in WordPress only.
- Calls `trends-api` from server-side PHP with `wp_remote_get()`.
- Should point to `http://127.0.0.1:4581` unless a different local bind is intentionally chosen.

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

Install dependencies from the repo root:

```bash
npm ci
```

### Trends environment

Create the shared trends environment file:

```bash
cp /home/ubuntu/Project/NaverAutoBlog/apps/trends/.env.sample /home/ubuntu/Project/NaverAutoBlog/apps/trends/.env
```

Important values:
- `SUPABASE_URL`
- `SUPABASE_SECRET_KEY`
- `TRENDS_NAVER_ID`
- `TRENDS_AUTH_FILE_PATH`
- `TRENDS_API_TOKEN`
- `TRENDS_API_HOST=127.0.0.1`
- `TRENDS_API_PORT=4581`

Recommended auth path on the server:

```env
TRENDS_AUTH_FILE_PATH=/home/ubuntu/Project/NaverAutoBlog/config/naver_auth.json
```

Using an absolute path is preferred in production, even though relative paths are supported.

## WordPress Integration

WordPress should not call Supabase directly.

It should call the local API service:

```php
define('BG_TRENDS_API_BASE_URL', 'http://127.0.0.1:4581');
define('BG_TRENDS_API_TOKEN', '<same-internal-token-if-used>');
```

Expected flow:

```text
WordPress UI
  -> WordPress plugin / shortcode
  -> trends-api (127.0.0.1)
  -> Supabase
```

The collector is not in the WordPress request path.

Its path is separate:

```text
trends-collector
  -> trends-api
  -> Supabase
```

## Service Management

### `systemd` for `trends-api`

Recommended unit file:

```ini
[Unit]
Description=BlogGenius Trends API
After=network.target

[Service]
Type=simple
WorkingDirectory=/home/ubuntu/Project/NaverAutoBlog
ExecStart=/usr/bin/node /home/ubuntu/Project/NaverAutoBlog/bin/trends-api
Restart=always
RestartSec=5
User=ubuntu
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

Recommended commands:

```bash
sudo systemctl daemon-reload
sudo systemctl enable bloggenius-trends-api
sudo systemctl start bloggenius-trends-api
sudo systemctl status bloggenius-trends-api
```

### `cron` for `trends-collector`

Example once-per-day run:

```cron
15 6 * * * cd /home/ubuntu/Project/NaverAutoBlog && /usr/bin/node /home/ubuntu/Project/NaverAutoBlog/bin/trends-collector >> /home/ubuntu/Project/NaverAutoBlog/logs/trends-collector.log 2>&1
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
sudo systemctl restart bloggenius-trends-api
```

If collector behavior changed materially, run one manual collection after update:

```bash
node /home/ubuntu/Project/NaverAutoBlog/bin/trends-collector
```

## Scope Boundaries

- Do not package the trends backend into the desktop app release artifact.
- Do not place Supabase secrets in WordPress PHP code beyond the internal API token.
- Do not expose `trends-api` publicly unless there is a specific networking reason.
- Do not treat the collector as part of request/response web traffic.

## Maintenance Note

If deployment assumptions change, update this document together with:
- [trends-backend.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend.md)
- [workspace-layout.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/workspace-layout.md)
- [docs/README.md](/Users/delta898/Project/NaverAutoBlog/docs/README.md)
