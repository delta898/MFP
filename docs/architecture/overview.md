# Architecture Overview

## Goal
The system is evolving from a Telegram-triggered automation app into a conversational operations agent.

## Current Core Control Path
`Channel Adapter -> Agent Runtime -> Capability Registry -> Execution Layer -> Memory`

## Target Platform Path
`Channel Adapter -> Agent Runtime -> Application -> Platform Kernel -> Plugin`

The target path is being introduced alongside the current control path. Product flows remain on their current implementations until each is rebuilt and verified against the new boundaries.

## Main Components
- `src/platform/`
  - New Platform Kernel foundation: explicit Plugin operation contracts, registration, dispatch, and lifecycle. This is being established alongside the existing capability/plugin runtime; no product flow has migrated yet.
- `src/applications/`
  - New home for product use cases that compose Plugin operations. The current example is architecture-only and is not connected to product entry points.
- `src/composition/`
  - Composition roots wire concrete Applications and Plugins. The initial example is a testable foundation slice, not a production app bootstrap.
- `src/adapters/messaging/`
  - Channel-specific request parsing, protocol translation, response rendering, and transport clients.
  - Telegram is an adapter, not the place where business logic should grow.
- `src/host/agent/`
  - Host-side agent runtime, action/plan contracts, and request planning. Telegram-language parsing is owned by the Telegram adapter; confirmation persistence is owned by the storage adapter.
- `src/capabilities/`
  - The only layer allowed to read or mutate operational state.
- `src/plugins/`
  - Existing Core Plugin host. It owns first-party plugin registration and gates contributed capabilities by runtime enablement. It remains separate from the new `src/platform/` foundation until a real feature migration proves the replacement path.
- `src/memory/`
  - SQLite-backed event-first memory, retrieval, preferences, and domain knowledge.
- `src/knowledge/`
  - External/internal knowledge provider framework.
- `src/services/recommendations/`
  - Shared cross-Application recommendation lifecycle, producers, policy, persistence adapters, and delivery.
- `src/content-ideas/`
  - Blog content-idea generation, distinct from the cross-Application Recommendation lifecycle.

## Design Principles
- Capability-based control over raw config mutation.
- Event-first memory; derived preference second.
- Validation before confirmation whenever possible.
- Knowledge providers follow `kind + transport + config`.
- UI is secondary to contracts and control flow.
- Core Plugins are bundled and cannot be installed or removed independently. Their runtime enablement is host-controlled; user-facing toggles are a separate product decision.
- UI, Telegram, and MCP construct separate registry instances for their own runtime contexts, using the same capability-registry factory and bundled plugin catalog. Enablement is currently in-memory per registry instance.

## Plugin Host Status
- `src/plugins/catalog.js` is the shared source for bundled Core Plugin definitions; `src/plugins/core-host.js` registers descriptors and typed capability contributions.
- `src/capabilities/index.js` keeps existing capabilities Core-owned and delegates catalog contributions to the host. Plugins receive only an explicitly supplied, plugin-scoped context, not the registry's full dependency object.
- Disabling a plugin immediately prevents new capability lookup/dispatch and waits for already-started capability executions to finish. This lifecycle applies only to capability calls.
- API route, UI surface, provider, and background job contributions are not yet registered through the host. They remain at existing composition roots and will be evaluated against real plugin pilots before adding contracts.
- No current user-facing feature has been migrated into the new Platform Kernel/Application boundary. WordPress publishing was an initial pilot candidate; the first real migration will be selected after the foundation is exercised.
- The host is an in-process lifecycle boundary, not an isolation sandbox. Community code loading and plugin lifecycle persistence are not implemented.
- `docs/architecture/platform-kernel-applications-plugins.md` defines the new target boundaries, directory ownership, and staged migration approach. Its initial implementation is deliberately parallel to the current runtime.
