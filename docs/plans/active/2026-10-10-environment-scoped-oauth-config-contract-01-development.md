# Environment-scoped OAuth Configuration Contract

## Branch and status

- Branch: `codex/oauth-config-contract-01`
- Base/parent: `codex/static-site-builder-main`
- Started: 2026-10-10
- Status: implementation complete; focused verification passed; committed on the feature branch

## User need and goal

Google and Cloudflare OAuth Client configuration is currently sourced differently across launch modes. The user wants one explicit Dev/Production contract so Development and Production use their own Client ID and scope list. Local runtime is out of scope for this feature.

The user confirmed that a Cloudflare Client with `workers-scripts.admin` alone can create, deploy, attach a custom domain to, and delete a site. The target scope list must therefore use Workers Admin without Workers Editor or legacy Scripts Read/Write scopes.

## Scope

- Define one configuration shape and resolver for Google and Cloudflare OAuth app configuration.
- Cover Development and Production source runs, plus packaged Production. Local runtime is explicitly out of scope.
- Keep OAuth user access/refresh tokens on the user's device and keep OAuth Client metadata out of Supabase Runtime Config.
- Make source-run and packaged configuration environment-specific and reject a mismatched environment rather than silently using another environment's OAuth values.
- Preserve the existing Google and Cloudflare authorization flows; this work is about application configuration ownership and resolution.
- Update the canonical environment and credential documentation and relevant samples.
- Add focused contract tests for source precedence, target mismatch, missing values, and build/runtime parity.

## Explicit non-goals

- Creating or changing Cloudflare OAuth Clients or Google OAuth credentials.
- Changing the requested Cloudflare permissions beyond using the user-confirmed Admin-only Workers permission.
- Moving OAuth Client metadata or user tokens into Supabase.
- Replacing Google desktop OAuth or changing its API integration.
- Changing app version, release process beyond feeding the existing build config, or publishing a production build.
- Committing, merging, pushing, or deleting this feature branch unless separately requested.

## Current behavior found

- `scripts/project-environment.js` uses `.env.oauth` as the default OAuth file. Local and Development launchers load Google Client ID/Secret plus Cloudflare Client ID/scopes from it; process environment values override file values.
- Production source launch loads `.env.production`, then separately loads Google values from `.env.oauth`. It does not load Cloudflare Client ID/scopes from `.env.oauth` through that helper.
- `src/config-loader.js` resolves Google values from process environment or packaged `internalSecrets`; Cloudflare Client ID/scopes are read only from process environment.
- The production build workflow passes Google values into `scripts/build-environment-config.js`; the generated `src/config/secret.js` does not currently contain Cloudflare OAuth configuration.
- Supabase Runtime Config is an allowlisted store for non-secret runtime settings and is not a current source for OAuth Client configuration. User OAuth tokens are device-local.
- The generated build config already carries `BLOGGENIUS_ENV` and validates it against the build target, providing an existing pattern for environment identity checks.

## Proposed contract for discussion

### Configuration shape

One resolver returns an immutable, normalized object associated with exactly one selected environment:

```text
environment: local | development | production
google: clientId, clientSecret
cloudflare: clientId, requestedScopes[]
source: source label only (never a credential value)
```

Scope values are normalized as a whitespace-delimited input into a unique, validated list. Cloudflare's requested scopes must match the selected Client's allowed scopes. The Production Workers permission set uses `workers-scripts.admin` and omits `workers-scripts.edit`, `workers-scripts.read`, and `workers-scripts.write`.

### Resolution and environment isolation

- A shared resolver owns key names, parsing/normalization, source precedence, environment matching, and validation. Launchers, packaged config generation, and `src/config-loader.js` call or consume this same contract rather than maintaining provider-specific loaders.
- Each resolved OAuth config is tagged with `BLOGGENIUS_ENV`; a source tagged for another environment is rejected. No Development-to-Production or Production-to-Development fallback is allowed.
- Development source runs read `.env.oauth.dev`; Production source runs read `.env.oauth.prod`. Both files are ignored by Git and use the same keys/schema. Each file is bound to its expected target and cannot be loaded by the other environment.
- Packaged Production builds cannot read a developer's local `.env.oauth.prod` automatically: GitHub Actions runs on a separate runner and the ignored file is not in the checkout. The workflow receives Production values from GitHub repository Secrets and passes them into the same resolver/build-config validation contract.
- The build embeds the selected environment's OAuth app configuration in the existing generated config module. The build validates that the OAuth config environment matches the requested build target. A packaged app does not load local `.env.oauth.*` files.
- Process environment overrides are accepted only through the same environment-tagged resolver contract. No raw, unscoped OAuth key should bypass environment validation.

### Ownership and security boundary

- Google and Cloudflare Client IDs and requested scope names are app-level configuration, not user credentials. They are supplied per environment by source-run files or release build inputs; they are not stored in Supabase Runtime Config.
- Google Client Secret remains in the existing compatibility shape for now. Because this is a desktop app, packaging cannot make it confidential; changing the Google OAuth flow or removing that field is outside this feature.
- Cloudflare desktop OAuth continues to use PKCE and no Client Secret.
- User access/refresh tokens remain device-local.
- Production workflow inputs come from GitHub repository Secrets as agreed. Map them into the same normalized config fields consumed by the local file parser. Do not commit `.env.oauth.prod` or duplicate its contents into repository files.

## Agreed design decisions

1. **Environment files:** Use `.env.oauth.dev` and `.env.oauth.prod` for source runs. Both are ignored by Git and use the same provider key names. Local runtime configuration is out of scope.
2. **Packaged build source:** Store Production OAuth values in GitHub repository Secrets and have GitHub Actions map them into the generated build config. Actions does not read the operator's local `.env.oauth.prod`; the Production values are maintained in both places for source run and package build.
3. **Provider fields:** Continue using `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`. Add `CLOUDFLARE_OAUTH_CLIENT_ID` and `CLOUDFLARE_OAUTH_SCOPES` to the Production build inputs. Cloudflare scopes use the tested set with `workers-scripts.admin` and without Editor or legacy Scripts Read/Write.
4. **Missing OAuth values:** Allow the app to start with an OAuth provider unavailable, matching current degraded behavior, but prevent that provider's connect action with a clear diagnostic. Production packaging must fail build validation when required OAuth config is missing.
5. **Google Client Secret packaging:** Preserve current behavior for compatibility and document its desktop limitation; no OAuth-flow redesign in this branch.
6. **Supabase:** Keep OAuth Client configuration out of Supabase. Revisit only if runtime switching without rebuilding becomes a product requirement.

## Implementation stages after design approval

1. Implement a shared OAuth configuration contract/resolver at the environment boundary; define normalized providers and source metadata without exposing values in logs.
2. Route Development and Production source launchers through the resolver and select `.env.oauth.dev` or `.env.oauth.prod` from the explicit runtime environment. Leave Local runtime behavior out of scope.
3. Extend generated build config and Production build workflow to carry and validate both providers' Production settings from GitHub repository Secrets. Keep the same field schema as `.env.oauth.prod`; do not try to read the operator's local ignored file on GitHub-hosted runners.
4. Wire the resolved contract into `src/config-loader.js` and preserve current OAuth service behavior. Use the confirmed Cloudflare Admin-only scope set for production inputs.
5. Update environment samples and canonical docs (`runtime-environment-profiles.md`, `runtime-credential-boundaries.md`, Cloudflare scope record, and `docs/README.md` if document inventory changes).
6. Run focused resolver, launcher, build-config, and config-loader tests plus `git diff --check`. Browser verification is not expected because this changes startup configuration rather than UI behavior.
7. Review the complete diff and leave the branch ready for user review. Do not commit/merge/push without a later explicit request.

## Acceptance criteria

- Google and Cloudflare use one documented configuration shape and one environment-aware resolution policy.
- A Development Client ID/scope cannot enter Production through `.env.oauth.dev` or an unscoped process variable.
- Development source runs use `.env.oauth.dev`; Production source runs use `.env.oauth.prod`; packaged builds use the Production GitHub repository Secrets through the same resolver contract.
- Generated build config validates the environment and includes the Cloudflare Client ID and normalized Admin-only scope list.
- Missing or mismatched settings produce safe, actionable diagnostics without logging Client secrets or OAuth tokens.
- Supabase remains uninvolved in OAuth Client configuration and user tokens remain device-local.
- Focused automated tests pass; full suite is deferred unless the final change crosses a broad-risk boundary or a later integration gate requires approval.

## Progress and verification

- 2026-10-10: Created local `.env.oauth.dev` and `.env.oauth.prod` from the existing ignored `.env.oauth`, preserving the Google settings and Admin-only Cloudflare scope list while setting the user-provided Dev and Production Cloudflare Client IDs. Added explicit ignore rules; the files are mode `0600` and remain untracked/local.
- 2026-10-10: User narrowed the feature to Development and Production (Local runtime is out of scope), chose `.env.oauth.dev` and `.env.oauth.prod` for source runs, and confirmed GitHub repository Secrets as the Production packaged-build source. GitHub Actions cannot read the ignored local file, so the two Production inputs use the same schema but remain separately stored.
- 2026-10-10: Added a shared environment-tagged OAuth resolver, routed Development and Production source launchers through their dedicated files, extended generated Production config and GitHub Actions to consume `CLOUDFLARE_OAUTH_CLIENT_ID`, and changed the default Cloudflare scope list to the user-validated Admin-only set.
- 2026-10-10: Updated environment/credential/Cloudflare permission docs and structure assertions. Focused configuration, launcher, build-config, OAuth, and Cloudflare authorization tests pass (54 tests). `git diff --check` passes; local environment files are ignored and mode `0600`, and their supplied Client IDs and required OAuth fields were validated without printing values.
- 2026-10-10: User refined the boundary so app code should consume named OAuth environment variables while an external entrypoint chooses and reads the file. Updated `run_dev.sh` to pass `.env.oauth.dev` to a generic safe env-file wrapper; `scripts/app-environment-launcher.js` now consumes injected OAuth values and does not read an OAuth file. Added wrapper and launcher contract tests. Focused tests pass (23 tests), `bash -n run_dev.sh` and `git diff --check` pass.
- 2026-10-10: Applied the same external loading boundary to `run_production.sh`; the Production launcher now validates the injected Production OAuth marker and values without selecting or reading an OAuth file. Generalized the wrapper to accept the target environment plus caller-selected file path. Updated source-run guidance. Focused tests pass (31 tests), `bash -n` checks for both shell entrypoints pass, and `git diff --check` passes.
- Manual UI acceptance: not applicable to the planned configuration contract; user should verify the installed Production build authorizes with the Production Google and Cloudflare Clients after release configuration is supplied.
- 2026-10-10: Final focused OAuth/configuration test set passes (36 tests); `bash -n run_dev.sh`, `bash -n run_production.sh`, and `git diff --check` pass. The site deletion UI regression was separately verified by the browser smoke test. OAuth environment files remain local and ignored.
- Remaining: the production packaged workflow has not been run because it is triggered by a release tag and would package/publish artifacts. This commit does not merge, push, or release the branch.
