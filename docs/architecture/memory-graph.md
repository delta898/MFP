# Memory Graph

## Principle
Memory is event-first. Facts are stored first; preferences, suggestions, aliases, and domain knowledge are derived later.

The memory graph is a reusable intelligence foundation, not a recommendation
database. Its layers are intentionally separated:

```text
source fact -> semantic materialization -> derived insight/projection -> service
```

- Source facts preserve what happened, who owned it, and where it came from.
- Semantic materialization makes explicit fields consistently queryable without
  changing their meaning.
- Derived insights add confidence, recency, scoring, or interpretation and must
  remain rebuildable from their supporting facts.
- Services such as topic recommendation, duplicate avoidance, cross-channel
  reuse, and automation personalization consume projections instead of writing
  service-specific conclusions back into source facts.

Exposure, generation, saving, selection, drafting, publication, and feedback are
different evidence. A weaker stage must never be silently promoted to a stronger
one. This boundary keeps future policies replaceable without migrating the
underlying user history.

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
- `TopicFacetNode`

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
- Blog writing lifecycle
  - validated quick posting, preview publishing, local manuscript, and pasted
    Markdown operations record `selected`
  - confirmed platform draft/publish success records `drafted` or `published`
    per platform
  - scheduled registration is not misclassified as publication
- Shopping writing lifecycle
  - validated row, batch, automatic, and quick execution records `selected`
  - confirmed platform draft/publish success records `drafted` or `published`
    per platform; append-only remains `saved`
- SNS distribution lifecycle
  - validated manual requests and policy/format-qualified automatic deliveries
    record `selected`
  - direct, reconciled, or duplicate-confirmed Buffer success records
    channel-specific `published`; skipped and failed rows do not
- Derived memory
  - selected setting actions update preference nodes
  - accepted aliases update domain knowledge
  - suggestion and content-idea feedback update preference nodes

Collection happens after a successful row append for topics and shopping items.
It does not currently backfill existing Sheets rows or track later row edits.
Blog, Shopping, and SNS lifecycle integrations record new events only and do not
infer historic draft or publication state from Sheet status text.

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

Owner identity and owner-scoped retrieval are completed prerequisites. Before
personalized topic recommendations are presented in the product, the remaining
structural work is:

1. record explicit selection, draft, and publish evidence under the owner;
2. include owner-scoped saved topics in recommendation retrieval context;
3. distinguish weak signals (collected/saved) from strong signals
   (selected, drafted, published, accepted recommendation);
4. connect Naver trends through the existing knowledge-provider contract;
5. add recency, frequency, and explicit feedback to preference scoring.

## Owner Activity Signals

Owner-scoped activity is separated into `blog`, `shopping`, and `sns` domains.
This keeps each product path explicit while allowing later cross-domain insight.
Evidence uses categorical stages before any numeric recommendation policy is
applied:

- `observed`: surfaced or collected only;
- `generated`: proposed by the system;
- `saved`: durably registered as a topic;
- `selected`: explicitly chosen for writing;
- `drafted`: successfully stored as a draft;
- `published`: successfully published;
- `feedback`: an explicit positive or negative response.

A stage is never inferred from weaker evidence. Current `topic` and
`shopping_item` artifacts mean only `saved` in their respective domains; they do
not imply selection, drafting, or publication. Strength is kept as `weak`,
`medium`, `strong`, or `explicit` so future scoring can evolve without rewriting
stored facts.

Explicit lifecycle facts use `activity.lifecycle.<domain>.<stage>` events. Their
payload preserves subject/entity reference, source, platform, result reference,
and a caller-supplied evidence id. A deterministic event id makes retries
idempotent. Owner activity retrieval combines these events with existing saved
artifacts while retaining whether each signal came from an event or artifact.
Product integrations must record terminal evidence only after platform-confirmed
success, and GraphDB failure must not reverse the business operation.

Topic registration preserves subject, category, platform, keywords, instruction,
and source in compact event/artifact payloads. Migration `003_topic_semantics`
materializes deterministic keyword/category/platform values as facets while
leaving the original payload unchanged. SNS discovery, drafting, and publishing
are not yet recorded in GraphDB.

Topic semantics use a generic `TopicFacetNode` with `kind`, `scope`, and a
normalized/display value pair. `ArtifactHAS_TOPIC_FACET` retains provenance from
each saved topic. Owner-level frequency and recency are derived through
`OwnerNode -> ArtifactNode(topic) -> TopicFacetNode`; no duplicate direct
Owner-to-facet edge is stored. Subject remains the artifact title and instruction
remains raw payload until a confidence-bearing derived-insight phase is added.

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
