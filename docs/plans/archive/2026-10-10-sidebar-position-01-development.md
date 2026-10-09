# App-wide Sidebar Position Setting

- Branch: `codex/sidebar-position-01`
- Base/parent: `codex/remote-style-packs-01`
- Start date: 2026-10-10
- Status: Complete; manual UI acceptance remains

## User need and goal

Let the user choose whether the app's primary navigation menu appears on the left or right. The setting is app-wide and independent of the selected visual style.

## Scope

- Add one shared Left/Right layout selector to the upper-right area of Settings → Appearance, above the style catalog.
- Persist the selection locally and apply it to the app shell and appearance previews.
- Keep the setting separate from design-style package metadata and tokens.
- Adapt desktop and responsive behavior while preserving mobile navigation interactions.
- Add focused UI contract and browser regression coverage; update architecture documentation if the ownership contract changes.

## Non-goals

- Per-style menu position defaults or overrides.
- Changes to style package token/schema contracts.
- Commit, merge, push, release, or unrelated navigation redesign.

## Proposed design and affected boundaries

Use a single local app preference as the source of truth, represented by a semantic root attribute/class and a shell layout rule. The control belongs to the Settings Appearance UI; the shared shell owns applying the preference, and style preview cards remain focused on style tokens.

Likely affected areas: `ui/partials/views/settings-next.html`, `ui/scripts/features/settings-next/appearance.js`, shell lifecycle/bootstrap, shell layout CSS and composition manifest, focused settings/browser tests, and design system documentation.

## Decisions

- The preference is app-wide rather than per style.
- Use two compact layout thumbnails, labeled Left and Right, in the upper-right of the style list.
- Menu placement changes shell layout without changing style tokens.

## Progress

- 2026-10-10: Created this feature branch from `codex/remote-style-packs-01`; confirmed the parent branch has the remote style-pack commit.
- Added an app-wide Left/Right layout selector to Settings → App → Appearance. The setting is persisted in local storage, restored before paint, and represented by `html[data-sidebar-position]`; it remains independent of remote design-style metadata.
- Added desktop shell reversal and right-edge mobile drawer positioning, including mobile quick-mode corner treatment. Updated the design-style architecture contract to keep personal shell placement outside style packages.
- Added focused contract checks for the control, persistence/bootstrap, desktop shell, and responsive drawer. Added the desktop interaction to the browser smoke flow.
- Browser smoke initially exposed an unrelated stale selector in the existing flow (the chat model choice belongs under the AI tab); corrected the test to navigate to the owning tab. The full browser smoke then passed. An additional viewport-resize experiment destabilized later tab visibility in the long smoke flow, so it was removed; responsive drawer placement remains covered by CSS contract assertions and needs hands-on mobile review.
- 2026-10-10: Replaced the text-only left/right segmented buttons with two compact layout thumbnails, each labeled and exposed as an accessible pressed-state button. The diagrams show the rail and content arrangement; selected state uses the shared action color. Updated the CSS cache key and contract coverage.

## Verification and follow-up

Focused checks passed: `node --test scripts/settings-next-appearance-contract.test.js scripts/design-style-foundation.test.js` (24/24), JavaScript syntax checks, and `git diff --check`. Browser smoke passed with 484 fixture requests and no page errors.

Manual UI acceptance should verify left/right placement, persistence after reload, style switching independence, collapsed sidebar behavior, and that the mobile drawer opens from the selected edge. No commit, merge, or push has been made.
