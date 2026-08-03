# Google AI Provider Normalization

## Status

Accepted

## Context

AI settings previously mixed vendor names and product families in the provider
selector. OpenAI appeared as ChatGPT, Anthropic appeared as Claude, Google Gemini
appeared as Gemini, and Imagen 4 appeared as a separate provider.

Google has deprecated Imagen in the Gemini API and announced shutdown on
2026-08-17, with Nano Banana as the migration target. Maintaining a separate
Imagen transport would expose a model family with no useful support lifetime.

## Decision

Use vendor identities as canonical provider IDs:

- `openai`
- `anthropic`
- `google`
- `kie`
- `direct`

Present OpenAI, Anthropic, Google, KIE.ai, and direct input in settings. Group
Gemini and Nano Banana models under Google through `gemini_generate_content`.
Do not expose Imagen presets or ship the retired `imagen_predict` transport.

Normalize legacy local `gemini` provider values to `google` at configuration
boundaries. New persisted selections, provider profiles, catalog entries, and
model keys use `google`.

## Consequences

- Provider labels consistently describe API vendors.
- Google image generation is limited to supported Nano Banana models.
- Remote catalogs cannot re-enable Imagen without a new reviewed app transport.
- Existing Gemini local settings converge to `google` on the next settings save.
- Published remote catalogs must use the new Google provider namespace before they
  can override the bundled Google catalog.
