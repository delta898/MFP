# Keyword AI Readiness Development

- Branch: `codex/fix/keyword-ai-readiness`
- Base/parent branch: `release/v0.5.0`
- Start date: 2026-09-15
- Status: Ready for manual review

## User need and goal

The keyword analysis and AI title recommendation dialog currently discovers a missing AI configuration only after the title request fails. Improve the dialog so users can understand what remains available, why an AI action is unavailable, and when keyword analysis is running.

## Scope

- Keep keyword analysis available without an AI text model.
- Surface text-model readiness before AI title recommendation is attempted.
- Provide a direct route to AI settings when configuration is missing.
- Disable keyword analysis while the subject is empty and prevent duplicate requests.
- Reuse the established indeterminate progress pattern for keyword analysis.
- Preserve the last valid result when a later request fails where practical.
- Add focused contract and UI regression coverage.

## Non-goals

- Changing keyword metrics, quota policy, or AI title prompt behavior.
- Requiring AI configuration for keyword analysis.
- Redesigning unrelated discovery dialogs or settings pages.
- Modifying release version metadata or the user's backup files.

## Agreed design

1. Opening the dialog remains allowed because keyword analysis does not require AI.
2. The AI title section displays a concise setup notice and disables its action when the text model is unavailable.
3. The subject input controls keyword-analysis availability; whitespace-only input is invalid.
4. Analysis displays a clear progress state, sets busy semantics, and blocks duplicate execution.
5. Late AI configuration failures use a user-facing recovery message instead of exposing raw credential wording.

## Affected boundaries

- Configuration readiness response and its safe AI readiness field.
- Keyword analysis/title recommendation modal markup and lifecycle state.
- Shared settings navigation behavior.
- Focused UI contract/browser regression fixtures.

## Implementation stages

1. Confirm and expose the canonical text-model readiness contract.
2. Add modal readiness, validation, progress, and recovery behavior.
3. Add focused automated tests and run the relevant browser smoke gate.
4. Record manual checks and remaining risks before merge review.

## Progress and verification

- Branch and development record created.
- Reused `setup.ai.configured` from the existing safe configuration-status response; no credential data is exposed.
- Added a scoped AI setup notice and direct navigation to the writing-model settings card while leaving keyword analysis available.
- Added whitespace-aware analysis availability, busy semantics, duplicate-request protection, and an explicit analysis button label.
- Preserved the last successful analysis when a later refresh fails.
- Replaced raw missing-credential title errors with a user-facing setup recovery message.
- Corrected the existing keyword-analysis progress bar, which had no width and rendered invisibly.
- Focused static UI, JavaScript, structure, and style contracts: passed (25 tests).
- Browser UI smoke: passed (357 fixture requests), including analysis progress, AI-unconfigured guidance, empty-input availability, and settings navigation.

## Manual checks still required

- Confirm the notice hierarchy and responsive layout in each installed design style.
- Confirm that saving a valid writing model and returning to the dialog enables title recommendation.
- Confirm the final Korean wording in the clean first-install flow.

## Remaining risk

- Readiness is refreshed whenever the dialog opens. If that read itself is temporarily unavailable, the server remains the final validator so a previously working AI action is not incorrectly blocked.
