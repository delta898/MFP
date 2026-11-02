# Site Hosting Vault Publishing

## Scope

Astro build/preview and hosting-provider API work use the bundled `astro-site-hosting` Core Plugin. The Site Hosting service retains Site eligibility, frontmatter/path-containment checks, publish-vs-draft policy, deletion preflight, and local repository state transitions. Cloudflare OAuth credentials are resolved by the Host and supplied only to the requested Plugin operation.

Site Hosting follows the runtime environment selected by `BLOGGENIUS_ENV`. Local builds embed the local Trends API URL and cannot mutate Cloudflare resources. Development builds embed the Development Trends API URL and deploy to a separate `-dev` workers.dev Worker; Production builds embed the Production Trends API URL and keep the stable Worker name. When Site Hosting is given a custom hostname, Development appends `-dev` to its leftmost DNS label (for example, `www.bloggenius.kr` becomes `www-dev.bloggenius.kr`, and `news.example.com` becomes `news-dev.example.com`); an existing `-dev` suffix is not duplicated. Production keeps the configured hostname unchanged. Deployment and custom-domain bindings are stored per environment, while older single-value manifest fields remain the Production compatibility view. The Development Trends Worker permits the configured development site origin, and the newsletter function only generates confirmation/unsubscribe links for the matching environment's site host. This routing does not configure DNS or create Cloudflare custom-domain bindings automatically; connect the Development hostname through Site Hosting and configure its DNS as required.

Blog Beta can publish a manuscript to a Digital Garden (DG) Site backed by a local Vault. The destination picker exposes only folders under the root configured for that Site. The browser keeps the chosen relative path in the current tab session; the server resolves and validates it again when publishing.

## Destination contract

- `GET /api/v1/site-hosting/projects/{projectId}/sites/{siteId}/vault-folders` returns the configured Vault root name and root-relative folder paths. The root is represented by `.`. Symbolic-link directories are omitted, and the list is capped at 5,000 folders.
- `POST /api/v1/site-hosting/projects/{projectId}/sites/{siteId}/vault-folder` opens the native directory chooser at the previously selected Vault-relative folder (or the Vault root on first use). It returns only a relative path. The native dialog may allow browsing outside the root, but the service rejects an outside selection and all symlinked paths.
- Publishing to a Vault Site requires `destinationPath`. It must name an existing directory under that Site's configured Vault root. Absolute paths, traversal, symbolic links, and paths outside the root are rejected.
- A Vault Site is eligible as a publishing target when it has the supported Site Hosting contract version plus declared Knowledge Collection root and publication-filter inputs. It does not need the ordinary Blog `post` content type or a blog-list navigation menu; the published note is surfaced by the Knowledge Collection build.
- A folder that disappears is not replaced with another path. The user must select a currently available folder.
- The Site Publishing target still stores a post at `{destination}/{slug}/index.md` with image assets under its sibling `images/` directory. Immediate posting follows the existing build/deploy lifecycle; temporary save writes locally without building or deploying.

## Knowledge Collection visibility

- Temporary BlogGenius posts use `kind: post`, `editorial_status: draft`, and `publication: none`. The Knowledge Collection builder always excludes these generated temporary posts, including in `ALL` mode.
- Immediate posts use `editorial_status: complete` and `publication: public`. When the Site has a configured frontmatter publication filter, the publisher writes its field/value into the post frontmatter so the note matches that filter.
- `ALL` mode otherwise retains its existing behavior. Its general visibility semantics, including visibility of other Vault notes, are outside this feature and remain a separate design decision.

## Ownership and validation

The UI owns selection and session-scoped target settings. It never sends absolute Vault paths. The Site Hosting service owns root resolution, folder enumeration, containment checks, and post writing. Astro build/preview and hosting-provider deployment run through the `astro-site-hosting` Plugin. The Knowledge Collection builder owns inclusion and exclusion during collection generation.

No compatibility migration is needed: destination selection is a current UI request field and generated posts live in user-selected Vault folders.
