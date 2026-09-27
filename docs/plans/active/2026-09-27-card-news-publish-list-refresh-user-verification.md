# Card News Publish List Refresh — User Verification Branch

- Branch: `codex/test/card-news-publish-list-refresh`
- Base/parent branch: `dev`
- Start date: 2026-09-27
- Status: user hands-on verification passed for signature-matched publishing and automatic completed-tab refresh; awaiting user's integration decision

## Need and goal

Run the Card News publish-list refresh implementation from the primary checkout so the existing ignored development environment and local app data remain available. Keep `dev` unchanged until the user completes manual verification and chooses whether to integrate the tested branch.

## Scope and non-goals

- Include the committed implementation from `codex/fix/card-news-publish-list-refresh` for testing.
- Preserve unrelated pre-existing `dev` working-tree changes separately and restore them after branch setup.
- Do not merge this test branch into `dev`, release, push, or alter local config/credentials without a separate user request.

## Decisions

- The user requested a new branch from `dev`, incorporation of the current FBR changes, and hands-on testing before deciding on a `dev` merge.
- The implementation branch was committed as `4ce24b82` so it could be merged cleanly into this branch.
- The primary checkout had three unrelated uncommitted files. They were temporarily stashed by exact path before branch creation and must be restored after the FBR merge.

## Progress and verification

- 2026-09-27: Created from `dev`; fast-forwarded the FBR implementation commit `4ce24b82`.
- Automated verification for the implementation: 55 focused tests passed; browser UI smoke passed (514 fixture requests); `git diff --check` clean before commit.
- Manual verification remains: publish one Card News item, confirm the `발행 완료` count and row update without pressing refresh, and inspect `[CardNews][API]` plus managed-list status-count log entries if it does not update.

### Follow-up: signature preview and publish consistency

- 2026-09-27: User reported that the “미리보기가 갱신되었습니다. 이미지를 확인한 뒤 다시 발행해 주세요.” warning repeats even after visually checking and retrying.
- Diagnosis: the browser obtains the effective signature through a fresh license check; the publish service independently performs another forced license check when preparing outbound images. `expected_signature` only compares the two results, so a changed/transient entitlement result blocks every attempt even though the user has acknowledged the refreshed preview. Preview asset preparation also resolves policy separately from the policy endpoint.
- Agreed implementation direction: issue a short-lived server-side preview-policy token with the effective signature; use that same resolved policy for preview assets and publishing, instead of independently re-resolving entitlement during the acknowledged operation. Keep a stale response for expired/missing/mismatched snapshots and add focused coverage for retry consistency.
- Existing unrelated local changes remain preserved and out of scope: two test files and one CSS file from the prior dev checkout.
- Implemented a random, server-memory preview token (10-minute expiry; bounded to 128 snapshots). Card image preview, download/export, and SNS publish all validate requested/effective signature against that exact policy. Publishing now requires the token; missing, expired, or mismatched snapshots return a stale-preview conflict before media upload. Diagnostic warnings report only the rejection category (never the token or signature).
- Focused verification: 91/91 tests passed across the outgoing-image, publishing, Card News service/controller, and shell contract tests; `git diff --check` clean.
- Browser regression: `npm run test:ui-browser` passed with 510 fixture requests and no page errors. Manual paid-plan/Free-plan and real SNS publish behavior still requires user verification in the dev app.
- 2026-09-27: User reproduced a 409 with `request signature does not match snapshot`. Root cause: publish locking disables the editable signature input before the request body reads it, so the request sent an empty signature while the preview token represented the visible signature. Capture signature, expected signature, and token immediately after preview validation and before locking controls.
- Regression verification: Card News shell contract passed 17/17; browser UI smoke passed with 516 fixture requests; `git diff --check` clean. User should retry the same publish flow in the test branch's running app; this is not committed yet.
- User hands-on verification: retried a previously unpublished item successfully; the completed tab refreshed automatically after publishing. This confirms the signature snapshot fix and the publish-list refresh flow in the user's test environment.
- Full validation: `npm run test:unit` (including `npm audit --audit-level=high`) passed: 2,006 passed, 1 skipped, 0 failed across 367 unit-test files; audit reported 0 vulnerabilities. The first run exposed the 800-line module contract after preview-token handling was added; source-preview was compacted without changing behavior and the rerun passed.
- Browser UI smoke passed with 516 fixture requests after the publish fix. A focused persistent regression test now checks that signature, effective-signature snapshot, and preview token are captured before publishing controls lock.
- Preserved and excluded pre-existing button-height work from this commit: `scripts/card-news-shell-contract.test.js`, `scripts/test-ui-browser-smoke.js`, and `ui/styles/features/card-news-image-model.css`.

## Remaining work

- Restore the three pre-existing `dev` changes from the temporary stash and confirm they remain uncommitted on this test branch.
- Wait for user acceptance. Merge this branch into `dev` only when explicitly requested.
