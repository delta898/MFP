# Naver Trends Newsletter Automation

## Status

Development baseline for the next implementation stages. Signup, double
opt-in, unsubscribe, and the Development browser-to-email flow are implemented
and verified. The first Development signal-to-state slice is implemented
locally: after a complete date is ingested, the collector signals the matching
Trends API Worker, which starts the Newsletter Workflow. The Workflow verifies
persisted rows and records collection state in Supabase. Edition drafting and
bulk delivery are not implemented.

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
| Readiness Workflow | Implemented locally; deployment still pending | Not implemented |
| Campaign drafting / delivery | Not implemented | Not implemented |

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

Future, separately gated stages:
  -> create/load shared dated edition -> draft -> operator approval
  -> unique per-subscriber delivery claims -> Brevo -> delivery outcomes
  -> Telegram run summary

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

The existing mailing Edge Function is currently a signup lifecycle service.
Bulk campaign delivery is a separate capability and must be designed with
bounded batches, provider error classification, suppression checks, and
idempotent per-recipient outcomes; do not overload signup actions with campaign
semantics.

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
   `mailing.trends_newsletter_runs`, keyed by trend date in each isolated
   environment database. Repeated signals upsert the same date; the dated
   Workflow instance ID prevents duplicate recent executions. The SQL RPC only
   updates collection fields, so a range collection cannot initiate a send.
5. For a future approved edition, persist its
   source date, content version, AI model/fallback metadata, selected links,
   approval/publication state, and timestamps.
6. Build recipient content from the common edition plus the recipient's
   currently active category preferences and that date's matching trends.
7. Re-check subscription/suppression state immediately before sending. Record
   one unique delivery row per `(edition_date, subscriber_id)` and claim it
   atomically before provider submission. Retries must resume or reconcile the
   row rather than blindly submitting a second email when provider outcome is
   ambiguous.
8. When the run settles, send a Telegram summary with the date, completion
   status, recipient success/failure counts, and edition URL when available.
   Send separate actionable alerts for incomplete collection, content
   validation failure, provider failure, and a held run.

The first implemented slice reads only `trends.items` for the signaled date and
upserts a durable Development record in `mailing.trends_newsletter_runs`. The
record has independent `collection_status`, `edition_status`, and
`delivery_status` fields. Repeated signals update collection evidence but
preserve edition and delivery values. Workflow IDs suppress duplicate active
or retained executions for a date; after Cloudflare expires an instance from
its retention window, a later signal may run readiness again. That remains
safe because this stage only updates collection fields and cannot send mail.
Future delivery must additionally use atomic per-recipient delivery claims,
which are independent of Workflow instance identity. It does not access
subscribers, call AI, send mail, or notify Telegram. Source lives under
`apps/trends/trends-newsletter/`, with readiness/persistence rules in `src/`
and the Workflow runtime under `worker/`. The expected category list is
configured explicitly in Wrangler and currently duplicates the existing
Trends API Worker's newsletter category set; centralizing that stable contract
is a follow-up before taxonomy changes.

The `(edition_date, subscriber_id)` key is the proposed deduplication boundary.
The implementation must define how to reconcile a timeout after Brevo accepted
an email but before the workflow received the response; provider idempotency or
message lookup should be used where available, otherwise an ambiguous state
must be held for reconciliation rather than automatically resent.

## Content and Public Archive

- AI receives the date, selected trend summaries, and a short editorial brief.
  It writes only the common greeting/introduction and optionally a short
  category-aware transition. It does not invent or validate URLs.
- Application logic chooses links from curated, verified records (for example
  BlogGenius posts, guides, and downloads), enforces a small configured maximum,
  checks each destination, and applies rotation/recency rules to avoid
  repetitive or excessive links.
- Store the common edition in Supabase as the canonical editorial record.
  Recipient-specific trend sections and email addresses stay private and are
  never written to the public edition.
- Public archive proposal: add a dated Newsletter/Trend Letter page to the
  existing site. Since the site is SSG, choose one of these delivery mechanisms
  before implementation:
  1. keep a statically built archive shell and fetch approved public editions
     from a read-only endpoint; or
  2. generate static dated pages and trigger the hosting build/deploy after an
     edition is approved.

The read-only archive approach avoids coupling each daily edition to a full
site rebuild, but it introduces a public API and runtime loading. The static
page approach has no runtime API dependency but requires a trusted automated
publish/build trigger. The user has proposed a dated public post; the publishing
mechanism remains an open implementation decision.

## AI Gateway and Fallback

- Call AI server-side from the Newsletter Worker/Workflow. Never put AI
  provider keys in SSG output or browser requests.
- Use Cloudflare AI Gateway as the routing/observability layer for a configured
  fallback sequence, for example Workers AI then a paid hosted provider. A
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
| AI Gateway | Development gateway/config and dev provider credentials or Workers AI binding | Production gateway/config and prod provider credentials or Workers AI binding |
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
4. **Development delivery:** implement recipient selection, per-recipient
   idempotency and recovery, batch sending via the dedicated email backend,
   Dev allowlist enforcement, and Telegram summaries. Verify incomplete data,
   provider failures, unsubscribes during a run, retry behavior, and duplicate
   suppression.
5. **Public archive:** implement the chosen website/API publishing path and
   ensure it exposes only approved shared edition fields.
6. **Production promotion:** after Development is stable and the user approves,
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
