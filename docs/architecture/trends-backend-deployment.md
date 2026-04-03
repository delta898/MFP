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
- run `trends-collector` either on that server or from an operator desktop against the server API
- let WordPress PHP call `trends-api` locally when possible, or through a host-reachable address when WordPress itself runs in Docker

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
- It keeps the trends API local to one server, so it does not need to be public just to satisfy WordPress integration.
- It keeps the Supabase secret key on the Node backend only.
- It preserves shared-code reuse with the main desktop app.

## Runtime Topology

### `trends-api`
- Runs as a long-lived local service on the WordPress server.
- Binds to `127.0.0.1` by default for non-Docker WordPress setups.
- Should bind to `0.0.0.0` when WordPress runs in Docker and must reach the host Node service over a bridge/host address.
- Owns Supabase read/write access.
- Serves ingest, metadata, and export endpoints.

Recommended command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/bin/trends-api
```

### `trends-collector`
- Can run on the same server or on an operator desktop.
- Uses Playwright and the shared Naver auth session file.
- Posts collected rows to `trends-api`.
- Should be run by `cron` or `systemd timer`, not as a long-lived daemon, when it is server-hosted.
- Current preferred operational model is desktop-driven collection when the server Playwright/browser environment is not yet fully stabilized.

Recommended command:

```bash
node /home/ubuntu/Project/NaverAutoBlog/bin/trends-collector
```

### WordPress plugin
- Stays in WordPress only.
- Calls `trends-api` from server-side PHP with `wp_remote_get()`.
- Should point to `http://127.0.0.1:4581` only when WordPress itself runs directly on the host.
- When WordPress runs in Docker, it must use a host-reachable address or a reverse-proxied HTTPS URL instead.

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
- `TRENDS_API_HOST=127.0.0.1` for host-only WordPress
- `TRENDS_API_HOST=0.0.0.0` for Docker WordPress that must reach the host service
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

If WordPress runs in Docker, `127.0.0.1` is the container itself, not the host Node service.

In that case use one of:
- a host-reachable bridge/gateway address
- a server private IP
- a reverse-proxied HTTPS URL on the same domain/server

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

## Docker WordPress Networking Notes

If WordPress runs inside Docker while `trends-api` runs on the host:
- `127.0.0.1` inside the container does not reach the host Node process
- `extra_hosts` such as `host.docker.internal:host-gateway` help with name resolution only
- host reachability may still depend on host firewall or `iptables` policy

Observed working pattern:
- run `trends-api` on the host with `TRENDS_API_HOST=0.0.0.0`
- allow Docker bridge traffic to TCP `4581` on the host
- point WordPress at a host-reachable address instead of `127.0.0.1`

Conservative `iptables` rule:

```bash
sudo iptables -I INPUT 1 -i br+ -p tcp --dport 4581 -j ACCEPT
```

Meaning:
- only Docker bridge interfaces
- only TCP port `4581`
- only host INPUT traffic to the API

Useful inspection commands:

```bash
sudo iptables -L INPUT -n --line-numbers
docker network ls
docker network inspect <network-name>
ss -ltnp | grep 4581
```

If broad or temporary rules were added during debugging, remove them after narrowing policy:

```bash
sudo iptables -D INPUT <line-number>
sudo iptables -D FORWARD <line-number>
```

Replace `<line-number>` with the actual number shown by `iptables -L --line-numbers`.

To keep the final rule after reboot on Ubuntu:

```bash
sudo apt update
sudo apt install -y iptables-persistent
sudo netfilter-persistent save
```

Current recommendation:
- if Docker-to-host networking is already working with a narrow `iptables` rule, that is acceptable
- if Docker host reachability keeps being fragile, prefer a reverse-proxied HTTPS URL for WordPress instead of raw bridge/host addresses

## Service Management

### `systemd` for `trends-api`

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
ExecStart=/home/ubuntu/.nvm/versions/node/v24.14.1/bin/node /home/ubuntu/Project/NaverAutoBlog/bin/trends-api
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
- keep `apps/trends/.env` as the runtime source of truth; `trends-api` already reads it directly
- if WordPress in Docker must reach the host API, keep `TRENDS_API_HOST=0.0.0.0`
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
- Do not expose `trends-api` publicly unless there is a specific networking reason.
- Do not treat the collector as part of request/response web traffic.

## Maintenance Note

If deployment assumptions change, update this document together with:
- [trends-backend.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend.md)
- [workspace-layout.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/workspace-layout.md)
- [docs/README.md](/Users/delta898/Project/NaverAutoBlog/docs/README.md)
