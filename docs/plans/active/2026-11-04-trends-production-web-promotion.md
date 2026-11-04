# Trends Web Production Promotion

## Branch and status

- Branch: `codex/trends-production-web-promotion`
- Base/parent branch: `dev`
- Start date: 2026-11-04
- Status: Implemented on feature branch; awaiting review and integration

## User need and goal

The user wants to promote the category-grouped Trends page and RSS reading
cards, including representative images, to the Production BlogGenius site.
Development and Production use the same tracked Astro source, but build-time
API URLs and static Worker targets must remain environment-specific.

Production must retain `https://trendapi.hangadac.com` while adding
`https://trendapi.bloggenius.kr` as a second API hostname on the existing
Production Trends API Worker. New Production site builds should use the new
BlogGenius API hostname after both hostnames pass smoke checks.

## Scope and explicit non-goals

### In scope

- Add the new Production API Custom Domain while preserving the existing API
  hostname and Worker.
- Create a manually dispatched, Production-environment protected deployment
  path for the Production Trends API Worker and static site.
- Build the shared Astro source with explicit Production site/API variables;
  verify the generated artifact contains the expected Production origin and
  API hostname and no Development hostnames.
- Preflight the existing Production API and site Worker identities/domains
  before deploying. Never silently create or select a different site Worker.
- Smoke-check both API hostnames and the Production site after deployment.
- Document approval, deployment, verification, and rollback steps.

### Non-goals

- Production newsletter Worker/Workflow, Supabase mailing migrations or Edge
  Function, subscriber import, live email sending, Telegram secrets, or
  campaign launch.
- Removing or redirecting `trendapi.hangadac.com` or migrating every existing
  Collector/WordPress client to the new hostname.
- Production DNS changes unrelated to adding the API Custom Domain or changing
  the existing Production site deployment target.
- Desktop application version changes or a broad Supabase production release.

## Proposed design

- Keep one Astro source and produce separate immutable Development and
  Production artifacts using explicit `BLOGGENIUS_ENV`, `BLOGGENIUS_SITE_URL`,
  and `PUBLIC_TRENDS_API_BASE_URL` values.
- Add `trendapi.bloggenius.kr` as another Production Custom Domain for
  `bloggenius-trends-api-production`; retain `trendapi.hangadac.com` as a live
  compatibility address.
- Use a dedicated `workflow_dispatch` Production deployment workflow on a
  `release/*` branch, gated by GitHub's `production` Environment approval.
  It deploys the API alias first, verifies both API hosts, then builds and
  deploys the Production static site to its explicit existing Worker.
- Reuse the existing Cloudflare static asset deployer and shared Astro source,
  with a Production-only wrapper that verifies the exact account, Worker, and
  `www.bloggenius.kr` domain before upload.
- Use only Production-scoped Cloudflare and Trends API credentials. No
  Supabase mutation is required for this web/API slice.
- Keep the Production Cloudflare account ID in the GitHub Environment
  variables, matching Development; it is a nonsecret deployment target.
- Keep legacy API hostname support. The Production site adopts
  `trendapi.bloggenius.kr` only after API alias health/public-route checks pass.

## Decisions and alternatives

- User approved a separate feature branch for Stage 1: the Production Trends
  web experience.
- User requires both API hostnames to remain active; treating the new hostname
  as a replacement is out of scope.
- A separate manual Production workflow is preferred over deploying on every
  release branch push, so a protected environment approval and exact
  Production target preflight remain explicit. The user clarified that
  Production promotion runs from release branches such as `release/v0.7.1`,
  not `main`.
- Production newsletter delivery remains a later stage because its Worker and
  Edge Function are deliberately Development-only today.

## Affected boundaries

- `apps/trends/trends-api/workers/wrangler.toml`: Production Custom Domain
  configuration for the existing API Worker.
- `.github/workflows/`: manual Production build/deploy path, separate from the
  Development push deployment.
- `scripts/`: Production site target preflight/deployment wrapper, reusing the
  Site Hosting Cloudflare static asset deployer.
- `workspace/site-hosting/sites/www-bloggenius-kr/`: shared Astro build inputs;
  no duplicate site source.
- `docs/architecture/`: current Production web/API promotion procedure.

## Implementation stages

1. Reconfirm current Development API/site release evidence and the exact
   Production Worker/domain target available from repository configuration.
2. Add the API hostname alias and focused tests for preserving both Production
   routes and origin policy.
3. Add a Production static-site build contract that fails if the artifact
   includes Development site/API origins or omits the intended Production
   values.
4. Add an explicit, manually dispatched Production workflow with protected
   environment approval, exact target checks, API-before-site deployment, and
   post-deployment smoke checks.
5. Update canonical deployment documentation and verify focused tests/builds.

## Verification and release

- Run focused API Worker tests and Wrangler dry-run for the Production
  environment.
- Build the Production Astro artifact and assert it contains
  `https://www.bloggenius.kr` and `https://trendapi.bloggenius.kr`, with no
  `www-dev.bloggenius.kr` or `trendapi-dev.bloggenius.kr` references.
- Test deployment guard behavior with missing/mismatched Production targets
  and with the expected existing Worker/domain fixtures.
- Do not run the Production deployment from this feature branch. Production
  deployment is a later, separately approved operation after this branch is
  reviewed and integrated.
- Before merging this completed feature branch into `dev`, perform code
  review and the focused tests required by the repository rules. Full unit
  suite approval is required only at the parent-to-`dev` integration gate.

## Progress log

- 2026-11-04: Confirmed clean `dev` at `aa0bdace`, matching `origin/dev`.
- 2026-11-04: Confirmed Development has an automated build/deploy path while
  Production does not; the shared Astro source accepts an API base URL at
  build time, and the existing static asset deployer derives the Production
  Worker from the stable Site ID.
- 2026-11-04: Confirmed the Production API Worker already has its existing
  `trendapi.hangadac.com` Custom Domain and the Wrangler configuration can add
  a second Custom Domain without replacing it.
- 2026-11-04: Added the Production API Custom Domain alias, a release-branch
  manual deployment workflow, Production target and smoke checks, and the
  documented web-only promotion sequence. Extended the existing environment
  sync utility so both environment files set `CLOUDFLARE_ACCOUNT_ID` as a
  GitHub Environment variable, while credentials remain GitHub secrets. Both
  Production and Development workflows use the same variable contract.
  Verified the focused deploy-guard/smoke tests, secret-sync tests, API Worker
  tests, Production Wrangler dry-run, Production Astro build and hostname
  artifact assertions, workflow YAML parse, and `git diff --check`. Wrangler
  dry-run exits successfully; it warns that intentionally Development-only
  newsletter variables and Workflow binding are not inherited by Production.
  No Production deployment has been run. Release dispatch, Environment
  reviewer settings, and live Worker/DNS ownership remain to be checked from
  GitHub/Cloudflare during release promotion.
- 2026-11-04: User confirmed the GitHub repository currently has only the
  `development` Environment. This explains the Production sync preflight
  failure before any GitHub secret/variable update; environment provisioning
  is required. User approved provisioning it through the local sync utility
  with a `release/*` branch policy and the current GitHub account as reviewer.
- 2026-11-04: Updated Production sync to create the missing environment only
  after `PRODUCTION` confirmation, add the current GitHub user as the required
  reviewer, restrict deployment to `release/*`, and verify those protections
  before syncing any values. Existing unprotected Production environments are
  rejected without syncing. Focused production-web and environment-sync tests
  pass (14 total); no remote GitHub Environment or secret was changed here.
- 2026-11-04: User clarified Development should also be created by the same
  utility when absent. Dev sync now creates a missing Development Environment
  after confirmation and restricts it to the `dev` branch, without adding a
  reviewer gate. Focused tests now pass (15 total).
- 2026-11-04: User changed the GitHub repository visibility to public; the
  Production sync then completed with seven secrets and the Cloudflare account
  variable. The Environment now supports the reviewer protection rule and is
  restricted to `release/*`. No Production Worker or site deployment has run.
- 2026-11-04: The approved full unit run exposed an existing package-boundary
  mismatch: `apps/trends/shared` declared ESM while its shared runtime modules
  and 12 affected test/caller paths use CommonJS. Changed that package to
  CommonJS and renamed the Worker-only RSS ESM module to `.mjs`, updating both
  Worker imports. All 12 previously failing require-related tests now pass.
  The full suite, run with its five loopback-listener cases excluded due to
  sandbox `EPERM`, completed with 2,515 passing, 0 failing, and 1 pre-existing
  skipped test. `npm run test:unit` still stops at its pretest security audit
  because the current dependency tree reports two high-severity advisories.
