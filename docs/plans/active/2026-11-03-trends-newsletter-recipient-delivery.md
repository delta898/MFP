# Trends Newsletter Recipient Delivery

## Branch and status

- Branch: `feature/trends-newsletter-recipient-delivery`
- Base branch: `dev`
- Start date: 2026-11-03
- Status: implemented and verified on feature branch; ready to merge into `dev`; Development only; not deployed

## User need and goal

The Development readiness Workflow can verify complete Naver trend collection
and save a shared edition, but it does not yet create category-specific email
content or send it. Implement the next agreed stage: send a personalized
briefing to active subscribers, while honoring the Development email allowlist
and avoiding duplicate delivery per date and subscriber.

## Scope

- After a complete collection has a ready shared edition, run a durable,
  bounded recipient-delivery process.
- Include each active subscriber's selected categories, top 10 trend items per
  category, movement details, and a link to the complete trend view.
- Add the shared greeting/introduction, one curated article, and BlogGenius
  download banner/link without asking AI to generate URLs.
- Use the existing private `trends-mailing-list` Edge Function and Brevo
  integration; keep Brevo credentials in Supabase Edge secrets.
- Enforce `NEWSLETTER_EMAIL_MODE=allowlist` and the configured recipient list
  in Development.
- Recheck active status at the atomic delivery claim, persist one outcome per
  `(trend_date, subscriber_id)`, and never automatically resubmit an ambiguous
  provider outcome.
- Keep unsubscribe available in every campaign email using a stable signed
  subscriber token; retain existing confirmation and random-token unsubscribe
  behavior.
- Update the newsletter automation architecture/runbook and focused tests.

## Explicit non-goals

- Production rollout, Production email, or Production environment variables.
- Public archive or WordPress posting, Telegram notification, campaign UI, or
  manual approval controls.
- Automatic retry/resend of a claimed delivery after an ambiguous Brevo
  outcome; an operator-facing reconciliation stage can be designed later.
- AI-generated trend summaries or links.

## Design and ownership

- Workflow sequencing and durable batch checkpoints belong in
  `apps/trends/trends-newsletter/worker/`.
- Recipient selection, email content policy, and presentation belong to the
  Trends Newsletter Application under `apps/trends/trends-newsletter/src/`.
- The private Supabase Edge Function is the trusted delivery adapter: it reads
  subscribers/trends/edition, enforces the email mode, atomically claims a
  recipient, calls Brevo, and persists an outcome. It returns aggregate counts
  and a keyset cursor only; subscriber addresses are not returned to Workflow
  history or logs.
- Supabase migration owns the service-role-only delivery ledger and RPC
  contracts. Existing migrations are immutable; additions go in a new
  migration even though no compatibility with an unreleased client is needed.
- Campaign unsubscribe URLs use an HMAC-signed stable subscriber token because
  the existing table stores only a hash of the signup-time unsubscribe token.
  The signing secret stays in the Supabase Edge Function environment.

## Decisions and tradeoffs

- Development is allowlist-only. An address outside that allowlist is never
  sent mail.
- The unique date/subscriber claim favors no duplicate email over automatic
  resend if Brevo accepted a message but its response was lost. Such outcomes
  remain held for later reconciliation.
- Recipient email and category preferences remain private and do not enter the
  shared edition record.
- The user confirmed no release/backward compatibility exists yet. This permits
  shaping new contracts freely, but does not justify editing migrations already
  applied to Development.

## Implementation stages

1. Add the delivery ledger, guarded claim/finish RPCs, and stable-token
   unsubscribe RPC.
2. Add a category-specific email model/HTML+text renderer and focused tests.
3. Extend the private Edge Function with bounded campaign batches, allowlist
   enforcement, Brevo submission, and status persistence.
4. Extend the Workflow to call batches after a ready edition and finalize the
   dated run without exposing recipient PII in Workflow step data.
5. Update architecture/runbook documentation and Development CI so a `dev`
   push deploys this Edge Function after migrations and verifies remote
   Function state. Then run focused tests and Wrangler dry-run validation. No
   actual deploy or Git operation is included.

## Progress and verification

- Created from a clean `dev` worktree at the start of the feature.
- Added the delivery ledger and service-only RPCs in migration
  `202611030004_trends_newsletter_recipient_delivery.sql`; prior applied
  migrations were not edited.
- Added a personalized HTML/text renderer with category top 10 and movement,
  complete-trends link, shared edition/article, download banner, and stable
  signed unsubscribe link.
- Added the authenticated `deliver_batch` Edge Function action. It is locked to
  Development plus `allowlist`, checks the allowlist before and after the
  atomic claim, sends through Brevo, and returns aggregate counts only.
- Extended the Workflow to process bounded batches with durable checkpoints;
  subscriber addresses are not stored in Workflow history. A fully sent date
  short-circuits subsequent signals. Once any delivery claim starts, subsequent
  signals reuse the frozen shared edition instead of making another AI call.
- Added the shared application renderer to the Supabase release fingerprint so
  changes to email content cannot bypass Development artifact drift checks.
- Added Development CI deployment for `trends-mailing-list`, limited to pushes
  on `dev`; it runs after migration application and before remote Function-state
  verification. The manual `development-drift` dispatch remains non-deploying,
  and Production remains without automatic Function deployment.
- Added migration 004 to `supabase/inventory.json` after the full suite exposed
  the missing canonical migration registration.
- Focused checks: Deno check passed; Edge Function handler tests 8/8 passed;
  newsletter Worker/Application tests 30/30 passed; `git diff --check` passed.
  Release artifact tests passed 5/5 after including the shared renderer.
  Wrangler dry-run completed with expected bindings/config, while Wrangler
  printed an EPERM warning for its user-level log file path.
- Focused environment workflow and structure checks passed 24/24, including the
  exact migration inventory check; `git diff --check` passed.
- Full repository suite rerun with only the five loopback-listener cases
  excluded by name under the sandbox `EPERM` exception: 2,485 passed, 0 failed,
  1 existing skipped. Excluded cases were `createServer leaves health public
  and protects data endpoints with the configured token`, `ingest rejects a
  collector from another Trends environment before database access`, `Astro
  runtime installs locked site dependencies, builds, and serves dist on
  loopback`, `Astro runtime builds a site before starting preview when no
  output exists`, and `Astro runtime builds and serves a draft preview without
  recording a persistent Site build`. All other tests passed. The loopback
  listener behavior remains unverified in this sandbox. No Development
  migration apply, live email, or deploy has been performed.

## Remaining risks and manual checks

- Development Cloudflare Worker must receive the private Edge Function token;
  Supabase must receive the stable unsubscribe signing secret before deployment.
- Before Dev verification, push the feature through the agreed integration
  path to `dev`; CI will apply migration 004, deploy the updated
  `trends-mailing-list` Edge Function, and deploy the newsletter Worker. Verify
  that the GitHub `development` environment has its Supabase credentials. The
  Edge Function runtime secrets remain in Supabase and must already be present.
- Validate the email visually and exercise one real allowlisted Development
  delivery after deployment; automated tests will mock Brevo.
- Brevo acceptance followed by a lost response cannot be safely inferred. The
  delivery must be held instead of resent automatically.
- Production behavior remains unimplemented and requires a separate explicit
  rollout.
- Feature implementation is committed as `ca8829de`. The user authorized
  merge into `dev`, feature branch deletion, and push after the remaining
  full-suite checks passed with the narrowly scoped sandbox exception.
