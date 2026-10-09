# Amade Template Switching: Future Direction

## Status

**Superseded on 2026-10-09.** The earlier proposal below treated Template Family as a compatibility boundary. The user later clarified that Family is catalog/use-case grouping only; templates in one Family do not need to be interchangeable, and Amade/BlogGenius make no cross-template data-preservation promise. Template switching is outside the current product contract. This file is retained as the history of the original proposal; the 2026-10-09 decision at the end is current.

## Context

A Site owner may want to change from one Site Hosting template to another while retaining the site's identity and content. The intended user experience is to preserve the site name, logo, navigation, pages, posts, and images while changing how the site is presented.

Astro provides building blocks for this architecture: reusable layouts and components, Markdown content, and static route generation. Astro does not define a built-in workflow or interchange contract that can replace one project's template while preserving and remapping its user data. The preservation boundary must be designed by Amade and its consumers.

## Data/render boundary

The initial proposal recorded two terms:

- **Template Family (템플릿 계열):** a catalog grouping and use-case label. Membership does not define a shared data contract or compatibility.
- **Template (템플릿):** one independently selectable Astro project with its own inputs, data assumptions, routes, and rendering behavior.

The 2026-10-09 clarification supersedes the original compatibility proposal: templates may be grouped together without being interchangeable. Categories and tags remain discovery metadata. Do not infer that a template can consume another template’s data from matching Family IDs.

The detailed package schema, data location, and source-edit conflict workflow are not decided yet.

## Proposed direction

Treat site-owned data and template-owned presentation as separate concerns:

- **Site data:** identity and branding (name and logo), navigation labels and paths, page content, posts, and media.
- **Template presentation:** layouts, components, styling, and rendering behavior that consume the site's data.
- **Shared content contract:** page/post types, frontmatter fields, media references, listing/detail routes, and route-generation rules that compatible templates agree to consume.

The initial proposal considered switching between templates in the same family while retaining shared data. That proposal was superseded on 2026-10-09. A Family groups templates for discovery/use-case organization; each Template owns its own data and rendering requirements. A template update and a switch to a different template are separate operations: the current update contract concerns updating the selected template and does not imply cross-template conversion.

## Constraints and tradeoffs

- The current Site Hosting templates are complete Astro starter projects copied into the Site directory. They are not isolated visual themes. Replacing that directory wholesale would risk deleting user content and edits.
- Automatic preservation can only be promised for data that follows the shared contract. Arbitrary custom Astro pages, components, routes, or source edits may not have an equivalent in another template.
- Keeping public paths stable is preferable. If a target template changes routes, a future switch workflow needs explicit route compatibility checks and possibly redirects; it must not silently strand existing links.
- Greater freedom to edit the Astro project reduces the guarantees BlogGenius can make about safe automatic template switching. The user must retain control over whether to replace custom source when a conflict is found.
- The current manifest's customization and publishing declarations are useful foundations, but they do not yet establish a complete separation between durable site data and replaceable presentation.

## Current decision (2026-10-09)

Template Family is a catalog/use-case grouping only. It is not a compatibility boundary. Templates in one Family need not share a schema, routes, or data behavior. There is no supported promise that users can switch between Templates while preserving data. Do not add a template-switching workflow or use same-family conversion as a release gate unless the user makes a new decision.

Updating the currently selected Template is separate and remains governed by that Template's update contract. The earlier design exploration and A→B→A proposal below are historical; any future cross-template switching proposal needs a separate product decision and explicit compatibility/migration design.

The initial proposal is retained here as historical context. See [Amade Site Hosting Template Specification 0.1.0](../plans/active/2026-10-03-amade-template-spec-v0.1-design.md) for the design record and its 2026-10-09 superseding clarification.
