# Core Plugin Registration and Composition

- Branch: `codex/feat/core-plugin-registry`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`fe7ac003`)
- Status: merged into `codex/fbr/plugin-architecture-foundation` at `96cfbacb`; sub-feature branch deleted

## User need and goal

The first WordPress Plugin pilot is an independent package and can be wired to the new Kernel, but its composition root currently receives a concrete plugin instance directly. BlogGenius needs one explicit, reviewable source for the bundled Core Plugin set so runtime registration and introspection can grow without relying on filesystem discovery or a hand-maintained feature list.

This stage will define and implement the bundled Core Plugin registration boundary, connect the WordPress pilot through it, and verify that the Kernel's runtime list reflects the actual registered operations and enable state.

## Approved scope

- Define the distinction between the bundled Core Plugin catalog/composition root and the runtime Plugin Host.
- Add a deterministic, explicit registration mechanism for bundled Core Plugin factories/instances.
- Validate duplicate, missing, mismatched, and malformed registrations before runtime use.
- Compose the WordPress Publisher through the Core Plugin registration path and existing Kernel Host.
- Verify plugin and operation discovery against runtime registration and enable/disable state.
- Update canonical architecture and parent FBR documents.

## Explicit non-goals

- Automatic filesystem/package discovery or user-facing plugin management UI.
- Community Plugin installation, removal, trust, isolation, update, or rollback.
- Wiring the pilot into existing product publishing entrypoints.
- Adding a second product Plugin during this stage.
- Merging into the parent, full unit suite, or release work without a separate user request.

## Proposed boundary

- The Core Plugin catalog is the explicit bundled set and composition-time factory map. It owns which first-party packages are included and how host dependencies are injected.
- The Plugin Host remains the runtime source of truth for successfully registered Plugin descriptors, available operations, and enabled/disabled execution state.
- Composition creates the bundled instances from the catalog, validates the catalog/instance identity contract, then passes the instances to the Host. It does not duplicate runtime state or maintain a second capability list.
- The initial registry is code-owned and deterministic. A package merely existing under `packages/plugins/core/` does not make it trusted or enabled.

## Verification plan

- Focused tests for catalog validation, composition, duplicate/missing plugin handling, runtime discovery, and enable/disable visibility.
- Existing WordPress Plugin/Application and Kernel tests.
- `git diff --check`.
- Do not run the full unit suite without explicit user approval; no product UI changed, so browser smoke does not apply.

## Progress and decisions

- 2026-10-14: User approved this goal and scope after the WordPress Publisher pilot. The next stage is an explicit bundled Core Plugin registration/composition mechanism, not UI or Community Plugin management.
- 2026-10-14: Created from parent commit `fe7ac003`.
- 2026-10-14: User clarified that structural correctness and validation of the new architecture take priority over preserving compatibility with deployed functions. Existing paths may be replaced or removed; separately owned user data and external side effects remain explicit concerns.
- 2026-10-14: Implemented `src/composition/core-plugin-registry.js` as the explicit bundled factory catalog. It does not scan directories. `src/composition/wordpress-publishing.js` creates instances through this catalog and registers them with the Kernel Host. The Host remains authoritative for runtime operation availability and enable/disable state.
- 2026-10-14: Added validation for malformed and duplicate catalog entries, unknown dependency keys, missing/mismatched factory instances, and the WordPress Application's required Plugin. Runtime tests verify catalog IDs against Host state/operations and confirm disabling removes operations from discovery and blocks execution.
- Focused verification: 23 tests pass across the unit-test discovery, registry, WordPress package/Application, and Host; `git diff --check` passes. Full unit suite not run; no UI/browser behavior changed.
- Final result: the WordPress composition root now instantiates the explicit bundled Core Plugin set through the catalog and registers those instances with the Plugin Host. The catalog reports what is bundled; the Host reports what is registered and currently available at runtime. No product entrypoint or UI was migrated in this stage.
