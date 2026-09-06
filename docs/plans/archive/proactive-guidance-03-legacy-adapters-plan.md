# Proactive Guidance Stage 3: Legacy Adapters

## Status

- Phase: completed; awaiting commit and parent merge approval
- Design accepted: 2026-08-23
- Parent plan: `docs/plans/archive/proactive-guidance-main-plan.md`
- Parent branch: `feature/proactive-guidance-main`
- Work branch: `feature/proactive-guidance-03-legacy-adapters`
- Started: 2026-08-23

## Objective

기존 generic suggestion과 topic recommendation 경로를 canonical Recommendation 계약과
lifecycle store에 연결한다. 현재 `agent.suggestions.get`, Telegram, 빠른 포스팅 UI의
외부 응답은 호환하면서 신규 product recommendation이 더 이상 `SuggestionNode`에
기록되지 않게 한다.

이 단계는 새로운 News/Trends provider, 신규 producer 종류, 공통 ranking policy,
Recommendation Center UI 또는 capability 실행을 만들지 않는다. 기존 기능을 canonical
경계에 연결하는 adapter 단계다.

## Existing Paths and Problems

### Generic Suggestion

```text
src/suggestions/providers/memory-based.js
        -> src/suggestions/engine.js
        -> agent.suggestions.get
        -> result.data.suggestions[]
        -> EventStore agent action materialization
        -> SuggestionNode
        -> Telegram suggestion feedback
```

- provider가 후보 생성, 문구, 임시 timestamp id, suppression과 legacy DTO를 동시에 소유한다.
- `Date.now()` id는 retry와 opportunity dedupe에 사용할 수 없다.
- Agent action 결과의 모든 suggestion이 `SuggestionNode`로 자동 materialize된다.
- pending confirmation 안내도 product suggestion과 같은 배열에 섞인다.
- Telegram의 `next_action` 수락 버튼은 실제 action을 수행하지 않고 feedback만 기록한다.

### Topic Recommendation

```text
owner profile + Trends knowledge
        -> topic candidate generator
        -> topic-ranking-v1
        -> AI wording
        -> legacy recommendation provenance on idea/artifact/outcome
```

- 후보와 ranking provenance는 충분하지만 stage 1 canonical Candidate/Policy/Recommendation
  형식은 아니다.
- UI outcome은 activity evidence로 잘 보존되지만 durable Recommendation id가 없다.
- 빠른 포스팅 캐시와 응답 형식은 이미 사용 중이므로 깨뜨리면 안 된다.

### Historic Feedback

- 과거 `suggestion_feedback.*` preference는 generic suppression에 실제 사용 중이다.
- 이미 전송된 Telegram callback은 `suggest_feedback:*` 형식이다.
- historic `SuggestionNode`와 callback은 지우거나 다시 쓰지 않아야 한다.

## Target Boundary

```text
legacy source data
      ↓
Recommendation adapter / existing specialized topic lane
      ↓
canonical Candidate + compatibility Policy
      ↓
Recommendation lifecycle store
      ↓
canonical Recommendation
      ├─ legacy agent suggestion DTO adapter
      ├─ existing quick-posting idea DTO adapter
      └─ Telegram recommendation feedback adapter
```

`src/suggestions/`는 호환 entry point만 남기고 신규 domain rule을 소유하지 않는다.
canonical conversion, identity, materialization과 feedback 연결은
`src/recommendations/adapters/` 아래에 둔다.

## Generic Suggestion Conversion

### Product Recommendations

| Existing signal | Canonical kind | Evidence | Initial handoff |
|---|---|---|---|
| preferred Trends collection time | `workflow_hint` | `system_state`, setting ref | relevant settings presentation or null |
| failed recent job | `recovery_action` | `system_state`, job ref | null until capability handoff stage |
| external Trends item | `content_opportunity` | `knowledge`, provider provenance | `blog.quick` presentation |

Each adapter output must have:

- stable candidate id derived from owner + signal kind + source identity;
- stable dedupe key for one active opportunity;
- deterministic recommendation id derived from candidate and opportunity window;
- bounded evidence and no raw job result/provider payload;
- explicit expiry (Trends 24h, failed job 72h, workflow hint 7d by default);
- `legacy-suggestion-compat-v1` PolicyDecision.

The compatibility policy is not the future product ranking policy. It only preserves the current
provider order and historic feedback suppression until stages 6 and 7 replace it. Its score is
normalized to the canonical `0..1` range and its identity makes the temporary boundary auditable.

### Pending Confirmations

Pending confirmation advice is not converted to Recommendation. It remains a legacy-only text
item because the confirmation already has its own durable id, state and approval UI.

The compatibility DTO marks it as non-feedback/non-actionable. Telegram must not show the current
misleading `수락` button for it; actual approval continues only through the confirmation card.
This is a correctness fix, not a capability handoff implementation.

## Materialization and Compatibility DTOs

The canonical materializer:

1. validates an adapted Candidate and compatibility/existing Policy;
2. builds the canonical Recommendation;
3. calls `createRecommendation()` with stable operation identity;
4. accepts active dedupe returning an existing Recommendation;
5. returns a compatibility DTO from the stored canonical record.

`agent.suggestions.get` keeps:

```js
{
  success,
  message,
  data: {
    suggestions: [{ id, type, summary, payload, status }],
    knowledge
  }
}
```

Canonical-backed DTOs may add fields such as `recommendation_id` and
`feedback_transport: 'recommendation'`; existing fields are not removed. The public payload does
not expose owner, policy breakdown, dedupe key or capability params.

Recommendation persistence is fail-open for these existing query/generation workflows. If
materialization fails, the user still receives a bounded legacy DTO with
`persistence_status: 'unavailable'`; raw errors are logged safely and not returned.

## Stop New Generic SuggestionNode Writes

The `agent.action.executed` typed materializer currently copies
`result.data.suggestions[]` into SuggestionNode. Stage 3 removes only that generic product write.

It does not remove:

- `agent.confirmation.requested` SuggestionNode writes;
- confirmation accepted/rejected updates;
- historic `suggestion.*` feedback handling;
- historic SuggestionNode reads required by old callbacks.

A structure test prevents future `agent.suggestions` result materialization from calling
`_upsertSuggestionNode`. Existing confirmation materialization remains covered separately.

## Telegram Feedback Adapter

New canonical-backed suggestion buttons use the short `rec_fb:h:<id>` / `rec_fb:n:<id>` callback
namespace and a Telegram-safe canonical id. Existing `suggest_feedback:*` callbacks remain
supported for messages already sent.

Stage 3 adds observational `recommendation.feedback_recorded` with a strict feedback enum:

- `helpful`
- `not_helpful`

Feedback does not imply capability execution or a stronger owner activity stage. `not_helpful`
also dismisses the currently active Recommendation so it disappears from later lists. `helpful`
records feedback but leaves it available. Operation ids derive from the Telegram callback query id,
making retries idempotent.

The renderer uses `도움됨 / 별로` for canonical Recommendation feedback. It does not use `수락`
unless a future capability handoff actually performs an action.

## Topic Recommendation Adapter

The existing topic generator and `topic-ranking-v1` remain the specialized lane. An adapter maps
each selected, worded idea into the canonical contracts:

- existing topic candidate id becomes canonical candidate identity;
- idea title/summary/reason become presentation fields;
- source refs and owner matches become bounded Evidence;
- raw topic score is normalized for canonical PolicyDecision while the existing breakdown remains;
- handoff is presentation-only to `blog.quick`;
- dedupe key is candidate-based and expiry is 24h;
- Recommendation id is added to the existing nested recommendation context.

The quick-posting response shape, cache behavior, smart usage accounting and visible UI remain
unchanged. Cached responses reuse the same canonical Recommendation ids and do not rematerialize
or create delivery evidence.

Existing selected/saved/drafted/published outcomes continue as event-first owner activity facts.
When a feedback outcome includes a canonical recommendation id, the learning adapter also records
`recommendation.feedback_recorded`. It does not translate selection or publication into
`action_started/action_completed`; that belongs to stage 8 capability handoff.

## Proposed Code Boundary

```text
src/recommendations/adapters/
  legacy-memory-candidate-adapter.js
  legacy-suggestion-dto-adapter.js
  topic-canonical-adapter.js
  recommendation-materializer.js
  recommendation-feedback-adapter.js

src/suggestions/
  engine.js                       # thin compatibility orchestration only
  providers/memory-based.js       # thin legacy import/facade only

src/capabilities/agent/suggestions.js
  # existing capability and response contract

src/channels/telegram/renderer.js
src/telegram-bot.service.js
  # dual old/new callback compatibility

src/memory/event-store.js
  # stop generic result -> SuggestionNode; confirmation path unchanged
```

Adapters are pure where possible. Runtime composition injects clock, event store and logger so
tests do not depend on current time, Kuzu or Telegram.

## Identity and Dedupe

- No adapter uses `Date.now()` or random UUID for candidate/recommendation identity.
- Hash input is versioned and includes owner plus bounded semantic/source identity.
- Opportunity windows are explicit; the same active opportunity deduplicates across UI/Telegram
  query retries.
- A later source item/job occurrence receives a new recommendation id even if its kind is equal.
- Adapter-generated canonical recommendation ids use a bounded `rec_<hash>` form, so the same id
  can safely serve as the compatibility DTO id and fit Telegram's callback size limit without a
  separate ephemeral alias map.

## Feedback Compatibility

Historic `suggestion_feedback.*` preferences remain an input adapter for the temporary compatibility
policy. No historic data is copied into RecommendationNode.

New Recommendation feedback is not written back as `suggestion_feedback.*`; stage 7 will consume
canonical feedback facts. This intentionally stops extending the legacy preference format while
preserving its existing influence during transition.

## Validation Plan

- every supported legacy signal maps to a valid canonical Candidate
- pending confirmations remain legacy-only and non-actionable
- stable ids, opportunity windows and active dedupe
- raw job/provider payload and secrets cannot cross the adapter
- compatibility Policy is explicit and normalized
- materialization failure preserves legacy capability output without raw error
- `agent.suggestions.get` response/message compatibility
- new Agent suggestion execution creates RecommendationNode path only
- confirmation request still creates/updates SuggestionNode
- historic `suggest_feedback:*` callback remains accepted
- canonical Telegram feedback is retry-safe and negative feedback dismisses
- renderer does not show false action acceptance
- topic candidate/ranking/evidence map validates against canonical contracts
- quick-posting response, cache and smart usage compatibility
- topic feedback records activity evidence plus canonical feedback when id is present
- structure guard prevents new product logic from accumulating under `src/suggestions/`
- focused adapter/renderer tests and full unit regression

## Accepted Decisions

1. Pending confirmation advice는 Recommendation으로 만들지 않고 feedback/action 버튼 없는
   legacy-only text로 유지한다.
2. 기존 generic product signals는 임시 `legacy-suggestion-compat-v1` policy를 명시적으로
   거쳐 canonical Recommendation으로 저장한다.
3. 신규 generic Agent 결과의 SuggestionNode materialization을 중단하되 confirmation 및
   historic feedback path는 유지한다.
4. `recommendation.feedback_recorded` observational event를 추가하고 canonical UI/Telegram의
   신규 feedback 사실로 사용한다.
5. `not_helpful`은 feedback 기록 후 Recommendation을 dismiss하고, `helpful`은 상태를
   바꾸지 않는다.
6. 실제 실행이 없는 Recommendation에는 `수락` 버튼을 표시하지 않고 `도움됨/별로`만
   제공한다.
7. 기존 topic recommendation을 새로 작성하지 않고 adapter로 canonical materialize하며
   빠른 포스팅의 visible response/cache를 보존한다.
8. topic의 selected/saved/drafted/published는 기존 activity outcome으로 유지하고 stage 8
   전에는 Recommendation action lifecycle로 오해해 변환하지 않는다.
9. persistence 실패는 기존 추천 조회/글감 생성 흐름을 막지 않으며 safe compatibility
   output으로 fail-open한다.
10. historic SuggestionNode와 suggestion feedback은 backfill하지 않고 read compatibility만
    유지한다.

The user accepted all ten decisions on 2026-08-23. The durable rationale is recorded in
`docs/decisions/2026-08-23-recommendation-legacy-adapters.md`.

## Completion Gate

- [x] 위 10개 설계 결정에 대한 사용자 합의
- [x] adapter/materialization/feedback focused tests 통과
- [x] Telegram renderer/callback compatibility tests 통과
- [x] topic recommendation and quick-posting service regression 통과
- [x] full unit suite 통과 (595/595)
- [x] automated browser UI smoke 통과 (39 fixture requests)
- [x] 사용자 quick-posting UI 및 Gemini 3.7 실제 호출 smoke test 통과
- [x] Telegram recommendation feedback smoke test는 Telegram 사용 가능한 후속 시점으로 이관
- [x] 결과 공유 후 commit/merge 승인 완료

## User Smoke Finding: Gemini 3.7 Thinking Level

첫 사용자 smoke에서 `gemini-3.7-flash`가 공통 `reasoningEffort: minimal`을 그대로
`thinkingLevel: minimal`로 받아 거부했고, 글감 추천이 안전 fallback으로 전환되었다. 화면의
반복적인 `핵심 포인트` 제목은 canonical adapter 문제가 아니라 이 fallback 결과였다.

모델별 차이를 호출부에 하드코딩하지 않고 AI model catalog capability로 표현한다.

- Gemini 3.7 Flash: `low`, `medium`, `high`
- Gemini 3.6 Flash: `minimal`, `low`, `medium`, `high`
- 요청 단계가 지원되지 않으면 가장 가까운 높은 지원 단계, 없으면 낮은 지원 단계로 조정한다.
- remote catalog의 구버전 항목이 신규 capability를 아직 포함하지 않아도 bundled runtime
  capability를 잃지 않도록 capability를 field 단위로 병합한다.

수정 후 model policy focused test와 전체 unit 595건, browser fixture 39건을 다시 통과했다.
사용자 runtime 재시작 후 Gemini 3.7 실제 호출이 성공하고 서로 다른 AI 생성 제목이
표시되는 것을 확인했다. Telegram recommendation feedback의 실제 채널 smoke test는
Telegram 사용 가능한 후속 시점에 수행하며 Stage 3 완료를 막지 않는다.
