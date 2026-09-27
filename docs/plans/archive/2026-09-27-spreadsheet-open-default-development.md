# Spreadsheet Open Default Development

- Branch: `codex/feat/spreadsheet-open-default`
- Start date: 2026-09-27
- Base/parent branch: `release/v0.5.3`
- Status: Complete; merged into `release/v0.5.3`

## User Need and Goal

The Settings Beta Spreadsheet section currently disables “Spreadsheet 열기” when no URL is configured. First-time users then have no in-app launch point to create or find a spreadsheet. Keep the action available: open the configured spreadsheet when an address exists, otherwise open the Google Sheets list.

## Scope

- Keep the open action enabled without a configured address (except while the settings scope is busy, if needed).
- Open the entered Google Spreadsheet URL when present and valid; open `https://docs.google.com/spreadsheets` when blank.
- Explain the blank-address behavior in the field hint.
- Add focused Settings Beta UI contract coverage.

## Non-goals

- Create a spreadsheet or modify Google account/Spreadsheet connection state.
- Change the legacy Settings surface or the save/access-verification flow.
- Change external browser/window policy.

## Design and Decisions

- User approved this interaction on 2026-09-27: blank address opens the Google Sheets landing/list page; nonblank address opens that spreadsheet.
- Preserve the existing URL normalization helper and `window.open(..., '_blank', 'noopener,noreferrer')` behavior.

## Progress

- 2026-09-27: Confirmed clean base `release/v0.5.3`; created this FBR.
- 2026-09-27: Found that Settings Beta disables the action unless the URL passes the spreadsheet validator, while the shared URL helper already maps blank input to the Sheets landing page.
- 2026-09-27: Kept the open action enabled while idle, retained busy-state disabling, and clarified that blank opens Google Sheets while a present address opens that spreadsheet.
- 2026-09-27: Focused Settings Beta UI contract and script structure tests passed (15/15); browser UI smoke passed (507 fixture requests, 0 page errors); `git diff --check` passed.

## Verification Plan

- Run Settings Beta UI contract tests and relevant structure checks.
- Run browser smoke once the interaction slice is complete.
- Do not run full TC without explicit approval.

## Final Handoff

Implementation was committed and merged into `release/v0.5.3`. Focused Settings Beta UI contract and script structure tests passed (15/15); browser UI smoke passed (507 fixture requests, 0 page errors). Manual confirmation that a blank address opens Google Sheets and a saved address opens its spreadsheet remains useful.
