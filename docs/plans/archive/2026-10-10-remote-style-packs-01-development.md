# Remote Style Packs 01 Development

- Branch: `codex/remote-style-packs-01`
- Base/parent: `codex/static-site-builder-main`
- Start date: 2026-10-10
- Status: Implementation complete; merged into parent; manual UI acceptance pending

## User need and goal

Move selectable BlogGenius UI style packs out of the app bundle and make Amade the source of style catalog metadata and token values. Retain only Warm Editorial as the app's built-in baseline for first launch and offline use.

## Scope

- Remove app-bundled selectable style metadata/token values for all styles except Warm Editorial.
- Keep app-owned component CSS rules and the semantic token contract.
- Preserve remote catalog retrieval, local cache, selected style behavior, and safe fallback semantics.
- Update tests and architecture documentation to reflect the resulting ownership boundary.

## Non-goals

- Menu placement/layout options (left/right).
- Remote CSS or executable package content.
- Version bumps, commits, merges, pushes, or release work.

## Proposed design and boundaries

Amade supplies selectable style metadata and token maps. The local API validates remote styles and caches them under the workspace. The renderer loads a locally cached catalog before refreshing remotely, applies validated token values, and falls back to the single bundled Warm Editorial baseline if no valid remote catalog/cache is available. The app continues to own CSS rules, token names, validation, and layout.

Affected boundaries: `src/site-hosting/github-design-style-catalog.js`, `ui/scripts/foundation/style-system.js`, `ui/scripts/foundation/design-style-token-contract.js`, `ui/styles/styles/`, `ui/styles.css`, relevant settings UI and tests, and `docs/architecture/design-style-system.md`.

## Decisions

- Keep Warm Editorial as the sole built-in visual style and offline/first-run fallback.
- Do not expose that fallback in the selectable remote list when absent from the authoritative Amade catalog.
- Remote CSS/JavaScript is out of scope; only validated token data is consumed.
- Layout choices such as left/right navigation are independent settings and out of scope for this branch.

## Progress

- 2026-10-10: Confirmed starting branch was `codex/static-site-builder-main`, worktree clean, and created feature branch `codex/remote-style-packs-01`.
- Investigation confirmed current Amade catalog integration already fetches and validates metadata/token maps; app bundle still includes ten selectable style registry entries and their CSS token files.
- 2026-10-10: Removed all selectable style registry metadata and per-style CSS token modules except the Warm Editorial baseline; removed the old compatibility token pack and use Warm Editorial tokens for legacy compatibility scopes. Updated renderer bootstrap to apply cached remote tokens before stylesheet paint, while app runtime remains authoritative for full token validation.
- 2026-10-10: Updated the browser smoke server to supply Amade-style catalog fixtures and changed style-switch checks to apply the validated remote packages. This keeps UI regression coverage aligned with remote ownership.
- 2026-10-10: Added the app-wide menu position preference as a separate child stage; left/right placement remains app-owned and does not enter style package metadata or tokens.

## Verification and follow-up

Passed focused style catalog, style-system, CSS composition, and appearance UI contract checks (43 tests during implementation); the final integration candidate passed 33 relevant catalog, style-system, responsive-density, and appearance tests. Full browser UI smoke passed with 484 fixture requests; external font requests were blocked by the smoke harness. `git diff --check` passes. The broader UI style structure check had one pre-existing failure: `ui/styles/features/site-hosting-create.css` is 981 lines against its 900-line limit, and the base branch has the same 981-line file.

Manual UI acceptance remains: confirm the remote style list appears, style switching works, a cached choice is visible on startup, and Warm Editorial appears when no usable remote cache/catalog is available. The feature branch has been committed and is being integrated into `codex/static-site-builder-main`; no push has been performed.
