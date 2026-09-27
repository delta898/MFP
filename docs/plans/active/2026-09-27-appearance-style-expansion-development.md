# Appearance Style Expansion Development

- Branch: `codex/feat/appearance-style-expansion`
- Base/parent branch: `dev`
- Start date: 2026-09-27
- Status: In progress

## User need and goal

Add four visually distinct appearance styles to Settings > Appearance before the planned v0.5.3 release: Cerulean Atelier, Amethyst Salon, Techwear, and Goblincore. Preserve the existing shared design-token architecture and make the choices previewable and testable.

The user specifically noted that Techwear should reflect the restrained, functional urban style commonly associated with technical garments, rather than a strongly orange cyberpunk interpretation. Its palette is being adjusted toward charcoal/blue-gray with a restrained glacial-blue action color.

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
- Manual visual review remains with the user.

## Remaining work and risks

- Review the final diff and ensure the style registry, previews, and documentation are coherent.
- Run any additional focused tests warranted by the final diff.
- Keep the branch uncommitted until the user requests a commit; do not merge without explicit approval.
- Verify appearance visually in the app, especially Techwear contrast and the distinction among the four styles.
