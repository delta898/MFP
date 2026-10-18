# Site Hosting Source Reorganization

## Branch

- Branch: `codex/fbr/source-layer-reorganization`
- Start date: 2026-10-18
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (the source reorganization parent branch was created from this base)
- Status: Reorganization stage complete on the source reorganization parent branch; not committed

## User Need and Goal

The legacy `src/site-hosting/` directory groups code by feature name without distinguishing product workflow, persistence, external catalog transport, or desktop host responsibilities. Reorganize these modules according to the established role-plus-layer rule, update their callers, and remove the legacy directory while preserving Site Hosting behavior and persisted workspace data.

## Scope

- Move Site Hosting project/site workflows into `src/applications/site-hosting/`.
- Move project/site filesystem repositories into `src/adapters/storage/site-hosting/`.
- Move Amade GitHub catalog transports into `src/adapters/catalogs/amade/`.
- Move Cloudflare credential/OAuth lifecycle into the Host boundary and Electron screenshot capture into Electron Host support.
- Keep Site Hosting domain contracts, validation, and product-specific analysis with the Application.
- Update UI API/runtime composition, scripts, tests, packaging patterns, architecture/source maps, and this development record.
- Remove `src/site-hosting/` after production and test references are migrated.

## Explicit Non-goals

- Do not change Site Hosting UI or HTTP contracts.
- Do not change persisted workspace paths or schema/data formats.
- Do not duplicate Astro build/deploy or Cloudflare resource operations already owned by the Astro Site Hosting Plugin.
- Do not remove Cloudflare account management functionality without evidence and a separate boundary decision.
- Do not run the full unit suite without explicit approval; use focused verification.
- Do not commit, merge, push, or create a child branch as part of this step.

## Design and Boundaries

- `applications/site-hosting/` owns project/site use cases and Site Hosting domain rules.
- `adapters/storage/site-hosting/` owns local filesystem repositories.
- `adapters/catalogs/amade/` owns remote catalog retrieval and cache mechanics.
- `host/cloudflare/` owns desktop OAuth credentials, encryption, and connection lifecycle.
- `host/electron/` owns Electron-specific screenshot capture.
- UI API routes remain request/response adapters; `composition/site-hosting-application.js` selects concrete adapters and Host ports for the Application.
- The Astro Site Hosting Plugin remains owner of Astro build/preview and Cloudflare deployment/provider operations.

## Decisions and Tradeoffs

- 2026-10-18: User approved reorganization according to the established role-plus-layer rules.
- Continue on `codex/fbr/source-layer-reorganization` per the user's standing source-reorganization branch policy; do not create a new child branch.
- Preserve API, Plugin operation, and workspace persistence contracts. Split the very large site use-case service only where a clear, behavior-preserving boundary can be verified; avoid a mechanical rewrite.

## Progress

- 2026-10-18: Confirmed the working tree was clean and the parent source-reorganization branch was current.
- 2026-10-18: Re-audited production, test, script, packaging, and documentation references to `src/site-hosting/`. The Site Hosting site service remains a large mixed workflow module; an initial structural migration must preserve its callable service contract and avoid duplicating the Astro Plugin.
- 2026-10-18: Moved project/site workflows and focused tests under `applications/site-hosting/application/`; domain validation, Astro import analysis, and Vault knowledge collection under `applications/site-hosting/domain/`; filesystem repositories under `adapters/storage/site-hosting/`; Amade catalogs and their template-cache materialization under `adapters/catalogs/amade/`; and Cloudflare OAuth plus Electron screenshot integrations under Host. Updated static callers, scripts, and the packaged-source glob. No workspace data path or public route changed.
- 2026-10-18: Updated Application constructors to require injected persistence/catalog/runtime ports. Added `composition/site-hosting-application.js` to assemble the two Applications with storage, Amade catalog, Astro Plugin, and Electron Host adapters. Moved dialog, system-open, and ZIP extraction access behind `host/electron/site-hosting-desktop.js`; Application production modules no longer import adapters, composition, Electron, or Electron-only ZIP extraction directly.
- 2026-10-18: Refined ownership so cached template materialization lives beside the Amade catalog adapter rather than in general Site Hosting storage. Removed the old `src/site-hosting/` tree after updating callers and package inputs.

## Verification and Remaining Work

- Focused Site Hosting validation passed across 106 tests (Application services, domain rules, storage/catalog adapters, Cloudflare connection, UI API routes, UI contracts, contract verification, and UI server boundary/settings). The first settings-test invocation lacked `BLOGGENIUS_ENV` and failed during config initialization before test execution; rerunning with `BLOGGENIUS_ENV=local` passed. After the final catalog-cache relocation, its directly affected tests plus the Application site-service tests passed (37/37). Changed JS syntax checks, package JSON parsing, and `git diff --check HEAD` passed.
- Verified no legacy `src/site-hosting/` directory remains and production/test/script/package references use the new paths. The old path occurs only in this development record to document the migration.
- Updated `src/README.md`, relevant architecture documentation, and the parent reorganization record. `docs/README.md` structure did not change.
- User's hands-on UI validation remains available after automated checks; no visual correctness claim will be based on tests. No UI or HTTP contract changed in this slice.
- Follow-up candidate: decompose the existing Site Hosting Application's large site workflow module into independently testable use-case modules without changing its public route/service contract.
