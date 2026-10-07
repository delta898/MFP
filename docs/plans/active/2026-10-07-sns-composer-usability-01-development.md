# SNS composer usability improvements

- Branch: `codex/sns-composer-usability-01`
- Start date: 2026-10-07
- Base/parent branch: `codex/static-site-builder-main`
- Status: Implemented; awaiting review

## User need and goal

The new FBR SNS composer felt less balanced and less information-dense than neighboring views. While reviewing consistency, the user identified that first-level headers across Site, Blog Beta, Card News, Shopping Connect, SNS, Account, and Settings also lacked a shared placement and spacing rule.

## Agreed scope

- Align the composer intro-to-first-field spacing with the shared page rhythm.
- Move the character count outside the textarea so it cannot cover entered text.
- Improve the composer’s density and grouping using the existing design tokens and established component patterns.
- Preserve AI icon policy: mark the action that actually calls the AI model (`최적화 적용`); keep the confirmation-only `최적화` entry action unmarked.
- Define a shared first-level panel heading with theme-aware inset, minimum height, typography, and title-to-description spacing.
- Apply the shared heading and surface inset to `내 사이트`, `원고를 준비하고 발행하세요`, `내용 선택`, `상품으로 글 만들기`, `SNS 게시물 작성`, `이용 현황`, and `서비스를 사용하기 위한 연결 준비`.

## Non-goals

- Changing SNS publishing, Buffer workspace/channel selection, image generation, or AI request behavior.
- Changing the two-step optimization confirmation flow or its cost disclosure.
- Changing publishing behavior or adding page-specific heading variants.
- Changing unrelated view headers outside the seven agreed surfaces.

## Proposed design

- Keep the shared page title and top-tab spacing contract. Use one shared pattern for the first-level content heading inside each selected panel, including optional stage, count, or action content.
- Use the shared density section inset at each selected heading surface so theme tokens determine the common start position.
- Render the character count in a compact footer row below the editor, aligned to the end, with enough separation from help/status text.
- Use existing density, surface, border, and typography tokens to strengthen grouping and reduce empty visual areas without crowding controls.
- Reuse the existing AI icon button convention on the confirmed model-call action.

## Decisions and tradeoffs

- The existing `최적화` button opens an explicit confirmation; it does not itself call the model. The model call occurs from `최적화 적용`, which already has the AI icon. Keep the icon scoped to the actual AI call to match the user’s earlier cost-aware rule.
- SNS already consumes shared style tokens, but its own layout and nested padding create the sparse appearance; fix those composition-level issues instead of adding another theme contract.
- The seven headings do not need distinct visual types. A step number, count, or action is optional heading content; it does not change the shared placement, typography, or spacing contract.

## Progress and verification

- 2026-10-07: Confirmed the feature main `codex/static-site-builder-main` was clean at `a96a4efb`; created this feature branch from it before implementation.
- 2026-10-07: Source review found the counter absolutely positioned inside the textarea shell; SNS intro and first section each add section padding; the preview reserves a large minimum media area. The `최적화 적용` button already carries the shared AI icon; the entry button only opens confirmation.
- 2026-10-07: Moved the character counter below the textarea, reduced the intro-to-editor gap, added muted surface grouping to the message/image sections, and reduced the empty preview image minimum height. Kept the AI mark on `최적화 적용`, the actual model-call action.
- 2026-10-07: Focused SNS/design-density contracts passed (5 tests); `npm run test:ui-browser` passed (449 fixture requests; two external Google Fonts requests were blocked by the harness); `git diff --check` and test-file syntax check passed.
- 2026-10-08: Added shared `ui-panel-heading` sizing, typography, description spacing, and mobile stacking behavior; normalized the seven agreed panel insets to the density section token; adapted the Site, Card News, and SNS headers to the shared pattern. Removed the Blog Beta and Settings mobile height exceptions so the shared rule owns responsive behavior.
- 2026-10-08: Follow-up screenshot review found Account's zero-padding summary card overrides the shared component-layer surface inset from the higher-priority feature layer. Kept the intentional flush card structure and applied the shared density inset directly to its heading. Confirmed top-level tab rails all use the same `.ui-top-tabs` spacing and size tokens.
- 2026-10-08: `git diff --check` passed after the shared-header changes. Focused automated tests and visual browser review have not been rerun for this latest cross-view adjustment.
- 2026-10-08: Follow-up site-list ordering change keeps the add-site card first and sorts created sites newest-first, so a newly added site appears directly after the add card. The create-flow fallback prepends the site when refreshing the list fails. `git diff --check` passed; tests were not run for this focused ordering change.
- 2026-10-08: Site creation and settings progress now use the shared compact presentation, preserving the blocking interaction while keeping the form recognizable behind a small progress panel. Reworded site-creation progress and result copy to avoid the user-facing term “빌드”.
- Manual visual review remains with the user, especially spacing and density at their preferred window size and active theme.
