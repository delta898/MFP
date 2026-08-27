# Development Environment Stage 1 — Contract and Inventory

> Parent: `feature/development-environment-main`
> Branch: `feature/development-environment-01-contract`
> Production mutation: prohibited

## Scope

- define canonical environment names and branch target eligibility;
- record a secret-free environment manifest;
- inventory every current Supabase consumer, SQL asset, Edge Function, Cron, Storage, Auth, secret, and build surface;
- classify existing SQL by lifecycle rather than treating every file as a migration;
- define the separately approved production baseline procedure;
- add tests that fail when committed SQL or Edge Function assets are missing from the inventory.

## Out of scope

- selecting an environment at runtime;
- changing existing Supabase clients;
- creating a hosted development project;
- starting or resetting local Supabase;
- dumping, modifying, or deploying to production;
- migrating existing data or migration history.

## Deliverables

- `src/environment/contract.js`
- `supabase/environment-manifest.json`
- `supabase/inventory.json`
- contract and structure tests
- environment boundary ADR
- human-readable architecture inventory and baseline procedure

## Decisions captured

- canonical values are `local`, `development`, and `production`;
- `dev` is not an alias for `development`;
- branch policy limits target eligibility but never performs implicit selection;
- feature branches are local-only, `dev` may use hosted development, and release/main are production candidates;
- production still requires separate approval;
- unknown branches and missing environment values fail closed;
- the currently linked `BlogPostingQuota` project is classified as production;
- existing SQL is evidence to classify, not an authoritative replay sequence;
- production schema, repository SQL intent, and application code/test contracts must be reconciled before accepting a baseline;
- production schema represents deployed truth but is not the sole definition of desired design;
- production audit and baseline construction are separate Stage 4A and Stage 4B branches;
- production is not contacted during Stage 1.

## Verification

- focused environment contract tests;
- inventory completeness tests for all committed SQL and Edge Function assets;
- secret-value absence checks for committed environment metadata;
- full unit regression before Stage 1 handoff.

## Handoff gate

After automated verification, the user reviews the contract and inventory outcome. Merge, branch deletion, and Stage 2 start remain separate explicit approvals.
