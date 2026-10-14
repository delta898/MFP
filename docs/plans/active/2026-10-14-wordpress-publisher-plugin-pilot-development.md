# WordPress Publisher Plugin Pilot

- Branch: `codex/feat/wordpress-publisher-plugin-pilot`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`eaec0151`)
- Status: implementation and focused verification complete; user authorized parent merge

## User need and goal

BlogGenius is building its new Platform Kernel → Application → Plugin structure beside the current product implementation. This sub-feature uses WordPress publishing as the first real Plugin candidate and tests whether the foundation can support a meaningful provider integration without importing BlogGenius-private modules.

The goal is a testable WordPress Plugin contract and implementation connected to the new Kernel/Application example. This stage does not claim that the existing product publishing flow has been migrated.

## Approved scope

- Trace current WordPress publishing call paths and observable behavior, including manual/quick-post and scheduled or batch callers where applicable.
- Separate product workflow responsibilities from WordPress REST API responsibilities.
- Define a public Plugin interface and scoped configuration/credential injection. Do not place credential values in operation request data or logs.
- Implement a bundled Core Plugin under `packages/plugins/core/wordpress-publisher/` with no imports from BlogGenius-private modules.
- Add mocked HTTP contract tests and Kernel/Application composition tests. No live WordPress account or post is used.
- Record how existing image transformation, reusable asset caching, category handling, status fallback, and publication results map across the new boundaries. Preserve existing product behavior unless a change is explicitly discussed and approved.
- Update canonical architecture documentation if the pilot establishes a stable contract, and update the parent FBR record with the result.

## Explicit non-goals

- Wiring the new Plugin into current UI, manual, scheduled, batch, Telegram, or MCP product entrypoints.
- Publishing to a real WordPress site or calling paid/external services in tests.
- Migrating Naver, text/image generation, SNS, card-news, Site Hosting, or other workflows.
- Installing/removing plugins at runtime, implementing Community Plugin trust/isolation, or publishing a package/repository.
- Changing release version, committing, merging, pushing, or tagging without a separate user request.

## Initial design direction

- Kernel owns registration, descriptor/operation validation, dispatch, and plugin enable/disable lifecycle.
- Application owns BlogGenius use-case sequencing and conversion from product content/artifacts to a destination request.
- WordPress Plugin owns WordPress REST authentication and WordPress-specific media, category, and post API behavior.
- Plugin implementation must not import `src/core.js`, `src/wordpress-client.js`, or other private BlogGenius modules. Reuse behavior only after it has been expressed through the plugin's own public contract.
- Any configuration/credential port introduced by this pilot must be explicit, injected at composition, and keep secrets out of operation payloads and logs.
- The existing `src/plugins/core-host.js` and product publishing path remain unchanged during this stage.

## Investigation and implementation stages

1. Trace callers, input artifacts, side effects, persistent configuration, and failure behavior of current WordPress publishing. **Complete:** all current product callers still use `Core.publishToWordPress()`.
2. Decide which responsibilities belong to Application versus WordPress Plugin. **Complete:** REST protocol/auth stays in the Plugin; content/image preparation, category/status policy, and results stay in the Application.
3. Define the package entrypoint, operations, contracts, injected credentials, error/result semantics, and dependency rules. **Implemented:** three operations, injected credentials/fetch, no BlogGenius-private imports.
4. Implement the package and a small Application/Kernel composition example using fake HTTP responses. **Implemented.**
5. Add focused tests for request mapping, auth/config boundaries, malformed inputs, API failures, and composition. **12 focused tests pass.** No product UI or invocation path changed, so UI/browser tests do not apply.
6. Finish documentation and review the complete branch diff against the parent before merge. **Complete:** focused tests and package dry-run pass; the missing scheduled-date validation found during review is covered by regression assertions.

## Decisions and tradeoffs

- 2026-10-14: The user approved a WordPress Plugin pilot as the next sub-feature under `codex/fbr/plugin-architecture-foundation`.
- 2026-10-14: The user selected plugin package version `0.1.0`; this is separate from the BlogGenius app version.
- 2026-10-14: The existing `publishToWordPress()` function must not be moved wholesale: it currently mixes manuscript parsing, image processing/caching, category/status policy, and remote API behavior.
- 2026-10-14: This stage validates a reusable Plugin boundary and tests without a real WordPress account. Existing product routes remain on their current runtime until a later migration stage.
- 2026-10-14: Product callers mapped: `publish-actions-runtime.js` handles manual and quick-preview confirmation plus batch publish, while `content-actions-runtime.js` handles content batch publish. They all invoke `Core.publishToWordPress()`; this stage changes none of these call sites.
- 2026-10-14: Responsibilities were fixed: REST auth/media/category/post calls belong to the WordPress Plugin; manuscript normalization, image preparation, permanent image reuse, category policy, warning/status fallback, and product result lifecycle belong to the Application or shared capability. The pilot Application handles normalized prepared inputs, not current BlogGenius manuscript parsing.
- 2026-10-14: Implemented the Plugin package, Application, composition root, and mocked HTTP/composition tests. Initial focused run exposed test expectation mismatches (credential resolution occurs once per operation; parsers throw synchronously); these were corrected. Focused suite passes 14 tests; `npm pack --dry-run` and isolated offline tarball installation/load both pass.
- The new Plugin declares three provider operations (`media.upload`, `categories.list`, `posts.create`). The Application composes them while retaining publication policy.
- The Plugin resolves `{ url, userId, appPassword }` through injected `getCredentials()` for each operation. Credential values never enter operation input, and the package emits no logs. The descriptor version comes from the package manifest and is independent of the BlogGenius app version.
- The Application receives HTML content and prepared image `Buffer`s using `{{asset:key}}` references. It owns category matching, image warning aggregation, fallback-to-draft policy, schedule mapping (`schedule` to WordPress `future`), featured-image selection, and result assembly.
- Image optimization and permanent FTC/CTA URL caching depend on current `ImageService`, local files, and `CONFIG`; they remain on the legacy path and are not duplicated inside the standalone Plugin.
- The package has a minimal `package.json` and public README, but this stage does not publish it or claim a stable external SDK/version compatibility guarantee.

## Verification plan

- Focused `node --test` contract tests for the new package, host dispatch, and Application composition.
- `git diff --check`.
- Focused package, Application, and Kernel tests; package dry-run; `git diff --check`.
- No full unit suite without explicit user approval. No real network calls, credentials, or publishing in automated tests.
- No UI/browser smoke unless the approved scope changes to include product invocation paths.

## Progress and remaining risks

- Branch created from parent commit `eaec0151`.
- The pilot package, Application, composition root, package README/manifest, and mock tests are implemented. The product call paths remain unchanged.
- Focused verification: 14 tests pass across the Plugin, Application, and Kernel; package dry-run includes the public manifest, README, and entrypoint. The full unit suite was not run. No UI/browser smoke applies because product entrypoints remain unchanged.
- Remaining risks: compare full legacy behavior and error cases; consider pagination for category lists beyond 100 items; design a product adapter for manuscript image blocks, optimized files, permanent URL caching, config storage, and product notifications. This stage intentionally does not change product invocation paths.
