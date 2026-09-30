# SNS Live Preview Development

- Branch: `codex/sns-live-preview`
- Base/parent branch: `release/v0.5.5`
- Start date: 2026-10-01
- Status: In progress

## User need and goal

Give users an at-a-glance preview of an SNS post while they compose it, so they can see the message and selected image together without pretending to reproduce each destination platform's exact UI.

## Scope and non-goals

In scope:

- Split the SNS composer into a left editing area and a right live preview at suitable desktop widths.
- Preview the current post body and selected images; support multiple images with a compact dot-based image switcher.
- Keep the existing image-selection and AI-generation workflow usable, adjusting its space only as needed for the two-column composition.
- Preserve a usable single-column layout at narrower widths.

Out of scope:

- A post title field or title preview (SNS posts in this workflow have no separate title).
- Platform-specific/Buffer-style mock previews.
- Video selection or generation.
- Changes to posting behavior, image upload contracts, or platform integrations.

## Proposed design and implementation stages

1. Inspect the current SNS composer structure, state, styles, and tests; identify post body and selected-image sources.
2. Add a responsive two-column composer with a lightweight live preview and image pagination dots.
3. Add focused UI contract coverage and run the relevant browser smoke after the composed flow is reviewable.
4. Hand off visual flows for user review; no merge, release, or publication without a separate request.

## Decisions and tradeoffs

- Use the current SNS composer as the visual reference; do not clone Buffer or a social platform.
- The preview contains the post body and the currently selected image only; there is no separate title.
- Keep image selection controls in the editing column and use dots only for navigating previewed images, avoiding duplicate asset-management controls.
- The user's existing uncommitted changes at branch start are unrelated and must remain untouched.

## Progress and verification

- 2026-10-01: Created `codex/sns-live-preview` from `release/v0.5.5` at `c4a7b8d6` (`chore: prepare v0.5.5-dev1 release checkpoint`).
- 2026-10-01: Preserved pre-existing modified `README.md`, untracked `config/writing_profile.json`, other demo scenarios, and `tmp/`.
- 2026-10-01: Added a responsive left-editor/right-preview composition. The preview mirrors the current message body and selected local images; dot buttons switch images and clamp safely when the image list shrinks. The empty state remains a simple placeholder; no title or platform frame is introduced.
- 2026-10-01: Capped the image selection grid's desktop width so it does not dominate the new split layout; below the responsive breakpoint, editor and preview stack vertically.
- 2026-10-01: `node --check` passed for the SNS composer controller and updated contract test; the SNS design-system and publishing structure contracts passed (4 tests).
- 2026-10-01: `npm run test:ui-browser` passed (486 fixture requests; external font/RSS requests were intentionally blocked by the smoke harness; no page errors).
- 2026-10-01: `git diff --check` passed. No production service, paid AI model, publish endpoint, or account data was used.
- 2026-10-01: After user visual feedback, changed the desktop layout to a narrow editor column and wider preview column. The preview now spans the body and image rows; channel selection and publish actions remain full-width below them. Image picker tile sizing remains capped as before; narrow screens continue to stack the editor and preview.
- 2026-10-01: Added a layout contract assertion for the preview's two-row span. Focused SNS contracts passed (4 tests), and the updated browser UI smoke passed (487 fixture requests, no page errors; external font/RSS requests blocked by the harness). The browser smoke needed sandbox-external execution because the sandbox denied the local test server's listen call.

## Remaining work and risks

- User visual review remains pending: check the narrower editor/wider preview proportions at desktop width, zero/one/multiple-image states, dot switching after image removal, and the stacked layout on a narrow window.
- Automated tests do not confirm visual balance; adjust after user review if needed.
## Follow-up: image grid and publish-time platform limits

- User decision: keep a 2:1 content-to-preview layout; shrink image tiles to roughly half their former width and height; pin the add/generate tile as the first grid cell and let images flow beside it and wrap naturally. Allow up to 10 images independent of selected channels; validate channel-specific `max_assets` only when the user attempts to publish and explain which channel requires reducing images or deselection.
- Implemented a live image count hint (`n/10`), fixed-position add/generate tile, 10-image guard for local and AI additions, and publish-time channel asset-limit dialog. Publishing remains available when channel limits are exceeded until the user explicitly attempts it; no publish request is sent in that case.
- Verification: SNS design-system contract test passed. Full UI browser smoke passed (483 fixture requests, no page errors). Visual review remains with the user.
- 2026-10-01: Refined the image add tile to a compact, accessible AI+image icon that visually pairs with the adjacent plus button. Reordered preview into message, image, then image dots; added horizontal pointer-swipe navigation while retaining accessible dot controls. Focused contract and browser UI smoke passed (490 fixture requests, no page errors); `git diff --check` passed. Visual review remains pending.
- 2026-10-01: Removed the idle image-action footer frame and reduced both icon controls to 40px borderless buttons. Unified preview surfaces with the app palette, constrained media and image sizing to prevent spillover, and added browser assertions for containment and button geometry. SNS design contract and full UI browser smoke passed (490 fixture requests, no page errors); `git diff --check` passed.
- 2026-10-01: Follow-up polish keeps the add-image tile square while entering an AI prompt, hides the oversized empty-state label, and uses compact icon-only generate/cancel controls with accessible names and tooltips. Added inner spacing to the live preview. AI text optimization now requires a configured Chat Model and message text, but no channel selection; with no channel selected it optimizes generally and explicitly defers channel-length validation until publish. Focused design/service tests passed (31 tests); browser smoke passed (488 fixture requests, no page errors). Manual visual confirmation remains with the user.
- 2026-10-01: Further visual refinement removes the redundant prerequisite sentence from the AI tooltip, centers the paired image-action icons and raises the empty-state art slightly. Live image preview now follows each image's natural aspect ratio and scales portrait media against a viewport-height cap, instead of forcing all images into a square; frame sizing responds to window resize. Focused SNS/service tests passed (31 tests), browser smoke passed (487 fixture requests, no page errors), and `git diff --check` passed.
- 2026-10-01: Image selection cards now keep a fixed square footprint matching the add-image tile. Removed visible file-name captions and moved download / AI-regeneration actions into a common bottom overlay, revealed on hover or keyboard focus (and kept visible on touch layouts). Added browser assertions for stable card geometry, absent captions, and hover actions. First browser run exposed that the existing regeneration test needed to hover the card before clicking its newly hover-revealed action; test flow corrected. Focused SNS/service tests passed (31 tests), browser smoke passed (485 fixture requests, no page errors), and `git diff --check` passed.
- 2026-10-01: AI text optimization now has an explicit confirmation step. Clicking `AI 최적화` reveals `최적화 적용` and `취소`; the model request (and any provider cost) is not triggered until the user confirms. Cancellation returns to the original control, while success retains the existing undo-to-original behavior. Focused SNS/service tests passed (31 tests), browser smoke passed (488 fixture requests, no page errors), and `git diff --check` passed.
- 2026-10-01: Added accessible previous/next arrow controls over the live-preview image, alongside the existing pagination dots and swipe gesture. Arrows wrap from first to last and last to first, and are omitted when fewer than two images are selected. Focused SNS design contract passed; browser smoke passed (486 fixture requests, no page errors) on retry after an unrelated dashboard timing assertion failed once; `git diff --check` passed.
- 2026-10-01: Matched previous/next arrow insets at 12px and made them appear on image hover or keyboard focus. Kept arrows visible on hoverless/touch devices. User screenshot review showed the preview media itself could overflow its padded container because the natural-ratio sizing calculation included the container's padding; sizing now subtracts that padding and browser smoke asserts equal arrow insets plus media containment. Focused SNS design contract passed; browser smoke passed (480 fixture requests, no page errors); `git diff --check` passed. The initial smoke attempt correctly exposed that the hover-only arrow needed an explicit hover in the test before clicking; test interaction was updated.
