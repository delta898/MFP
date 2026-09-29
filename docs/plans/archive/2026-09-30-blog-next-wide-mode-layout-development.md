# Blog Beta Quick-Create Wide Mode Layout

- Branch: `codex/feat/blog-next-wide-mode-layout`
- Start date: 2026-09-30
- Base/parent branch: `dev`
- Status: complete; merged into `dev`

## User need and goal

When the sidebar is collapsed, Blog Beta's three quick-create modes (generate, manuscript folder, and paste manuscript) appear to use different content widths and insets. The user wants a consistent, wider work area.

## Scope

- Unify the visible work-area width and horizontal padding across all three quick-create modes in `블로그 Beta` (`view-blog-next`).
- Preserve responsive behavior and comfortable readable text widths where appropriate.
- Add/adjust focused layout contract coverage.

## Non-goals

- Do not modify the legacy `블로그` view.
- No functional workflow, publishing, or editor behavior changes.
- No unrelated UI polish.

## Design and boundaries

Investigate shared mode-panel wrappers and nested max-width/inset rules. Prefer one shared layout contract rather than per-mode offsets. Relevant files include `ui/partials/views/blog-next.html`, `ui/partials/views/blog-next/quick-draft-modes.html`, and Blog Beta feature styles.

## Decisions

- User approved a wider consistent layout for the three quick-create modes.
- Keep all three mode cards aligned to the same available width; retain only deliberate responsive constraints.

## Implementation and verification

- Removed the separate 1180px width caps from the AI-create form and the folder/paste mode panels so all three use the available shared panel width.
- Renamed the input tabs to `AI 생성`, `원고 폴더`, and `원고 입력`; updated their title/help text to describe each mode accurately.
- Updated Blog Beta shell/layout contract tests to enforce the shared width behavior and the revised labels/help text.
- Made modal width content-sensitive: the quick topic-recommendation tab is compact (840px maximum), while keyword discovery and keyword/title analysis remain wide (1040px maximum); narrow screens retain viewport-based sizing.
- Added Escape-to-close behavior to both modal surfaces and return keyboard focus to the control that opened the modal. Existing close buttons remain available; an active confirmation dialog keeps Escape priority.
- Extended browser smoke coverage for Escape closing and focus restoration on both discovery and title-recommendation dialogs.
- Kept the topic refresh action label stable as `글감 추천`, reduced its button to content width with a 112px minimum, and aligned the recommendation-selection-plus-dismiss action group to the same right edge as the request button.
- Extended browser smoke coverage to verify the shorter request button and shared right-edge alignment. The first run exposed a brittle test assumption about the dismiss icon's pixel width; the assertion now compares actual element bounds.
- Focused checks passed: `node --test scripts/blog-next-panel-anatomy-contract.test.js scripts/continuous-publishing-shell-contract.test.js` (24 passing) and `npm run test:ui-blog-auto` (passed before the tab-label-only follow-up).
- Modal-related focused checks passed: `node --test scripts/discovery-badge-contract.test.js scripts/modal-input-contract.test.js scripts/blog-next-panel-anatomy-contract.test.js scripts/continuous-publishing-shell-contract.test.js` (27 passing).
- Updated density contract checks passed as part of the focused run (31 tests total).
- Modal-width contract checks passed: discovery density and interaction contracts passed, including the compact and wide width rules.
- `npm run test:ui-browser` passed (487 fixture requests; external requests were blocked).
- After the recommendation button/alignment update, `npm run test:ui-browser` passed again (490 fixture requests; external requests were blocked).
- After making widths content-sensitive, `npm run test:ui-browser` passed (486 fixture requests; external requests were blocked). One preceding run failed in an unrelated dashboard focus assertion before retry passed.
- Stale width-contract expectations were updated to match the shared full-width layout; focused tests passed (39 tests).
- `git diff --check` passed.
- Full `npm run test:unit` passed after the final changes: 2,046 passed, 1 skipped, 0 failed.

## Final result and remaining work

- Feature implementation and automated validation are complete; merged into `dev`.
- The user retains final visual confirmation of the narrower dialogs and aligned quick-create modes.
