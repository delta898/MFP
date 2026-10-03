# Amade Template Catalog and Site Template Development

## Branch and status

- Branch: `codex/amade-template-catalog`
- Start date: 2026-10-03
- Base/parent branch: `codex/static-site-builder-main`
- Status: Catalog integration, Site creation customization, and post-list menu binding are implemented locally. Amade 1.2.0 packages are published to the public `dev` catalog; BlogGenius changes remain uncommitted on this feature branch.
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

## Verification and handoff

- Earlier catalog-stage verification: 18 focused BlogGenius tests; live Amade `main` catalog and pinned package retrieval/checksum validation; Astro dependency installation and static build. No browser smoke or app launch.
- Current customization-stage verification: static syntax, JSON, package checksum/size, and diff checks passed. No tests, app launch, or UI smoke were run.
- Current publishing-contract verification: Astro 7.3.5 static builds passed for both unpublished 1.2.0 templates in temporary copies. In each, `is_public: true` appeared in the listing and generated a detail page; `false` and missing `is_public` appeared in neither; a `./images/proof.svg` reference emitted an existing hashed asset. Both Amade package manifests were regenerated and their file count, sizes, and SHA-256 hashes passed verification after the final template source edit.
- Manual review remains: choose each template card, create with and without a logo, edit default menu labels, add an internal page after the 1.1.0 packages are published, then use build/preview.
- Amade's original catalog feature branch is pushed and merged into `main`. The two 1.2.0 packages and catalog references are now pushed to Amade `dev` in commits `52ad2a3` and `d9fb93e`; no production promotion was performed in this task. BlogGenius implementation remains uncommitted on `codex/amade-template-catalog` and unmerged into its parent.
- Follow-up: implement BlogGenius article publishing using the selected Site's pinned manifest as listed above; separately design retrieval/application of external Style resources.

### 2026-10-03 — Cloudflare deployment failure diagnostics

- A newly created Site's deployment card reported a permission failure at `Worker 생성`, while the app log did not preserve Cloudflare's underlying API response. The exact cause cannot be determined from the card alone.
- Cloudflare deploy failures now log the request ID, Site ID, Worker name, failed step, HTTP status, provider error code/message, and Cloudflare error list. Access tokens and Bearer credentials are redacted; the existing concise UI error remains unchanged.
- Static Node syntax checks and `git diff --check` passed. No automated tests or deployment were run. Manual follow-up: retry deployment and inspect the new `[Site Hosting][Cloudflare] deploy failed` log record to identify the permission/resource detail returned by Cloudflare.
