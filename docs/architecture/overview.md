# Architecture Overview

## Goal
The system is evolving from a Telegram-triggered automation app into a conversational operations agent.

## Core Control Path
`Channel Adapter -> Agent Runtime -> Capability Registry -> Execution Layer -> Memory`

## Main Components
- `src/channels/`
  - Channel-specific adapters and renderers.
  - Telegram is an adapter, not the place where business logic should grow.
- `src/agent/`
  - Action schema, parser, runtime contract, confirmation handling.
- `src/capabilities/`
  - The only layer allowed to read or mutate operational state.
- `src/plugins/`
  - Bundled Core Plugin host. It owns first-party plugin registration and gates contributed capabilities by runtime enablement; product capabilities are being migrated incrementally.
- `src/memory/`
  - SQLite-backed event-first memory, retrieval, preferences, and domain knowledge.
- `src/knowledge/`
  - External/internal knowledge provider framework.
- `src/suggestions/`
  - Recommendation engine based on memory and knowledge providers.
- `src/content-ideas/`
  - Content idea generation lane separated from operational suggestions.

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
- No current user-facing feature has been migrated into a Core Plugin yet. WordPress publishing is planned as the first end-to-end feature pilot.
- The host is an in-process lifecycle boundary, not an isolation sandbox. Community code loading and plugin lifecycle persistence are not implemented.
