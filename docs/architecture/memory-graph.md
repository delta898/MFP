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

## Current Collection Boundary

Kuzu persists local application memory under `data/agent_memory_db`.
The store is opened lazily when a memory write or read is first requested. If the
native Kuzu module cannot be loaded, memory is disabled and the main application
continues to operate.

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

User attribution depends on the caller supplying a channel user id. Telegram
capability calls do this, but UI and automatic collection paths commonly omit it
and are therefore stored under the shared `SYSTEM` actor. This preserves an audit
event but is not sufficient for per-user personalization.

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

Before personalized topic recommendations are presented in the product, the
minimum structural work is:

1. attach UI and automatic topic activity to a stable local user identity;
2. retrieve topic and publish artifacts by user, not only by conversation/action;
3. distinguish weak signals (collected/saved) from strong signals
   (selected, drafted, published, accepted recommendation);
4. connect Naver trends through the existing knowledge-provider contract;
5. add recency, frequency, and explicit feedback to preference scoring.

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
- Insight generation uses the common Chat Model role, matching Telegram and other Agent support actions without a Telegram-specific model selector.
- A separate `agent_memory_model` role can be introduced later if the memory lane needs its own model policy.
