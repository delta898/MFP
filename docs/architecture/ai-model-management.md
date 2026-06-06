# AI Model Management

## Ownership
Product-supported writing and image model presets are defined only in `src/ai-model-catalog.js`.

User configuration must not contain a copy of the product catalog.

The catalog should prefer current stable models and use them as defaults.

An announced shutdown does not require immediate removal from new selections. A model may remain selectable during a useful migration window when it is still operational and provides distinct value. Remove it before shutdown, or earlier when replacement coverage is mature and the remaining support window is too short to justify new usage. Existing user selections remain readable through the unavailable-model compatibility path after removal.

## Configuration Boundary
`ai_settings.TEXT_MODEL` and `ai_settings.IMAGE_MODEL` store the user's selection.

Known presets persist only:
- `provider`
- `code`
- `api_key`

Direct OpenAI-compatible models additionally persist:
- `name`
- `base_url`

`ai_settings.CHAT_MODEL` remains a separate OpenAI-compatible configuration for Telegram and Agent support tasks.

## Runtime Resolution
`src/ai-model-config.js` combines the code-owned catalog with the stored selection and exposes normalized runtime model configuration.

For known presets, display name and provider base URL come from the catalog. If a previously selected model is removed from the catalog, the existing selection is preserved and marked unavailable until the user explicitly selects another model.

## Migration
Legacy `ai_presets` values in existing user config are ignored.

The next major settings save removes `ai_presets` and writes compact model selections. This avoids rewriting user config during startup while still converging old installations onto the current structure.
