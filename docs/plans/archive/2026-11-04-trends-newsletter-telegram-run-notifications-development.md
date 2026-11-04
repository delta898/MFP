# Trends Newsletter Telegram Run Notifications

## Branch and status

- Branch: `codex/trends-newsletter-telegram-run-notifications`
- Base/parent: `dev`
- Start date: 2026-11-04
- Status: implementation and full unit verification complete; merged into `dev`; Development deployment verification remains.
- The user approved this branch/parent workflow after the implementation was already present in the `dev` worktree. This record captures the completed implementation before commit and integration.

## Need, goal, and scope

The operator needs one Telegram summary for every collector process, including failures before the newsletter Workflow can start. A successful collector run should report only after the newsletter mail attempt settles; a failed run should report its stage and bounded cause.

Scope: authenticated collector run reports, per-run idempotency, success/failure Telegram summaries in the Development Newsletter Workflow, and date-range continuation with a final failed-date exit status. Production rollout, Worker secret provisioning, and live Telegram/mail verification are excluded.

## Design and boundaries

- Collector creates one UUID per process and submits either a `collected` or `failed` report to the environment-matched Trends API Worker.
- Trends API Worker validates the report and starts the existing private Workflow keyed by date and run UUID. The API Worker does not send Telegram messages.
- Newsletter Workflow skips newsletter processing for collector failures and sends their summary. Successful collection proceeds through readiness, edition, and delivery, then sends one durable summary step with aggregate outcomes.
- Telegram credentials and administrator chat ID are Worker secrets. Summaries exclude subscriber addresses.
- Range collection remains one collector process per date, continues after failures, and exits nonzero with failed dates listed.

## Decisions and tradeoffs

- User chose one alert per collector process rather than one per date-independent Workflow or one aggregate range alert. Therefore a range covering N dates may produce N Telegram messages.
- The collector run ID reuses the existing Workflow idempotency boundary, so retries do not create a second Workflow for the same run.
- Telegram send failure is logged and does not change newsletter delivery results. Delivery to Telegram cannot be guaranteed when the collector cannot reach the API Worker or the Telegram service is unavailable.
- Only Development is configured by this feature; Production remains separately gated.

## Progress and verification

- Implemented collector run IDs and bounded failure reports, authenticated API validation, Workflow summary dispatch, and range failure continuation.
- Updated the Newsletter Worker README and canonical newsletter automation architecture document.
- Focused verification: collector tests (24), Trends API Worker tests (11), Newsletter Worker tests (36), range script syntax, `git diff --check`, and Wrangler dry-runs.
- Full unit verification: 2,496 passed, five loopback-listener tests skipped after each failed with sandbox `listen(127.0.0.1)` `EPERM`, and one unrelated existing test skipped by its own conditions.
- The standard `npm run test:unit` lifecycle stopped at its `npm audit --audit-level=high` pretest because the existing dependency tree reports 43 vulnerabilities, including two high. The full unit runner was run directly after approval; no dependency changes were made.
- Wrangler generated both dry-run bundles; it also reported that its log file could not be written under the restricted user Preferences directory (`EPERM`). The commands exited successfully.
- No remote deployment or real Telegram/email side effect was performed.

## Remaining work

- Obtain approval for the full unit suite, required before merging a parent feature into `dev`.
- Deploy the Development Newsletter and Trends API Workers, then verify one failed collector run and one successful allowlisted delivery produce one summary each.
- Production destination, secrets, and rollout require a separate decision.
- Feature commit: `40a8aec7` (`feat: notify Telegram for newsletter collector runs`).
- Merge and push completed after the approved full unit run.
- Post-deployment correction: Cloudflare rejected a zero-retry `StepConfig` as invalid before the Telegram call. The summary step now uses `NonRetryableError` on send failures, preserving one-attempt behavior without an invalid config and avoiding duplicate alerts when Telegram's response is ambiguous.
