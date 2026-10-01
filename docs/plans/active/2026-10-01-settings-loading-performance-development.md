# Settings Loading Performance FBR

- Branch: `codex/feature/settings-loading-performance`
- Base/parent branch: `release/v0.5.5`
- Start date: 2026-10-01
- Status: Implemented and verified; ready to merge into `release/v0.5.5`

## User need and goal

When the user opens Settings after starting the app, AI model settings take a long time to appear. The user wants to inspect and change the AI model without first waiting through unrelated settings work.

Determine which requests cause the delay, whether visiting Settings is required for AI writing, and design an extensible loading flow that presents usable model choices quickly while handling remote catalog refresh and failures safely.

## Scope

- Trace settings navigation, frontend loading orchestration, API handlers, model catalog/cache refresh, and AI writing model resolution.
- Measure or otherwise attribute latency across the relevant requests and startup paths.
- Design and implement progressive loading so essential AI model settings are available independently of unrelated settings panels/status checks.
- Provide explicit, appropriately scoped progress, stale-data, retry, and failure behavior where necessary.
- Add focused automated coverage. UI/browser smoke and hands-on visual review are deferred until the user requests them.
- Keep this feature isolated from release work; do not bump version or publish.

## Non-goals

- Changing model/provider architecture or available model policy beyond what is required for loading behavior.
- Changing unrelated Settings UX or legacy Blog surfaces.
- Production data changes, publishing, deployment, commit, merge, push, or release without explicit user request.
- Full unit suite until the feature is otherwise ready for integration and the user approves that broad run.

## Initial code findings

- Settings navigation calls `loadSettingsNext({ force: true })` on entry.
- `loadSettingsNext` waits on one `Promise.all` containing core connections, AI roles, statuses, writing defaults, and optional services before applying the core and AI responses. Thus unrelated requests gate presentation of AI model fields.
- `GET /api/v1/settings/ai-roles` builds the response from saved configuration and the in-process model catalog.
- `GET /api/v1/settings/major` calls `RemoteModelCatalog.refresh()`. The remote catalog service loads its local cache and can wait up to 10 seconds for an RPC refresh when its TTL has expired; it retains the existing catalog on failure. Current Settings Beta navigation calls `/api/v1/settings/ai-roles`, not `/major`; therefore this remote refresh is not presently on the direct AI-role list request path. Confirm whether any other startup/major-settings caller is relevant before attributing the observed delay to it.
- AI model runtime lookup uses the in-process catalog and saved model configuration, not the Settings UI. Settings visitation is not expected to be a prerequisite for AI writing; verify the complete runtime/bootstrap path.
- `initSettingsNext()` runs at `DOMContentLoaded` and independently starts external-connections and app-environment requests (including app input/general) before Settings is opened. These requests do not gate Settings AI role rendering, but may contribute to total app-startup work.
- On Settings navigation, `loadSettingsNext()` awaits core-connections, AI roles, status requests, writing defaults, and optional services in one `Promise.all` before applying the core and AI data. Statuses include Google OAuth, account overview, and Naver session. Account overview itself awaits license, smart-usage, and connection-readiness work; connection readiness can include Naver and WordPress checks. Optional-services loading also starts Buffer workspace loading asynchronously when configured.
- Settings navigation passes `force: true` every time, bypassing the `settingsNextLoaded && !force` short circuit. Thus the aggregate load repeats on each entry even though the AI-role endpoint reads local configuration/catalog data.
- AI roles response is composed from the merged in-process catalog (`bundled` plus any remote snapshot already applied in memory), saved config, provider profiles, and verification history. `loadSettingsNextAi()` renders the model selects only after that response is applied.
- These findings are preliminary and must be rechecked on this branch before implementation.

## Proposed design direction (to validate with user)

1. Render saved AI role selections and the current in-process catalog independently from slow connection checks. Remote refresh on `/major` was not established as the source of this Settings delay.
2. Start saved core/AI data, connection statuses, writing defaults, and optional-service requests independently; render core/AI responses as each arrives.
3. Reuse saved data and the latest connection snapshot on Settings re-entry. A user-requested Settings refresh forces only the connection-status refresh and does not overwrite local form edits.
4. Show per-status progress and failure while preserving the last successful connection result. If a force-refresh is requested during an ordinary check, run one forced check afterward rather than silently treating the ordinary check as forced.
5. Coalesce concurrent Naver auth checks for the same session configuration, including forced checks, to prevent duplicate headless browser launches.

Alternatives and tradeoffs to discuss: retain a single page-wide load but improve progress feedback; lazy-load each top-level/subtab; eager local-first hydration plus background refresh. Current evidence most strongly supports decoupling and caching the frontend/API panel loads, while catalog refresh lifecycle still needs measurement. Avoid changing remote refresh behavior until its actual callers and latency contribution are confirmed.

## Affected boundaries

- `ui/scripts/foundation/navigation.js`
- `ui/scripts/features/settings-next/` loading orchestration and AI model roles
- Settings API/controller/service and `src/ai/remote-model-catalog.js`
- Relevant Settings UI contract/browser tests and AI catalog tests
- This development record; promote stable architectural decisions only if the resulting contract merits it.

## Stages and decisions

1. Reconfirm clean branch state and trace complete Settings/model-writing paths.
2. Establish reproducible latency attribution by timing frontend readiness and each API endpoint, for cold start and warm revisit; do not contact production or invoke paid AI models.
3. Agree on panel loading boundaries and progress/fallback UX with the user before material behavior changes.
4. Implement a focused loading boundary and tests.
5. Run focused unit/contract tests. Defer browser/UI smoke and visual acceptance until the user asks for UI testing.
6. Update this record with outcome and verification. Merge only on explicit user instruction; a full unit suite is required and requires explicit approval before merging into the parent/base integration target.

## Decisions with user

- User requested this work on a separate branch based on `release/v0.5.5`, with substantial work/testing expected.
- Use the current checkout; no additional worktree is needed.
- User owns UX acceptance and final hands-on UI validation.
- User approved implementing the five-part direction: show saved settings/models immediately; decouple connection readiness; reuse recent readiness instead of force-checking on every entry; force-refresh only on explicit user request with per-status progress/failure; remove duplicate Naver checks or share in-flight work.
- UI smoke/visual test remains user-requested only; do not launch or operate UI for hands-on acceptance without a later explicit request.

## Progress and verification

- Implemented on 2026-10-01: Settings navigation no longer forces connection checks. Saved core settings and AI roles render on their own responses, while status, writing-default, and optional-service requests run independently in the background.
- Connection checks now cache the last completed client result for the app session, show per-status progress/failure, preserve old successful data after errors, and run only after explicit refresh on subsequent Settings visits. A forced refresh clicked during a normal check is queued once after it completes.
- Naver session checks now share same-configuration in-flight work even when callers request force refresh; force still bypasses completed cache data. Added a focused test confirming concurrent forced checks launch one browser.
- Focused verification passed: `node --test src/auth-session.test.js scripts/settings-next-ui-contract.test.js` (15 tests), `node --check` for changed JavaScript modules, and `git diff --check`.
- UI smoke/browser automation and hands-on visual acceptance were initially deferred per the user's instruction. The user later requested the browser UI test; it passed after the test fixture was narrowed to active product surfaces. Hands-on visual acceptance remains with the user.
- Related startup UX fix: Dashboard startup first reads persisted recommendation cards and, when they are stale, follows with a discovery refresh. Previously both responses could create toasts, so the old persisted cards surfaced as an unnecessary first alert. Startup now silently establishes that persisted snapshot as the seen baseline; an evaluated fresh result still notifies, and a following discovery refresh can notify only newly added items. Focused verification passed: `node --test scripts/ui-dashboard-shell-structure.test.js src/ui-api/services/recommendation-center.service.test.js` (17 tests), syntax check, and `git diff --check`. No UI was launched.
- User requested the full unit suite. The first run exposed two environment restrictions on localhost listeners and six missing metadata entries for tracked 2026-10-01 AI catalog SQL files in `supabase/inventory.json`. Added the six entries under the existing `ai_catalog_operator_action` classification; the focused environment contract test then passed (14/14).
- Final `npm run test:unit` run completed successfully: 377 test files, 2,065 passed, 1 skipped, 0 failed; `npm audit` reported 0 vulnerabilities. UI tests were intentionally not run, per the user's instruction to run them only when requested.
- The user subsequently requested browser UI smoke. `npm run test:ui-browser` passed (382 fixture requests, no page errors or failed fixture requests). The smoke fixture now omits the retired Dashboard, Settings, and Blog views, including the stale RSS.app embed, while retaining Dashboard Beta, Settings Next, Blog Beta, and other active surfaces. Only the shared Google Fonts stylesheet request was blocked by the test's external-network guard.
- `git diff --check` passed after the final UI-smoke fixture changes. No production actions or paid AI calls were made. Changes are ready for the requested feature-branch commit and fast-forward merge into `release/v0.5.5`.

- 2026-10-01: Created this feature branch from a clean `release/v0.5.5` checkout.
- 2026-10-01: Revalidated that all current Settings Beta navigation forces an aggregate load and waits on statuses, writing defaults, and optional-services before applying core and AI settings. Account overview adds license/usage/readiness work; Buffer workspace loading is separately asynchronous.
- 2026-10-01: Corrected an earlier attribution: `RemoteModelCatalog.refresh()` is called by `/api/v1/settings/major`, while Settings Beta AI model controls call `/api/v1/settings/ai-roles`; the remote 10-second refresh is therefore not yet established as the direct cause of AI model display delay.
- 2026-10-01: Confirmed the model runtime resolves saved config against the in-process bundled/merged catalog. `config-loader.js` applies a disk-cached catalog at startup; visiting Settings is not on the runtime model lookup path.
- 2026-10-01: Measured the already-running app only after `/api/v1/config/status` confirmed `development`. No settings response bodies or secrets were emitted. Concurrent GET timings (first sample / repeat, milliseconds): core connections 91/7; AI roles 69/8; writing profile 68/9; optional services 68/35; Google OAuth status 69/35; account overview without force 6,589/436; Naver session without force 6,558/35. AI role response contained 24 text and 15 image choices in both samples.
- 2026-10-01: Repeated with the actual Settings entry force semantics (`account/overview?quiet=1&force=1`, `session/naver?force=1`). In the concurrent sample each state endpoint took about 7,000 ms, while AI roles took about 20 ms. These are development-environment observations, not a full cold-process vs warm-process benchmark.
- 2026-10-01: Root cause candidate strengthened by source trace: `settingsNextLoadStatuses({ force: true })` requests account overview and standalone Naver session with force. Account overview itself calls `getConnectionReadiness({ force: true })`, which forces another Naver session check and forces WordPress verification (bypassing its 120-second cache). The standalone Naver endpoint also forces `checkAuthSessionValid`, whose implementation intentionally bypasses cached and in-flight checks when forced. Thus duplicate browser-backed Naver checks can happen concurrently, and the single slowest response gates applying AI settings because of the outer `Promise.all`.
- 2026-10-01: Naver check internals confirmed: `BrowserLauncher.launchBrowser({ headless: true })`, load saved Playwright storage state into a fresh browser context, navigate to configured Naver write URL (or blog post-write URL) with DOMContentLoaded and 15-second timeout, wait 400ms, infer expiry from redirect URL containing `nid.naver.com`, persist refreshed storage state, then close context/browser. It is headless (not a visible user-facing browser) but performs real browser startup and network navigation.
- 2026-10-01: Account overview is an aggregator, not a local-only read. It concurrently calls forced license status (`check_license_status` Supabase RPC), smart-usage status (`get_smart_usage_status` Supabase RPC; no status cache in `getSmartUsageStatus`), and connection readiness. Readiness can actively run the same Naver browser check plus WordPress `/users/me?context=edit` verification (15-second HTTP timeout), bypassing the recent-verification cache when force is true. Any slow remote/browser branch holds the overview response. Exact sub-operation timings were not separately instrumented, so cannot attribute the observed 6–7 seconds to a specific one of license, smart usage, Naver, or WordPress; the direct Naver API also measured about 6.6 seconds in the first cold sample.
- 2026-10-01: Proposed improvement from evidence: separate model/config hydration from connection readiness; do not force connection checks on every Settings entry. Reuse fresh readiness state and perform explicit force checks only from a user-initiated refresh/status action. Avoid duplicate Naver checks by making one owner of the check or sharing in-flight force checks. Render AI roles as soon as their fast local API returns; let other panel requests update independently. Preserve an explicit way to refresh connection state and show per-status progress/failure rather than a global Settings wait.
- 2026-10-01: Production was not queried. No paid AI model calls, writes, tests, or app restarts were performed.
- 2026-10-01: Implementation authorized by user; start coding on this feature branch.
- Tests: investigation phase only; implementation-focused tests pending.
- Manual checks: after implementation, user should verify first Settings entry, repeat entry, AI model availability during slow connection checks, and explicit status refresh behavior.
- Remaining question for user: approve the proposed separation and connection-check freshness/force semantics before implementation.
- Tests: not run (planning stage; no code changes).
- Manual checks: none yet.
- Risks/follow-up: need confirm runtime independence end-to-end and collect per-request timings before selecting final implementation details.
