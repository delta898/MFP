# Site Template Details UI Development

- Branch: `codex/site-template-details-01`
- Base/parent branch: `codex/static-site-builder-main`
- Start date: 2026-10-09
- Status: Implemented; awaiting user visual acceptance

## User need and goal

The Site creation screen lets users select a template but does not provide a clear place to inspect its details. Add an accessible, concise detail view so users can make an informed template choice without putting every manifest field on the selection card.

## Scope

- Show template details from canonical template metadata in the Site creation flow.
- Keep template cards focused on selection; provide details on demand in the existing left picker area.
- Include user-relevant metadata such as name, description, family, author, homepage, version, supported capabilities, and a larger preview when available.
- Keep optional metadata absent from the UI when the source does not provide it.
- Preserve template selection and Site creation behavior.

## Non-goals

- Editing template metadata or changing Amade manifests.
- Exposing internal paths, checksums, cache state, or other implementation details.
- Redesigning the Site creation layout beyond the details affordance and view.

## Proposed design

Place an enlarge icon on each template thumbnail. Selecting it replaces the template grid in the left picker area with a larger representative preview and curated metadata. An upper-right X or Escape returns to the grid without changing the selected template or right-side site settings. Keep the separate site preview dialog for generated previews only.

The source of truth is the Amade template manifest already fetched at a pinned revision. The UI API should expose a deliberate, bounded public metadata shape and omit fields that are unavailable. Do not infer metadata from filenames or duplicate catalog-index data.

## Affected boundaries and stages

1. Inspect the template creation UI, detail/preview area, catalog manifests, and API response contracts.
2. Define and implement the public template-detail response shape, reusing already validated manifest fields.
3. Add the detail affordance and UI presentation.
4. Add focused service/API and UI contract tests; run relevant browser smoke for the completed interaction.
5. Update this record with verification and any follow-up.

## Decisions and tradeoffs

- User approved proceeding on a separate feature branch.
- Prefer on-demand details over placing all metadata on every selection card, keeping the picker scannable.
- The user rejected the initial large details dialog and approved an inline left-panel details view opened from a thumbnail enlarge icon.
- The user approved replacing the inline “템플릿 목록” control with a compact upper-right X. In the detail state, Escape returns to the grid; in the grid state, Escape keeps the normal creation-cancel confirmation.
- The user chose to retain the existing current-site screenshot in settings and add a compact summary of the applied template name, family and version below it.
- Metadata may vary by template; omit missing optional values rather than displaying empty placeholders.

## Progress

- Confirmed the parent feature branch was clean at `476731e4` (`v0.6.0-dev1`) and created this branch from it.
- Confirmed the Site Hosting service already derives `author` and `homepage_url` for current family templates and exposes template version, description, family and preview metadata. Kept the existing public API shape; no additional raw manifest data is exposed.
- Added an enlarge icon to each template card. It switches the left picker from the grid to a larger preview and curated details without generating a temporary Site preview or changing the selected template.
- Details include available family, author, version and homepage metadata plus supported publishing/page/Vault/filter capabilities. Missing optional data is omitted.
- The upper-right X and Escape restore the grid and focus to the invoking icon; the selected template and right-side site settings remain intact.
- Escape closes only the detail state while it is active; the normal cancel flow remains active from the grid.
- Added the applied template name, family and version below the current-site screenshot in Site Settings. Values come from the already fetched template catalog, with sensible fallbacks for absent metadata.
- Removed the separate details section from the generated-preview dialog; that dialog remains dedicated to site preview.
- Added service, UI-contract and browser smoke coverage for the detail action, list/detail transitions, and no-preview-build behavior.

## Verification and handoff

- Passed focused UI contract, Site Hosting service and route tests: 40 tests.
- Passed `node --check ui/scripts/features/site-hosting/site-creation-navigation.js` and `git diff --check`.
- Passed `npm run test:ui-browser` after the Site Settings summary update (479 fixture requests, 0 page errors; two external Google Fonts requests were blocked by the smoke harness).
- User retains final visual acceptance of the thumbnail enlarge icon and inline details layout.
- No commit or push yet.
