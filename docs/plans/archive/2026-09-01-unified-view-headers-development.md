# Unified View Headers Development

- Branch: `feature/unified-view-headers`
- Base/parent branch: `feature/continuous-publishing-main`
- Start date: 2026-09-01
- Status: Complete; approved for parent integration

## User need and goal

Top-level menu headers currently use inconsistent title positions and content: some show only a title, some include descriptions, and others mix status badges or action buttons into the title area. The user wants every top-level menu to follow the Blog Beta header pattern.

The goal is one shared header structure with a title and one-line description. Blog Beta alone keeps its `새 흐름 준비 중` badge. Page utilities such as clocks may remain in the consistent right-side header position, while status, navigation, and refresh controls belong below the header.

## Scope

- Unify Dashboard, Blog, Blog Beta, Shopping Connect, SNS, Account, Settings, and Logs headers.
- Add a concise user-facing description to every top-level view.
- Use shared header copy and heading classes instead of per-view title layout variants.
- Move Dashboard status and Account refresh out of the title copy while preserving Dashboard app controls inside the clock/timer menu.
- Preserve existing tabs, clocks, state, IDs, and behavior.
- Add focused structural coverage and run relevant UI regression verification.

## Explicit non-goals

- Do not redesign view content, tabs, cards, navigation, or feature workflows.
- Do not add badges to views other than Blog Beta.
- Do not change Dashboard service behavior or Account refresh behavior.
- Do not perform release, version, push, deployment, or parent merge work without a separate request.

## Proposed design and affected boundaries

Every view header uses `view-title-block > view-title-row`, with a shared `view-title-copy` containing `view-title-heading` and the description. A page clock remains a consistent right-side utility where already supported. Controls currently mixed into header content move to a compact row immediately below the header.

Affected boundaries:

- Top-level view partials
- Shared app chrome styles
- Dashboard and Account layout styles
- Mobile responsive rules
- UI structure/browser regression tests

## Decisions and tradeoffs

- Descriptions use user-facing capability language rather than internal implementation terms.
- Blog Beta keeps the only header badge because the user explicitly identified it as Beta-specific.
- Existing clocks remain available but are not part of the title copy.
- Existing feature controls are moved, not removed, to avoid behavior loss while keeping the header semantically focused. Dashboard restart/stop remain hidden inside the clock/timer menu rather than becoming standalone page actions.

## Implementation stages

1. Create the feature branch and development record.
2. Introduce the shared header structure and descriptions.
3. Relocate non-header controls and adjust responsive layout.
4. Add focused contracts and run UI verification.
5. Record results and remaining manual checks.

## Progress and corrections

- 2026-09-01: Created the branch from a clean `feature/continuous-publishing-main` working tree.
- 2026-09-01: Introduced shared title-copy and title-heading classes across all eight top-level views.
- 2026-09-01: Added one-line descriptions while keeping the Blog Beta badge as the only title badge.
- 2026-09-01: Moved Dashboard status and Account refresh below their headers without changing IDs or behavior.
- 2026-09-01: Removed the remaining Blog Beta-only title layout class so every view now relies on the same shared header layout.
- 2026-09-01: Added a focused structural contract for header structure, descriptions, the Beta-only badge, and relocated controls.
- 2026-09-01: Corrected a Dashboard regression by returning restart/stop to the clock/timer menu and keeping their source markup hidden until the widget moves it into the menu.

## Final result and verification

All eight top-level views now use the Blog Beta-style title position and shared title/description structure. Blog Beta alone retains `새 흐름 준비 중`. Existing clocks remain right-side utilities, Dashboard status and Account refresh sit below their headers, and Dashboard restart/stop remain in the clock/timer menu without an initial standalone flash.

Automated verification:

- `node --test scripts/view-header-contract.test.js scripts/ui-structure-contract.test.js scripts/ui-style-structure.test.js` — 12 tests passed.
- `npm run test:ui-browser` — browser UI smoke passed with 109 fixture requests.
- `git diff --check` — passed.

Manual checks intentionally remain with the user:

- Confirm title and description positions across Dashboard, Blog, Blog Beta, Shopping Connect, SNS, Account, Settings, and Logs.
- Confirm Blog Beta is the only view showing `새 흐름 준비 중`.
- Confirm Dashboard status and Account refresh feel appropriately placed below the title area, and restart/stop appear only after opening the clock/timer menu.
- Confirm narrow-window wrapping and clock placement remain visually balanced.

Remaining risk is limited to visual spacing preferences that automated structural and browser tests cannot assess. The user approved parent integration after the Dashboard clock/timer control regression was corrected.
