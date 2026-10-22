# Card News source and publishing state development

- Branch: `codex/fix/card-news-source-publish-state`
- Base/parent branch: `release/v0.7.0`
- Start date: 2026-10-22
- Status: implementation complete; awaiting release version selection and user review

## User need and goal

Card News supports feed, URL, and manually entered sources. The publishing caption and selected publishing channels must belong to the current card set, not leak from a previous source or generation. After publishing, users need a clear result and a way to begin another URL or manually sourced card set.

## Scope

- Reset stale publishing caption/result state when switching source or generation.
- Preserve selected channels after a complete publish; on partial success, deselect successful channels so retry targets failures.
- Add `새 카드 작성` after publishing for URL and manuscript sources only; clear the relevant input, preview, generation, and result state, then focus the source input.
- Translate Card News 3:4 image requests to KIE Grok Imagine's accepted 2:3 ratio and keep that output at 2:3; preserve other model mappings.
- Add focused UI regression coverage for source-specific captions, post-publish channel state, and new-card reset/focus behavior.
- Prepare the completed change for the user's selected dev release.

## Non-goals

- Change feed-based creation or its post-publish workflow.
- Change AI prompt content or publishing provider behavior.
- Commit, merge, push, tag, or publish a release without explicit authorization.
- Include the pre-existing `package.json` description edit in this feature change.

## Design and boundaries

- Card News Application generation/publishing contracts remain the owners of generated caption data and source metadata.
- The Card News UI owns transient source selection, form, channel-selection, and result-panel state.
- The shared Buffer channel picker remains responsible for dynamic channel/workspace markup.
- The new-card action is available only when a URL or manuscript source has a publish outcome.

## Decisions

- The user requested a separate feature branch based on `release/v0.7.0`.
- URL and manually entered sources get `새 카드 작성`; feed does not.
- Starting another card clears source-specific inputs and downstream state, then focuses the source input.
- Complete publish keeps destination checkboxes selected. Partial publish unchecks successful destinations to avoid repeating those posts.
- Keep the user's earlier package description edit separate from this feature commit.

## Progress

- 2026-10-22: User-run generation with Grok Imagine Image 2.0 returned `This aspect_ratio is not within the range of allowed options`. Card News requests 3:4 and the Gateway forwarded it. The user chose to request 2:3 from KIE and keep the resulting image at 2:3 for Grok; FLUX 3 and Qwen 3 retain their existing 4:5-to-3:4 conversion.
- 2026-10-22: Confirmed that changing source hid downstream panels but left caption/result DOM state intact; the publishing caption default only filled an empty textarea. Confirmed successful destinations were explicitly unchecked after publishing.
- 2026-10-22: Added downstream cleanup on source/generation changes, the source-specific `새 카드 작성` reset/focus flow, complete-success channel preservation, and partial-success retry selection behavior.
- 2026-10-22: Updated the Card News browser smoke scenario to verify the direct-entry caption, channel preservation, and new-card reset/focus. Repaired static shell assertions that incorrectly expected the shared Buffer picker’s runtime-generated markup in static HTML.

## Verification and handoff

- Passed: `node --test scripts/card-news-shell-contract.test.js src/applications/card-news/publishing/service.test.js` (35 tests).
- Passed after the KIE Grok ratio fix: `node --test packages/plugins/core/ai-gateway/index.test.js packages/plugins/core/ai-gateway/provider-transport.test.js` (33 tests), including 3:4/4:5-to-2:3 request mapping for Grok and existing 4:5-to-3:4 mapping for FLUX 3/Qwen 3.
- Passed: JavaScript syntax checks for the changed Card News scripts and browser smoke script; `git diff --check`.
- Card News browser smoke scenarios passed through the flow, including direct-entry caption, successful publish state, and new-card reset/focus.
- The full browser smoke later failed in its final error audit because the Focus Clock widget emitted five `net::ERR_ABORTED` iframe requests during navigation; no Card News failure was reported.
- Manual UI acceptance: user to check feed, URL, and direct-entry publishing, plus the final visible spacing and focus behavior.
- Live KIE Grok generation was not called from the test run; verify that a 3:4 selection now produces a 2:3 result without the provider rejection.
- Release version: awaiting user's exact choice; current version is `0.7.0-dev7`.
- Commit/merge/push: not performed.
