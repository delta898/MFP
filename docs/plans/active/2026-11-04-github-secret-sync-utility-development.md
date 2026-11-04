# GitHub Secret Sync Utility Development

## Branch record

- Branch: `codex/github-secret-sync-utility`
- Base branch: `dev`
- Start date: 2026-11-04
- Status: Ready for review

## User need and goal

The user wants to avoid entering environment secrets manually in GitHub, Cloudflare, and Supabase dashboards. A local utility should read environment-specific, Git-ignored files and register values in the matching GitHub Environment. A later `dev` push should let GitHub Actions deploy code and propagate each environment's secrets to the relevant Cloudflare Workers and Supabase Edge Function.

## Scope

- Add `.secrets/.secret.dev.env` and `.secrets/.secret.prod.env` as local-only inputs, with safe tracked templates/documentation as appropriate.
- Add a common GitHub secret sync utility and fixed-target Development and Production shell entry points under `scripts/secrets/`.
- Validate environment selection, allowed secret names, required values, and GitHub CLI readiness before mutation; never print secret values.
- Extend existing Development CD to provision the relevant Newsletter Worker and Supabase Edge Function secrets from GitHub Environment secrets before/with code deployment.
- Keep Development and Production isolated. Production secret registration must be explicitly confirmed. No Production deployment is introduced in this feature.
- Add focused tests and update the deployment/secret ownership documentation.

## Non-goals

- Committing secret values or changing production services.
- Running the sync utility against a real GitHub Environment during development.
- Adding an automated Production deployment or enabling Production newsletter delivery.
- Changing secret values, rotating credentials, or performing remote deploys in this task.

## Design and boundaries

- The utility is repository operations tooling in `scripts/secrets/`, not product Application behavior.
- Environment-specific local files are input sources only; GitHub Environments remain the CI source of truth.
- The existing GitHub Actions workflow remains the deployment path and maps only the secrets needed by each remote service.
- A reviewed manifest/allowlist defines secret names and target consumers. Logs contain names/status only.

## Decisions made with the user

- Local files live under `.secrets/` and are named `.secret.dev.env` and `.secret.prod.env`.
- Shared utility: `scripts/secrets/sync-github-secrets.js`.
- Fixed-target wrappers: `dev_sync_github_secret.sh` and `prod_sync_github_secret.sh`.
- Use the existing GitHub Actions deployment path after secrets are registered; keep Development and Production separate.

## Implementation progress

- 2026-11-04: Inspected existing environment files by variable names only. Root `.env.development` and `.env.production` already serve Desktop connection settings; Trends Collector, local Supabase, and legacy Docker each own separate files, so the new dedicated `.secrets/` location avoids mixing responsibilities.
- 2026-11-04: Created this feature branch from `dev`.
- 2026-11-04: Added ignored environment secret inputs and templates, environment-pinned shell wrappers, a validated GitHub CLI sync utility, and Development Actions provisioning for Newsletter Worker and Edge Function secrets. Production sync only targets GitHub; no Production deployment was introduced.
- 2026-11-04: First interactive run exposed `EAGAIN` from synchronous terminal reads before secrets were changed. Replaced the prompt with Node's asynchronous readline interface and added an interactive-stream regression test.
- 2026-11-04: Review narrowed new credentials to the preflight/sync/deploy steps and preserved the Newsletter Worker's existing `SUPABASE_URL` secret binding by sourcing its value from the Development GitHub variable during deployment.

## Verification and follow-up

Focused utility and workflow contract tests pass (8 utility tests plus the existing workflow contract tests); Newsletter Worker tests pass (38). Wrangler Development dry-run completed and printed the expected bindings; this sandbox denied Wrangler's optional log-file write under the user's Library Preferences, though the dry-run exited successfully. Workflow YAML parses, shell/JavaScript syntax checks pass, and `git diff --check` is clean. Remote GitHub secret registration, Cloudflare/Supabase mutation, and Production operation were not run.
