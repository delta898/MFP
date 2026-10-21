# KIE Claude Model Support Development

## Branch and status

- Branch: `codex/fbr/kie-claude-model-support`
- Start date: 2026-10-21
- Base/parent: `codex/fbr/plugin-architecture-foundation`
- Status: Implemented; ready for parent-branch integration

## User need and goal

KIE.ai Claude Haiku 5.5, Sonnet 5.5, and Opus 5.5 were added to the Development AI model catalog but are filtered from BlogGenius because the AI Gateway has no KIE Claude Messages transport. The user wants Claude model-family support and model-family ordering in a versioned catalog for app 0.7.0 and later.

## Scope

- Add a trusted KIE Claude Messages transport for text generation and model connection verification.
- Keep endpoint, authentication, request/response handling, and route allowlisting in the AI Gateway Plugin.
- Add focused coverage for catalog route discovery, request/response translation, verification, and supported model configuration.
- Prepare Development catalog snapshots with Claude 5.5 active and existing KIE model entries preserved; Gemini 3.5 Flash is omitted from the snapshot.
- Reorder KIE text and image models by model family through catalog `sort_order` metadata.
- Keep the catalog snapshot minimum app version at 0.7.0.
- Verify the three Claude models individually through controlled real KIE requests only after the user authorizes paid provider calls.

## Non-goals

- No production catalog changes or production API calls.
- No removal/deprecation of existing KIE model families.
- No unrelated release work.
- Do not commit, merge, push, or release without explicit instruction.

## Proposed design and boundaries

- `packages/plugins/core/ai-gateway/` owns KIE Claude transport registration, fixed request paths, bearer auth through the existing Host-owned provider profile, response parsing, and route validation.
- The Claude transport uses the KIE Messages protocol and remains scoped to KIE provider model IDs; it does not reuse the direct Anthropic host or credentials.
- Supabase catalog snapshots own user-visible names, model IDs, capabilities, minimum app version, and model-family sort order. Unsupported transports must not be published as selectable entries before the matching app code is available.
- Focused fixture-based tests verify behavior without spending KIE credits. Real per-model validation is a separate paid external check.

## Decisions made with the user

- Work starts on a separate feature branch based on `codex/fbr/plugin-architecture-foundation`.
- Existing KIE models remain; Gemini 3.5 Flash is omitted.
- New model support is gated to app version 0.7.0 and above.
- KIE Claude family support is the first implementation target; catalog ordering follows by model family.
- User will apply Development catalog SQL; no Production changes are authorized.

## Implementation stages

1. Inspect current AI Gateway transport, credential, response, and verification contracts.
2. Implement KIE Claude Messages transport and focused tests.
3. Prepare a versioned Development catalog publish SQL preserving existing entries and grouping sort order by model family.
4. Run focused automated verification; use only a safe Development credential path for real model checks.

## Progress and verification

- Confirmed `catalog-registry.js` excludes models whose `(kind, provider, transport)` tuple is absent from the local Gateway support registry.
- Confirmed current KIE text transports are `kie_responses` and `kie_openai_chat`; `kie_claude_messages` is not yet implemented.
- Created the requested feature branch. Pre-existing uncommitted `package.json` and `package-lock.json` version changes to 0.7.0 were preserved and are not part of this feature's scope.
- Implemented the KIE Claude Messages transport, including model-declared route selection, fixed endpoint/auth handling, response normalization, and KIE account-level connection verification.
- Added fixtures for catalog discovery, request/response translation, transport selection, fixed endpoint/auth, and app-version gating.
- Route resolution now honors each model's declared transport. This fixes both `text.generate` dispatch and `models.list` filtering when KIE exposes multiple text protocols.
- Added Development-only catalog publish SQL snapshots, gated to app `0.7.0`; they activate the three KIE Claude entries, group text/image models by family, retain existing entries, and verify Gemini 3.5 Flash is omitted.
- Focused AI Gateway and model-configuration tests pass (61 tests); `git diff --check` passes. SQL was not executed and live KIE generation was not run.
- Updated ordering to group KIE model families and order models using explicit catalog metadata. Based on the direct Anthropic model list, added a `2026-10-21.4` Development publish/rollback pair ordering KIE Claude Opus → Sonnet → Haiku; KIE Fable is not added because it is not in the current KIE scope.
- Traced the subject-only request end to end. The blog composer creates one full prompt with output contract, style/length profile, strategy, image instructions, and subject. Blog Writing sends it as a user prompt. Found and fixed a routing defect in the shared AI Generation service: it discarded catalog `transport` when constructing the Gateway model selection, allowing the Gateway to choose the first KIE text protocol rather than Claude Messages. Added a composition-level test asserting the full prompt reaches KIE Claude as one user message; focused checks pass.
- Added a safe shared text-generation start log containing provider, display model, model ID, transport, and per-role system/user prompt character counts. Prompt bodies are never logged; character counts are a cost-size proxy, not exact provider token counts.
- A real Blog Beta run then exposed the same manifest-contract omission on `image.generate`: the application forwarded catalog transport, but the operation model schema rejected it before KIE was called. Added the transport field and Host-contract coverage for KIE image dispatch.
- User requested and approved the application version update to `0.7.0`; `package.json` and lockfile metadata are synchronized.
- User validated KIE Claude text generation and KIE Nano Banana 2.1 image generation through Blog Beta. These live runs initially exposed the transport contract/routing defects recorded above; after correction, the user reported both new paths working.
- Final review against `codex/fbr/plugin-architecture-foundation` found no merge-blocking issues. `git diff --check` passes. Focused AI Gateway, model configuration, generation, and content API checks passed during implementation; the broad full suite is intentionally deferred per the user's request to combine comprehensive testing later.
- Development catalog publish/rollback SQL is included but has not been executed by this task. Final UI acceptance beyond the user's reported model checks remains with the user.

## Remaining risks and follow-up

- Live verification covered Claude Sonnet 5.5 and Nano Banana 2.1. Haiku 5.5, Opus 5.5, and other catalog models were not individually exercised.
- User must apply the Development catalog SQL and perform any remaining UI acceptance.
