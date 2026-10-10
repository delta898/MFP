# Cloudflare Authorized Account Selection

## Branch and status

- Branch: `codex/cloudflare-account-selection`
- Start date: 2026-10-11
- Base/parent branch: `codex/static-site-builder-main`
- Status: In progress
- The branch was created while the parent worktree had pre-existing uncommitted edits in the main development record, unit-test runner, and Cloudflare connection tests. Those edits are carried in the worktree and are unrelated to this feature; they must remain out of this feature's commit unless explicitly reconciled with the user.

## User need and goal

Cloudflare `/memberships` can list accounts that appear in the connected user's membership inventory even when the OAuth grant does not allow account-scoped Worker operations on all of them. BlogGenius currently displays that raw membership list and silently chooses its first account for deployment. This is confusing and can target an account the user did not authorize for the app.

Show only Cloudflare accounts that the current OAuth token can actually use for Site Hosting. When there is one usable account, deployment should use it without an extra prompt. When multiple accounts are usable, let the user choose at deployment time and persist the choice with the Site. The application does not create, add, or remove Cloudflare accounts.

## Scope

- Identify accounts usable for Site Hosting from Cloudflare membership candidates using a safe, account-scoped read-only capability check.
- Update the Settings > Site Hosting connection view and its status contract to show only usable accounts, including the zero-account state and refresh/reconnect guidance.
- At Site deployment, use the sole usable account automatically or request an explicit choice when there are multiple.
- Persist the selected account with the Site so a failed deployment or later redeploy does not silently switch targets.
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

## Decisions pending evidence

- Whether the Worker Script inventory endpoint alone is sufficient to identify Site Hosting accounts, or whether deployment prerequisites such as `workers.dev` subdomain access require an additional read-only check.
- The exact API/UI shape for selecting the account at deploy time, using the smallest established interaction pattern.
- How to represent a selected-but-not-yet-deployed account in the Site repository without conflating it with deployment ownership metadata.
- Whether Settings refresh should probe all memberships on every refresh or use a bounded cache; retain the last valid list if a transient request fails.

## Progress log

- 2026-10-11: Created this feature branch from `codex/static-site-builder-main`. Prior working-tree changes remain present and are unrelated to this feature.
- 2026-10-11: Reviewed Cloudflare OAuth connection behavior. `getStatus()` returns all `/memberships` rows, and `getDeploymentCredentials()` selects `accounts[0]`; these are the current sources of the settings-listing and deployment-selection issues.
- 2026-10-11: Prior live, read-only diagnostic after selecting one account found the selected account's Worker Scripts request returned HTTP 200 and the unselected account returned HTTP 403. The diagnostic did not mutate Cloudflare resources and printed no token or account IDs.

## Verification and handoff

- Run the narrowest focused automated tests for each changed contract and UI surface.
- Do not run the full unit suite without explicit user approval. A parent-feature merge into `dev` requires that full-suite approval and successful gate.
- No live Cloudflare test is needed to verify UI/model logic; if a later live check is needed, use read-only account-scoped API calls and ask before any remote mutation.
- Final visual acceptance remains with the user. Provide the Settings and multi-account deployment flows for manual review.
- No changes are committed or merged as part of this feature branch yet.
