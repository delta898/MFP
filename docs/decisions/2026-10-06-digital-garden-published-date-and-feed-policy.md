# Digital Garden publication dates, RSS, sitemap, and incremental builds

- Status: Discussion record; implementation is not approved or present
- Decision updated: 2026-10-06
- Related: [Site Hosting Markdown content contract](./2026-10-04-site-hosting-post-frontmatter-contract.md)

## Context

A Digital Garden built from a Markdown Vault needs stable publication dates if BlogGenius later emits RSS. Sitemap entries may also include a last-modified date. A build timestamp is not inherently a content date: rebuilding an unchanged Vault must not make every note appear newly published or modified.

Quartz separates date processing from output generation. Its date transformer can resolve created/modified values from frontmatter, Git, or filesystem metadata according to configured priority; its content-index emitter separately generates sitemap, RSS, and a JSON index. Filesystem dates may change when Vault files are copied or synchronized. Astro's experimental incremental static builds optimize page rendering and do not define publication-date semantics.

BlogGenius currently has no sitemap or RSS generation in the Site Hosting templates or build flow. Its accepted post contract defines `date` as a content/writing date and `published_at` as an optional publication timestamp written by BlogGenius when it immediately publishes a post.

## Agreed semantics

- `published_at` means the time content is first made public on the target Site. It is an event timestamp, not a substitute for a writing/creation date.
- BlogGenius-authored posts receive `published_at` as part of the publishing flow.
- A Vault build or preview is local and must not write publication timestamps into source Markdown.
- When a Vault note is first made public through deployment and has no valid `published_at`, the deployment workflow may assign a timestamp for that first-publication event. Existing valid values must be preserved on later deployments.
- Do not automatically copy the Vault `date` field to `published_at`; the field can mean a writing/creation date and is not necessarily when the note became public.
- Any write-back to the user's Vault requires explicit user consent. It must update only missing `published_at` values and preserve all other frontmatter and file content.
- If the app cannot establish an accurate publication timestamp, it must not silently invent one from a later routine build.

## RSS and sitemap direction

- RSS item publication dates should come from `published_at`. If no valid publication timestamp exists, omit the RSS date instead of substituting the current build time.
- Sitemap `<lastmod>` describes a URL's last meaningful modification, which is not automatically the same as its first publication. The discussion so far accepts either using `published_at` as a stable initial timestamp or omitting `<lastmod>` when no reliable modification date exists. If a future `updated_at` or equivalent source is adopted, it may be used for actual subsequent edits.
- Do not set sitemap `<lastmod>` to the sitemap/build generation time. That would change on unrelated deployments and imply content changes that did not occur.
- RSS, sitemap, and template support remain future work; this note does not add these artifacts or modify the Site Hosting content contract version.

## Astro incremental-build assessment

The current Site Hosting templates lock Astro `7.3.5`. Astro's experimental incremental static builds, introduced in `7.2.0`, can reuse a generated route when its data `cacheKey` and code dependency graph are unchanged. This is a build-performance optimization, not a substitute for stable publication metadata or a correctness guarantee for generated feeds.

Before enabling it for Vault sites:

- Dynamic pages must return a stable `cacheKey` that changes when their rendered data changes. Content hashes are safer than filesystem modification times.
- Pages that depend on shared data (for example backlinks, search indexes, RSS, or sitemap output) need cache keys/invalidation that account for those dependencies.
- The cache must survive builds. BlogGenius currently runs `npm ci` for Site builds, which removes `node_modules`; Astro's default cache under `node_modules/.astro/` would therefore not persist. A separate persistent `cacheDir` and explicit cache lifecycle are needed.
- Keep a full-build path available while the Astro feature remains experimental, and compare incremental output against a clean build before relying on it.

## Open questions before implementation

1. Which explicit Vault frontmatter spellings count as a publication timestamp (`published_at`, Quartz's `published`/`publishDate`, or another declared alias)? The `date` alias is intentionally not assumed to mean first public release.
2. Should timestamps be written back to Vault only after deployment succeeds? The generated output needs the timestamp during build, while a failed deploy should not claim publication. The failure/retry flow must preserve one candidate timestamp and avoid a partially applied state.
3. What does user consent look like: one-time Site-level permission, per-deployment confirmation, or a choice to keep source Markdown read-only? Existing frontmatter and formatting must be preserved.
4. Does `publication: private` count as published for `published_at`, RSS, and sitemap inclusion? Private means unlisted, not access-controlled, in the current contract.
5. For edited Vault notes, should sitemap `<lastmod>` be omitted absent an explicit modification date, or should BlogGenius persist a content-hash-to-change-time record? Reusing first `published_at` is stable but does not describe later edits.
6. What site-level URL source and canonical-host policy should RSS/sitemap use when the Site has a workers.dev URL and/or a custom domain?

## Sources checked

- [Quartz frontmatter fields](https://github.com/jackyzha0/quartz/blob/v5/docs/plugins/Frontmatter.md)
- [Quartz plugin and date-source configuration](https://github.com/jackyzha0/quartz/blob/v5/docs/configuration.md)
- [Quartz community Content Index](https://github.com/quartz-community/content-index)
- [Astro experimental incremental static builds](https://docs.astro.build/en/reference/experimental-flags/incremental-build/)
- [Sitemaps protocol](https://www.sitemaps.org/protocol.html)
