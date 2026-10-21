# KIE Additional Model Support

- Branch: `codex/kie-additional-model-support`
- Base/parent: `release/v0.7.0`
- Start date: 2026-10-22
- Status: implementation complete; awaiting user-run KIE model checks and catalog application

## User need and goal

Add requested KIE text and image models to BlogGenius, sort KIE text families alphabetically and rank models within a family by the user's specified performance/recency order, and provide independent full catalog SQL snapshots for Development and Production.

## Scope

- Text: Kimi K3, DeepSeek V4.1 Flash, Grok 4.7.
- Image: FLUX 3, Qwen Image 2.1, Grok Imagine Image 2.0, Qwen Image 3.0, Wan 2.7, Z-Image.
- Extend trusted AI Gateway transports and per-model request shaping where KIE documentation requires it.
- Update model catalog order expectations and focused tests.
- Prepare standalone Development and Production catalog insert scripts using the user's selected catalog version.

## Non-goals

- App/package version bump.
- Paid live generation calls or production mutations.
- Publishing the SQL to Supabase, committing, pushing, tagging, or merging.

## Design and boundaries

Model availability and display ordering belong in the Supabase AI model catalog. Provider endpoints, trusted routes, transport behavior, and request payload translation remain in the AI Gateway. KIE image jobs use the existing shared asynchronous job protocol; model-specific image input fields are mapped in the Gateway adapter. KIE text models use fixed trusted endpoints selected by catalog transport identifiers.

## Decisions

- KIE text family order: Claude, DeepSeek, Gemini, GPT, Grok, Kimi. Within each family, highest/newest first.
- KIE image family order: FLUX, GPT Image, Grok Imagine, Nano Banana, Qwen Image, Seedream, Wan, Z-Image. Qwen Image 3.0 precedes 2.1.
- User requires standalone full-catalog SQL snapshots rather than scripts that inherit from prior catalog rows.
- Catalog version selected by the user: `2026-10-22.1`.

## Implementation progress

- Added trusted Gateway transports for KIE OpenAI Responses and Grok Responses.
- Added SSE response normalization for Grok 4.7, including KIE error envelopes returned with HTTP 200.
- Kimi K3 and DeepSeek V4.1 Flash are sent as structured role/content input messages, preserving system and user message boundaries.
- Added model-specific image request construction for all six requested models.
- Marked DeepSeek image input and JSON structured output capabilities, and Kimi/Grok JSON structured output capabilities according to KIE documentation.
- Added focused tests for catalog acceptance, sorting, text request shapes, SSE handling, and image payloads.
- Created standalone full-catalog snapshots for Development and Production using catalog version `2026-10-22.1`; neither has been executed.
- User-run Card News generation exposed unsupported `4:5` ratios for FLUX 3, Grok Imagine Image 2.0, and Qwen Image 3.0. KIE returns these validation failures as HTTP 200 with body `code=500`; the Gateway now preserves the source code/message without mislabeling that body code as HTTP 500.
- Those three models now translate requested `4:5` to the nearest provider ratio `3:4` in their KIE task input. Qwen 3's KIE documentation explicitly lists `3:4` and omits `4:5`; live acceptance of the fallback on FLUX 3 and Grok Imagine remains for the user to verify.

## Related shared Buffer publishing UI follow-up

- User reported that Settings > automatic sharing, Card News publishing, and SNS publishing still had subtly different workspace/channel-picker UI despite earlier partial reuse.
- Consolidated workspace selection, refresh, helper text, select/deselect-all, Buffer Help, platform/account identity, metadata, and channel cards in `ui/scripts/shared/buffer-publishing-picker.js`. Each surface supplies its own data and callbacks, preserving its independent persistence and workflow.
- Settings keeps source blog selection before destination SNS channels. Card News and manual SNS retain their existing workspace/channel storage and publishing behavior.
- Verification: JavaScript syntax checks for the shared picker and three integrations, plus `git diff --check`, passed. No UI/browser tests were run; visual acceptance remains with the user.
- Follow-up: the left-menu SNS page was confirmed to render the shared picker, but a screen-specific CSS rule changed Buffer Help back to a text link and its cached channel normalizer dropped profile avatars. Removed the CSS override, retained avatars in cache, and bumped the cache snapshot version so old snapshots are refreshed.
- Follow-up: reordered Card News publishing so the message appears before channel selection, increased the message editor height, and made the publish button show the selected channel count like manual SNS publishing.
- Follow-up: aligned manual SNS publishing results and footer with the Card News flow (full-width right-aligned action, in-progress status, per-channel result rows). Buffer requests now include required Instagram feed metadata for manual SNS, Card News, and automatic SNS distribution.

## Verification and remaining work

- Focused unit/contract tests for route allowlists, request shaping, response parsing, and model sort order passed (64/64).
- After correcting the reported KIE aspect-ratio rejection and body-level error handling, focused AI Gateway tests passed (33/33).
- Both standalone SQL payloads were structurally checked for version `2026-10-22.1`, their target channels, full-catalog shape, model counts, and family ordering; neither was executed.
- Actual generation against KIE is billable and is left for the user to perform.
- `git diff --check` passed.
- No changes are committed or pushed.

## KIE documentation consulted

- [Kimi K3](https://docs.kie.ai/market/kimi/kimi-k3): `/openai/v1/responses`, `kimi-k3`, and non-streaming JSON mode.
- [DeepSeek V4.1 Flash](https://docs.kie.ai/market/deepseek-v4-1-flash): OpenAI Responses-compatible text endpoint.
- [Grok 4.7](https://docs.kie.ai/43987895e0): `/grok/v1/responses`, SSE responses, model ID `grok-4-7`.
- [FLUX 3 Klein](https://docs.kie.ai/cn/market/flux3/klein-text-to-image): `flux-3/klein-text-to-image` and image input fields.
- [Qwen Image 2.1](https://docs.kie.ai/market/qwen2-1/text-to-image): task API and resolution/aspect-ratio fields.
- [Qwen Image 3.0](https://docs.kie.ai/market/qwen3/text-to-image): `qwen3/text-to-image`, supported resolutions and ratios.
- [Grok Imagine Image 2.0](https://docs.kie.ai/market/grok-imagine-image-2-0/text-to-image): model ID and prompt/aspect-ratio fields.
- [Wan 2.7 Image API](https://docs.kie.ai/market/wan/2-7-image): `wan/2-7-image` task API (published request example is image-editing oriented); [KIE model page](https://kie.ai/wan-2-7-image) confirms text-to-image fields, resolution, and aspect ratios.
- [Z-Image](https://docs.kie.ai/cn/market/z-image/z-image): `z-image` task API and aspect-ratio input.
