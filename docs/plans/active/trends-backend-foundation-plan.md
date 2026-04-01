# Trends Backend Foundation Plan

## Context
- `BlogGenius` is a user-facing desktop app used by multiple end users.
- A new Naver trends collection/export system is needed for operator-owned backend data collection and public download UX.
- The new system should reuse trend collection logic where possible, but it must not be packaged into the desktop app release artifacts.

## Goal
Create a separate operator-only trends backend lane inside the same repository, with clear runtime and packaging boundaries.

## Agreed Execution Surfaces
```text
src/                        # existing BlogGenius app remains in place
apps/
  trends/
    trends-collector/       # operator-only CLI
    trends-api/             # ingest/export API
shared/
  naver-trends-core/        # shared Playwright collection and normalization logic
wordpress/
  trends-download-ui/       # WordPress integration assets/UI
```

## Responsibilities

### `src/` (`BlogGenius`)
- Continue to serve the existing desktop app only.
- May reuse `shared/naver-trends-core` later.
- Must not depend on operator-only runtime code from `apps/trends/trends-collector` or `apps/trends/trends-api`.

### `apps/trends/trends-collector`
- Operator-only CLI.
- Uses Playwright to collect Naver trends.
- Produces normalized trend payloads via shared core.
- Pushes data to `apps/trends/trends-api`.
- Cron/systemd scheduling is an operations concern and stays outside repository logic.

### `apps/trends/trends-api`
- Owns all Supabase read/write access for the trends backend.
- Validates ingest payloads from the collector.
- Upserts trend data into Supabase.
- Serves query/export endpoints for CSV/XLSX downloads.
- Is the only component allowed to hold Supabase service-role credentials.

### `shared/naver-trends-core`
- Extracted shared module for:
  - Playwright launch/session handling needed for trends collection
  - Naver date selection and trend scraping helpers
  - normalization of collected trend items into stable payload contracts
- Must remain reusable by both `BlogGenius` and `apps/trends/trends-collector`.
- Runtime config for the operator-only trends system is shared through `apps/trends/.env`.
- Should avoid app-UI concerns and operator API concerns.

### `wordpress/trends-download-ui`
- WordPress-side integration assets only.
- UI submits filter parameters to `apps/trends/trends-api`.
- Preferred integration mode is server-side WordPress PHP calls, not browser-direct Supabase access.

## Initial Data Flow
1. Operator runs `apps/trends/trends-collector`.
2. Collector uses `shared/naver-trends-core` to fetch and normalize trend data.
3. Collector calls internal ingest endpoint on `apps/trends/trends-api`.
4. API validates and upserts into Supabase.
5. WordPress UI requests filtered exports from API.
6. API returns CSV/XLSX download responses.

## Build And Packaging Rules
- Root `build.sh` and `.github/workflows/build.yml` remain dedicated to `BlogGenius`.
- `apps/` and `wordpress/` must be excluded from desktop app packaging.
- `shared/` stays importable by the desktop app, so shared code may be bundled transitively when the app depends on it.
- Collector and API will have their own package/runtime lifecycle and are not part of desktop release tags or packaged bundles.
- The collector is operator-only and is expected to run as a Node CLI, not as a user-facing packaged app.

## Rollout Phases

### Phase 1: Foundation
- Add docs, directory scaffolding, and packaging boundaries.
- Introduce placeholder structure under `apps/`, `shared/`, and `wordpress/`.

### Phase 2: Shared Core Extraction
- Extract Naver trends Playwright collection logic from the current app into `shared/naver-trends-core`.
- Keep app behavior unchanged while switching the app to consume the shared module.

### Phase 3: Collector CLI
- Add `apps/trends/trends-collector` entrypoint and config contract.
- Support one-shot collection and API push.

### Phase 4: API + Supabase
- Add `apps/trends/trends-api`.
- Define ingest/query/export contracts.
- Add Supabase schema and upsert rules.

### Phase 5: WordPress UI
- Add server-side WordPress integration.
- Support date/category filters and CSV/XLSX download.

## Non-Goals
- Reworking the existing desktop app into an `apps/blog-genius-app` layout right now.
- Packaging the collector as a public distributable.
- Letting WordPress connect directly to Supabase service-role credentials.

## Immediate Next Step
- Stabilize the first shared-core and operator-only runtime implementation.
- Add Supabase schema/reference docs and keep desktop packaging boundaries aligned with the actual shared imports.
