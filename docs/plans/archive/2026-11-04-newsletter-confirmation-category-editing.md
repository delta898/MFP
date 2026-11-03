# Newsletter Confirmation Category Editing

## Branch and Status

- Branch: `codex/newsletter-category-confirmation`
- Base branch: `dev`
- Branch start date: 2026-11-04 (Asia/Seoul)
- Status: implementation complete; ready to merge and deploy to Development

## User Need

An existing subscriber who submits a different category set currently keeps
the old set without being told that the request was ignored. New subscribers
also cannot review or adjust their selection on the email confirmation page.
Use one confirmation flow for first subscriptions and preference changes.

## Goal and Scope

- Keep one subscriber row per normalized email.
- Show the categories requested on the signup page on the confirmation page.
- Let the recipient edit those categories before confirming.
- Apply a new subscription or category change only after the recipient submits
  the confirmation page.
- Keep an existing active subscription and its current categories unchanged if
  the request is ignored or expires.
- Make old/replaced/expired confirmation links unusable.
- Keep recipient category data and confirmation state private behind the
  Supabase Edge Function and service-role-only database RPCs.

## Non-Goals

- Telegram campaign notifications.
- Production newsletter campaign activation.
- Production CD configuration; revisit the same staged deployment flow after
  Development verification and independently review Production targets and
  approval gates.
- Changing newsletter copy or the public subscription form's category limit.
- Changing delivery revision, resend, or per-recipient delivery semantics.

## Agreed Design

1. Both first-time signup and an active subscriber's category change create a
   pending confirmation request and send an email.
2. The email link opens the existing confirmation page. Page load previews the
   requested categories without changing subscriber state.
3. The recipient may edit the preselected categories and must explicitly click
   the confirmation button to apply them.
4. Confirmation atomically applies the submitted, validated categories and
   records consent time/version. For an active subscriber, the old categories
   remain effective until confirmation succeeds.
5. An ignored or expired request leaves the current active subscription intact.
   A newer request replaces the outstanding confirmation token; old links are
   rejected.
6. The page-load preview is read-only so mail security scanners cannot activate
   a subscription or change preferences.

## Proposed Implementation Stages

1. Add private persisted state for a single outstanding active-subscriber
   category-change request, with token hash, requested categories, and expiry.
   Keep the existing pending signup fields for new/unsubscribed subscribers;
   update service-only RPCs to preview and atomically confirm both forms.
2. Extend the mailing Edge Function and Trends API public routes for preview
   and confirmation with recipient-selected categories. Preserve token
   validation, category catalog validation, consent policy, and generic public
   error handling.
3. Update the static confirmation page to load requested categories, allow
   editing, and apply only on explicit confirmation. Use the same category
   catalog source as the initial signup page where practical.
4. Update the signup response copy for new, unchanged-active, and
   change-requested cases, and keep the page from claiming a change was applied
   before confirmation.
5. Update the deployment/feature documentation and verify the static build,
   Edge Function typing, Worker syntax, and confirmation behavior tests.

## Decisions and Tradeoffs

- Keep one subscriber row per email; stage requested categories separately so
  active mail delivery never observes an unconfirmed change.
- A repeated request that matches the current active categories cancels any
  outstanding category-change request and returns an already-subscribed result
  without sending another confirmation email.
- A different category request for an active subscriber creates/replaces one
  pending request row. It does not modify active categories, consent, or the
  current unsubscribe token until confirmation succeeds.
- Confirming a new address still proves mailbox access; the same page can
  present editable initial categories and preference changes.
- Store only a hash of the confirmation token. The raw token remains in the
  recipient's email link and is never persisted.
- A read-only preview RPC returns requested categories for a valid token.
  Explicit confirmation submits the edited categories; the Edge Function
  validates the catalog and the database RPC consumes the token atomically.
- Existing confirmation tokens for pending signups remain usable across the
  migration; the new preview/confirm RPCs support the existing pending fields.
- No schema compatibility migration is added beyond the additive state needed
  for this already deployed feature; existing subscriber rows and delivery
  history must remain intact.
- Category count policy: both site pickers cap selection at three. The API
  Worker, Edge Function, subscriber storage, and staged change-request storage
  accept up to ten, so a future UI limit increase through ten does not require
  a server or schema change. Legacy subscriber compatibility is not a goal.

## Progress and Verification

- 2026-11-04: inspected current signup RPC, Edge Function, and confirmation
  page. Current behavior leaves active categories unchanged, returns a generic
  success response, and only confirms the token on the page; this motivates a
  preview plus explicit category-edit confirmation flow.
- 2026-11-04: added a service-role-only staged request table for active
  subscriber category changes. Requests replace one another, expire after 48
  hours, retain hashed tokens, and are cancelled when the subscriber
  unsubscribes. Active settings and unsubscribe tokens remain unchanged until
  confirmation.
- 2026-11-04: added read-only category preview and atomic category confirmation
  RPCs while retaining compatibility for existing pending signup links and
  older confirmation callers. Added matching Edge Function and public API
  preview/confirm actions, category-change email copy, shared static category
  catalog, editable confirmation UI, outcome-specific signup feedback, and
  deployment ordering documentation.
- 2026-11-04: extended the Development push workflow to build a static-site
  artifact and deploy it after the API and Newsletter Workers. The deployment
  uses the shared Site Hosting Cloudflare static-assets deployer, validates the
  environment, and requires the existing `bg-www-bloggenius-kr-dev` Worker;
  Production deployment is deferred for a separate environment review.
- Verification: all 15 mailing Edge Function tests pass, including category
  preview, edited-category confirmation, and active-category-change email
  behavior. `deno check`, API Worker and deploy-script syntax checks, the
  Development static-site build, workflow YAML parsing, SQL inventory and
  release-artifact tests, and `git diff --check` pass. The non-listener portion
  of the full unit suite passes with 2,492 tests passing and one pre-existing
  skip; five loopback
  listener tests were excluded because this sandbox returns `EPERM` when they
  bind `127.0.0.1`. The standard `npm run test:unit` pretest security audit
  reports existing dependency advisories, so the unit runner was invoked
  directly. No Cloudflare deployment or successful remote migration has run
  yet.

- Deployment correction: the first Development migration attempt exposed that
  the live database uses `mailing.trends_newsletter_subscribers`, renamed from
  `mailing.trends_subscribers` by migration `202611030006`. The new migration
  initially referenced the pre-rename name and failed before applying. Updated
  its foreign key and RPC definitions to use the current table name. A
  read-only catalog query confirmed the live relation; `supabase db push
  --dry-run` still lists only this migration as pending. The corrected
  migration has not yet been applied remotely.

## Remaining Risks / Follow-up

- Merge and push to `dev` to exercise the new automatic deployment sequence.
  Verify the Supabase migration and Edge Function, API and Newsletter Workers,
  and Dev static site; then check new signup, category editing, ignored request
  expiry, replacement links, and unsubscribe behavior before considering
  Production. Production should later receive the same staged CD flow after
  its environment-specific targets and approval controls are re-reviewed.
- Production newsletter deployment remains separate and is not part of this
  feature.
- This work does not send real mail during automated checks.
