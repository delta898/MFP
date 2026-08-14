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
- `OwnerNode`
- `MemoryMigrationNode`

## Current Roles
- Working memory: recent messages, actions, pending confirmations, recent artifacts.
- Preference memory: accumulated user tendencies from accepted actions and feedback.
- Suggestion memory: suggested items and their user feedback.
- Domain knowledge: canonical values and learned aliases.
- Owner identity: durable ownership across UI, automation, Telegram, and future channels while preserving each actor separately.

## Retrieval
Typed retrieval currently builds a context packet with:
- recent messages
- recent actions
- recent setting changes
- recent job runs
- recent artifacts
- pending confirmations
- preference summary

## Current Collection Boundary

Kuzu persists local application memory under `data/agent_memory_db`.
The store is proactively initialized when the UI server starts so schema and
persistent migrations do not depend on a Telegram session or the first memory
write. Later reads and writes reuse that process-local store. If the native Kuzu
module cannot be loaded or startup initialization fails, memory is disabled or
warned about while the main application continues to operate.

Current write paths are:

- Telegram Agent conversations
  - incoming and outgoing messages
  - parsed actions, plans, confirmations, and capability results
  - setting changes, job runs, generated content ideas, suggestions, and feedback
- Successful Google Sheets appends
  - topic rows become `content.topic.registered` events and `topic` artifacts
  - shopping rows become `shopping.item.recorded` events and `shopping_item` artifacts
- Derived memory
  - selected setting actions update preference nodes
  - accepted aliases update domain knowledge
  - suggestion and content-idea feedback update preference nodes

Collection happens after a successful row append for topics and shopping items.
It does not currently backfill existing Sheets rows, track later row edits or
status changes, or record a completed publish as a dedicated publish artifact.

Every local event and materialized artifact is now related to a durable
installation-local `OwnerNode`. Telegram, UI, and automation actors remain
separate: callers that do not supply a channel identity may still appear as the
`SYSTEM` actor, but their data ownership is no longer lost. Future account support
should map the local owner to an account instead of rewriting historic ownership.

## Content Idea Recommendation Readiness

An initial recommendation lane already exists:

- `content.idea.suggest` requests ideas through the content idea engine.
- The engine can combine retrieved memory with normalized external knowledge.
- Generated ideas are stored as `content_idea` artifacts.
- Helpful/not-helpful feedback can suppress repeatedly poor ideas.

The registered topic history is not yet part of that recommendation context.
`buildContextPacket()` retrieves recent action-produced `content_idea` artifacts,
while Sheet-appended `topic` artifacts are connected directly to their event.
Consequently, stored topic subjects, categories, and keywords do not currently
teach the idea provider what the user usually writes about.

The first external trends provider is structurally connected through the
`content_ideas` route, but it must be enabled and configured to return data.
The application's Naver trend rows are not currently exposed as a knowledge
provider snapshot for this lane.

Owner identity is the first completed prerequisite. Before personalized topic
recommendations are presented in the product, the remaining structural work is:

1. retrieve topic and publish artifacts by owner, not only by conversation/action;
2. distinguish weak signals (collected/saved) from strong signals
   (selected, drafted, published, accepted recommendation);
3. connect Naver trends through the existing knowledge-provider contract;
4. add recency, frequency, and explicit feedback to preference scoring.

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

## Preservation and Migration Policy
- `data/agent_memory_db*` is persistent user data and must not be reset automatically during startup or update.
- Schema changes use additive, idempotent migrations recorded in `MemoryMigrationNode`.
- A migration is marked complete only after its nodes and relationships are fully materialized. Interrupted migrations must be safe to run again.
- Legacy `/Users/delta898/Project/NaverAutoBlog/src/kuzu-service.js` remains a thin compatibility wrapper over the shared agent event store, so new writes do not target `data/memory_db*`.
- The manual reset helper remains a developer/recovery tool and requires explicit confirmation:
  - `/Users/delta898/Project/NaverAutoBlog/scripts/reset_agent_memory_db.sh`

## Insight Generation
- `InsightEngine` is retained as a lightweight long-term memory summary path.
- It no longer assumes a Gemini-only model path.
- Insight generation uses the common Chat Model role, matching Telegram and other Agent support actions without a Telegram-specific model selector.
- A separate `agent_memory_model` role can be introduced later if the memory lane needs its own model policy.
