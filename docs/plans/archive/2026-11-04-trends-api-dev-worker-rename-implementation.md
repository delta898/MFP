# Trends API Development Worker Rename

## Branch and status

- Branch: `codex/trends-api-dev-worker-rename-dev-implementation`
- Base/parent branch: `codex/trends-api-dev-worker-rename-inventory`
- Start date: 2026-11-04
- Status: Complete; merged into `dev` as `93e57415`

## User need and goal

Rename only the Development Cloudflare Trends API Worker from
`bloggenius-trends-api` to `bloggenius-trends-api-dev`, and migrate Development
consumers to `https://trendapi-dev.bloggenius.kr`. Production Worker/domain
changes are explicitly deferred. The user confirmed `bloggenius.kr` is managed
by Cloudflare and asked for a safe, complete repository change.

## Scope and non-goals

- Update Dev Worker Wrangler configuration, Development CD validation/deploy,
  Development site build target, Collector sample, Production isolation guard,
  and operational documentation/tests.
- Keep the old Dev Worker/domain available as rollback during the overlap.
- Keep Production API configuration and hostname unchanged.
- Do not create or edit Production resources, DNS, or Worker deployment.
- Do not perform a Cloudflare deployment or external DNS mutation as part of
  this local implementation slice; Dev CD deploys on a later push to `dev`.

## Design and stages

1. Change the base Wrangler Worker name and its custom domain to the new Dev
   values; preserve Workflow binding and all Development secrets/variables.
2. Point Dev site builds and Collector defaults at the new hostname.
3. Update Dev preflight/test expectations and current operational docs while
   preserving Production values and identifying old-domain rollback behavior.
4. Run focused checks and review for accidental Production edits.

## Decisions and tradeoffs

- API Worker and Newsletter Workflow Worker remain separate.
- Dev CD deployment creates/updates the newly named Worker; old Worker/domain
  are not deleted in this slice, allowing consumers to be rolled back to the
  previous hostname during cutover.
- Wrangler secrets are Worker-scoped. CD must install the full Dev API secret
  set on the newly named script. Existing secret values cannot be read back
  from Cloudflare, so they must be available in the GitHub `development`
  Environment before this CD deployment can succeed.
- The Dev Supabase project URL is a non-secret Worker variable in Wrangler;
  only credentials and tokens are stored as GitHub Environment secrets.
- Retain old `trendapi-dev.hangadac.com` literals only in legacy Docker
  fallback/rollback configuration and its preflight. Update the Production
  environment's Development-target guard to the new active hostname.
- Production remains `bloggenius-trends-api-production` at
  `trendapi.hangadac.com` until a separately agreed follow-up.

## Progress and verification

- Created from the inventory branch after the user approved proceeding with
  Dev-only implementation.
- Updated Wrangler, Dev CD, Dev site build, Collector sample, Production's Dev
  isolation guard, and current operational documentation.
- Updated the workflow contract test to assert that CD validates and installs
  all required Worker secrets on the renamed script.
- The legacy Docker development manifest/runbook still points at the former
  endpoint deliberately and is documented as rollback configuration.
- Updated the ignored Mac Studio Development Collector environment file's API
  URL only; its credential values were preserved and not displayed.
- Cloudflare Custom Domain creation is driven by the Wrangler deploy from CD;
  Cloudflare provisions DNS and TLS. No Cloudflare deploy has run yet.
- Before CD can deploy the renamed Worker, confirm these secrets exist in the
  GitHub `development` Environment: `TRENDS_SUPABASE_SECRET_KEY`,
  `TRENDS_API_TOKEN`, and `TRENDS_READ_TOKEN_SECRET`. The already configured
  `TRENDS_NEWSLETTER_WORKER_TOKEN` is also required.
- Focused tests passed: six Production transition preflight tests and five
  non-loopback Astro runtime tests.
- Three Astro tests that bind `127.0.0.1` could not run in this sandbox because
  listener creation returns `EPERM`; no unrelated tests were skipped.
- `npm run test:unit` stopped in its `pretest:unit` security audit, which
  reported 43 dependency advisories (2 high, 37 moderate, 4 low) before the
  unit runner started.
- Ran all unit tests directly: 2,492 passed and five loopback-listener tests
  failed only with sandbox `EPERM`. Reran the whole suite excluding only those
  five affected cases: 2,492 passed, zero failed; one existing test remains
  skipped.
- `git diff --check` passed.

## Review

- Reviewed the complete feature diff against `dev` after focused and broad unit
  verification. No actionable code-review findings remain.
- Production API Worker name and hostname remain unchanged; only its
  Development-target guard now points at the new Development hostname.

## Final result and follow-up

- Merged into `dev` as `93e57415` (`feat: rename development trends api worker`).
- The Cloudflare deployment itself will occur after a later push to `dev`.
- The old Worker and old Dev hostname remain available for rollback; Production
  Worker/domain configuration is unchanged.
