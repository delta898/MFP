# Trends API Development Worker Rename Inventory

## Branch and status

- Branch: `codex/trends-api-dev-worker-rename-inventory`
- Base branch: `dev`
- Start date: 2026-11-04
- Status: In progress

## User need and goal

The user is considering renaming the Development API Worker from
`bloggenius-trends-api` to `bloggenius-trends-api-dev`, and changing its API
hostname from `trendapi-dev.hangadac.com` to `trendapi-dev.bloggenius.kr`.
The intended future Production names are `bloggenius-trends-api-prod` and
`trendapi.bloggenius.kr`; Production is not to be created or deployed in this
stage. The user asked for a complete inventory of current Dev/Prod references
and connections before approving any migration.

## Scope and non-goals

- Trace current API Worker names and API hostnames across source, Collector,
  desktop clients, CI/CD, Cloudflare configuration, scripts, and documentation.
- Identify the actual Development and Production request paths and whether each
  caller needs an endpoint change.
- Record migration dependencies, secrets, bindings, domains, and safe ordering.
- Do not rename Workers, change DNS/domains, alter API URLs, deploy, or modify
  application behavior in this inventory stage.
- Do not create or enable Production resources or deploy jobs.

## Proposed investigation

1. Search tracked and hidden repository files for current Worker names,
   `trendapi` hostnames, and API base URL configuration.
2. Trace each caller to its environment selection and runtime/deployment path.
3. Compare findings with the canonical Trends backend deployment guide and
   Wrangler/CI configuration.
4. Publish a categorized inventory and migration considerations for user
   review; update canonical operational docs only if the inventory reveals
   stale or contradictory current-state descriptions.

## Decisions and tradeoffs

- API Worker and Newsletter Workflow Worker remain separate responsibilities.
- The requested Production names/domains are future TODO targets only.
- This stage is analysis and inventory, not the rename implementation.

## Repository inventory (2026-11-04)

### Current configuration and deployment paths

| Concern | Development in repository | Production in repository | Evidence / notes |
| --- | --- | --- | --- |
| API Worker script name | `bloggenius-trends-api` | `bloggenius-trends-api-production` | `apps/trends/trends-api/workers/wrangler.toml`; proposed future names `...-dev` / `...-prod` differ from current config |
| API hostname | `trendapi-dev.hangadac.com` | `trendapi.hangadac.com` | Wrangler custom domains, Collector samples, website, and deployment docs |
| Wrangler environment | Base environment (`--env=''`); `[vars]` says `TRENDS_ENV=development` | `[env.production]`, deployed with `--env production` | `apps/trends/trends-api/workers/package.json` |
| Cloudflare deployment automation | GitHub Actions deploys Newsletter Workflow Worker then API Worker on pushes to `dev`; API gets the development GitHub Environment token secret | No Production deploy job in `.github/workflows/environment-validation.yml`; production deploy script exists for manual use | CI also builds/deploys Development site and embeds Dev hostname |
| Newsletter Workflow Worker | `bloggenius-trends-newsletter-dev`, bound from API via `TRENDS_NEWSLETTER_COLLECTION_WORKFLOW` | No Production Workflow Worker configured in API Wrangler config or CD | Distinct from browser-facing API Worker |
| Site API target | Build variable `PUBLIC_TRENDS_API_BASE_URL` is Dev hostname; default in page components is Production hostname | Production site build uses Production hostname | `environment-validation.yml`, `astro-site-runtime.js`, three Trends Astro pages |
| Collector API target | Dev sample uses Dev hostname, target environment `development` | Production sample uses Production hostname, target `production` | Collector uses `TRENDS_API_BASE_URL` for ingest and collection-complete signal; hostname change requires environment config update |
| WordPress/API client | No fixed Dev hostname found in plugin source; endpoint supplied through `BG_TRENDS_API_BASE_URL` | README documents Production URL; architecture says plugin calls Production API | Operational WordPress config is external to this repository |
| Legacy Oracle Docker | Development and Production compose/manifests contain current hostnames as fallback/guard configuration | Production runbooks refer to the same Production hostname | Must decide whether these remain rollback paths or are updated/retired as part of a later hostname migration |
| Preflight and smoke checks | Dev preflight hard-codes Dev hostname | Production transition preflight and read-only smoke hard-code Production hostname | `scripts/trends-development-preflight.js`, `scripts/trends-production-transition-preflight.js`, `scripts/trends-production-readonly-smoke.js` plus associated tests |

### Service flow

```text
Browser (Dev site) -> trendapi-dev.hangadac.com -> API Worker
  -> Supabase Dev mailing Edge Function for subscription actions

Mac Studio Development Collector -> same Dev API hostname
  -> ingest trends + authenticated collection-complete signal
  -> private Workflow binding -> bloggenius-trends-newsletter-dev

Production site / Collector / WordPress -> trendapi.hangadac.com
  -> Production API Worker configuration
```

The API Worker and Newsletter Workflow Worker have separate responsibilities;
the rename inventory does not propose merging them. A browser API hostname
change must reach site build configuration because it is compiled into static
HTML/JavaScript. A Collector hostname change must update the Development sample
and the operator's ignored local environment; the collector code already reads
that setting generically. Tests, preflights, runbooks, and fallback Docker
configuration also contain fixed hostnames and must be classified deliberately.

### Configuration vs. deployed-state discrepancy

- Wrangler and the Worker README define a Production Worker named
  `bloggenius-trends-api-production` at `trendapi.hangadac.com`.
- The deployment architecture says Production API traffic is handled by that
  Cloudflare Worker, while also describing a remaining first live Production
  collector validation and Oracle rollback path.
- Newsletter architecture says newsletter lifecycle and delivery are not
  rolled out in Production; the API Wrangler config has no Production
  Newsletter Workflow binding and current CD deploys only Development Workers.
- These are repository statements, not a live Cloudflare inventory. This task
  has not queried Cloudflare, DNS, site-hosting external settings, or operator
  machines. The live existence/attachment of Production resources remains to
  be confirmed before an actual rename or hostname cutover.

## Progress and verification

- 2026-11-04: Confirmed the repository was clean on `dev`; created this feature
  branch from `dev` and traced Worker configuration, CI/CD, site build/runtime,
  Collector, WordPress, deployment guards, and architecture/runbook statements.
- Read-only `rg` searches covered source, workflows, samples, tests, and docs;
  site build environment and Collector API/signal calls were traced.
- `git diff --check` remains to run.

## Final result and follow-up

Repository references and environment-specific call paths are inventoried.
No runtime code, deployment configuration, hostname, Cloudflare resource, DNS,
Collector local configuration, or Production resource was changed. The next
implementation proposal should first reconcile the Production deployed-state
discrepancy, then update the Worker name and hostname as separate migration
steps with an overlap/rollback period and coordinated site, Collector,
WordPress, and fallback decisions.

No manual environment changes, DNS changes, or deploys were performed.
