# Site Hosting posting from Quick Draft

## Branch record

- Branch: `codex/site-hosting-posting-01-quick-draft-publish`
- Start date: 2026-10-04
- Base/parent branch: `codex/static-site-builder-main`
- Status: Complete; focused tests and four-template build verification pass; user confirmed the deployed image displays correctly.

## User need and goal

Let the user publish the Markdown draft written in **블로그 → 빠른 글 작성 → 원고 입력** to the first configured Site Hosting site, using the existing posting option to choose local temporary save or immediate publication.

## Scope

- Add the configured Site Hosting site's first entry to the existing `포스팅 대상` control for this initial implementation.
- When the target is the Site Hosting site, route the posting action according to the selected option:
  - temporary save writes the post under the site's local content data with `editorial_status: draft` and `publication: none`; it does not build or deploy.
  - immediate publication writes `editorial_status: complete` and `publication: public`, fills optional `date` if absent, then builds and deploys the whole Site.
- Reuse the Amade Site Hosting content contract `bloggenius-site-hosting-template@0.7.1` and the selected site's pinned family manifest.
- Keep scheduled publication unavailable for Site Hosting.
- Keep operation outcome and timestamps in BlogGenius's publishing record, not post frontmatter.

## Non-goals

- Multi-site selection UX or selection management.
- Post editing/republishing after the initial publish flow.
- Incremental Astro builds; immediate publication uses full build and deploy.
- Changes to existing Naver Blog or WordPress posting behavior.
- UI smoke or hands-on UI validation unless explicitly requested by the user.

## Design and boundaries

Use the existing Quick Draft authoring and publish-option state, adding Site Hosting as a target in the existing target area. Keep provider-specific logic out of the editor UI: adapt the Markdown/title and option to the Site Hosting post contract, write into the local Site data boundary, then invoke the existing Site build/deploy service for public publication. Keep Amade contract and rendering changes canonical in Amade; keep BlogGenius-specific manuscript adaptation and operation handling in BlogGenius.

Before implementation, inspect current target selection, temporary-save/immediate-publish actions, Amade catalog contract pinning, Site directory resolution, and build/deploy services. Preserve existing target behavior and use an explicit Site Hosting action boundary.

## Decisions from the user

- Contract fields are `editorial_status: draft | complete` and `publication: none | private | public`; all combinations are valid.
- BlogGenius temporary save maps to `draft + none`, stored in the local Site only and omitted from Worker output.
- BlogGenius immediate publication maps to `complete + public`, then performs full build and deploy.
- Site Hosting scheduled publication is unsupported for now.
- BlogGenius should warn, not silently rewrite or reject, any deliberate `draft + public` pairing in generic/manual content workflows.
- The Amade contract and four templates were first updated to 0.4.0 in commit `caeb594`; representative-image support later advanced them to contract 0.7.1 / package 0.4.4 in commit `bde4bf6`, pushed to Amade `dev`.

## Progress and verification

- Current parent branch documentation was committed as `a4c55f8f` before creating this feature branch.
- Implementation: the initial target was mistakenly added to the legacy quick-paste surface. After the user reported that it was missing from the screenshot's UI, that legacy-only UI wiring was removed. The target is now added to Blog Beta's `원고 입력` publish settings, where it discovers the first available Site Hosting site, displays its name, bypasses Naver/WordPress setup gates, disables scheduled posting, and routes the existing temporary-save/publish choice to the Site Hosting post endpoint.
- Temporary save writes `draft + none` under the contract-declared post source without building or deploying. Immediate publication writes `complete + public`, then performs the existing full Astro build and Cloudflare deploy. A successful response can show a direct post link.
- The Site Hosting post endpoint validates the pinned Amade template and family contracts, derives title and description from pasted Markdown, writes a unique post file within the site data directory, and reports build/deploy failure while keeping the local post for a later deployment retry.
- At the 0.5.0 milestone, BlogGenius immediate publication recorded an ISO 8601 `published_at` timestamp in post frontmatter; temporary saves omitted it. Templates ordered posts newest-first by `published_at`, then optional `date`, then path-derived ID.
- At the 0.5.0 milestone, Amade package version advanced to 0.4.2 and existing Sites kept copied template files. The 0.7.0 follow-up advanced the package to 0.4.3 and contract to 0.7.0; Sites must be recreated or explicitly upgraded to consume it.
- The default starter preview initially failed because YAML parsed the unquoted date-only fixture as a JavaScript `Date`, while the Astro schema accepted only strings. The starter schema now normalizes parsed date values to date-only form and drops invalid optional dates; BlogGenius continues to write its generated valid `YYYY-MM-DD` value without quotes. The same schema behavior and contract note are included in Amade commit `bde4bf6` on `dev`.
- Local Markdown preview validation now recognizes `site-hosting` as a target, so choosing the Site target does not produce a false “no target” validation error.
- Verification: focused compatibility/catalog/service tests passed (21/21). Four canonical Amade Astro templates built and the artifact verifier passed, covering optional frontmatter, thumbnails, OG image and alt metadata, publication visibility, routes/media, and A→B→A data preservation. The user confirmed the deployed post image now displays correctly.

## Result and remaining work

Completed manual review: the user tested a Site Hosting post and confirmed that its image displays in the deployed Worker. Scheduled posting remains unavailable for the Site target. The feature branch is ready for the user's requested commit; merge and push remain separate actions.

## Follow-up: system browser and template logo

- The Site card's `기본 주소` and connected-domain actions are buttons that call a loopback-only Site Hosting API; the service derives the destination from the selected site's persisted deployment/domain state, accepts HTTPS only, and opens it through Electron `shell.openExternal`. The renderer cannot pass an arbitrary URL to the shell.
- The current default site's `site-data/public/logo.svg` and Astro's generated `dist/logo.svg` are present, and the generated homepage references `/logo.svg`. The live Worker returned `200` without a `Content-Type` response header. The deployer now sends per-file MIME types (including `image/svg+xml`) and includes that MIME type in the Cloudflare asset hash. This forces Cloudflare to upload assets again when MIME metadata differs, instead of deduplicating and reusing the earlier no-header asset. No Cloudflare deploy was triggered as part of that change; the user later redeployed.

## Follow-up: Site Hosting manuscript images

- WordPress previously parsed `[[IMAGE_N ...]]` blocks inside its publishing flow, uploaded the matching image files to WordPress media, and replaced each block with a Markdown image link. Site Hosting initially received only Markdown text, so the marker remained visible in the published post.
- Extracted the image-block parsing/replacement contract into `src/content/image-blocks.js` and switched WordPress to that shared parser. Site Hosting now receives the manuscript `draftId` and `revision`, reads the authoritative Markdown and selected image files from the shared manuscript draft service, validates image bytes, writes each image alongside the new post's `index.md`, and rewrites markers to `![alt](./images/image-N.ext)`.
- Public publication fails with a clear error if an image block cannot be resolved, preventing raw placeholders from leaking into a Worker page. Local temporary saves (`publication: none`) stay local and do not build/deploy; their files and any unresolved markers are outside the generated site's public assets.
- Added AVIF MIME handling to the local Astro preview server. JavaScript syntax checks for the changed runtime/parser files and `git diff --check` passed. No build, deployment, test suite, or commit was run for this follow-up.

## Follow-up: publication completion link

- The generic completion renderer appended `글` to the Site Hosting label `발행한 글`, displaying the duplicated text `발행한 글 글`. It now renders that label once.
- The Site Hosting completion link now carries the selected project/site and post IDs. Clicking it calls a loopback API that validates the post slug and contract-declared route, derives the URL from the site's recorded HTTPS Worker address, and opens it with Electron `shell.openExternal` (the system browser). The renderer does not hand an arbitrary URL to the shell.
- JavaScript syntax checks for the changed service, route, and renderer files and `git diff --check` passed. No test suite, UI smoke, site deployment, or commit was run for this follow-up.

## Follow-up: responsive post images

- The deployed post showed a manuscript image at its intrinsic pixel width, overflowing the template's content column. Added a shared `img { max-width: 100%; height: auto; }` rule to all four Amade Site Hosting templates and the existing default site's local Astro source. The existing header logo dimensions remain controlled by the more specific header rule.
- Previously bumped the four Amade template package versions from `0.4.0` to `0.4.1` for responsive image handling, then to `0.4.2` at the 0.5.0 milestone, `0.4.3` with contract `0.7.0`, and `0.4.4` with contract `0.7.1`. The latest Amade changes are in pushed `dev` commit `bde4bf6`.


## Follow-up: publication ordering and SEO metadata

- Amade contract 0.7.0 makes all Markdown frontmatter optional and extensible; BlogGenius still writes its publication fields explicitly. Post list and home page sort newest first by `published_at`, fallback `date`, then path-derived ID ascending. Astro derives ID from the validated `posts/<slug>/index.md` path, so authors do not need an ID field.
- Amade's four templates add title/description/Open Graph/canonical/article publication metadata. BlogGenius stores the first image block in optional `cover` and its title in `cover_alt`; templates use those fields for thumbnails and OG image metadata without modifying the source Markdown.
- Existing materialized Sites pin copied template files and are not upgraded in place. They must be recreated or explicitly upgraded to consume package 0.4.4 and contract 0.7.1.
- BlogGenius now accepts only the 0.7.1 Site Hosting content contract. Focused tests, four-template Astro builds, deploy verification, and manual SEO output inspection are tracked for this follow-up.

## 2026-10-05 — Content contract 0.7.0 adoption

- The user confirmed that no Markdown frontmatter field is required; path-derived identity/kind, unknown-field pass-through, fallback display title, and optional metadata are the shared rules. `publication` defaults to `none`.
- Amade family/template manifests and all four Astro templates now target contract `0.7.0`; package version is `0.4.3`. Optional `author` is supported as metadata but BlogGenius does not synthesize it.
- At the 0.7.0 milestone, BlogGenius exact compatibility and Site Hosting posting eligibility required contract `0.7.0`. Verification was completed with the 0.7.1 follow-up below.


## 2026-10-05 — Representative image contract 0.7.1

- User approved optional `cover` and `cover_alt` frontmatter. BlogGenius's Site Hosting publisher stores the first image block's relative path in `cover` and its title in `cover_alt` when supplied.
- All four Amade templates accept these fields, generate optimized blog-list thumbnails, and use the cover for `og:image` / optional `og:image:alt`. Templates leave source frontmatter unchanged.
- Contract/package versions are 0.7.1 / 0.4.4. The build verifier uses canonical Amade templates and family fixtures rather than stale duplicated experimental snapshots.
- Focused BlogGenius coverage passes (21 tests). All four Astro templates built and the verifier confirmed listing thumbnails, absolute `og:image`, `og:image:alt`, generated Markdown image assets, and A→B→A data preservation. Manual UI/Worker confirmation remains with the user.
