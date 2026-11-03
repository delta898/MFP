# Newsletter Environment Idempotency

## Branch and status

- Branch: `codex/newsletter-dev-retry-policy`
- Start date: 2026-11-03
- Base/parent branch: `dev`
- Status: implementation and full unit suite complete; ready to merge into dev; Development migration and Worker deployment pending

## User need and goal

Development testing must allow intentional repeat requests for the same trend date so the complete signal-to-edition path can be exercised more than once. Production must continue to deduplicate newsletter work by trend date. Replayed delivery of the same request must remain idempotent.

## Scope and non-goals

- Give each intentional Development collector signal a stable UUID and create a distinct Workflow instance for it.
- Keep Production Workflow identity date-based, so repeated signals for one date do not create duplicate work.
- Store per-signal execution outcomes and edition snapshots in a private Supabase attempts table.
- Allow Development to create and save a fresh shared edition on each distinct signal; preserve existing ready-edition reuse when regeneration is disabled.
- Update collector/API/Workflow docs and focused tests.
- No Production Worker deployment, campaign delivery, email sending, public archive, or data deletion.

## Design

- Collector creates one `signalId` UUID per intentional completion signal. An exact retry reuses that ID; a later collector invocation gets a new ID.
- Trends API builds a Development Workflow ID from date plus signal ID. Production remains date-only.
- Supabase keeps the current per-date run and latest-edition rows and adds a private attempt ledger keyed by signal ID, with Workflow ID, readiness report, outcome statuses, error code, and a snapshot of each generated edition.
- Development Worker config opts into regenerating a ready edition for every distinct signal. The RPC's default remains non-replacing so a future Production caller can preserve date-level idempotency.

## Decisions

- Development intentionally favors repeatability for verification; Production favors one execution per date.
- Duplicate delivery of the same signal is distinct from an intentional rerun and is suppressed by the stable signal ID.
- Keep the current date-level run and edition as the latest operational view; retain per-signal evidence separately.
- Preserve all existing rows. No cleanup or reset of Supabase data is part of this change.

## Verification and remaining work

- Focused Trends API Worker, collector, and Newsletter Worker tests pass.
- Full unit suite: 2,483 passed, 1 skipped (2,484 total). The normal `pretest:unit` audit gate still reports the repository dependency advisories, so the suite body was run with `--ignore-scripts`.
- Remote Development migration application and Cloudflare deployment remain manual follow-up steps.
- After deployment, send two intentional Dev signals for one date and confirm two attempt records, two Workflow instances, and the latest edition updates; resend one identical signal ID and confirm it does not create another instance.
