# Digital Garden Template Spec POC

## Branch and status

- Branch: `codex/digital-garden-template-poc`
- Base/parent branch: `codex/static-site-builder-main`
- Start date: 2026-10-05
- Status: Local full-vault build POC complete; no Cloudflare deployment or product implementation authorized

## User need and goal

Assess whether Amade Template Spec can support an Obsidian-vault-backed Digital Garden, using it as a proof of concept for the template system rather than committing to an immediate BlogGenius feature.

## Scope

- Prioritize whether and how Amade's Template Family/Template contract can describe a Digital Garden source, normalized content, and relationship-aware rendering needs.
- Clarify BlogGenius, independent engine, Amade, Template Builder, and Astro boundaries only enough to identify what each contract needs to express.
- Identify which capabilities are generic site/content contracts and which are specific to Obsidian or a Digital Garden presentation.
- Recommend whether the existing template contract needs extension, with a minimal proof-of-concept boundary and open questions.

## Non-goals

- Implement vault selection, synchronization, or publishing.
- Build or modify a Digital Garden template.
- Finalize the visual design or define every Obsidian plugin syntax.
- Commit, merge, push, or release.

## Initial scenario and design questions

- User chooses an Obsidian vault and then a subdirectory to use as the source root; the whole vault is not implicitly publishable.
- Notes under the selected root may contain frontmatter that determines whether each note is published.
- The source may contain nested directories, Markdown, images, PDFs, and inter-note links.
- The generated site should expose eligible notes and their relationships, including backlinks.
- Use examples of excluded notes, links, and assets as questions that may reveal missing contract vocabulary; do not decide their eventual runtime handling in this POC.
- Determine what an independent Digital Garden Engine owns versus BlogGenius orchestration, Amade contracts, Template Builder, and Astro rendering.

## User's proposed processing flow

```text
Obsidian Vault source
  -> standalone Digital Garden Engine
  -> local normalized intermediate bundle
  -> Astro build
  -> workspace site build output
  -> Cloudflare Worker Static Assets deployment
```

For the scenario under discussion, BlogGenius would let the user choose a Vault subdirectory and configure a frontmatter key/value publication selector. The independent engine would use it to identify matching Markdown and convert the selected notes to BlogGenius's canonical publication convention in an intermediate bundle, which Astro can build. This is a scenario for testing whether the template-family contract can describe the source and output needs; it is not a settled implementation, data-safety, or UI behavior specification.

## Classification model seed to validate

The user proposed this conceptual hierarchy for review:

```text
Site concept: homepage | digital garden
  -> content: page | post | note (candidate terms)
```

- `content` is the broad concept: all authored Markdown is content.
- For a homepage, `page` means static/about-like content and `post` means time/log-oriented content.
- For a Digital Garden, `page`, `post`, and `note` may be meaningful, with `note` possibly needing distinct publishing behavior.
- `homepage` and `digital garden` may be site/Family-level concepts, rather than menu items or values mixed into a content-kind enum.
- These are discussion seeds only. Validate whether the site concepts, content forms, publication behaviors, and template capabilities require separate axes, and whether one site can combine them.

## Decisions and progress

- The user requested a separate feature branch for a design discussion/POC, not immediate product implementation.
- No architectural decisions have been made yet.
- Initial read of Amade's current Site Hosting family contract: it declares content source paths, fields/frontmatter policy, media locations, and content kinds, while each selectable Template package contains the runnable Astro project. The current content kinds are limited to page/post/work/service, and there is no declared link-graph, Obsidian syntax, or backlink contract. This is an initial gap observation, not yet a recommendation to expand the schema.
- The user clarified that the publishable scope is a selected vault subdirectory plus notes selected by frontmatter policy, not the entire Vault.
- The user proposed that vault parsing/graph generation be a standalone Digital Garden Engine, separated by layers from BlogGenius itself.
- The user proposed a concrete flow: BlogGenius selects the source path and user-configured frontmatter field/value; the independent engine filters the matching Markdown, converts selected notes to the canonical `publication` format in an intermediate local bundle, and the build/deployer only sees that bundle.
- Layer hypothesis to validate, not decide: BlogGenius is the product/orchestration layer; a standalone engine is a candidate owner for Vault-specific interpretation and normalized output; Amade declares what a compatible Family/Template promises; Astro packages consume that contract; Template Builder helps authors produce compatible packages. POC work should determine which boundaries need schema vocabulary and should not implement these layers.
- The user clarified that excluded-note, referenced-resource, missing-file, and outside-root behavior should remain open for this specification POC. The POC may use such cases to identify contract gaps or diagnostic needs, but should not settle production safety semantics or implementation behavior.
- The frontmatter key/value publication selector is part of the motivating scenario. Its purpose in this POC is to test whether Amade can describe an external content source and its selection/output contract; do not design the complete user UI or runtime policy yet.
- The user suggested revisiting the overall hierarchy: the site-level concept could be `homepage` or `digital garden`, while the content-level concept could be `page`, `post`, or possibly `note`. This is a seed to test, not an accepted taxonomy.
- Contract questions exposed by the discussion: does Family identify a site concept, a content model, or reusable capabilities; should a site concept be single-valued or composable; do `page`, `post`, and `note` denote content forms or behavior profiles; can `note` reuse page/post behaviors with relationship capabilities; does the contract need link targets, reverse links, embeds, or asset references? Compare these questions to examples and the current schema before proposing a new schema shape.
- Preliminary scenario validation of the user's site/section hypothesis:
  - Personal homepage alone: the existing page/post split can describe static pages and a chronological post collection.
  - Digital Garden as the whole site: the current Family has no `note` content type or relationship/link-graph contract, so it cannot describe the distinguishing behavior yet.
  - Digital Garden under `/garden/` in a personal homepage: a Family can list multiple content types and routes, but the current contract does not declare composable sections, scoped collection behavior, or garden relationship semantics. A menu link to `/garden/` alone is insufficient to express those promises.
  - A dated project/work entry that also belongs in a chronological stream exposes the current single `kind` enum's overlap: `page|post|work|service` combines presentation/publication behavior (`page`, `post`) with subject matter (`work`, `service`). One value cannot cleanly express two independent traits.
- Provisional conclusion for discussion: `homepage` and `digital garden` should not yet be modeled as mutually exclusive site kinds. The same Garden capability may need to occupy the site root or a path-scoped section. This supports investigating composable site capabilities/sections, while keeping `Family`'s documented role (a shared content contract for selectable Templates) distinct from the user's site-level experience. It does not yet decide whether `note` is a third content type, a relationship-capable content profile, or a separate collection model.
- Validation alternatives to compare next: (a) a Garden-only Family plus a combined Homepage-and-Garden Family; (b) one Family contract that declares multiple scoped collections/sections and their capabilities; (c) a reusable Garden capability that a Template may compose with a homepage content contract. Compare these against the one-`family_id` Template binding and avoid adding concepts solely for the Obsidian import path.
- User's latest conceptual seed: a Vault is a composite content body made of notes, resources, and relationships; it does not determine where/how it is presented. A presentation role outside the Vault (site/template/section) may place it at the site root or under a menu path. The user asks to compare this with `Site -> Menu -> Contents` and receive a recommendation.
- User accepted provisional vocabulary for further validation: `Collection`, `Knowledge Collection`, and `Note`; an Obsidian Vault is one possible Knowledge Collection source; “Digital Garden” is reserved for Template Family display names/product description rather than a normative data-model term. These terms remain provisional.
- Model comparison and preliminary recommendation:
  1. **Exclusive site archetypes** (`site = homepage | digital garden`; content underneath): simple presets, but incorrectly suggests one site cannot contain both. It fails the user's root-or-subpath placement scenario unless a combined archetype is added for every composition.
  2. **Vault as a content kind alongside page/post/note**: wrong abstraction level. A Vault contains many notes, resources, and edges, while page/post/note describe individual content entries or their behavior. Treating Vault as a sibling kind mixes aggregate and atom.
  3. **Vault as source only**: useful for import/orchestration but not sufficient as Amade's output contract. Different sources (Obsidian, folder, future tools) should be able to feed the same normalized content model; the template should declare what it can consume/render, rather than require Obsidian itself.
  4. **Composite collection plus independent placement** (recommended hypothesis): a site has sections/collections placed at routes; a collection contains atomic entries plus optional resources and relationships; a template/family preset describes a useful arrangement and rendering capabilities. A Vault is one possible source for a relationship-aware collection. That collection can be mounted at `/` or `/garden/` without changing its content identity. A page/post collection can coexist beside it.
- Suggested vocabulary to test (not final schema names):
  ```text
  Site (brand, base path, navigation)
    -> Section / placement (route, menu integration, renderer)
      -> Collection (content contract and supported behaviors)
        -> Entry (page | post | note candidate)
        -> Resource (image, PDF, other file)
        -> Relationship (link/embed/derived backlink candidate)
  Source (Vault, authored folder, BlogGenius) -> Collection input
  Template Family preset -> recommended Site + Sections + Collections arrangement
  ```
- Important distinction: `Family` currently documents a shared data/content contract for Templates; it is not yet a general composition system. The present schema technically allows several `content_types` and paths in one Family, but does not declare scoped section placement or relationships, and every Template has a single `family_id`. Thus it cannot cleanly promise “this Garden collection works at root or under a menu path” or compose reusable content capabilities. This is a specification gap, not proof that one Family must equal one site archetype.
- Content taxonomy remains open. `page` and `post` currently reflect static vs chronological presentation behavior; `work` and `service` reflect subject domain. A note may also be dated and chronological, so forcing all into one exclusive `kind` is suspect. Next validation should separate entry identity/content metadata from capabilities such as chronological ordering and graph relationships, and test whether labels like page/post/note are entry subtypes, collection profiles, or just template views.
- No spec or product code has been changed. The recommendation is a model to validate against a small scenario matrix, not a final Amade contract decision.
- Technical feasibility check against current official Astro documentation: feasible for a fully static Astro build. Astro's Content Loader API can load local Markdown or custom structured data at build time; `getCollection()`/`render()` can query and render entries; static dynamic routes use `getStaticPaths()` to emit a known set of URLs at build time. Therefore an independent converter can produce a normalized local bundle for Astro to consume, and a template can emit note pages, collection indexes, and backlink views as static output. Astro does not itself interpret Obsidian wikilinks or automatically derive the product's desired graph semantics: the converter or a build-time data transform must normalize link identities/edges, and the template must render them. References checked: Astro [Content Loader API](https://docs.astro.build/en/reference/content-loader-reference/), [Content Collections](https://docs.astro.build/en/guides/content-collections/), and [Static routing](https://docs.astro.build/en/guides/routing/).
- Proposed next validation stage (not implementation approval): make a small contract-level intermediate-bundle sketch, then run a minimal isolated Astro spike against a synthetic fixture. Include (1) standalone Knowledge Collection mounted at `/`, (2) same collection mounted below `/garden/` beside a blog collection, (3) one note linking to another note and one reverse backlink, and (4) image plus PDF resource references. Verify emitted static routes, path-prefix behavior, rendered Markdown, resource URLs, and backlink derivation. The spike should establish whether one normalized collection contract supports both placements and which parts are converter versus Template responsibilities; it should not implement Vault selection UI, production publication/privacy policy, or BlogGenius integration.
- The user approved this isolated POC. Added `prototypes/digital-garden-collection-poc/` with a synthetic Vault fixture, a fixture converter, normalized local bundle shape, an Astro 7.3.5 static template, and a verification script. The converter writes stable note IDs, rewrites the fixture's Obsidian-style wikilinks into opaque identity links, emits directed relationship records, and copies assets; Astro resolves those identities using the chosen mount path and renders entry pages plus inbound backlinks. A regular Blog Collection is included only in the `/garden/` hybrid scenario.
- Focused verification passed: `npm run build:subpath`, `npm run build:root`, and `npm run verify` in the prototype. The subpath build emitted `/`, `/garden/`, two `/garden/<note>/` pages, `/blog/`, and `/blog/<post>/`; the root build emitted `/` and two `/<note>/` pages, with no stray blog or garden routes. Inline note links and backlinks resolved correctly in both placements. The fixture image and a valid one-page PDF were present at generated public asset URLs. Both routes are ordinary static HTML outputs.
- Technical correction during the spike: Astro 7.3.5 no longer enables legacy Remark plugins by default (its current Markdown processor differs), so this prototype uses `marked` at build time to render normalized Markdown and resolve the opaque note-link IDs. This does not change the feasibility result, but it reinforces that the Amade contract should specify normalized relationships and rendering behavior rather than prescribe Astro's plugin internals.
- Two initial prototype build attempts exposed Astro's isolated `getStaticPaths()` execution scope and the build output working-directory context; route enumeration was corrected to query collections inside `getStaticPaths()` and read the normalized graph from the project working directory. Both placement builds then passed.
- POC conclusion: a source-independent Knowledge Collection intermediate model can be mounted at root or under a site path, and Astro can statically render its notes, resources, links, and backlinks. The proof does not establish the final Family/Template schema, broad Obsidian syntax coverage, security/privacy policy, search/interactive graph behavior, or production converter design. Keep those open for the next contract-modeling pass.
- The user then asked to test the composed POC on a real hosted site, while explicitly setting aside the Remark-plugin discussion. Added `scripts/deploy-cloudflare.js` and `npm run deploy:subpath` to publish only the hybrid `/garden/` build as a new, isolated Worker using the already validated Cloudflare Static Assets API client. It rejects existing Worker names, displays the selected account suffix, new Worker name, public URL, and payload size, and requires exact `PUBLISH <worker-name>` confirmation before any Cloudflare write. After deployment it checks the homepage, collection, note pages, blog pages, image, and PDF through public URLs. Existing Workers are never overwritten.
- The user supplied a screenshot from the live `bg-garden-poc-*` Worker. Pages and relationships render, but the SVG is broken. A read-only HTTP inspection confirmed the asset body is valid SVG and HTTP 200, while Cloudflare omitted `Content-Type` for static assets. The direct-upload client had sent base64 asset fields as plain FormData strings, so the upload parts carried no explicit file MIME type. Fixed the shared upload client to attach an extension-derived MIME type to each base64 file part, passed this metadata from both deploy runners, and strengthened the Digital Garden deploy check to verify HTML/SVG/PDF response types and asset signatures. Existing named `bg-garden-poc-*` Workers may now receive a new version only when `CF_WORKER_NAME` explicitly selects that POC prefix and the terminal confirmation is typed; other existing Workers remain rejected.
- Verification after the MIME fix: `node --test prototypes/cloudflare-static-assets-deploy-poc/deploy-client.test.js` passed (14 tests); `npm run build:subpath`, `npm run verify`, and `node --check scripts/deploy-cloudflare.js` passed. The fix has not yet been redeployed to the user's live Worker because this task environment lacks `CF_OAUTH_CLIENT_ID`; retest the existing URL using the documented command with `CF_WORKER_NAME=bg-garden-poc-muuphax0-f51acd`.
- The user asked to run the real test Vault locally and explicitly prohibited deployment. Extended the POC converter to process all Markdown without frontmatter filtering, copy every non-Markdown file into the static asset tree, retain relative asset paths, create deterministic collision-resistant note IDs, resolve basic Obsidian wikilinks, and emit a source inventory. Added an isolated local build runner writing to ignored `dist/vault-local` and `dist/vault-local-bundle` directories.
- Full local build result from `vault_example/vault_root`: 186 directories, 1,237 files, 951,317,429 bytes; 469 Markdown notes and 768 non-Markdown resources; 321 resolved wikilinks; Astro emitted 470 pages (including the fixture homepage). Conversion took 2.61s, Astro build 5.09s, total local build 7.70s. The build includes all source files in local artifacts and did not modify the source vault. Deployment was not run. Build report: `prototypes/digital-garden-collection-poc/dist/vault-local/poc-summary.json` (ignored local artifact).
- First full-vault build failed on a zero-byte Markdown note (`무제.md`) because the renderer received an undefined body; treating an empty body as an empty string fixed the case, and the subsequent full Astro build passed. Shiki emitted informational plaintext fallback warnings for several code fence names, with no build failure.
- The user confirmed that some links being broken are acceptable for this POC and that the overall site/build worked well. Next stage is to return to the original goal: model the concepts and derive an Amade Template Spec. Do not spend time enumerating individual broken links unless the user requests it.
- The user also supplied an untracked `vault_example/` directory during this work. It is unrelated to the synthetic POC and was left untouched; do not add it to this branch's change set.
- The existing `publication` semantics may interact with a source-specific selector, but runtime behavior for private/excluded/missing/outside-root notes and references is explicitly out of scope for this spec POC. Record any contract vocabulary these examples expose without choosing product policy. Keep `editorial_status` and `publication` conceptually independent unless the contract review finds a concrete incompatibility.
- POC-only sequence: (1) refine the site/content classification seed and identify contract concerns without fixing product behavior; (2) create small synthetic scenarios/fixtures as vocabulary and coverage probes (homepage pages/posts, garden notes, frontmatter selector examples, relationships, image/PDF references, and unresolved references as questions); (3) sketch alternative Family models and normalized engine-to-template handoffs; (4) compare those alternatives with current Amade Family/Template schemas and record gaps, ambiguities, and extension options; (5) decide whether an Amade spec-only proposal is warranted. Do not implement the engine, BlogGenius integration, Astro behavior, or product-level warnings as part of this POC.
