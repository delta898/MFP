# Runtime Environment Profiles

## Purpose

BlogGenius selects one explicit runtime environment before creating any desktop Supabase client. Missing or invalid configuration disables Supabase-backed capabilities instead of falling back to production.

The environment boundary does not choose a Git branch, deploy a project, or authorize production. Branch/target authorization belongs to the target-aware deployment guard planned for Stage 3.

## Canonical environments

- `local`
- `development`
- `production`

The selector is `BLOGGENIUS_ENV`. `dev` is intentionally not accepted as an alias.

## Runtime flow

```text
process environment or generated build config
  -> Host Environment Resolver (`src/host/configuration/environment/`)
      -> environment manifest lookup
      -> public URL/key source selection
      -> local/hosted URL validation
      -> immutable Runtime Environment Profile
  -> Supabase connection normalization (`src/adapters/supabase/`)
  -> License / AI Catalog / Keyword / Knowledge / Surface Content
```

## Source precedence

1. Explicit `BLOGGENIUS_ENV` in the process environment.
2. `BLOGGENIUS_ENV` in a generated build config.
3. No selection: fail closed with Supabase capabilities disabled.

After selecting an environment, the resolver reads only that profile's environment-specific public values. A production build's values are ignored when a process explicitly selects development.

| Environment | URL source | Publishable key source |
| --- | --- | --- |
| local | `BLOGGENIUS_LOCAL_SUPABASE_URL` | `BLOGGENIUS_LOCAL_SUPABASE_PUBLISHABLE_KEY` |
| development | `BLOGGENIUS_DEVELOPMENT_SUPABASE_URL` | `BLOGGENIUS_DEVELOPMENT_SUPABASE_PUBLISHABLE_KEY` |
| production | `BLOGGENIUS_PRODUCTION_SUPABASE_URL` | `BLOGGENIUS_PRODUCTION_SUPABASE_PUBLISHABLE_KEY` |

Local endpoints must use localhost. Development and production endpoints must use remote HTTPS. Project-ref identity and branch authorization are additional Stage 3 checks; URL shape validation alone is not deployment authorization.

## Generated build config

`src/host/configuration/environment/secret.js` is not a committed source file. It is an ignored build artifact generated from environment-specific CI inputs or an explicit local release-build input. For OAuth, Development and Production source runs read `.env.oauth.dev` and `.env.oauth.prod`; packaged Production receives values from GitHub repository Secrets.

The generated module is built by `scripts/environment/build-config.js` and contains only:

- `BLOGGENIUS_ENV`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- Google and Cloudflare OAuth Client configuration for Production

Cloudflare scope names are public configuration. The default scope set contains `workers-scripts.admin` and omits the legacy Scripts Read/Write and Editor scopes. User OAuth tokens remain on the device and OAuth Client configuration is not loaded from Supabase Runtime Config.

Release build scripts validate that the artifact is a production profile before packaging. Existing GitHub secret names are temporarily mapped at the workflow boundary, but legacy `LICENSE_CHK_*` names do not appear in the generated module.

Server-only secrets are not part of this artifact. Service-role keys, provider secrets, webhook secrets, and billing secrets remain in the target server secret store.

## Fail-closed behavior

The desktop shell may still start when the environment is unavailable so that local settings and diagnostics remain accessible. Supabase-backed capabilities receive an unconfigured connection and cannot contact any remote project.

Failure states include:

- environment not selected;
- unsupported environment name;
- manifest profile missing;
- public URL/key missing; and
- local/hosted URL mismatch.

No failure state copies a legacy production endpoint as a fallback.

## Safe diagnostics

Startup logs and the config-status API expose only:

- selected environment or `unselected`;
- resolver status;
- configured boolean;
- endpoint host; and
- selection source.

They never expose a publishable key, full URL, server secret, or project data.

Environment effect policy is shared by `src/services/runtime-environment/effects.js`. Deployment branch/target policy, release artifact verification, and schema auditing are operator tooling under `scripts/environment/`; the desktop runtime does not import those tools.

## Compatibility boundary

`LICENSE_CHK_URL` and `LICENSE_CHK_KEY` remain temporary aliases on the internal `CONFIG` object because older modules and dependency-injected tests still use those names. Runtime values for those aliases are produced only by the Environment Resolver.

All real Supabase client owners call `resolveSupabasePublicConnection`. Direct client reads of the legacy aliases are prohibited by a structure test.

## Next stages

- Stage 3 adds explicit target/ref/branch deployment preflight.
- Stage 4B supplies reproducible local URLs and keys from the local Supabase stack.
- Stage 5 registers hosted development profiles and server-side secrets.
