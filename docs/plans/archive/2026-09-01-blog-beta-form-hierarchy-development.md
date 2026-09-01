# Blog Beta Form Typography Hierarchy

- Branch: `codex/blog-beta-form-hierarchy`
- Base/parent branch: `release/v0.4.0`
- Start date: 2026-09-01
- Status: Complete — user approved

## User need and goal

The Blog Beta form uses larger and heavier labels and edit text than the established Blog form. Each element is readable in isolation, but labels, values and actions compete at nearly the same visual weight, making a long form feel dense. Restore a clear form hierarchy without indiscriminately shrinking the whole interface.

## Scope

- Define an explicit, compact label size and weight for Blog Beta fields.
- Define an explicit edit-value size and weight instead of inheriting the label emphasis.
- Apply the same hierarchy to text inputs, textareas, selects, time and number controls.
- Define an explicit hierarchy for management tabs, queue titles, metadata and secondary actions.
- Keep top-level feature tabs, primary actions, status text and layout dimensions unchanged.
- Add a focused style contract that protects the agreed hierarchy.

## Non-goals

- Do not redesign the Blog Beta layout, spacing, colors or component structure.
- Do not change the existing Blog form.
- Do not treat the screenshots as pixel-perfect targets across OS display scaling.
- Do not include unrelated release, documentation or continuous-publishing interval changes in this feature commit.

## Design decision

- Field labels use `14px / 700` so their role remains clear without dominating the form.
- Editable values use `15px / 400`, matching the established Blog form's calmer reading weight.
- Helper and optional text remain visually subordinate.
- Buttons retain their existing `14px / 700` action emphasis.

## Verification plan

- Focused CSS structure/contract test.
- Existing Blog Beta shell contract test.
- Relevant browser smoke test after the style slice is complete.
- User performs final visual acceptance.

## Progress

- 2026-09-01: Compared the two form systems and confirmed that Blog Beta fields inherit approximately `16px / 500` edit text and `16px / 700` labels, while the established Blog form uses `15px` edit text and `14px / 700` labels.
- 2026-09-01: Defined the shared Beta field baseline as `15px / 400`, explicit labels as `14px / 700`, and optional helper text as `13px / 500`. Preserved the already compact automation-setting labels at `13px / 600` rather than applying a blanket size change.
- 2026-09-01: Reviewed the management list separately from form typography. Kept navigation tabs at `14px / 700`, reduced repeated queue titles to `15px / 600`, retained metadata at `13px / 400`, softened secondary actions to `13px / 600`, and preserved the primary run action at `14px / 700`.

## Result

Blog Beta now separates field roles without changing its layout: labels remain clearly identifiable, editable content reads at a calmer body weight, and optional text recedes one step. Management lists keep titles easy to scan while separating metadata, secondary controls and the primary run action. The already compact automation settings retain their established emphasis.

## Verification

- `node --test scripts/ui-style-structure.test.js scripts/continuous-publishing-shell-contract.test.js` — 18 focused style and Blog Beta contract tests passed.
- `npm run test:ui-browser` — browser UI smoke passed with 109 fixture requests.
- `npm run test:unit` — 1,212 unit tests passed before parent integration.
- `git diff --check` — passed.

## Manual acceptance

- 2026-09-01: The user compared the quick-writing hierarchy at their normal display scale and confirmed it improved.
- 2026-09-01: The user approved the matching management-list hierarchy and requested commit and parent integration.
