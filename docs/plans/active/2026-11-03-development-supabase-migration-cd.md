# Development Supabase Migration CD

## Branch and status

- Branch: `codex/dev-supabase-migration-cd`
- Start date: 2026-11-03
- Base/parent branch: `dev`
- Status: implementation complete; awaiting Development push verification
- Commit: none

## User need and goal

Make Development deployment repeatable from a GitHub push so a newly added
Supabase migration is not forgotten before the newsletter Workers deploy. The
user wants to work against Development first; Production behavior and rollout
remain unchanged.

## Scope

- Apply pending Supabase migrations automatically to the Development project
  during the existing Development environment validation workflow.
- Run the post-apply migration/Function drift checks and public smoke check.
- Deploy Development newsletter and Trends API Workers only after that workflow
  succeeds, using the exact source revision that passed validation.
- Update engineering documentation and the existing workflow contract check to
  describe the new order.

## Explicit non-goals

- No Production migrations, Worker deployments, secrets, or workflows.
- No automatic Supabase Edge Function deployment or secret changes.
- No changes to database schema or migration contents.

## Proposed flow

```text
push to dev
  -> build immutable Supabase artifact
  -> dry-run Development migrations
  -> apply pending Development migrations
  -> inspect remote migration and Function state
  -> verify drift and safe public smoke
  -> publish Development promotion evidence
  -> validate newsletter Workers
  -> deploy Development Workers
```

The environment-validation workflow owns Dev database mutation, evidence,
Worker validation, and Worker deployment in one ordered run. A Development-only
credential set and explicit project reference are required. Production has no
automatic path.

## Decisions

- Development migrations are applied by GitHub Actions after a push to `dev`,
  with an explicit dry-run first. The Dev job uses hosted Development secrets
  and the Development project ref.
- Existing `development-promotion-*` artifact remains the source for the
  Production checklist; it is uploaded only after migrations, drift validation,
  and the safe smoke succeed.
- Worker validation and deployment are downstream jobs in the same workflow as
  the migration/drift gate, avoiding an independent push-trigger race.
- Use a fixed Supabase CLI release that supports the explicit remote-project
  target syntax. Do not link the hosted database as a side effect when an
  explicit target is available.
- Edge Functions and Production remain separately reviewed operations.

## Progress

- Confirmed the current `environment-validation.yml` only reads remote migration
  state; it does not apply pending SQL migrations.
- Confirmed Worker deployment currently starts on the same `dev` push, so it
  can race the separate drift workflow.
- Added a dry-run followed by automatic application of pending Development
  migrations, then remote-state/drift/smoke validation.
- Moved Development Worker validation and deployment into downstream jobs of
  the environment-validation workflow. Feature/PR Worker checks remain
  deployment-free.
- Added same-ref workflow concurrency to serialize Development releases.
- Updated the existing workflow contract test and canonical newsletter docs.
- The first CI attempt showed `4.0.0` is not a published Supabase CLI version.
  `supabase/setup-cli@v3` is the GitHub Action major, not the Supabase CLI
  version. Pin the CLI to `3.0.0-beta.17`, which includes the `--remote`
  syntax required by this workflow.
- Focused workflow contract test passed (5/5).
- Both changed workflow files parse as YAML and `git diff --check` passes.
- Full unit suite passed: 2,483 passed, 0 failed, 1 skipped. The suite was run
  directly because `npm run test:unit` stops at its `pretest:unit` audit gate.
- `npm audit --audit-level=high` currently reports two high severity findings.
  These are pre-existing dependency advisories, separate from this change. The
  user explicitly accepted recording this risk and continuing with integration.

## Verification and remaining risks

- A future push to `dev` is the end-to-end confirmation that migrations apply
  before Dev Worker deployment and that promotion evidence remains available.
- No hosted service was contacted during implementation or verification.
- GitHub Development environment must contain the Supabase PAT, DB password,
  project ref, URL, and publishable key already used by the drift check.
- No Production changes are included.
