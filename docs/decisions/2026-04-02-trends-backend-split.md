# 2026-04-02 Trends Backend Split

## Context
- The repository currently centers on a multi-user desktop app.
- A new Naver trends collection/export system is needed for operator-owned backend data collection and a WordPress-based public download UI.
- Reusing the existing Playwright trends collection logic is desirable.
- Mixing operator-only backend artifacts into the desktop app package is not acceptable.

## Decision
- Keep the work in the same repository.
- Do not add the new backend functionality directly into the desktop app surface.
- Introduce an operator-only trends workspace under `apps/trends/`:
  - `apps/trends/trends-collector`
  - `apps/trends/trends-api`
- Introduce reusable trends collection logic under `shared/naver-trends-core`.
- Keep WordPress integration assets under `wordpress/trends-download-ui`.
- Keep desktop app packaging and release flows scoped to the current `BlogGenius` app only.

## Consequences

### Positive
- Reuses trend collection logic without forcing a full repository split.
- Keeps desktop app release artifacts clean.
- Gives the operator backend and the desktop app separate deployment lifecycles.
- Centralizes Supabase write/read responsibility in the API instead of leaking it to WordPress.

### Negative
- The repository becomes a mixed workspace with more than one runtime surface.
- Shared module extraction must be done carefully so the current app does not regress.
- Build and packaging rules must explicitly ignore the new operator-only directories.
