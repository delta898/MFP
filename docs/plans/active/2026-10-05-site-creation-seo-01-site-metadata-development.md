# Site Creation SEO Metadata Development

## Branch and status

- Branch: `codex/site-creation-seo-01`
- Base/parent branch: `codex/static-site-builder-main`
- Start date: 2026-10-05
- Status: Merged into parent after focused verification; browser smoke completes Site Hosting flow but has an unrelated fixture 404 at final validation

## User need and goal

Improve Site Hosting site creation so users can supply the site-wide SEO metadata needed by the published site, while keeping the creation flow clear and avoiding duplicate settings already available on individual posts.

## Scope

- Add site description, site sharing image, favicon, and search indexing choice to the BlogGenius Site creation flow alongside the existing site name, logo, and navigation.
- Keep site name required; all other site identity/SEO inputs are optional. Search indexing defaults to enabled.
- Use the site sharing image for the homepage and template-provided non-post pages only. Do not use it as a fallback for posts.
- Use the favicon for browser/site icon metadata. Keep it semantically separate from the logo and sharing image.
- Put Cancel at the footer's left, Preview and Create at the right, and ask for confirmation only when the form differs from its initial state.
- Keep creation and future Site settings aligned around the same site-information model and reusable UI structure.
- Update the Amade family/template contract and supported template behavior as required, then persist, preview, build, and render the settings through BlogGenius.
- Preserve current site data and existing creation behavior when optional values are omitted.

## Non-goals

- Redesign the complete Site Hosting creation/settings experience.
- Add template switching or per-page SEO editing.
- Add search analytics, sitemap controls, robots management, or social account verification.
- Change post-level SEO fields (`title`, `description`, `cover`, `cover_alt`, `date`, `published_at`).

## Agreed design

- Reuse the existing site name as the site-wide title/brand; do not ask users to enter it twice.
- Add an optional site description (maximum 300 characters) for homepage and template-provided listing-page metadata; never use it as a fallback for post description or user-authored page metadata.
- Add an optional site representative/share image for homepage and template-provided listing pages only. Posts use their own `cover`, and omit image metadata when they have no cover.
- Add an optional favicon, separate from the visible logo and social image.
- Add a site-wide search indexing switch, enabled by default. Turning it off emits `noindex, nofollow` across generated pages; it does not restrict access to the deployed site.
- Keep metadata separate from visible page content. Persist values with shared site profile data and declare them in the Amade family contract so same-family template variants can consume them.
- Use shared image read/preview helpers in a small Site Profile module, with the controls structured for reuse by the future Site settings editor.
- Advance Site Hosting content/template contract to `0.7.2` for the shared site-profile fields; keep the minimum BlogGenius version unchanged.

## Decisions and tradeoffs

- The user requested a new feature branch to improve the site creation contract and UI, informed by the prior discussion of site-wide SEO metadata.
- Fields and defaults agreed: site name is required; site description, logo, site sharing image, and favicon are optional; search indexing defaults to enabled.
- Site description and post description are independent. The site sharing image applies to the homepage and template-provided non-post pages, never to posts; a post without its own representative image has no image metadata.
- Search indexing off means generated HTML receives `noindex`; it does not make the site private. This first version exposes one site-wide switch.
- The dialog footer uses `[취소]` on the left and `[미리보기] [사이트 만들기]` on the right. Cancel confirms only when values changed.
- The site information controls should be structured for reuse by the future Site settings editor rather than duplicated.
- Existing materialized Sites pin copied template files. Any Amade template changes must state whether existing Sites need recreation or an explicit upgrade to receive them.

## Implementation and verification log

- 2026-10-05: Created this feature branch from `codex/static-site-builder-main`; working tree was clean before branching.
- 2026-10-05: User approved implementation of the agreed site metadata form and Cancel interaction after reviewing the creation-screen mockup proposal.
- 2026-10-05: Added description, site share image, favicon and indexing controls to creation; Cancel is left, Preview/Create are right, and confirmation appears only after form changes.
- 2026-10-05: Added contract `0.7.2` fields to both Amade families and all four template schemas. Added shared `SiteHead` rendering for site title, descriptions, Open Graph metadata, favicon, and indexing signals; post metadata remains independent.
- 2026-10-05: Added persistence for selected profile images under the site's public assets and included the new profile values in preview/create requests.
- 2026-10-05: Focused site service, repository, compatibility and creation UI contract tests pass (22/22). The composed BlogGenius UI script also passes `node --check`; Amade family/template JSON files parse and all four templates contain the shared head component.
- 2026-10-05: Browser smoke initially exposed outdated selectors/assertions for the current Site Hosting project workspace. Updated those assertions to follow the rendered `내 사이트` workspace and add-site card. The smoke then exercised the new Site creation, cancel confirmation, preview, and create flow successfully before failing later at an unrelated existing paste-editor layout assertion (`scripts/test-ui-browser-smoke.js:5124`, expected top 12px, got 649.97px).
- 2026-10-05: During that UI check, the shared non-modal confirmation overlay was found to sit underneath the native Site creation dialog. Replaced it with a dedicated native confirmation dialog so the confirmation is visible and operable above the form.
- 2026-10-05: Astro package dependencies are not installed in the Amade templates in this checkout, so template builds could not be run without installing dependencies. No dependency installation was performed.
- 2026-10-05: Removed Site Hosting's compatibility style scope and registered the view as a design-system surface, so site cards and creation dialogs inherit the user's selected BlogGenius style. Focused design-style and Site Hosting UI contract tests pass (28/28).
- 2026-10-05: Corrected the Site creation request's indexing key to `search_engine_indexing`; focused Site UI and service tests pass (13/13). Updated the browser smoke's expected key and request order. The smoke completes the Site creation/preview checks but fails at its final generic fixture check because `/preview-fixture/` returns 404; no Site Hosting assertion fails.

## Final result

Implemented in BlogGenius and Amade. Focused automated checks pass; the browser smoke completes the Site creation and preview flow, then fails at final fixture validation because `/preview-fixture/` returns 404. Amade Astro builds and hands-on visual review remain outstanding. The BlogGenius change is committed and merged into `codex/static-site-builder-main`; it has not been pushed.
