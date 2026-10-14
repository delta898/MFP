# Application and Plugin Composition Pilot

- Branch: `codex/feat/application-plugin-composition-pilot`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`89c1007c`)
- Status: complete; fast-forward integrated into `codex/fbr/plugin-architecture-foundation` as `849af80c`

## User need and goal

The Plugin catalog must describe all bundled Core Plugins, while an Application composition chooses and wires only the Plugins it needs. Keep those responsibilities distinct and prove the boundary by composing the content-generation and WordPress-publishing Plugins in one Application workflow.

## Approved scope

- Keep the Core Plugin catalog responsible for explicit bundled Plugin registrations and factory lookup/creation by ID.
- Move Plugin selection, dependency mapping, and instance assembly into a shared runtime composition module.
- Keep each Application composition root responsible for declaring its required Plugin IDs and supplying their dependencies.
- Add a narrow Application workflow that calls `content-generator.text.generate` and passes its result to the existing WordPress publishing Application.
- Use fake generation and fake WordPress HTTP responses; do not call a real model or publish to a real WordPress site.
- Add focused tests for catalog lookup, selected assembly, unknown/duplicate IDs, dependency boundaries, Host runtime inventory, workflow success, and generation/publishing failure paths.
- Update architecture and parent FBR records to clarify catalog, runtime composition, Application, and Host ownership.

## Explicit non-goals

- Connecting the new workflow to current UI, Telegram, MCP, scheduling, or production publishing.
- Migrating or removing existing content generation or WordPress product paths.
- Adding readiness/configuration state, plugin installation, community plugins, automatic dependency resolution, or UI toggles.
- Implementing provider/model selection, prompt authoring, retries, async jobs, memory, or paid AI requests.
- Full unit suite, parent merge, push, release, or version change in this sub-feature.

## Proposed boundary

- **Core Plugin catalog:** knows which first-party packages are bundled and can resolve/create a requested package by ID. It does not choose a use case's Plugin set.
- **Shared runtime composition:** validates an explicit selection and dependency map, asks the catalog to create those Plugin instances, and provides the selected set to the Kernel Plugin Host. It does not choose business workflow policy.
- **Application composition root:** declares which Plugin IDs its use case needs and provides their injected dependencies.
- **Application:** owns the generation-then-publish sequence. It uses the generation operation and delegates publication semantics to the existing WordPress publishing Application through an injected interface, avoiding duplicated WordPress rules.
- **Plugin Host:** owns the actual runtime-registered set, lifecycle state, operation discovery, validation, and dispatch.

This decision separates catalog inventory from a composition's runtime selection. The composition layer must remain a small mechanism, not become another business workflow registry.

## Implementation stages

1. Refactor the Core Plugin catalog to expose explicit registration lookup/creation without selecting a complete Plugin set. **Complete.**
2. Add shared runtime composition for explicit Plugin ID selection and dependency injection; preserve requested order and useful validation errors. **Complete.**
3. Add a generated-content publishing Application and composition that exercise both real Plugin packages with fakes. **Complete.**
4. Test composition boundaries, successful flow, failure propagation, disabled operations, and WordPress regression behavior. **Complete; focused suite passed.**
5. Update architecture, parent FBR, and this record; review the complete diff before parent integration. **Complete.**

## Verification

- Focused Node tests for the catalog, runtime composition, new Application/composition, Plugin Host, and WordPress Publisher regression.
- `git diff --check`.
- No browser smoke because no user-facing entrypoint is changed.
- No full unit suite without separate approval; no external provider or publishing calls.

## Progress and decisions

- 2026-10-14: Started from the clean parent at `89c1007c` after the content-generation Plugin pilot merged.
- 2026-10-14: User approved separating Plugin selection/dependency assembly into a shared runtime composition before the next pilot, and validating it with a combined generation-and-publishing Application.
- 2026-10-14: This directly resolves the earlier reminder: selection ownership was deliberately left open in the previous pilot and is now assigned to shared runtime composition, while the catalog remains the bundle inventory/factory lookup.

## Implementation and verification results

- Refactored `createCorePluginRegistry()` so the catalog owns bundle inventory, membership lookup, and single-Plugin factory creation only.
- Added `composePlugins()` as the shared selection/dependency-wiring mechanism. Application composition roots declare Plugin IDs and per-Plugin dependencies; the Plugin Host receives only the composed runtime set.
- Kept the existing WordPress composition on only `wordpress-publisher`.
- Added a combined Application that invokes `content-generator.text.generate`, then delegates the resulting text to the WordPress publishing Application. It preserves generation errors and does not start publishing after generation fails.
- A first focused run caught an options-shape mismatch between existing `pluginDependencies` and the new shared composition map; corrected the composition boundary before the final run.
- Final focused run: 32 tests passed across catalog, runtime composition, combined and existing WordPress Applications, both package contracts, and Kernel Plugin Host. `git diff --check` passed.
- No browser smoke, full unit suite, real AI provider call, or real WordPress publication was performed.
