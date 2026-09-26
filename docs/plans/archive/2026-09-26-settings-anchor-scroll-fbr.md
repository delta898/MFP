# Settings Anchor Scroll FBR

- Branch: `codex/fix-settings-anchor-scroll`
- Base branch: `dev`
- Start date: 2026-09-26
- Status: Implemented and merged into `dev`

## User need and goal

Settings summary cards should consistently navigate to their target forms. In particular, jumping to the image-model or auxiliary-chat-model form can leave the viewport at an unexpected position or show excessive space below the target.

## Scope

- Consolidate settings-card and settings-target scrolling on a shared navigation behavior.
- Keep tab activation, focus accessibility, smooth-scroll preferences, and target feedback coherent.
- Add automated UI coverage for writing, image, and auxiliary chat model destinations.

## Non-goals

- Changes to AI model settings or provider behavior.
- Changes to other Blog surfaces or unrelated settings layout.

## Design and stages

1. Inspect existing settings navigation paths and identify the common scroll contract.
2. Implement a shared target-navigation helper that handles activation/layout timing, centered alignment, reduced-motion preference, and end-of-view scroll space consistently.
3. Add focused contract and browser regression tests for all three AI model targets.
4. Run focused verification and record results; manual visual acceptance remains with the user.

## Decisions

- The user requested a separate feature branch (FBR), shared navigation behavior, and test-case coverage.
- Use the same destination behavior for the writing, image, and auxiliary chat model cards rather than maintaining separate scroll implementations.

## Progress and verification

- Branch created from `dev`; working tree was clean at start.
- Investigation found direct `scrollIntoView({ block: 'start' })` handling in the settings-card pattern and a separate tab-navigation helper that scrolls after activation. AI model forms have different heights; the auxiliary-chat form is last and can be short when its dedicated fields are hidden.
- Shared card clicks and cross-tab settings shortcuts now use the same deferred scroll/focus behavior. The helper adds only the minimum trailing scroll space needed when the target is otherwise clamped at the end of the active view, so short final forms can align consistently.
- Focused verification: `node --test scripts/settings-next-ui-contract.test.js` passed (13 tests); `git diff --check` passed.
- Browser verification: `npm run test:ui-browser` passed, including new assertions that writing, image, and auxiliary chat model forms are focused and centered in the scroll viewport.
- During iteration, the first browser run caught a regression in the pre-navigation shortcut timing; the helper was adjusted to defer visibility checks until after the view switch. The next run exposed the bottom-of-view scroll clamp for the final chat form, addressed with the temporary per-view spacer and covered by the new browser assertions.
- Full regression verification after merge: `npm run test:unit` passed (1,987 passed, 1 skipped, 0 failed); `npm run test:ui-browser` passed (510 fixture requests).
- Full-suite verification also found a source-level contract test tied to the prior inline active-view guard; the active-view guard is now owned by the shared scroll helper and the contract follows that shared behavior.
- Manual UI acceptance: pending user review.
