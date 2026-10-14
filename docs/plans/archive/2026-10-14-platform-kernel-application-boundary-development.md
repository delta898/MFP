# Platform Kernel and Application Boundary

- Branch: `codex/feat/platform-kernel-application-boundary`
- Start date: 2026-10-14
- Base/parent branch: `codex/fbr/plugin-architecture-foundation`
- Status: complete; merged into `codex/fbr/plugin-architecture-foundation` as `19f670d0`; feature branch deleted

## User need and long-term goal

BlogGenius has accumulated content generation, image generation, publishing, social sharing, card-news, automation, and channel integrations. The user wants to evolve it into an extensible platform without allowing the central Core to absorb every product workflow. The current codebase remains the product and reference implementation; the new architecture will be built beside it in the same repository, then functions will be rebuilt and transitioned one at a time.

The platform should combine extensible, composable functions with an agent that improves how it understands requests, chooses available functions, asks for missing information, and learns from outcomes. Learning improves interpretation and recommendations; it does not grant itself new execution authority or rewrite plugins.

## Agreed architecture direction

The primary runtime layers are:

1. **Platform Kernel**: owns plugin contracts, registration/discovery, capability validation and dispatch, lifecycle (including blocking new calls and draining active calls on disable), policy/confirmation boundaries, and shared execution context. It does not implement content generation, publishing, or product-specific workflows.
2. **Application**: owns a product use case and composes capabilities/plugins into a business flow, such as blog publishing, card-news creation, or social sharing. New workflow types should normally add an Application rather than expand the Kernel.
3. **Plugin**: supplies a bounded operation such as text generation, image generation, WordPress publishing, or Naver publishing. “Plugin” describes the extension form; “Core” versus “Community” describes who owns and bundles it. Core Plugins are bundled and runtime-toggleable, but not user-installable/uninstallable. Community package installation/removal is a later stage.

Channel adapters (UI, Telegram, MCP) accept requests and call the shared Agent Runtime. The Agent Runtime interprets requests, selects an Application or asks for clarification, and uses the capability registry as the source of truth for available operations. Channels must not grow separate business workflows.

Plugin is an implementation/package boundary, while generation and publishing are functional categories and pipeline stages. Applications compose those stages. A future independent plugin package must use explicit public contracts and avoid imports from BlogGenius private modules. The first external package may later be WordPress Publisher, but it is not the objective of this foundation stage.

## Directory hierarchy direction

The hierarchy should express these ownership boundaries and make invalid dependencies visible. Proposed target shape for new code:

```text
src/
  platform/                    # Kernel contracts, registry, host, lifecycle, dispatch
  applications/                # Product use cases and composition
    blog-publishing/
    card-news/
    social-sharing/
  agent/                        # Request understanding, clarification, application selection
  channels/                     # UI, Telegram, MCP adapters
  composition/                  # Process entrypoints and dependency wiring

packages/
  plugins/
    core/                       # Bundled first-party plugin packages
      text-generator/
      image-generator/
      wordpress-publisher/
      naver-publisher/
```

This is a direction, not permission to move all existing `src/` modules now. New architecture code should be isolated from legacy paths. Existing code is consulted for behavior and requirements, not treated as the shape the new layers must preserve. Directory placement alone does not enforce architecture: import/dependency rules, explicit interfaces, composition-root ownership, and contract tests must enforce it.

## This stage: proposed goal and scope

**Goal:** establish the smallest executable foundation that proves the Platform Kernel → Application → Plugin boundary in the current repository, before migrating a real product feature.

**In scope:**

- Create the new layer-oriented directories and a composition root for the foundation slice.
- Define a small, explicit Plugin descriptor and operation contract: identity/version, declared operations, input/output validation, and execution result/error semantics. Keep operation descriptions tied to registered operations rather than a separately maintained feature list. Defer plugin-specific configuration/readiness semantics until a real plugin supplies concrete requirements.
- Implement a minimal in-process Plugin Host/registry that validates registration and dispatches declared operations. Keep policy/lifecycle ownership in the Kernel; for this stage, include only lifecycle semantics needed to prevent new calls after disable and safely account for active calls if that fits the minimal contract.
- Define the Application boundary as a use-case coordinator that depends on declared operations through the host contract, not on plugin implementation modules.
- Add a tiny test-only Application and fake generator/publisher plugins to prove composition and dependency direction without calling AI, WordPress, Naver, or external services.
- Add focused contract tests for registration, invalid contracts, operation input/output, execution failure propagation, and disable behavior covered by the final design.
- Document the stable concepts, dependency direction, directory ownership, and the next real-plugin migration gate.

**Explicitly out of scope:**

- Migrating existing WordPress, Naver, image/text generation, SNS, card-news, scheduler, or UI paths.
- Creating or publishing an independent WordPress package/repository.
- User-facing plugin catalog/toggles or runtime package installation, update, and removal.
- Community plugin code loading, sandboxing, signatures, marketplace, or cross-process execution.
- Redesigning Agent Runtime, memory, Telegram conversation, MCP APIs, credential storage, or all existing capability metadata.
- Reorganizing legacy folders wholesale, compatibility migrations, release/version changes, commit, merge, push, or tag.

## Deliverables for this stage

1. A branch development record (this document) capturing the agreed architecture and stage boundaries.
2. A canonical architecture document describing Kernel, Application, Plugin, channels/runtime, dependency rules, and target directory layout.
3. Minimal executable Kernel, Application, and fake Plugin code under the new hierarchy.
4. Focused automated contract tests proving the boundary and failure/lifecycle behavior.
5. An updated docs index and plan status once scope is approved and implementation is complete.

The stage is complete only when both the code and tests demonstrate the boundary; a prose-only architecture proposal is insufficient. No real product capability is migrated in this stage.

## Implementation progress

- Renamed the branch to `codex/feat/platform-kernel-application-boundary` after the user approved the scope.
- Added `src/platform/plugin-contract.js` and `plugin-host.js` as a separate, minimal Kernel boundary. It validates descriptors and operation inputs/outputs, exposes available-operation descriptions from registered plugins, dispatches by plugin and operation id, passes only a narrow execution context, and blocks/drains calls during disable.
- Added an example Application, test-only fake generator/publisher plugins, and an example composition root. They are not wired to product entrypoints and do not make external calls.
- Added focused tests for descriptor validation, duplicate ids, unknown operations/plugins, input/output contract failures, error propagation, lifecycle drain, and Application composition.
- Added canonical architecture documentation and linked it from the docs index. Updated the system overview to distinguish the new foundation from the existing `src/plugins/` runtime.
- Deliberately deferred readiness/configuration policy: without a real Plugin there is no evidence yet for a correct shared configuration lifecycle. The first product-plugin migration must add and test that boundary before using real credentials or providers.

## Dependency rules

- Plugins depend on the public Plugin contract and their own provider libraries; they do not import Application, channel, or BlogGenius-private modules.
- Applications depend on Kernel-facing operation contracts and compose operations; they do not import concrete plugin implementations.
- The Kernel does not depend on Applications, channels, or domain-specific plugin implementations.
- Channels depend on the Agent/Application invocation boundary, not on concrete plugins.
- Composition roots are the only place that selects and wires concrete Applications and Plugins.
- Plugin package APIs should remain independently usable and distributable later; avoid making that future promise broader than the first proven contract.

## Important design constraints and tradeoffs

- Do not turn the Kernel into a second large application. Product-specific sequencing and decisions belong in Applications.
- Do not pre-design a universal workflow engine or a large plugin SDK before the test slice reveals actual contract needs.
- Do not preserve legacy shapes solely to minimize migration effort. Reuse behavior only after expressing it through the new contracts.
- In-process lifecycle can block new calls and drain tracked calls, but cannot undo external side effects or guarantee OS-level isolation. Community plugin isolation is a later security design.
- Current app is a CommonJS/Electron single package and the main package declares a Commercial license. Independent plugin publication requires a separate licensing/release decision; this stage only keeps the boundary possible.
- Existing app and persisted data remain the product baseline while functions transition incrementally. This stage does not create a second full application to maintain.

## Decisions with the user

- 2026-10-14: Prefer rebuilding and transitioning feature-by-feature within the current repository, rather than starting a second blank application. Existing code is a reference for behavior, not a constraint on the new architecture.
- 2026-10-14: The explicit layer between Kernel and plugins is named **Application**, not Workflow. Applications compose product-specific business flows so each new domain does not enlarge the Kernel.
- 2026-10-14: Plugin is the implementation form; Core Plugin vs Community Plugin describes management/bundling ownership. Generation and publishing are functional categories/pipeline stages, not separate architectural layers.
- 2026-10-14: Core Plugins are bundled and support runtime enable/disable, but are not individually installed or removed by users. Community package lifecycle is deferred.
- 2026-10-14: Independent distribution is a long-term quality bar: a plugin should eventually be usable from a separately published package through an explicit interface, without private BlogGenius imports. Do not overfit the first stage to multiple hosts or a marketplace.
- 2026-10-14: The user emphasized bottom-up platform foundation, with documentation, executable code, and tests. The foundation must be proven before migrating WordPress publishing.
- 2026-10-14: The directory hierarchy should reflect layer ownership and dependency direction. It should not trigger wholesale movement of legacy code.

## Earlier investigation retained as reference

The initial WordPress investigation found that current publishing spans `src/core.js`, `src/wordpress-client.js`, runtime call sites, UI/API settings, and Agent capability routing. It relies on BlogGenius-specific Markdown image blocks, work directories, ImageService, FTC/CTA asset caching, and app configuration. Therefore, moving the current `publishToWordPress` function into a package would not create an independent plugin. That investigation remains useful for a later migration stage, but WordPress is no longer the current stage's goal.

## Verification and integration result

- During this stage, run focused unit/contract tests for the changed Kernel, Application, and fake Plugin contracts.
- `node --test src/platform/plugin-host.test.js`: 6 tests passed, covering descriptor/operation validation, runtime operation discovery, input/output contracts, error propagation, disable/drain behavior, and Application composition.
- `git diff --check`: passed. No browser/UI smoke is applicable because no product UI or entrypoint changed.
- Do not run the full unit suite without explicit user approval.
- The complete sub-feature diff was reviewed against `codex/fbr/plugin-architecture-foundation` before integration.
- The feature commit was fast-forward merged into the parent as `19f670d0`; the sub-feature branch was deleted at the user's request. No push was performed.
- The full unit suite was not run. Full validation remains a gate before the parent is integrated into `dev` and requires explicit user approval.
- Current UI flows are not being migrated, so visual/browser acceptance is not a gate for this stage.

## Remaining work

- This stage is complete. The first real product-flow migration, full parent validation, and any later `dev` integration remain tracked by the parent FBR; they are not unfinished work in this stage.
