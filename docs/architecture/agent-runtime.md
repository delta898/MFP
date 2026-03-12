# Agent Runtime

## Responsibility
The agent runtime turns channel input into validated actions, manages confirmation, executes capabilities, and records events.

## Current Runtime Path
1. Channel adapter receives message.
2. Retrieval service builds a context packet.
3. Parser produces an action envelope.
4. Runtime validates the envelope and capability parameters.
5. If confirmation is needed, runtime creates a pending confirmation.
6. If confirmed or non-interactive, runtime executes the capability.
7. Result is rendered by the channel renderer.
8. Events are recorded into Kuzu.

## Current Boundaries
- Runtime may parse and validate.
- Runtime may not directly mutate config or run domain logic.
- Only capabilities execute changes.

## Current Gaps
- Planner is still implicit.
- Multi-step action composition is limited.
- Confirmation is action-level, not yet full plan-level.
