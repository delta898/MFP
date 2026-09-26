# Card News Free Plan Watermark

- Branch: `codex/feature/card-news-free-watermark`
- Start date: 2026-09-26
- Base/parent branch: `dev`
- Status: Implemented; focused verification complete, awaiting review

## User need and goal

Card News users need a reusable image signature. Free users should receive a subtle fixed `BlogGenius.kr` signature, while verified non-Free users may choose a custom signature or leave it empty. The setting should persist across app restarts, and every outgoing path must enforce the plan on the app side.

## Scope

- Apply the signature consistently across Card News preview, individual download, ZIP export, and SNS publishing.
- Preserve stored originals; render the signature only into outgoing image bytes.
- Persist the user's editable signature in localStorage across app restarts.
- Determine entitlement in the BlogGenius app's existing image/export/publishing API. If verification fails, behave like Free: force `BlogGenius.kr` and lock editing.
- Show a compact, state-specific tooltip for locked signature settings; do not navigate away to account/plan pages.
- Add focused tests for Free, paid, empty signature, and plan-verification failure behavior, and for parity across output paths.

## Non-goals

- Modify generated or user-uploaded source files in place.
- Send or persist the custom signature on the license service.
- Trust a client-provided plan or allow the client to bypass the Free signature.
- Change SNS channel selection, publishing behavior, or plan pricing.

## Proposed design

Introduce a shared app-side image preparation boundary for Card News outputs. It reads the immutable original and resolves the effective signature from the current plan and browser-saved preference. Each preview records its effective signature. All result-image, download, ZIP, and SNS requests carry that expected signature; the app API independently force-checks entitlement at action boundaries and rejects stale snapshots before delivering bytes or beginning upload. When the effective signature differs, the UI refreshes the preview, explains the change, and requires a second user action. The editable string stays in browser localStorage and is not written to or sent to the license service.

## Decisions and tradeoffs

- User confirmed Free-only watermarking; non-Free plans remain unmodified.
- User clarified that plan-check failures must behave like Free: fixed `BlogGenius.kr`, not editable.
- A verified non-Free plan uses the locally persisted custom string; an empty value omits the signature.
- “서버” here means BlogGenius's own API in the running app, which performs image/export/publish work and independently checks the license. No signature is stored remotely.
- A small explanatory tooltip appears only when signature editing is locked (Free or plan-check failure); it distinguishes a verified Free plan from a failed plan check. There is no account/plan link in this control.
- Original assets remain unchanged so later plan changes do not require regenerating Card News.
- The user-facing consistency rule includes user awareness: if the effective signature changes after preview, do not silently substitute it for download, ZIP, or SNS. Refresh, notify, and require the user to initiate the action again.

## Implementation stages

1. Inspect existing image delivery/export/publish composition and license status boundaries. (Complete)
2. Implement the shared outgoing-image preparation service and compose it into all applicable output paths. (Complete)
3. Add focused unit/contract tests and update this record with results and follow-up risks. (Complete)

## Progress and verification

- Branch created from `dev`; working tree was clean at branch start.
- Added `src/card-news/outgoing-image-service.js`: resolves plan status in the app API; Free or failed checks get a subtle, inset fixed `BlogGenius.kr` signature, while verified non-Free plans use the custom signature or original bytes when blank.
- Kept generated and imported originals immutable. The shared prepared bytes now feed preview/individual-download responses, ZIP entries, and SNS media uploads.
- Disabled caching for the image endpoint so plan changes cannot serve a stale watermarked/unwatermarked variant.
- Added the Card News image signature control in the completed-card rendering/preview header, not the generation settings. Its checkbox and 48-character custom value are saved in localStorage; verified non-Free users can independently turn it off even when a value is retained. Free/unverified users see the fixed, checked, disabled `BlogGenius.kr` value. A compact help icon explains the restriction only when editing is locked; no account/plan link is shown.
- Matched the control to the existing Card News muted panel/input styling and made it responsive; moved it beside the completed-card heading in the previously unused header space.
- Following visual review, compacted the signature settings into one inline row in the completed-card header and removed the explanatory helper copy. The text input now explicitly uses the same surface, border, typography, and focus tokens as other Card News controls.
- Diagnosed the Test-plan screenshot: confirmed non-Free plans were editable, but the help copy treated every non-`free` code as verification failure, and shared tooltip CSS overrode the trigger's `hidden` attribute. Added explicit plan-verification metadata to distinguish verified Free from lookup failure; the help icon now stays hidden for verified Test/pro plans and only appears for locked states. Expanded the edit field to use available width and moved the help icon to the row's far edge.
- Kept the signature control in the right-side result area and aligned its left edge exactly with the action buttons by placing both in a shared shrink-to-content container.
- Shortened the paired image transfer actions to `ZIP 내보내기` / `ZIP 가져오기` and simplified bulk image actions. Kept the `서명` label on one line and constrained the edit field so it no longer dominates the header.
- Reworked the watermark geometry to estimate mixed-script glyph widths (including full-width Hangul), center the label horizontally and typographically vertically in its pill, and scale long values to fit. Raster inspection of `감자공주`, `Amadeus`, and `Wolfgang Amadeus` showed near-symmetric horizontal pixel insets and no clipped glyphs.
- The custom string travels only in the outgoing request to the BlogGenius app API; it is not persisted server-side or sent to the license provider. The API independently resolves entitlement and ignores custom text for Free/unverified plans.
- A custom signature may remain in localStorage after a downgrade, but it is inactive while the verified plan is Free; the server forces `BlogGenius.kr`. If the user later upgrades, the retained custom value becomes editable and usable again.
- The UI records the effective signature used for its current preview. Download clicks preflight the current policy and fetch artifacts through the app API; stale expected signatures return a conflict. ZIP and SNS validate before creating the output/uploading media. A plan transition detected at any boundary refreshes the preview and stops the first action.
- Added tests for plan outcomes, SVG escaping, signature policy, one entitlement lookup per batch, prepared bytes flowing to ZIP and SNS, and prepared-image serving.
- Verification: focused Card News/API/shell tests passed (94 tests); `git diff --check` passed. Browser smoke completed all Card News phases and later failed in the unrelated Blog Beta local-manuscript assertion (`6 !== 5` at `scripts/test-ui-browser-smoke.js:4325`).

## Final result and remaining checks

Implementation is on the feature branch. Manual visual review remains: confirm the signature's perceived prominence on varied card artwork, confirm a changed plan refreshes the preview and requires a second click, then check individual download, ZIP, and SNS output. Browser smoke reaches and passes its Card News phases but the overall test remains red on the unrelated Blog Beta assertion above. A full unit suite is not run for this feature-slice handoff; it remains required before a parent feature branch is merged to `dev` (this branch is based directly on `dev`).
