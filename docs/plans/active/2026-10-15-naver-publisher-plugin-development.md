# Naver Publisher Plugin Development

- Branch: `codex/feat/naver-publisher-plugin`
- Start date: 2026-10-15
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: implementation in progress; legacy editor behavior parity and live verification pending

## User need and goal

Finish the Blog publishing path by extracting Naver publishing into a bundled Core Plugin at the same implementation level as `wordpress-publisher`. Blog Application workflows should select a publication target through an Application-owned boundary and must not call a concrete Plugin or Plugin Host directly.

## Scope

- Define a standalone Naver Publisher package and its manifest operations.
- Add the Plugin adapter and composition wiring.
- Route Blog Beta's existing Naver publication paths through the Blog Publishing Application and Naver Publisher Plugin.
- Preserve current Naver behavior: image upload and WebP preparation, draft/publish/schedule behavior, category selection, affiliate/CTA links, progress reporting, cancellation, and result reporting.
- Add focused fake-based tests and update architecture/development documentation.

## Non-goals

- Migrate Shopping or other non-Blog Naver publication paths in this feature.
- Change Blog UI, Naver account/login UX, or publication policy.
- Run real publishing or other production/external side effects in automated tests.
- Implement Community Plugin installation, sandboxing, or distribution.
- Commit, merge, push, or release without an explicit request.

## Current implementation findings

- `src/applications/blog/publishing/application.js` is the Blog publishing boundary. It owns Naver WebP preparation but currently forwards `publishNaver()` to `Core.publishToBlog()`.
- `src/core.js#publishToBlog()` parses the prepared Markdown directory and performs the Naver browser-editor workflow: login-session loading, title/body formatting, image upload, category and representative image handling, draft/publish/schedule interactions, cancellation, progress, and result capture.
- `src/composition/blog-beta-runtime.js` currently injects `Core` into the Blog Publishing Application. WordPress is already wired through a publisher adapter and the Plugin Host.
- Blog runtime call sites in `src/ui-runtime/publish-actions-runtime.js` and `src/ui-runtime/content-actions-runtime.js` call the Application's `publishNaver()` seam, so keeping that seam should avoid teaching those callers about Plugin IDs.
- Shopping calls `ShoppingManager` and is explicitly outside this migration.
- Existing Core Plugin packages are `ai-gateway`, `wordpress-publisher`, and `hello-world`. Product-facing AI and WordPress paths use service/application ports and Plugin adapters; Hello World remains a reference-only direct Host example.

## Proposed contract for stage 1 review

```text
Blog UI/runtime caller
  -> Blog Publishing Application
      -> Naver publisher port
          -> Naver Plugin adapter
              -> Plugin Host
                  -> naver-publisher Core Plugin
```

- The Blog Publishing Application remains target-agnostic at call sites and owns Markdown/artifact preparation plus target format policy. It calls an injected Naver publisher port, not `Core.publishToBlog()` or a Plugin ID.
- The Naver adapter translates a provider-neutral publication request into the Naver Plugin operation contract.
- The Plugin owns Naver editor automation and Naver-specific UI interactions. It must not import BlogGenius-private Application or Core modules.
- Composition selects/registers `naver-publisher`, injects the adapter and host-managed dependencies, and wires the Application.
- Naver login session storage and browser launch policy remain Host-owned dependencies. Session material/path must not be placed in manifest operation input or logs. The Plugin receives only the narrow browser/session capability required to perform the operation.
- Proposed operation: one `posts.publish` operation for the current user-visible publish workflow, including safe draft save and optional publish/schedule finalization. Avoid exposing low-level editor button operations to Applications.
- Proposed input: JSON-only `{ title, blocks, assets, category, status, scheduleDate?, affiliateUrl? }`. `blocks` are normalized typed content (paragraph, heading, quote, list item, separator, image reference); image blocks refer to `assetKey`. Each asset carries key, filename, MIME type, alt text, and base64 bytes. The Blog Application parses the Blog manuscript and maps it to this contract; the Plugin does not receive a filesystem path or BlogGenius directory.
- Proposed output: `{ status, postUrl?, warnings[] }`, preserving Naver's actual final status (including automatic draft fallback) and current optional URL capture behavior. Operation errors use stable Plugin codes; user-facing language is composed above the Plugin boundary.
- Authentication/browser port: inject a Host-owned `createAuthenticatedNaverSession({ headless, signal })` dependency into `createPlugin()`, returning a narrow Playwright-compatible page/session handle and `close()`. The Host resolves the existing Naver session state and browser policy internally; the Plugin receives neither the auth file path nor session JSON as operation input. A separate injected settings reader supplies the configured editor URL, typing preset, and waits. No secrets or session material are logged.
- Execution context carries the Host `AbortSignal`. The plugin closes the browser session on cancellation and reports an abort error; it cannot reverse a save or publication already accepted by Naver.
- **Host progress contract gap:** `src/platform/plugin-host.js` currently accepts only AI-shaped phases (`submitted`, `waiting`, `generating`, `downloading`) and `{ phase, progress }`. Naver needs stages such as editor, body, image, settings, and publishing. Do not mislabel these as AI phases. Stage 1 should add a generic, schema-validated progress payload (proposed `{ phase: 'preparing'|'working'|'uploading'|'finalizing', progress?, detail? }`) and translate that through the Naver adapter into the existing Blog progress callback. Reuse it for future publishing plugins.
- The operation contract remains in-process and JSON Schema validated by Plugin Host. Base64 assets match the current WordPress Plugin binary boundary, but payload bounds and large-image memory overhead must be accounted for in schema/application validation.

## Stages

1. **Design contract (complete):** verify call sites and current behavior, define operation input/output, auth/browser dependency, cancellation/progress, and target routing.
2. **Plugin package:** implement manifest and standalone Naver browser publisher with injected Host dependencies; test with fake browser/page/session providers.
3. **Adapter and composition:** add the Naver adapter, Core registry entry, Host registration, and Blog composition wiring.
4. **Application integration:** replace the `Core.publishToBlog()` delegation with the Application-owned Naver port while preserving image conversion and all current Blog entry paths.
5. **Verification and handoff:** focused contract/unit tests, code review against parent before any requested merge, and manual Naver draft/publish/schedule/cancel checks by the user. Automated tests must not publish to a real account.

## Decisions

- Agreed: Naver Publisher and WordPress Publisher are peer Plugins; Blog Application owns the common upper flow and routes by publication target.
- Agreed: callers above the Application must not know Plugin IDs or invoke Plugin Host operations.
- Agreed: use structured JSON content blocks and image asset bytes at the Plugin operation boundary rather than exposing a BlogGenius directory path. The operation supports in-memory uploads and avoids temporary-path ownership in the Plugin.
- Agreed and implemented: use shared long-running progress phases (`preparing`, `working`, `uploading`, `finalizing`) with a validated stage and counters.
- Agreed and implemented: inject the authenticated browser session and settings from composition; operation input contains no auth path, session state, or credential.
- Agreed and implemented: pass the requested category name; the Plugin resolves it through the Naver editor UI.
- Agreed and implemented: expose one `posts.publish` operation returning actual status, optional post URL, and warnings. Package version is `0.1.0`.

## Progress and verification

- 2026-10-15: Confirmed the parent branch is clean and created this feature branch from `codex/fbr/plugin-architecture-foundation`.
- 2026-10-15: Read the Plugin architecture, WordPress package/adapter/application/composition, Blog Publishing Application, Naver Core workflow, Blog UI/runtime call sites, and Plugin Host progress validation.
- 2026-10-15: Extended Plugin Host progress events with generic long-running phases (`preparing`, `working`, `uploading`, `finalizing`), a validated stage identifier, and optional current/total counters. Existing AI phases remain supported. Host tests confirm event binding and reject malformed stage/counter values.
- 2026-10-15: Added the standalone `naver-publisher` Core Plugin package and its `posts.publish` manifest contract. It receives an injected authenticated browser session, handles draft/publish/schedule finalization, image upload, cancellation, session cleanup, and staged progress. Added the Naver Host adapter and publishing composition.
- 2026-10-15: Registered Naver publishing in Blog Beta's runtime composition so Settings Plugin discovery reports its Host state and operation list.
- 2026-10-15: Routed Blog Publishing Application's Naver operation through the publisher port. The Application parses manuscript Markdown, converts existing image files to WebP, supplies asset bytes and typed blocks, preserves missing-image source blocks and downgrades those posts to draft, maps cancellation/progress, and returns the existing success/status/result shape. Shopping requests that require an affiliate URL remain on the existing Core route.
- Verification: focused Naver, Blog publishing, WordPress, generated publication, composition, registry, and Plugin Host tests passed (39 tests); `git diff --check` passed. Set `BLOGGENIUS_ENV=local` because this project loads OAuth configuration in the test process.
- 2026-10-15: User's live Naver test found intermittent blank titles, unformatted headings, and a related-link URL left above its preview card. Confirmed the Plugin editor flow had less verification than the legacy `src/core.js` flow. Added verified title input with three attempts and a hard stop before body/publication if the title remains absent; heading/quote format selection now verifies the toolbar state, retries, and returns a warning if recovery still fails; Oglink now waits for loading/confirmation/popup closure and treats a confirmed delayed render as success to avoid duplicate plain-URL input. Added fake-editor tests for retry, failure-stop, delayed preview, and formatting warnings.
- 2026-10-15: User's next live check identified missing legacy heuristics: startup Help/previous-post popups, category selection retry, safe draft finalization, heading selection collapse, and Oglink card centering. Added startup and per-block overlay dismissal, stronger category selection retries/verification, selection collapse before Enter, focused-component Oglink centering retries, and explicit requested/final action logs. Draft flow now verifies the publish settings layer closed before clicking Save and cannot click the final publish button; failure to close safely aborts. Added fake-editor tests for popup dismissal, category selection, draft-only button behavior, and heading selection collapse.
- Verification after parity work: focused Naver Plugin, Blog publishing Application, adapter, and composition tests passed (22 tests); `git diff --check` passed. Live Naver verification remains required for third-party editor selectors, actual draft result, and card alignment.
- 2026-10-15: User reported that the manuscript UI showed `임시 저장` but Naver received `publish`. Traced the mismatch to the manuscript publish boundary: the UI sent only `draftId` and `revision`, while the server rebuilt the payload from settings saved when the draft was created. The Naver Plugin correctly followed the resulting `publish` request. Updated the UI request to include the currently selected `postStatus` and `scheduleDate`; the manuscript service now validates and applies those values to that publication snapshot without mutating the saved manuscript defaults. Unresolved images still enforce the existing draft safety downgrade. Added a regression test through `preparePublishPayload()` and a UI contract assertion.
- Verification: `BLOGGENIUS_ENV=local node --test src/content/manuscript-draft-service.test.js scripts/blog-next-quick-flow-contract.test.js` passed (60 tests). `git diff --check` passed. Browser smoke and live Naver draft validation have not been run in this correction.
- 2026-10-15: User's draft test then showed a subtitle followed immediately by body text with no visual separation. Compared the Plugin against the legacy `src/core.js` heading path. The old flow waits after typing and explicitly collapses the browser's DOM selection to the end after `ArrowRight`; the Plugin instead sent `Escape` and relied on key movement alone. Replaced that with the same DOM Range collapse and legacy timing before `Enter`, preserving the one-Enter boundary used by the existing publisher. Added a Plugin test for a heading followed by a paragraph.
- Verification: Naver Plugin, Blog publishing Application, adapter, and composition tests passed (23 tests); `git diff --check` passed. Live Naver editor validation is still needed to confirm its current toolbar and paragraph-spacing behavior.
- 2026-10-15: User's end-to-end manuscript test confirmed Naver publication now works, but all three generated images failed before provider dispatch with `AI_GATEWAY_UNSUPPORTED_CAPABILITY`. Blog Beta requests 4:3; the Gateway's Google support metadata incorrectly listed only 1:1, 4:5, and 9:16 for Nano Banana 2.1. Verified Google's current official image-generation documentation, corrected Google ratio support by model (including 4:3 for Nano Banana 2.1), and updated Gateway enforcement plus the shared AI Generation capability query to use the per-model table. Added a Gateway transport test confirming 4:3 reaches Gemini and unsupported OpenAI ratios still fail before dispatch.
- Verification: AI Gateway, AI Generation service, Blog Writing Application, and manuscript publish-flow tests passed (37 tests); `git diff --check` passed. No paid image request was made. Re-run the user's Blog Beta generation flow to verify live images.
- 2026-10-15: User clarified the runtime policy: Gateway metadata must not make an unsupported-capability decision for a model. Removed pre-dispatch rejection based on static image ratio/size lists, made shared option discovery return `undefined` for unlisted options, and removed Card News' local aspect-ratio precheck. Provider-native ratio/size options now reach the Provider; where the OpenAI-compatible adapter cannot map an arbitrary ratio to a standard pixel size, it forwards the raw ratio in best-effort form for Provider validation. KIE size values are forwarded instead of suppressed/coerced. Explicit temperature and JSON-format options are also forwarded through compatible text transports so the Provider can accept or reject them; existing Catalog flags can still keep a known-incompatible option out of an Application request. Provider errors continue through the Gateway in stable normalized form, while Card News preserves its existing partial-result/retry behavior. Updated the Gateway README and AI Gateway architecture contract to label option lists advisory and distinguish Gateway execution limits from Provider capabilities.
- Verification: AI Gateway, shared AI Generation service, and Card News generation Application tests passed (16 tests); `git diff --check` passed. No external or paid AI calls were made.

## Final result

Core Plugin routing and focused automated verification are implemented. Blog Beta Settings should show Naver Publisher as a loaded Core Plugin, and standard Blog Naver publication uses its Host operation. Affiliate-required Shopping publication remains on its previous Core path. The Plugin now includes legacy-derived editor cleanup, verified title/format behavior, category retries, safe draft branching, and related-link insertion/alignment. Live Naver editor behavior still needs the user's manual draft, publish, schedule, image, and cancellation checks.

## Remaining risks and follow-up

- Naver editor automation depends on a live third-party UI and may need updates when that UI changes. All migrated popup, title, category, draft, formatting, and Oglink alignment behavior has fake-based coverage only and needs live validation. The manuscript request now carries its selected status to the service; verify a fresh live Naver draft test and confirm the logs say `Publication requested (status=draft)` and `Final action: save draft`. Also verify that a subtitle is visually distinct from its following body paragraph. The corrected Nano Banana 2.1 4:3 capability metadata still needs a live image-generation confirmation from Blog Beta.
- User manual validation is needed for Naver editor behavior; unit tests cannot establish that the current Naver UI selectors still work.
