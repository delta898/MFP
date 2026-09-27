# Spreadsheet URL Canonical Save Development

- Branch: `codex/feat/spreadsheet-url-canonical-save`
- Start date: 2026-09-27
- Base/parent branch: `release/v0.5.3`
- Status: Complete; merged into `release/v0.5.3`

## User Need and Goal

When users paste a Google Sheets sharing URL such as `/spreadsheets/d/{id}/edit?usp=sharing` and confirm access, the settings file should store only the canonical document URL, without editing paths or query parameters.

## Scope

- Normalize a validated Google Spreadsheet URL to `https://docs.google.com/spreadsheets/d/{spreadsheetId}` before writing Settings Beta core-connection settings.
- Keep access checks, the URL field, returned settings, runtime config, and persisted config consistent with the canonical URL.
- Add focused normalization and persistence regression tests.

## Non-goals

- Change Google account authorization or Spreadsheet access verification.
- Change the separate Spreadsheet-open-default feature branch.
- Migrate or rewrite an existing configuration file unless a user saves the Spreadsheet setting again.

## Design and Decisions

- User confirmed on 2026-09-27 that normalization should also happen at save time, even though runtime startup already canonicalizes the effective URL.
- Extract the Spreadsheet ID from an accepted sharing URL, then persist the canonical `https://docs.google.com/spreadsheets/d/{id}` form; remove `/edit`, fragments, and query parameters.

## Progress

- 2026-09-27: Preserved the uncommitted Spreadsheet-open-default FBR changes in a named Git stash and created this separate FBR from `release/v0.5.3`.
- 2026-09-27: Confirmed Settings Beta currently validates/extracts the ID but returns and persists the original URL.
- 2026-09-27: Canonicalized the accepted URL to `https://docs.google.com/spreadsheets/d/{id}` before persistence and response, so `/edit`, query, and fragment suffixes are removed.
- 2026-09-27: Focused Settings service and Settings Beta contract tests passed (26/26); `git diff --check` passed.

## Verification Plan

- Focused Settings service normalization and persistence tests.
- Relevant UI/API contract tests if the response value or form behavior changes.
- No live Google/production access test; full TC requires explicit approval.

## Final Handoff

Implementation was committed and merged into `release/v0.5.3`. Focused Settings service and Settings Beta contract tests passed (26/26); full TC and manual Settings Beta confirmation were not performed for this save-only slice. No live Google access was tested.
