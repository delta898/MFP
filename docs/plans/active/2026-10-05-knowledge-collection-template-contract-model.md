# Knowledge Collection and Template Contract Model (Proposal)

Status: design proposal for discussion; vocabulary is provisional except for the terms the user has already accepted (`Collection`, `Knowledge Collection`, `Note`). This document does not change Amade or BlogGenius behavior.

## Goal

Use the full-Vault local build POC to return to the original question: can Amade describe a Knowledge Collection in a way that is source-independent, can be placed at the site root or under a route, and can coexist with ordinary pages and a blog?

## Recommendation

Model the site as a composition of **content collections and standalone pages**, with **placement** and **presentation** defined outside each collection's source identity.

```text
Site instance
  ├─ site profile and navigation
  ├─ page entries
  ├─ Collection placement: Blog Collection at /blog/
  │    └─ Post entries
  └─ Collection placement: Knowledge Collection at / or /garden/
       ├─ Note entries
       ├─ Resources (images, PDFs, and other files)
       └─ Relationships (outgoing links; backlinks can be derived)

Source adapter (Obsidian Vault, another folder, or BlogGenius)
  -> normalized collection bundle
  -> Astro Template package
  -> static site output
```

The placement is a property of the Site composition, not of the source Vault or Note. Moving a Knowledge Collection from `/` to `/garden/` should not change note identity or rewrite source relationships. A Template chooses how to render the collection at that mount point.

## Vocabulary proposal

| Term | Proposed meaning | Boundary |
|---|---|---|
| Site | One configured website output with a profile, navigation, and placed content | BlogGenius/site configuration |
| Page | A standalone, stable-route content entry such as About | Site content contract |
| Collection | A named group of entries with shared semantics and one or more views | Amade content contract |
| Blog Collection | A Collection whose entries are Posts and commonly have chronological views | Collection model, not visual layout |
| Knowledge Collection | A Collection of Notes, Resources, and relationships between them | Collection model, not an Obsidian-specific type |
| Note | An identity-bearing entry in a Knowledge Collection | Atomic content record |
| Resource | A file referenced by entries, such as an image or PDF | Collection bundle |
| Relationship | A directed, typed reference between entries and/or resources | Collection bundle; reverse links are derived views |
| Source adapter | Reads one source format and emits the normalized bundle | Independent engine or source-specific adapter |
| Template Family | A shared data/behavior compatibility contract for interchangeable Templates | Amade's existing conversion boundary |
| Template | A runnable Astro presentation package consuming a Family contract | Amade package |
| Template Family display name | A discoverable/use-case label such as “Digital Garden” | Catalog metadata; not a content-model discriminator |

`Digital Garden` remains a product-facing/template-family label, not a new normative entity type. An Obsidian Vault is one possible source for a Knowledge Collection, not the Knowledge Collection itself.

There are two meanings that should not be confused: a catalog may offer a “Digital Garden” **starter/preset** for convenience, while Amade's technical `Template Family` remains the **interchangeability boundary**. A preset may recommend one Knowledge Collection at `/`; a combined personal-site preset may recommend pages, a Blog Collection, and a Knowledge Collection at `/garden/`. Both use the same Knowledge Collection model. Every Template listed in a technical Family must still satisfy that Family's complete shared contract.

## Content classification: separate orthogonal concerns

The current `page | post | work | service` `kind` list combines different questions:

- `page` and `post` mainly describe route/listing and temporal presentation behavior.
- `work` and `service` describe subject matter or business domain.

One exclusive `kind` cannot accurately answer both questions. The proposal is to stop treating `work` and `service` as peers of `page` and `post`; they are better represented as a domain-specific Collection model or ordinary user metadata (for example a category), depending on whether they need distinct fields and routes.

For the agreed conceptual vocabulary, `Page`, `Post`, and `Note` are useful entry profiles in different collection contexts:

- Pages are standalone stable-route entries.
- Posts are entries in a Blog Collection; published time and chronological ordering matter.
- Notes are entries in a Knowledge Collection; stable identity and relationships matter.

These profiles should not prevent additional views. A Knowledge Collection can offer a chronological view of dated Notes without changing those entries into Posts. Likewise, a Template may show Posts as cards or a list without making `card` or `list` a content kind.

Still to validate: whether the spec should encode these as `entry_type` values, collection-specific record schemas, or a smaller common Entry plus declared capabilities. The rule to preserve is that subject classification, source identity, publication behavior, relationships, and visual view must not be collapsed into one enum.

## Ownership by layer

| Layer | Owns | Does not own |
|---|---|---|
| BlogGenius | Site/source selection, user-facing publication configuration, invoking build/deploy | Obsidian syntax parsing or Astro page rendering |
| Source adapter / Knowledge Collection engine | Read a supported source, interpret its links/resources, emit a normalized bundle and diagnostics | Site visual design or final URL layout |
| Amade Family contract | Normalized data shape, identity/reference rules, supported collection models and required behaviors | A particular source tool or visual layout |
| Amade Template package | Astro routes, layouts, collection views, and rendering of declared contract capabilities | Reinterpreting source-specific Vault semantics |
| Template Builder | Create/check package manifests and validate package conformance to a Family | Own content conversion at runtime |
| Astro build | Turn normalized content plus a Template into static HTML/assets | Decide which source notes a user intends to publish |

The POC demonstrates the shape `source -> normalized bundle -> Astro`, but its converter is still a prototype. The final engine could be a separate application/library; that deployment and packaging choice is not decided by this contract proposal.

## What the existing Amade contract can and cannot express

The current experimental Site Hosting Family 0.1 / content contract 0.7.2 provides:

- One `family_id` per Template and a same-family data-preservation promise.
- A fixed `content_types` list with path patterns and frontmatter policies.
- Shared site profile, navigation, and media directory conventions.
- Optional, extensible Markdown frontmatter.

It does not yet provide:

- A first-class Collection identity or a composable list of placed Collections.
- A separation between a Collection's source/identity and its site `mount_path`.
- A Knowledge Collection record contract for Note identity, Resources, and Relationships.
- Declared relationship semantics such as outgoing links and whether backlinks are derived.
- A machine-readable capability promise that every Template in one Family must render.

Therefore, the current spec can host the existing personal/company homepage examples, but it cannot yet state the promise “this Site composes pages, a Blog Collection, and a Knowledge Collection at an arbitrary mount path while retaining links and resources.” A menu link to `/garden/` alone does not express that data or rendering contract.

The existing draft describes Digital Garden as a separate future Family candidate. That remains one possible catalog preset, but it should not be treated as a requirement that Knowledge Collections can only exist in a Garden-only Site. The user's root-or-subpath scenario favors a reusable collection contract and composition support.

## Contract-shape alternatives

| Alternative | Benefits | Limitations | Assessment |
|---|---|---|---|
| A. Add a Garden-only Family with Notes | Small change; easy starter template discovery | Makes root/subpath composition awkward; duplicates combined families as use cases grow | Keep as a catalog preset only, not the data-model answer |
| B. Treat Vault as a new `kind` next to page/post/work/service | Superficially simple | Mixes a source aggregate with atomic content records and domain labels | Reject |
| C. Add Knowledge Collection as a reusable Collection contract; let a Site place it at root or a subpath | Separates source, content model, placement, and rendering; supports composition | Requires Family contract to describe multiple Collection models and Template conformance | Recommended direction |
| D. Add generic graph fields to every Markdown record without Collections | May support links | Does not identify which entries/resources form a collection, its source identity, or where it is mounted | Insufficient alone |

## Scenario matrix against the current contract

| Scenario | Full-vault POC evidence | Current Amade 0.7.2 contract | What the proposed model adds |
|---|---|---|---|
| Existing personal/company homepage with pages and blog posts | Existing Amade fixtures already validate those models | Representable as one Family's fixed content paths | No immediate change required for existing content |
| Knowledge Collection is the entire site at `/` | Astro can generate root-mounted note pages | Not declared; `note`, resources-as-collection-assets, and graph relationships are absent | A Knowledge Collection profile can be the only placed collection |
| Knowledge Collection appears under `/garden/` beside home/pages/blog | The synthetic composition build demonstrated a `/garden/` section | A navigation path can mention `/garden/`, but the family contract cannot declare the collection behind it | Site placement declares `/garden/`; Family promises all required Knowledge Collection views |
| Move the same collection between `/` and `/garden/` | The POC can build either route arrangement, but did not automate a before/after identity comparison | Route is currently implicit in content type/template patterns | Stable entry IDs stay with the bundle; mount path is resolved by the renderer |
| Swap two Templates while preserving the Knowledge Collection | Not exercised by this POC | Existing same-family conversion promise is the right governing rule, but has no Knowledge Collection data to preserve | Both family Templates must implement the declared graph/resource capabilities |
| Classify a dated Note under “work” or “service” | Real vault includes varied metadata and links; taxonomy was not tested | `work`/`service` share the exclusive kind enum with `page`/`post` | Domain labels are independent facets or domain-specific collection profiles |

This matrix suggests the missing piece is composition and behavior vocabulary, not Astro's ability to emit static pages.

## Candidate contract boundary (concept only; not final JSON)

Amade should describe the **normalized input and required presentation capabilities**, not the full Obsidian import configuration. Names and exact serialization are open.

```text
Family contract
  collections:
    - model: blog
      entries: Post
      required capabilities: detail route, chronological listing
    - model: knowledge
      entries: Note
      resources: image, document, other file
      relationships: outgoing references
      required capabilities: note detail, outgoing links, backlinks

Site-owned composition
  placements:
    - collection: knowledge-main
      mount_path: /garden/
      navigation item: optional reference
```

The reusable collection profile says what data/behavior exists; a Family references the profiles it promises; Site data places configured collection instances at public routes. A Garden-only Family can still be a useful selection preset, but a user's combined Site need not be modeled as a special `digital_garden` site kind.

Candidate normalized Knowledge Collection data:

- Stable entry ID and source-relative path are distinct from public route/slug.
- Note metadata and Markdown body are kept separate from the relationship graph.
- Resource records have stable IDs, relative paths, media types when known, and references from Notes.
- Relationships are directed records with at least source ID, target ID, and relation type. Backlinks can be calculated as the reverse view of outgoing links rather than stored twice.
- `mount_path` belongs to Site placement. A renderer maps stable collection/entry IDs to public URLs.

This is a vocabulary sketch only. It does not decide ID algorithm, bundle file layout, accepted link syntax, missing-target policy, frontmatter selection rules, or URL normalization.

## POC evidence and limits

The real Vault local build included all source Markdown regardless of frontmatter, copied non-Markdown files, and generated static pages. It processed 469 Markdown notes and 768 other files (about 907 MiB total), resolved 321 basic wikilinks, and produced 470 pages. Conversion plus Astro build took 7.70 seconds in this run. No Cloudflare deployment occurred.

This is sufficient evidence that Astro can build the proposed kind of normalized static collection. It is not evidence of complete Obsidian compatibility, production privacy/publication semantics, every image/PDF embed case, or final Amade schema conformance. Some broken links were observed and explicitly deferred by the user; link auditing is not the next task.

## Decisions still needed before changing Amade schemas

1. Confirm whether `Page`, `Post`, and `Note` should be formal entry profiles or whether `Post`/`Knowledge` belong only to Collection models.
2. Decide whether Family 0.1 remains one fixed composition contract, or gains a versioned `collections`/capabilities contract. In either case, preserve the same-family template-switch data promise.
3. Decide which collection placement data is site-owned and whether the mount path can be edited independently of source identity.
4. Define minimum relationship types for the contract (e.g. link and embed) and whether backlink data is derived.
5. Define the normalized engine-to-Astro bundle boundary; keep Obsidian syntax and publication selectors source-adapter concerns unless another source requires them.
6. Decide where `work` and `service` fit: metadata facets or separately modeled Collection profiles, without conflating them with `page`/`post` behavior.

### Recommended answers for the next review

1. Use `Page`, `Post`, and `Note` as entry profiles, but keep collection-level behavior explicit: a Post belongs to a Blog Collection; a Note belongs to a Knowledge Collection; a Page has a stable standalone route. Allow optional dates/relationships as declared capabilities without changing the entry's profile.
2. Add reusable Collection model contracts and let each Family declare the complete set it supports. This keeps the same-family conversion rule meaningful while allowing several site arrangements and presets.
3. Store collection instance placement (`collection_id`, `mount_path`, optional navigation reference) in durable Site data, not in the Vault export. The Template maps stable IDs to URLs using that placement.
4. Store outgoing relationship edges once, with at least `link` and `embed` types. Derive backlinks as a reverse query/view unless later performance evidence justifies materializing them.
5. Keep source selection and Obsidian syntax in the source adapter configuration. The adapter emits a normalized, source-neutral bundle; Amade declares that bundle's contract and the Template declares how it renders it.
6. Model `work` and `service` as categories/domain facets by default. Promote one to a Collection model only if it needs its own structured fields, lifecycle, routes, or conversion guarantee.

These are recommendations, not accepted decisions. If adopted, the smallest Amade schema experiment should add a Knowledge Collection model and Family capability requirements without changing current page/post behavior; work/service cleanup can be a separate compatibility decision.

## Proposed next validation slice

Use a small contract scenario matrix rather than enumerate every Vault syntax:

1. Personal homepage with pages + Blog Collection + Knowledge Collection at `/garden/`.
2. Knowledge Collection mounted at `/` with no homepage/blog.
3. Same Knowledge Collection moved from `/garden/` to another route without changing stable Note IDs or relationships.
4. Two Templates in one Family render the same collections and relationships in different views without dropping data.
5. A work/service example proves that topic/domain classification is independent from the entry/collection profile.

Compare each row with the current Family/Template manifest and content contract, then prepare a spec-only Amade proposal. Do not implement BlogGenius UI, a production converter, or product-level diagnostics during this validation slice.
