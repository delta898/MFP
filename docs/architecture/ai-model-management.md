# AI Model Management

## Ownership
Product-supported writing and image model presets are defined only in `src/ai-model-catalog.js`.

User configuration must not contain a copy of the product catalog.

The catalog should prefer current stable models. Deprecated, shutdown, and near-term replacement models are removed from new selections while existing user selections remain readable through the unavailable-model compatibility path.

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
