# Platform Kernel, Applications, and Plugins

## Purpose and status

BlogGenius is establishing a platform boundary that lets independently owned capabilities be composed into product use cases without placing every business workflow in the Core. This document defines the target direction, the first executable foundation slice, and a first provider Plugin pilot. Existing product application paths have not yet migrated and continue to use their current runtime.

The migration strategy is to build the new boundaries beside the current implementation in this repository, prove them with code and tests, and rebuild/transition product capabilities one at a time. The existing implementation is a source of behavioral requirements, not a constraint on the new directory shape.

## Layers

### Platform Kernel

The Kernel owns the stable host-side contracts and execution boundary:

- Plugin registration and operation discovery.
- Descriptor and operation input/output contract validation.
- Dispatch to a declared operation.
- Plugin enable/disable lifecycle, including rejecting new calls while disabled and draining tracked calls during disable.
- Shared execution policy, confirmation, and context boundaries as those contracts are introduced.

The Kernel does not own content generation, publishing, or product-specific sequencing. It must remain smaller than the set of Applications it hosts.

Initial implementation: `src/platform/`. `src/plugins/` is the legacy/current Core Plugin capability host and is not yet replaced by this foundation.

### Applications

An Application owns a product use case and composes operations into a business flow. Blog publishing, card-news creation, and social sharing are candidate Applications. Generation and publishing are functional categories or stages that an Application may compose; they are not separate architecture layers.

Applications depend on the Kernel's operation invocation contract and do not import concrete Plugin implementations. The first content-publishing Application under `src/applications/examples/` is an architecture example only; it is not wired into BlogGenius product entry points.

### Plugins

A Plugin provides one or more bounded operations, for example text generation, image generation, WordPress publishing, or Naver publishing. “Plugin” describes the implementation/package form. “Core Plugin” and “Community Plugin” describe ownership and distribution:

- Core Plugins are first-party and bundled with BlogGenius. The host can enable/disable them at runtime; this does not imply exposing a toggle for every plugin. They are not individually installed or removed by users.
- Community Plugins are a later extension stage. Runtime package install/removal, trust, permissions, isolation, updates, and rollback are not part of this foundation.

Long-term, a Plugin package should be independently usable through an explicit public interface and must not import BlogGenius private modules. The foundation does not yet claim a stable external SDK or package compatibility guarantee.

### Agent Runtime and Channels

UI, Telegram, and MCP are channel adapters. They accept requests and use the shared Agent Runtime; they must not implement product workflows independently. The Agent Runtime interprets requests, selects an Application or asks the user for missing information, and consults the runtime capability/operation registry as the source of truth. The current Agent Runtime and channel implementations have not yet been moved onto this foundation.

## Target directory ownership

New architecture code follows this direction:

```text
src/
  platform/                    # Kernel contracts, registry, host, dispatch, lifecycle
  applications/                # Product use cases and operation composition
  agent/                        # Request understanding and Application selection
  channels/                     # UI, Telegram, MCP adapters
  composition/                  # Concrete plugin/application wiring at startup

packages/
  plugins/
    core/                       # Bundled first-party plugin packages
```

The initial foundation vertical slice uses `src/applications/examples/`, `src/composition/`, and `src/test-fixtures/` to prove composition without migrating a product flow. The WordPress pilot now proves the package location under `packages/plugins/core/`; it does not move a legacy product path. Do not create empty directories or move legacy modules solely to make the tree look complete.

## Dependency direction

```text
Channel Adapter -> Agent Runtime -> Application -> Kernel operation contract -> Plugin operation
                                                ^
Composition Root wires concrete Applications and Plugins
```

- Plugin implementations depend on the public Plugin contract and their own provider libraries. They do not import Applications, channels, or BlogGenius-private modules.
- Applications depend on the operation invocation contract and compose calls. They do not import concrete Plugins.
- The Kernel does not depend on Applications, channels, or domain-specific implementations.
- Channels depend on Agent/Application invocation boundaries, not concrete Plugins.
- Composition roots are the only place that chooses and wires concrete Applications and Plugins.

Directory layout alone does not enforce these rules. Explicit interfaces, composition-root ownership, and contract/dependency tests must enforce them.

## Initial operation contract

The first in-process contract is intentionally small:

- Plugin descriptor: `id`, `name`, `version`, and a non-empty map of declared operations.
- Operation descriptor: a human-readable description, synchronous input/output parsers, and an async-capable executor.
- Host construction registers the bundled descriptor set, validates shape, and rejects duplicate plugin identifiers. The runtime host does not expose package installation/removal.
- Dispatch is addressed by `pluginId` and `operationId`; the host validates/normalizes input and output through the declared parsers.
- `listOperations()` derives the available-operation catalog from registered descriptors and omits disabled or disabling plugins. No separate manually maintained capability list is needed for this foundation.
- Plugin execution errors pass through to the Application. Contract violations are reported as `PluginContractError`.
- The executor receives a narrow execution context (`AbortSignal` only at this stage); it does not receive the host's full dependency bag.
- `setEnabled(false)` blocks new executions immediately and waits for tracked operations to finish. It does not undo an external side effect already performed by an operation.

This is an initial in-process boundary, not a security sandbox. Parser functions are trusted code. The current interface is a foundation contract, not yet a semver-governed third-party SDK.

## Current implementation and migration boundary

- New foundation code: `src/platform/plugin-contract.js`, `src/platform/plugin-host.js`, the example Application and composition root, and `src/test-fixtures/platform-foundation/`.
- Existing `src/plugins/core-host.js` remains in use by `src/capabilities/index.js`. It gates current capability contributions. It is not replaced or wrapped by the new host in this stage.
- The WordPress Publisher pilot lives at `packages/plugins/core/wordpress-publisher/`; it uses injected credentials and `fetch`, with no BlogGenius-private imports. Its REST operations cover media upload, category listing, and post creation.
- `src/applications/wordpress-publishing.js` composes those operations into a publishing use case. `src/composition/wordpress-publishing.js` wires the package to the Kernel. This pilot does not replace the current WordPress product paths: they still call `Core.publishToWordPress()`.
- The Application owns manuscript/asset preparation, category matching, warning collection, and draft fallback. The Plugin owns WordPress authentication and REST request/response behavior. Existing image optimization and FTC/CTA permanent-asset caching remain in the legacy Application/Core path; the pilot accepts already prepared `Buffer` assets and does not yet migrate those product concerns.
- The Plugin directory has its own minimal package manifest and public interface README. The package has no third-party runtime dependency; its descriptor version comes from its package manifest. This validates a package boundary, but not semver compatibility policy or a separate-repository release.
- Existing Naver, generation, SNS, card-news, automation, UI, Telegram, and MCP paths are unchanged.

## Next migration gate

The WordPress pilot validates injected credentials and provider operations with mocked HTTP plus a composed Application. Before adopting it in product entrypoints, compare the new flow against the existing manual, scheduled, and batch behavior, then decide how manuscript parsing, image optimization/caching, status fallback, notifications, and stored credentials move. Add only Kernel contract elements supported by concrete requirements and tests.

Community package loading, skill packaging, multi-host distribution, runtime install/removal, persistent lifecycle state, and process isolation require separate design decisions.
