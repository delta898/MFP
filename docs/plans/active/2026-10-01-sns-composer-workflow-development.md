# SNS Composer Workflow Development

- Branch: `codex/feature/sns-composer-workflow`
- Start date: 2026-10-01
- Base/parent branch: `release/v0.5.5`
- Status: ready to merge

## User need and goal

Improve the manual SNS compose/publish flow after hands-on testing: remove redundant copy, avoid repeated or split status messages, make AI hashtags predictable and readable, clarify the optimization undo action, and make it easy to start a fresh post after a successful publish.

## Scope

- Remove only the helper sentence directly below the `내용` label (the yellow-highlighted sentence in the user's screenshot); retain the page introduction and useful dynamic status/limit feedback.
- Consolidate compose feedback so relevant AI, validation, and channel-limit messages are not duplicated across multiple inline/footer locations.
- Change manual AI optimization to return structured body and hashtag data, then compose the final post in the app with hashtags on a separate line. Keep compatibility/fallback handling for model responses that do not follow the structure.
- Keep an explicit, compact undo action after optimization because programmatic textarea replacement does not guarantee browser Ctrl+Z history.
- After successful publishing, preserve the publish result and provide a separate `새 게시물 작성` action that resets the composer; protect any newly edited draft from accidental loss.

## Explicit non-goals

- Changes to the existing Blog surface, automated SNS distribution behavior, supported media types, channel/provider APIs, or publishing semantics.
- Full visual acceptance testing; the user owns hands-on UI validation unless separately requested.
- Commit, merge, push, or release actions.

## Proposed design and boundaries

- Manual compose UI: `ui/partials/views/social.html` and `ui/scripts/features/social/`.
- Manual optimization contract: `src/social/sns-ai-service.js`, `src/social/manual-sns-service.js`, and the manual SNS route/tests.
- Keep AI output parsing/validation in the service boundary; keep display composition and lifecycle state in the UI.
- Maintain the existing final publish text as one string for Buffer; format hashtags on their own line before submission.

## Decisions and tradeoffs

- The user's screenshot clarifies that the redundant copy is the sentence immediately below `내용`, not the page-level introduction.
- For the post-publish path, prefer keeping `발행 완료` as the primary action state and adding a separate `새 게시물 작성` action, rather than repurposing the publish button and obscuring its role.
- Use structured `{ body, hashtags }` at the AI boundary, while preserving plain-text fallback parsing for providers that do not return valid structured output.
- Keep undo discoverable as a small secondary action; Ctrl+Z alone is not a reliable rollback for programmatic value assignment.

## Implementation stages

1. Inspect current composer lifecycle and identify duplicate feedback surfaces.
2. Implement copy/status cleanup and compose lifecycle changes.
3. Implement and test structured hashtag optimization, final-text composition, and undo affordance.
4. Run focused unit/UI contract checks and relevant browser regression; report user-owned manual UI checks.

## Progress and verification

- Read-only inspection confirmed manual optimization currently returns a single `optimized_text` string; its prompt asks the model to append hashtags at the end. Automated distribution already handles hashtag arrays separately, but is out of scope.
- The composer currently has distinct AI status, limit status, publish summary, and disabled-button title messages. The helper directly below `내용` is a static paragraph in `ui/partials/views/social.html`.
- A successful publish currently locks the same composer signature as `발행 완료`; the composer has no explicit reset/new-post action.
- Removed the exact highlighted helper paragraph, merged AI/validation/limit feedback into one live region below the editor, and removed the duplicate “내용 입력” footer hint while retaining concise channel-state guidance.
- Manual AI optimization now requests `{ body, hashtags }`; the service normalizes and accepts structured JSON, while tolerating legacy plain-text responses and separating trailing hashtags where possible. The application composes the final post with hashtags on a separate line and counts the full composed text.
- Kept optimization undo as a compact secondary `되돌리기` action; added a `새 게시물 작성` action after successful publish. It revokes/resets local image state, clears the prior publish result, preserves selected channels, and asks before discarding a draft changed after the published version.
- Follow-up from user review: successful per-channel rows now show a small `↗` link only when Buffer supplies a valid HTTPS external post URL; starting a new post clears the previous publish-result panel as well as the composer data.
- Follow-up from user review: after an unchanged post is already published, `새 게시물 작성` becomes primary and the disabled `발행 완료` action becomes secondary. If the draft changes, the normal publish action regains primary emphasis. Mobile action order follows the active primary action.
- Follow-up from visual review: removed the mismatched compact sizing from both footer actions so primary/secondary state changes affect color/emphasis only; both now use the same standard control height.
- Follow-up from image-limit report: the screenshot showed cached channel metadata with `max_assets: 0`, while the card misleadingly rendered that as one image and the publish guard surfaced zero. Bumped the SNS workspace-cache version to invalidate stale snapshots, stopped client-side blocking when a channel has no positive known image limit (the publish service remains authoritative), and made unknown limits explicit in the channel card.
- Final requested verification: `npm run test:unit` passed (2,065 passed, 1 skipped; security audit reported 0 vulnerabilities). SNS-focused UI contract tests passed (8/8): publishing-social structure, social view design-system, and SNS workspace cache. The full browser UI smoke also passed (379 fixture requests, no page errors; external font requests were blocked as expected).
- The full browser smoke first exposed one stale assertion expecting the removed empty-content footer copy. Updated the assertion to the current concise selected-channel label, then reran the complete browser smoke successfully.
- Final verification is complete. Manual visual/exploratory acceptance remains with the user; no merge or release has occurred yet.
- Verification: `node --test src/social/sns-ai-service.test.js src/social/manual-sns-service.test.js` (41 passing); `node --check` for edited social UI scripts; `git diff --check` (all passed). After each follow-up UI-only refinement, affected script syntax and `git diff --check` passed.
- Browser/UI test and full unit suite: not run. The user asked to defer UI tests unless specifically requested; the full suite also requires explicit approval per project rules.
- Manual UI acceptance: pending user review.
- Risks/follow-up: structured model output must tolerate malformed responses without losing the current draft; new-post action should preserve the latest publish result while resetting only compose inputs and image state.
