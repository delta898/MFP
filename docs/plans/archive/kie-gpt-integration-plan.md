# KIE.ai GPT 5.6 Integration Plan

## Goal

Add GPT 5.6 Sol, Terra, and Luna under the existing `KIE.ai` text provider
without weakening the trusted model-catalog boundary.

## Verified Contract

KIE's official model specifications define all three models on:

```text
POST https://api.kie.ai/codex/v1/responses
```

The model IDs are:

- `gpt-5-6-sol`
- `gpt-5-6-terra`
- `gpt-5-6-luna`

The API uses Bearer authentication and an OpenAI Responses-shaped contract.
For BlogGenius writing, the first implementation is deliberately text-only,
non-streaming, without tools or web search:

```json
{
  "model": "gpt-5-6-terra",
  "stream": false,
  "input": "prompt",
  "reasoning": {
    "effort": "low"
  }
}
```

## Architecture

- UI provider remains `KIE.ai`.
- Catalog controls model visibility, ordering, and capability metadata.
- New trusted transport: `kie_responses`.
- The transport owns the fixed endpoint, request builder, and response parser.
- Remote catalog data can select this transport only for `kind=text` and
  `provider=kie`; it cannot inject an endpoint or executable request logic.
- Existing `kie_openai_chat` remains responsible only for the route-selected
  Gemini chat-completions contract.

## Model Order

1. GPT 5.6 Sol
2. GPT 5.6 Terra
3. GPT 5.6 Luna
4. Gemini 3.6 Flash
5. Gemini 3.5 Flash
6. Gemini 3.1 Pro

## Validation

1. Unit-test request construction and response extraction.
2. Verify remote catalog allowlisting and display order.
3. Run the complete test suite.
4. With explicit approval, call Luna, Terra, and Sol once each using a minimal
   prompt, checking credits before and after every request.
5. Stop immediately on an API error or if one model consumes more than
   0.5 credits.

### Real API Result

The production KIE API was verified through the BlogGenius adapter with one
minimal non-streaming request per model:

| Model | Result | Elapsed | Credits |
| --- | --- | ---: | ---: |
| GPT 5.6 Luna | `BLOGGENIUS_OK` | 4.2s | 0.01 |
| GPT 5.6 Terra | `BLOGGENIUS_OK` | 5.6s | 0.01 |
| GPT 5.6 Sol | `BLOGGENIUS_OK` | 6.9s | 0.02 |

All three models used the fixed KIE Responses endpoint, Bearer authentication,
non-streaming text input, and low reasoning effort.

## Deferred

- Streaming responses
- Image/file input
- Web search
- Function calling
- User-selectable reasoning effort
- Automatic fallback to another paid model
