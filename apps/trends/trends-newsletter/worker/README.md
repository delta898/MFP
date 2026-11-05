# Trends Newsletter Workflow Worker

This is the shared private Workflow entry point for Development and Production.
The same Worker source validates collection readiness, creates or reuses the
newsletter edition, and coordinates recipient delivery. Environment profiles
select the Supabase project and site links; they do not select the email policy.

## Environment and email mode

The Worker validates `BLOGGENIUS_ENV`, `SUPABASE_PROJECT_REF`, and
`SUPABASE_URL` together against the profiles in `../src/readiness.js`. Requests
fail closed when those values point to different targets.

`NEWSLETTER_EMAIL_MODE` selects the email behavior:

- `disabled`: collection is checked and reported, but newsletter records and
  recipient delivery are not started.
- `allowlist`: subscriber delivery proceeds; the mailing Edge Function sends
  only to addresses in `NEWSLETTER_EMAIL_ALLOWLIST`.
- Canary is a separate private Workflow path in either environment. It sends
  one message to the configured administrator address and does not use
  subscriber delivery or its campaign ledger.
- `live`: normal subscriber delivery proceeds.

The Edge Function rejects mode/environment combinations that are not allowed.
The Worker uses the mode returned by that check to decide whether subscriber
delivery proceeds. `allowlist` is not intrinsically a Development mode, and
`live` is not intrinsically a Production code path; the environment profile
only constrains which combinations the server accepts.

## Deployment configuration

`wrangler.toml` contains separate target profiles for the same Worker source:

- The base configuration is Development (`bloggenius-trends-newsletter-dev`).
- `[env.production]` targets Production (`bloggenius-trends-newsletter-production`).

Development `dev` pushes and Production `release/*` pushes use the same
deployment sequence: disable delivery, deploy the Workers and site, send an
administrator canary, then enable `live` only after the canary succeeds. The
existing Newsletter Worker sends the Telegram run summary. Production
deployment is handled by
[`deploy-trends-web-production.yml`](../../../../.github/workflows/deploy-trends-web-production.yml)
from `release/*`; emergency disable is handled separately by
[`production-newsletter-control.yml`](../../../../.github/workflows/production-newsletter-control.yml).
Review the release and
environment gates in [Trends backend deployment](../../../../docs/architecture/trends-backend-deployment.md)
before operating these workflows.

Environment-specific Worker names, bindings, URLs, credentials, and release
steps belong in deployment configuration. Do not create a second copy of the
newsletter business logic for Production.

## Local verification

From this directory:

```sh
npm test
npx wrangler deploy --dry-run
npx wrangler deploy --dry-run --env production \
  --var NEWSLETTER_RELEASE_SHA:<40-character-sha> \
  --var NEWSLETTER_DEPLOYMENT_ID:<uuid>
```

Dry-runs compile configuration; they do not deploy. Never use live credentials
or trigger Production sends as part of local verification.
