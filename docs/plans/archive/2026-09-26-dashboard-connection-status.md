# Dashboard connection status indicators

- Branch: `codex/feature/dashboard-connection-status`
- Start date: 2026-09-26
- Base/parent branch: `dev`
- Status: complete; fast-forward merged into `dev`

## User need and goal

The Dashboard's connection status row was visually dense and mixed provider connectivity with Tester quota usage. Make provider status compact and immediately scannable while retaining clear status meaning and a direct route to the relevant settings.

## Scope and non-goals

- Replace expanded provider status text with compact provider icon/name indicators and a colored status dot.
- Preserve brand icon colors; communicate state through the dot and detailed hover/focus tooltip, not visible status copy.
- Make each provider indicator navigate to its matching settings when clicked.
- Keep Tester quota/usage information out of the connection status row and retain it in the appropriate usage surface.
- Do not change provider connection verification, credential storage, or publishing behavior.
- Do not add a new status refresh backend or alter what counts as verified.

## Design and boundaries

- Reuse the Dashboard's current connection/verification state as the source of truth. Distinguish confirmed connection, attention needed, configuration missing, and actual connection error only where current state supports those claims.
- Keep provider logo colors stable. Apply status color only to a small marker, not the brand mark, provider name, or visible status label.
- Make detailed status available on pointer hover and keyboard focus; clicking the provider item navigates to its corresponding settings section.
- Preserve accessible status meaning through the control's accessible name and tooltip; color is not the only status information.
- Keep quota/account usage separate from provider connectivity.

## Decisions

- 2026-09-26: User approved compact icon + provider name presentation, colored status indication, hover details, and click-through to settings. Red is reserved for an actual connection error; ordinary unconfigured/unchecked states are neutral or amber.
- 2026-09-26: After reviewing the rendered design, user asked to remove visible status labels such as “연결됨”. Final presentation is provider icon + name + status dot; detailed text remains in the tooltip and accessible label.

## Implementation notes

- Added compact Naver Blog and WordPress status controls to Dashboard Beta, keeping provider marks in their brand colors and applying state colors only to the status dot.
- The controls expose a detailed accessible label and hover/focus tooltip, and navigate to the corresponding settings section.
- Separated the Tester usage indicator visually from connection status.
- Updated loading placeholders and Dashboard Beta contract/browser smoke coverage.
- Kept the legacy Dashboard surface and backend connection behavior unchanged.

## Final result

Implemented as `feat: simplify dashboard connection status indicators` and fast-forward merged into `dev`.

## Verification and remaining risks

- `node --test scripts/dashboard-beta-shell-contract.test.js`: passed (12/12).
- `git diff --check`: passed.
- `npm run test:unit`: passed on the second full run (1,968 passed, 0 failed, 1 skipped). The first run had one MCP stdio initialize timeout; its focused rerun passed (3/3).
- `npm run test:ui-browser`: attempted repeatedly. The smoke exercised the new Dashboard status hover/focus and settings navigation before failing later in existing unrelated flows (Blog Beta quick-create async loading wait; manuscript publish flow expected request count of 5 but observed 6). No uncaught page errors were reported during the new Dashboard checks. Full browser smoke remains unverified due to these downstream failures.
- Manual visual review of Dashboard spacing, tooltip rendering, icon/status colors, and both settings destinations remains with the user.
- Avoid presenting configured credentials as a confirmed connection when verification is absent or stale.
