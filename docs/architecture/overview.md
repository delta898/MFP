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
- `src/memory/`
  - Kuzu-backed event-first memory, retrieval, preferences, domain knowledge.
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
