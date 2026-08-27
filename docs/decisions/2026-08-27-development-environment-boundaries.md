# Development Environment Boundaries

## Status

Accepted for staged implementation on 2026-08-27.

## Context

BlogGenius desktop clients, Supabase Edge Functions, license and quota RPCs, keyword research, remote AI model catalog, surface content, and the server-managed knowledge gateway currently share one Supabase connection family. Database changes accumulated as manually applied SQL files, while builds inject one connection configuration without an explicit runtime environment profile.

This makes normal development vulnerable to accidental production reads or writes. It also prevents a new developer or CI job from recreating the backend from committed migrations and non-sensitive fixtures.

## Decision

### Canonical environments

BlogGenius uses exactly these initial environment names:

- `local`
- `development`
- `production`

`dev` is a Git branch name, not an environment alias. Unknown or missing values fail instead of falling back to production.

### Branch eligibility is not environment selection

- `feature/*` is eligible for `local` only.
- `dev` is eligible for `local` and `development`.
- `release/*` and `main` may become `production` candidates.
- No branch selects an environment by itself.
- Production still requires an explicit target, preflight, and user-approved release action.

The canonical code contract lives in `src/environment/contract.js`. It expresses eligibility only; deployment authorization remains a separate control added by the deployment guard stage.

### Environment configuration

`BLOGGENIUS_ENV` is the canonical selection input. The committed `supabase/environment-manifest.json` records configuration source names and safety capabilities, not credential values.

Desktop runtime may receive environment-specific public connection details. Server-only values remain in the target environment's secret store and must not be copied into the desktop app, seed data, logs, or Git.

### Database lifecycle

Production schema is evidence of current deployed truth, not the sole definition of desired design, and it is not contacted by ordinary tests. Existing repository SQL is also evidence rather than an authoritative replay sequence. A baseline is accepted only after reconciling:

1. a separately approved, schema-only production inspection;
2. the existing SQL intent inventory;
3. the current application code and automated contract expectations;
4. an object-by-object discrepancy report and explicit disposition;
5. a clean local rebuild;
6. a no-unexpected-diff comparison; and
7. a fresh hosted development deployment.

The read-only production audit and the baseline/local rebuild are independent review stages. Approval to develop environment separation does not authorize production inspection, and approval to inspect does not authorize a production mutation.

After baseline acceptance, schema changes use ordered `supabase/migrations/` files. Operational commands, content seeds, test fixtures, recovery scripts, and Cron activation remain distinct asset classes.

### External effects

Local and development environments deny live publishing, payment, and notifications by default. Development integrations use provider test channels, allowlists, sinks, and bounded budgets. Production is the only environment that may enable live external effects.

## Consequences

- Runtime clients must stop reading a single global Supabase connection directly.
- Build and deployment commands must require an explicit target.
- Existing SQL cannot be copied wholesale into migrations because it contains historical, operational, test, seed, and recovery assets.
- A hosted development Supabase project and environment-specific secret registration are required before remote integration testing.
- Production inspection and deployment remain separately approved actions and are not implied by feature development approval.

## Rejected alternatives

### Branch name automatically chooses the environment

Rejected because local feature work, development integration, release rehearsal, and production deployment can all occur from different execution contexts. Implicit selection increases the cost of a branch or CI configuration mistake.

### Keep production as the default when configuration is missing

Rejected because convenience is not worth accidental production access. Missing configuration must fail closed.

### Add staging immediately

Rejected for now because `local + hosted development + production` covers the current team and deployment scale. The manifest and resolver remain extensible if a distinct staging promotion gate becomes necessary.

### Convert every existing SQL file directly into a migration

Rejected because multiple files issue licenses, seed content, test pause/refresh behavior, restore production policy, or activate schedules. Treating those as schema history would make resets unsafe and non-deterministic.
