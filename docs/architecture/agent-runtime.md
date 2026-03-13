# Agent Runtime

## Responsibility
The agent runtime turns channel input into validated actions, manages confirmation, executes capabilities, and records events.

## Current Runtime Path
1. Channel adapter receives message.
2. Retrieval service builds a context packet.
3. Parser produces an action envelope.
4. Planner turns the envelope into a plan.
5. Runtime validates plan steps and capability parameters.
6. If confirmation is needed, runtime creates a pending confirmation.
7. If confirmed or non-interactive, runtime executes the capability.
8. Result is rendered by the channel renderer.
9. Events are recorded into Kuzu.

## Current Boundaries
- Runtime may parse and validate.
- Runtime may not directly mutate config or run domain logic.
- Only capabilities execute changes.

## Current Gaps
- Multi-step action composition is still limited to preflight query expansion.
- Pending confirmation handling is only partially rule-driven.
- MCP wire transport is still not implemented.
- A prototype MCP adapter/tool contract layer can now sit above runtime, but it is not yet exposed as a real server.

## Current Planner Coverage
- Deduplicates actions.
- Orders actions by execution priority.
- Expands setting updates into `query -> update` preflight plans where needed.
- Adds capability preconditions to steps.
- Replaces older same-domain pending confirmations when a new conflicting setting change is planned.
- Supports text-driven latest pending apply/reject commands.

## Next Step
- Finish Phase 1 practical stabilization:
  - pending confirmation planner rules
  - deterministic parser coverage for common settings phrases
  - confirmation UX consistency
  - provider failure visibility
- Then move to:
  - MCP transport implementation
  - richer multi-step planning
