# Memory Graph

## Principle
Memory is event-first. Facts are stored first; preferences, suggestions, aliases, and domain knowledge are derived later.

## Current Node Types
- `MessageNode`
- `ActionNode`
- `SettingChangeNode`
- `JobRunNode`
- `ArtifactNode`
- `SuggestionNode`
- `PreferenceNode`
- `DomainKnowledgeNode`

## Current Roles
- Working memory: recent messages, actions, pending confirmations, recent artifacts.
- Preference memory: accumulated user tendencies from accepted actions and feedback.
- Suggestion memory: suggested items and their user feedback.
- Domain knowledge: canonical values and learned aliases.

## Retrieval
Typed retrieval currently builds a context packet with:
- recent messages
- recent actions
- recent setting changes
- recent job runs
- recent artifacts
- pending confirmations
- preference summary

## Current Gaps
- Preference scoring is still simple accumulation.
- Promotion rules need stronger recency/confidence handling.
- Planner-aware memory retrieval is not yet implemented.

## Persistence Boundary
- `runtimeContext.memory` is transient and must not be persisted into `EventNode.payload_json`.
- `recent_events`, `recent_messages`, `recent_actions`, `recent_setting_changes`, `recent_job_runs`, `recent_artifacts`, `preferences`, and `pending_confirmations` are retrieval-only context and must not be stored as nested payload snapshots.
- Persisted events should contain only:
  - the event's own minimal payload
  - compact summaries
  - ids / references to related nodes when needed

## Reset Policy
- Existing oversized `data/agent_memory_db*` files are treated as disposable experimental state.
- Legacy `/Users/delta898/Project/NaverAutoBlog/src/kuzu-service.js` is now a thin compatibility wrapper over the shared agent event store, so new writes no longer target `data/memory_db*`.
- After persistence policy changes, reset the DB instead of migrating old recursive payloads.
- Reset helper:
  - `/Users/delta898/Project/NaverAutoBlog/scripts/reset_agent_memory_db.sh`

## Insight Generation
- `InsightEngine` is retained as a lightweight long-term memory summary path.
- It no longer assumes a Gemini-only model path.
- For now, insight generation follows `TELEGRAM_CHAT_AI_MODE` so Telegram/Agent-related analysis stays on the same model selection as other Agent actions.
- A separate `agent_memory_model` role can be introduced later if the memory lane needs its own model policy.
