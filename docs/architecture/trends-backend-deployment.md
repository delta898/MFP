# Trends Backend Deployment

## Purpose
Define the current deployment model for the operator-only trends backend.

This document covers:
- where the trends backend runs
- how WordPress reaches it
- how the collector is scheduled
- how Naver auth is refreshed

This document does not replace the structural contracts in [trends-backend.md](/Users/delta898/Project/NaverAutoBlog/docs/architecture/trends-backend.md). It narrows those contracts into the currently agreed server operation model.

## Newsletter Deployment and Environment Promotion

### Development-first deployment pairing

Development is the reference deployment path. A push to dev runs the
validated sequence in .github/workflows/environment-validation.yml: build the
shared release inputs, preview and apply database migrations through the
Development Session Pooler, deploy the mailing Edge Function when applicable,
validate the newsletter Function, both Workers, and the site artifact before
the first Development mutation, then apply migrations and deploy the Function,
Newsletter Worker, API Worker, and site Worker from the same revision. Manual
Development drift checks preview migrations and remain read-only. A separate
manual Development workflow manages the site Worker and its domain; it does
not replace that full release path.

Production follows the same component order and targets the corresponding
Production resources in .github/workflows/deploy-trends-web-production.yml.
A push to `release/*` runs the Production build and deployment automatically;
that push is the user's deployment approval. The workflow disables Production
subscriber delivery while deploying, sends one fixed-recipient administrator
canary, and enables live delivery only after that canary succeeds. The existing
newsletter Workflow sends the Telegram run summary; GitHub Actions does not
send a duplicate Telegram message. Site-domain cutover and emergency disable
remain separate manual operations. Those controls do not change the three
Worker component pairing:

| Component | Development | Production |
| --- | --- | --- |
| Trends API Worker | bloggenius-trends-api-dev | bloggenius-trends-api-production |
| Newsletter Workflow Worker | bloggenius-trends-newsletter-dev | bloggenius-trends-newsletter-production |
| Static site Worker | www-bloggenius-kr-dev | www-bloggenius-kr-production |

The mailing Edge Function and Supabase database are supporting release
resources for the newsletter component, not additional Workers. Do not use a
Development run as proof that Production credentials, DNS, or target ownership
are correct; it verifies the same code and sequence against Development's
separate configuration.
Every push to either integration branch deploys the complete matching stack,
including API, newsletter, and site Workers, then runs the same canary and
live-mode transition. This keeps the tested Development sequence paired with
Production.

Development is the verified environment for the newsletter lifecycle. Keep the
following roles distinct when operating it or preparing a Production rollout:

| Role | Development | Production | Responsibility |
| --- | --- | --- | --- |
| Website | `https://www-dev.bloggenius.kr` | `https://www.bloggenius.kr` | Shared static site with environment-specific Trends API and subscription actions |
| Trends API Worker | `bloggenius-trends-api-dev` at `trendapi-dev.bloggenius.kr` | `bloggenius-trends-api-production` at `trendapi.hangadac.com` and `trendapi.bloggenius.kr` | Authenticated collector ingestion and trend reads; public browser subscription actions forwarded to the matching Supabase Edge Function; accepts private collection-complete signals and starts the Newsletter Workflow |
| Newsletter Workflow Worker | `bloggenius-trends-newsletter-dev` | `bloggenius-trends-newsletter-production` | Private Workflow entry point; checks collection, creates editions, sends subscriber batches only in the enabled Production mode, and runs isolated administrator canaries |
| Supabase project | `bvtlwjbmjnfphxlrkzhm` | `hocfjolcthvtgfaxjmse` | Mailing data, RPCs, and `trends-mailing-list` Edge Function |

The browser calls the environment's Trends API hostname. The API Worker
validates the public request and forwards it to that environment's private
Supabase Edge Function with a shared bearer token. Its
`TRENDS_NEWSLETTER_COLLECTION_WORKFLOW` binding is only for authenticated
collection-complete signals; it does not route browser requests to the
Newsletter Workflow Worker. Keep every URL, credential, database, sender
policy, and domain environment-specific.

The Development API Worker uses the base (unnamed) Wrangler environment,
deployed with `--env=""`. Cloudflare's dashboard labels that base environment
“Production”; the Worker service name and its Development variables identify
the actual application environment. Production API configuration is the
explicit `[env.production]` section and is deployed with `--env production`.

### Configuration ownership

| Setting | Trends API Worker | Newsletter Workflow Worker | Supabase Edge Function |
| --- | --- | --- | --- |
| Function URL | `TRENDS_NEWSLETTER_FUNCTION_URL` as a plain `wrangler.toml` variable, matching the project's Function URL | Not used for subscription; the delivery adapter has its own configured Supabase target | N/A |
| Shared token | `TRENDS_NEWSLETTER_WORKER_TOKEN` secret for signup, confirmation, and unsubscribe forwarding | Same environment's token secret for `deliver_batch` calls | Same environment's `TRENDS_NEWSLETTER_WORKER_TOKEN` secret for authentication |
| Canary trigger token | `TRENDS_NEWSLETTER_CANARY_TOKEN` protects private canary/status routes in both environments | Not used | Not used |
| Project/runtime marker | `TRENDS_ENV` | `BLOGGENIUS_ENV` and `SUPABASE_PROJECT_REF` | `BLOGGENIUS_ENV`, `SUPABASE_URL`, and server-side key |
| Email policy | N/A | `NEWSLETTER_EMAIL_MODE` selects send behavior | Both environments set mode to `disabled` during deployment, send one canary to the fixed administrator address, and enter `live` only after success. |

Use one randomly generated raw token per environment and store it in that
environment's API Worker, Newsletter Workflow Worker, and Edge Function. The
Development token must differ from the Production token. Never put tokens,
Supabase keys, or Brevo keys in `wrangler.toml`, site build variables, Git, or
chat. `TRENDS_NEWSLETTER_FUNCTION_URL` is not a secret: declare it in the
matching `[vars]` section so a Wrangler deployment preserves it. It will not
appear in `wrangler secret list`.

Local GitHub secret setup and the environment-specific input names are
documented in [GitHub Environment Secret Sync](../../scripts/secrets/README.md).
The Development push workflow installs the newsletter Edge Function secrets
with Supabase CLI and the Newsletter Worker secrets with Wrangler before
deploying their code. The local utility only updates GitHub Environment
secrets; it never writes directly to Cloudflare or Supabase. Production secret
sync only updates GitHub Environment secrets. A later push to `release/*`
starts the Production build, deployment, canary, and live-mode transition;
secret sync itself never deploys.

Development database migrations use `SUPABASE_DB_POOLER_URL` from the
Development project's Session Pooler (port 5432), matching Production's
connection method for migration preview, apply, and migration-state reads.
Supabase Function API calls continue to use the explicit Development project
ref. The development secret sync validates that the pooler URL belongs to the
Development project. The `development` GitHub Environment is created
or reconciled to allow only the `dev` branch. Development site deploy,
hostname cutover, and rollback are separate operations in
`.github/workflows/deploy-trends-web-development.yml`; a branch-check job runs
before any job receives Development Environment credentials, and the deploy
script independently rejects refs other than `dev`.

### Production Trends promotion

The Production web experience shares the Development Astro source but receives
explicit Production build values. Both site builds read the environment-scoped
`BLOGGENIUS_TRENDS_API_URL` GitHub variable; the sync utility validates the
Development and Production canonical hostnames before writing them. The
tag-triggered app release build reads the same Production Environment
variable. `.github/workflows/deploy-trends-web-production.yml` is triggered by pushes to
`release/*`; a manual dispatch remains available for site-domain cutover and
rollback. The Production `production` GitHub Environment provides scoped
Cloudflare/API secrets and allows `release/*` branches without a reviewer or
wait-timer gate. The workflow validates all three Workers and Functions,
previews and applies pending migrations through the Production Session Pooler,
deploys the mailing and access-token Edge Functions, Newsletter Workflow
Worker, Trends API Worker, and site Worker from the same commit, then sends the
fixed-recipient canary. Only after the canary confirms the same commit and
deployment identity does it switch the Production mode to `live`.

The API alias `trendapi.bloggenius.kr` is added to the existing
`bloggenius-trends-api-production` Worker; `trendapi.hangadac.com` remains
active. Before deployment, the workflow verifies the existing API Worker and
validates the site hostname if it is bound. An unbound site hostname is allowed;
an unknown owner or duplicate binding is rejected. The workflow also rejects a
new API hostname already assigned to another Worker or carrying a conflicting
DNS record. The site build must contain `https://www.bloggenius.kr` and
`https://trendapi.bloggenius.kr` and must not contain Development hostnames.
The site Worker may be absent on the first deploy. After deploying and
validating its `workers.dev` URL, the site deploy attaches an unbound
`www.bloggenius.kr` hostname to the named Production Worker, keeps an existing
binding to that Worker, and preserves a known legacy owner for the separate
cutover operation. Site-only releases do not deploy the newsletter stack or
reset its send mode.

Production sync creates the `production` Environment if it is missing and
restricts it to `release/*` branches and `v*` tags. The `v*` tag policy lets
the app release workflow read Production-scoped build configuration. Create
the release branch using the normal release process, ensure the GitHub
`production` Environment contains `CLOUDFLARE_API_TOKEN`,
`TRENDS_SUPABASE_SECRET_KEY`, `TRENDS_API_TOKEN`, and
`TRENDS_READ_TOKEN_SECRET`. The Production migration preview and apply use
`SUPABASE_DB_POOLER_URL` from the Production project's Session Pooler (port
5432), matching Development's connection method. The Production direct
endpoint reports that IPv6 is unavailable, and the CLI recommends the pooler
URL for this connection. The
Production env-file sync sets
`CLOUDFLARE_ACCOUNT_ID` and `NEWSLETTER_CANARY_EMAIL` as GitHub Environment
variables. The first selects the Cloudflare account; the second is the sole
canary recipient in that environment. Push the intended release commit to its
`release/*` branch. If deployment, canary, or live-mode verification fails,
stop promotion; delivery remains disabled after the workflow has entered its
deployment phase. The prior static Worker deployment remains available for
rollback, and the prior API deployment can be selected using the established
Wrangler rollback process.

Every `deploy-workers` Production operation also synchronizes and deploys the
`issue-trends-access-token` Edge Function. It writes the Production Supabase
URL, `TRENDS_SUPABASE_SECRET_KEY`, and the matching `TRENDS_READ_TOKEN_SECRET`
from the protected Production Environment, with issuer `bloggenius-license`,
audience `trends-api`, and a 900-second TTL. The Production API Worker uses the
same signing secret and issuer/audience contract. Keep these GitHub Environment
values as the source of truth; this step does not run for site-domain cutover or
rollback operations.

### Development reference procedure

1. Apply the mailing-list migration and all newsletter state/delivery
   migrations to the Development project. Confirm the `mailing` schema is
   exposed to PostgREST while table access remains service-role-only.
2. Deploy `trends-mailing-list` to the Development Supabase project. Set its
   Development-only database key, shared token, Brevo API key/sender,
   confirmation URL, unsubscribe signing secret, and environment marker. The
   push workflow sets delivery to disabled during deployment, then enables live
   only after the fixed administrator canary succeeds. The optional allowlist
   mode remains available for deliberate non-deployment testing.
3. In `apps/trends/trends-api/workers/wrangler.toml`, keep the Development
   Function URL in base `[vars]`. The Development GitHub Environment must
   provide `TRENDS_SUPABASE_SECRET_KEY`, `TRENDS_API_TOKEN`,
   `TRENDS_READ_TOKEN_SECRET`, and
   `TRENDS_NEWSLETTER_WORKER_TOKEN`. CD installs these Worker-scoped secrets
   when deploying `bloggenius-trends-api-dev`; a renamed Worker does not inherit
   encrypted secrets from the previous script.
4. Set the same Development token on `bloggenius-trends-newsletter-dev`, along
   with its Development Supabase server key. Its checked-in `wrangler.toml`
   contains the Development workflow and email-policy variables.
5. Deploy the Newsletter Workflow Worker, then the Trends API Worker. The API
   Worker deploy output should show `TRENDS_ENV="development"`, the
   Development Function URL, and the `TRENDS_NEWSLETTER_COLLECTION_WORKFLOW`
   binding to the Development Workflow script.
6. Build/deploy the site with the Development runtime profile; verify the
   generated signup page embeds `https://trendapi-dev.bloggenius.kr` as its API
   base. Do not infer the target Worker from the URL alone; verify the
   Cloudflare Custom Domain is attached to the Development API Worker.
7. Submit only an allowlisted test address. Confirm the email arrives, use the
   confirmation link, verify `active` state, then test unsubscribe and verify
   `unsubscribed` state. Inspect the matching Worker and Supabase Function logs
   if any step fails.

### Confirmation-page category editing

The signup and confirmation pages share the static site's category catalog.
The confirmation page first calls the read-only
`/api/v1/public/subscriptions/confirm/preview` route, then submits the chosen
categories only when the recipient presses the confirmation button. The API
Worker forwards these public actions to the environment's `trends-mailing-list`
Function. Both site pickers currently cap selection at three; the API Worker,
Edge Function, subscriber table, and staged confirmation-request table accept
up to ten. This keeps the current product limit in the UI while allowing that
limit to increase to ten without changing server validation or schema.

For this feature, promote in this order: apply
`202611040001_trends_subscription_confirmation_category_editing.sql` to the
target Supabase project; deploy the matching `trends-mailing-list` Edge
Function; deploy the API Worker with the preview route; then build and deploy
the matching static site. On a `dev` push, `.github/workflows/environment-validation.yml`
automates this sequence: it applies pending Development migrations, deploys
the Edge Function, validates and deploys both Development Workers, builds the
Development site artifact, and deploys that artifact to the
`www-bloggenius-kr-dev` Worker. The site deploy step requires the GitHub
`development` environment's Cloudflare API token and account ID; it creates
the Worker on first deployment and reuses it afterward. The API Worker
deploy also requires `TRENDS_NEWSLETTER_WORKER_TOKEN` in the GitHub
`development` Environment secrets and uploads it as a Worker secret in the
same Wrangler deployment. This avoids relying on dashboard-only plain
variables, which Wrangler reconciles from the configuration.

The static site Worker names are `www-bloggenius-kr-dev` and
`www-bloggenius-kr-production`; the API and newsletter Workers already use
their matching `-dev` and `-production` names. Production Worker deployment
runs automatically on a `release/*` push. It validates the new Worker through
its `workers.dev` URL and attaches `www.bloggenius.kr` when it is unbound,
while preserving a known legacy owner. The separate manual cutover operation
validates the new Worker again, transfers a known legacy binding, and checks
the public site. A rollback operation can return the domain to the preserved
legacy Worker. Development deploys its new Worker,
validates `workers.dev`, ensures
`www-dev.bloggenius.kr` is bound to the named Worker, then checks the public
site. An unbound hostname is attached automatically; an existing binding to
another Worker is rejected for explicit resolution. After the one-time legacy
binding is removed, later Development pushes reuse the same hostname binding.
Production rejects any site hostname owner outside the target and known legacy
Worker set.

Production deployment is handled by
`.github/workflows/deploy-trends-web-production.yml` from `release/*`, using a
separate GitHub `production` Environment and independently configured
Supabase project, Function, API Worker, site Worker, hostnames, URLs, and
credentials.
The newsletter Workflow Worker uses the same source as Development; its
`[env.production]` Wrangler profile selects the Production Worker identity,
project, and site links. The release workflow first disables newsletter
delivery, sends the administrator canary after deployment, and enables live
delivery only when the canary succeeds. Never copy Development credentials.

For manual recovery only, commands in each Worker package directory are
Development-targeted unless a command explicitly names an environment. The
API Worker's `npm run secret:development` and Newsletter Worker's
`npm run deploy:development` operate on Development. Production deployment and
newsletter mode changes go through the release workflows restricted to
`release/*`. Worker
secret listing reveals names only; a `secret put` publishes a new Worker
version. Keep Function URLs in Wrangler variables, not secrets.

The migration adds only staged category-change requests; active subscriber
categories and unsubscribe tokens stay unchanged until explicit confirmation.
Existing pending signup links continue to work. Verify both first-time
confirmation and active-subscriber category change in Development before
applying the same reviewed sequence to Production.

### Production newsletter safety and operations

Each Production deployment sets newsletter delivery to `disabled` before
mutations. After the Workers and site are healthy, the workflow reads the latest
Production trend date and sends a one-category email only to the fixed
`NEWSLETTER_CANARY_EMAIL`. This address is configured in that GitHub Environment
and is never accepted from a request. Canary reads trend rows and RSS only; it
does not query subscribers or write normal collection, edition, attempt,
campaign, or delivery records. The existing Newsletter Worker sends the
Telegram run summary. On success, the workflow changes Production mode to
`live`; if any step fails before that transition, mode remains `disabled`.

Development and Production use the same push sequence: set mode to
`disabled`, deploy the stack, send a canary to the fixed administrator address,
and set mode to `live` only after success. The canary action does not enumerate
subscribers or write the normal delivery ledger. There is no persistent
`canary` mode. `deliver_batch` is accepted only in `allowlist` or `live`. If a
collection occurs while delivery is disabled, the Workflow reports collection
success and email waiting through Telegram and makes no subscriber delivery
ledger writes. Once live mode is enabled, normal collection signals start
subscriber delivery automatically. `allowlist` remains available for explicit
non-deployment testing, but neither push workflow uses it.

The `production-newsletter-control.yml` workflow is retained as a manually
dispatched emergency disable action from `release/*`. Every release push is
canaried; API-only, newsletter, and site changes use the same full stack
sequence to keep Development and Production paired. The migration preview is
read-only; deployment applies pending migrations after preview succeeds.

The local Production secret file requires a distinct newsletter Worker token,
dedicated canary trigger token, Telegram/Brevo credentials, sender, unsubscribe
signing secret, and `NEWSLETTER_CANARY_EMAIL`. Production migration jobs use
`SUPABASE_DB_POOLER_URL` from the Production Session Pooler. Secret sync writes
only to GitHub's Production Environment; it does not deploy or change the
Supabase Edge Function mode. Production secrets must not reuse Development
values. Never record secret values in operational notes.

### Failure signatures observed during Development validation

- The site displays “구독 기능을 일시적으로 사용할 수 없습니다.” when the
  API Worker's Function URL is invalid/missing or its shared token is empty.
  `newsletter integration is not configured` in API Worker logs confirms this
  preflight branch.
- The site displays “요청을 처리하지 못했습니다. 잠시 후 다시 시도해
  주세요.” after the API Worker passed its configuration check but the
  Function request failed or returned a non-400 error. The API log
  `newsletter backend rejected request` includes the HTTP status and sanitized
  backend error. Supabase Function invocation logs help distinguish token,
  email-policy, database, and provider failures.
- `TRENDS_NEWSLETTER_EMAIL_POLICY_DENIED` with
  `environment=development` and `mode=allowlist` means the request reached the
  Edge Function but the recipient is not in `NEWSLETTER_EMAIL_ALLOWLIST`.
  Add the intended test address while preserving existing entries; do not
  rotate a token for this error.
- Edge Function `401 unauthorized` means the API/Workflow Worker token does
  not match that environment's `TRENDS_NEWSLETTER_WORKER_TOKEN` secret.
- Database RPC failures should be diagnosed from the Function log code and
  PostgREST response. A `406` / `PGRST106` means the `mailing` schema is not
  exposed to the project's Data API.
- `brevo_http_401` or `TRENDS_NEWSLETTER_PROVIDER_RESPONSE` points to Brevo
  credentials, sender policy, or provider network access; do not rotate a
  working key before checking the reported provider cause.
- If Brevo has IP access restrictions, authorize the current egress address
  shown in its rejection before retrying. A Brevo `401` may be caused by this
  restriction even when the API key is valid.
- For campaign delivery, a recipient outcome `provider_rejected` with no
  provider message ID should be investigated through that invocation's
  `TRENDS_NEWSLETTER_PROVIDER_RESPONSE` Function log. It contains sanitized
  provider diagnostics; the database outcome stays generic and Brevo may have
  no event because it rejected the request before accepting it.

Development end-to-end validation completed on 2026-11-02 (Asia/Seoul): the
site signup sent a Brevo confirmation email, the confirmation link changed the
subscriber row to active, and unsubscribe updated the row. During the
2026-11-03 recovery, Supabase logs showed that the request reached the
Development Edge Function and was denied by its allowlist; adding the intended
test recipient addressed that policy gate. Production rollout has not been
performed. Daily campaign generation and scheduled bulk delivery are outside
this verified lifecycle slice.

## Current Deployment Model

The existing Node/Docker runtime is preserved under
`apps/trends/trends-api/docker/` as an Oracle rollback option. The active API
runtime is the Cloudflare Workers implementation under
`apps/trends/trends-api/workers/`. Development uses
`trendapi-dev.bloggenius.kr`; Production uses `trendapi.hangadac.com`. Both are
Cloudflare Custom Domains with Cloudflare-managed DNS and TLS. See the Workers
[deployment guide](../../apps/trends/trends-api/workers/README.md).

The renamed Development Worker `bloggenius-trends-api-dev` uses the Cloudflare
Custom Domain `trendapi-dev.bloggenius.kr`. Cloudflare manages its DNS record
and TLS certificate, with all paths on that hostname routed to the Worker. The
previous `bloggenius-trends-api` Worker and its
`trendapi-dev.hangadac.com` Custom Domain remain available during cutover as a
rollback target; remove them only after the new endpoint has been accepted.

Development와 Production은 운영 단위를 공유하지 않는다.

### Development

- Active API: `bloggenius-trends-api-dev` Worker at `trendapi-dev.bloggenius.kr`
- Legacy Development Docker fallback: `apps/trends/trends-api/docker/deployment/development/`
  - API config: ignored `.env.trends-api.development` in that directory
  - Its old `trendapi-dev.hangadac.com` value belongs to the retained legacy
    rollback configuration; current Development clients use
    `trendapi-dev.bloggenius.kr`.
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

Production GitHub Actions entry-point workflows that use `workflow_dispatch`
must also exist on the repository's default branch so GitHub can expose manual
dispatch. The selected `release/*` ref remains the deployment source: the
workflow validates that ref and checks out its exact commit SHA. Keeping the
entry-point YAML on `main` does not make `main` a Production deployment target;
release pushes alone do not start deployment.

Preferred shape:

```text
Cloudflare Workers
  trendapi-dev.bloggenius.kr -> Development Worker
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

The `Production | Deploy Trends Release` workflow synchronizes and deploys the
`issue-trends-access-token` Supabase Edge Function for every Production Worker
release. It configures these function secrets from the protected Production
Environment:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`
- `TRENDS_READ_TOKEN_SECRET`
- `TRENDS_READ_TOKEN_ISSUER=bloggenius-license`
- `TRENDS_READ_TOKEN_AUDIENCE=trends-api`
- `TRENDS_READ_TOKEN_TTL_SECONDS=900`

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
