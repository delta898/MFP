# Cloudflare Authorized Account Selection

## Branch and status

- Branch: `codex/cloudflare-account-selection`
- Start date: 2026-10-11
- Base/parent branch: `codex/static-site-builder-main`
- Status: Implementation complete; user visual review pending
- The parent worktree initially contained pre-existing edits in the main development record, unit-test runner, and Cloudflare connection tests. The user asked to commit all existing work before feature implementation; this branch record was committed as `641f13c2`, followed by the pre-existing test setup changes as `a453ce73`.

## User need and goal

Cloudflare `/memberships` can list accounts that appear in the connected user's membership inventory even when the OAuth grant does not allow account-scoped Worker operations on all of them. BlogGenius currently displays that raw membership list and silently chooses its first account for deployment. This is confusing and can target an account the user did not authorize for the app.

Show only Cloudflare accounts that the current OAuth token can actually use for Site Hosting. When there is one usable account, deployment should use it without an extra prompt. When multiple accounts are usable, let the user choose at deployment time and persist the choice with the Site. The application does not create, add, or remove Cloudflare accounts.

## Scope

- Identify accounts usable for Site Hosting from Cloudflare membership candidates using a safe, account-scoped read-only capability check.
- Update the Settings > Site Hosting connection view and its status contract to show only usable accounts, including the zero-account state and refresh/reconnect guidance.
- At Site deployment, use the sole usable account automatically or request an explicit choice when there are multiple.
- Persist the selected account with the Site so a failed deployment or later redeploy does not silently switch targets.
- Reuse the Site's deployment account for custom-domain zone lookup/attach/detach and remote cleanup checks, without asking the user to select the same account again.
- Preserve deployed Sites' existing Cloudflare account binding and ownership checks; never fall back to another account if the saved/previous account is unavailable.
- Add focused tests and update current engineering documentation.

## Explicit non-goals

- Creating, deleting, or editing Cloudflare accounts from BlogGenius.
- Project management or Project-level account binding; Project management is not available in the current Site Hosting UI.
- Changing Cloudflare OAuth Client visibility, scopes, or account-side policies.
- Changing Naver, WordPress, or unrelated Site Hosting behavior.
- Remote deployments, DNS changes, or other mutating Cloudflare API operations as part of account discovery.
- Commit, merge, push, tag, or release without a separate user request.

## Agreed design direction

- The Settings screen is an inventory of accounts this OAuth connection can use for Site Hosting, not an editor for Cloudflare's account list. Cloudflare authorization/re-authorization remains the way to change grants.
- `/memberships` is candidate discovery only. It does not prove that account-scoped Worker operations are authorized.
- Account availability must be based on a read-only Cloudflare API check for the capability needed to deploy a Site. Prior live testing found that `GET /accounts/{id}/workers/scripts?per_page=1` returned HTTP 200 for the selected account and 403 for the unselected account; confirm this remains the right capability check for the current `workers-scripts.admin` scope and handle provider errors conservatively.
- A new Site with one usable account uses it automatically. With multiple accounts, ask once during deployment and persist the selected account on that Site.
- An already deployed Site stays bound to its recorded `worker_account_id`. If that account is no longer usable, stop with a clear reconnect/re-authorize message; do not deploy or delete against another account automatically.
- Because the current UI has no Project management, Site is the nearest durable owner of the deployment target. Revisit Project ownership only when Project management is implemented.

## Alternatives and tradeoffs

- **Treat every `/memberships` row as authorized:** rejected by live evidence (`Amadejjs` was listed but its account-scoped Worker request returned 403 after only the other account was selected).
- **Always ask for an account:** accurate but adds a prompt for the expected single-account majority; use automatic selection for exactly one usable account.
- **Always use the first account:** rejected because ordering is not user intent and may silently target a non-authorized or wrong account.
- **Persist at Project level:** appropriate in the eventual Project management model, but unavailable in today's user flow; persist per Site for this feature.
- **Filter by a mutating operation:** rejected; discovery must be read-only.

## Implementation stages

1. Audit the OAuth connection, Settings UI, deployment route/service, Site metadata persistence, existing deployment ownership checks, and focused test patterns.
2. Define and implement the usable-account discovery contract, including 0/1/multiple outcomes and per-account API error handling.
3. Update Settings to display only usable accounts and appropriate empty/error states.
4. Update Site deployment to select/persist an account only when needed, and to retain existing Site account bindings without fallback.
5. Add and run focused tests for account discovery, selection, persistence, failure behavior, and route/UI contracts. Update the parent feature record and promote any durable account-selection decision to canonical docs if warranted.

## Decisions resolved during implementation

- The Worker Scripts inventory endpoint is used as a read-only capability check. A `403` excludes that candidate; other API failures fail closed so a transient error cannot make an unverified account appear deployable.
- Settings displays the verified account list and an empty-state message. Account management itself remains in Cloudflare.
- The smallest established transaction dialog presents radio choices only when a new Site has multiple eligible accounts.
- The selected account is stored in the Site manifest as `cloudflare_account`, separate from deployment ownership metadata. Existing `deployment.worker_account_id` remains authoritative for already-deployed Sites.
- Every Site-scoped Cloudflare operation after deployment is pinned to `deployment.worker_account_id` (or the saved account for a not-yet-deployed Site). Custom-domain setup has no second account picker; its zone list comes from the same account selected for deployment. Zone lookup is disabled until a Site has been deployed and bound.
- The existing settings refresh fetches a fresh account list; it does not cache a separate copy that could drift from the current OAuth grant.

## Progress log

- 2026-10-11: Created this feature branch from `codex/static-site-builder-main`.
- 2026-10-11: Reviewed Cloudflare OAuth connection behavior. `getStatus()` returns all `/memberships` rows, and `getDeploymentCredentials()` selects `accounts[0]`; these are the current sources of the settings-listing and deployment-selection issues.
- 2026-10-11: Prior live, read-only diagnostic after selecting one account found the selected account's Worker Scripts request returned HTTP 200 and the unselected account returned HTTP 403. The diagnostic did not mutate Cloudflare resources and printed no token or account IDs.
- 2026-10-11: Committed the account-probe and deployment credential contract as `a0c19e99` (`feat: filter Cloudflare accounts by Worker access`). Focused Cloudflare connection tests passed (6 tests).
- 2026-10-11: Added per-Site account persistence to `.bloggenius/site.json`; the Site API includes the saved account for UI use. Deploy validates the selected or existing account before build, persists it before the build so failures retain the intended target, and refuses a different account when a Site already has a binding.
- 2026-10-11: Added a multi-account radio dialog to Site deployment. One accessible account is used automatically; a saved Site account or existing deployment account is reused without asking again. Settings shows the verified account list and explains when no account has the required access.
- 2026-10-11: Updated `docs/architecture/cloudflare-workers-oauth-permissions.md` with account discovery, Settings display, and per-Site binding policy.
- 2026-10-11: User found that custom-domain flow asked to select a Cloudflare account after deployment had already selected one. Fixed all Site-scoped Cloudflare credential lookups to receive the saved/deployed account ID, added identity mismatch rejection, made custom-domain zone lookup wait for deployment, and clarified which account's zones are shown.

## Verification and handoff

- Run the narrowest focused automated tests for each changed contract and UI surface.
- Do not run the full unit suite without explicit user approval. A parent-feature merge into `dev` requires that full-suite approval and successful gate.
- No live Cloudflare test is needed to verify UI/model logic; if a later live check is needed, use read-only account-scoped API calls and ask before any remote mutation.
- Final visual acceptance remains with the user. Provide the Settings and multi-account deployment flows for manual review.
- Focused verification passed: `site-hosting-site.service.test.js` (23 tests), `site-repository.test.js` (9), `site-hosting-site.routes.test.js` (9), `cloudflare-site-hosting-ui.test.js` (4), and JavaScript syntax plus `git diff --check`.
- After the custom-domain binding fix, all 46 focused tests across site service, repository, routes, and UI contracts passed. The domain flow asserts that zone lookup, connect, and disconnect request credentials for the persisted deployment account. JavaScript syntax checks and `git diff --check` passed.
- The full browser UI smoke passed (480 fixture requests; two external Google Fonts requests were blocked as expected by the fixture harness).
- Settings and the account-selection dialog still need the user's hands-on visual acceptance. The implementation after `a0c19e99` is currently uncommitted; no merge, push, or release has been performed.
