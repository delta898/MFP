# Trends API Cloudflare Workers Development

## Branch
- Branch: `codex/trends-api-cloudflare-workers`
- Start date: 2026-09-30
- Base branch: `dev`
- Status: Implementation and domain cutover complete; Production collection validation remains

## User Need and Goal
Oracle Cloud Free Tier is resource constrained while serving WordPress and the Trends API. Move the Trends API runtime toward Cloudflare Workers while preserving `trendapi.hangadac.com` and existing client contracts.

## Scope
- Relocate the existing Docker implementation under an explicitly named `docker/` directory.
- Create a separate Cloudflare Workers implementation and Wrangler-based local/deployment workflow.
- Preserve endpoint paths, authentication classes, Supabase access boundaries, and collector/WordPress/desktop compatibility.
- Update maintained architecture and deployment documentation and in-repository path references.

## Non-goals
- Do not decommission the Oracle Docker deployment; retain it as the Production rollback path during stabilization.
- Do not change the Naver collector runtime or its Playwright browser requirements.

## Proposed Design
Use `apps/trends/trends-api/docker/` for the existing Node/Docker runtime and `apps/trends/trends-api/workers/` for the new Cloudflare Worker runtime. Keep the HTTP contract paths (`/api/v1/...`) independent of the implementation directory names. Worker deployments use Wrangler; secrets are configured out of band and never committed.

## Stages
1. Record this plan and relocate Docker-owned files without changing behavior.
2. Implement the Worker API as a separate runtime, preserving current authorization and data contracts.
3. Add local and deployment instructions for Wrangler, including Development/Production separation and custom-domain cutover guidance.
4. Run focused contract/runtime checks and review all path references.

## Decisions and Tradeoffs
- Chose implementation names `docker` and `workers` rather than `v1`/`v2`, because these are runtime/deployment variants rather than HTTP API versions.
- The user approved moving Production to the Worker after Development validation and authenticated Production read validation; the Oracle deployment remains available for rollback.
- Keep the Docker implementation available for rollback until Production collection and client reads have been validated on Workers.

## Progress
- Confirmed the working branch was `dev`; existing untracked `demos/` and `tmp/` files are user data and are preserved.
- Created this feature branch from `dev`.
- Moved the existing Node API, Dockerfile, deployment units, environment samples, and runbooks under `apps/trends/trends-api/docker/`; updated Docker path references and ignore rules.
- Added an independent Workers implementation under `apps/trends/trends-api/workers/`, using Web Crypto for signed read tokens and Supabase PostgREST/RPC through Fetch.
- Added Wrangler Development/Production configuration, secret command shortcuts, and an operational runbook.
- Initially added a Worker Route for `trendapi-dev.hangadac.com/*`; the user chose to replace it with a Custom Domain and explicitly removed the existing Oracle DNS record. Cloudflare now manages the Development hostname record and TLS.
- Preserved all existing API routes, internal/user authorization roles, environment-target check, ingest normalization, filters, metadata RPC, CSV output, and reserved XLSX response.

## Verification and Handoff
- Static syntax checks for both runtimes and affected preflight scripts passed; JSON manifests, Docker build-context roots, stale active path references, and whitespace checks passed.
- Focused Node tests passed: 46 tests across the moved API server, environment-entrypoint checks, and Development/Production preflight and container helpers. The two localhost-binding tests required an escalated rerun after the sandbox blocked socket binding.
- The pre-merge full-suite attempt found the Docker contract test still referenced pre-move paths. Updated the contract test to read the `docker/` layout; all four assertions now pass in a focused run. A clean full-suite rerun is still required before merging into `dev`.
- Development Worker health/auth checks passed. The user confirmed authenticated metadata, list reads, and collector operation through the Development hostname.
- Deployed the Custom Domain configuration to the Development Worker. `https://trendapi-dev.hangadac.com/health` returned `200` with `environment: development`; unauthenticated `/api/v1/trends/meta` returned the expected `401`.
- The Development Custom Domain was confirmed by the user's collector run.
- Created the Production Worker at `bloggenius-trends-api-production` on its `workers.dev` hostname. The first deployment warned that Wrangler environments inherit routes, so `routes = []` was added to Production and redeployed; Dev and Production health endpoints now report their separate environments, and unauthenticated Production metadata returns `401`.
- Configured all four Production secret names (values remain private) and verified that the Worker still returns Production health and rejects unauthenticated metadata requests with `401`.
- The user confirmed authenticated Production metadata succeeds through the Production `workers.dev` URL.
- Bound `trendapi.hangadac.com` to the Production Worker. A request pinned to Cloudflare edge returned Production health and the expected unauthenticated `401`.
- The user noticed Cloudflare DNS showed `trendapi-dev` associated with the Production Worker, consistent with Wrangler's initial route-inheritance warning. Re-deployed Development, then verified directly against Cloudflare edge that `trendapi-dev` returns `environment: development` and `trendapi` returns `environment: production`.
- The user shared the Worker Domains panel: Development had a redundant `trendapi-dev.hangadac.com/*` Worker Route beside its Custom Domain, while Production had only its `workers.dev` URL and Custom Domain. The user removed the stale Development route; the Development collector continued to work.
- Cloudflare public DNS now resolves both hostnames to Cloudflare edge IPs; this Mac's system resolver still reports the old Oracle address for `trendapi.hangadac.com`. Wait for its cache to expire or flush the local DNS cache before ordinary curl/browser checks.
- Production authenticated metadata read through `workers.dev` was confirmed by the user before cutover. The Production custom domain was then bound and verified against Cloudflare Edge for health and expected unauthenticated `401`.
- Production collector ingest through the custom hostname has not yet been exercised; it writes to Production Supabase and should be validated during the user's normal production collection run.
- The Development collector performed a successful end-to-end run through its Worker hostname. No direct Production write test was run.
