# AI Writing Model Selection Plan

## Goal
- Expose writing text/image model selection in `설정 > AI`
- Support `preset + 직접 입력`
- Keep chat model flow unchanged for now

## Scope
- Keep the product-managed preset catalog in `src/ai-model-catalog.js`
- Add `ai_settings.TEXT_MODEL` and `ai_settings.IMAGE_MODEL`
- Keep legacy `text_model` / `image_model` as compatibility fallbacks
- Wire quick/manuscript writing generation to new model configs

## Non-goals
- Rework Telegram chat model structure
- Add provider-side model list discovery APIs
- Fully generalize every existing Gemini call in the app

## Decisions
- Use names `TEXT_MODEL`, `IMAGE_MODEL`, `CHAT_MODEL`
- `TEXT_MODEL` / `IMAGE_MODEL` are object configs, not plain strings
- Presets auto-fill provider/base URL
- Direct input is for OpenAI-compatible endpoints
- Product presets are code-owned and are not copied into user config
- User config stores preset selection and API keys; direct models also store name/base URL
