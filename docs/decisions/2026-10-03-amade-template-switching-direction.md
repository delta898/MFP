# Amade Template Switching: Future Direction

## Status

Agreed terminology and compatibility direction; detailed data schema and conversion behavior remain open. No template-switching behavior or data migration is implemented by this decision.

## Context

A Site owner may want to change from one Site Hosting template to another while retaining the site's identity and content. The intended user experience is to preserve the site name, logo, navigation, pages, posts, and images while changing how the site is presented.

Astro provides building blocks for this architecture: reusable layouts and components, Markdown content, and static route generation. Astro does not define a built-in workflow or interchange contract that can replace one project's template while preserving and remapping its user data. The preservation boundary must be designed by Amade and its consumers.

## Data/render boundary

The user agreed on two terms:

- **Template Family (템플릿 계열):** a coherent site-purpose group that defines the shared site-data contract and the conversion boundary.
- **Template (템플릿):** one selectable Astro project belonging to a family.

All templates published in the same family promise conversion to every other template in that family, preserving all family-contract data. A family ID is therefore a compatibility guarantee, not only a catalog grouping. Categories and tags are for discovery and do not imply compatibility. Distinct data needs (for example, a personal profile versus linked garden notes) belong in separate families unless the complete data model is shared and supported by every sibling template.

The detailed package schema, data location, and source-edit conflict workflow are not decided yet.

## Proposed direction

Treat site-owned data and template-owned presentation as separate concerns:

- **Site data:** identity and branding (name and logo), navigation labels and paths, page content, posts, and media.
- **Template presentation:** layouts, components, styling, and rendering behavior that consume the site's data.
- **Shared content contract:** page/post types, frontmatter fields, media references, listing/detail routes, and route-generation rules that compatible templates agree to consume.

Switching between templates in the same family selects a different presentation implementation and rebuilds the site while retaining the site's family data. Every family template must pass the same conformance fixture; otherwise it cannot be published into that family. Template metadata should eventually identify the family and the specification/data contract needed to validate the conversion.

## Constraints and tradeoffs

- The current Site Hosting templates are complete Astro starter projects copied into the Site directory. They are not isolated visual themes. Replacing that directory wholesale would risk deleting user content and edits.
- Automatic preservation can only be promised for data that follows the shared contract. Arbitrary custom Astro pages, components, routes, or source edits may not have an equivalent in another template.
- Keeping public paths stable is preferable. If a target template changes routes, a future switch workflow needs explicit route compatibility checks and possibly redirects; it must not silently strand existing links.
- Greater freedom to edit the Astro project reduces the guarantees BlogGenius can make about safe automatic template switching. The user must retain control over whether to replace custom source when a conflict is found.
- The current manifest's customization and publishing declarations are useful foundations, but they do not yet establish a complete separation between durable site data and replaceable presentation.

## Decision and follow-up

Do not implement template switching in the current Site creation and management work. Preserve this as a design constraint for the new Amade specification: avoid making durable family data inseparable from one template's source layout, and prove the shared data/rendering boundary before promising same-family conversion.

Before implementing switching, design and validate:

1. The canonical location and ownership of family data: identity, navigation, pages, posts, structured family-specific entries, and media.
2. The complete common data/frontmatter and asset-reference contract for each family.
3. Route compatibility and behavior when a target template lacks a family page type or uses a different route.
4. How to handle user edits to template-owned source files and how to preview/revert a same-family switch safely.
5. A small Astro proof of concept with two templates in one family that preserves all family data and generated public URLs across A → B → A.

This document records agreed terminology and a future compatibility promise, not a finalized Amade schema or a guarantee that every Astro project can switch templates. The full design draft is in [Amade Site Hosting Template Specification 0.1.0](../plans/active/2026-10-03-amade-template-spec-v0.1-design.md).
