# Google Imagen Preset Plan

## Goal
- Add Google Imagen 4 presets to the image model selection flow.
- Keep Gemini as the default image model.
- Support Imagen through its native `predict` API without changing the user-facing AI selection model.

## UX Direction
- Extend `설정 > AI > 이미지 모델 > AI 선택` with:
  - `Gemini`
  - `Imagen 4`
  - `직접 입력`
- When `Imagen 4` is selected, show Imagen preset models in the model dropdown.
- Keep the second row layout aligned with the current model selector:
  - provider preset: API mode label + API key
  - direct input: Base URL + API key

## Implementation Direction
- Keep the simple provider-based model config:
  - `provider`
  - `name`
  - `code`
  - `base_url`
  - `api_key`
- Add `imagen4` image presets in the default preset registry and sample config.
- Add an internal image transport branch for Imagen native `predict` calls.
- Preserve the current aspect ratio policy:
  - blog: `4:3`
  - shopping: `1:1`

## Validation
- Gemini remains the default image model after load/save.
- Selecting `Imagen 4` shows Imagen models and stores the selected preset.
- Imagen image generation uses the native Google Imagen endpoint and saves returned images correctly.
- `직접 입력` image flow continues to use OpenAI-compatible image generation.
