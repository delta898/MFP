# Source Layer Reorganization

## Branch

- Branch: `codex/fbr/source-layer-reorganization`
- Start date: 2026-10-17
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: Inventory in progress; first Host bootstrap slice verified

## User Need and Goal

Legacy code accumulated in top-level `src/` files and product-named directories without consistent layer ownership. Reorganize it by changing callers and dependency direction to the accepted architecture boundaries, not by relocating files while preserving the same coupling. The eventual root invariant is that `src/` contains only `README.md` and directories, with all source and tests owned by an appropriate layer.

## Scope

- Inventory `src/` files and active production dependency paths; identify responsibility, current callers, target layer, tests, and deletion/migration gates.
- Establish `src/README.md` as the practical source ownership map, aligned with the accepted directory-layering decision and architecture documentation.
- Break implementation into independently reviewable slices. For each slice, update callers to the target contract, migrate tests/docs, and remove superseded legacy implementations when verified.
- Keep user-visible behavior, persistence, and external contracts stable unless a concrete change requires a user decision.
- Ask the user when responsibility, compatibility, data ownership, product behavior, or an architectural boundary is ambiguous; do not make those decisions by assumption.
- Finish with no source files directly under `src/` other than `README.md` and add a narrow structural guard for that invariant.

## Explicit Non-goals

- Do not rename or relocate all directories in one bulk operation.
- Do not create Plugins merely to satisfy the folder layout; Plugin work remains governed by the independence and completeness criteria already recorded in architecture docs.
- Do not redesign product UX or change business behavior as incidental cleanup.
- Do not delete user data, persisted history, external contracts, or compatibility paths without a verified ownership and migration decision.
- Do not merge into `dev`, push, release, or change versions as part of this parent feature without explicit user direction.

## Proposed Stages

1. **Ownership inventory and root map**: trace root files, legacy product directories, composition/adapter paths, imports, dynamic loads, tests, and package/build references. Record current and target ownership plus migration gates in `src/README.md`; identify unresolved decisions before moving affected code. No broad code movement in this stage.
2. **Application workflow slices**: migrate one independently reviewable workflow at a time from legacy product directories into its Application, route entrypoints through the appropriate adapter and composition, verify callers, then delete the superseded path. Candidate areas include Blog content/continuous publishing, Site Hosting, Shopping, and keyword/trend workflows; exact ordering will follow the Stage 1 dependency map and user decisions.
3. **Shared service and adapter slices**: separate reusable domain contracts from external-system/protocol implementations and product policy. Candidates include AI/model management, Google integrations, WordPress/Naver/Telegram/Slack, media, and licensing. Do not move a responsibility until its owning Application or shared contract is explicit.
4. **Host and channel ingress slices**: reduce `core.js`, `utils.js`, `ui-server.js`, and other root facades by moving callers to their target contracts, then keep only genuine process bootstrap/routing in Host. Align `ui-api/`, `ui-runtime/`, `gui/`, `channels/`, and `mcp/` with the accepted adapter/Host boundaries after each entrypoint is traced.
5. **Root invariant and completion**: relocate remaining single-responsibility root modules, delete obsolete facades, document the final ownership map, add a structural test that allows only `src/README.md` and directories at `src/` root, and run agreed focused/full validation.

Stages 2–4 may be reordered or split further based on the inventory and dependency graph. Each code slice will use a short-lived child branch from this parent branch and its own development record when independently reviewable.

## Decisions and Tradeoffs

- 2026-10-17: User confirmed that the essential work is changing invocation paths to honor layer boundaries, not merely moving files to destination folders.
- 2026-10-17: User authorized a dedicated feature branch and asked to be consulted for unclear boundaries or decisions. User will perform hands-on checks when needed; pause at those gates with specific test flows or options.
- Preserve the accepted `docs/decisions/2026-10-15-source-directory-layering.md` as the placement authority. This plan and `src/README.md` operationalize it; they must not invent competing ownership rules.
- Treat `core.js` and `utils.js` as responsibility inventories, not as modules to move wholesale into `host/` or `utilities/`.

## Initial Findings

- The working tree was clean on `codex/fbr/plugin-architecture-foundation` before branch creation.
- `src/` currently has around 721 files, around 62 files directly at its root, and many established directories. Root facades include `core.js`, `utils.js`, `ui-server.js`, `main.js`, configuration/runtime modules, and external integrations.
- Responsibility-focused directories already exist for `applications/`, `adapters/`, `composition/`, `platform/`, `services/`, and `utilities/`; legacy and transitional areas remain alongside them, including `content/`, `continuous-publishing/`, `site-hosting/`, `keyword-research/`, `trend-posting/`, `ai/`, `ui-api/`, and `ui-runtime/`.
- The accepted layering decision and platform architecture document describe the target layers and migration policy, but there is not yet a complete file-level current-to-target inventory for all of `src/`.

## Progress

- 2026-10-17: Created this parent feature branch from `codex/fbr/plugin-architecture-foundation` with a clean working tree.
- 2026-10-17: Added the initial `src/README.md` with the root invariant, links to normative architecture, a first-pass inventory, and migration gates. Ambiguous rows are explicitly left open rather than assigned by name alone.
- 2026-10-17: Caller search confirms `core.js` is still active in Blog publishing/application composition and legacy UI runtimes; it is also imported by related-post tests and `insight-engine.js`. `utils.js` is imported by configuration, authentication, Blog/Shopping/SNS runtime and keyword-research paths. Neither facade can be safely relocated or deleted as one step.
- 2026-10-17: First-pass inventory confirms the target layers already coexist with legacy directories. Callsites, dynamic loading, data ownership, and external contract implications still need to be traced for each migration slice.
- 2026-10-17: Completed manual confirmation of the first independently reviewable slice, [`Host Bootstrap Layer Migration`](2026-10-17-source-layer-host-bootstrap-development.md): the Dashboard launches and exits normally after moving process launch and Electron lifecycle under `src/host/`.

## Verification and Remaining Work

- The first inventory and root ownership map are in place. The Host bootstrap slice has passed focused automated checks and the user's manual Dashboard launch/exit check.
- Remaining: deepen the caller/dependency inventory and sequence the next code slice, consulting the user at any product/data/compatibility boundary.
