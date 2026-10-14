# Platform Kernel, Applications, and Plugins

## Purpose and status

BlogGenius is establishing a platform boundary that lets independently owned capabilities be composed into product use cases without placing every business workflow in the Core. This document defines the target direction, the first executable foundation slice, and a first provider Plugin pilot. Existing product application paths have not yet migrated and continue to use their current runtime.

The migration strategy is to establish the new boundaries in this repository and prove them with code and tests. Existing implementation is optional reference material, not a compatibility contract or a constraint on the new structure. Functions and paths may be replaced or removed when the new architecture is ready; separately owned user data and external side effects still require deliberate handling.

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

## End-to-end architecture and request flow

“Host” refers to two related but different things. **BlogGenius Host App** is the product runtime that starts the system, accepts channel requests, chooses an Application, and owns composition. **Plugin Host** is a Kernel component that registers Plugin descriptors, exposes available operations, enforces enabled state, validates calls, and dispatches operations. The Plugin Host does not render UI or decide which product workflow a user means.

Target request and result flow:

```mermaid
flowchart TB
    User[User]

    subgraph Channels[Channel Adapters]
        UI[Web/Desktop UI]
        TG[Telegram]
        MCP[MCP]
    end

    subgraph HostApp[BlogGenius Host App]
        Ingress[Request ingress and normalization]
        Agent[Agent Runtime<br/>understand, clarify, route]
        AppRegistry[Application catalog]
        Response[Response formatting]
        Bootstrap[Bootstrap and Composition Root]
    end

    subgraph Kernel[Platform Kernel]
        AppRuntime[Application execution contract]
        PluginCatalog[Core Plugin catalog<br/>bundled factories]
        PluginHost[Plugin Host<br/>runtime registration, state, dispatch]
    end

    subgraph Applications[Applications / Workflows]
        Blog[Blog workflow]
        Cards[Card-news workflow]
        Social[SNS workflow]
    end

    subgraph PluginPackages[Plugins]
        Generate[Content generation]
        Images[Image generation]
        WordPress[WordPress publishing]
        Naver[Naver publishing]
        SNSPublish[SNS publishing]
    end

    User --> UI
    User --> TG
    User --> MCP
    UI --> Ingress
    TG --> Ingress
    MCP --> Ingress
    Ingress --> Agent --> AppRegistry
    AppRegistry --> Blog
    AppRegistry --> Cards
    AppRegistry --> Social
    Blog --> AppRuntime
    Cards --> AppRuntime
    Social --> AppRuntime
    AppRuntime --> PluginHost
    PluginHost --> Generate
    PluginHost --> Images
    PluginHost --> WordPress
    PluginHost --> Naver
    PluginHost --> SNSPublish
    Bootstrap --> AppRegistry
    Bootstrap --> PluginCatalog --> PluginHost
    AppRegistry --> Response
    Response --> UI
    Response --> TG
    Response --> MCP
```

In a successful flow, a channel adapter normalizes input, the Agent Runtime identifies the intent and asks for missing decisions when needed, and the Host App selects an Application. The Application owns the business sequence and requests operations through the Kernel contract. The Plugin Host checks registration and lifecycle state, validates and dispatches each operation, and returns results to the Application. The Host App formats the result for the originating channel. A request may stop for clarification or confirmation instead of invoking a Plugin.

The diagram is the agreed target, not a claim that every box or arrow is implemented. Blog Beta's direct manuscript publication path now invokes the WordPress Publishing Application through the Plugin Host. Other UI, Telegram, and MCP paths have not been routed through a shared Host App ingress. The current Agent/Capability path and the new Plugin Host remain parallel systems.

Most operational product traffic still follows the existing control path:

```text
Existing UI / Telegram / MCP ingress -> Agent Runtime -> Capability Registry -> Execution Layer
                                                       -> Memory and channel-specific response
```

The new Kernel/Application path is used by Blog Beta's direct AI manuscript generation and WordPress manuscript publication. Other Applications remain examples or pilots. For current Agent Runtime, capability, and memory ownership, see [`architecture/overview.md`](overview.md), [`architecture/agent-runtime.md`](agent-runtime.md), and [`architecture/memory-graph.md`](memory-graph.md).

## Directory ownership: target and current implementation

The target hierarchy assigns ownership by architectural boundary. It is not a list of directories that must all exist today.

```text
src/
  host/                         # BlogGenius Host App: bootstrap, ingress, routing, app catalog
  adapters/                     # Channel boundary implementations
    ui/
    telegram/
    mcp/
  agent/                        # Request understanding, clarification, Application selection
  platform/                     # Platform Kernel: contracts, Plugin Host, dispatch, lifecycle
  applications/                 # Product workflows; no concrete Plugin imports
  composition/                  # Host startup wiring: catalog factories, Applications, Kernel

packages/
  plugins/
    core/                       # Bundled first-party packages, independently bounded
    community/                  # Future third-party distribution; not implemented
```

Current source layout (only the paths relevant to this boundary):

```text
ui/                             # Existing Web UI assets and feature views
src/
  ui-runtime/                   # Existing UI runtime/bootstrap
  ui-api/                       # Existing UI-facing API routes, controllers, services
  gui/                          # Existing desktop GUI integration
  channels/telegram/            # Existing Telegram response renderer
  telegram-*.js                 # Existing Telegram services and bot integration at src root
  mcp/                          # Existing MCP servers, adapters, and runtime setup
  agent/                        # Existing Agent Runtime, request mapper, planning, confirmation
  capabilities/                 # Existing capability routing and execution boundary
  plugins/                      # Existing capability-contribution catalog and lifecycle host
  platform/                     # New Kernel Plugin contract and Plugin Host
  applications/
    examples/content-publishing.js
    wordpress-publishing.js     # Used by Blog Beta direct manuscript publication
    generated-wordpress-publishing.js # Pilot workflow composing generation and publication
  composition/
    content-publishing-example.js
    core-plugin-registry.js     # Explicit bundled Core Plugin inventory and ID-based factories
    plugin-runtime-composition.js # Selects and wires the Plugin set for one runtime composition
    wordpress-publishing.js     # Pilot composition root
    generated-wordpress-publishing.js # Pilot composition root for generation + publication

packages/plugins/core/
  wordpress-publisher/          # First independently bounded Plugin package
  ai-gateway/                   # Provider-neutral text/image generation operations
  hello-world/                  # Minimal bundled Core Plugin reference
```

The target `src/host/` and `src/adapters/` directories do not exist yet. Existing UI, Telegram, and MCP paths should not be described as already migrated adapters merely because they have adapter-like responsibilities. Likewise, `src/plugins/` is the existing capability-contribution host, while `src/platform/plugin-host.js` is the new Kernel Plugin Host; they are not interchangeable. Do not create empty target directories or relocate current code for appearance alone. Add a target boundary when a real migration slice defines and tests its contract.

The initial foundation uses `src/applications/examples/`, `src/composition/`, and `src/test-fixtures/`. The WordPress Application and explicit Core Plugin catalog now serve Blog Beta direct manuscript publication; other product flows remain outside this migration.

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

## Plugin manifest and operation contract

Each bundled package declares `package.json#bloggeniusPlugin`. It contains the manifest version, Plugin ID and display metadata, a SemVer range for the Plugin Host API, and operations with descriptions, JSON Schema input/output contracts, and operation-scoped capability declarations. Package SemVer remains in `package.json#version`.

- The pinned schema dialect is JSON Schema 2020-12, validated by Ajv 2020 mode. Host validation does not coerce values or insert schema defaults.
- Format annotations are not enabled as assertions; schemas should use assertion keywords for Host-enforced rules. Plugin `capabilities` are declarations, not automatic grants or a security boundary.
- Schema references must be local to the declared schema. Remote reference resolution is rejected so discovery never performs network access.
- Core catalog discovery reads package metadata and validates manifests without importing Plugin implementation modules. The code-owned bundled catalog is the Core source adapter; Community package scanning is not implemented.
- The Host loads only the selected package, verifies that the implementation operation IDs exactly match its manifest, and registers the operation executors. The implementation does not repeat descriptions or schemas.
- The Plugin Host validates each input before execution and each output before returning it. Manifest schemas are the authoritative operation contract; executable `input.parse` / `output.parse` validators are not part of the public Plugin API.
- Operation dispatch is addressed by `pluginId` and `operationId`. `listOperations()` exposes registered, enabled operations and omits disabled or disabling Plugins.
- Plugin execution errors pass through to the Application. Schema violations are reported as `PluginContractError`.
- The executor receives a narrow execution context (`AbortSignal` and optional Host-mediated progress reporting); it does not receive the Host's full dependency bag.
- `setEnabled(false)` blocks new executions immediately and waits for tracked operations to finish. It does not undo an external side effect already performed by an operation.

This is an in-process boundary, not a security sandbox. Bundled Core code is trusted. Manifest capability declarations describe requested authority; they do not make in-process JavaScript safe to load from an untrusted source.

## Current implementation and migration boundary

- New foundation code: `src/platform/plugin-contract.js`, `src/platform/plugin-host.js`, manifest-backed Core registry/composition, and the example Application and composition root.
- Existing `src/plugins/catalog.js` and `src/plugins/core-host.js` remain in use by `src/capabilities/index.js`. They gate current capability contributions. They are not replaced or wrapped by the new Kernel Plugin Host in this stage.
- The WordPress Publisher package uses injected credentials and `fetch`, with no BlogGenius-private imports. Its REST operations cover media upload, category listing, and post creation. Media bytes cross the JSON operation boundary as base64 and are decoded only by the WordPress adapter.
- `packages/plugins/core/ai-gateway/` declares provider-neutral `text.generate` and `image.generate` operations. It reports its supported routes independently of the BlogGenius Model Catalog. BlogGenius Applications intersect both lists; the Host-owned transport resolves credentials and authenticates fixed provider routes without passing keys through Plugin operations. See [AI Gateway Core Plugin](ai-gateway-plugin.md).
- `src/applications/wordpress-publishing.js` composes WordPress operations into a publishing use case. `src/composition/wordpress-publishing.js` wires the package to the Kernel. Blog Beta manuscript publication uses this Application; other WordPress product paths may still call `Core.publishToWordPress()`.
- `src/applications/generated-wordpress-publishing.js` composes AI Gateway text generation with the WordPress publishing Application through injected operation and publish interfaces. `src/composition/generated-wordpress-publishing.js` selects both Plugins, creates one Kernel Host, and wires the two Applications together. Its tests use a fake AI transport and fake WordPress HTTP responses; it is not connected to a product entrypoint.
- BlogGenius' manuscript publication runtime resolves image blocks to prepared local assets and passes their bytes and MIME types to the WordPress Publishing Application. The Application uploads assets, replaces `{{asset:key}}` references with media URLs, handles categories and warnings, and downgrades a requested publication to draft when media or category warnings occur. The Plugin owns WordPress authentication and REST request/response behavior; it does not convert image formats. `src/applications/blog-publishing.js` owns BlogGenius target policy (Naver → WebP, WordPress → AVIF) and `src/media/image-optimization-service.js` performs format conversion. When optimization is disabled, unavailable, or fails, the original image bytes and MIME type are preserved. Site Hosting has no target-format policy in this slice; a future WebP decision remains pending.
- All bundled Core Plugin packages declare the common manifest. `packages/plugins/core/hello-world/` is a small Core Plugin that exercises manifest discovery, operation listing, selection, registration, and invocation without an external service.
- `src/composition/core-plugin-registry.js` is the explicit bundled Core Plugin source adapter. It reads and validates package manifests without loading implementation modules, then loads the selected package on demand; it does not choose the Plugin set for a use case.
- `src/composition/core-plugin-runtime.js` joins that static catalog with one in-memory `PluginHost`. A process may inject the same runtime into multiple Application composition roots so registered Plugin instances, lifecycle, and operations have one shared owner. Application composition still selects only the Plugins it needs; discovery does not instantiate every catalog entry.
- `src/composition/plugin-runtime-composition.js` validates an explicit Plugin ID selection and its dependency map, then asks the catalog to create only those instances. Each Application composition root chooses its required Plugin set and supplies dependencies. The Kernel Plugin Host remains the source of truth for successfully registered runtime Plugins, lifecycle state, and available operations.
- The WordPress publishing composition selects only `wordpress-publisher`; generated writing compositions select `ai-gateway` and `wordpress-publisher`. The catalog can list both without requiring every runtime composition to instantiate or configure both.
- The product UI currently lives across `ui/`, `src/ui-runtime/`, `src/ui-api/`, and `src/gui/`. Telegram and MCP also retain their existing roots as shown above. They have not yet been composed through a single new Host App ingress; Blog Beta's direct manuscript publication is the current UI route into the WordPress Application.
- Settings Beta has a read-only Plugin discovery view backed by `GET /api/v1/plugins/core` and `GET /api/v1/plugins/core/:id`. Static bundled metadata comes from the explicit catalog; loaded/enabled state and active execution count come from the shared runtime Host. It does not expose injected dependencies, credentials, or Application-to-Plugin relationships. Community Plugins remain hidden. The UI server creates a shared runtime for the new architecture; each Application loads its selected Plugins through that runtime.
- The shared UI-server Core runtime registers `ai-gateway`; Blog Beta AI manuscript generation invokes `text.generate` and, when image generation is selected, `image.generate` for each planned image. Manuscript image actions use the same image operation. Other legacy Naver, shopping, SNS, card-news, automation, Telegram, and MCP paths remain outside this migration slice.

## Next migration gate

The WordPress publishing flow and AI Gateway composition are exercised both with fake providers/services and in the Blog Beta direct manuscript path. Naver and WordPress UI publishing paths pass through the Blog Publishing Application for target image preparation; other existing manual, scheduled, batch, Telegram, and MCP paths remain migration candidates. Identify separately owned user data and external side effects before replacing or removing those paths. Add Kernel contract elements only when required by concrete application flows and tests.

Community package loading, skill packaging, multi-host distribution, runtime install/removal, persistent lifecycle state, and process isolation require separate design decisions.
