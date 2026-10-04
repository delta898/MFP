# Site Hosting Markdown content contract

- Status: Accepted; Amade experimental Site Hosting content contract `0.7.1`
- Decision updated: 2026-10-05

## Ownership and versioning

Amade owns the canonical Site Hosting content contract in each Template Family manifest. Astro templates consume that contract; BlogGenius writes the fields needed by its own posting flow and gates template use on the exact supported contract. The current app contract is `bloggenius-site-hosting-template@0.7.1`. The Amade package specification remains `0.1.0`; the four package releases are `0.4.4`. Future contract revisions increment patch versions during experimentation; promote to `1.0.0` only after sufficient validation.

## Frontmatter policy

No frontmatter field is universally required. Content kind and stable ID come from the validated Markdown file path. When supplied, `kind` must match the path. Astro schemas accept and preserve unrecognized keys without interpreting them. Known fields are validated according to their own rules; malformed optional date values are ignored, while invalid publication/editorial enums remain errors because they affect generated output.

| Field | Required | Scope and meaning |
|---|---:|---|
| `kind` | No | Optional content discriminator; inferred from path when absent. If present, it must match. |
| `title` | No | Display title; fallback is first Markdown H1, then the path-derived slug. |
| `description` | No | Optional listing/SEO summary; omitted when absent. |
| `author` | No | Optional creator name; emitted as author metadata only when present. BlogGenius does not invent it. |
| `date` | No | Optional `YYYY-MM-DD` writing/content date. Invalid values are ignored. |
| `published_at` | No | Optional ISO 8601 timestamp with explicit offset; BlogGenius writes it on immediate publication. Invalid values are ignored. |
| `cover` | No | Optional image path relative to the post entry. BlogGenius sets it to the first embedded image; templates use it as the representative image for post cards and social preview metadata. |
| `cover_alt` | No | Optional alternative text for `cover`; BlogGenius copies the image block title when available. |
| `editorial_status` | No | `draft` or `complete`; missing means `draft`. Describes writing completeness only. |
| `publication` | No | `none`, `private`, or `public`; missing means `none`. Describes output/listing intent. |
| `path` | No | Optional page route; when absent, the page ID supplies the route. |
| `is_public` | No | Optional page/work/service visibility; missing means `false`. |
| `order` | No | Optional non-negative page/work/service ordering hint where used. |
| `tags`, `categories`, other keys | No | User-owned extensible metadata. Templates ignore keys they do not understand. |

Stable IDs come from supported paths, not a frontmatter field: `pages/<id>.md`, `posts/<slug>/index.md`, and the family-specific `work/<slug>/index.md` or `services/<slug>/index.md`. An entirely absent frontmatter block is valid.

## Publication behavior

| `publication` | Local Site data | Astro build / Worker | Public listing |
|---|---|---|---|
| `none` (default) | Retained | No page output | Hidden |
| `private` | Retained | Detail page deployed | Hidden; a known URL remains accessible |
| `public` | Retained | Detail page deployed | Visible |

`private` is unlisted, not access-controlled. Every pairing of editorial completeness and publication intent is valid. In BlogGenius, temporary save writes `draft + none`; immediate posting writes `complete + public` and `published_at`; scheduled Site Hosting posting remains unsupported. A successful deployment does not rewrite frontmatter or set a `published` status.

Public posts sort newest first by `published_at`, then `date`, then stable path-derived ID. Equal or missing timestamps use ID for deterministic order. Detail titles use `<post title> | <site name>`. `cover` is the source of truth for the representative image. BlogGenius sets it from the first Markdown image block and optionally copies that block's title to `cover_alt`. Templates do not rewrite frontmatter: they use `cover` for post-list thumbnails and, when an absolute site origin is available, Open Graph image metadata. If `cover` is absent, image metadata and thumbnails are omitted.

Tags and categories remain user-owned. BlogGenius may add explicit author editing/mapping later; until then its Site Hosting publisher leaves `author` absent. Existing Sites keep their copied template source and do not receive this contract update automatically.

## 0.7.1 representative image

- `cover` and `cover_alt` are optional post fields. Unknown frontmatter keys continue to be preserved and ignored by templates that do not understand them.
- BlogGenius's Site Hosting publisher selects the first image block in the manuscript. It writes that image's stored relative path to `cover`, and writes the image block title to `cover_alt` when non-empty.
- Amade templates use `cover` to generate optimized post-list thumbnails and Open Graph metadata (`og:image`, with `og:image:alt` when available). They do not mutate source Markdown or frontmatter.
- Contract version is `0.7.1`; the four Amade template package versions are `0.4.4`. Existing materialized Sites retain their template snapshot until recreated or upgraded.
