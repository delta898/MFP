# Card News AI Generation Service Integration

- Branch: `codex/feat/card-news-ai-generation-service`
- Start date: 2026-10-15
- Base/parent branch: `codex/feat/ai-gateway-plugin`
- Status: Implemented; direct OpenAI-compatible endpoint extension and best-effort image request behavior passed focused verification; ready for parent-branch integration

## User need and goal

Use Card News as the second BlogGenius Application to validate the shared provider-neutral AI Generation service introduced for Blog. Text and image generation should depend on service ports rather than `Utils.callWritingText` / `Utils.callWritingImage`, while preserving the current Card News workflow and result format.

## Scope

- Route Card News plan/text generation and per-card image generation through `src/services/ai/generation.js` via an Application-facing capability and Plugin adapter composition.
- Keep Card News model selection, verification rules, prompts, card file persistence, partial results, and cancellation behavior owned by the appropriate Card News boundary.
- Put new Application code under `src/applications/card-news/`, wire it in `src/composition/`, and document the layering.
- Add focused tests using fake AI service/transport; make no paid AI calls or external publishing calls.

## Non-goals

- Migrate SNS, shopping, Blog legacy generation, or other AI callers.
- Change Card News UI, API request/result shapes, prompts, publishing, outgoing image preparation, or model settings UX.
- Change AI Gateway operations or provider credential ownership beyond adding image aspect-ratio capability discovery and validation required by Card News.

## Proposed design

`Card News UI/API -> Card News Application -> shared AI Generation service -> AI Gateway adapter -> Plugin Host`. Card-specific prompt construction and asset lifecycle remain within Card News Application/domain services. Composition supplies the shared AI service and current model selections. Provider keys remain in Host-owned transport and are not passed in AI operation requests. Cancellation signals must reach each active text/image request; stop must preserve completed cards and avoid replacing valid images on a failed retry.

## Decisions and tradeoffs

- User selected Card News as the single next Application after Blog.
- Reuse the existing cross-Application AI service; do not make a Card News-specific AI Plugin or duplicate provider logic.
- Preserve current product behavior and focus on architecture migration plus any cancellation wiring needed to keep existing stop behavior reliable.

## Implementation progress

- Created this sub-feature from the parent AI Gateway feature branch before implementation.
- Added `src/applications/card-news/generation/application.js` and its composition factory. Card News plan generation and each image now call `src/services/ai/generation.js`; the Application passes safe `{ provider, modelId }` identities and maps normalized image bytes to local files.
- Wired the Application into the UI API runtime. Card News model/profile verification remains in its existing API boundary, and the provider key is stripped before generation service calls.
- Removed the Card News UI service's fallback to `Utils.callWritingText/Image`; runtime composition must now provide the Card News Generation Application so the normal path cannot silently bypass the AI Gateway.
- Preserved card-specific prompting, workspace persistence, partial completion, and cancellation in the existing Card News generation service. Cancellation reaches the active request; completed card images remain available and a canceled in-progress image is not committed.
- Added Gateway aspect-ratio support discovery and Host-validated `4:5` input. Google advertises its known ratios; OpenAI advertises its supported ratios and rejects unsupported requests before provider dispatch. KIE accepts and forwards the ratio without claiming a universal model-wide list. Card News preflights when the selected route declares known support.
- Updated architecture documentation to record this integration and its ownership boundaries.

## Verification and handoff

- Focused verification passed: 142 tests across Card News, SNS, AI Generation, AI Gateway, affected structure contracts, and plugin composition. Changed runtime files passed Node syntax checks and `git diff --check` passed. One initial run lacked `BLOGGENIUS_ENV` and failed while loading the Blog composition test; the full focused set passed after setting `BLOGGENIUS_ENV=local`.
- Manual UI acceptance remains with the user; no UI behavior is intentionally changed.
- The SNS AI Generation sub-feature was fast-forward merged from `codex/feat/sns-ai-generation-service` into this branch at `db0c6c60`; its branch was deleted after merge. This branch is ready to fast-forward into `codex/feat/ai-gateway-plugin`.
- No push or release has been performed.

## Remaining risks and follow-up

- Card-specific prompts, persistence, and image lifecycle remain in the existing Card News generation service; a later boundary refactor may move that code under `src/applications/card-news/` without changing the shared Gateway contract.

## Direct OpenAI-compatible endpoint extension

- User asked to preserve the advanced-user “direct input” model option after Gateway adoption and approved extending the AI Gateway Plugin.
- Scope: let the shared AI Generation service discover and route the single active, configured direct text/image model through Gateway operations; do not include a custom Base URL or API key in Plugin operation payloads.
- Host-owned AI transport resolves the configured profile, URL, and optional key. It permits only fixed OpenAI-compatible operation paths, rejects URL credentials/query/fragment and redirects, and keeps localhost/private origins usable for local inference endpoints because these requests are intentionally user-configured outbound AI connections.
- Direct model discovery is a sanitized, active-configuration projection intersected with Gateway support. It does not add arbitrary IDs to the static provider Catalog or make unconfigured direct IDs callable.
- Direct text uses the compatible chat endpoint. Direct image generation advertises no unverified ratio/size list; it makes a best-effort request by mapping the requested ratio and size to OpenAI-compatible `size` dimensions, asks for inline base64, and returns a normalized provider rejection if the endpoint does not support the request. This keeps endpoint-specific capability policy out of the Card News Application.
- The follow-up request clarified that unknown direct image ratios/sizes must not be rejected by the Gateway before dispatch. Gateway `describeSupport()` omits unverified direct ratio/size lists; shared AI service reports the ratio capability as unknown, allowing the existing Application flow to make the request. No Card News selection or ratio policy code was changed in this follow-up.
- Added safe upstream diagnostics: the Host transport extracts a bounded provider code/message, redacts configured keys and echoed prompt content, and preserves the provider request ID. The shared AI Generation service logs provider/model/transport, elapsed time, HTTP status, sanitized upstream details, and the stable Gateway error code; it never logs request prompts or raw response bodies.
- Verification covers direct model discovery, request routing, key non-disclosure, allowed paths, endpoint validation, Card News selection, a direct 4:5 best-effort request, normalized provider rejection, and diagnostic redaction/log formatting. Focused verification passed with `BLOGGENIUS_ENV=local`: the earlier 58-test slice and the latest 20-test Gateway/AI/Application slice; `git diff --check` passed. No paid provider calls are in scope.
- A real Card News log identified an Anthropic 400 rejection: `temperature` is deprecated for the selected Claude model. The Gateway now omits that shared option only for Anthropic requests while preserving temperature for providers that accept it; a focused adapter test covers both sides of this behavior.
