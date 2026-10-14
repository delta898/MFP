# AI Gateway Core Plugin

## Purpose and ownership

`packages/plugins/core/ai-gateway/` is a provider-neutral, in-process Core Plugin for text and image generation. BlogGenius remains the Platform: its Model Catalog controls product-visible and selectable models, its Applications choose a model, and its Host owns provider credentials and network transport. The Gateway reports the routes and execution limits it implements, normalizes provider requests and responses, and owns provider-specific asynchronous job mechanics.

The Gateway is not a REST service. Other Hosts can use the package by implementing the narrow transport dependency accepted by `createPlugin({ transport })`; that transport is not part of the public operation payload.

## Public operation contract

The package manifest declares two operations with Host-validated JSON Schema 2020-12 contracts:

- `text.generate`: `{ model: { provider, modelId }, messages, options? }` → normalized text, model identity, optional usage, and finish reason.
- `image.generate`: `{ model: { provider, modelId }, input: { prompt }, options? }` → one or more `{ mimeType, dataBase64 }` images and model identity.

The operation input does not contain an API key, endpoint, connection reference, authorization header, or BlogGenius configuration. Images are inline base64 with a 10 MiB decoded per-image limit. The Host validates output size and shape before returning results to the Application. A future Host-managed asset-reference contract can replace inline media when a concrete shared asset lifecycle exists.

`describeSupport()` is the Gateway-owned support inventory. BlogGenius Applications intersect its `kind + provider + transport + modelIds` routes with selectable entries from `getAiModelCatalog()` before dispatch. The Catalog describes BlogGenius product availability; it does not grant Gateway execution support. The Gateway inventory does not make a model selectable in BlogGenius.

## Supported routes in this release

- Text: Google Gemini generateContent, OpenAI chat completions, Anthropic's OpenAI-compatible endpoint, and KIE Responses/chat routes. KIE routes list their exact model IDs in `support.js`; the other routes accept model IDs selected by the Application's Catalog.
- Image: Google Gemini image generation for `gemini-nano-banana-2.1`, `gemini-3.1-flash-image`, and `gemini-3.1-flash-lite-image`; OpenAI image generation for GPT Image 2/2.5 Catalog IDs; and KIE's eight catalogued async image job models.
- Image count defaults to one. OpenAI image routes allow up to four outputs; Google and KIE routes allow one. `describeSupport()` includes each route's maximum image bytes and supported sizes per model. Unsupported count or size requests fail with `AI_GATEWAY_UNSUPPORTED_CAPABILITY` rather than being silently ignored.
- JSON response mode is advertised only on Google and OpenAI text routes, and an Application enables it only when the selected Catalog model also advertises structured output. The Application remains responsible for parsing and validating its business response shape.

## Credential and transport boundary

`src/ai/bloggenius-ai-transport.js` is the BlogGenius Host adapter. It resolves the configured key from Host-owned `AI_MODEL_PROFILES` (with the active role configuration as fallback), adds provider authentication internally, and uses fixed provider hosts plus operation-specific path allowlists. No secret enters the Plugin operation input, result, progress event, or error. User-defined endpoints and transport headers are not accepted.

Image result downloads use HTTPS, reject literal/private destinations, check DNS results, disable redirects, require image content types, and enforce the 10 MiB limit. This in-process Plugin boundary is not a sandbox against malicious Core code; future Community Plugin execution needs a separate trust and isolation design.

## Cancellation, progress, and errors

The Plugin receives the Host `AbortSignal`; progress is reported through the optional Host `reportProgress(event)` context function with the phases `submitted`, `waiting`, `generating`, and `downloading`. The Host adds the executing Plugin and operation IDs and validates every event.

KIE image generation submits once, polls the returned job, and downloads the completed result. The Gateway does not automatically retry generation submissions. It may make bounded retries for safe status reads and result downloads. Cancellation stops local polling/download work but does not claim that the remote KIE job stopped or that credits were refunded. Cancellation during submission can have an unknown remote outcome because the Host waits for the submission response to recover its job ID.

Public failures use stable `AI_GATEWAY_*` error codes, a retryability indicator where applicable, and an optional provider request ID. Provider response bodies, prompts, keys, and authentication headers are not copied into public errors.

## BlogGenius integration and migration boundary

The shared Core runtime registers AI Gateway with the WordPress Publisher. The Blog Writing Application invokes the Gateway for text generation and image generation, after resolving the selected `{ provider, modelId }` against the Catalog/support intersection. Blog Beta's AI manuscript generation routes text and every requested generated image through these operations regardless of image mode; manuscript draft image actions use the same image operation. Core no longer silently handles the combined AI manuscript path when image generation is enabled. Other product entrypoints that compose text and images through `Utils`/`Core` remain migration follow-up; this Plugin does not move BlogGenius prompts, licensing, manuscript state, or publication workflows into the reusable package.

Focused tests use fake transport responses and verify model intersection, normalized text, KIE async polling/progress/cancellation, image limits, Host credential injection, and route restrictions. No paid AI calls are part of the test suite.
