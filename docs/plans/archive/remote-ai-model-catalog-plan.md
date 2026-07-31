# Remote AI Model Catalog Plan

## Goal

Add current OpenAI, Google, and Anthropic writing/image models while making future
model-list and model-policy changes deployable without a desktop app release.

The design keeps executable HTTP behavior inside the trusted app and moves only
validated model metadata and capability policy to a versioned remote catalog.

## Scope

- Add writing presets:
  - GPT-5.6 Sol (`gpt-5.6-sol`)
  - GPT-5.6 Terra (`gpt-5.6-terra`)
  - GPT-5.6 Luna (`gpt-5.6-luna`)
  - Gemini 3.6 Flash (`gemini-3.6-flash`)
  - Claude Fable 5 (`claude-fable-5`)
  - Claude Opus 5 (`claude-opus-5`)
  - Claude Sonnet 5 (`claude-sonnet-5`)
- Add image preset:
  - GPT Image 2 (`gpt-image-2`)
- Introduce explicit model `kind + provider + transport + capabilities`.
- Keep a bundled catalog as an offline and recovery fallback.
- Load a published catalog from Supabase through a read-only RPC.
- Cache the last validated remote snapshot locally.
- Preserve current selections when a model is hidden or removed.

## Trust Boundary

The remote catalog may control:

- model ID and display name
- known transport selection
- capability flags and safe defaults
- lifecycle status and sort order
- minimum compatible app version

The remote catalog must not control:

- arbitrary base URLs
- authentication headers
- executable JavaScript
- response parsing code
- filesystem destinations
- API-key routing

Provider endpoints and request/response adapters remain code-owned in the app.
Remote entries are rejected unless their `kind`, `provider`, and `transport`
combination exists in the local transport registry.

## Runtime Structure

```text
Bundled catalog --------------------+
                                     |
Validated remote snapshot -> merge -> Catalog Registry
                                     |
                                     +-> model selection UI
                                     +-> config resolution
                                     +-> runtime capability policy
                                              |
                                              +-> trusted transport adapter
```

### Bundled catalog

`src/ai-model-catalog.js` remains the minimum usable catalog shipped with the app.
It contains stable model definitions and enough metadata to operate offline.

### Catalog registry

The registry owns the current validated snapshot. It merges remote entries over
the bundled definitions while retaining hidden definitions for existing-selection
resolution.

### Transport registry

The initial trusted transports are:

- `gemini_generate_content`
- `imagen_predict`
- `openai_chat_completions`
- `anthropic_openai_compat`
- `openai_images`

Direct-input models continue to use the OpenAI-compatible text/image paths as an
explicit user-managed exception.

### Capability policy

Request construction uses capabilities rather than provider-name conditionals.
Examples:

- omit deprecated sampling parameters for Gemini 3.6
- omit legacy `response_format` for GPT Image 2
- map blog/shopping aspect policy to supported image sizes
- retain conservative OpenAI-compatible defaults for direct-input models

## Supabase Contract

Use a dedicated version table rather than `app_runtime_configs`:

```text
ai_model_catalog_versions
- version
- schema_version
- channel
- status (draft, published, retired)
- payload jsonb
- minimum_app_version
- created_at
- published_at
```

The app calls `get_ai_model_catalog(channel, app_version)`. The RPC returns only
the newest compatible published version. Anonymous/authenticated clients receive
read-only RPC access; table writes remain service-role only.

## Load and Failure Policy

1. Load the bundled catalog synchronously.
2. Load the last validated local snapshot when available.
3. Refresh from Supabase when settings are opened and according to TTL.
4. Validate schema, app compatibility, lifecycle values, and transport allowlist.
5. Atomically replace the active remote snapshot and cache only after validation.
6. On any failure, keep the current snapshot; never block app startup or writing.

## Lifecycle Policy

- `active`: selectable
- `preview`: selectable with preview metadata
- `deprecated`: selectable with migration metadata
- `hidden`: not available for new selection, retained for existing selection
- `unavailable`: retained for diagnosis but not selectable or callable

Stored selections keep provider/model identifiers so the app can continue to
resolve an existing selection when the remote service is temporarily unavailable.

## Validation

- Catalog schema rejects arbitrary transports, endpoints, and malformed entries.
- Remote entries can add supported models without changing app code.
- Cached and bundled fallback paths work when Supabase is unavailable.
- Existing removed selections remain readable.
- GPT-5.6 and Claude 5 use the trusted chat-completions transports.
- Gemini 3.6 does not receive deprecated temperature configuration.
- GPT Image 2 uses the Images API and preserves blog/shopping aspect policy.
- Existing Gemini, Imagen, Claude, and direct-input behavior remains covered.

## Follow-up

- Add an internal catalog publishing UI if SQL-based operation becomes costly.
- Add offline public-key signatures for catalog artifacts if catalog distribution
  moves outside the existing authenticated Supabase control plane.
- Add provider account discovery only as a diagnostic overlay, not as the
  product-supported catalog source of truth.

## Completion

Implemented on `codex/remote-ai-model-catalog`.

- Added bundled current OpenAI, Gemini, and Anthropic presets.
- Added trusted transport and runtime capability registries.
- Added Supabase version schema, compatibility selection RPC, and initial seed.
- Added validated local cache and bundled fallback behavior.
- Updated settings UI provider labels and API summaries.
- Added catalog, request-policy, cache, and compatibility tests.
- Separated provider and model `sort_order` so presentation order is explicit
  catalog policy rather than a side effect of model names.
- Full unit suite passed: 253 tests.
