# Unified manuscript preparation and publishing flow

- Branch: `codex/manuscript-workflow-unification-01`
- Start date: 2026-10-07
- Base/parent branch: `codex/static-site-builder-main`
- Status: In progress

## User need and goal

The Blog Beta writing experience currently has separate `AI 생성`, `원고 폴더`, and `원고 입력` entry modes. The user wants one cohesive writing flow where source preparation is optional, the manuscript preview/editor is always available for direct writing or paste, and the existing publishing step remains familiar.

## Agreed scope

- Integrate the AI generation path into one renamed writing experience; final product name is intentionally undecided.
- Keep the existing folder and paste entry modes during development; remove the redundant old paths after the unified experience is complete.
- Present three stages: `원고 준비` → always-visible editable manuscript/preview → `포스팅`.
- Keep `원고 준비` collapsed by default.
- Allow the user to type or paste a manuscript without first generating it. AI generation should populate the same manuscript workspace.
- Preserve the existing publishing options and behavior.
- Apply Blog UI work only to `view-blog-next` (Blog Beta).

## Non-goals

- Choosing the permanent user-facing name in this stage.
- Removing legacy folder/paste paths before the unified flow is ready.
- Changing publish providers, platform payload contracts, or server-side manuscript ownership unless required to connect the common editor safely.
- Changing the legacy `블로그` surface.

## Proposed boundaries and stages

1. Inspect the existing Blog Beta AI, folder, and paste adapters and their common Manuscript Draft contracts.
2. Add a shared writing-workspace flow that exposes preparation controls as a collapsed section and keeps one editor/preview available before generation.
3. Route generated and manually entered manuscripts through the same draft, preview, and publishing lifecycle.
4. Retain legacy modes while validating the unified flow; remove them only after the replacement is complete.
5. Run focused UI contract tests and the relevant browser smoke test when the flow is reviewable. User retains final hands-on visual acceptance.

## Decisions and tradeoffs

- An empty workspace must be useful: it cannot depend on a generated draft to reveal the editor.
- Generation is one optional way to prepare content, not a prerequisite for editing or publishing.
- Reuse the canonical Manuscript Draft/revision contract where possible so preview and publishing refer to the same content revision.
- Preserve legacy paths temporarily to avoid removing existing capabilities while the integrated flow is being built.

## Starting state

- The branch was created from `codex/static-site-builder-main`.
- At branch start, the working tree already contained unrelated pending documentation changes in `docs/decisions/README.md` and an untracked Digital Garden date policy note. They are preserved and excluded from this feature's scope.

## Progress and verification

- 2026-10-07: Created this branch and development record after the user approved proceeding with the discussed unified flow.
- 2026-10-07: Changed the Blog Beta `AI 생성` tab into the integrated `원고 작성` workspace. Its `원고 준비` controls are collapsed by default, while the editable manuscript surface and a direct-entry placeholder are visible immediately. AI action labels now make the AI role explicit.
- 2026-10-07: Direct typing/pasting in the integrated workspace now creates a canonical Paste Manuscript Draft on first preview sync, then saves later edits through the existing revision-checked Draft endpoint. Existing preview and publish handling continues to use the shared Draft identity. The separate `원고 폴더` and `원고 입력` tabs are intentionally retained during this development stage.
- 2026-10-07: Follow-up UI adjustment: removed the extra border around the collapsed preparation disclosure, made it span the full panel width, unified its step-number styling with the other workflow steps, and kept the `포스팅 · 발행` step and publish settings visible before a Draft exists.
- 2026-10-07: Follow-up from screenshot review: the preparation summary has a transparent hover background. The final publish-action row is now present at the bottom from the start and remains disabled until a valid Draft preview exists; it is hidden only while editing a queued idea.
- 2026-10-07: Nested the topic, keywords, optional title, and experience/direction fields in a dedicated `주제 설정` disclosure inside `원고 준비`. The outer preparation disclosure stays collapsed by default, topic settings open when preparation is expanded, and `참고·글 구성` remains collapsed. The topic summary reflects entered values in compact excerpts when folded.
- 2026-10-07: Removed the empty 34px topic-result row from the default layout. It now appears only while there is a result message, reducing the gap between `참고·글 구성` and the `나중에 활용` actions.
- 2026-10-07: Consolidated `글감 보관`, `발행 대기열에 추가`, and the primary `원고 만들기` action into one horizontal action group. The primary label now uses the same `✦` AI cue as the topic-assist buttons, while busy text updates without removing the icon.
- 2026-10-07: Made `미리보기 · 원고 입력` a disclosure section that opens by default and contains the toolbar, editor/preview workspace, and regenerate action. It opens automatically when editing a queued idea so the editor remains available.
- 2026-10-07: Made `포스팅 · 발행` a disclosure section that opens by default. Its nested `발행 설정` disclosure remains closed by default; the publish section is hidden while editing a queued idea, matching the existing workflow.
- 2026-10-07: Unified the three workflow step labels: consistent 30px number badges, theme-based soft primary colors, and aligned vertical spacing across the preparation, preview, and publish headers.
- 2026-10-07: Matched the AI icon-to-label spacing in the primary `원고 만들기` button to the 8px gap used by the topic-assist buttons.
- 2026-10-07: Added consistent top spacing between the nested publish-settings panel and the final publish action.
- 2026-10-07: Increased the gap between the editor and step 3 header after visual review found it cramped; step 3 now uses a larger top margin than its standard header spacing, keeping the comfortable gap above step 2 unchanged.
- 2026-10-07: Reorganized the topic-settings fields into a responsive two-column layout: subject, keywords, and title in a slightly wider left column; experience/direction in a full-height right column. Narrow screens stack the columns.
- 2026-10-07: The first pass removed the fixed button width, but screenshot review showed the different label lengths looked inconsistent. The follow-up uses a single wand-with-sparkles line icon in equally sized 44px controls; visible text is removed while each control retains its contextual accessible name and tooltip. The topic-settings column ratio remains balanced at 57.5/42.5 and stacks on narrow screens.
- 2026-10-07: Corrected the preview header background override after visual review showed it was outside the preparation container; moved the higher-specificity transparent rule after the shared open-disclosure style.
- 2026-10-07: Made the subject the only required topic field and marked it with the standard red asterisk; removed the title's `(선택)` label while retaining its blank-title guidance. Replaced delayed native tooltips on the three icon-only recommendation buttons with quick hover/focus tooltips.
- 2026-10-07: Focused UI contract verification passed (18 tests); `node --check ui/scripts/features/blog-next/quick-queue.js` and `git diff --check` passed after consolidating the action row.
- Focused verification passed: JavaScript syntax checks for the changed draft modules; `scripts/blog-next-quick-flow-contract.test.js` (18 tests); `scripts/single-publish-target-contract.test.js` (4 tests); and `src/content/manuscript-draft-service.test.js` (29 tests). `git diff --check` passed.
- 2026-10-07: Follow-up nested-disclosure verification: `scripts/blog-next-quick-flow-contract.test.js` passed (18 tests), `node --check ui/scripts/features/blog-next/quick-flow-ui.js` passed, and `git diff --check` passed.
- 2026-10-07: After required-subject validation and immediate recommendation tooltips, `scripts/blog-next-quick-flow-contract.test.js` passed (18 tests), `node --check ui/scripts/features/blog-next/quick-flow-ui.js` passed, and `git diff --check` passed.
- After the three-step layout adjustment, reran the same focused set: all 51 tests passed and `git diff --check` passed.
- Existing adjacent contract suite is not fully green: `scripts/continuous-publishing-shell-contract.test.js` fails its unrelated Stage 11 assertion because unchanged `ui/scripts/features/blog-next/runner.js` contains `showUiToast`; the other 18 tests in that file pass. This failure was also observed when running it alongside the focused service tests and is outside this change's touched files.
- Browser smoke `npm run test:ui-browser` did not reach Blog Beta: it timed out waiting for the earlier dashboard discovery state at `scripts/test-ui-browser-smoke.js:2302`. No browser-level verification of this flow is claimed; re-run after the dashboard smoke blocker is addressed or use a focused Blog Beta browser path.
- Manual review still needed: open Blog Beta writing; verify the preparation disclosure starts closed and opens; type and paste Markdown without AI generation and confirm live preview appears; generate an AI manuscript into the same editor; edit and publish a manually entered Draft. Confirm the retained folder and paste tabs continue to work while this stage is in development.
