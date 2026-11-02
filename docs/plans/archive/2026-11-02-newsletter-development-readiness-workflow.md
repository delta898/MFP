# Newsletter Development Collection Signal and State

## Branch

- Branch: `codex/newsletter-dev-workflow`
- Start date: 2026-11-02
- Base/parent branch: `feature/naver-trends-mailing-list`
- Status: Merged into `feature/naver-trends-mailing-list`; full unit suite passed. Hosted Worker deployment and end-to-end collection verification remain.

## User need and goal

Newsletter automation must be developed in Development before Production. The collector supports collecting a single day or a date range. Completion for each date must be recognized without polling on a schedule, while collection completion must remain distinct from edition generation and email delivery. Duplicate or historical collection signals must not cause duplicate email sends.

## Scope

- After a complete per-date Development collector ingestion, signal the Development Trends API Worker; Production collection skips newsletter signaling in this stage.
- Start a private Development Cloudflare Workflow from that authenticated signal.
- Have the Workflow re-read and independently validate the target date's rows in Development Supabase.
- Persist one run-state row per date with independent collection, edition, and delivery states.
- Make repeated signals/evaluations idempotent and preserve edition/delivery state.
- Document migration and Dev deployment order; do not deploy remotely.

## Explicit non-goals

- No Production Workflow/API binding, secrets, migration, or deployment.
- No automatic Supabase migration or Edge Function deployment; the existing hosted-environment workflow intentionally validates drift without applying remote changes.
- No newsletter edition creation, AI generation, approval UI, Brevo campaign sending, recipient delivery rows, Telegram notification, or public archive.
- No recurring schedule. The account rejected scheduled Workflow triggers on deployment; event-triggering from the collector path is the selected direction.
- No Cloudflare management API token on the Mac Studio.

## Design and ownership

- Collector: `apps/trends/trends-collector/bin/collect.js` validates completeness, ingests the complete payload, then sends a small authenticated date-specific completion signal using the existing environment-matched internal Trends API credential.
- Trends API Worker: `apps/trends/trends-api/workers/src/index.js` validates the signal and uses a private cross-Worker Workflow binding. It returns a deterministic per-date Workflow instance ID; duplicate recent signals resolve to the existing instance, restarting only a failed/terminated attempt.
- Newsletter Workflow: `apps/trends/trends-newsletter/worker/` reads only the signaled date from its pinned Development Supabase target and checks exact category and distinct-keyword counts. It has no public route or schedule.
- State: `supabase/migrations/202611030001_trends_newsletter_run_state.sql` adds `mailing.trends_newsletter_runs`, unique by date within the isolated project. A service-role-only public RPC updates collection fields. `edition_status` and `delivery_status` are never changed by collection evaluation.
- Current completeness is 32 categories × 20 distinct keywords. The collector and Workflow both check the persisted result independently.

## Decisions and tradeoffs

- A completion event replaces the scheduled polling proposal. The collector already knows the target date and only writes after local completeness succeeds; the Workflow still verifies what reached Supabase.
- The collector signals only after the trend upsert succeeds. If signal delivery fails, rerunning that date is safe because trend ingestion is an upsert and Workflow identity is deterministic per date.
- `collect_range_development.sh` ingests and signals each date independently. `collect_range_production.sh` remains newsletter-signal-free. Each Development date gets its own row and Workflow instance.
- A repeated signal does not send email. This stage contains no campaign sending path. Future sending must require a separately approved edition and unique per-subscriber delivery claims before provider submission.
- The initial scheduled Workflow deployment attempt uploaded code but Cloudflare rejected the schedule trigger for this account. The schedule is removed; no claim is made that the uploaded resource is active.

## Progress

- 2026-11-02: Created this child branch from `feature/naver-trends-mailing-list`; initially implemented scheduled readiness polling.
- 2026-11-02: The user reported Cloudflare rejected Workflow schedules as requiring a paid plan for this account. Rechecked the local loop: it was bounded to 18 checks/35 steps; the previous 1,024-step figure was not applicable to that implementation.
- 2026-11-03: Revised the design to collector completion events so daily and range collections are supported without schedule dependency or a Cloudflare API token on the Mac.
- 2026-11-03: Added the post-ingest Collector signal, authenticated Trends API route, cross-Worker Workflow binding, single-pass readiness verification, and Dev-only Supabase state migration. Collection, edition, and delivery states are separate; collection RPC preserves edition/delivery fields.
- 2026-11-03: Committed the collection-readiness implementation as `b3fdbf02` (`feat: add dev newsletter collection readiness workflow`); the untracked `credentials/` directory was excluded.
- 2026-11-03: Added a GitHub Actions Dev Worker CI/CD workflow. Pushes to `codex/**` and PRs targeting this parent feature or `dev` validate both Workers with focused tests and Wrangler dry-runs; only a push to `dev` deploys, Workflow Worker first and Development Trends API Worker second. The deployment job uses the GitHub `development` environment and requires a scoped Cloudflare API token plus account ID.
- 2026-11-03: The user applied `202611030001_trends_newsletter_run_state.sql` to the Development Supabase project (`bvtlwjbmjnfphxlrkzhm`). `supabase migration list` showed the local and remote versions aligned, and `supabase db push --dry-run` reported the project up to date.

## Verification and remaining work

- Focused Collector tests: 19/19 passed. Trends API Worker tests: 7/7 passed. Newsletter readiness tests: 8/8 passed.
- Wrangler dry-runs packaged both Workers successfully and showed the expected cross-Worker Workflow binding. Logs were directed to a writable temporary path.
- Production collector signaling is explicitly skipped until Production rollout, so this Dev-only stage does not break existing Production collection.
- `git diff --check` passed.
- User must add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` to the GitHub `development` environment, merge the parent feature to `dev` when ready, then confirm the first successful CD run. This workflow deliberately does not run `supabase db push` or deploy Edge Functions.
- After first hosted deployment and migration, run one day plus a range/repeat signal in Development. Production remains untouched.
- No hosted Worker deployment or end-to-end collection run is included in this stage.


- 2026-11-03: Merged into `feature/naver-trends-mailing-list`; inventory and test expectations were synchronized with the new migration, Edge Function, and Development runtime behavior. Full unit suite passed: 2,466 passed, 1 skipped, 0 failed.

## Final result

The Development collection-completion signal, private readiness Workflow, per-date run state, and Worker CD configuration are integrated into the parent feature. The parent feature is being integrated into local `dev`; no remote `dev` push or Production deployment is included. First hosted Dev CD and end-to-end range/repeat signal checks remain follow-up work.
