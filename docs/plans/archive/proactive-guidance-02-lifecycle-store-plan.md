# Proactive Guidance Stage 2: Lifecycle Store

## Status

- Phase: completed
- Design accepted: 2026-08-23
- Parent plan: `docs/plans/archive/proactive-guidance-main-plan.md`
- Parent branch: `feature/proactive-guidance-main`
- Work branch: `feature/proactive-guidance-02-lifecycle-store`
- Started: 2026-08-23

## Objective

Stage 1의 canonical Recommendation 계약을 owner-scoped event facts와 재생 가능한
현재 상태 projection으로 저장한다. 동일한 기회의 중복 materialization, 잘못된 상태
전이, 재시도 중복 이벤트와 만료된 추천 노출을 차단하면서 Kuzu가 사용할 수 없는
환경에서도 앱의 나머지 기능과 향후 추천 생성이 계속 동작할 수 있게 한다.

이번 단계는 producer, ranking, API, UI, scheduler와 capability 실행을 추가하지 않는다.

## Existing Memory Boundary

- `KuzuEventStore.appendEvent()`는 `EventNode`를 먼저 생성한 후 typed node를
  materialize하고 owner relation을 연결한다.
- deterministic evidence id를 사용하는 activity lifecycle은 이미 event retry를
  deduplicate한다.
- `OwnerNode`는 local installation owner를 보존하고 모든 새 event를 소유한다.
- `SuggestionNode`는 generic suggestion과 Agent confirmation이 섞여 있어 신규
  Recommendation lifecycle 저장소로 확장하지 않는다.
- Kuzu native module을 사용할 수 없으면 disabled store가 no-op/empty result로
  앱 전체를 fail-open한다.
- 현재 일반 event write와 typed projection write는 명시적 transaction으로 묶여
  있지 않다. 설치된 Kuzu 0.11.3은 manual ACID transaction을 지원하므로 신규
  Recommendation write에는 좁은 transaction boundary를 도입한다.

## Source of Truth

```text
recommendation.* EventNode facts
              ↓ replay/materialize
RecommendationNode current-state projection
```

- EventNode가 변경 불가능한 사실의 source of truth다.
- RecommendationNode는 목록, dedupe와 현재 상태 조회를 위한 projection이다.
- projection에만 있는 정보는 허용하지 않는다.
- projection write가 실패해도 event replay로 복구할 수 있어야 한다.
- passive event는 projection state나 preference를 임의로 변경하지 않는다.

## Proposed Persistence Schema

### RecommendationNode

```text
RecommendationNode(
  id STRING PRIMARY KEY,
  owner_user_id STRING,
  candidate_id STRING,
  kind STRING,
  producer_id STRING,
  title STRING,
  summary STRING,
  status STRING,
  dedupe_key STRING,
  recommendation_json STRING,
  available_at TIMESTAMP,
  snoozed_until TIMESTAMP,
  expires_at TIMESTAMP,
  last_event_at TIMESTAMP,
  created_at TIMESTAMP
)
```

`recommendation_json`은 stage 1에서 검증된 canonical internal record를 보존한다.
목록, expiry와 dedupe query에 필요한 필드만 별도 column으로 projection한다.
Candidate와 Policy를 별도 graph node로 만들지 않는다. 이 둘은 당시 판단을 설명하기
위한 snapshot이며 독립적인 durable truth가 아니기 때문이다.

### Relations

```text
OwnerOWNS_RECOMMENDATION(FROM OwnerNode TO RecommendationNode)
EventHAS_RECOMMENDATION(FROM EventNode TO RecommendationNode)
```

owner id를 node property와 relation 양쪽에 두어 accidental cross-owner relation을
검사할 수 있게 한다. action relation은 stage 8 capability handoff에서 추가한다.

### Schema Marker

- `004_recommendation_lifecycle` migration marker를 기록한다.
- 새 table/relation 생성과 schema version만 기록하며 historic `SuggestionNode`를
  scan, copy 또는 backfill하지 않는다.
- existing owner migration도 historic suggestion을 Recommendation에 연결하지 않는다.

## Event Contract

모든 lifecycle command는 stage 1 contract 검증 후 bounded event payload로 변환한다.

```js
{
  schema_version: 1,
  recommendation_id: '...',
  owner_user_id: '...',
  operation_id: 'caller supplied retry identity',
  previous_status: 'available',
  next_status: 'snoozed',
  occurred_at: 'ISO-8601',
  snoozed_until: null,
  reason_code: '',
  error_code: '',
  recommendation: null,
  metadata: {}
}
```

- `recommendation.created`만 canonical Recommendation snapshot 전체를 가진다.
- transition event는 현재 상태를 재생할 수 있는 bounded patch만 가진다.
- capability params, raw error stack, provider response와 credential을 transition
  metadata에 넣지 않는다.
- action 결과 세부 정보와 ActionNode relation은 stage 8에서 확장한다.

## Lifecycle Events and States

### State-changing Events

| Event | From | To |
|---|---|---|
| `recommendation.created` | none | `available` |
| `recommendation.snoozed` | `available`, `action_failed` | `snoozed` |
| `recommendation.reactivated` | `snoozed` | `available` |
| `recommendation.dismissed` | `available`, `snoozed`, `action_failed` | `dismissed` |
| `recommendation.action_started` | `available`, `action_failed` | `action_in_progress` |
| `recommendation.action_failed` | `action_in_progress` | `action_failed` |
| `recommendation.action_completed` | `action_in_progress` | `action_completed` |
| `recommendation.expired` | `available`, `snoozed`, `action_failed` | `expired` |

`recommendation.reactivated`는 stage 1 vocabulary에 추가한다. Snooze 종료를 event
없이 read-time 상태 변경으로 처리하면 event와 projection이 달라지기 때문이다.

### Observational Events

- `recommendation.delivered`
- `recommendation.opened`

이 이벤트는 현재 상태를 변경하지 않는다. `available` 또는 retry 가능한
`action_failed` 상태에서만 기록하며 preference evidence를 생성하지 않는다.

### Terminal States

- `action_completed`
- `dismissed`
- `expired`

Terminal Recommendation은 다시 열지 않는다. 같은 주제가 나중에 유효한 새 기회가
되면 새 recommendation id와 opportunity window로 생성한다.

### Expiry During Action

`action_in_progress`는 실행 중 자동 만료하지 않는다. 만료 전에 시작한 작업은 이후
완료할 수 있다. 작업이 실패했을 때 이미 expiry를 지났다면 retry 대신 별도
`recommendation.expired` transition을 적용한다.

## Identity and Idempotency

### Recommendation Identity

- `candidate_id`: 의미상 후보 identity
- `dedupe_key`: owner에게 동시에 하나만 활성화할 opportunity identity
- `recommendation_id`: 특정 opportunity window에 materialize된 product record
- `operation_id`: create/transition 호출의 retry identity

Stage 2는 caller가 canonical id를 제공하도록 요구하고 임의 timestamp ID를 만들지
않는다. 실제 candidate/recommendation id 생성 정책은 producer 단계에서 고정한다.

### Stable Event Id

```text
recommendation_event:<sha256(
  owner_user_id : recommendation_id : event_type : operation_id
)>
```

- 같은 operation retry는 동일 event id를 사용한다.
- 이미 존재하는 event면 current projection과 `deduplicated: true`를 반환한다.
- delivered/opened처럼 반복 가능한 event도 각 노출 시도의 stable operation id가
  필요하다.
- process 안에서는 recommendation id별 promise queue로 concurrent transition을
  순서화한다.

## Dedupe Policy

Active states:

- `available`
- `snoozed`
- `action_in_progress`
- `action_failed`

Terminal states:

- `action_completed`
- `dismissed`
- `expired`

Create 전에 같은 owner와 `dedupe_key`를 가진 유효한 active Recommendation을 찾는다.

- active가 있으면 새 event/node를 만들지 않고 기존 항목과 `deduplicated: true` 반환
- terminal만 있으면 새 opportunity window의 다른 recommendation id를 허용
- 같은 recommendation id retry는 terminal 여부와 무관하게 기존 항목 반환
- owner가 다르면 같은 dedupe key를 공유하지 않음

## Expiry and Snooze Reconciliation

시간 경과 자체는 mutation command가 아니므로 ordinary list/get이 암묵적으로 event를
쓰지 않는다.

- list query는 `expires_at > now` 조건으로 만료된 항목을 노출하지 않는다.
- `snoozed_until > now`인 항목은 available 목록에서 제외한다.
- 명시적인 `reconcileDueRecommendations({ now, limit })`가 due snooze에
  `reactivated`, due active item에 `expired` event를 기록한다.
- stage 2에서는 service 호출로 검증하고 stage 10 scheduler가 주기 실행을 소유한다.
- reconciliation은 bounded batch와 stable operation id를 사용한다.

## Store API

```js
createRecommendation(recommendation, context)
transitionRecommendation(command, context)
getRecommendation(ownerUserId, recommendationId)
findActiveByDedupeKey(ownerUserId, dedupeKey, now)
listAvailableRecommendations(ownerUserId, options)
listRecommendations(ownerUserId, options)
reconcileDueRecommendations(ownerUserId, options)
getRecommendationStoreStatus()
```

Query limits are bounded. API cursor/pagination DTO is deferred to stage 9, but store ordering
is fixed to `available_at DESC, recommendation_id ASC` for deterministic results.

## Code Boundary

```text
src/recommendations/core/
  lifecycle.js                 # pure event/state transition rules
  lifecycle.test.js

src/recommendations/
  lifecycle-store.js           # validation, dedupe, queue, failover orchestration
  lifecycle-store.test.js

src/memory/
  recommendation-repository.js # Kuzu schema materialization/query adapter
  recommendation-repository.test.js
  event-store.js               # schema registration and narrow delegation only
  store.js                     # disabled-store API compatibility
```

State transition and dedupe rules do not live in `event-store.js`. Kuzu-specific Cypher does
not enter the recommendation domain service.

## Transaction and Projection Repair

Recommendation persistent write는 같은 Kuzu connection에서 manual transaction을 사용한다.

1. validate command and current state outside the write transaction;
2. `BEGIN TRANSACTION`;
3. append deterministic EventNode fact;
4. materialize RecommendationNode projection;
5. relate owner and event to projection;
6. `COMMIT`;
7. 실패 시 `ROLLBACK` 후 오류 반환.

이 transaction은 Recommendation lifecycle write에만 적용하고 기존 memory write 전체를
한 번에 변경하지 않는다. Event가 source of truth라는 의미는 projection state가 event
reducer로 완전히 설명되고 재생 가능하다는 뜻이며, 정상 command에서 partial event를
남겨야 한다는 뜻은 아니다.

Pure reducer replay test로 projection 재생 가능성을 보장한다. 실제 database drift나
수동 손상에 대한 전체 owner event scan/rebuild command는 stage 11 audit/hardening에서
추가한다. ordinary get/list가 암묵적으로 전체 history를 scan하거나 projection을
수정하지 않는다.

## Kuzu Failure Behavior

Recommendation infrastructure must not prevent the app from opening or publishing existing
content.

- normal mode: `persistent`
- store 생성 시 Kuzu disabled 또는 초기화 불가: bounded `volatile` in-memory store를
  선택하고 한 번만 warning
- volatile mode supports the same create, transition, list and dedupe semantics
- volatile records disappear at process restart and are never presented as durable
- no automatic volatile-to-Kuzu merge is attempted in stage 2
- persistent mode가 시작된 뒤의 임의 query/write 오류는 volatile로 자동 전환하지
  않는다. transaction을 rollback하고 safe error를 반환해 code defect와 split-brain을
  숨기지 않는다.
- recommendation operation failure는 기존 app workflow를 막지 않으며 caller가
  non-blocking 처리한다.
- store status exposes `persistent | volatile | unavailable` and a safe failure reason for diagnostics

This fallback is Recommendation-specific. It does not change existing global Agent Memory
failure behavior.

## Security and Privacy

- every query is owner-scoped even in a single-owner desktop app
- recommendation id alone is never sufficient for get/transition
- event payload is normalized through the stage 1 secret/raw-data rules
- public DTO generation remains separate from repository rows
- error stack, credential, provider raw response and arbitrary client metadata are rejected
- owner mismatch, stale previous state and invalid transition fail before event append

## Validation Plan

- every allowed and forbidden lifecycle transition
- observational events do not change state
- stable event id and operation retry dedupe
- concurrent same-recommendation transitions serialize deterministically
- active dedupe and terminal new-window behavior
- owner isolation for id and dedupe queries
- snooze validation and explicit reactivation
- expiry filtering and bounded reconciliation
- recommendation-scoped transaction rollback과 pure reducer replay
- schema creation without SuggestionNode scan/backfill
- Kuzu repository query/row normalization with injected executor
- disabled/initialization-failed Kuzu starts with equivalent bounded volatile behavior
- persistent write failure rolls back without silent volatile split-brain
- historic SuggestionNode fixtures remain untouched
- existing memory, topic recommendation and full unit regression

## Accepted Decisions

1. EventNode를 source of truth, RecommendationNode를 rebuildable current projection으로 둔다.
2. Candidate/Policy 별도 node를 만들지 않고 canonical snapshot을 RecommendationNode에
   JSON으로 보존한다.
3. `004_recommendation_lifecycle`는 schema marker만 기록하고 historic SuggestionNode를
   전혀 scan/backfill하지 않는다.
4. snooze 종료를 명시적 `recommendation.reactivated` event로 기록한다.
5. ordinary reads는 event를 쓰지 않고 scheduler/service의 bounded reconciliation만
   reactivation과 expiry를 기록한다.
6. 모든 state-changing command와 repeated observational event에 caller-supplied
   `operation_id`를 요구한다.
7. Kuzu가 시작부터 disabled/초기화 불가일 때만 process-local volatile store를
   선택하고 자동 merge하지 않는다. persistent 시작 후 write 오류는 rollback한다.
8. Recommendation event와 projection은 좁은 ACID transaction으로 커밋하고 pure
   reducer로 재생 가능하게 하며 domain logic은 `event-store.js` 밖에 둔다.

The user accepted all eight decisions on 2026-08-23. The durable rationale is recorded in
`docs/decisions/2026-08-23-recommendation-lifecycle-store.md`.

## Completion Gate

- [x] 위 8개 설계 결정에 대한 사용자 합의
- [x] lifecycle/repository/failover focused tests 통과 (23/23)
- [x] actual Kuzu schema/transaction/owner-scoped lifecycle assertions 통과
- [x] existing memory/recommendation regression 포함 full unit suite 통과 (574/574)
- [x] runtime API/UI behavior 변경 없음 확인
- [x] 결과 공유 후 commit/merge 승인

The actual Kuzu smoke check completed its schema, transaction, dedupe query, owner-scoped list and
transition assertions. It remains a manual smoke check rather than a permanent Node test worker:
explicitly closing Kuzu 0.11.3 native handles exits the short-lived macOS verification process with
a native teardown fault after successful assertions. The production application keeps the shared
database open for its process lifetime, and repository query/rollback behavior remains covered by
the deterministic unit suite.
