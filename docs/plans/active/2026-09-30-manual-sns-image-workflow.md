# Manual SNS Image Workflow

- Branch: `codex/manual-sns-image-workflow`
- Start date: 2026-09-30
- Base/parent branch: `dev`
- Status: Implementation complete; awaiting user review

## User need and goal

Make preparing an image for a manual SNS post feel consistent with BlogGenius card-news and
manuscript image workflows. The first slice is intentionally simple and does not assume that users
will attach multiple images.

## Agreed scope

- Remove direct image-URL entry from the manual SNS composer.
- Use one-image-first image selection with drag/drop, a visible add/select affordance, preview, and
  remove action, following established image UI patterns.
- Allow an optional image-generation instruction.
- Generate an image using the SNS post text together with the user's optional instruction.
- Reuse existing image generation and media transport capabilities where possible.
- Keep supported media formats and channel-specific constraints explicit and validated.

## Non-goals

- Video selection or generation.
- Multi-image style-consistency controls, reference-image workflows, or carousel authoring.
- Changing Buffer delivery semantics: Buffer still receives publicly accessible media URLs, while
  the UI should not require users to enter such URLs.
- Publishing tests that contact real Buffer accounts or paid AI providers.

## Proposed design and stages

1. Trace the current SNS composer, local media upload, Buffer payload, and existing image-generation
   contracts; identify supported formats and channel rules.
2. Replace user-entered URL mode with a single-image-first drop/pick/preview/remove surface.
3. Add an optional image instruction and a generation action that combines it with current SNS text,
   then adds the generated image to the same local-image state used by publishing.
4. Add focused UI, API, and service tests plus browser regression coverage; leave real generation and
   publishing to manual user validation.

## Decisions and tradeoffs

- The user-facing URL option is removed, but public URL transport remains an internal Buffer
  requirement. Existing local-file upload infrastructure supplies that URL.
- Start with simple single-image interaction. Existing multi-image plumbing may remain internally
  where needed, but the UI should not foreground carousel workflows.
- GIF support varies across social networks; validate based on selected channels or provide a clear
  pre-publish explanation rather than silently treating every format as universal.
- Video is deferred.

## Progress and verification

- Repository inspection found the manual composer already supports local multi-file selection,
  ordering, preview and removal; local files are uploaded to temporary public media storage before
  Buffer receives image URLs.
- Current accepted formats are PNG, JPG/JPEG, WebP and GIF, each up to 10 MB; the server also checks
  aggregate payload size and per-channel asset counts.
- Buffer's official API documentation says assets must be publicly reachable URLs and there is no
  direct file upload endpoint. Buffer help documents GIF as channel-specific, unlike JPG/PNG/WebP.
- The manual composer now uses a local-image-only UI with an optional visual instruction and an AI
  generation action. After user review, the image composer was refined to use compact image tiles:
  AI creation and local `+` selection live at the bottom of a larger empty tile. Its empty state
  reuses the manuscript editor's wave-pattern image placeholder without helper copy or a separate
  help icon. Choosing AI replaces the footer controls with weighted `생성` and `취소` actions and
  replaces the preview artwork with a larger optional request editor. The request placeholder
  demonstrates both scene content and visual style. In the default state, the wave pattern is
  raised and given more contrast; in request-editing state, both icon and waves are hidden behind
  the editor. The preview tile and request editor backgrounds are transparent to avoid a solid
  color block, and the action buttons use a shared fixed height across both states. Tile dimensions
  remain fixed. Generated output joins the same ordered local-image collection as picker/drop
  files; the user-facing image URL control is removed.
- The SNS text model remains separate from the configured image model. Generation combines the
  current post text and optional visual request, reports the image model, prevents duplicate runs,
  and preserves existing images if generation fails.
- GIF is rejected before upload when any selected channel is outside the documented supported
  channel set. Other supported formats remain PNG, JPG/JPEG and WebP.
- Focused service/design-contract tests passed: 40 tests, 0 failures. `git diff --check` passed.
- The browser smoke exercised the SNS image picker/reorder/remove and mocked image-generation flow
  successfully and completed: 487 fixture requests and 4 expected blocked external requests. An
  earlier run exposed and led to fixing a generation-state guard that was preventing the generated
  file from entering the image collection.
- The latest request-editor layout and raised wave treatment passed all 40 focused SNS service and
  design-contract tests, the full UI browser smoke, and `git diff --check`.
- The follow-up visual correction removing solid preview/editor fills and normalizing button heights
  passed the SNS design-contract test and `git diff --check`; the browser smoke was not rerun for
  this CSS-only correction.
- SNS image generation now runs as a cancellable operation using the shared AI operation manager.
  The prompt tile follows the established two-step `중지` → `중지 확인` flow, with `계속 진행`
  available during confirmation. If an external image job may already have been accepted, the UI
  warns that it can finish and incur cost even after the local operation is stopped. The service
  test verifies cancellation signal propagation, cost-risk reporting, and duplicate-operation
  prevention; route contract coverage verifies distinct start/status/stop paths.
- User reported that the two-button stop-confirmation state appeared briefly, then reverted to
  `중지`. Polling now preserves the confirmation state while the operation remains cancellable and
  clears it only when cancellation is no longer possible or already requested. Browser smoke waits
  across multiple status polls before asserting that `중지 확인` and `계속 진행` remain visible.
- The manual SNS in-progress tile follows the established Card News visual treatment with a blurred
  translucent overlay, shared spinning accent indicator, and `이미지 만드는 중…` status. The
  `중지` / `중지 확인` / `계속 진행` actions stay in the tile's persistent bottom action row, in
  the same position as `AI 이미지 만들기` and `+`; the overlay contains status only. Browser smoke
  asserts the spinner, message, persistent footer, and confirmation actions.
- Focused SNS service, AI-service, route, and design-contract checks pass (42 tests),
  `git diff --check` passes, and the full UI browser smoke passes (485 fixture requests; 4 expected
  blocked external requests). The smoke also verifies the confirmation persists across status polls.
- AI-generated SNS images now retain their optional per-image instruction in memory. `AI 재생성`
  restores that instruction, while generation uses the post body as it exists at request time. If the
  body is empty, the user sees a clear prompt and generation stays disabled until text is entered.
  Regeneration replaces only its target image after success; cancel/failure leaves the original
  asset intact. Every image offers `받기` using its local object URL, without requiring server-side
  archival. Browser smoke verifies request restoration, empty-body protection, current-body usage,
  replacement, and the download filename.
- Follow-up UI refinement gives populated image cards and the empty add tile the same grid width.
  AI-generated cards omit the redundant filename caption while local-file cards retain it; both
  continue to expose the `받기` action. The browser smoke checks equal rendered widths and confirms
  generated output has no filename caption.
- Latest focused SNS service/AI/design-contract tests pass (41 tests), the full UI browser smoke
  passes (485 fixture requests; 4 expected blocked external requests), and `git diff --check` passes.
- Manual validation: create an image from SNS content with and without an extra instruction, add a
  local image by picker and drag/drop, remove it, and verify publish readiness without entering URLs.

## Final handoff

Implemented on `codex/manual-sns-image-workflow`; changes are uncommitted. No live AI generation,
Buffer publishing, commit, or merge was performed. User review should cover image generation,
local file handling, GIF/channel validation, and the normal SNS publish flow with an approved test
account.
