# Blog Beta New Badge Development

- Branch: `codex/blog-beta-new-badge`
- Base/parent branch: `dev`
- Start date: 2026-09-01
- Status: Complete; approved for parent integration

## User need and goal

Make the Blog Beta navigation entry easier to notice without making the Beta label look like an error state. Keep the existing menu title and add a compact red `new` superscript immediately after `Beta`.

## Scope

- Add a semantic `new` badge to the Blog Beta sidebar label only.
- Preserve the existing Blog Beta wording, navigation target, active state and icon.
- Keep the badge legible in both active and inactive navigation states.
- Add focused structure/style regression coverage.

## Non-goals

- Do not change other navigation labels or the Blog Beta page title.
- Do not add dismissal, expiry, persistence or animation behavior.
- Do not redesign the sidebar.

## Approved design

- Keep `블로그 Beta` in the existing menu text color.
- Place a small superscript-style `new` badge at the upper-right of `Beta`.
- Use deep red text with a pale red backing so it remains legible on both white and blue menu backgrounds.

## Verification and handoff

- Added a semantic `new` superscript badge with deep red text and a pale red backing to the Blog Beta sidebar label.
- Preserved the existing navigation wording, target, icon and active-state behavior.
- Updated the browser contract to verify the base label and visual badge independently rather than treating the badge text as part of the menu name.
- `node --test scripts/ui-structure-contract.test.js scripts/ui-style-structure.test.js` — 10 tests passed.
- `npm run test:ui-browser` — passed with 109 fixture requests.
- `git diff --check` — passed.
- The user approved parent integration and feature-branch deletion.
