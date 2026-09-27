# Card News Publish List Refresh — Development Record

- Branch: `codex/fix/card-news-publish-list-refresh`
- Base/parent branch: `dev`
- Start date: 2026-09-27
- Status: Implemented; isolated for review

## User need and goal

After publishing Card News, the `발행 완료` filter's count and list appear stale. Refresh the managed Card News read model after publish outcomes so status badges and counts reflect the server's persisted state without requiring a manual refresh or tab switch.

## Scope

- Trace the publish response and managed-list state transition for confirmed success, accepted/pending outcomes, partial failures, and request errors.
- Refresh managed items when a publish operation settles, preserving the currently open generation detail and publish result feedback.
- Add focused UI contract/browser regression coverage for count and status refresh.
- Keep publication confirmation semantics: do not label accepted-but-unconfirmed posts as completed.

## Non-goals

- Change Buffer/SNS delivery or server-side confirmation semantics.
- Add background polling or alter the meaning of `발행 완료`.
- Touch the existing unrelated Card News UI edits in the primary `dev` checkout.
- Commit, merge, release, or delete this branch without an explicit request.

## Design and decisions

- The server already persists publish outcomes to the Card News ledger. The browser currently updates the publish result panel but does not reload `/api/v1/card-news/managed`, leaving cached filter counts and rows stale.
- `발행 완료` is reserved for confirmed terminal success. An accepted request remains pending until the server confirms completion.
- The minimal fix should refresh the managed list after a publish request settles, including API errors where the server may have recorded a failure, while preserving the selected detail and result panel.
- Channel selection remains a user decision. Successfully sent channels are shown in the publish result only; the channel picker does not filter or disable a channel just because it was sent before. Successful selections are cleared after the request so another publish requires an explicit selection, but users may deliberately select that channel again (for example, after deleting the prior post).
- The managed-list row remains an overview: title, status, update date, source platform, card/image counts, or the latest error. Channel-by-channel delivery feedback stays in the publish result/detail rather than being duplicated into the list row.
- While publishing, generation settings/actions, image model, signature and publishing-form controls are locked; their previous disabled states are restored after the request settles.

## Progress and verification

- 2026-09-27: Created this isolated branch from `dev` in a managed worktree because the primary checkout contains unrelated uncommitted Card News changes.
- 2026-09-27: Confirmed the likely stale-view path: `publishCardNews()` does not reload managed items; server-side `recordPublishing()` updates the ledger, and `/api/v1/card-news/managed` is the source for the list/count.
- 2026-09-27: Added a managed-list reload in the publish action's `finally` block. This runs after confirmed, accepted, partial, and failed request outcomes; the existing server-derived statuses and open result panel remain unchanged.
- 2026-09-27: Removed the client-side same-generation block on previously successful channels. A prior success is reported in the publishing result, while a user may intentionally select the channel again later.
- 2026-09-27: Added a focused contract test and a browser regression that simulates `발행 대기` → confirmed `발행 완료`, then verifies the completed count, row status/summary, selected detail, channel result, and that the channel can be selected again. The browser smoke also retains its existing publishing setup/finalization coverage.
- 2026-09-27: User screenshot revealed that top-level card-generation controls remained enabled during SNS publishing. Added a publishing lock for card settings, image-model selectors, signature controls, and publishing-panel controls; the browser regression now pauses the publish response and verifies those controls are disabled while the request is in progress.
- 2026-09-27: Follow-up review found a race in the FBR itself: if a managed-list fetch was already active when publishing settled, the refresh call was silently dropped. Added a coalesced `managedReloadRequested` flag so the latest list is fetched after the in-flight request settles. Extended the browser regression to hold a stale `발행 대기` response, publish successfully during that request, then verify a second request updates the completed count and row.
- 2026-09-27: User reported the live FBR still did not refresh. Added privacy-conscious INFO diagnostics for Card News publish/list API request and response (request id, method/path, HTTP status, duration) plus returned list item/status counts and successful ledger-record completion. No titles, content, credentials, or channel identifiers are logged. Added runtime logging coverage; current FBR worktree has no `logs/` directory, so the user's actual runtime log could not be inspected from this environment.
- 2026-09-27: Initial browser attempts exposed a test harness scope mistake and whitespace-sensitive result text assertion; corrected both. The full browser smoke passed after the final implementation.
- Verification: focused Card News/service/runtime tests — 55/55 passed; latest `scripts/test-ui-browser-smoke.js` — passed (514 fixture requests), including the overlapping-fetch/publish race; `git diff --check` — clean.

## Final outcome

While SNS publishing is active, controls that can alter or launch work for the current Card News are disabled and restored afterward. Once the attempt settles, the page reloads the server-managed list so status filters and counts update immediately. If an older list request is already in flight, one follow-up reload is queued and applied after that response, preventing stale data from winning. The currently open generation remains selected, and the publishing outcome panel remains available. The managed row provides summary metadata; channel-specific outcomes stay in the result panel. Previously successful channels remain available for intentional re-publication. No server status semantics changed.

## Remaining risks and manual checks

- Browser regression verifies confirmed publish moves a generation to `발행 완료` and updates the count immediately, keeps the row as a concise overview, shows the destination channel in the publish result, and allows intentional channel reselection.
- Accepted/unconfirmed, partial-failure, and request-error branches use the same unconditional `finally` refresh, but were not each separately exercised by the new browser case.
- Manual visual acceptance remains with the user unless requested.
