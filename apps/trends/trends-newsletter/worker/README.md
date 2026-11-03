# Trends Newsletter Collection Workflow (Development)

This Development Worker verifies collection readiness, creates or reuses the
shared edition, and sends per-subscriber Development briefings through the
private mailing Edge Function. Recipient-specific delivery is implemented on
the current feature branch, but has not yet been deployed or live-tested. It
does not publish an archive post or notify Telegram.

## Event flow

1. The collector verifies the configured category/item completeness before
   ingesting a date.
2. After the Development Trends API confirms the upsert, the Development
   collector sends an authenticated completion signal to that same API Worker.
   Production collector runs skip newsletter signaling in this stage. A Dev
   `collect_range_development.sh` run sends one signal per date. The
   Production wrapper, `collect_range_production.sh`, does not signal the
   newsletter workflow in this Development-only stage.
   If the signal fails after the trend upsert, the collector records a warning
   and exits successfully so a range run proceeds to the next date. Re-run the
   affected date later to retry its signal.
3. The Trends API validates the internal token, environment, source, date, and
   expected count contract, then starts the private Workflow binding. Each Dev
   signal carries a UUID and gets its own Workflow instance, so an intentional
   rerun can rebuild the edition. Replaying the same signal UUID is idempotent
   and returns the existing instance. Production remains date-keyed and
   deduplicates runs by trend date.
4. The Workflow reads the signaled date from Development Supabase, independently
   verifies 32 categories × 20 distinct keywords, and calls the state RPC.
5. The collection RPC upserts one row per date in
   `mailing.trends_newsletter_runs`, changing only collection fields.
6. After a complete collection, the Workflow records a separate attempt by
   signal UUID, then checks the configured RSS sources in priority order, selects the newest
   valid item from the first usable feed, asks the configured Cloudflare AI
   model for a short greeting and introduction, validates the copy, and saves
   one dated snapshot. Only the title, short summary, link, date, source name,
   and optional image URL are retained; full post content is not stored. AI
   never creates URLs.
7. The date-level edition row stores the latest generated draft; each attempt
   stores its own collection report, terminal status, and edition snapshot.
   Dev deliberately replaces a ready date-level draft on a new signal. A
   repeated signal UUID never regenerates it. Once delivery has started, later
   signals reuse the frozen edition and do not spend another AI call. Generation
   failures mark that attempt held and do not send email; a new signal can retry it.
8. Once an edition is ready, the Workflow calls the private
   `trends-mailing-list` Edge Function in keyset batches of at most five active
   subscribers. The Edge Function selects each subscriber's categories, reads
   that date's trends, renders the top 10 items per selected category with
   movement details, and adds the shared article and BlogGenius download CTA.
   It checks `NEWSLETTER_EMAIL_MODE=allowlist` and the recipient list before
   calling Brevo. The Workflow receives aggregate counts and cursors only.
9. Supabase records one unique outcome per `(trend_date, subscriber_id)`.
   Atomic claims prevent concurrent signals or retries from sending the same
   recipient twice. A failed or ambiguous Brevo outcome is not automatically
   retried; ambiguous outcomes are held. Campaign unsubscribe uses a stable
   signed subscriber token and the existing unsubscribe page. Repeated signals
   after a date is fully sent do not enumerate or resend recipients.

The source and environment are pinned to Development project
`bvtlwjbmjnfphxlrkzhm`. The Workflow validates both the environment marker and
Supabase hostname. Never configure Production credentials in this deployment.
The collector uses its existing Development Trends API token; it does not need
Cloudflare management credentials.

## Development Supabase migration

On a push to `dev`, GitHub Actions previews and applies any pending migrations
to the explicit Development Supabase project before it checks drift and deploys
either Development Worker. A failed migration stops the run before Worker
deployment. This automatic path does not target Production. For local or
recovery use, the migrations can also be applied manually after verifying the
linked/ref target is Development:

- `202611030001_trends_newsletter_run_state.sql` creates private per-date run
  state.
- `202611030002_trends_newsletter_shared_editions.sql` creates the private
  edition snapshot and service-role-only read/save/hold RPCs exposed through
  `public`.
- `202611030003_trends_newsletter_attempts_and_dev_retries.sql` adds the
  private per-signal attempt ledger and makes ready-edition replacement an
  explicit RPC option. Development enables that option; the default preserves
  the existing ready edition.
- `202611030004_trends_newsletter_recipient_delivery.sql` adds the private
  per-date/per-subscriber delivery ledger and service-only claim, outcome,
  summary, and stable-token unsubscribe RPCs. It also prevents a ready shared
  edition from changing after delivery claims begin.

These RPCs are separate from the mailing-list signup Edge Function.

## Worker secrets

From this directory, set the Development Supabase URL and server-side secret
key interactively. Do not paste their values into source control or chat:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put CLOUDFLARE_AI_GATEWAY_TOKEN
npx wrangler secret put TRENDS_NEWSLETTER_WORKER_TOKEN
```

The key must be the Development project's server-side secret key with read
access to `trends.items` and execute access to the `public` RPC. Do not use a
Production key.

Configure these non-secret Development Worker variables in `wrangler.toml`:

- `CLOUDFLARE_AI_GATEWAY_ID`: the ID of the Development AI Gateway.
- `CLOUDFLARE_AI_BYOK_ALIAS`: `development`, matching the alias configured for
  the Development provider key in that gateway.
- `NEWSLETTER_AI_PROVIDER`: provider slug, such as `openai`.
- `NEWSLETTER_AI_MODEL`: model name accepted by that provider, without a
  provider prefix.
- `NEWSLETTER_BLOG_FEEDS`: ordered JSON list of `{name, feedUrl, siteUrl}`.
  Feed failure or no valid published item advances to the next configured
  source. The initial Development list contains BlogGenius and the Naver Blog
  `amadejjs`; do not add source credentials to this setting.

Add the chosen provider API key to the Development AI Gateway as a BYOK key
with the `development` alias. `CLOUDFLARE_AI_GATEWAY_TOKEN` is a separate
Cloudflare AI Gateway authentication token; the Worker sends it in the
`cf-aig-authorization` header and sends the alias in
`cf-aig-byok-alias`. It is not the provider API key, a Cloudflare account API
token, or the GitHub deployment token. The Worker uses the provider-specific
Gateway endpoint, so generation uses the configured Gateway BYOK key rather
than Cloudflare Unified Billing. Do not copy Production gateway IDs, aliases,
provider keys, or URLs into Development. Wrangler config sets the Development
download page and banner URLs.

Cloudflare references: [Bring your own keys](https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/)
and [AI Gateway REST API](https://developers.cloudflare.com/ai-gateway/usage/rest-api/).

## Focused checks

```sh
npm test
npx wrangler deploy --dry-run
```

The Trends API Worker has its own focused tests and config validation:

```sh
cd ../../trends-api/workers
npm test
npx wrangler deploy --dry-run --env=""
```

Collector tests can run from the repository root:

```sh
node --test apps/trends/trends-collector/bin/collect.test.js
```

## Development deployment order

The standard path is a push to `dev`; `.github/workflows/environment-validation.yml`
applies pending migrations, deploys the `trends-mailing-list` Edge Function,
checks the remote state, tests both Workers, then deploys the newsletter
Workflow Worker followed by the Development Trends API Worker.
`.github/workflows/validate-trends-newsletter-workers.yml` runs tests and
dry-runs on feature branches and pull requests without deployment.

For manual recovery only, after a failed or intentionally skipped Dev release,
confirm you are targeting Development before running the relevant command:

1. Apply all four SQL migrations to the Development Supabase project.
2. A push to `dev` deploys the `trends-mailing-list` Edge Function after
   migrations. If that step failed, deploy it manually from the repository root:

   ```sh
   supabase functions deploy trends-mailing-list --project-ref bvtlwjbmjnfphxlrkzhm
   ```

3. Confirm both Edge Function and Worker have the same
   `TRENDS_NEWSLETTER_WORKER_TOKEN`; the Edge Function also needs
   `NEWSLETTER_UNSUBSCRIBE_TOKEN_SECRET`, Brevo API key/sender, and Dev
   allowlist settings. Keep values in their respective secret stores.
4. From this directory, deploy the Workflow Worker:

   ```sh
   npm run deploy:development
   ```

5. Deploy the Development Trends API Worker so its cross-Worker Workflow
   binding and authenticated completion endpoint are active:

   ```sh
   cd ../../trends-api/workers
   npm run deploy:development
   ```

6. Run one Development collection date and inspect the matching Workflow,
   `mailing.trends_newsletter_runs`, `mailing.trends_newsletter_attempts`, and
   `mailing.trends_newsletter_editions` rows. Re-run the same date and confirm a
   new attempt and edition snapshot are created; retrying an identical signal
   UUID must reuse its existing Workflow. Run a date range and confirm one
   date-level run/edition plus one attempt per signal.

There is no Cron schedule and no public `workers.dev` endpoint. The Workflow
calls the configured AI model only after collection completeness passes and
sends only to the Development allowlist. Telegram notifications and Production
configuration/rollout are out of scope. A real allowlisted delivery remains a
manual Dev verification step; automated tests mock Brevo and do not send mail.
