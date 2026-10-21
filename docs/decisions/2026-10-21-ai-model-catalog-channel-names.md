# AI Model Catalog Channel Names

- Status: accepted
- Date: 2026-10-21

## Decision

AI Model Catalog channels are named `production` and `development`. The app
selects the catalog channel from the resolved `BLOGGENIUS_ENV` runtime profile;
`local` uses the Development catalog. The independent `system.update_channel`
setting controls application update eligibility only and must not affect catalog
selection.

The Supabase project URL remains selected by the runtime environment profile.
Keeping the catalog channel explicit is intentional: it preserves a future
catalog publishing distinction within one Supabase project if needed.

## Rollout

Apply the standalone
[Development operation](../../supabase/operations/ai/2026-10-21_ai-model-catalog-development-channel.sql)
and [Production operation](../../supabase/operations/ai/2026-10-21_ai-model-catalog-production-channel.sql)
to their matching Supabase projects. No compatibility aliases are retained
because v0.7.0 has not been released. The canonical migration uses the new
names for fresh installations.
