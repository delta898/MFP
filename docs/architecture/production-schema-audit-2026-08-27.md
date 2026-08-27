# Production Schema Audit — 2026-08-27

This is a sanitized, point-in-time audit used to design the first reproducible BlogGenius Supabase
baseline. It contains no database rows, user identifiers, credentials, Vault values, or Storage
objects. The raw schema-only dumps remain outside the repository.

## Result

The repository SQL is useful evidence but is not a complete replayable definition of production.
The most important gap is `public.licenses`: production and application functions depend on it, but
no current repository SQL file creates it. Three superseded license tables remain in production under
`_del_*` names while their old names still appear in historical repository SQL.

Stage 4B must therefore build a reviewed baseline from production structure + repository intent +
application contracts. Concatenating existing SQL files is explicitly rejected.

## Collection safety

| Check | Result |
| --- | --- |
| Production preflight | branch, target, project ref, CLI target, and explicit approval matched |
| Schema dump mode | schema-only |
| `COPY` statements | 0 |
| `INSERT` statements | 0 |
| Email-like values | 0 |
| JWT-like values | 0 |
| Credential-assignment-like values | 0 |
| Production mutation | none |

Supabase CLI `db dump --dry-run` printed a temporary login credential, so that command is not an
approved audit path. Subsequent collection wrote schema-only output directly to a private temporary
file and used Management API queries that returned only selected metadata columns.

## Custom database structure

| Area | Production | Repository intent | Result |
| --- | ---: | ---: | --- |
| `public` + `trends` tables | 27 | 26 | 23 shared, 4 production-only, 3 repo-only |
| `public` + `trends` functions | 46 | 46 | all names shared |
| `public` tables with RLS | 26 / 26 | intended | all enabled |
| `trends.items` RLS | enabled | intended | matched |
| `public` / `trends` policies | 0 | 0 | direct row access denied; RPC/grants are the access boundary |

The 23 shared tables cover model catalog, runtime config, surface content, keyword research,
knowledge collection/gateway, license plans and usage, and `trends.items`. Function-name parity does
not prove body or privilege parity; Stage 4B must use reviewed production definitions and explicit
grant tests.

## Difference classification

| Object | Classification | Stage 4B decision |
| --- | --- | --- |
| `public.licenses` | production-only required structure; repository definition missing | include using reviewed production definition and add canonical ownership to migrations |
| `public._del_free_license_usages` | superseded production remnant | exclude from baseline; retain production unchanged until a separate cleanup approval |
| `public._del_license_access_keys` | superseded production remnant | exclude from baseline; retain production unchanged until a separate cleanup approval |
| `public._del_license_policies` | superseded production remnant | exclude from baseline; retain production unchanged until a separate cleanup approval |
| `public.free_license_usages` | repo-only superseded history | exclude from baseline |
| `public.license_access_keys` | repo-only superseded history | exclude from baseline |
| `public.license_policies` | repo-only superseded history | exclude from baseline |

The production `licenses` definition has 14 columns (`id`, timestamps, key/status/HWID/usage fields,
email/note, mode/expiry, and plan code), a primary key, a unique license-key constraint, and indexes
for email, license key, and plan code. Stage 4B will preserve structural behavior without copying
production rows.

## Platform-managed schemas and extensions

`auth`, `storage`, `extensions`, `graphql`, `graphql_public`, `net`, `realtime`, `cron`, and `vault`
are platform- or extension-managed. Their internal table definitions are excluded from the application
baseline. Local Supabase owns those schemas.

Installed extensions observed in production:

- application dependencies: `pgcrypto`, `uuid-ossp`, `pg_cron`, `pg_net`, `supabase_vault`;
- platform/runtime dependencies: `plpgsql`, `pg_stat_statements`.

Stage 4B declares application dependencies through supported migration/config mechanisms and does not
replay platform internal schema dumps.

## Edge Functions

All five deployed production Functions have matching source entrypoints in the repository and are
active:

| Function | Production `verify_jwt` | Repository config state |
| --- | --- | --- |
| `send-license-code` | false | implicit/deploy-command history only |
| `issue-trends-access-token` | false | implicit/deploy-command history only |
| `keyword-research` | false | implicit/deploy-command history only |
| `knowledge-gateway` | true | implicit default |
| `serpapi-news-collector` | false | explicit in `supabase/config.toml` |

The source inventory matches production, but auth configuration is not fully declarative. Stage 5
must make every Function's JWT policy explicit in the target deployment manifest before hosted
development deployment.

## Cron and Storage

Production has six active `bloggenius-serpapi-*` Cron jobs. Every name and UTC schedule matches
`supabase/activation/serpapi_collection_cron.sql`, including the cleanup job. Cron activation remains a
separate deployment step after functions and secrets are ready.

Production has one Storage bucket:

- `app-public-content`: public, 2 MiB limit, JPEG/PNG/WebP only.

This matches `supabase/migrations/202608270012_surface_content.sql`. Stage 4B creates the bucket configuration without
copying any Storage object.

Supabase Auth runtime settings are not repository-managed and were not queried through user or
instance rows. No application Auth baseline is required at this time; Stage 5 will configure hosted
development Auth separately if a capability begins to depend on it.

## RLS, grants, and security advisor

All custom tables have RLS enabled and no row policies. Access is mediated through grants and
`SECURITY DEFINER` RPCs. Production security advisor returned 43 warnings:

- 3 functions have mutable `search_path`;
- 20 `SECURITY DEFINER` functions are executable by `anon`;
- the same 20 are executable by `authenticated`.

Some public RPC exposure is intentional because the desktop app authenticates with license key +
HWID rather than Supabase Auth. That does not justify inherited/default grants. Stage 4B must:

1. fix mutable `search_path` for `_license_calc_period_bounds`, `_smart_usage_kst_period_bounds`, and
   `set_current_timestamp_updated_at`;
2. derive an explicit RPC role allowlist from desktop and Edge Function call sites;
3. revoke direct execution of internal helpers such as `_smart_usage_authorize` unless a caller
   contract proves it is required;
4. test anon/authenticated/service-role grants rather than copying production ACLs blindly.

These are baseline hardening tasks, not production hotfixes. Production changes remain separately
approved release work.

## Stage 4B inclusion boundary

Include:

- 22 shared current `public` tables, `public.licenses`, and `trends.items`;
- 46 reviewed custom functions, constraints, indexes, triggers, RLS, and explicit grants;
- application extension declarations;
- `app-public-content` bucket configuration;
- non-production fake seed data only.

Exclude or separate:

- three `_del_*` production remnants and three superseded historical table names;
- Auth/Storage/Realtime/GraphQL/Vault internal schemas;
- real users, licenses, emails, HWIDs, usage, payment, observation corpus, and Storage objects;
- Cron activation, Edge Function deployment, and secrets from the baseline migration;
- operator, restore, pause, and test SQL from the ordered schema migration chain.
