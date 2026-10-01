# AI Model Selection Without an API Key

- Branch: `codex/feature/ai-model-save-without-key`
- Base/parent branch: `release/v0.5.5`
- Start date: 2026-10-01
- Status: Implementation and automated verification complete; hands-on UI review pending

## User need and goal

Allow users to save an AI provider/model choice before entering its API key. The model preference should persist, while the UI accurately reports that the provider is not configured or connected. Saving a preference must remain distinct from testing the provider connection.

This avoids trapping users in Settings when “save and proceed” or “save and quit” is selected for a model whose key has not yet been entered. Users must still be able to discard changes and quit.

## Scope and non-goals

In scope:

- Separate AI model preference persistence from API-key readiness and connection verification.
- Preserve clear status semantics for missing key, configured-but-unverified, verified, and failed connection states.
- Ensure save-and-proceed and save-and-quit can persist a valid model selection without a key, while connection testing still requires the needed credentials.
- Add focused regression coverage for settings UI, save lifecycle, and status presentation.

Out of scope unless separately approved:

- Changing provider/model catalogs or adding models.
- Automatically testing or charging for a model connection during save/navigation/quit.
- Altering unrelated settings or release metadata.

## Proposed design and stages

1. Trace the renderer and server contracts for AI role saves, connection tests, secret preservation, and readiness presentation.
2. Define a persisted-preference contract that accepts a valid provider/model without requiring successful or configured credentials; preserve existing secrets when the key field is left blank.
3. Keep connection test validation explicit and report missing credentials as “설정 필요” without treating the saved model choice as unsaved.
4. Add focused contract/unit tests and run the narrowest UI regression that covers settings navigation and quit save behavior.
5. Update this record with implementation, test results, and any remaining manual UI checks.

## Decisions and tradeoffs

- The user directed this work to branch from `release/v0.5.5`, rather than `dev`.
- A model/provider preference is valid independently of API-key availability. Missing credentials affect readiness and connection testing, not whether the preference can be saved.
- Do not silently run a network connection test while saving or navigating; that action remains explicit.
- A blank secret field must not erase an already saved API key.

## Progress and verification

- 2026-10-01: Created this feature branch from `release/v0.5.5` after the user chose that base.
- 2026-10-01: Confirmed the current failure mode in the renderer: save-and-proceed calls AI role validation that rejects the selection if no API key is configured. The desktop quit guard reuses the same save path, so “저장 후 종료” also remains in the app on failure; “변경사항 버리고 종료” remains available.
- 2026-10-01: Updated AI role persistence to accept a valid model selection without requiring an API key. Connection verification remains a separate explicit action and still requires credentials. The UI reports “API Key 필요” for a selected model without a configured key and “확인 필요” when a key exists but the connection has not been verified.
- 2026-10-01: Added server persistence and UI contract regressions. Focused unit/contract tests passed (50 tests), and the browser UI smoke passed (382 fixture requests; 2 external font requests were blocked as expected). `git diff --check` passed.

## Remaining work and risks

- Hands-on desktop review is still needed for the original settings flow: choose a model with no key, select “저장 후 이동” and “저장 후 종료”, then verify the preference persists and the missing-key status is clear. Also confirm explicit connection check asks for the key without undoing the saved model.
- The full unit suite was not requested or run; no broad test approval was sought. No commit or merge has been made.
