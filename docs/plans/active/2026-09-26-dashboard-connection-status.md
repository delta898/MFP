# Dashboard connection status indicators

- Branch: `codex/feature/dashboard-connection-status`
- Start date: 2026-09-26
- Base/parent branch: `dev`
- Status: implementation and automated unit validation complete; ready to merge into `dev`

## User need and goal

The Dashboard's connection status row is visually dense and mixes provider connectivity with Tester quota usage. Make provider status more compact and immediately scannable while preserving clear status meaning and a direct route to the relevant settings.

## Scope and non-goals

- Replace expanded provider status text with compact provider icon/name indicators.
- Preserve brand icon colors; communicate state with a separate status mark and concise state text.
- Provide a hover/focus explanation and make each provider indicator navigate to its matching settings.
- Keep Tester quota/usage information out of the connection status row and retain it in the appropriate usage surface.
- Do not change provider connection verification, credential storage, or publishing behavior.
- Do not add a new status refresh backend or alter what counts as verified.

## Design and boundaries

- Reuse the Dashboard's current connection/verification state as the source of truth. Distinguish confirmed connection, attention needed, configuration missing, and actual connection error only where current state supports those claims.
- Keep provider logo colors stable. Apply status color to a small marker and short status text, not the brand mark or provider name.
- Make status details available on pointer hover and keyboard focus; clicking the provider item navigates to its corresponding settings section.
- Preserve status meaning without relying on color alone, including accessible names and a concise visible state.
- Keep quota/account usage separate from provider connectivity.

## Decisions

- 2026-09-26: User approved compact icon + provider name presentation, colored status indication, hover details, and click-through to settings. Agreed status colors belong on a separate marker and status text while provider icon retains its brand color. Red is reserved for an actual connection error; ordinary unconfigured/unchecked states are neutral or amber.

## Implementation and verification stages

1. Inspect Dashboard rendering, state source, settings navigation targets, and existing provider icons.
2. Implement compact status indicators using the existing verified state and navigation patterns.
3. Update focused UI contract tests and run the relevant browser smoke coverage.
4. Record results and remaining manual visual checks before handing off.

## Implementation notes

- Added compact Naver Blog and WordPress status controls to Dashboard Beta, keeping provider marks in their brand colors and applying state colors only to the status indicator/text.
- The status controls expose a detailed accessible label and hover/focus tooltip, and navigate to the corresponding settings section.
- Separated the Tester usage indicator visually from connection status.
- Updated loading placeholders and the Dashboard Beta contract/browser smoke coverage.
- Kept the legacy Dashboard surface and backend connection behavior unchanged.

## Final result

Implemented and committed as `feat: simplify dashboard connection status indicators`; ready for parent integration.

## Verification and remaining risks

- `node --test scripts/dashboard-beta-shell-contract.test.js`: passed (12/12).
- `git diff --check`: passed.
- `npm run test:unit`: passed on the second full run (1,968 passed, 0 failed, 1 skipped). The first run had one MCP stdio initialize timeout; its focused rerun passed (3/3).
- `npm run test:ui-browser`: attempted repeatedly. The smoke exercised the new Dashboard status hover/focus and settings navigation before failing later in unrelated existing flows (first at Blog Beta quick-create's async loading wait; next at manuscript publish flow's expected request count, 6 vs 5). No uncaught page errors were reported during the new Dashboard checks. Full browser smoke remains unverified due to these downstream failures.
- Manual visual review of Dashboard spacing, tooltip rendering, icon/status colors, and settings destinations remains with the user.
- Avoid presenting configured credentials as a confirmed connection when verification is absent or stale.
