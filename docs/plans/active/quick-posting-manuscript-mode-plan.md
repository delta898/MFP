# Quick Posting Manuscript Mode Plan

## Goal
- Add a manuscript input mode to the existing `빠른 포스팅` tab.
- Consolidate manuscript posting into `빠른 포스팅`.
- Reuse the manuscript preview/publish flow instead of cloning logic.

## UX Direction
- Add a small segmented mode switch in `빠른 포스팅`:
  - `바로 생성`
  - `원고 선택`
- In `바로 생성` mode, keep the current quick posting form and preview flow.
- In `원고 선택` mode, show the manuscript picker/publish area inside the quick tab.

## Implementation Direction
- Extract the manuscript preview/publish UI logic in `ui/app.js` into a reusable controller factory.
- Use the controller for the manuscript area inside `빠른 포스팅`.
- Share the same backend preview/publish endpoints.
- Extend shared publish setting sync so the quick manuscript fields stay aligned with other blog publish controls.

## Validation
- `빠른 포스팅 > 바로 생성` should behave exactly as before.
- `빠른 포스팅 > 원고 선택` should support:
  - folder selection
  - automatic preview/validation
  - manuscript publish
