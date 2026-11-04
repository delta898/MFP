# Trends Newsletter Collection Workflow (Development)

This Development Worker is the private Workflow entry point and orchestrator:
it verifies collection readiness, creates or reuses the shared edition, and
sends per-subscriber Development briefings through the private mailing Edge
Function. The separate Trends API Worker handles collector ingestion, trend
reads, and public browser subscription requests. Recipient-specific delivery
is deployed and verified in Development. The Dev code supports signal-scoped
same-date resend and creates shared copy with a randomized greeting, static
date-based introduction, and a random article selected from valid candidates
across all configured RSS feeds. It does not publish an archive post or notify
Telegram.

## Event flow

1. The collector verifies the configured category/item completeness before
   ingesting a date.
2. After the environment-matched Trends API confirms the upsert, the collector
   sends an authenticated completion signal to that API Worker. A range run
   sends one signal per date. Production newsletter delivery is not enabled in
   the current newsletter Worker deployment.
   If the signal fails after the trend upsert, the collector records a warning
   and exits successfully so a range run proceeds to the next date. Re-run the
   affected date later to retry its signal.
3. The Trends API validates the internal token, environment, source, date, and
   expected count contract, then starts a private Workflow instance keyed by
   date and signal UUID. Replaying the same signal UUID is idempotent and
   returns the existing instance. The signal may include `forceResend: true`;
   it defaults to false.
4. The Workflow reads the signaled date from Development Supabase, independently
   verifies 32 categories × 20 distinct keywords, and calls the state RPC.
5. The collection RPC upserts one row per date in
   `mailing.trends_newsletter_daily_status`, changing only collection fields.
6. After a complete collection, the Workflow records a separate attempt by
   signal UUID, then gathers valid items from all configured RSS sources and
   randomly selects one candidate. It chooses a natural greeting from a fixed
   list, builds the introduction from the date, validates the copy, and saves
   one dated snapshot. Only the title, short summary, link,
   date, source name, and optional image URL are retained; full post content is
   not stored.
7. The date-level edition row stores the latest generated draft; each attempt
   stores its own collection report, terminal status, and edition snapshot.
   Dev deliberately replaces a ready date-level draft on a new collection
   signal when delivery has not started. A repeated signal UUID never
   regenerates it. Once delivery has started, later signals reuse the frozen
   edition. RSS failures mark that attempt held and do not send email; a new
   signal can retry it.
8. Once an edition is ready, the Workflow calls the private
   `trends-mailing-list` Edge Function in keyset batches of at most five active
   subscribers. The UI limits selection to three categories; API and storage
   allow up to ten. The Edge Function reads all 20 items per selected category,
   ordering increases by largest
   amount first, then `NEW`, then decreases closest to zero first, then steady
   items; ties retain Naver display order. It adds movement details, the shared
   article, and BlogGenius download CTA.
   It checks `NEWSLETTER_EMAIL_MODE=allowlist` and the recipient list before
   calling Brevo. The Workflow receives aggregate counts and cursors only.
9. Supabase records one unique outcome per
   `(trend_date, delivery_revision, subscriber_id)`. Normal signals reuse the
   latest revision and remain idempotent. An explicit `forceResend: true`
   signal allocates a new revision without deleting prior outcomes. Sending or
   ambiguous held outcomes block a new revision. Atomic claims prevent
   concurrent runs from sending the same recipient twice within a revision.
   Campaign unsubscribe uses a stable signed subscriber token and the existing
   unsubscribe page.

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
- `202611030005_trends_subscriber_category_limit.sql` raises the stored
  subscriber category ceiling to ten while the public signup UI remains at
  three.
- `202611030006_rename_trends_newsletter_tables.sql` renames the date status,
  collection log, and subscriber tables without deleting or recreating rows;
  it also updates the dependent RPC function bodies.
- `202611030007_trends_newsletter_static_shared_copy.sql` makes AI metadata
  optional for ready editions and persists deterministic static-copy metadata.
- `202611030008_trends_newsletter_delivery_revisions.sql` adds
  revision-scoped campaign outcomes. Explicit resend creates a new revision
  while preserving prior delivery history; sending or ambiguous outcomes block
  another revision.

These RPCs are separate from the mailing-list signup Edge Function.

## Worker secrets

From this directory, set the Development Supabase URL and server-side secret
key interactively. Do not paste their values into source control or chat:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TRENDS_NEWSLETTER_WORKER_TOKEN
```

The key must be the Development project's server-side secret key with read
access to `trends.items` and execute access to the `public` RPC. Do not use a
Production key.

Configure this non-secret Development Worker variable in `wrangler.toml`:

- `NEWSLETTER_BLOG_FEEDS`: ordered JSON list of `{name, feedUrl, siteUrl}`.
  Feed failure or no valid published item advances to the next configured
  source. The initial Development list contains BlogGenius and the Naver Blog
  `amadejjs`; do not add source credentials to this setting.

The current newsletter Worker uses deterministic date-based shared copy and
does not require an AI Gateway, provider key, or AI Gateway token. Wrangler
config sets the Development download page and banner URLs.

## Explicit resend signal

Normal completion signals omit `forceResend` (false by default). Resend intent
belongs to one completion signal, and is off by default. A single-date
Development collector run may add it with `--force-newsletter-resend`. Range
collection does not expose this option, preventing accidental multi-date
resends. Normal collection does not propagate it. The Development Worker
enables `NEWSLETTER_RESEND_ENABLED="true"` in its checked-in config for testing.
Supabase allocates the next delivery revision and
keeps all earlier recipient outcomes. A normal repeat reuses the latest
revision and does not send another email. A new revision is refused while the
previous revision has a `sending` or ambiguous `held` outcome. Replaying the
same signal UUID remains idempotent. Production rejects explicit resend
requests pending a separately agreed operator path.

The signal contract is environment-neutral, but newsletter delivery is
currently deployed and verified only in Development. The Development allowlist
continues to apply to every revision.

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

1. Apply all seven SQL migrations to the Development Supabase project.
2. A push to `dev` deploys the `trends-mailing-list` Edge Function after
   migrations. If that step failed, deploy it manually from the repository root:

   ```sh
   supabase functions deploy trends-mailing-list --remote=bvtlwjbmjnfphxlrkzhm --yes
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
   `mailing.trends_newsletter_daily_status`,
   `mailing.trends_newsletter_collection_logs`, and
   `mailing.trends_newsletter_editions` rows. Re-run the same date and confirm a
   a normal repeat reuses its revision without resending; an explicitly
   authorized completion signal with `forceResend: true` allocates a new revision and preserves
   prior delivery rows. Retrying an identical signal UUID must reuse its
   existing Workflow and revision.

There is no Cron schedule and no public `workers.dev` endpoint. The Workflow
creates static shared copy only after collection completeness passes and sends
only to the Development allowlist. Resend intent is signal-scoped, and the
Worker rejects it unless its operator-controlled gate is enabled. All prior
delivery history is preserved; ambiguous outcomes prevent a new revision. Telegram notifications and
Production configuration/rollout are out of scope. A real allowlisted delivery
remains a manual Dev verification step; automated tests mock Brevo and do not
send mail.
