# MentiVenus Company Site

- Branch: `codex/mentivenus-company-site`
- Start date: 2026-11-06
- Base/parent branch: `dev`
- Status: Implemented and verified

## User need and goal

Create a simple, Git-managed public company homepage for the user's sole proprietorship, separate from the BlogGenius product site. Link to `www.bloggenius.kr` as one of the company's products. Build and automatically deploy Development to `www-dev.mentivenus.com` on `dev` pushes and Production to `www.mentivenus.com` on `release/*` pushes, following the existing BlogGenius static-site pipeline.

## Scope and non-goals

- Add an Astro static site under `workspace/site-hosting/sites/` with environment-specific canonical origins.
- Extend existing Development and Production site build/deploy workflows to include it.
- Use dedicated Workers `www-mentivenus-com-dev` and `www-mentivenus-com-production`; create if absent, reuse if present, bind the matching hostname if unbound, and fail rather than taking a hostname from another Worker.
- Keep content concise and limited to known facts; do not invent business services, address, contact details, or claims.
- No DNS edits, manual domain cutover, Production deployment, or remote Cloudflare mutation in this feature stage.

## Design and affected boundaries

Static content and Astro presentation live in the site workspace. GitHub Actions owns environment-specific build and deployment orchestration. The existing Astro Site Hosting Core Plugin deployer handles Cloudflare static assets; a site-specific script validates GitHub ref/environment and ensures its Worker domain through the shared domain helper. BlogGenius site settings and behavior remain unchanged.

## Decisions and tradeoffs

- Development deploys from `dev` push; Production deploys from `release/*` push, matching the user's established release workflow.
- Domain bindings already on the expected Worker are preserved. Unbound domains are attached automatically. Unexpected ownership fails safely; this feature does not silently cut over an existing site.
- `www-dev.mentivenus.com` resolves to Cloudflare-proxied addresses per user-provided `nslookup` output.

## Implementation and verification

- Added the independent Astro company site with an environment-specific canonical origin and a production BlogGenius link.
- Added a narrow `.gitignore` exception so this site source is versioned while other workspace site data remains ignored.
- Added a GitHub-ref-guarded deployer using the existing Astro Site Hosting Cloudflare deployer and `ensureWorkerDomain` safety checks.
- Added the site build/artifact/deployment steps to Development `dev` pushes and Production `release/*` pushes.
- Verification: Development and Production Astro builds passed with the expected canonical origin and BlogGenius link. Focused deployer/workflow tests passed (7/7); both workflow YAML files parsed; `git diff --check` passed.
- Full unit suite: 2,550 passed, 0 failed. Five loopback-listener cases were excluded on rerun after sandbox `listen EPERM` errors (Trends API server tests x2; Astro preview runtime tests x3); one unrelated test was already skipped. `npm run test:unit` first stopped at the pretest `npm audit` gate, which reported 43 existing vulnerabilities including 2 high; dependency files were not changed.
- No remote Cloudflare deployment or mutation was run.

## Remaining checks

- User should confirm final visuals and copy after the first Development push deployment.
- First deployment still depends on Cloudflare environment credentials/zone access and hostname ownership permitting the expected Worker binding. A hostname bound to another Worker intentionally stops deployment and requires explicit cutover handling.
