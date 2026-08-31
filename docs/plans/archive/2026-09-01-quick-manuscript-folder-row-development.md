# Quick Manuscript Folder Row Development

- Branch: `feature/quick-manuscript-folder-row`
- Base/parent branch: `feature/continuous-publishing-main`
- Start date: 2026-09-01
- Status: Complete; approved for merge into `feature/continuous-publishing-main`

## User need and goal

The manuscript-folder modes in both the existing Blog flow and the enhanced Blog Beta flow separate folder selection, clearing, and the selected-folder display into multiple rows. The user wants a smaller release-ready control that keeps the selected folder readable while reducing redundant actions.

The goal is to place the read-only selected-folder field and a consistently named `원고 폴더 선택` button on one row in both Blog experiences, and move clearing into the field as an inline control. When no folder is selected, the field must show `아직 폴더를 선택하지 않았습니다` as its placeholder.

## Scope

- Restructure the manuscript-folder selector in both the existing Blog quick-posting flow and Blog Beta.
- Keep the folder path/label read-only.
- Keep the selection button text as `원고 폴더 선택` in every state.
- Show an inline clear control only while a folder is selected.
- Preserve the existing folder picker, preview loading, and clear behavior.
- Add focused contract coverage and run the relevant UI verification.

## Explicit non-goals

- Do not add manual folder-path editing.
- Do not change preview, smart-comment, publishing, or provider behavior.
- Do not perform release preparation, version changes, commits, merges, pushes, or deployment.

## Proposed design and affected boundaries

The HTML in `ui/partials/views/blog/quick.html` and `ui/partials/views/blog-next.html` will each use a labeled field containing a flex row. Each row will contain a read-only input with an inline clear button and the existing folder-picker button. Styling remains within each flow's established stylesheet and responsive rules. Each existing controller continues to own its selection state and synchronizes its inline clear button visibility.

Affected boundaries:

- Quick-posting view markup
- Blog Beta view markup
- Publishing feature styles and mobile layout
- Local-Markdown UI controller wiring
- Blog Beta draft-input controller wiring
- Focused UI structure/behavior contract

## Decisions and tradeoffs

- The user chose the fixed button label `원고 폴더 선택` rather than changing it to `원고 폴더 변경` after selection.
- Manual editing is excluded because folder access must still come from the system folder picker and arbitrary paths would require additional validation.
- Clearing is kept as an inline `×` action with an accessible name instead of a separate full-size button.
- The first implementation targeted the existing Blog flow. After reviewing the result, the user clarified that Blog Beta is the enhanced Blog experience and requested the same improvement there without reverting the existing Blog change.

## Implementation stages

1. Create the feature branch and this development record.
2. Update markup, styles, and clear-control visibility behavior.
3. Add focused contract coverage.
4. Run focused UI contracts and the relevant browser smoke test.
5. Update this record with results and remaining manual checks.

## Progress and corrections

- 2026-09-01: Created the branch from a clean `feature/continuous-publishing-main` working tree.
- 2026-09-01: Initially interpreted the screenshot as the existing Blog quick-posting panel and implemented that surface first.
- 2026-09-01: Replaced the separate select/clear toolbar and path row with one labeled folder row.
- 2026-09-01: Added an inline clear control that starts hidden, appears after a valid folder selection, and hides again when the selection is cleared.
- 2026-09-01: Kept mobile behavior reviewable by stacking the read-only field and selection button at mobile quick-mode widths.
- 2026-09-01: Added a focused contract covering markup, copy, clear visibility wiring, and desktop/mobile layout rules.
- 2026-09-01: User clarified that Blog Beta is the enhanced Blog experience and asked to retain the existing Blog change while adding the same interaction to Blog Beta.
- 2026-09-01: Applied the same read-only field, inline clear action, fixed selection-button label, and responsive layout to Blog Beta.
- 2026-09-01: The user chose to perform manual UI acceptance. The agent limited verification to automated contracts and browser regression checks.
- 2026-09-01: The user established Blog Beta as the default and exclusive Blog change surface unless another surface is explicitly requested; this rule was added to `AGENTS.md`.
- 2026-09-01: Removed the redundant Blog Beta trend-posting heading and restored the management refresh action to the right edge.
- 2026-09-01: Upgraded only the Blog Beta folder and pasted-manuscript previews to render structured Markdown and image matching cards at the established Blog preview quality level.
- 2026-09-01: Added the user-approved Blog Beta latest-trend-date refresh control beside the date badge, preserving selections and the last valid state across refreshes.
- 2026-09-01: The full unit suite exposed the CSS module line boundary after the UI additions. Extracted the folder and trend interaction styles into a dedicated composed module before rerunning verification.

## Final result and verification

The manuscript-folder panels in both the existing Blog flow and Blog Beta now show `선택한 원고 폴더`, followed by a read-only folder display and `원고 폴더 선택` action in one desktop row. The empty display uses the placeholder `아직 폴더를 선택하지 않았습니다`. After selection, an accessible inline `×` action clears the selected folder without adding a separate full-size button.

Automated verification completed:

- `node --test scripts/quick-manuscript-folder-row-contract.test.js scripts/continuous-publishing-shell-contract.test.js scripts/ui-structure-contract.test.js` — 23 passed
- `npm run test:ui-browser` — passed with 109 fixture requests
- `npm run test:unit` — 1,202 passed after extracting the new interaction styles to restore the CSS module boundary
- `git diff --check` — passed

Manual checks still required:

- Confirm the desktop field/button proportions and spacing in both Blog and Blog Beta at the user's normal app window size.
- Select a real manuscript folder in both flows and confirm the inline `×` is visually clear without being overemphasized.
- Clear each selection and confirm the placeholder returns as expected.
- Optionally inspect the stacked mobile quick-mode layout.
- Confirm the Blog Beta trend panel no longer has a redundant heading and retains the latest-data badge at the right.
- Confirm the Blog Beta management refresh action sits at the right edge at desktop and narrow widths.
- Confirm Blog Beta folder and pasted-manuscript previews render headings, paragraphs, bold text, lists, quotes, separators, and image blocks as formatted content.
- With a real folder, confirm matched image files appear in both the inline body position and the image matching card; confirm missing files retain a clear `누락` state and prompt.
- Leave Blog Beta open across a trend-data date rollover, use the refresh icon, and confirm the badge and latest-period option advance while current category, period, custom dates, and results remain intact.

Remaining risk is limited to the user's hands-on visual confirmation and a real trend-data date rollover. The completed change was approved for commit, fast-forward merge into `feature/continuous-publishing-main`, and deletion of `feature/quick-manuscript-folder-row`. No push, release, deployment, or version change is included.
