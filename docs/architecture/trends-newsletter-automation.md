# Naver Trends Newsletter Automation

## Status

Development implementation is in progress. Signup, double opt-in, unsubscribe,
collection readiness, and shared edition generation have been implemented and
verified in Development. The recipient-specific campaign renderer, private
Edge Function batch sender, per-recipient delivery ledger, stable campaign
unsubscribe token, and Workflow integration are implemented on the feature
branch and have focused mocked tests. These delivery changes have not been
deployed or exercised against Brevo yet.

Implementation begins in Development. Production remains untouched until the
Development flow has passed its operational checks and the user explicitly
approves the Production rollout.

## Goals

- Send a daily, category-personalized Naver Trends briefing soon after the
  previous day's results become available, usually around 07:30 Korea time.
- Avoid relying on an operator being awake or present to start the process.
- Keep shared editorial content as a reusable dated asset.
- Prevent duplicate sends and honor active/unsubscribed status at send time.
- Alert the operator through Telegram when a run completes or needs attention.
- Keep Development and Production isolated across data, Workers, Workflows,
  AI configuration, email policy, links, and operator notifications.

## Current Verified Components

| Component | Development | Production |
| --- | --- | --- |
| Public site | `www-dev.bloggenius.kr` | `www.bloggenius.kr` |
| Trends Worker | `trendapi-dev.hangadac.com` | `trendapi.hangadac.com` |
| Supabase project | `bvtlwjbmjnfphxlrkzhm` | `hocfjolcthvtgfaxjmse` |
| Subscriber lifecycle | Implemented and end-to-end verified | Not rolled out |
| Trends collector | Mac Studio process writes through the matching Trends API | Existing operator-run production path |
| Readiness Workflow and shared edition | Deployed and previously verified | Not rolled out |
| Recipient campaign delivery | Feature branch only; focused tests pass, deployment and live Dev verification pending | Not implemented |

Keep using the existing Supabase mailing tables and purpose-specific
`trends-mailing-list` Edge Function for subscribe, confirmation, and
unsubscribe. Do not make the browser responsible for sending campaigns.

## Proposed Runtime Ownership

```text
Mac Studio collector
  -> environment-matched Trends API Worker (authenticated trend ingestion)
  -> matching Supabase trends table
  -> authenticated date-specific completion signal
  -> environment-matched Newsletter Workflow
  -> verify persisted date/category/keyword completeness
  -> upsert collection state, leaving edition and delivery state untouched

  -> create/load shared dated edition
  -> keyset-batched active subscribers -> per-recipient briefing -> allowlist check
  -> unique per-date/subscriber claim -> Brevo -> delivery outcomes
  -> Telegram run summary (later stage)

Public site
  -> display the approved dated shared-edition archive
```

Cloudflare Workflows are the durable orchestration owner. The collector already
knows which date it collected and only writes after its completeness check; it
now sends a small authenticated signal after the trend upsert succeeds in
Development only. Production collector runs skip newsletter signaling until a
separate Production rollout is approved. The
Trends API Worker starts the separate Newsletter Workflow through a private
cross-Worker binding, so the Mac Studio does not need Cloudflare API
credentials. The Workflow re-reads Supabase and verifies the source rows before
recording readiness. No schedule is used: this account rejected scheduled
Workflow triggers during deployment, while event triggering handles daily and
range collection without an always-on process.

The existing `trends-mailing-list` Edge Function owns both subscription
lifecycle actions and the private `deliver_batch` action. The batch action is
called only by the authenticated Newsletter Worker, is Development/allowlist-
only, returns aggregate counts and a keyset cursor, and never places email
addresses in Workflow payloads or logs. Production sending is denied.

## Daily Run and Readiness Rules

1. Each successfully ingested Development collection date gets one
   authenticated signal. `collect_range_development.sh` sends one signal per
   date;
   `collect_range_production.sh` remains isolated from newsletter signaling.
   The signal uses the same environment-specific internal Trends API token as
   collection ingest; no Cloudflare management token is stored on the Mac. If
   signaling fails after the trend upsert, the collector warns and exits
   successfully so range collection continues; rerun that date to retry its
   signal.
2. The API Worker accepts only the configured environment and exact source,
   date, category-count, and item-count contract. A private Workflow binding
   starts the Dev Workflow; it has no public HTTP route.
3. The Workflow reads only the signaled date from its pinned Supabase project
   and validates source rows. Current expected completeness is **32
   categories × 20 distinct keywords = 640 items**.
   Check both the overall count and that each expected category has its
   expected number of items; a total of 640 alone could hide a missing category
   and duplicated rows. Keep the expected category set/count and per-category
   target configurable so a future Naver change does not require rewriting the
   orchestration logic.
4. Persist collection state separately from edition and delivery state in
   `mailing.trends_newsletter_daily_status`, keyed by trend date in each isolated
   environment database. Development assigns a UUID to each completion signal
   and starts one Workflow attempt per distinct UUID; replaying the same UUID
   reuses the same Workflow. This lets Development rerun generation without
   deleting date-level state. Production uses a deterministic date-keyed
   Workflow ID, so multiple signals for one date are deduplicated. The SQL RPC
   only updates collection fields, so a range collection cannot initiate a
   send.
5. Persist the shared edition's
   source date, content version, AI model/fallback metadata, selected links,
   approval/publication state, and timestamps.
6. In batches of at most five, read active subscribers in UUID keyset order.
   The current signup UI limits selection to three categories; the API and
   database allow up to ten so the product limit can change without tightening
   those boundaries. Include all 20 collected keywords from each selected
   category, ordered by rising items first
   with the largest increase first, then `NEW`, then falling items with the
   smallest decrease first (for example, -2 before -5), and steady items last.
   Keep Naver's display order for ties. Add movement details, the full-trends
   link, shared greeting/article, and the fixed BlogGenius download banner/link.
7. Check the Development allowlist before submission and atomically re-check
   active subscription state while claiming the unique
   `(trend_date, subscriber_id)` delivery row. `sent`, `failed`, `held`, and
   `sending` claims are never automatically submitted a second time. A
   previously skipped allowlist address can be claimed later if it is added to
   the allowlist before a subsequent run. A timeout or ambiguous Brevo result
   is marked `held` for reconciliation, not resent.
8. When the run settles, send a Telegram summary with the date, completion
   status, recipient success/failure counts, and edition URL when available.
   Send separate actionable alerts for incomplete collection, content
   validation failure, provider failure, and a held run.

The Development readiness slice reads only `trends.items` for the signaled
date and upserts a durable record in `mailing.trends_newsletter_daily_status`. The
record has independent `collection_status`, `edition_status`, and
`delivery_status` fields. Each signal also has a row in
`mailing.trends_newsletter_collection_logs`, keyed by its UUID, with its own collection
report, status, bounded error code, and edition snapshot. Collection signals
update only collection evidence. After collection is verified complete, the
Development Workflow rebuilds the shared edition on each new signal; the
date-level edition table holds the latest draft while the attempt ledger keeps
prior snapshots. The same signal UUID remains idempotent. Production's
date-keyed workflow retains date-level deduplication. The Workflow builds an
edition by checking ordered RSS sources configured in the
Development Worker, then uses one configured Cloudflare AI Gateway BYOK model
for a short greeting/introduction. The initial sources are `blog.gongzza.com`
and `blog.naver.com/amadejjs`. On feed failure or no valid entry, selection
falls through to the next source. The saved snapshot contains only source,
title, a bounded summary, link, date, and optional image URL; full article
content is not saved. Code selects and snapshots article, download page, and
banner links; AI does not receive or invent URLs. The private
`mailing.trends_newsletter_editions` table is unique by trend date. Its save
RPC preserves a ready edition by default; the Development Worker explicitly
opts into replacing it for a distinct retry signal. A failed attempt is held
for a later retry. The recipient-delivery feature branch adds a private batch
path: the Edge Function pages active subscribers, enforces the Development
allowlist, renders personalized email, claims a unique date/subscriber ledger
row, and submits through Brevo. The Workflow stores only aggregate results and
a UUID cursor. Campaign delivery remains Development-only and is not yet
deployed or live-tested. This stage still does not publish a public archive or
notify Telegram. Source lives under
`apps/trends/trends-newsletter/`, with readiness and edition policy in `src/`,
external RSS/AI/Supabase adapters under `src/adapters/`, and Workflow
orchestration under `worker/`. The expected category list remains explicitly
configured in Wrangler and currently duplicates the Trends API Worker's
newsletter category set; centralizing that stable contract is a follow-up
before taxonomy changes.

The `(trend_date, subscriber_id)` unique key is the deduplication boundary.
Brevo acceptance followed by a lost response remains ambiguous; hold the row
for reconciliation rather than risking a duplicate message. No automatic
resend/reconciliation console is included in this stage.

## Content and Public Archive

- AI receives the trend date and short editorial brief. It writes only the
  common greeting/introduction. The first Development implementation uses one
  explicitly configured Cloudflare AI REST model; provider fallback is later
  work and is not required for this draft stage.
- Application logic chooses links from curated, verified records (for example
  BlogGenius posts, guides, and downloads), enforces a small configured maximum,
  checks each destination, and applies rotation/recency rules to avoid
  repetitive or excessive links.
- Store the common edition in `mailing.trends_newsletter_editions` as the
  canonical editorial record. Development uses private service-role-only RPCs;
  this stage adds no public archive API.
  Recipient-specific trend sections and email addresses stay private and are
  never written to the public edition.
- The user chose a dedicated dated archive menu on `blog.gongzza.com` for the
  eventual public edition archive. That WordPress menu/post implementation is
  a later stage; this stage only stores the shared edition in Supabase.

## AI Gateway and Fallback

- Call AI server-side from the Newsletter Worker/Workflow. Never put AI
  provider keys in SSG output or browser requests.
- Use Cloudflare AI Gateway with provider-specific BYOK endpoints for a
  configured model. Provider credentials stay in the Gateway's environment
  configuration; the Worker holds only its Gateway authentication token and
  the selected provider/model/alias settings. A
  fallback means try the next provider on a configured failure or timeout, not
  call every provider serially to improve the same draft.
- Keep provider/model order, timeout, retry policy, max output size, and prompt
  version in environment configuration. Log the successful fallback step and
  model identifier, not secrets.
- Validate generated copy for length, required date/context, unsafe markup, and
  absence of fabricated links. A failed generation or validation holds the
  send; it does not silently fall back to unreviewed or empty prose.
- Future options such as the user's LM Studio host or NVIDIA NIM can be
  evaluated as custom HTTPS providers. They are not a dependency for the first
  Development slice; a home-hosted model must be reachable securely from
  Cloudflare and must not expose a private LAN endpoint publicly.

## Development / Production Isolation

Use the same source code with explicit environment-specific Cloudflare
deployments/configuration. Do not infer the environment from browser hostname
inside the campaign backend.

| Boundary | Development | Production |
| --- | --- | --- |
| Worker / Workflow deployment | Separate Worker script or explicit Wrangler environment and separate Workflow binding/state | Separate Worker script or explicit Wrangler environment and separate Workflow binding/state |
| Supabase | Development project only | Production project only |
| Subscriber/delivery/edition data | Development project tables | Production project tables |
| AI Gateway | Development gateway, provider keys/alias, Worker auth token, and model config | Production gateway, provider keys/alias, Worker auth token, and model config |
| Email | Brevo allowlist mode only; test recipient(s) | Live mode only after explicit rollout approval |
| Public links | `www-dev.bloggenius.kr` and Development routes | `www.bloggenius.kr` and Production routes |
| Telegram | Development chat/bot destination | Production operator destination |

Worker names, Workflow names/bindings, environment variables, and secrets must
be visibly distinct. The Development Workflow must never have a Production
Supabase URL/key, Brevo live setting, public host, or Telegram destination.
Production secrets are not copied into Development. The same Cloudflare account
may own both resource sets, so separating names/configuration does not
necessarily isolate account-wide quotas, invoices, or usage dashboards. If
strict cost/billing isolation is required, assess separate Cloudflare accounts
before rollout; that is not required for functional environment safety.

Production rollout is a deliberate promotion after Development evidence is
reviewed. There must be no shared test subscribers, no cross-environment links,
no Development confirmation token resolving against Production, and no
Development test campaign sent outside the configured allowlist.

## Development Worker Delivery

`.github/workflows/environment-validation.yml` owns the Development release
sequence on pushes to `dev`: build the immutable Supabase artifact, preview and
apply pending migrations to the explicit Development project, deploy the
`trends-mailing-list` Edge Function, read remote migration and Function state,
verify drift and safe HTTP behavior, then run focused Worker tests and Wrangler
dry-runs before Worker deployment. The newsletter Workflow Worker deploys
first; the Development Trends API Worker deploys second.
Same-branch workflow runs are serialized so two pushes cannot apply migrations
or deploy Workers concurrently. The latest queued commit includes earlier
commits and applies every migration still missing remotely.

`.github/workflows/validate-trends-newsletter-workers.yml` validates pull
requests targeting `dev` or the newsletter parent feature branch and pushes to
`codex/**` or `feature/**`. It runs focused tests and Wrangler dry-runs only; it
does not access hosted Development credentials or deploy resources.

Configure the GitHub `development` environment with `CLOUDFLARE_API_TOKEN` as
an environment secret and `CLOUDFLARE_ACCOUNT_ID` as an environment variable.
Also configure the Development Supabase access token, database password,
project ref, URL, and publishable key expected by the environment validation
job. The Supabase CLI uses an explicit remote project ref and does not link or
mutate any Production project. Runtime Worker secrets remain in Cloudflare and
are not copied into GitHub Actions. On a push to `dev`, the workflow deploys the
`trends-mailing-list` Edge Function after applying migrations; its runtime
secrets remain managed in Supabase and are not set by the workflow. Production
has no automatic migration, Edge Function, or Worker deployment path. Protect
the GitHub `dev` branch with required pull requests and validation checks if
changes must pass before landing. A migration failure stops before Edge Function
deployment; a later drift, smoke, or Worker validation failure stops before
Worker deployment.

## Cost and Free-Tier Notes (checked 2026-11-02)

“Cloudflare AI Gateway and Workflows are free” is not an accurate total-cost
statement.

- **Workflows:** available on Free and Paid Workers plans. Free currently
  includes 100,000 invocations/day shared with Workers requests, 10 ms CPU per
  invocation, 3,000 steps/day, and 1 GB-month state storage. Paid includes
  monthly request/CPU/step/storage amounts and charges for overages. Current
  published Paid inclusions are 10 million requests, 30 million CPU ms,
  500,000 steps, and 1 GB-month storage; overage rates are documented by
  Cloudflare. A sleeping Workflow does not consume CPU; state storage and steps
  still count. The exact account plan and usage must be checked before enabling
  a schedule.
- **Workers AI:** currently includes 10,000 Neurons/day at no charge. Usage
  above that requires a Paid Workers plan and is currently $0.011 per 1,000
  Neurons. Actual cost depends on the selected model and token/compute use.
- **AI Gateway:** the core gateway features (analytics, caching, rate limiting)
  are currently free. Gateway routing does not make OpenAI, Anthropic, or other
  provider inference free. Provider calls are billed by the provider, or via
  Cloudflare Unified Billing where enabled; Cloudflare documents a 5% fee on
  purchased Unified Billing credits. Fallback attempts can make more than one
  model request, so the budget should account for each attempt.
- **Other services:** Brevo, Telegram, Supabase, and any public hosting/API
  costs follow their own plans and limits. Cloudflare logs/retention or Logpush
  may also have separate pricing depending on account age and configuration.
- Having separate Development and Production resources does not by itself
  guarantee separate quotas or billing. Their usage can accrue to the same
  Cloudflare account. Set spend limits/alerts where available and monitor AI
  calls, Workflow steps, and email volume during Development.

Recheck provider pricing and the account's plan/usage before Production rollout;
prices and included quotas can change.

## Implementation Stages

1. **Design/config contract:** finalize readiness and manual approval controls,
   curated link source/limit, archive publishing mechanism, AI fallback order,
   and delivery ambiguity policy. Keep all environment names and credentials
   explicit.
2. **Development collection signal/state:** apply the run-state migration to
   Dev Supabase, deploy the Dev Newsletter Workflow, then deploy the Dev
   Trends API binding and Collector signal. Verify one date, duplicate signal,
   multi-date collection, incomplete rows, and read/write failure handling.
   Keep email, AI, and Telegram disabled in this stage.
3. **Shared edition:** add idempotent daily edition storage and deterministic
   verified-link selection; then connect AI Gateway for the short common
   intro, with schema/quality checks and recorded model metadata.
4. **Development delivery:** recipient selection, personalized content,
   per-recipient idempotency, Dev allowlist enforcement, and Brevo batch sending
   are implemented on `feature/trends-newsletter-recipient-delivery`, with
   mocked focused tests. Before live Dev verification, apply the new delivery
   ledger migration; a push to `dev` applies it and deploys the updated
   `trends-mailing-list` Edge Function and newsletter Worker automatically.
   Then verify an allowlisted send, out-of-list suppression, unsubscribe,
   provider failure/ambiguity, and duplicate suppression. Ambiguous outcomes
   are held for manual reconciliation; there is no automatic resend or
   reconciliation UI.
5. **Telegram operations:** add completion and actionable failure summaries
   after delivery behavior is stable. Telegram is not part of the current
   delivery implementation.
6. **Public archive:** implement the chosen website/API publishing path and
   ensure it exposes only approved shared edition fields.
7. **Production promotion:** after Development is stable and the user approves,
   provision separate Production settings/secrets and deploy the same reviewed
   code against Production services. Start with explicit readiness and send
   controls, then enable unattended delivery after observed clean runs.

## Open Decisions Before Implementation

- Whether any separate time window or manual hold is needed before edition
  drafting; collection readiness itself is event-driven and date-specific.
- Whether the 32-category/20-item completeness expectation should come from a
  versioned configuration table or Worker configuration and how category set
  changes are approved.
- Public archive mechanism: read-only API-backed static shell vs automated
  static page generation/deploy.
- Curated links data model, verification cadence, maximum links per edition,
  and anti-repetition rules.
- Initial AI provider/model order, per-provider timeout, retry behavior,
  allowable cost per edition, and maximum fallback attempts.
- Whether the first Development campaigns require approval for each edition or
  only a global test-mode approval gate before sending to the allowlist.
- Telegram token/chat secret names and Development vs Production destinations.
- Brevo batch size, provider event/reconciliation strategy, and retention for
  detailed delivery outcomes.
- Whether account-wide Cloudflare billing is acceptable or strict account
  isolation is needed.

## Official References

Pricing and capability claims above were checked on 2026-11-02:

- [Cloudflare Workflows pricing](https://developers.cloudflare.com/workflows/reference/pricing/)
- [Cloudflare Workflows limits](https://developers.cloudflare.com/workflows/reference/limits/)
- [Cloudflare scheduled Workflow triggers](https://developers.cloudflare.com/workflows/build/trigger-workflows/)
- [Cloudflare Workers AI pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/)
- [Cloudflare AI Gateway pricing](https://developers.cloudflare.com/ai-gateway/reference/pricing/)
- [Cloudflare AI Gateway fallbacks](https://developers.cloudflare.com/ai-gateway/configuration/fallbacks/)
