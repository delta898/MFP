# Appearance Style Expansion Development

- Branch: `codex/feat/appearance-style-expansion`
- Base/parent branch: `dev`
- Start date: 2026-09-27
- Status: Complete; merged into `dev`

## User need and goal

Add four visually distinct appearance styles to Settings > Appearance before the planned v0.5.3 release: Cerulean Atelier, Amethyst Salon, Techwear, and Goblincore. Preserve the existing shared design-token architecture and make the choices previewable and testable.

The user specifically noted that Techwear should reflect the restrained, functional urban style commonly associated with technical garments, rather than a strongly orange cyberpunk interpretation. Its palette was adjusted toward charcoal/blue-gray with a restrained glacial-blue action color.

## Scope and non-goals

In scope:

- Register and load the four appearance styles.
- Define each style through shared UI tokens and previews.
- Add focused appearance contract and browser smoke coverage.
- Add an actionable backlog item for future themed style series planning.
- Refine Techwear palette based on user feedback.

Out of scope:

- Altering existing styles or unrelated UI surfaces.
- Release version changes, packaging, publishing, or deployment.
- Creating image-generation styles; this work concerns application appearance themes.

## Design and decisions

- Keep styles token-driven and loaded through the existing style bootstrap.
- Make the four new styles distinct in palette and shape language.
- Techwear keeps a dark charcoal technical foundation and compact geometry; saturated orange is replaced with muted glacial blue (`#78b8ca`) for primary actions, focus, and card emphasis. Semantic warning/status colors remain unchanged.
- User owns final visual acceptance.

## Implementation and verification

- The feature changes were present as uncommitted edits on `dev`; they were preserved and carried to this feature branch without committing or changing `dev` history.
- Focused appearance contract test passed: `node --test scripts/settings-next-appearance-contract.test.js`.
- Browser smoke passed: `npm run test:ui-browser` (519 fixture requests; no page or console errors).
- The first full-unit gate exposed a stale Card News signature source-shape assertion: production code captured `signature`, `expectedSignature`, and `previewToken` before locking controls, while the test expected inline property expressions. Updated the contract to verify the captured values and shorthand request fields without changing publishing behavior.
- Focused Card News shell contract passed: 17/17.
- Full gate passed: `npm run test:unit` (security audit: 0 vulnerabilities; 2,008 passed, 1 skipped, 0 failed across 368 test files).
- Merged into `dev` by fast-forward at `4a339aed`.
- Manual visual review remains with the user.

## Remaining work and risks

- No engineering work remains for this feature. The user may visually review the appearance styles in the app, especially Techwear contrast and distinction among all four styles.
- No push or release action is included in scope.
