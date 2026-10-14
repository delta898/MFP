# SNS AI Generation Service Integration

- Branch: `codex/feat/sns-ai-generation-service`
- Start date: 2026-10-15
- Base/parent branch: `codex/feat/card-news-ai-generation-service`
- Status: Implemented; focused and UI verification passed; ready for parent-branch integration

## User need and goal

Route SNS AI features through BlogGenius' shared AI Generation interface so SNS workflows do not call legacy provider-specific `Utils.callWritingText`, `Utils.callChatText`, or `Utils.callWritingImage` directly. Keep provider selection and credentials owned by the existing Host and AI model configuration.

## Scope

- Migrate automatic SNS hashtag generation, manual post optimization, and manual SNS image generation to `src/services/ai/generation.js` through an SNS Application boundary.
- Preserve existing prompts, parser/result shapes, availability behavior, cancellation, and publishing behavior.
- Place the new Application under `src/applications/sns/`, wiring under `src/composition/`, and update architecture documentation.
- Add focused tests with a fake AI Generation service; do not call paid models, publish posts, or mutate external services.

## Non-goals

- Migrate other SNS/Buffer workflows, RSS ingestion, publishing, image hosting, UI, or settings screens.
- Change SNS prompt/product behavior or provider credentials/network handling.
- Migrate legacy Blog, Shopping, or other remaining `Utils.call*` users.

## Proposed design

`SNS runner / manual SNS service -> SNS AI domain service -> SNS Generation Application -> shared AI Generation service -> AI Gateway Plugin adapter -> Plugin Host`.

The SNS Application resolves the configured text, chat, or image model role and invokes only the provider-neutral shared AI Generation contract. The existing SNS AI service retains SNS prompts, parsing, and public result shapes. Composition injects the shared AI Generation service and configured model selectors. Provider API keys remain in Host-owned transport.

## Decisions and tradeoffs

- Use the same shared AI Generation contract and Plugin Host runtime already composed for Blog and Card News; do not add an SNS-specific Plugin.
- Preserve the existing role distinction: automatic hashtags may use the selected writing or chat model; manual optimization uses the Chat Model; generated SNS images use the configured image model.
- Keep the migration scoped to the SNS AI service's three generation paths.

## Implementation progress

- Created this feature branch from `codex/feat/card-news-ai-generation-service` before implementation.
- Added `src/applications/sns/generation/` and its composition root. SNS generation resolves the configured writing/chat/image model through the shared AI Generation service, forwards cancellation to image generation, and logs selected model/provider/transport.
- Rewired automatic hashtags, manual text optimization, and manual image generation in the existing SNS AI domain service. Image results now use the Gateway's normalized inline bytes and retain the existing API's MIME/base64 response shape without temporary files.
- For a Gateway route that explicitly reports a 4:3 image ratio as unsupported, the SNS Application omits that optional ratio and permits the provider default; unknown and supported routes continue receiving the 4:3 preference.
- Repository placement policy was clarified with the user: application-specific service areas belong under `src/applications/<name>/`; legacy areas such as `src/social/`, `src/card-news/`, and `src/blog-next/` remain in place until one coordinated migration stage. See the source directory layering decision and canonical architecture document.
- Focused SNS Application, SNS AI, manual SNS, and distribution-runner verification passes: 61 tests, including availability, cancellation propagation, and provider-role selection. During parent-merge preparation, those tests plus the four formerly failing full-suite tests passed again: 77 tests total. `node --check src/ui-server.js` and `git diff --check` pass.
- No paid AI calls or Buffer publishing calls were made during verification. SNS implementation, regression-test updates, and this record update are committed on the feature branch.

## Verification and handoff

- Focused SNS Application, SNS AI, manual SNS, and distribution-runner verification: 61 passed. `node --check src/ui-server.js` and `git diff --check` pass.
- User-requested full verification: `npm run test:unit` stopped in its `npm audit --audit-level=high` pretest gate with 9 dependency advisories (3 high, 2 moderate, 4 low). The unit runner was then executed directly with localhost access: 2,350 tests total, 2,345 passed, 1 skipped, 4 failed. Failures were `scripts/knowledge-gateway-structure.test.js` (expected legacy Core log text), `scripts/ui-script-structure.test.js` (JavaScript manifest execution-order expectation), and two tests in `src/composition/plugin-runtime-composition.test.js` (test registrations rejected for invalid/missing manifests).
- UI checks: `test:ui-blog-auto` and `test:ui-settings` passed; `BLOGGENIUS_ENV=local npm run test:ui-e2e` passed; `BLOGGENIUS_ENV=local npm run test:ui-browser` passed with 429 fixture requests and two external font requests blocked by the smoke guard.
- Manual acceptance can verify manual SNS post optimization, manual SNS image generation, and automatic hashtag generation in the SNS distribution flow. No UI behavior is intended to change.
- Commits: `76396cc2 feat: route SNS AI through shared generation service`; `68894771 test: align stale contracts with current plugin structure`. No push or release has been performed.

## Remaining risks and follow-up

- `npm run test:unit` remains blocked by the repository's `npm audit --audit-level=high` pretest gate (9 advisories: 3 high, 2 moderate, 4 low). The prior direct full-suite run had four stale test-contract failures; all four now pass in focused verification, but the full suite has not been rerun.
- Manual visual acceptance remains available for the SNS flows listed above.
