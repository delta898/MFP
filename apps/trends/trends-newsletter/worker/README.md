# Trends Newsletter Collection Workflow (Development)

This stage records when each date's trend collection is complete. It does not
read subscribers, create editions, call AI, send email, or notify Telegram.

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
   expected count contract, then starts the private Workflow binding. The
   Workflow instance ID is deterministic per date, so repeated signals do not
   start duplicate recent instances.
4. The Workflow reads the signaled date from Development Supabase, independently
   verifies 32 categories × 20 distinct keywords, and calls the state RPC.
5. The RPC upserts one row per date in `mailing.trends_newsletter_runs`. It
   changes only collection fields; `edition_status` and `delivery_status` are
   preserved. No collection event triggers a send.

The source and environment are pinned to Development project
`bvtlwjbmjnfphxlrkzhm`. The Workflow validates both the environment marker and
Supabase hostname. Never configure Production credentials in this deployment.
The collector uses its existing Development Trends API token; it does not need
Cloudflare management credentials.

## Development-only Supabase migration

Apply `supabase/migrations/202611030001_trends_newsletter_run_state.sql` to the
Development project before deploying the new Workflow. It creates the private
run-state table and a `service_role`-only RPC exposed through the `public` schema.
The RPC is separate from the mailing-list signup Edge Function.

## Worker secrets

From this directory, set the Development Supabase URL and server-side secret
key interactively. Do not paste their values into source control or chat:

```sh
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
```

The key must be the Development project's server-side secret key with read
access to `trends.items` and execute access to the `public` RPC. Do not use a
Production key.

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

1. Apply the new SQL migration to the Development Supabase project.
2. From this directory, deploy the Workflow Worker:

   ```sh
   npm run deploy:development
   ```

3. Deploy the Development Trends API Worker so its cross-Worker Workflow
   binding and authenticated completion endpoint are active:

   ```sh
   cd ../../trends-api/workers
   npm run deploy:development
   ```

4. Run one Development collection date and inspect the matching Workflow and
   `mailing.trends_newsletter_runs` row. Re-run the same date to confirm the
   collection evaluation is idempotent and edition/delivery statuses remain
   unchanged. Run a date range and confirm one state row per date.

There is no Cron schedule and no public `workers.dev` endpoint. Deploying these
resources does not enable AI, email, or Telegram. Production configuration and
rollout are intentionally out of scope for this stage.
