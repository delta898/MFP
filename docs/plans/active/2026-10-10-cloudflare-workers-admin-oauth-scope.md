# Cloudflare Workers Admin OAuth Scope

## Branch

- Branch: `codex/cloudflare-workers-admin-oauth-scope`
- Start date: 2026-10-10
- Base/parent branch: `codex/static-site-builder-main`
- Status: Ready to merge into parent; implementation and live test complete

## User need and goal

The user wants to test a separate Cloudflare OAuth client with Workers Admin and the same DNS, Zone, Memberships, and related permissions as the existing development client, then validate the workflow in BlogGenius. BlogGenius currently requests legacy Worker scope IDs, so the exact OAuth scope ID corresponding to Workers Admin must be established and supported before the test.

## Scope

- Inspect the current BlogGenius Cloudflare OAuth scope request path and local test configuration.
- Establish the exact OAuth scope ID(s) for the current Workers Admin role and check how the client registry represents them.
- Make the smallest BlogGenius change needed to request the verified role scope while preserving existing required scope behavior.
- Add focused tests and update relevant engineering documentation.
- Prepare a safe test flow using a separate private client and a uniquely named test Worker.

## Non-goals

- Do not modify or replace the existing development OAuth client.
- Do not create, edit, or authorize a Cloudflare client or deploy a Worker without a separate action-time confirmation for the expanded Workers Admin permission.
- Do not commit, merge, push, tag, or release unless the user explicitly requests it.
- Do not change unrelated OAuth flows or app settings.

## Design and boundaries

OAuth scope ownership is in `src/site-hosting/cloudflare-connection.service.js`; the integration boundary should request only scope IDs supported by the configured client. Tests should validate scope composition without exposing credentials. Cloudflare client creation/permissions and real Worker writes remain external actions and require separate confirmation.

## Decisions and tradeoffs

- Use a separate feature branch based on `codex/static-site-builder-main`.
- Use a separate private test client rather than changing the existing development client.
- Cloudflare's current Workers role documentation describes product-level Admin as full control, including create/update/deploy/delete. This is materially broader than the legacy scripts scope and must be treated accordingly.
- The Admin scope ID is verified from this account's Client scope summary. Live authorization and the full BlogGenius Site Hosting lifecycle have now succeeded with the test Client configuration documented below.

## Progress and verification

- Created this feature branch and record before implementation.
- Read-only OAuth scope diagnostic previously failed to bind its loopback callback with `EPERM`; no credential or Cloudflare configuration was changed.
- Cloudflare's Workers role documentation states product-level Admin is required to create a new Worker and includes delete permission. This confirms the permission breadth but not the OAuth scope ID.
- Read the `BlogGeniusScopeTest` OAuth Client's scope summary in Cloudflare Dashboard. It reports `Workers Admin (workers-scripts.admin)`, `Workers Editor (workers-scripts.edit)`, `Workers Routes Write (workers-routes.write)`, `DNS Read (dns.read)`, `Zone Read (zone.read)`, `Memberships Read (memberships.read)`, and `offline_access`.
- Added a Local/Development-only `CLOUDFLARE_OAUTH_SCOPES` override. When unset, existing default scopes remain unchanged; when set, the provided whitespace-delimited scope IDs replace the defaults. The exact test-client scope list is documented in the ignored env sample and development guide.
- The first live authorization attempt returned `invalid_scope` for `workers-scripts.read`. The local ignored `.env.oauth` had a Client ID but no `CLOUDFLARE_OAUTH_SCOPES`, so BlogGenius fell back to its legacy default request list. Added an override matching the test Client and omitting the unsupported legacy `workers-scripts.read` and `workers-scripts.write` scopes.
- Added focused tests for scope parsing, authorization URL composition, and environment allow-list loading. `node --test src/site-hosting/cloudflare-connection.service.test.js scripts/project-environment.test.js` passes (8 tests); `git diff --check` passes.
- With the separate test Client, the user confirmed successful site creation, deployment, custom domain connection, and site deletion in BlogGenius.
- Consolidated the legacy `workers-scripts.read`/`workers-scripts.write` experiments, duplicate `Edit` UI mapping, Editor-only create failure, Admin scope test, invalid-scope misconfiguration, API Token distinction, and Production follow-up in [Cloudflare Workers OAuth permissions](../../architecture/cloudflare-workers-oauth-permissions.md).

## Final result

The Local/Development OAuth flow can use the tested Workers Admin scope configuration. Production Client creation and production release configuration remain separate follow-up work.

## Remaining risks and follow-up

- Create a separate production OAuth Client with the proven scope set, then add production-only Client ID configuration to the packaged release path; `.env.oauth` is intentionally excluded from Production.
- `BlogGeniusScopeTest` has both Admin and Editor; whether Admin alone is sufficient can be tested separately if minimizing scope is desired.
- Production OAuth Client creation and release configuration are not part of this branch's implementation yet.
