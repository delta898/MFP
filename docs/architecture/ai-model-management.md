# AI Model Management

## Ownership

AI model support is split between trusted executable behavior and replaceable model
metadata.

- `src/ai/transport-registry.js` owns supported HTTP transport routes and provider
  base URLs.
- `src/ai/model-runtime-policy.js` translates model capabilities into safe request
  parameters.
- `src/ai-model-catalog.js` is the bundled offline/recovery catalog.
- Supabase `ai_model_catalog_versions` is the operational source of truth for
  published remote catalog snapshots.
- `src/ai/catalog-registry.js` validates and merges bundled and remote definitions.

User configuration must not contain a copy of the product catalog.

## Model Contract

Each supported model is described using:

- `key`: stable `{provider}:{model_id}` reference
- `kind`: `text` or `image`
- `provider`: product/provider namespace
- `transport`: trusted local adapter ID
- `code` / remote `model_id`: provider API model identifier
- `name` / remote `display_name`: user-facing label
- `status`: lifecycle policy
- `capabilities`: request-policy inputs
- `minimum_app_version`: optional compatibility floor

Provider presentation is described separately for each model kind:

- `kind`: `text` or `image`
- `id`: provider identifier
- `display_name`: UI label
- `sort_order`: explicit provider position

Provider and model ordering are independent. The app does not infer semantic
versions or performance tiers from model names:

- provider `sort_order` follows user-facing provider-name ascending order
- model `sort_order` is assigned newest version first
- within the same version, model `sort_order` is assigned high, medium, then
  low-cost/performance tier
- `direct` remains a UI-owned final option

The current trusted transports are:

- `gemini_generate_content`
- `imagen_predict`
- `openai_chat_completions`
- `anthropic_openai_compat`
- `kie_openai_chat`
- `openai_images`

Adding a model that uses one of these transports can be done through the remote
catalog. Adding a new protocol, endpoint shape, authentication method, or response
parser requires an app release.

## Trust Boundary

Remote catalog data may select a locally allowlisted transport and set validated
model metadata/capabilities. It cannot set arbitrary base URLs, authentication
headers, executable code, response parsers, or API-key destinations.

The registry rejects:

- unknown schema versions
- unsupported `kind + provider + transport` routes
- malformed lifecycle states
- entries requiring a newer app
- stable keys that do not match their provider/model ID
- unsupported capability keys
- malformed or unsupported provider ordering entries

Direct-input models remain an explicit user-controlled OpenAI-compatible exception.
Their Base URL is entered and confirmed by the user rather than supplied remotely.

## Catalog Loading

1. Load the bundled catalog synchronously.
2. Load `data/cache/ai-model-catalog.json` when it is valid and app-compatible.
3. Refresh the published catalog through Supabase RPC when major settings load.
4. Validate the complete remote snapshot before applying it.
5. Cache a successful snapshot using an atomic temp-file rename.
6. Keep the current cached/bundled snapshot on network, schema, or write failure.

Remote refresh failure does not block app startup, settings, or content generation.

## Lifecycle

- `active`: selectable
- `preview`: selectable with preview semantics
- `deprecated`: selectable during a migration window
- `hidden`: removed from new selection but retained for existing resolution
- `unavailable`: retained for diagnosis and blocked at runtime

An announced shutdown does not require immediate removal from new selections. A
model may remain selectable during a useful migration window when it is still
operational and provides distinct value. Existing selections remain readable after
the model is hidden.

## Generation-free Connection Checking

The AI settings screen can check the currently entered selection before it is
saved without generating text or images. The settings API resolves the same
catalog selection used by normal runtime configuration and delegates the request to
`src/ai/model-connection-tester.js`.

- OpenAI models use the model metadata endpoint.
- Gemini and Imagen models use the Gemini model metadata endpoint and inspect
  advertised generation methods when available.
- Anthropic models use the native Claude model metadata endpoint.
- Direct OpenAI-compatible servers use `/models` and must expose the selected ID.
- KIE.ai uses its account credit endpoint because it does not expose a free
  per-model metadata endpoint. The result confirms provider account connectivity
  and returns the remaining credit; it does not claim selected-model verification.
- The checker dispatches by the trusted catalog provider/transport boundary, not
  by arbitrary remote URLs.
- API keys are used only in the outbound request and are never included in the
  check result.
- Successful results expose the resolved model, transport, elapsed time,
  `check_type: metadata`, and `generation_performed: false`.

This check verifies authentication, connectivity, and model discovery. It does
not prove generation quota, billing balance, request-option compatibility, or
successful content generation.

For KIE.ai, the narrower provider-account check verifies authentication,
connectivity, and the credit response only. Model route compatibility requires an
explicitly approved minimal generation call.

## KIE.ai Boundary

KIE.ai is presented as one text provider. Its upstream Gemini, GPT, Claude, and
other families remain models under that provider rather than becoming new provider
names.

KIE protocols are split by trusted local transport. The initial
`kie_openai_chat` adapter supports route-selected Gemini OpenAI-compatible models
at the fixed `https://api.kie.ai` host. A validated catalog model ID supplies only
one path segment; it cannot supply a host, arbitrary URL, authentication header, or
parser. Responses are parsed as OpenAI chat responses with a narrowly scoped
Gemini-shaped fallback for the inconsistency in KIE's published examples.

Responses/Claude Messages/other KIE contracts require their own transports before
those models become selectable.

The initial three KIE Gemini routes were verified against the real API with
non-streaming, text-only, minimal-token requests. All returned OpenAI chat response
objects and reported 0.01 credit for the validation request. Structured output and
image input remain disabled in the catalog because they were outside that verified
contract.

## Configuration Boundary

`ai_settings.TEXT_MODEL` and `ai_settings.IMAGE_MODEL` store the user's selection.

Known presets persist only:

- `provider`
- `code`
- `api_key`

Direct OpenAI-compatible models additionally persist:

- `name`
- `base_url`

Catalog display names, transport IDs, provider endpoints, and capabilities are
resolved at runtime and are not duplicated into user configuration.

`ai_settings.CHAT_MODEL` remains a separate OpenAI-compatible configuration for
Telegram and Agent support tasks.

## Supabase Operations

Apply `sql/supabase_ai_model_catalog.sql` to create the version table and read-only
`get_ai_model_catalog(channel, app_version)` RPC.

Catalog rows move through:

```text
draft -> published -> retired
```

Only service-role/SQL operations can modify rows. App clients can execute the RPC
but cannot read or mutate the backing table directly. Rollback publishes a prior
validated payload and retires the faulty version.

## Migration

Legacy `ai_presets` values in existing user config are ignored.

The next major settings save removes `ai_presets` and writes compact model
selections. This avoids rewriting user config during startup while still converging
old installations onto the current structure.
