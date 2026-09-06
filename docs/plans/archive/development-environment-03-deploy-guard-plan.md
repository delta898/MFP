# Development Environment Stage 3 — Deploy Guard

> Parent: `feature/development-environment-main`
> Branch: `feature/development-environment-03-deploy-guard`
> Production access or mutation: prohibited

## Scope

- require an explicit target and operation for Supabase mutation workflows;
- evaluate branch/target and operation/target policy before execution;
- resolve hosted project name/ref from target-specific environment variables;
- compare hosted target identity with the current Supabase CLI link;
- require exact production project-ref confirmation on an allowed branch;
- reject reset, seed, and fixture operations for production;
- print a secret-free text or JSON dry-run preflight result.

## Out of scope

- running Supabase migration, reset, seed, Function, Cron, secret, or link commands;
- creating local or hosted Supabase projects;
- reading or changing production schema;
- granting production deployment approval;
- storing hosted project identity or credentials in Git.

## Verification

- missing target/operation rejection;
- feature, dev, release, and main branch/target combinations;
- missing and mismatched hosted project/link metadata;
- production ref confirmation and prohibited-operation tests;
- safe text/JSON output contract;
- real CLI dry-run for allowed local and denied production cases;
- full unit regression before handoff.

## User action

No action is required during Stage 3. Development project name/ref are needed before Stage 5. Docker
and local Supabase are needed before Stage 4B. Production project configuration and approval remain
outside this stage.

## Handoff gate

The user reviews the safety behavior and automated results. Commit, parent merge, branch deletion, and
Stage 4A or 4B start require explicit requests. Stage 4A additionally requires separate approval for
read-only production inspection.
