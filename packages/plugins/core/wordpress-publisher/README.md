# WordPress Publisher Core Plugin

An in-process WordPress REST API adapter packaged separately from BlogGenius private modules. It exposes an operation implementation that the BlogGenius Plugin Host binds to the package manifest. It does not perform manuscript parsing, image conversion, caching, or publication policy.

## Public interface

```js
const { createPlugin } = require('./index');
const packageMetadata = require('./package.json');
const { createPluginHost } = require('../../../../src/platform/plugin-host');

const plugin = createPlugin({
  // Resolve credentials from the host's protected configuration store.
  // Values are never included in operation input or returned/logged by this package.
  getCredentials: async () => ({ url, userId, appPassword }),
  fetch: globalThis.fetch // optional; inject a compatible fetch implementation in tests
});

const pluginHost = createPluginHost({ plugins: [{
  manifest: packageMetadata.bloggeniusPlugin,
  version: packageMetadata.version,
  operations: plugin.operations
}] });
```

The package version (`0.1.0`) is the Plugin version source. The `bloggeniusPlugin` field in `package.json` is the source of truth for identity, Host API compatibility, operation descriptions, JSON Schema 2020-12 inputs/outputs, and requested capabilities. The Host validates those schemas before calling operation code and again before returning results. The descriptor id is `wordpress-publisher` and it declares:

- `media.upload`: accepts `{ bytesBase64, filename, mimeType, altText? }` with an `image/*` MIME type; returns `{ id, url }`. Binary input crosses the JSON Plugin contract as base64 and is decoded only inside the WordPress adapter.
- `categories.list`: accepts `{ search? }`; returns category `{ id, name, slug }` records.
- `posts.create`: accepts `{ title, content, status, categories, featuredMedia?, date? }`; returns `{ id, url }`. `status` uses WordPress REST values (`draft`, `publish`, `future`, `pending`, `private`); category IDs must be numeric.

Credentials are resolved for each operation, so the host controls storage and rotation. The package uses the injected `fetch` and Node's built-in `FormData`, `Blob`, and `Buffer`; it has no BlogGenius-private or third-party package dependency. It makes HTTPS or HTTP WordPress REST requests, uses WordPress Application Password Basic authentication, and does not log credential-bearing request data. Errors are thrown with a stable `code` and optional HTTP `status`; server response bodies are not copied into error messages.

The Plugin honors the Kernel-provided `AbortSignal`. An aborted operation throws with `code: "ABORTED"`; the Application stops instead of turning cancellation into a warning and creating a post. Operation implementation modules export `execute` functions only; validation and public operation descriptions come from the manifest and Host.

This pilot package is not yet a semver-governed external SDK or a community-plugin security sandbox. Its version is local package metadata and is not the BlogGenius app version.
