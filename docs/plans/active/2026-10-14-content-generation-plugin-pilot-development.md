# Content Generation Plugin Pilot

- Branch: `codex/feat/content-generation-plugin-pilot`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation` (`f1aab52a`)
- Status: implementation complete; focused verification in progress

## User need and goal

The WordPress Publisher pilot and explicit Core Plugin catalog validate one provider-oriented Plugin. BlogGenius needs to verify that a generation capability can also be represented by the same Plugin contract and coexist in the bundled catalog without coupling an unrelated WordPress Application to AI provider configuration.

This stage will inspect the current generation/provider boundaries, add one minimal content-generation Core Plugin with an injected provider-neutral text-generation dependency, register it explicitly, and test operation discovery and invocation without real model calls or product-flow migration.

## Approved scope

- Inspect existing text-generation, model-catalog, provider/transport, credential, async-job, and cancellation boundaries before defining the pilot contract.
- Add a small independently bounded content-generation Plugin package with an explicit public interface and contract tests.
- Keep provider/model selection and credentials behind injected dependencies; do not import BlogGenius-private runtime code into the package.
- Add the Plugin to the explicit bundled Core Plugin catalog and verify that the Kernel Host discovers and executes it.
- Preserve WordPress composition behavior while supporting a registry with more than one bundled Plugin.
- Update the canonical architecture and this parent FBR's progress record.

## Explicit non-goals

- Calling paid/external AI models or sending user data to a provider.
- Migrating current UI, Telegram, MCP, scheduling, prompt authoring, image generation, or existing content-writing flows.
- Reimplementing model catalogs, transport registries, retries, async jobs, cancellation, or provider credential management inside this pilot.
- Adding a user-facing Plugin list/toggle, Community Plugin installation, separate repository publication, or package version release.
- Running the full unit suite, merging to the parent, or releasing without the applicable user request/approval.

## Investigated current boundaries

- `src/ai/transport-registry.js` owns provider-kind-transport routes and provider endpoints; `src/ai/catalog-registry.js` validates and merges model catalogs.
- `src/utils.js` and `src/core.js` contain current model calls and product generation composition. `src/content/` contains prompt/profile and content-domain helpers. `src/ui-runtime/` calls the existing `Core.generateContent()` path.
- Async jobs and cancellation are separate existing concerns (`src/ai/async-job-runner.js`, `src/ai/cancellation.js`, and product API/controller modules); they are not part of the first Plugin operation pilot.
- The new Kernel Plugin contract accepts a provider-independent descriptor with typed input/output parsers and an async executor. The current explicit Core Plugin catalog constructs every registered Plugin, while `createWordPressPublishingSystem()` requires the WordPress Plugin.
- Adding an AI-dependent factory to the default catalog would make the WordPress-only composition require an unrelated AI dependency unless composition can select its required Plugin set. No `ready` state currently exists to represent a registered-but-unconfigured Plugin accurately.

## Proposed boundary

- Plugin id: `content-generator` (subject to implementation naming validation).
- Operation: `text.generate` with a narrow normalized request/result contract.
- The package owns validation and the provider-neutral Plugin descriptor. A host-injected `generateText` function performs provider/model selection and transport; no real provider implementation is copied into this package.
- The Core Plugin catalog remains the source of truth for which first-party packages are bundled. The Plugin Host remains the source of truth for the actual registered set, enabled state, and available operations.
- Composition lists the complete bundled catalog but each Application selects only its required Plugin instances. The user approved selective composition; this keeps an unrelated AI dependency out of the WordPress runtime while the Plugin Host reports the actual registered set and operations.
- **Unresolved ownership decision:** should the selection/assembly logic remain in the Core Plugin registration catalog, or move into a separate shared runtime composition layer? The pilot currently keeps `createPlugins({ pluginIds, dependenciesByPluginId })` on the registry as an initial implementation. This is not an agreed long-term boundary. Revisit when planning the next Application/Plugin integration or before a second Application duplicates selection and dependency-wiring logic.
- The user approved package version `0.1.0` for the content-generator package manifest.

## Implementation stages

1. Resolve the composition behavior and exact package-version choice with the user. **Complete:** selective composition and version `0.1.0` approved.
2. Implement the package contract, manifest, public usage guide, and mock-based tests. **Complete.**
3. Extend explicit catalog/composition in the smallest way that supports multiple bundled Plugin definitions without coupling unrelated Application dependencies. **Complete.**
4. Verify registration, operation discovery, execution, invalid-input handling, and disabled execution with focused tests. **In progress.**
5. Update architecture and parent progress records; review the complete sub-feature diff before any parent merge. **In progress.**

## Verification plan

- Focused package and Plugin Host contract tests with an injected fake `generateText` function.
- WordPress composition regression tests to ensure its registered operation set and dispatch remain unchanged.
- Multi-Plugin registry/composition tests and `git diff --check`.
- No browser smoke because no product UI or entrypoint changes are in scope.
- No full unit suite or paid model/provider call without separate approval.

## Progress and decisions

- 2026-10-14: User approved the goal to add one content-generation Plugin and validate coexistence with the explicit Core Plugin registration/Host path. Product UI integration and real model calls are excluded.
- 2026-10-14: Created from parent commit `f1aab52a` after confirming the parent working tree was clean.
- 2026-10-14: Initial investigation found that current generation spans provider/transport catalogs, utility model calls, content prompt/profile modules, product generation orchestration, and async job/cancellation handling. The pilot will not move those responsibilities wholesale.
- 2026-10-14: Identified a composition issue before implementation: the current WordPress-specific composition instantiates every catalog entry, so registering a Plugin with a separate AI dependency can unnecessarily block WordPress composition. User choice requested: selective composition vs instantiate all registered plugins.
- 2026-10-14: User approved package version `0.1.0` and selective composition. The catalog still lists every bundled factory; each Application composition chooses its needed Plugin IDs, and Plugin Host discovery remains runtime-specific.
- 2026-10-14: User confirmed the implementation location of selection logic is still undecided. Keep the current registry API for this pilot, but reopen the tradeoffs between catalog-owned selection and a shared runtime composition layer at the next Application/Plugin stage, before duplicated assembly logic appears.
- 2026-10-14: Added `@bloggenius/content-generator` with injected `generateText`, one `text.generate` operation, public usage documentation, and tests. The package does not import app-private code or contact a model provider.
- 2026-10-14: Added the package to the explicit bundled Core Plugin catalog and adjusted WordPress publishing composition to register only `wordpress-publisher`.
- 2026-10-14: Initial focused runs exposed contract/test mismatches: operation output validation belongs to the Host boundary (the package returns its declared `{ text }` result), and a missing required Plugin should retain the Application-level diagnostic. Corrected both; final focused run passed 28 tests across package, registry/composition, WordPress regression, and Kernel Host.
- 2026-10-14: `npm pack --dry-run --cache /tmp/bloggenius-npm-cache` succeeded and confirmed the versioned package contains only `README.md`, `index.js`, and `package.json`. The default npm cache location was not writable in this environment, so the dry run used a task-local temporary cache.
- 2026-10-14: `git diff --check` passed. No full unit suite or UI smoke was run; this slice changes no product UI and the full suite is not a sub-feature gate. Manual model-provider validation is intentionally excluded because no provider call is made by this package.

## Result and remaining checks

- Implemented and contract-tested the first provider-neutral text-generation Core Plugin package at version `0.1.0`.
- The explicit catalog lists both bundled packages, while WordPress composition registers only its required Plugin. The Kernel Host reports only registered runtime plugins/operations and continues to enforce enable/disable.
- Existing BlogGenius generation flows remain unchanged and do not use this pilot yet. A later Application integration must decide how existing model/provider selection and async-job/cancellation behavior maps onto the injected function boundary.
- No commit or merge has been made. Before merging this sub-feature into its parent, review the full diff and run the focused verification again if implementation changes.
