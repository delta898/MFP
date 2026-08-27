# Development Environment Inventory

## Purpose

This document is the human-readable environment and Supabase inventory. The machine-readable source is `supabase/inventory.json`; `scripts/environment-contract-structure.test.js` keeps it aligned with committed SQL and Edge Function files.

The inventory records paths and roles only. It does not contain credentials, user data, provider secrets, or production row data.

## Current linked project

- Project name: `BlogPostingQuota`
- Classification: `production`
- Local metadata source: ignored `supabase/.temp/linked-project.json`
- Rule: ordinary development commands must not use the linked project implicitly.

The project ref is intentionally resolved from target-specific configuration during preflight rather than copied into this document.

## Desktop Supabase consumers

| Area | Current path | Responsibility |
| --- | --- | --- |
| License and quota | `src/license.js` | license registration, recovery, quota, plan and usage RPCs |
| Runtime settings | `src/runtime-config.js` | remotely managed runtime values |
| AI model catalog | `src/ai/remote-model-catalog.js` | server-managed model catalog |
| Keyword research | `src/keyword-research/supabase-client.js` | keyword Edge Function gateway |
| Knowledge gateway | `src/knowledge/server-gateway-client.js` | news and managed provider snapshots |
| Surface content | `src/surface-content/supabase-provider.js` | configurable app content and assets |

These consumers currently receive `LICENSE_CHK_URL` and `LICENSE_CHK_KEY` through the shared config loader. Stage 2 replaces the direct shared pair with the selected environment profile while retaining compatibility only at the resolver boundary.

## Operator-only service consumer

`apps/trends/trends-api/src/server.js` uses a server-side Supabase secret and has its own deployment lifecycle. It participates in the common environment naming and safety rules, but its server secret must never flow through the desktop resolver.

## Edge Functions

- `issue-trends-access-token`
- `keyword-research`
- `knowledge-gateway`
- `send-license-code`
- `serpapi-news-collector`

Shared provider, access-token, contract, collection, and operations modules live under `supabase/functions/_shared/`. The structure test requires every TypeScript function asset to be inventoried.

## Database asset classes

### Baseline candidates

These files describe current domains that must be reconciled against the production schema before creating the baseline:

- license v4 and quota v5
- runtime config
- AI model catalog
- keyword research
- knowledge gateway
- SerpApi observation corpus and collection operations
- smart capability usage
- surface content and Storage bucket policy
- operator-only trends schema

`baseline_candidate` does not mean the file can be applied as-is. Production schema remains the current deployed truth until reconciliation is complete.

### Ordered change candidates

Hotfixes and later additions such as SNS capability, weekly keyword documents, registration audit, license status, quota, and usage policy must be folded into a coherent baseline or retained as post-baseline migrations based on production inspection.

### Seeds

Surface content account, dashboard, recommendation, developer blog, draft catalog, ebook, and support files are content seeds. Stage 4 decides which deterministic, non-sensitive subset belongs in local seed data. Product or production campaign content is not automatically a development fixture.

### Operator and test actions

License issuance, test license issuance, pause/refresh test scripts, and Pro preview scripts are commands or fixtures rather than schema migrations. They require target-aware wrappers before reuse.

### Recovery actions

Surface content pause/refresh restore and production policy restore files are recovery runbook inputs. They must never run during local reset or normal deployment.

### Deployment activation

The SerpApi collection Cron SQL activates schedules and external calls. It is applied only after schema, functions, secrets, budgets, and target checks pass.

### Superseded history

License precheck, v2, and v3 are retained as historical implementation inputs. They are not replayed before the v4 baseline candidate.

## Managed surfaces

| Surface | Current evidence | Stage requirement |
| --- | --- | --- |
| Database/RPC/RLS | root and trends SQL | ordered migrations and drift checks |
| Edge Functions | `supabase/functions/` | target-aware deploy and smoke tests |
| Cron | SerpApi Cron SQL | separate activation gate |
| Storage | surface content SQL | bucket and policy migration verification |
| Auth | no committed project config found | explicit environment checklist before hosted deployment |
| Secrets | build injection and Supabase secret store | per-environment secret names and no desktop leakage |
| Desktop release | GitHub workflow, `build.sh`, `build.bat` | production config only in approved release builds |

## Production baseline procedure

This procedure is designed now but executed only after explicit approval to perform read-only production inspection.

1. Confirm clean working tree, current branch, Supabase CLI version, selected target, project name, and project ref.
2. Refuse to proceed if the linked project does not match the configured production target.
3. Capture schema only. Do not dump application rows, auth users, email, HWID, billing data, Storage objects, Vault values, or secrets.
4. Separately inventory Edge Functions, Cron jobs, extensions, Storage buckets/policies, and Auth settings because a public schema dump is not the complete environment.
5. Compare the sanitized schema with `supabase/inventory.json` and the application code/test contracts.
6. Classify every discrepancy as production-only drift, repo-only unapplied intent, superseded history, operator data, platform-managed state, or an intentional environment difference.
7. Review the resulting Stage 4A audit report before constructing a migration.
8. Build an initial migration in Stage 4B from approved objects, then apply it to a fresh local stack.
9. Run core RPC/RLS contract tests and confirm a second local reset produces the same schema.
10. Apply the same migration set to a fresh hosted development project.
11. Review migration diff and only then reconcile production migration history. Never mark migrations applied merely to silence a mismatch.

No production command is run as part of Stage 1.

## Inventory maintenance

When adding or removing a committed SQL or Edge Function asset:

1. update `supabase/inventory.json` in the same change;
2. assign an explicit classification;
3. run `node --test scripts/environment-contract-structure.test.js`; and
4. update this document when the responsibility or lifecycle changes.
