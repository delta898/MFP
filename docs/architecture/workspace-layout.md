# Workspace Layout

## Goal
Keep the user-facing desktop app and the operator-only trends backend in the same repository without mixing their release artifacts, runtime responsibilities, or deployment chains.

## Runtime Baseline
- The repository-wide development and build baseline is Node.js 24 or newer.
- `.nvmrc`, root package metadata, standalone app manifests, local build scripts, and GitHub Actions must remain aligned with this baseline.
- Node.js 24.x is the recommended version for reproducible local and release builds.

## Adopted Layout
```text
src/                        # existing BlogGenius app
apps/
  trends/
    trends-collector/       # operator-only collector CLI, commands, config
    trends-api/             # operator-only ingest/export API and deployments
shared/
  naver-trends-core/        # shared Naver trends collection logic
wordpress/
  trends-download-ui/       # WordPress integration assets
```

## Boundary Rules

### `src/`
- Remains the current desktop app surface.
- Owns user-facing app runtime, UI, and packaging.
- May consume shared modules.
- Must not pull in operator-only app code from `apps/`.

### `apps/`
- Contains standalone execution surfaces.
- Each app owns its own runtime entrypoints, environment contract, and deployment lifecycle.
- `apps/trends/` is the operator-only trends system workspace.
- `apps/trends/trends-collector` is an internal CLI.
- `apps/trends/trends-api` is an internal service/API.
- Human-facing component commands live under the owning app's `commands/` directory.
- Docker API Compose units live under `trends-api/docker/deployment/<environment>/`; the Cloudflare runtime lives separately under `trends-api/workers/`.
- App-specific operator configuration lives with the owning app rather than at `apps/trends/` root.

### `shared/`
- Contains reusable, product-agnostic modules.
- Shared code must stay free of desktop UI and service hosting assumptions.
- Shared modules expose stable contracts for both the desktop app and operator-only apps.
- Do not place operator-only secrets, deployment manifests, or runtime-only assets here.

### `wordpress/`
- Contains WordPress-specific integration code or assets only.
- Does not own backend data access or Supabase credentials.

## Packaging Rule
- Desktop app packaging only targets the current `BlogGenius` app.
- `apps/` and `wordpress/` must not be bundled into `BlogGenius.app` or release ZIPs.
- `shared/` is reusable code, so individual shared modules may be bundled transitively when the desktop app imports them.

## Local Card News Data

```text
workspace/card-news/
  projects/
    {project_id}/
      project.json          # confirmed source snapshot and project identity
  exports/
    {generation_id}/
      manifest.json         # generated cards and project_id reference
      card-*.png
```

- Project data is split by ID so adding projects does not grow one aggregate JSON file without bound.
- A generation references its owning project instead of duplicating the full source snapshot.
- The unsupported aggregate `workspace/card-news/projects.json` format is deleted when the project repository starts; it is not migrated.

## Local Site Hosting Data

```text
workspace/site-hosting/
  projects/
    {project_id}/
      project.json           # Project identity and settings
  sites/
    {site_id}/               # Independent Astro project root
      package.json
      src/
      public/
      .bloggenius/
        site.json            # Includes the owning project_id
```

- Project and Site directories are siblings. A Site's owning Project is determined by `project_id` in `.bloggenius/site.json`, not by filesystem nesting.
- Site IDs are unique within the shared `sites/` directory. Project site counts and Site lists are derived by matching that manifest field.
- Existing nested `projects/{project_id}/sites/` data is not migrated or read by the current storage contract.

## Deployment Rule
- Desktop app release continues through the root release pipeline.
- Trends collector and API are deployed separately from the desktop app.
- The current preferred trends deployment is a repository clone on the WordPress server, with the API bound locally and reached through `127.0.0.1`.
- WordPress UI is deployed through WordPress-specific channels and should talk to the trends API, not directly to Supabase service-role access.

## Dependency Direction
Preferred direction:

`src -> shared`

`apps/* -> shared`

Not:

`shared -> src`

`src -> apps/*`

## Current Transition Note
- The existing desktop app still lives in root `src/`.
- The repository is not being fully reorganized right now.
- New operator-only work starts under `apps/` and `shared/` so the current app remains stable while the backend lane is introduced.
