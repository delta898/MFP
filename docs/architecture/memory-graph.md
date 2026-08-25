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
- `RecommendationNode`
- `PreferenceNode`
- `DomainKnowledgeNode`
- `OwnerNode`
- `MemoryMigrationNode`
- `TopicFacetNode`

## Current Roles
- Working memory: recent messages, actions, pending confirmations, recent artifacts.
- Preference memory: accumulated user tendencies from accepted actions and feedback.
- Suggestion memory: suggested items and their user feedback.
- Recommendation lifecycle: owner-scoped, actionable product opportunities with event-backed current state.
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

Context packet schema version 2 keeps those conversation-scoped fields and adds
a separate `owner_memory` section. It contains owner activity signals, topic
semantics and recent owner artifacts. Collection-health auditing remains an
explicit diagnostic so normal retrieval does not pay for global integrity scans.
This separation prevents a Telegram chat id from becoming the durable user
identity and gives UI, automation, and future recommendation services the same
owner-scoped read contract.

The first derived owner profile is a read-time projection over activity signals
and topic facets. It exposes frequency, recency, stage, strength, recent subjects,
and explicit feedback while retaining evidence references. It intentionally has
no opaque aggregate interest score: recommendation weighting and recency decay
remain replaceable service policy rather than persisted user truth.

Topic recommendation candidate generation consumes the owner profile and
normalized knowledge snapshots without writing either back as new preference.
Candidates preserve request/provider/facet references, matched owner evidence,
and external trend facts. They intentionally carry no aggregate score; ranking
and diversity are a separate versioned policy layer.

`topic-ranking-v1` is the first such policy. It produces an auditable score
breakdown from explicit request, owner evidence, trend freshness/direction, and
explicit feedback, then applies category and token-similarity diversity as a
separate selection pass. Deferred candidates retain their reason. Ranking output
is a rebuildable service projection and is not persisted as owner truth.

Generated ideas now retain bounded recommendation provenance: run, candidate,
ranking policy, rank, score breakdown, and source references. This provenance is
stored on the `content_idea` artifact as a production trace, not a preference.
Candidate-specific learning is created only when a later selected/saved/drafted/
published/feedback outcome is recorded. The shared outcome contract uses stable
evidence ids for retry safety and intentionally has no exposure stage.

Artifact feedback carries that recommendation context into owner activity and
the owner-profile projection. Ranking can therefore connect explicit feedback
to the original candidate even if the generated title differs from its seed.
Historic feedback without context continues to use subject matching.

## Current Collection Boundary

Kuzu persists local application memory under `data/agent_memory_db`.
The store is proactively initialized when the UI server starts so schema and
persistent migrations do not depend on a Telegram session or the first memory
write. Later reads and writes reuse that process-local store. If the native Kuzu
module cannot be loaded or startup initialization fails, memory is disabled or
warned about while the main application continues to operate.

Recommendation lifecycle is the bounded exception to the disabled no-op behavior. If Kuzu is
unavailable from initialization, it uses a process-local volatile repository so Recommendation
producers do not block existing workflows. Volatile records are diagnostic, disappear at restart,
and are never merged automatically. Persistent-mode failures never trigger a silent fallback.

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

Content domain and transport provenance are orthogonal. `blog`, `shopping`, and
`sns` describe the activity; `telegram`, `ui`, and automation sources describe
where it originated. Canonical Telegram content requests retain conversation,
message, actor, channel, and request identity through confirmed topic
registration. Owner-only UI/system topic writes no longer inherit a synthetic
Telegram channel when no Telegram actor exists.

All newly appended events also keep a compact provenance envelope inside
`payload_json`. This preserves channel, actor, conversation, message, request,
and source identity even when an event-specific summary intentionally drops the
original payload. Historic events are not rewritten; an owner-scoped collection
audit reports legacy provenance gaps, bounded logical duplicates, scan
truncation, and graph ownership orphans.

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

The application's licensed Naver Trend Posting data is exposed through the
`content_ideas` knowledge route as a normalized latest-day snapshot. Snapshot
items remain `observed / weak` external knowledge and are not written as owner
activity merely because they were fetched.

Owner identity and owner-scoped retrieval are completed prerequisites. Before
personalized topic recommendations are presented in the product, the remaining
structural work is:

1. record explicit selection, draft, and publish evidence under the owner;
2. include owner-scoped saved topics in recommendation retrieval context;
3. distinguish weak signals (collected/saved) from strong signals
   (selected, drafted, published, accepted recommendation);
4. expose the grounded, ranked recommendation lane through a deliberately small
   product UI and connect successful UI actions to the outcome contract.

The first product lane is now implemented in Quick Posting. Its UI API composes
Memory Retrieval v2 with the Agent Runtime and `content.idea.suggest`; it does
not bypass the capability path or duplicate candidate/ranking logic in the UI.
The lane caches generated responses briefly, supports an explicit refresh, and
records no passive exposure event. Selection, successful topics save, confirmed
draft/publish, and explicit negative feedback retain the compact recommendation
context for later policy learning.

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

Feedback becomes lifecycle evidence only when its target carries a controlled
content domain. Content ideas and topics map to blog feedback; shopping item
artifacts map to shopping feedback. Generic workflow suggestions and ordinary
confirmation decisions remain outside content lifecycle scoring. Telegram
callback identity makes repeated delivery idempotent while preserving the
existing suggestion/artifact preference projections.

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

## Recommendation Lifecycle Projection

Canonical proactive guidance uses immutable `recommendation.*` EventNodes as facts and a
`RecommendationNode` as its rebuildable current-state projection. The projection retains indexed
owner, identity, status, dedupe, availability and expiry fields plus the validated canonical JSON.
Candidate and Policy snapshots are not promoted to independent graph truth.

`OwnerOWNS_RECOMMENDATION` and `EventHAS_RECOMMENDATION` preserve ownership and event provenance.
Reads are owner-scoped and ordinary list/get operations never change lifecycle state. A bounded
reconciliation command records explicit `recommendation.reactivated` and `recommendation.expired`
events; periodic scheduling is not yet connected.

Each Recommendation command requires an operation identity and commits its EventNode, projection,
owner relation and event relation in one Recommendation-specific transaction. Transaction access
is serialized for the shared Kuzu connection. Existing memory writes retain their current behavior.
Migration `004_recommendation_lifecycle` creates only the new schema and does not scan, copy or
backfill historic `SuggestionNode` records.

Legacy Agent and topic paths now enter this lifecycle through adapters. New generic
`agent.suggestions` results are not materialized as SuggestionNode; that node remains only for Agent
confirmation and historic feedback compatibility. Existing `suggestion_feedback.*` preferences can
temporarily suppress adapted legacy signals but are never copied into RecommendationNode.

Canonical recommendation feedback is an observational `recommendation.feedback_recorded` fact with
the strict values `helpful` and `not_helpful`. Negative feedback is followed by an explicit dismiss
transition, while positive feedback does not imply action execution. Existing topic selection,
save, draft and publish outcomes remain owner activity evidence.

The in-app `뜻밖의 발견` center reconciles due snooze/expiry commands before its owner-scoped read
and exposes only `available` or retryable `action_failed` content/commerce opportunities as public DTOs.
Operational guidance remains canonical lifecycle data for future delivery surfaces but is not rendered
in the Dashboard center. When the discovery projection is empty, it performs a bounded on-demand producer/policy evaluation. This
evaluation uses a short process-local TTL and writes only policy-selected Recommendations through the
canonical materializer; it does not treat a Dashboard view as preference evidence. `open` is an
observational event. The 24-hour snooze lifecycle remains available to other delivery channels but
the focused Dashboard discovery UI does not render a `나중에` action. `관심 없음` records explicit
`not_helpful` feedback followed by dismiss. Capability handoff re-resolves the persisted
Recommendation and current Registry definition, enters `action_in_progress` only immediately before
execution, and records `action_completed` or retryable `action_failed`. Presentation navigation does
not create an action transition.

`recommendation.rotated`는 사용자가 다른 발견을 요청했다는 전달 사실이다. 이 상태 전이는
`not_helpful` 피드백을 만들지 않으며 선호 학습의 부정 근거로 사용하지 않는다. 사용자가
명시적으로 `새로운 발견`을 요청한 평가에서는 source별 순환 offset과 현재 active 후보가 즉시
중복을 막으므로 rotated 항목의 일반 24시간 cooldown을 다시 적용하지 않는다. dismiss와
action-completed cooldown은 이 예외의 영향을 받지 않는다. 백그라운드·자동 전달에는 rolling
daily materialization cap을 적용하지만, 사용자가 직접 누른 `새로운 발견`은 이 자동 노출 cap을
적용하지 않는다. 명시적 요청도 per-run/per-kind 제한, active dedupe, dismiss/completion cooldown은
그대로 유지한다.

Candidate identity는 근거 있는 소재의 안정된 정체성이고 Recommendation identity는 그 소재를
사용자에게 전달한 개별 occurrence다. Policy evaluation은 delivery key를 materializer에 전달하므로
terminal Recommendation과 같은 Candidate가 다시 자격을 얻으면 새 RecommendationNode로 전달된다.
동일 평가 retry와 현재 active dedupe key는 계속 멱등 처리되어 중복 카드를 만들지 않는다.

Serendipity discovery는 세 source lane을 독립적으로 취급한다. `trends`는 현재 Naver Trends,
`news`는 저장 corpus와 bounded query News를 교대하는 탐색, `owner_history`는
저장·선택·작성·발행으로 확인된 owner activity다. News source는 가장 최근에 전달한 News
Candidate의 `discovery_news_transport`를 기준으로 우선순위를 교대하고, 우선 source가 비거나
실패할 때만 다른 source로 fallback한다. 한 묶음에서 News 카드가 둘 이상 나와도 총 카드 수의
홀짝에 의존하지 않으므로 다음 요청에서는 반대 source를 정확히 먼저 시도한다.
각 발견 묶음은 세 lane에 한 자리씩 먼저 배정하며, source가 비었을 때만 다른 lane의 근거 있는 후보가
빈자리를 채운다. persisted Candidate의 `discovery_source_lane` 노출 이력은 source별 순환 offset이 되지만
그 자체는 선호 사실이 아니다. 생성된 글감이나 단순 노출은 owner history 근거로 승격하지 않는다.
Trends와 owner history는 최근 7일을 우선하고 최대 14일까지만 discovery evidence로 인정한다.
Recommendation의 24시간 delivery TTL과 source evidence lookback은 서로 독립된 시간 정책이다.
저장 corpus의 단순 조회·노출 역시 owner preference로 승격하지 않으며, 최근 노출 observation id는
반복 방지를 위한 bounded exclusion으로만 사용한다. 클라이언트는 최근 3개 id만 제외해 작은
corpus도 교대로 순환할 수 있게 한다.
Producer의 대체 후보 탐색도 active recommendation과 policy cooldown 안의 dedupe key만 제외한다.
과거에 한 번 노출되었다는 이유만으로 owner-history 소재를 영구 제외하지 않는다.

## Owner-Scoped Operational Reads

Operational recovery candidates read JobRun facts through the existing graph path:

```text
OwnerNode -> OwnerOWNS_EVENT -> EventNode
          -> EventHAS_ACTION -> ActionNode
          -> ActionTRIGGERED_JOB -> JobRunNode
```

This path provides owner isolation without adding a duplicate Owner-to-Job relation or migrating
historic rows. The operational read model returns only job identity, name, status and timestamps;
`result_json` remains inside Memory and cannot become Recommendation evidence, metadata or public
presentation payload. Memory context prefers this owner-scoped read and keeps the older
conversation-scoped list only as a fail-open fallback when the owner reader is unavailable.

Recovery derivation groups runs by job name and evaluates only the latest run. A newer successful
run therefore resolves an older failure instead of producing stale guidance.

## Commerce Recommendation Grounding

Commerce opportunity production joins two independent facts without promoting either one beyond its
meaning: a fresh normalized Trends observation and an explicit or owner-backed shopping product
anchor. Trends `score`, `change_type` and `change_amount` remain search-interest measurements; they
are not represented as sales, conversion, purchase intent or revenue facts.

Current commerce anchors are limited to a product explicitly supplied with `shopping_content`
intent and owner `shopping` activity at `saved`, `selected`, `drafted` or `published` stage. General
blog activity, generated-only shopping ideas and category-only overlap cannot ground a commerce
candidate. Matching and candidate construction are separate modules so later measured commerce
signals or reviewed matching rules can be introduced without weakening provenance and lifecycle
boundaries.

## Recommendation Policy Context

Eligibility does not read raw config, License payloads or full Recommendation snapshots. An
owner-scoped Policy Context projects registered capability ids, presentation surfaces, validated
feature booleans, setting readiness booleans, quota counts and minimal Recommendation history.
History retains only identity, kind, dedupe, status and lifecycle timestamps; Candidate evidence,
Policy breakdown and lifecycle payloads are not copied.

Requirement rules are server-owned by `kind + producer_id`. Candidate metadata cannot declare that
an entitlement, setting, quota or capability check is unnecessary. A missing source closes only a
Candidate that needs that source, except Recommendation history: without persistent or bounded
volatile history, eligibility closes recommendation creation to prevent uncontrolled duplicates
while leaving existing application workflows unaffected.

Policy evaluation validates eligibility before scoring, ranks only eligible Candidates, and
materializes only the final diverse selection. Suppressed Candidates receive a rebuildable policy
decision in the evaluation result but are not persisted as Recommendation facts or preferences.
The evaluator delegates the only `recommendation.created` write to the existing materializer, so
lifecycle identity, transaction and volatile fallback behavior remain centralized.

## Current Gaps
- Preference scoring is still simple accumulation.
- Promotion rules need stronger recency/confidence handling.
- Planner-aware memory retrieval is not yet implemented.
- Recommendation delivery scheduling persists only timing/backoff state outside Kuzu. Recommendation facts,
  dedupe, cooldown and automatic-delivery materialization caps remain in the canonical lifecycle and policy layers.
- Full event replay repair for a manually damaged Recommendation projection is deferred to memory hardening.

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
