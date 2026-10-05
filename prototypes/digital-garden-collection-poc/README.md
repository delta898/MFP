# Knowledge Collection → Astro POC

This isolated prototype validates the provisional `Collection` / `Knowledge Collection` / `Note` model. It is not BlogGenius or Amade product code.

## What it checks

- A normalized Knowledge Collection can be mounted as the whole site (`/`) or under a section path (`/garden/`).
- Note IDs and relationships are source identities, not URLs. The Astro presentation layer resolves them under the selected mount path.
- A note can include an image and a PDF resource; both are copied to stable public asset paths.
- Astro emits static note pages, a collection index, outgoing links, and backlinks at build time.
- A regular Blog Collection can coexist with the Knowledge Collection in the subpath scenario.

## Layers in this POC

```text
fixtures/vault/       source-like notes and assets
scripts/convert.js    fixture adapter → normalized bundle
bundle/               build input contract produced by the adapter
src/                  Astro presentation and static route generation
```

The adapter handles fixture-specific `[[wikilink]]` parsing and writes stable entry IDs plus directed relationship records. It does not choose a mount path. Astro reads the normalized bundle, resolves link IDs to the configured mount path, and renders the same collection at either location.

## Run

Requires Node.js 24+ and Astro 7.3.5. Install dependencies with `npm install`, then run:

```sh
npm run build:subpath
npm run build:root
npm run verify
```

The two builds use separate output directories: `dist/subpath` and `dist/root`. The verification script checks route files, outgoing/backlink text, and the image/PDF outputs. The included package lock is copied from the currently used Astro 7.3.5 template dependency set.

## Publish the composed-site POC to Cloudflare

`npm run deploy:subpath` builds the composed scenario (homepage + `/garden/` Knowledge Collection + `/blog/`) and offers it as a **new, isolated Cloudflare Worker**. It prints the account suffix, Worker name, public URL, and asset count before requiring the exact confirmation `PUBLISH <worker-name>`. It then checks the published home, collection, note pages, blog pages, image, and PDF over their public URLs, including response MIME types and image/PDF signatures.

Run it from this directory in an interactive terminal:

```sh
CF_OAUTH_CLIENT_ID=your-private-client-id npm run deploy:subpath
```

The private OAuth client must allow `memberships.read`, `workers-scripts.read`, and `workers-scripts.write`. Authorization opens in the system browser. If the account has multiple memberships, rerun with `CF_ACCOUNT_ID` set to the intended account ID. `CF_WORKER_NAME` may specify a Worker name; otherwise a unique `bg-garden-poc-*` name is generated. Existing Workers can only be updated when `CF_WORKER_NAME` explicitly names a `bg-garden-poc-*` Worker, and the exact publish confirmation is still required. Other existing names are rejected.

The deployment creates a public site and leaves its Worker in the Cloudflare account after testing. Remove it later from Cloudflare Dashboard if it is no longer needed. If a deployment fails after Worker creation, the runner reports the Worker name because Cloudflare may retain that incomplete resource. This live operation is separate from `npm run verify`, which only checks local build output.

## Deliberate limits

- Only the tiny fixture's `[[note-id]]` and `[[note-id|label]]` syntax is parsed.
- No production publication, privacy, excluded-link, missing-file, or outside-root policy is defined.
- No interactive graph visualization or search is implemented.
- No Amade schema, BlogGenius flow, or production template is changed.
