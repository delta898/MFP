# Amade Site Hosting Template Specification 0.1.0 — Design and Proof

## Status

The user approved proceeding in this order: define family data contracts, create and validate two presentation templates in each of two families, connect them to BlogGenius development, then extend Amade to serve Site Hosting templates and BlogGenius UI Styles from one repository/catalog. The Amade manifest/catalog shape remains experimental `0.1.0`; do not promote it to `1.0.0` until both resource kinds and shared discovery have been validated. Canonical Site Hosting packages are in Amade `dev` under `amade/families/` and `amade/templates/`; the catalog integration was pushed as `529f2d5`. The current Site Hosting posting branch is `codex/site-hosting-posting-01-quick-draft-publish`.

### Decision update (2026-10-09)

The user clarified that Template Family is grouping/use-case metadata only. Templates in a Family need not be interchangeable, and there is no product promise that changing Templates preserves Site data. The original A→B→A experiment and shared family fixtures are historical proof for those exact packages only. This decision is documentation/product direction; Amade manifests, schemas, and validation scripts have not yet been changed to align their structure. Treat schema alignment as follow-up work requiring its own design and contract-version decision.

### Follow-up design: Family grouping vs. content model (2026-10-09)

**Design status: target roles agreed; implementation is authorized for Site Hosting Contract `0.2.0-dev1`.** Inspection found that Family currently owns `site_data_directory`, `site_profile`, navigation, media, content types, routes, and frontmatter policy. BlogGenius consequently uses Family data for package seed discovery, post eligibility, route construction, site profile editing, and template update gating. That makes Family an operational contract despite the product decision that it is only a grouping.

Target ownership:

- **Family:** catalog grouping only: stable ID, display name, description, and ordered membership. It grants no compatibility, capability, route, or data-preservation behavior.
- **Content Model:** a separately identified, versioned data contract that defines site/profile fields, navigation, media references, content kinds and paths, frontmatter rules, routes, and publishing capabilities. It is reusable independently of Family membership.
- **Template:** owns presentation and executable project, declares its required Content Model (ID plus exact version/reference), supported setup inputs, and its own starter `site-data` seed. A template can only be selected when BlogGenius supports its required content model. A Family’s membership does not affect that check.
- **Site instance:** pins the selected Template and Content Model identity/version at creation. Updating means updating that same Template while preserving user data. Selecting a different Template is not an update and remains unsupported; do not add an implicit conversion path.

Keep the first implementation small: Content Models are package dependencies referenced by a Template manifest, not user-selectable catalog entries. Store canonical model manifests under `amade/content-models/<model-id>/`; a Template declares the repository-relative model manifest, ID, and exact model version. Keep starter data within the Template package so two visually or structurally different Templates can initialize independently even when they reuse a model. If an actual model is shared, both templates can reference the same immutable model version. Do not copy the model declaration into Family or duplicate it in each Template.

Consumer consequences:

1. Catalog index continues to group templates by Family for browsing. Validate Family membership only as a catalog relationship.
2. Package resolution fetches the Template, its Content Model dependency, and the Template-owned seed at one pinned repository revision; validates paths, IDs, versions, and checksums before materialization.
3. Move BlogGenius content/profile/route/publish capability reads from `resource.family` to the resolved Content Model. Move initial seed discovery from Family to Template.
4. Determine update availability by the same `template_id` and supported Template integration contract, never by equal `family_id`. A model change is an explicit dependency compatibility decision, not a Family switch.
5. Existing sites keep their durable `site-data`. Provide a read-only legacy resolver for currently materialized Family-based packages during transition; do not rewrite user files. If an old site cannot be mapped unambiguously to a model, disable model-dependent actions with a diagnostic instead of guessing.

Implementation sequence after contract-version approval: (a) add Content Model manifest/schema and Template dependency/seed declarations; (b) migrate current Homepage and Digital Garden Family content declarations into model manifests and move each seed into its Template package; (c) update Amade catalog validation/packaging; (d) update BlogGenius resource resolution, site creation, publishing, settings, and update policy; (e) retain legacy read support and add focused contract fixtures. No cross-template UI is in scope.

**Version decision:** the user selected `0.2.0-dev1` on 2026-10-09 for development and verification; promote to a stable version only after validation and a separate version decision. The Template package version remains independent.

**Implementation status:** blocked before Amade file edits. Amade is outside the writable workspace roots; the explicit write request was rejected by automatic approval review because the proposed bulk manifest rewrite also deleted/recreated per-template seed directories before consumer/schema changes were in place. Do not retry through an alternate write mechanism. BlogGenius-side implementation remains unstarted to avoid leaving its consumer ahead of the Amade contract. Resume when Amade write access/approval is granted, then execute in staged, reversible edits with focused validation.

### Current content contract update (2026-10-05)

Amade is the canonical source for Site Hosting content rules. Its two `family.json` manifests declare `content_contract_version: 0.7.1`; each of the four templates declares package version `0.4.4` and `bloggenius-site-hosting-template@0.7.1`. The Amade manifest format remains `spec_version: 0.1.0`. Frontmatter is optional and extensible; file paths supply content kind and stable IDs, omitted `publication` defaults to `none`, and optional `cover` / `cover_alt` identify the representative post image. See [the accepted Site Hosting content contract](../../decisions/2026-10-04-site-hosting-post-frontmatter-contract.md).

## User decision

- Start a new specification line at `0.1.0` and use it for experimentation and validation.
- Promote the specification to `1.0.0` only after the model has been tested and is sufficiently stable.
- Treat all existing Amade templates using the current `1.x` format as **legacy**. They are reference material only; they do not define the new specification and are not automatically converted.
- The initial 0.1 design focused on Site Hosting; the user has now approved extending this same experimental specification to cover BlogGenius UI Style packages before calling it stable.
- Use two product concepts: **Template Family (템플릿 계열)** and **Template (템플릿)**. Decision updated 2026-10-09: Family is a catalog/use-case grouping only; it does not promise that Templates can be switched or share compatible data. Each Template may have its own data requirements and behavior.

The specification version and an individual package's release version are separate concepts. On 2026-10-04, the user agreed on common selectable-package metadata: name, description, author, package version, license, creation date, categories, tags, and representative preview are required; screenshots, homepage, and support are optional. Templates and UI Styles also declare a lifecycle status (`active`, `deprecated`, or `withdrawn`).

## Amade shared catalog extension (2026-10-04)

Amade will host both Site Hosting Template Families and BlogGenius UI Styles. “Shared specification” means shared discovery/catalog, metadata, lifecycle, immutable revision pinning, and repository safety rules; it does not mean merging their technical payload contracts. Keep `families[]` as the discovery grouping for Site Hosting Templates and add an ordered `styles[]` list of standalone Style manifest references. Family and template remain separate objects; a family is not a selectable template.

Both selectable package types use the agreed common metadata: `name`, `description`, `author`, package `version`, `license`, `created_at`, `categories`, `tags`, representative `preview`, optional `screenshots`, `homepage`, `support`, lifecycle `status` (`active`, `deprecated`, `withdrawn`), and required `compatibility.min_bloggenius_version` plus `compatibility.contract` (`id`, `version`). Only `active` resources are offered for new selection; absent status is not active. Catalog-level `experimental` describes specification maturity, not package availability. All catalog and package reads are pinned to one Amade commit SHA.

The Style-specific payload stays data-only and references the BlogGenius semantic-token contract ID/version. It contains a complete allowlisted token map and no executable JavaScript or arbitrary CSS file. Both resource types also declare a minimum BlogGenius app version; current packages target `0.6.0`. Compatibility requires both meeting that minimum and supporting the declared type-specific contract. The BlogGenius consumer must validate token names, value syntax/type and length, and reject rule/declaration/import injection and external resource URLs before applying values. The bundled application default remains available as the offline/error fallback.

The user further agreed that both fields are mandatory for both package types. The contract declaration shape is `compatibility: { min_bloggenius_version, contract: { id, version } }`; the original Site Hosting package contract was `bloggenius-site-hosting-template@0.1.0` and has since advanced through `@0.2.0`, `@0.3.0`, `@0.4.0`, and `@0.5.0` for post frontmatter and publication metadata changes. UI Styles use `bloggenius-ui-style-tokens@1.0`. A newer minimum or unsupported valid contract makes a package unavailable for selection; a missing/malformed declaration fails manifest validation. BlogGenius `0.6.0-devN` and `0.6.0-rcN` builds are treated as the `0.6.0` line for minimum-version checks so they can validate the upcoming stable release's resources. The app and lockfile now identify this branch as `0.6.0-dev1`.

Proposed Amade structure:

```text
amade/
  catalog/index.json
  spec/
    common-metadata-v0.1.schema.json
    catalog-index-v0.1.schema.json
    site-hosting-family-v0.1.schema.json
    site-hosting-template-v0.1.schema.json
    bloggenius-ui-style-v0.1.schema.json
  families/<family-id>/family.json + site-data seed
  templates/<template-id>/template.json + astro/ + preview media
  styles/<style-id>/style.json + preview media
```

Implementation order: finalize and document the composed schemas and unified catalog; reorganize Amade and add representative Style packages sourced from the current registry; verify all Site Hosting packages and Style packages; then connect BlogGenius Appearance to active Amade Styles with validation, caching, fallback, and incompatible-contract handling. Do not run UI/browser smoke or launch the app; the user performs those checks on request.

## Problem to solve

BlogGenius should create and build a site from a selected Template and publish Markdown posts according to that Template's declared contract. The user has not approved cross-template switching or data preservation; Family membership alone must not be used to infer either.

Astro provides useful implementation mechanisms: layouts and components for shared presentation; content collections and loaders for structured content; and file-based/static route generation. Astro Themes is a catalog of Astro starters/themes with discovery filters, not a portable contract for preserving one site's content while swapping its presentation. Amade must define that contract itself.

## Current terminology (decision updated 2026-10-09)

### Template Family (템플릿 계열)

A Template Family groups related templates for catalog discovery and use-case organization. It does not define a shared data/content contract, and Family membership does not promise template interchangeability.

### Template (템플릿)

A Template is one selectable, runnable Astro project. Each Template owns or declares the data it expects, the routes it generates, and how it renders content. Templates in one Family may have different inputs, schemas, routes, or behaviors.

### Template update and switching boundary

There is no cross-template switching or data-preservation promise in the current product contract. A template update means updating the currently selected template under its own declared update contract; it does not mean switching a Site to another Template. Do not use Family membership as evidence that another Template can read the same Site data. Categories, tags, and Family membership are discovery/grouping metadata. Template lifecycle status controls availability for new Site creation without deleting package history or invalidating already materialized Sites.

## Package mental model

An Amade package has three logically distinct parts, whether or not its archive layout physically separates them:

1. **Site data:** durable identity, navigation, content, and media for one Site instance.
2. **Template implementation:** Astro layouts, components, styles, pages, and renderers that consume the data declared by that Template.
3. **Build requirements:** Astro/dependency expectations and the BlogGenius capabilities required to instantiate and build the template.

The archive may be a runnable Astro starter. Its structure separates Site data from the selected Template source; this separation supports updating the selected Template but does not itself enable switching to another Template. The proof uses this generated Site boundary:

```text
<site>/
  site-data/       # Site profile, Markdown, and media
  template/astro/  # replaceable Astro presentation project
```

Astro's content loader reads Markdown from `site-data/data/`; `publicDir` copies family-owned public media such as the logo from `site-data/public/`. Template source does not contain an Amade-repository-specific path.

## Catalog discovery index

Amade 0.1's `catalog.json` groups ordered template references under each family. A family record contains `family_id`, its `family.json` path, and an ordered `templates` array of `template_id`/`template.json` references. The catalog index owns membership and display order; display names, descriptions, content rules, and other details remain canonical in the referenced manifests instead of being copied into the index.

BlogGenius and a future Template Builder read the index, then resolve family/template manifests at the same immutable Amade revision. References must be repository-relative and confined to the corresponding `families/` or `templates/` directory. This exposes family grouping and lets a builder enumerate the available contracts and templates without guessing from folder names. The verifier checks duplicate IDs, missing/orphan entries, path confinement, and that each referenced manifest agrees with its catalog IDs and family. The 0.1 index is still experimental; a formal JSON Schema and generated-index workflow are follow-up work.

## Example families and templates

The user approved using presentation differences to name the template examples. Names such as “basic” or “portfolio” sounded like different content/function packages rather than different ways to present shared content. These are now the working examples for the first validation set; exact visual details can be refined while implementing.

| Template Family | Shared family data (initial proposal) | Template A | Template B | Conversion |
|---|---|---|---|---|
| 개인 홈페이지 | 프로필, 메뉴, 페이지, 글, 작업물, 이미지 | 상단 메뉴 · 글 목록형 | 상단 메뉴 · 카드 그리드형 | A ↔ B |
| 회사 홈페이지 | 회사 정보, 메뉴, 페이지, 서비스, 소식/글, 이미지 | 상단 메뉴 · 서비스 카드형 | 좌측 메뉴 · 서비스 목록형 | A ↔ B |

The Family name describes a catalog/use-case grouping; template names describe individual offerings. Digital Garden may be grouped separately for discovery, but that grouping does not assert compatibility.

### Initial family data contracts (historical draft; schema alignment pending)

The following dataset describes the initial experimental family data model in the current Amade 0.1 implementation. It was designed as a shared sibling-template contract under the earlier proposal; that compatibility interpretation was superseded on 2026-10-09. Treat these schemas and fixtures as current implementation facts, not proof that arbitrary Templates in a Family are interchangeable. A later schema decision must clarify which requirements belong to each Template versus reusable data models.

**Shared site envelope for both families**

- Site identity: required non-empty name; optional logo stored in public media.
- Navigation: required ordered items with stable unique IDs, editable non-empty labels, and root-relative internal paths. External, protocol-relative, query/fragment, backslash, and dot-segment paths are outside the 0.1 contract. Nested paths are allowed syntactically but need generation/collision tests.
- Pages: `pages/<id>.md`, with lowercase ASCII kebab-case filename stem as stable page ID; required title/path and optional `is_public` defaulting to false.
- Posts: `posts/<slug>/index.md`; the lowercase ASCII kebab-case directory slug is the stable ID. Under current contract 0.7.1, all frontmatter fields are optional; missing `kind` is inferred from path, missing `publication` defaults to `none`, and unknown properties are preserved without interpretation. Optional fields include `title`, `description`, `author`, `cover`, `cover_alt`, `date`, `published_at`, `editorial_status` (`draft`/`complete`, default `draft`), and `publication` (`none`/`private`/`public`, default `none`). Editorial status is independent from deployment behavior.
- Media: entry images live in the sibling `images/` directory and Markdown references are relative to the entry. Site logos live in the site's public directory.
- Route semantics: content identity and canonical public paths are family data; templates may change layout but not silently remap them. Paths are root-relative internal paths, including nested paths; Unicode URL output and route collisions remain to be verified.

The family manifests record these content rules. Astro/Zod schemas validate site configuration and known frontmatter values while allowing unknown frontmatter properties to pass through. The `content_contract_version` is separate from Amade `spec_version`. Family profiles add required display fields (`headline`/`biography` or `tagline`/`about`).

**Personal homepage family data**

- Profile: display name, headline, biography, optional profile image.
- Work items: stable ID/slug, title, summary/body, optional cover image, order, and optional featured flag.
- Pages and posts as in the shared envelope.
- Both templates render work items and posts. The grid template may emphasize work cards; the list template may emphasize chronological writing, but neither may discard or strand the other content type.

**Company homepage family data**

- Company profile: display name, tagline, about text, optional logo and cover image.
- Services: stable ID/slug, title, summary/body, optional image, and order.
- Pages and news/posts as in the shared envelope.
- Both templates render services and news. The service-card template may emphasize service cards; the left-navigation template may emphasize structured service details, but neither may discard or strand the other content type.

**Candidate canonical routes for the first proof**

- Home: `/`
- User pages: stable internal paths supplied by site data.
- Personal work listing/detail: `/work/` and `/work/{slug}/`.
- Company service listing/detail: `/services/` and `/services/{slug}/`.
- Posts/news listing/detail: `/blog/` and `/blog/{slug}/`.

The proof verifies these initial route conventions: `/`, editable authored internal pages including nested `/about/team/`, `/blog/` and `/blog/{slug}/`, and the family-specific `/work/` or `/services/` listing/detail routes. Navigation IDs are stable identities; where an ID matches `data/pages/<id>.md`, changing that menu route updates the matching page's `path` frontmatter. User-added internal routes receive empty Markdown page sources whose IDs are deterministic hashes of their normalized path, so nested and Unicode paths do not collapse to the same filename. External menu destinations remain syntax-validated and do not generate pages. Repeated user destinations are allowed and shown as a non-blocking notice; automatic placeholder generation deduplicates repeated paths and never silently ignores a source-file collision.

### Proof result (2026-10-03)

The Amade experiment includes two same-data comparisons:

- Personal Homepage: `personal-post-list` and `personal-card-grid`.
- Company Homepage: `company-service-cards` and `company-service-list`.

The repeatable `scripts/build_and_verify.py` test historically materialized each Site under a temporary root with one `site-data/` sibling and replaced `template/astro/` A→B→A for the exact proof packages. All six builds used Astro 7.3.5 and passed after adding strict frontmatter schemas and `site.json` validation. Each output contains its public post and family-item listing/detail routes and the nested authored `/about/team/` page. `is_public: false` fixtures are absent from emitted HTML/routes. The family logo is copied to the generated site root; entry-relative Markdown SVG images resolve to generated `/_astro/` assets. Every template renders the same editable navigation labels and paths from `site-data/site.json`. For both proof pairs, SHA-256 hashes of the fixture data/media files were identical before and after A→B→A; this demonstrates only those fixed experimental packages and does not establish a supported switching feature. Content IDs are lowercase ASCII letters/digits joined by single hyphens; loaders reject mismatched paths and frontmatter kinds. Template discovery `categories` and `tags` live on the template manifest, not article frontmatter, and do not establish family compatibility.

This validates the folder boundary and static build behavior; it is not yet a BlogGenius conversion feature or UI test. It does not yet validate user-edited Astro source replacement, every optional field, Unicode route output, route-conflict handling, build-failure recovery in BlogGenius, or production bundle/catalog integration.

### Reusing evidence from legacy 1.x

The previous `1.x` package format is legacy, but its tested publishing behavior is useful input rather than a normative dependency:

- Markdown post bundles use one directory per slug, an `index.md` entry, and a sibling `images/` folder with entry-relative references.
- The legacy 1.x post convention used `title`, `description`, and `pubDate`; `is_public` controlled public output. It is historical input only and is superseded by the current family content contract 0.7.1.
- A listing route and a detail route are declared and verified by building Astro output.
- Template packages include a complete Astro project, immutable package file hashes, preview media, and author/license metadata.

The new family model must independently re-specify whichever of these behaviors is retained; no `1.x` schema or resource is implicitly compatible.

## Historical conversion-conformance proposal (superseded 2026-10-09)

The following rules describe the initial proposal only; they are not current requirements and must not be implemented as a Family compatibility promise. The current decision is that Family is grouping metadata and Templates may be incompatible. If a future product decision introduces Template switching, define a separate migration contract and approval flow first.

- The initial proposal treated Family as the owner of all durable fields and content types.
- It proposed the same conformance fixture and routes for every Template in a Family.
- It proposed blocking Template membership unless each Template passed those common checks.
- These rules were superseded; current Templates may define distinct inputs, schemas, routes, and behaviors.

## Candidate contract areas

### A. Resource identity and metadata

Agreed common template metadata:

- Required: stable resource ID and kind (`site-hosting`), name, description, author, template package version, license, `categories`, `tags`, representative `preview`, and lifecycle `status`.
- Optional: additional `screenshots`, `homepage`, and `support`.
- `spec_version` remains separate from the template package `version`; creation/update timestamps are not part of the agreed field set.

### B. Discovery taxonomy

Keep discovery labels distinct from technical capabilities:

- **Categories:** controlled, multi-select purpose categories, such as Blog, Docs, Portfolio, Landing Page, Business, and E-commerce.
- **Tags:** optional controlled descriptive labels, such as Minimal, Editorial, Dark, or Multi-page.
- **Capabilities:** stable machine-readable declarations such as Markdown blog collection, custom pages, configurable navigation, or logo customization.

Do not infer a capability from a category or tag. Start with a small controlled taxonomy; add terms only when real resources need them. The Astro Themes categories are useful discovery precedent, but their labels mix purpose and style, so Amade should keep those dimensions explicit.

### C. Durable site data (family-owned)

The data contract should cover:

- site title and optional logo/brand assets
- navigation item labels and internal destinations
- user-managed pages and their stable identity/content
- posts and associated images
- whether a post is public
- stable content IDs/slugs and public URL generation

Templates may choose how to render the values they support. The current experimental family manifests define shared seed/content data, but this does not create a cross-template switching guarantee. Template-specific requirements and reusable data models need to be made explicit in a future schema update.

### D. Publishing content contract

The spec should tell BlogGenius, other writing tools, and human editors how to create content that the template will display:

- Markdown body format
- required and optional frontmatter fields with types and semantics
- post identity/slug and publication visibility rules
- where images are stored and how Markdown references them
- post collection location, listing route, detail route, and URL policy
- filtering behavior for private/unpublished posts

Use Astro Content Collections as an implementation option for schema validation and build-time querying, not as Amade's only allowed storage API. The contract should describe observable file/content behavior so other tools can implement it.

### E. Template presentation and customization boundary

Declare which input/data models a Template consumes and which simple values BlogGenius can safely customize (for example title, logo, and navigation). Keep arbitrary layout/source editing outside manifest-driven customization. Updating a selected Template follows that Template's update contract; changing to a different Template has no preservation guarantee.

Do not promise that arbitrary user-authored Astro components or routes can be mapped into every presentation. Detect or explain conflicts before applying a switch; never overwrite user data silently.

### F. Compatibility and versions

Keep these version axes separate:

- **Specification version:** shape and semantics of the Amade contract; begin experimental work at `0.1.0`, then stabilize at `1.0.0` after validation.
- **Template release version:** creator's version of one template package.
- **BlogGenius compatibility:** every selectable Template and UI Style requires a minimum app version and a type-specific contract ID/version. Current packages require BlogGenius `0.6.0`; a resource is selectable only when both checks pass. The app release version and contract version are separate axes.
- **Astro compatibility:** tested/supported Astro range and package/runtime expectations.
- **Content contract version:** separate from the Amade manifest `spec_version` when family data/frontmatter semantics evolve independently. The current post contract demonstrates the need: both families declare `content_contract_version: 0.5.0` while the Amade manifest shape remains `0.1.0`.

The legacy `1.x` resources must not be treated as compatible just because their package version is numerically greater than the new spec's `0.x` version.

### G. Package integrity and execution

An Astro template contains executable build scripts and dependencies. The future spec and catalog process need an explicit trust boundary:

- pin an immutable catalog revision/package version;
- verify package integrity before materialization;
- show author/license and source provenance;
- define curation/review expectations before community uploads;
- constrain or clearly disclose dependency/build behavior where feasible.

The current curated Amade repository can be the initial trust boundary; public upload and marketplace workflows remain out of scope for this design stage.

## Legacy handling

- Existing template resources remain readable as legacy references and continue to identify the source of already-created sites.
- Existing sites should keep building from their copied source without requiring conversion merely because a new spec is introduced.
- New-spec creation should not silently select or reinterpret a legacy package.
- No automatic legacy-to-0.1.0 conversion is planned. Recreating or manually adapting a template is an explicit later operation.
- Existing 1.x templates remain legacy and are excluded from the isolated 0.1 experimental catalog. The 0.1 lifecycle states apply only to manifests conforming to the new format.

## Validation plan before 1.0.0

1. Align manifest/schema ownership with the 2026-10-09 decision that Family is grouping only and Templates may declare different data requirements.
2. Verify each Template against its declared inputs, content types, images, visibility rules, routes, and build output.
3. Record the existing A → B → A result as historical fixture evidence only; extend independent per-Template checks with optional-field and route-collision cases.
4. Add optional and edge-case fixture data and verify each Template against its own declared requirements; do not interpret this as cross-template conversion coverage.
5. For selected-Template updates, verify the established update warning/recovery behavior for user-edited Astro source; cross-template switching is out of scope.
6. Verify malformed manifests, unsupported required capabilities, incompatible Astro versions, integrity failures, and failed builds fail with actionable messages while preserving Site data for the selected Template update flow.
7. Document decisions and unresolved limits, then review whether the contract is stable enough for `1.0.0`.

## Work completed in this stage

- Added an isolated 0.1.0 experiment in Amade with two family contracts, four complete Astro projects, Markdown/media fixtures, and a draft-only catalog. Existing 1.x files and the active catalog remain unchanged.
- Added repeatable build and conformance checks. All four templates built from the actual `<site>/site-data` plus `<site>/template/astro` layout; A→B→A verified unchanged data hashes and a nested authored route.
- Added required/optional/default field declarations to family manifests and strict, family-specific Astro/Zod validation for `site.json` and Markdown frontmatter. Builds verify accepted fixtures across every template.
- Covered profile and logo, editable navigation labels and paths, authored pages, posts, family-specific work/services, public/private filtering, canonical list/detail routes, entry-relative images, and separate template discovery categories/tags.
- Added required minimum-app and type-specific contract compatibility checks to both BlogGenius 0.1 template discovery/materialization and the Amade Style consumer. Current Amade resources require BlogGenius `0.6.0`; `0.6.0-devN` and `0.6.0-rcN` builds can test those resources. BlogGenius package and lockfile versions are `0.6.0-dev1`.
- Remaining work: run formal JSON Schema validation with a Draft 2020-12 validator, negative schema cases, route conflicts and Unicode URL output, optional-field cases, user-edited Astro source handling, failure recovery, and live catalog/UI acceptance.

## Open design questions

1. Where should Site data live so Astro loaders can consume it while selected Template source remains replaceable?
2. What is the smallest useful complete data model for each initial family? Which site purposes deserve distinct families rather than optional types within one family?
3. Are user-created pages structured Markdown documents, simple generated placeholders, or both?
4. Which route rules belong to the shared Site Hosting integration contract versus each Template's own content contract?
5. Which controlled category and tag vocabulary best helps users discover families/templates?
6. Cross-template switching is out of scope unless separately approved. If proposed later, how should BlogGenius detect user-authored Astro source edits and define migration/recovery behavior?
7. What minimum quality/security review is required before a community-authored package can be listed?

## References

- [Astro Themes](https://astro.build/themes/) — catalog discovery, category, technology, and pricing filters.
- [Astro project structure](https://docs.astro.build/en/basics/project-structure/) — Astro source, pages, content, assets, and layout conventions.
- [Astro layouts](https://docs.astro.build/en/basics/layouts/) — shared page presentation.
- [Astro content collections](https://docs.astro.build/en/guides/content-collections/) — structured content, loaders, schemas, querying, and rendering.
- [Current Amade catalog ADR (legacy for next-generation spec)](../../decisions/2026-10-03-amade-template-kinds-and-catalog.md)
- [Template switching future direction](../../decisions/2026-10-03-amade-template-switching-direction.md)

## 2026-10-04 — Confirm content identity and internal paths

- User confirmed content IDs use lowercase English letters, digits, and hyphens; authored public paths are internal paths. Human-facing labels and titles remain Unicode.
- All four experimental Astro loaders now read `site-data/data/`, enforce lowercase ASCII kebab-case file IDs, and reject a file path whose shape or frontmatter `kind` does not match the family.
- Corrected fixtures to match the declared `site-data/data/pages/` layout and verified nested `/about/team/` output across all templates.
- Re-ran all six Astro 7.3.5 builds and four output verifiers. Both families retained identical hashes for their nine data/media fixture files through A→B→A.
- Isolated negative builds reject unknown frontmatter fields, non-canonical IDs, and mismatched path/kind. Still open: make those repeatable fixtures, malformed `site.json` cases, route collisions/reserved paths, Unicode route output, optional-field/media limits, formal manifest schemas, failure recovery, and BlogGenius materialization. UI smoke was not run.

## 2026-10-04 — Grouped catalog index

- Replaced the flat experimental template list with ordered `families[]` entries. Each family references its canonical `family.json` and lists its templates by ID and `template.json` path.
- Kept names, descriptions, and contract details in their canonical manifests to avoid duplicate metadata. Consumers resolve all references against one pinned Amade revision.
- Extended the conformance verifier to validate catalog uniqueness, completeness, repository-confined manifest paths, family/template manifest IDs, and family membership.
- BlogGenius's grouped picker and a future Builder can enumerate family and template choices from the same index. Formal JSON Schema and index generation remain open.

## 2026-10-04 — Common metadata and template lifecycle

- User agreed that every selectable package exposes `name`, `description`, `author`, package `version`, `license`, `created_at`, `categories`, `tags`, and a representative `preview`; `screenshots`, `homepage`, and `support` are optional.
- User agreed to define lifecycle states `active`, `deprecated`, and `withdrawn` now, while using only the needed state initially. New-Site selection offers only `active`; `deprecated` remains usable by already materialized Sites; `withdrawn` is not served for new downloads, while existing local copies may continue to build.
- Amade's four proof templates now carry the agreed metadata and representative preview images. All are `active`; one includes an additional screenshot. The repeatable manifest verifier checks required fields, status values, discovery arrays, and package-relative image references. BlogGenius consumption of these states remains a later integration step.
- Existing 1.x resources remain untouched legacy material and are not mixed into the isolated experimental 0.1 catalog.

## 2026-10-04 — Post frontmatter contract 0.4.0

- Recorded `date` as optional date-only `YYYY-MM-DD`; removed required `pubDate` from the current family post contract.
- Separated editorial completeness (`editorial_status: draft | complete`) from deployment/listing (`publication: none | private | public`). All pairs are valid. `none` stays in local Site data and produces no Worker output; `private` produces an unlisted, directly accessible page; `public` is built and listed.
- BlogGenius Site Hosting temporary save writes `draft + none` locally; immediate post writes `complete + public` before full build/deploy; scheduled posting remains unsupported. Delivery result remains in the BlogGenius publishing record. The template field contract is unchanged; this is the BlogGenius action mapping.
- Bumped template package and BlogGenius Site Hosting contract versions to `0.4.0`; Amade manifest shape remains `spec_version: 0.1.0`. BlogGenius consumer support and conformance verification remain follow-up work.

## 2026-10-04 — Shared Amade catalog and BlogGenius Style packages

- Added the `styles[]` resource group alongside family-grouped Site Hosting templates. Common package metadata is composed into separate type-specific schemas; family manifests remain data contracts, not selectable packages.
- Added 10 Amade UI Style packages from the current BlogGenius semantic token values. Each uses the 98-token `bloggenius-style-tokens-1.0` contract, package metadata, an SVG representative preview, and active lifecycle state.
- BlogGenius now has a local API catalog reader that pins Amade catalog and manifest reads to one commit, filters by active lifecycle, validates token names/values, and caches verified data. The Appearance screen registers remote Styles and applies their token values; built-in CSS remains offline and validation fallback.
- Amade `dev` now publishes ten Styles, and a temporary `remote-test-style` was added to verify the live integration. The user confirmed the remote-only style appears in BlogGenius Appearance. Focused compatibility/template/style/API tests pass (17 tests before RC support; 14 directly related tests after RC support), as do package version-contract checks and `git diff --check`. Formal schema validation with Draft 2020-12 remains pending. UI smoke was not run, per user preference.


## 2026-10-05 — Publication ordering and SEO metadata contract 0.5.0

- Added optional `published_at` to both families' post contract. BlogGenius immediate publication writes the current UTC instant; temporary saves omit it.
- All four Astro templates sort public posts descending by `published_at`, then `date`, then path-derived stable content ID ascending for equal/missing dates. Astro derives that ID from the validated post folder slug; no frontmatter ID field is required.
- Post pages use `<post title> | <site displayName>`, expose description/Open Graph/canonical and article publication-time metadata, use the first Markdown image as `og:image`, and mark unlisted private pages `noindex`.
- The four package versions are now 0.4.2 and the Site Hosting contract is 0.5.0. BlogGenius exact compatibility accepts 0.5.0. Existing Sites retain copied template snapshots and are not upgraded in place.

## 2026-10-05 — Optional, extensible frontmatter contract 0.7.0

- User decision: no frontmatter field is universally required. The validated file path supplies content kind and stable ID; an optional `kind` must agree with it. Entirely absent frontmatter is valid.
- Astro templates accept unknown keys without interpreting them. Known optional values remain validated; invalid optional `date` or `published_at` values are ignored. `publication` defaults to `none`, `editorial_status` to `draft`, and non-post visibility to false.
- Missing display titles fall back to the first Markdown H1 and then the path-derived slug; missing descriptions are omitted. Optional `author` is emitted as author metadata only when explicitly present.
- At this milestone, both family manifests and all four templates used contract `0.7.0` and package version `0.4.3`; BlogGenius accepted exactly `0.7.0`. The following 0.7.1 milestone supersedes that version.
- Build and deployment verification was pending at this milestone and was completed with the 0.7.1 follow-up below.


## 2026-10-05 — Representative image contract 0.7.1

- Added optional post fields `cover` (entry-relative image path) and `cover_alt` (optional alternative text). BlogGenius chooses the first image block and records these fields when it saves or publishes a Site Hosting post.
- The four Astro templates consume `cover` for optimized blog-list thumbnails and Open Graph image metadata; they do not modify Markdown frontmatter. Missing covers omit these image outputs.
- Family manifests use content contract `0.7.1`; all four packages advance to `0.4.4`. BlogGenius requires exactly contract `0.7.1`.
- Focused BlogGenius tests (21/21) and the four-template Amade build/artifact verifier pass. The user confirmed that the image appears on the deployed Worker. Existing materialized Sites keep their copied template snapshot until recreated or upgraded.
