# Amade Template Catalog and Site Template Development

## Branch and status

- Branch: `codex/amade-template-catalog`
- Start date: 2026-10-03
- Base/parent branch: `codex/static-site-builder-main`
- Status: Amade 1.3.0 menu defaults/spec are published to `dev`. BlogGenius menu editing, validation, persistence, build routing, and Site creation preview workflow are implemented locally on this branch; UI smoke remains user-requested only.
- Parent plan: [Static Site Builder](2026-10-01-static-site-builder-main-development.md)
- Related completed stage: [Site creation and management](../archive/2026-10-02-site-creation-development.md)

## User need and goal

BlogGenius should eventually publish authored articles to a selected SSG site. Users need to choose a site template by its preview, apply only the customization fields that template supports, and have a declared article storage path/URL so BlogGenius can publish consistently. The template source must live outside BlogGenius so its catalog can evolve independently of app releases.

Amade is intended to offer two resource types: Site Hosting templates and BlogGenius design Style packs. Style means the existing `Settings > App > Appearance` experience, based on the design-style registry and semantic-token contract. The longer-term goal is an open, curated contribution surface for other creators; public self-service uploads are explicitly deferred.

## Agreed scope for this feature branch

1. Define a shared Amade package/catalog envelope with separately typed specifications for `site-hosting` and `bloggenius-style` resources.
2. Align the future Style-pack type with the existing BlogGenius design-style/semantic-token contract, without replacing the current built-in Style implementation in this stage.
3. Define the Site Hosting template contract, including preview media, identity/version, compatibility, bounded configurable fields, and the article content location/route metadata needed for future BlogGenius publishing.
4. Create one Site Hosting template that implements the contract and publish the source/catalog to the Amade GitHub repository.
5. Integrate BlogGenius with the public GitHub catalog so users can browse template previews and create a Site from a pinned external template version.
6. Improve Site creation with a three-column template preview grid, wider scrollable dialog, and only the customization/page choices declared by the selected manifest. Support an optional logo and user-defined internal navigation labels/pages; never accept external URLs as menu destinations. Keep article publishing directory/route distinct from navigation pages.

The current repository only provides the first template to validate the contract. Catalog and retrieval boundaries should permit multiple creators/resources later without building creator upload, moderation, or marketplace systems now.

## Explicit non-goals

- Replacing the BlogGenius appearance UI or loading/applying external Style packs in this branch.
- Connecting BlogGenius writing/publishing flows to Site Hosting content files; this stage defines the contract needed for that follow-up.
- Arbitrary Astro editing, free-form visual site building, or template switching/upgrading for an already-created Site.
- Creator accounts, self-service uploads, marketplace ranking, moderation, ratings, or payment.
- Git CLI dependency inside BlogGenius; public catalog/source retrieval uses HTTPS.
- External links, arbitrary route/source editing, and a general-purpose site builder.
- Compatibility migration for existing local templates or Sites. Existing Site data is not deleted as part of catalog replacement.
- Publishing directly to Amade's default branch without an agreed Git workflow. Repository changes and their remote publication will follow the confirmed Amade branch/publish path.

## Proposed design boundaries

- Amade owns resource metadata, versioned package files, previews, and type-specific contracts. BlogGenius consumes published catalog artifacts and stores the selected resource ID/version (and immutable source revision) in Site metadata.
- A shared resource envelope may define common metadata (stable ID, kind, version, display name, maintainer/license, preview, compatibility); each resource kind owns its own schema and lifecycle.
- Site Hosting configuration is data supplied to the Astro template through a bounded, template-declared interface. It is not a general-purpose source editor.
- Site Hosting resources must declare a stable article content contract and public route so a later BlogGenius publishing adapter can write posts without template-specific guessing.
- GitHub is the initial public catalog transport. Cache metadata and selected packages locally; pin a Site to an immutable revision so upstream updates do not silently alter an existing Site.
- Do not expose unsupported arbitrary repositories as catalog sources in the initial UI. The first implementation targets the user-designated Amade repository.
- Site creation UI is a modal with a wider, scrollable body; template selection uses a three-column card grid with outline-only placeholders in the incomplete final row.
- Only expose customization supported by each template's manifest. Menu labels/pages are internal routes; article publishing storage and route remain a separate manifest contract.

## Decisions and tradeoffs

- Keep both resource types within one Amade ecosystem/repository, but keep `site-hosting` and `bloggenius-style` catalogs/specifications separate. This shares discovery and contribution infrastructure without mixing Astro source packages with BlogGenius CSS token packs.
- The first deliverable is a Site Hosting template. Style is a first-class resource type in the catalog architecture but remains code-bundled until its external loading and offline behavior are designed as a separate stage.
- Creator uploads are later. Initial contributions can be curated through repository changes; no account or upload backend is needed.
- Existing design styles are documented in `docs/architecture/design-style-system.md` and `ui/scripts/foundation/style-system.js`. The Style type should preserve that semantic-token boundary instead of allowing packs to supply arbitrary application code.
- The user's explicit “existing work need not constrain the new design” applies to catalog/template compatibility assumptions. It does not authorize deleting existing user Site data.

## Implementation stages

1. Inspect the current Amade repository and BlogGenius site/catalog/appearance boundaries; reconcile this branch with the parent plan.
2. Design and document the shared Amade catalog envelope and the two kind-specific schema boundaries. Define which fields are required for the first Site Hosting template and future article publication.
3. Implement one versioned Astro Site Hosting template and preview asset in Amade, with declared configurable fields and article content location/route.
4. Publish the Amade catalog/template artifact through the user-approved GitHub flow and verify immutable retrieval. **Complete:** branch published and resource pinned by immutable commit.
5. Add BlogGenius catalog retrieval/cache, preview browsing, and materialization of the selected pinned template into a Site. **Complete.**
6. Add focused contract/service/route tests. **Complete:** 17 focused tests pass. Browser smoke and app launch were skipped per the user's standing direction.
7. Update Amade/BlogGenius documentation and parent progress record; report commits, remote publication state, verification, and follow-ups. **Complete; hands-on review remains.**
8. Implement the approved Site creation customization UI and validation contract. **Complete locally:** wider scrollable dialog, three-column preview cards, optional logo, editable manifest-defined menu labels, and internal placeholder page support when declared. Amade package publication remains a separate action.
9. Let users designate one manifest navigation item as the post-list entry point during Site creation and persist the route/menu binding for the future publisher. **Implemented locally:** uses only an explicit publishing-v2 listing route; Amade catalog publication is separate.
10. Simplify the Amade menu contract. **Published to Amade `dev` in 1.3.0:** templates provide their existing default `label`/`href` values; the declared `publishing.routes.listing` must match a default menu path; BlogGenius owns edits, validation, and placeholder routes.
11. Update the BlogGenius Site creation form to edit both menu labels and paths, show default/suggested paths as placeholders, allow menu add/remove, validate field-level errors, and use the selected menu path for the post-list route. **Complete locally:** template catalog and settings now occupy separate left/right panes; a button opens a separate preview dialog that shows the representative template screenshot or the generated draft and template metadata.

## Progress log

### 2026-10-03 — Scope and first contract slice

- User confirmed Style means the existing `설정 > 앱 > 외모` styles; public creator uploads/marketplace are deferred.
- User approved MIT for the first Amade Site Hosting package.
- User approved the scope: define Amade's template format, create one package by it, reflect it on GitHub, and connect BlogGenius.
- Confirmed the Amade checkout was clean at local `main` commit `4211477e0575b03b4e228c9e3ec69afbc25fd79d`; created `codex/bloggenius-template-contract` from that base.
- Amade schema and starter were committed as immutable package revision `6bf86200290017e82cab1013add3fc2320ca48b1`; catalog index commit `d927e9755c46ba4de8f1df3a94d9b3bceab6185a` references that revision.
- Published branch: [`codex/bloggenius-template-contract`](https://github.com/delta898/Amade/tree/codex/bloggenius-template-contract), fast-forwarded to Amade `main` at cleanup commit `841e62670f24946142aa737782af0b51c6299049`. The legacy CLI/Compose/config and old homepage fixture were removed; the repository README now documents the resource catalog and schemas.
- BlogGenius's default catalog URL now reads the Amade `main` branch, so catalog additions made there are discoverable without an app release.
- The first Astro package uses Astro 7.3.5, includes an MIT license and sample post, and declares name/logo/navigation customization plus `/blog/{slug}/` publishing metadata.
- BlogGenius retrieves the catalog over HTTPS, validates immutable revision and per-file SHA-256, caches the package, serves its preview, and creates a site with declared defaults and source revision metadata.
- Focused BlogGenius site-hosting tests pass (18/18). A read-only retrieval against Amade `main` downloaded the selected package and verified its checksums.
- `npm ci` and `npm run build` pass for the Astro template; the build emits `/`, `/blog/`, and `/blog/welcome/` static pages.
- No BlogGenius app launch or browser smoke was run. The BlogGenius branch has not been committed or merged; user hands-on UI review remains.

### 2026-10-03 — Site creation customization scope

- User approved a three-column template card grid, outline placeholders for unused cells, and a wider/scrollable creation dialog.
- User approved minimal template-based personalization: site name, optional logo, editable menu names, and internal-only added menu pages with placeholder destinations. External links and arbitrary URL entry are out of scope.
- Menu/page routing is separate from the manifest's article publishing directory/route. Future BlogGenius publishing should use the latter; menu items must not become its source of truth.
- Implementation exposes only manifest-declared capabilities. The Amade v1 contract declares name/logo/navigation labels; dynamic placeholder pages require a template declaration. User prefers retaining a popup when it fits, with more width and vertical scrolling.

### Deferred: BlogGenius article publishing to a Site

Do not implement this as part of the Amade template-contract verification. Keep it as an explicit follow-up so it is not lost:

- When a user publishes an article to a selected Site, read that Site's pinned Amade manifest contract; do not assume a template-specific path or infer it from ordinary navigation labels.
- Write one Markdown bundle under `publishing.content_directory/<slug>/`: `index.md` plus an `images/` directory. Keep image references relative to the entry file and satisfy the declared frontmatter types/defaults.
- Apply the manifest visibility rule (`is_public: true` is public; omitted means private) so private drafts do not appear in public lists or receive public detail output.
- Bind the user's designated post-list menu item to `publishing.routes.listing`; detail links must follow `publishing.routes.detail`. This binding belongs to Site configuration, while the manifest describes what the template implements.
- Verify the resulting files by building the selected pinned Astro template and checking listing, detail routes, visibility, and image URLs before considering the publishing flow complete.

The BlogGenius publisher is not implemented in this stage. The focused Amade/Astro proof and manifest declaration below establish its expected input contract only.

### 2026-10-03 — Site card and deployment verification follow-up

- A newly created Site card now reloads the Site list projection so it receives the template preview URL persisted in Site metadata.
- Site cards retain creation order when builds or deployments update `updated_at`; this prevents a build from unexpectedly moving a card to the front.
- Template preview copies retain the declared image extension and serve the matching image content type, supporting SVG, PNG, JPEG, and WebP previews.
- After user review, deployment no longer probes the public Worker URL as a success gate. A transient post-deploy 404 must not turn an active Cloudflare deployment into an app-level failure; the activated workers.dev URL is shown first, with a custom-domain link only when Cloudflare has recorded a binding.
- Static verification passed (`node --check` for changed JavaScript and `git diff --check`). No test suite or live deployment was run; manual UI confirmation remains.

### 2026-10-03 — Site creation customization implementation

- BlogGenius now renders the external catalog as a three-column template gallery with preview, name, description, and outline-only filler cells; the selected resource still resolves to its immutable catalog version.
- Site creation accepts an optional PNG/JPG/WebP logo (1 MB maximum), writes it into the new site, and applies only manifest-declared JSON configuration targets.
- Manifest navigation labels can be edited while their template-defined destinations remain intact. When a template declares the `static_placeholders` page capability, users can add internal pages by name; BlogGenius derives a safe one-segment slug and the template emits a placeholder page for it. External URLs and arbitrary paths remain unsupported.
- User decided Amade will use `dev` for development and `main` for production. BlogGenius now selects Amade `dev` for local/development runtime and `main` for production, with the existing explicit catalog URL override taking precedence.
- User set the current two templates' creator metadata (`author: amadejjs`, BlogGenius homepage, support email, `created_at: 2026-10-03`, MIT license) and approved the next immutable resource version, `1.2.0`, because both packages were already published as `1.1.0`. The common resource schema now describes creator and support metadata. BlogGenius's template picker renders name, author, description, preview, and an HTTPS homepage icon link.
- Added Amade Site Hosting schema documentation and 1.1.0 versions of both starter templates with the placeholder-page route. Checksums in both manifests match their package files. The package commit is pinned by the Amade `dev` catalog, now published remotely.
- Static verification passed: Node syntax checks for changed runtime/UI JavaScript, JSON parsing for the Amade schema/manifests, package SHA-256/size verification, and `git diff --check`. No tests, app launch, or UI smoke were run in this implementation slice.

### 2026-10-03 — Post-bundle and public visibility proof

- User confirmed the Markdown/frontmatter/image/public-visibility conventions belong in the Site Hosting manifest because BlogGenius will need the selected Site's contract when the later publishing flow is implemented.
- Amade Site Hosting schema now accepts the legacy unversioned 1.1 publishing contract and typed version 2 contract. The unpublished 1.2.0 Astro Homepage and Studio Journal manifests declare Markdown bundles, entry-relative images, `is_public` defaulting to false, and listing/detail routes.
- Both 1.2.0 templates now use per-post `index.md` bundles and exclude private posts from listing/detail output; Studio Journal's homepage recent-post section follows the same filter.
- Temporary Astro builds verified public fixture output, private and missing-flag exclusion, and entry-relative image asset emission for both templates. The Amade spec records the fixture and result. The BlogGenius article-publishing implementation remains explicitly deferred above.

### 2026-10-03 — Post-list menu binding in Site creation

- Site creation exposes one radio choice among the template's declared navigation items when the manifest provides a valid `publishing.schema_version: 2` listing route.
- The menu already targeting that route is preselected. The user's selected menu destination is set to the manifest listing route and the selection is saved in `.bloggenius/site.json` as Site-specific publishing configuration.
- The article writer remains deferred; it will read this saved selection and the pinned manifest contract.

### 2026-10-03 — Simplified menu contract and creation-form follow-up

- User approved a simple contract: template manifests supply only default menu items (`label`/`href`) and a publishing listing default; BlogGenius owns menu editing and internal path behavior. Backward compatibility is not required for this unreleased feature.
- Amade `dev` now publishes 1.3.0 of both Site Hosting templates. Package/spec commit: `7e0b02cb3c34f780de5a1f16d524cd6cc2e902bb`; catalog pointer commit: `166d6ce` (pushed).
- Current BlogGenius slice is limited to menu controls and validation in Site creation. A split settings/live-preview panel remains deferred for further discussion. Logo picker polish is also out of scope for this slice.
- BlogGenius now lets users edit each menu label and destination, add/remove entries within the current form allowance, and select which menu opens the post list. Blank destinations use the template default or the label-derived suggestion. Destination validation concerns syntax only; valid external URLs and multi-segment paths are accepted.
- The selected listing path is persisted with its menu index and detail route. During build, Astro's generated default listing directory can be moved to the selected route and its generated listing/detail HTML links rewritten when that destination is unused; output already produced by another Site builder is preserved.
- User clarified that route choice belongs to the Site owner and may be edited with another Site builder. Validation now rejects malformed URL syntax and unsafe executable schemes, while allowing valid HTTP(S), mailto/tel, relative, external, query/fragment, and multi-segment destinations. Automatic placeholder generation is only a convenience for simple internal paths supported by the selected template; it does not reject other valid destinations.
- Repository validation independently checks input shapes and logo signatures/size. Build-time listing relocation is best-effort: it supports nested root-relative paths when the destination is unused, preserves existing builder output, and skips the adjustment rather than failing the build when it cannot safely take over a route.
- Focused verification passed after this correction: 12 navigation/service/repository tests, 2 listing-route runtime tests, 2 UI script-structure tests, JavaScript syntax checks, and `git diff --check`. Browser smoke ran with localhost access but stopped in its existing project-creation flow before reaching Site creation (it timed out waiting for the `브라우저 검증 프로젝트` heading), so the changed form interaction remains unverified there.
- Menu UI and submit logic live in a dedicated `site-creation-navigation.js` module; responsive CSS uses the shared 640/768 breakpoints.

## Verification and handoff

- Earlier catalog-stage verification: 18 focused BlogGenius tests; live Amade `main` catalog and pinned package retrieval/checksum validation; Astro dependency installation and static build. No browser smoke or app launch.
- Current menu-stage verification: 13 focused Site Hosting service/repository/runtime tests pass, including selected-route persistence and built listing/detail link rewrites. JavaScript composition and CSS structure tests pass. `git diff --check` and syntax checks pass.
- Browser smoke was attempted but timed out in the existing project-creation setup before reaching Site creation. It therefore does not verify the menu interaction. No app launch or manual visual check was performed; user review remains.
- Current publishing-contract verification: Astro 7.3.5 static builds passed for both unpublished 1.2.0 templates in temporary copies. In each, `is_public: true` appeared in the listing and generated a detail page; `false` and missing `is_public` appeared in neither; a `./images/proof.svg` reference emitted an existing hashed asset. Both Amade package manifests were regenerated and their file count, sizes, and SHA-256 hashes passed verification after the final template source edit.
- Manual review remains: select both Amade templates, rename a menu, change an internal path, add/remove a menu, choose a different post-list menu, and build to verify the listing/detail routes. The split creation workspace and explicit draft preview are tracked in the follow-up section below.
- Amade `dev` is pushed through catalog pointer commit `166d6ce` (package/spec commit `7e0b02c`); no production promotion was performed. BlogGenius implementation remains uncommitted on `codex/amade-template-catalog` and unmerged into its parent.
- Follow-up: implement BlogGenius article publishing using the selected Site's pinned manifest as listed above; separately design retrieval/application of external Style resources.

### 2026-10-03 — Split site-creation workspace and explicit preview

- User approved the split creation workspace: compact three-column template cards and settings occupy the left side; the selected template or built preview and template details occupy the right. Template and settings areas scroll independently. `메뉴 추가` sits at the right of the menu table header; `미리보기` sits at the bottom right of the left pane; `취소` / `사이트 만들기` sit at the bottom right of the preview pane.
- Logo selection uses one persistent preview slot with an empty state, choose/change, and remove actions. Upload errors are displayed beside the logo field.
- The preview button sends the current form payload to a loopback-only draft-preview API. Drafts are built outside the persistent Site list, served for the preview session, and deleted when replaced or when the dialog closes; normal create/build/deploy records are not changed.
- The UI keeps the template's representative image until a built draft is ready, then shows the draft in an iframe. Failed refreshes preserve the last successful preview and surface feedback in the footer.
- Implementation boundaries: `site-repository` owns temporary draft directories; `astro-site-runtime` builds and serves draft output without recording a normal build or screenshot; `site-hosting-site.service` owns draft lifetime; Site creation UI collects and reuses its normal validated payload for preview and creation.
- Added focused repository, runtime, service, and route tests, plus browser-smoke fixture coverage for preview payload and cleanup. Repository/service/route tests (17), Astro runtime tests (6), UI structure/header tests (18 passed, 2 skipped), JavaScript syntax checks, and `git diff --check` passed. UI smoke was not run after the user requested it only on explicit request.
- Manual review remains: inspect compact template browsing, logo empty/selected/replaced states, independent scrolling, menu validation feedback, preview rendering/stale refresh, preview preservation after failure, dialog-close cleanup, and final site creation.

### 2026-10-03 — Template catalog and settings layout revision

- User reported that the template catalog was too narrow and asked to try a two-pane layout: template catalog on the left, settings on the right, and a popup preview opened by the Preview button.
- Removed the always-visible preview pane so the catalog and settings can each use roughly half of the wide creation dialog. The catalog retains its three-column cards and scrolls independently from the settings pane.
- Moved the existing representative-template image, generated draft iframe, progress state, and metadata into a separate modal preview dialog. Clicking Preview opens that dialog and starts the already implemented validated draft build; closing the preview returns to the still-open creation form.
- Preview sits at the left edge of the settings pane; Cancel and Create remain at its right edge. Its label stays `미리보기` while building and after a successful preview.
- The preview dialog header now has inset padding so its title and close button do not sit against the dialog border.
- Static UI/CSS/JS composition, header contract, JavaScript syntax, and `git diff --check` passed. UI smoke was not run per the user's instruction to run it only when explicitly requested; manual UI review remains with the user.

### 2026-10-03 — Site Hosting filesystem ownership

- User chose sibling storage roots: `workspace/site-hosting/projects/{project_id}/project.json` and `workspace/site-hosting/sites/{site_id}/`.
- The Site's `.bloggenius/site.json` `project_id` is the relationship source of truth. Project directories remain metadata-only; Site roots remain independent Astro projects with BlogGenius metadata grouped in `.bloggenius/`.
- Existing nested Project/Site data will not be migrated; the user will clear old local data and manually verify fresh creation. Code and existing path expectations were updated; automated tests were not run by request.

### 2026-10-03 — Site card deployment status and feedback

- User clarified that local readiness is not useful in the card; only deployment status should be shown beside the Site name.
- The shared feedback area now shows progress only while an operation runs, errors when one fails, and no success toast after completion. When deployment URLs exist, it shows concise `기본 주소` and `연결 도메인` link buttons without exposing long URLs or provider terminology. An empty area is collapsed.
- Browser/UI smoke was not run, per the user's instruction to run it only when explicitly requested. Manual UI review remains with the user.

### 2026-10-03 — Persistent address slots and card-level domain connection

- Site cards always reserve the feedback/address strip. Progress or error appears on the left; concise `기본 주소` and domain controls remain on the right, including before deployment as disabled placeholders.
- Once deployed, `도메인 연결 +` opens an inline card flow that loads Cloudflare zones, collects a hostname, previews the resulting address, and connects without requiring the user to discover the Settings page. A connected domain becomes a short `연결 도메인 ↗` link.
- Kept `미리보기` and `배포` as direct actions; moved `설정` and `폴더 열기` into a `⋯` menu.
- UI smoke was not run, per the user's instruction. Manual review remains with the user.

### 2026-10-03 — Site card more-menu placement

- Moved the `더보기` disclosure to the card footer's left edge; `미리보기` and `배포` stay grouped at the right.
- Its menu lists `폴더 열기`, `설정`, and a visibly disabled `삭제` placeholder. Delete behavior is intentionally not implemented pending the separate deletion discussion.
- UI smoke was not run, per the user's instruction.

### 2026-10-03 — Cloudflare deployment failure diagnostics

- A newly created Site's deployment card reported a permission failure at `Worker 생성`, while the app log did not preserve Cloudflare's underlying API response. The exact cause cannot be determined from the card alone.
- Cloudflare deploy failures now log the request ID, Site ID, Worker name, failed step, HTTP status, provider error code/message, and Cloudflare error list. Access tokens and Bearer credentials are redacted; the existing concise UI error remains unchanged.
- Static Node syntax checks and `git diff --check` passed. No automated tests or deployment were run. Manual follow-up: retry deployment and inspect the new `[Site Hosting][Cloudflare] deploy failed` log record to identify the permission/resource detail returned by Cloudflare.
