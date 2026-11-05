# Newsletter signal revisions and static shared copy

- Branch: `codex/newsletter-dev-resend-static-edition`
- Start date: 2026-11-03
- Base/parent branch: `dev`
- Status: Implementation and verification complete; merge pending

## User need and goal

Use one collection completion signal and delivery policy in Development and
Production. Preserve delivery history while allowing an intentional new
delivery revision for a date. Keep ordinary collection signals idempotent and
resend disabled by default. Remove the unnecessary AI dependency for short
shared greeting/introduction copy.

## Scope and non-goals

- Extend delivery uniqueness to `(trend_date, delivery_revision,
  subscriber_id)` and retain all earlier recipient outcomes.
- Carry `forceResend` only on an explicitly constructed completion signal;
  default false. Expose it only for a single-date Development collector run.
- Keep Development resend operator-gated and enabled in the Dev Worker config
  for intentional testing; Production rejects explicit resend.
- Accept ordinary completion signals in both environments; reject Production
  `forceResend` until its operating path is agreed.
- Replace AI shared copy with deterministic date-based copy.
- No deployment, production resend operation, archive publishing, or Telegram
  notification.

## Design and affected boundaries

The collector emits a neutral completion signal after successful ingestion.
The Trends API validates and starts a signal-keyed Workflow in either
environment. The Workflow validates resend intent against its environment
gate, then a service-role RPC allocates/resumes the per-date revision. Delivery
claim, skip, and finalization RPCs include that revision. Supabase keeps
historical rows and refuses a new revision while the latest has `sending` or
ambiguous `held` outcomes. Production's API rejects explicit resend pending
separate operator agreement. Shared static copy belongs to the newsletter
edition module.

## Decisions and tradeoffs

- Existing Dev-only resend endpoint and row-clearing approach conflicted with
  the shared signal policy and audit history; replaced them with revision keys.
- Range/retry flags could accidentally resend many dates, so only the
  single-date Development collector accepts the explicit option; range scripts
  cannot set resend intent.
- The Development Worker gate is enabled for testing. Production signal
  sending can proceed normally, while resend stays unavailable pending user
  agreement.
- Prior ready shared edition remains stable once delivery has started; each
  resend revision reuses that edition.

## Progress and verification

- Preserved the existing uncommitted implementation and inspected callers,
  migrations, Workflow, Edge Function, and operator docs.
- Added revision-scoped delivery constraints and RPC contracts, signal-level
  resend behavior, static edition copy, and removed the AI Gateway adapter/config.
- Added a single-date Dev collector option and help guidance; range collectors
  remain unable to set resend intent. Added Production API rejection and
  enabled the Development Worker gate for testing.
- Updated architecture and operator docs to the shared signal/revision policy.
- Focused verification: collector tests (23), Trends API Worker tests (11),
  newsletter delivery/edition adapter tests (15), and mailing Edge Function
  tests (12) passed. Newsletter Worker Wrangler dry-run completed; Wrangler
  emitted a sandbox `EPERM` warning writing its optional log under user
  Preferences. The complete unit suite then found two expected-metadata
  mismatches; updated `supabase/inventory.json` and the release artifact
  migration assertions to include these migrations. Re-running all unit tests
  except five listener-dependent cases blocked by loopback `listen EPERM`
  passed: 2,492 passed, 0 failed, with those five skipped and one pre-existing
  skip. The standard `npm run test:unit` pretest still stops at `npm audit` due
  to 43 existing dependency findings (2 high); the test runner was executed
  directly. `git diff --check` passes.
- No migrations or Workers were deployed; no live email was sent.

## Final result and remaining work

Implementation and focused checks are complete. Development migration/Worker
deployment remains pending the normal integration flow. Production resend
operation needs separate user agreement before any implementation or rollout.
