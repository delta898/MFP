# Quick Posting Manuscript Mode Plan

## Goal
- Support generated, folder-based, and pasted manuscript inputs in the existing `빠른 포스팅` tab.
- Consolidate manuscript posting into `빠른 포스팅`.
- Reuse the manuscript preview/publish flow instead of cloning logic.

## UX Direction
- Add a small segmented mode switch in `빠른 포스팅`:
  - `바로 생성`
  - `원고 폴더`
  - `원고 붙여넣기`
- In `바로 생성` mode, keep the current quick posting form and preview flow.
- In `원고 폴더` mode, show the manuscript picker and local image matching flow.
- In `원고 붙여넣기` mode, show one Markdown editor containing both the H1 title and body.
- Keep only the active input surface visible so users do not need to combine folder selection and pasted text.

## Implementation Direction
- Extract the manuscript preview/publish UI logic in `ui/app.js` into a reusable controller factory.
- Use the controller for both folder and pasted manuscript areas inside `빠른 포스팅`.
- Share the same backend preview/publish endpoints.
- Normalize `selectedFiles` and `markdownText` into the same preview model and temporary `contents.md` workspace.
- Extend shared publish setting sync so the quick manuscript fields stay aligned with other blog publish controls.
- Preserve the pasted Markdown draft in browser localStorage.
- Before publishing pasted Markdown, select three own-blog posts from RSS using relevance scoring first and randomized fallback second.
- Replace an existing related-post section when detected, then append one generated related-post heading and the selected links at the bottom.

## Validation
- `빠른 포스팅 > 바로 생성` should behave exactly as before.
- `빠른 포스팅 > 원고 폴더` should support:
  - folder selection
  - automatic preview/validation
  - manuscript publish
- `빠른 포스팅 > 원고 붙여넣기` should support:
  - Markdown text input with an H1 title
  - automatic preview/validation
  - draft recovery after UI reload
  - automatic related-post insertion at publish time
  - the same Naver/WordPress publish pipeline
