# Amade shared catalog for Site Hosting and BlogGenius UI Styles

## Status

Accepted for the experimental Amade specification and the current `codex/amade-template-catalog` development branch. The decision extends the Site Hosting Template Family 0.1.0 work; it does not stabilize the contract or promote it to 1.0.0.

## Context

Amade `dev` now publishes Site Hosting Template Families and four Astro presentation templates. BlogGenius also has a mature, code-defined UI Style system under `Settings > App > Appearance`. The user intends Amade to provide both resource kinds and eventually provide a creator ecosystem.

The resources share discovery and stewardship needs, but their technical payloads have different semantics. A Site Hosting Template belongs to a family and renders durable site data. A BlogGenius UI Style supplies values for an application-owned semantic-token contract. Treating them as identical packages would weaken validation and obscure compatibility.

## Decision

Use one Amade repository and one immutable-revision-pinned catalog with explicit resource groups:

- `families[]` contains each Site Hosting family manifest and its ordered `templates[]` references.
- `styles[]` contains ordered BlogGenius UI Style manifest references.
- Family manifests define site-data/content compatibility; template manifests define a complete Astro presentation package.
- Style manifests define a complete data-only token package.

Both selectable package manifests compose the same common metadata and lifecycle contract:

- Required: `name`, `description`, `author`, package `version`, `license`, `created_at`, `categories`, `tags`, representative `preview`, `status`.
- Required compatibility: `compatibility.min_bloggenius_version` and `compatibility.contract` with a type-specific `id` and `version`. Current packages require BlogGenius `0.6.0`; Site Hosting Templates use `bloggenius-site-hosting-template@0.1.0`, UI Styles use `bloggenius-ui-style-tokens@1.0`.
- Optional: `screenshots`, `homepage`, `support`.
- Lifecycle values: `active`, `deprecated`, `withdrawn`; consumers show only `active` for new selection. Missing status is not active.
- Catalog maturity (`experimental`) remains independent of package lifecycle.
- All catalog and referenced resource reads use the same immutable Amade Git commit revision.
- BlogGenius prereleases matching `X.Y.Z-devN` or `X.Y.Z-rcN` are checked against the `X.Y.Z` release line for minimum-app gating, allowing development and release-candidate builds to test that line's packages.

Each package kind has its own schema and required technical payload. Shared metadata is composed into each schema rather than placing unrelated nullable fields into a universal manifest.

Amade Style packages are JSON data only. They reference a BlogGenius semantic-token contract and provide every token in that contract. They cannot ship JavaScript or arbitrary CSS. The consumer validates the allowlisted token names and safe values before application; `url()`, imports, declarations, rules, and similar external or executable CSS constructs are rejected. Every Template and Style also declares the minimum BlogGenius app version; consumers require both the app minimum and exact supported type-specific contract.

Amade structure:

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

Existing Amade 1.x packages remain legacy reference material. They are neither implicitly active nor automatically converted into 0.1 packages.

## BlogGenius consumption

The Appearance UI will obtain active Style metadata and previews from Amade. A selected Style's token data is cached locally and applied through the existing style system without package-provided executable code. Bundled BlogGenius styles remain a safe startup/offline fallback. Retrieval/network/contract failures must not prevent app startup or discard the last usable appearance. A successfully retrieved and valid catalog with no active compatible styles is authoritative: clear selectable remote cache and use the bundled registry, rather than resurrecting deprecated or withdrawn remote styles.

## Consequences and tradeoffs

- One repository/catalog makes both product-facing resource lists discoverable together and gives a future Template Builder and Style creator a common publishing surface.
- Explicit `families[]` and `styles[]` groups preserve type-specific relationships and validation. A future resource kind adds a catalog group and schema without changing the existing package meanings.
- There is some metadata repetition in each package manifest, but the common JSON Schema and shared validator prevent behavioral drift without hiding type-specific payloads.
- External Style loading creates offline/cache/security work that the current bundled registry does not have. Keep the bundled fallback during the first integration and validate token data as untrusted input.
- The current 0.1 specification remains experimental and may evolve in place until both resource types and the unified catalog pass validation. Only a deliberate incompatible contract change should create a new spec line.

## Implementation order

1. Update and document the experimental catalog shape and composed common/type-specific schemas in Amade. (In progress)
2. Add Style package data from all current BlogGenius Styles and validate metadata, previews, compatibility declarations, token completeness, and safe values alongside all four Site Hosting templates. (Data and static checks complete; formal schema validation still needs a Draft 2020-12 validator.)
3. Connect BlogGenius Appearance and Site Hosting Template selection to the shared Amade catalog with cache, active-status and compatibility filtering, token validation, bundled fallback, and error handling. (Implemented; focused catalog/style/API tests pass. Live catalog and user-run UI acceptance remain.)
4. Run the focused tests after implementation is complete; present the interaction for user-run UI smoke and visual acceptance. Do not launch or smoke the UI unless the user requests it.

## References

- [Amade Site Hosting 0.1 design and proof](../plans/active/2026-10-03-amade-template-spec-v0.1-design.md)
- [BlogGenius design style system](../architecture/design-style-system.md)
- Amade repository: `amade/spec/site-hosting-family-v0.1-draft.md`
