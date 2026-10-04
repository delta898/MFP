# Amade Template kinds and external catalog

- Status: Legacy specification for existing 1.x resources; retained as historical reference
- Date: 2026-10-03

> **Legacy scope:** This decision records the original Amade resource v1 integration only. The existing development v1 catalog/BlogGenius reader remain in use for current packages; Amade main is README-only, but new Site Hosting work follows the separate 0.1.0 Template Family draft. Do not use v1 schemas or this ADR as the 0.1 contract. See the [BlogGenius 0.1 design record](../plans/active/2026-10-03-amade-template-spec-v0.1-design.md) and [Amade spec-generation index](/Users/delta898/Project/Amade/amade/spec/README.md).

## Historical v1 decision (2026-10-03)

Amade is the external source of versioned resources consumed by BlogGenius. It uses a shared catalog envelope and distinct type-specific specifications for:

- `site-hosting`: a complete Astro project with a preview image, bounded template-declared customization, and an explicit future article content/route contract.
- `bloggenius-style`: data-only values mapped to BlogGenius's existing semantic-token contract used by `설정 > 앱 > 외모`.

For the first delivery, implement one Site Hosting template and connect BlogGenius to its public GitHub catalog. Keep BlogGenius's existing built-in appearance styles in place; external Style retrieval/application is a follow-up. Public creator uploads, marketplace, ratings, and moderation are also follow-up work. Initial resources are curated through Amade repository changes.

BlogGenius retrieves the catalog over HTTPS, downloads a selected package by immutable Git commit, verifies every file against its SHA-256 manifest, caches it locally, and records the selected template ID, version, and source revision in the Site. A Site's copied Astro source remains independent of later catalog updates.

Amade uses `dev` as the development catalog and `main` as the production catalog. BlogGenius local/development runtime reads Amade `dev`; production runtime reads Amade `main`. A catalog override remains available for controlled verification.

Common resource metadata includes the stable package version and license plus creator attribution (`author`), optional homepage/support links, and an optional stable `created_at` date. The current user-facing template list is BlogGenius's Site creation picker: show name, author, description, preview, and a homepage icon link when declared. Amade currently hosts the catalog and packages, not a separate browsing UI; any later Amade list page can reuse this metadata.

## Rationale

One Amade ecosystem gives both resource kinds a shared discovery and contribution path. Separate kinds keep Astro project packages distinct from application-level appearance tokens and allow each to evolve under its own validation rules. A typed resource contract gives future community contributions a reviewable boundary without requiring an upload service in the first stage.

The Site Hosting template declares BlogGenius-facing customization and article conventions but remains an ordinary Astro project. BlogGenius can apply the supported values and later write posts at the declared location without becoming a general-purpose site editor.

The Site Hosting manifest's publishing contract covers the template's file format/layout, typed frontmatter, visibility behavior, and listing/detail routes. It does not choose which navigation item BlogGenius should treat as the post-list menu. That binding is Site-specific user configuration and must be stored separately. BlogGenius's article writer is deferred; it must consume the selected Site's pinned manifest contract rather than hardcode template paths.

## Consequences

- Amade owns resource schemas, manifests, preview media, and immutable package files.
- BlogGenius owns retrieval, integrity checks, local cache, Site creation, and its current appearance settings.
- Catalog/package changes can be published independently of BlogGenius releases; changes to BlogGenius's supported schema versions still require app support.
- Template changes should be validated through the Amade `dev` catalog before the approved production catalog update reaches `main`. BlogGenius production must never resolve development-only template entries.
- A template source revision is immutable. Updating an existing Site's template or preserving the user's edits during template upgrade is outside the initial contract.
- External Style application and the creator contribution product are intentionally not included yet.
- Site creation should stay a modal when its content can fit a wider, vertically scrollable dialog. Template choice uses a three-column preview grid; site name and optional logo are editable there, while menu labels are editable only when declared by the selected template.
- Template-supported added pages are internal placeholder pages generated from the menu name. Arbitrary external links and paths are excluded. The publishing content directory and article route remain separate from navigation and custom-page routes.
- Historical v1/1.x publishing used Markdown bundles and `is_public`. The current experimental family contract supersedes that post rule with `date`, `editorial_status`, and `publication`; see [Site Hosting post frontmatter contract](2026-10-04-site-hosting-post-frontmatter-contract.md). BlogGenius must consume the selected Amade family manifest and its pinned contract version.
- During Site creation, users choose one declared navigation item as the post-list entry point when the selected manifest declares a valid listing route. BlogGenius sets that item's destination to the manifest route and persists the menu index and route in Site-specific metadata; the selected menu is not inferred later from its visible label.

## References

- [Active Amade catalog implementation plan](../plans/active/2026-10-03-amade-template-catalog-and-site-template-development.md)
- [BlogGenius semantic token/style contract](../architecture/design-style-system.md)
