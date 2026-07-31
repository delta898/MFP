# KIE.ai Provider Integration Plan

## Goal

Expose KIE.ai as a simple text AI provider in settings while keeping its
provider-specific protocols behind trusted local transports.

The user-facing provider list is:

1. ChatGPT
2. Claude
3. Gemini
4. KIE.ai
5. Direct input

KIE.ai remains one provider namespace internally. Different upstream model
families do not become separate providers; they are implemented as KIE-specific
transports when their HTTP contracts differ.

## Catalog Ownership

KIE model discovery is curated from the official KIE documentation index. The app
does not scrape documentation or activate every advertised model at runtime.

- The bundled catalog provides an offline fallback.
- The published Supabase Model Catalog controls display names, lifecycle, and
  ordering after the compatible transport ships.
- A new model can be added remotely only when it uses an already allowlisted KIE
  transport.
- A new KIE endpoint shape, authentication contract, or response parser requires
  an app release.

## Phased Transport Scope

### Phase 1: `kie_openai_chat`

Support only the simplest KIE Gemini OpenAI-compatible routes:

1. Gemini 3.6 Flash
2. Gemini 3.5 Flash
3. Gemini 3.1 Pro

The catalog model ID is also the single KIE route segment. The local adapter:

- always sends the key only to `https://api.kie.ai`
- validates the route segment before building an endpoint
- uses `POST /{model-route}/v1/chat/completions`
- omits the body `model` because the route selects the model
- parses the OpenAI chat response shape
- accepts the documented Gemini-shaped response only as a narrow compatibility
  fallback

Structured output and image input remain disabled until real compatibility tests
prove the request options.

### Later phases

The intended catalog order is fixed explicitly with `sort_order`:

1. Claude Fable 5
2. Claude Opus 5
3. Claude Sonnet 5
4. Gemini 3.6 Flash
5. Gemini 3.5 Flash
6. Gemini 3.1 Pro
7. GPT 5.6 Sol
8. GPT 5.6 Terra
9. GPT 5.6 Luna
10. Grok 4.5

These later entries stay out of the active catalog until their transports ship:

- GPT: KIE Responses API transport
- Claude: KIE Anthropic Messages transport
- Grok: transport selected from its verified KIE contract

## Connection Check

KIE does not expose a free model-metadata endpoint equivalent to the direct
providers. Its generation-free connection check therefore uses:

```text
GET https://api.kie.ai/api/v1/chat/credit
Authorization: Bearer <API key>
```

Success confirms:

- the server is reachable
- the API key is accepted
- the KIE account/credit API responds
- the current remaining credit value

It does not confirm that the selected model route can generate, that a specific
request option is supported, or that sufficient credit exists for a full BlogGenius
job. The UI labels this as a KIE.ai provider connection, not as model verification.

## Validation

Automated fixture coverage must prove:

- catalog/provider ordering
- remote-catalog transport allowlisting
- route-segment rejection
- route-specific request construction without `model`
- OpenAI and documented Gemini-shaped response parsing
- credit endpoint authentication and malformed-response rejection
- no generation during connection checking

Real compatibility validation is a separate, explicitly approved paid step:

1. User enters a KIE API key through the app or local secure environment.
2. Record credit before the test.
3. Send one minimal, non-streaming prompt to each of the three phase-1 routes.
4. Record response shape, status, latency, and credit after each call.
5. Stop on unexpected cost or protocol behavior.

Do not commit, publish the catalog SQL, or run paid API calls without the user's
explicit approval.

### Real compatibility result

Validated on 2026-07-31 with a user-authorized KIE.ai account:

| Model | HTTP | Response | Text | Latency | Credit |
| --- | ---: | --- | --- | ---: | ---: |
| Gemini 3.5 Flash | 200 | OpenAI chat | `OK.` | 5.41 s | 0.01 |
| Gemini 3.6 Flash | 200 | OpenAI chat | `OK` | 4.99 s | 0.01 |
| Gemini 3.1 Pro | 200 | OpenAI chat | `OK.` | 12.59 s | 0.01 |

Every call used `stream: false`, a text-only prompt, and `max_tokens: 8`.
Account credit moved from 80.00 to 79.97, matching each response's reported
`credits_consumed: 0.01`. No API key was printed or copied into documentation.

This confirms the phase-1 endpoint, Bearer authentication, route-selected model
request, `max_tokens`, non-streaming response, OpenAI response parser, and credit
accounting. It does not activate structured output or image input; those
capabilities remain conservative until separately required and tested.

## Release Gate

The SQL seed marks KIE models with `minimum_app_version: 0.1.15`. The first
implementation release is `0.1.15-dev1`; both the app and Supabase semantic-version
comparators intentionally use the numeric `0.1.15` compatibility floor.
