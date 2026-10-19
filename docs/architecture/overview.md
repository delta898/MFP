# Architecture Overview

## Goal
The system is evolving from a Telegram-triggered automation app into a conversational operations agent.

## Current Core Control Path
`Channel Adapter -> Agent Runtime -> Capability Registry -> Execution Layer -> Memory`

## Target Platform Path
`Channel Adapter -> Agent Runtime -> Application -> Platform Kernel -> Plugin`

The Plugin/Application path is used by migrated product flows alongside the Agent Capability path. Each flow moves when its Application and Plugin boundaries are implemented and verified.

## Main Components
- `src/platform/`
  - Shared Plugin operation contracts, registration, dispatch, and lifecycle. Native Plugin integrations use this Host through Composition and Plugin adapters.
- `src/applications/`
  - Product use cases that coordinate domain policy and injected service/Plugin ports.
- `src/composition/`
  - Composition roots wire concrete Applications, services, and Plugins into runtimes.
- `src/adapters/messaging/`
  - Channel-specific request parsing, protocol translation, response rendering, and transport clients.
  - Telegram is an adapter, not the place where business logic should grow.
- `src/host/agent/`
  - Host-side agent runtime, action/plan contracts, and request planning. Telegram-language parsing is owned by the Telegram adapter; confirmation persistence is owned by the storage adapter.
- `src/capabilities/`
  - Registers Agent actions independently from Plugins. Capability definitions do not come from Plugin contributions.
- `src/services/memory/`
  - Event-first memory semantics, retrieval contracts, owner projections, and activity lifecycle policies. SQLite schema and persistence live in `src/adapters/storage/memory/`; process startup, recovery, maintenance, and shutdown live in `src/host/memory/`.
- `src/services/knowledge/`
  - Provider-neutral knowledge contracts, snapshot normalization, and registry composition. Provider implementations and transport adapters live in `src/adapters/knowledge/`.
- `src/services/recommendations/`
  - Shared cross-Application recommendation lifecycle, producers, policy, persistence adapters, and delivery.
- `src/applications/blog/topic-recommendations/`
  - Blog-owned topic candidate generation and idea drafting. It consumes imported Knowledge and shared Recommendation services; channel capabilities translate requests into this Application.

## Design Principles
- Capability-based control over raw config mutation.
- Event-first memory; derived preference second.
- Validation before confirmation whenever possible.
- Knowledge providers follow `kind + transport + config`.
- UI is secondary to contracts and control flow.
- Core Plugins are bundled and cannot be installed or removed independently. Their runtime enablement is host-controlled; user-facing toggles are a separate product decision.
- UI, Telegram, and MCP construct Capability Registry instances for their own runtime contexts. These registries contain Agent actions; Plugin registration and enablement belong to the shared Platform Plugin Host.

## Plugin Runtime Status
- `src/platform/` owns the shared Plugin contract, validation, lifecycle, and operation dispatch. `src/composition/` selects bundled packages and supplies their explicit dependencies; `src/adapters/plugins/` maps service contracts to Plugin operations.
- Agent actions remain registered in `src/capabilities/` and are not dynamically contributed by Plugins. The obsolete `src/plugins/` capability host and its empty catalog have been removed.
- Core Plugin runtime is in-process and is not an isolation sandbox. Community executable Plugin loading and persistent lifecycle state are not implemented.
- `docs/architecture/platform-kernel-applications-plugins.md` is the canonical guide for boundaries, directory ownership, and migration rules.
