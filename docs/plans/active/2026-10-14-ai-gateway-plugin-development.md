# AI Gateway Core Plugin Development

- Branch: `codex/feat/ai-gateway-plugin`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`9a85789b`)
- Status: AI Gateway and Blog, Card News, and SNS integrations complete; ready for merge into `codex/fbr/plugin-architecture-foundation`; Site Hosting image policy remains future work

## User need and goal

Replace the thin `content-generator` pilot as the AI integration boundary with one reusable, provider-neutral AI Gateway Core Plugin. The Plugin runs in-process under the BlogGenius Plugin Host contract. BlogGenius remains the product Platform and owns model selection/catalog policy, configured credentials, workflow, and cancellation lifecycle. The Gateway owns supported-route discovery and provider transport normalization for text and image generation.

## Scope

- Inspect current AI transport/model policy, product Model Catalog, Content Generator, image-generation paths, and KIE async job implementation.
- Implement a standalone Gateway module/package behind the shared manifest-based Core Plugin contract.
- Expose a provider/model-neutral support manifest and operation contracts for text and image generation.
- Keep the application Model Catalog and Gateway support inventory separate; composition/application code resolves the intersection and chooses a usable route.
- Keep provider API keys out of Plugin operation input and execution context. Resolve credentials through a narrow Host-owned transport/credential boundary; provider adapter code may only receive what it needs to make the request.
- Support cancellation using the existing Host `AbortSignal`; support Host-mediated progress events for asynchronous generation and KIE job polling.
- Preserve KIE asynchronous submission, bounded status polling, result download behavior, and safe error normalization.
- Migrate Content Generator consumers and relevant image-generation consumers to the Gateway operation boundary where their current contracts can be composed without changing product behavior.
- Add focused contract and adapter tests with fake providers/transports; do not make paid provider calls.
- Keep architecture and feature development records current.

## Explicit non-goals

- Remote REST service or a separately deployed gateway server.
- Arbitrary provider URLs or user-supplied transport code. The explicitly configured OpenAI-compatible “direct input” profile is handled through the bounded Host transport described below.
- Moving BlogGenius prompts, business workflows, quotas, or model selection policy into the reusable Gateway module.
- Reworking unrelated AI UI, product catalog release workflows, or model verification UX unless required to connect the agreed Gateway boundary.
- Community Plugin scanning, loading, approval, or process isolation.
- Version bumps, pushes, or releases without a separate user instruction. Commits and the stacked parent merges are authorized by the user's current `[cmd]` request.

## Design decisions carried forward

- One Gateway Plugin handles multiple providers and both text and image generation; do not create one Plugin per provider.
- Model identity is `{ provider, modelId }`; `connectionRef` is excluded from v1. BlogGenius selects configured credentials without passing API keys in operation payloads.
- BlogGenius Model Catalog describes product-approved/selectable models. Gateway support discovery describes routes and semantic features it can execute. Applications compare the two and select a compatible combination.
- Image generation defaults to one image, with support-discovered per-route maximum count and byte-size limits.
- Generation submissions are not automatically retried. Bounded safe retries may cover polling/status reads and result downloads.
- KIE image generation is asynchronous. The Plugin Host supports cancellation via `AbortSignal`; progress is reported through an optional validated Host callback, not in JSON input/output.
- Stable normalized `AI_GATEWAY_*` error codes expose retryability and optional provider request IDs while omitting prompts, credentials, and raw provider response bodies.
- JSON response mode is available only on routes that advertise it; Application owns business-schema validation. Constrained JSON Schema output is outside v1.
- Advanced users may use a configured OpenAI-compatible direct profile. Catalog identity and endpoint configuration remain Host-owned; the Gateway receives only `{ provider: 'direct', modelId }`, with fixed compatible operation paths and Host-side endpoint/key validation.

## Implementation stages

1. Map current text/image call paths and identify the narrowest adapters that can be reused without importing BlogGenius private modules into the Gateway package.
2. Implement Gateway package types/normalizers, support inventory, errors, provider transport adapters, and text/image executors.
3. Complete the common Plugin Host progress-reporting contract needed for async jobs, preserving cancellation and disable/drain semantics.
4. Add the Gateway manifest and register it as a Core Plugin; retire or reduce the old Content Generator wrapper once all scoped callers use Gateway.
5. Resolve Model Catalog × Gateway support in Application composition, then migrate scoped text/image consumers.
6. Run focused contract/provider/Application tests with fakes; review the complete diff and update canonical architecture docs.

## Affected boundaries

- `packages/plugins/core/` for the provider-neutral package and bundled Core manifest.
- `src/platform/` and Core composition only for Host progress support and Plugin registration.
- `src/ai/` and existing AI transport adapters as BlogGenius-owned adapters/configuration.
- `src/applications/` and composition roots for route resolution and workflow integration.
- Existing image-generation callers only where required to route through the new Gateway.
- `docs/architecture/`, `docs/features/`, and this development record.

## Implementation progress

- Added `packages/plugins/core/ai-gateway/` as a manifest-backed Core Plugin with `text.generate`, `image.generate`, a separate immutable support inventory, provider request/response normalization, stable sanitized errors, KIE asynchronous job polling, bounded safe retries, and normalized progress events.
- Added `src/adapters/ai/gateway-transport.js` as a BlogGenius-owned Host transport. It reads credentials from Host configuration, applies provider authentication internally, restricts provider hosts and operation paths, and keeps keys out of Gateway inputs/results/errors. Provider endpoints and raw headers are not Plugin inputs.
- Added Catalog × Gateway route intersection in `src/applications/blog/writing/gateway-model-resolver.js`; the Blog Writing Application receives only `{ provider, modelId }` after resolution.
- Added optional progress reporting to Plugin Host context with Host-bound plugin/operation IDs and phase/value validation. Cancellation continues through the existing `AbortSignal` path.
- Registered AI Gateway as a Core Plugin in place of the thin Content Generator pilot. Migrated Blog Beta AI manuscript text generation for all image modes, every requested image generation in that same flow, manual manuscript image generation, and the generated WordPress pilot to Gateway operations. The combined manuscript path no longer falls back to Core when image generation is enabled. Added Gateway package files to the packaged application inputs.
- Added truthful per-operation logs for the selected text/image model (display name, provider, model ID, and transport), call duration, image block index, progress phase, result MIME/byte count, partial image failures, and final generated/prompt-only counts. Logs do not include prompts or credentials.
- Completed the Blog Beta WordPress manuscript path for image-bearing drafts: the manuscript runtime maps `[[IMAGE_N]]` blocks to prepared local image bytes, preserves the source MIME/extension, and passes keyed assets to the WordPress Publishing Application. The Application's existing `media.upload` operation uploads each asset, replaces the content reference with the returned media URL, and uses the first asset as the featured image.
- Removed the text-only gates from both the manuscript service and publication runtime while retaining the guard for unresolved image prompts. WordPress manuscript uploads now expose the existing cancellation signal during publication; stop status copy reflects that already-uploaded media cannot be rolled back.
- Added `src/applications/blog/publishing/application.js` as the BlogGenius publication coordinator for Naver and WordPress image preparation, with explicit target policy (Naver → WebP, WordPress → AVIF). It routes both legacy publishers and the WordPress Plugin publication path through the same preparation rules.
- Added `src/utilities/media/image-optimization-service.js` as the generic buffer conversion service. The WordPress Plugin still receives prepared bytes and MIME types and owns no conversion behavior. Disabled, unavailable, and failed conversion preserves the source bytes/MIME; converted legacy assets are written as sibling files so source images remain intact.
- Site Hosting remains outside this implementation. No WebP policy or conversion behavior was added to its publishing path; it can be considered in a later stage.
- Added the canonical [AI Gateway architecture document](../../architecture/ai-gateway-plugin.md) and updated the Plugin architecture overview.
- Migrated Card News text/image generation and SNS hashtag, manual optimization, and image generation through the shared AI Generation service in stacked sub-features. Other AI entrypoints, including shopping, continuous publishing, and legacy Naver publishing, remain follow-up migration work.
- Extended the Host-owned transport for the advanced-user direct OpenAI-compatible profile. Endpoint and optional key remain in Host configuration; fixed paths, HTTPS/private-local validation, redirects, bounded diagnostics, and prompt/key redaction are enforced before data reaches logs.

## Verification completed

- Focused fake-based run passed 89 tests across Gateway package/transport, Plugin Host, Core registry, Blog Writing and generated WordPress Applications, manuscript image workflows, Blog Beta execution, WordPress publishing, and packaged-plugin inputs. Coverage includes text and multi-image manuscript generation through the Gateway Application, no Core fallback, operation cancellation, detailed model/operation logs, and queue reuse of the same integration path.
- After the WordPress image-publication changes, focused tests passed 62 tests across the WordPress Plugin, WordPress Application, Blog Beta runtime, manuscript service, and execution coordinator. Coverage includes original image bytes/MIME reaching the Application, `[[IMAGE_N]]` replacement with an asset reference, featured-image selection, cancellation availability, and existing media-upload warning behavior.
- Final focused run passed 95 tests across image optimization, Blog Publishing, WordPress publication, Blog Beta manuscript execution, cancellation, and publishing runtime paths. Coverage includes target mapping, MIME/filename updates, source preservation, legacy publisher wiring, and WordPress Plugin asset preparation. `node --check` passed for changed runtime modules and `git diff --check` passed.
- No paid provider calls were made. Tests that load environment-dependent application modules were run with `BLOGGENIUS_ENV=local`.
- `node --check` passed for the changed runtime modules before the focused test run.
- Earlier focused runs without `BLOGGENIUS_ENV=local` failed during test module initialization because `config-loader` requires an explicit environment; the same tests passed when run with the required environment.
- Stacked Card News and SNS verification passed 142 tests with `BLOGGENIUS_ENV=local`; Gateway, Host, Blog/WordPress, manuscript, and image-policy verification passed 153 tests with the same environment. The four stale full-suite test failures were updated and pass in focused verification.
- The earlier user-requested direct full-suite run reported 2,350 tests (2,345 passed, 1 skipped, 4 stale contract failures). Those four failures now pass in focused verification; the full suite has not been rerun. `npm run test:unit` remains blocked before unit execution by `npm audit --audit-level=high` reporting 9 advisories (3 high, 2 moderate, 4 low).

## Remaining risks and follow-up

- Other AI entrypoints, including shopping, continuous publishing, and legacy Naver publishing, still call `Utils`/`Core`; migrate them in separately reviewable slices after matching their prompt, retry, asset, and cancellation behavior against Gateway operations.
- Site Hosting does not yet optimize images. Decide whether and how it should adopt WebP in a later publication-policy stage.
- Inline base64 is intentionally capped at 10 MiB per image; large or multiple-image workflows may eventually need a shared Host asset-reference contract.
- KIE cancellation stops local work but cannot guarantee remote cancellation/refund. Submission cancellation can leave the provider outcome unknown.
- The in-process Core Plugin boundary trusts bundled code and is not isolation against hostile Plugins; community loading remains deferred.
- The Card News and SNS sub-features were fast-forward merged into this branch and their feature branches deleted. This branch is ready to fast-forward into `codex/fbr/plugin-architecture-foundation`; no push or release has been performed.

## Verification and handoff

- Focused unit/contract coverage for manifest discovery, route intersection, text requests, KIE async lifecycle, cancellation, progress validation, normalized errors, and image output.
- Use fake fetch/transports and clocks/sleepers; no paid AI calls or production network traffic.
- Run the full unit suite only with explicit user approval before the parent feature is merged to `dev`.
- Before parent merge: focused tests and complete code review against `codex/fbr/plugin-architecture-foundation`; full suite remains the required gate for a later parent-to-`dev` merge.
- Final report includes implementation boundaries, focused verification, any manual UI flows, and commit/merge state.

## Directory architecture follow-up (2026-10-15)

- Grouped Blog Applications under `src/applications/blog/` with writing, publishing, and composed workflow subdirectories; moved the shared image conversion service under `src/utilities/media/`, the Host-owned AI transport to `src/adapters/ai/`, and the Catalog/support resolver into the Blog Writing Application.
- Updated imports and the packaged source manifest for the new architecture-layer paths.
- Recorded the mandatory layer and placement rules in `AGENTS.md`, the canonical Plugin architecture document, and the source-directory decision record.

- Extracted the Blog Beta Plugin and Application wiring from `ui-server.js` into `src/composition/blog-beta-runtime.js`; the existing UI server now supplies dependencies and receives the composed runtime.


## Cross-Application Service and Plugin Adapter follow-up (2026-10-15)

- Added `src/services/ai/generation.js` as a reusable provider-neutral service port. It intersects the BlogGenius Model Catalog with Gateway routes, checks supported model features, validates selections, and delegates text/image generation without exposing Plugin IDs to product Applications.
- Added `src/adapters/plugins/ai-gateway.js` and `wordpress-publisher.js` as the concrete operation translation boundary; `src/composition/ai-generation.js` and the existing publishing compositions inject those adapters into their Application/service ports.
- Blog Beta composition now registers the two Plugins separately. The WordPress publishing Application and Blog Publishing Application call one another through an injected Application port; the Blog Writing Application calls only the shared AI service. Provider credentials continue to be read inside Host-owned Plugin dependencies/transport.
- UI/API generation logs identify AI operation, selected model, provider, transport, elapsed time, progress, and image output without binding user-facing logs or manuscript metadata to a Plugin ID. Manuscript image actions use the shared generation service and unwrap its normalized image result.
- Added focused adapter and AI service contract tests; updated writing, generated WordPress, Blog runtime, and publishing tests to the port-based wiring.
- At the time of this boundary follow-up, Card News, SNS, shopping, legacy Naver publishing, and full business workflow extraction remained separate migration work. Card News and SNS have since been migrated in stacked sub-features; shopping, continuous publishing, and legacy Naver publishing remain follow-up work.
- Verification for this boundary follow-up: `BLOGGENIUS_ENV=local node --test` over Plugin adapters, AI service, Blog/WordPress compositions and Applications, manuscript generation/cancellation, Plugin-backed image publication, and Plugin Host contracts passed 74 tests. Runtime files passed `node -c`; `git diff --check` passed. No live AI or WordPress calls were made.
