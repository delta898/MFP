# Proactive Guidance Stage 1: Contracts and Consolidation

## Status

- Phase: completed
- Parent plan: `docs/plans/archive/proactive-guidance-main-plan.md`
- Parent branch: `feature/proactive-guidance-main`
- Work branch: `feature/proactive-guidance-01-contracts`
- Started: 2026-08-23
- Completed: 2026-08-23

## Objective

현재의 lightweight generic suggestion과 grounded topic recommendation을
깨뜨리지 않으면서 향후 setup, recovery, commerce, news와 workflow 추천이 함께
사용할 수 있는 canonical contract를 고정한다.

이번 단계는 동작하는 추천 센터나 저장소를 만들지 않는다. 후속 단계가 각자 다른
schema와 용어를 만들지 않도록 domain vocabulary, validation과 compatibility
boundary를 먼저 확정하는 작업이다.

## Existing Reality

### Generic Suggestion Lane

- `src/suggestions/engine.js`
- `src/suggestions/providers/memory-based.js`
- `agent.suggestions.get`
- generic workflow, pending confirmation, failed job와 trend hint를 생성
- `id`, `type`, `summary`, `payload`, `status` 중심의 가벼운 결과
- stable identity, expiry, ranking provenance와 executable handoff가 없음

### Topic Recommendation Lane

- `src/recommendations/topic-candidate-generator.js`
- `src/recommendations/topic-ranking-policy.js`
- `src/recommendations/topic-recommendation-learning.js`
- owner evidence와 external trends를 이용한 stable candidate, ranking과 learning
- Quick Posting UI가 Agent Runtime과 `content.idea.suggest` capability를 통해 사용

### Persistence Collision

- `SuggestionNode`가 generic suggestion뿐 아니라 Agent confirmation도 저장한다.
- 새 recommendation lifecycle을 이 node에 계속 추가하면 confirmation과 product
  recommendation의 의미가 더 강하게 결합된다.

## Proposed Domain Layers

### 1. Recommendation Candidate

Producer가 생성하는 정책 적용 전 후보이다. Producer는 최종 rank, 노출 상태나
사용자 preference를 쓰지 않는다.

```js
{
  schema_version: 1,
  candidate_id: 'stable candidate identity',
  kind: 'content_opportunity',
  producer_id: 'news-content-v1',
  owner_user_id: 'owner identity',
  title: '추천 제목',
  summary: '짧은 제안',
  explanation: '왜 이 후보가 생성되었는지',
  evidence: [],
  handoff: null,
  dedupe_key: 'semantic opportunity identity',
  created_at: 'ISO-8601',
  expires_at: 'ISO-8601',
  metadata: {}
}
```

### 2. Policy Decision

Candidate를 노출할 수 있는지와 순위를 결정하는 rebuildable projection이다.

```js
{
  policy_id: 'proactive-guidance-ranking',
  policy_version: 1,
  eligible: true,
  suppression_reasons: [],
  score: 0.82,
  rank: 1,
  breakdown: {},
  decided_at: 'ISO-8601'
}
```

Canonical policy score는 provider나 기존 topic ranking의 원점수와 분리된 `0..1`
범위이다. 기존 원점수는 stage 3 adapter에서 정규화하고 필요한 세부 근거는
breakdown에 보존한다.

### 3. Recommendation

정책을 통과해 owner에게 제공할 수 있도록 materialize된 product record이다.

```js
{
  schema_version: 1,
  recommendation_id: 'stable opportunity instance identity',
  owner_user_id: 'owner identity',
  candidate: {},
  policy: {},
  status: 'available',
  available_at: 'ISO-8601',
  snoozed_until: null,
  expires_at: 'ISO-8601',
  last_event_at: 'ISO-8601'
}
```

Candidate와 policy snapshot을 보존해 나중에 추천 이유와 당시 판단을 재구성할 수
있게 한다. 이 snapshot은 사용자 preference가 아니다.

## Recommendation Kinds

- `content_opportunity`: 일반 블로그 글감 또는 콘텐츠 기회
- `commerce_opportunity`: 쇼핑·상품 콘텐츠 기회
- `setup_guidance`: 미완료 연결이나 설정 안내
- `recovery_action`: 실패·중단 작업의 복구 안내
- `workflow_hint`: 대기 작업, 기능 활용과 운영 흐름 안내

kind는 provider나 transport 이름을 포함하지 않는다. `news`, `trends`,
`builtin_api`, `mcp_tool`은 evidence provenance에 속한다.

## Evidence Contract

```js
{
  evidence_id: 'stable reference',
  kind: 'owner_activity | knowledge | system_state | capability_state',
  stage: 'observed | generated | saved | selected | drafted | published | feedback',
  strength: 'weak | medium | strong | explicit',
  summary: 'UI에 표시 가능한 근거',
  observed_at: 'ISO-8601',
  expires_at: 'ISO-8601 or null',
  source_ref: {
    kind: 'event | artifact | knowledge | setting | job | capability',
    id: 'source identity',
    provider_id: '',
    transport: '',
    url: '',
    timestamp: 'ISO-8601 or null'
  },
  features: {}
}
```

Rules:

- external Knowledge는 기본적으로 `observed / weak`이다.
- 외부 조회나 추천 노출은 owner activity 또는 preference로 승격하지 않는다.
- UI에 표시할 summary와 내부 ranking features를 구분한다.
- provider id와 transport는 provenance이며 Recommendation kind가 아니다.
- raw vendor response와 secret은 evidence에 포함하지 않는다.

## Handoff Contract

한 Recommendation은 최대 하나의 primary handoff를 가진다. dismiss, snooze와
details 같은 lifecycle UI controls는 handoff에 포함하지 않는다.

### Presentation Handoff

부작용 없이 기존 제품 화면이나 폼으로 사용자를 이동시킨다.

```js
{
  type: 'presentation',
  label: '빠른 포스팅 열기',
  target: {
    surface: 'blog.quick',
    view: 'blog',
    tab: 'quick'
  },
  payload: {
    subject: '추천 주제',
    keywords: []
  }
}
```

`surface`, `view`, `tab`은 allowlist로 검증한다. arbitrary URL이나 JavaScript
callback은 허용하지 않는다.

### Capability Handoff

실제 조회, 생성, 설정 변경, 저장 또는 발행 workflow를 시작한다.

```js
{
  type: 'capability',
  label: '트렌드 다시 수집',
  capability_id: 'jobs.trends.run_collect',
  params: {},
  intent: '트렌드 다시 수집'
}
```

Rules:

- browser는 raw descriptor를 실행 권한으로 사용하지 않는다.
- server는 recommendation id로 저장된 handoff를 다시 resolve한다.
- Capability Registry가 validate, preview와 confirmation policy를 결정한다.
- Recommendation이 `requires_confirmation`을 임의로 낮출 수 없다.
- entitlement, quota와 current config는 실행 시점에 다시 검사한다.
- 실행할 capability가 없으면 presentation handoff 또는 정보 카드로 제한한다.

Handoff label은 UI에 표시할 bounded text이며 capability id나 params를 대신하지 않는다.

## Lifecycle Vocabulary

Materialized states:

- `available`
- `snoozed`
- `action_in_progress`
- `action_failed`
- `action_completed`
- `dismissed`
- `expired`

Operational events:

- `recommendation.created`
- `recommendation.delivered`
- `recommendation.opened`
- `recommendation.snoozed`
- `recommendation.dismissed`
- `recommendation.action_started`
- `recommendation.action_failed`
- `recommendation.action_completed`
- `recommendation.expired`

`delivered`와 `opened`는 빈도와 funnel 관측에 사용할 수 있지만 preference evidence가
아니다. `dismissed`도 즉시 영구 preference로 만들지 않고 kind/subject/context가
충분히 반복될 때 정책 입력으로 해석한다.

## Public and Internal Boundary

UI 응답에는 표시와 선택에 필요한 safe DTO만 제공한다.

- recommendation id
- kind, title, summary와 explanation
- bounded evidence summaries와 source links
- status, available/expiry time
- primary action label과 handoff type

server-only record에는 다음을 유지한다.

- owner identity
- full policy breakdown
- capability params
- internal evidence features
- dedupe material

클라이언트가 보낸 capability id, params, owner id 또는 policy score를 신뢰하지 않는다.

## Compatibility Strategy

### Generic Suggestions

- 기존 `agent.suggestions.get` command와 response는 유지한다.
- 새 service 결과를 기존 `{ suggestions: [...] }` shape으로 변환하는 adapter를 둔다.
- stage 3에서 신규 product suggestion write path를 Recommendation으로 전환한다.
- historic `suggestion.*` events와 `SuggestionNode`는 backfill하거나 새 schema로
  추정 변환하지 않고 당시의 legacy 사실로 보존한다.
- 기존 feedback이 필요한 경우 compatibility adapter가 읽기만 한다.
- 신규 product lifecycle은 `recommendation.*` vocabulary를 사용한다.

### Topic Recommendations

- 기존 stable candidate id, ranking policy와 source refs를 보존한다.
- topic-specific context는 canonical candidate/evidence로 adapter한다.
- 기존 Quick Posting response와 outcome endpoint는 즉시 변경하지 않는다.
- 검증 후 canonical service가 내부 source of truth가 되도록 단계적으로 전환한다.

## Proposed Stage 1 Code Boundary

```text
src/recommendations/core/
  contract.js
  contract.test.js
  validators.js
  validators.test.js
```

이번 단계에서는 store, producer orchestration, ranking engine, API와 UI를 추가하지
않는다. 기존 파일 이동도 하지 않는다. 계약이 확정된 뒤 최소 foundation만 구현한다.

## Validation Plan

- supported recommendation kinds and lifecycle states normalize successfully
- unknown kind, state, handoff type와 unsafe presentation target reject
- required identity, owner, timestamp와 expiry invariants reject early
- evidence provenance is bounded and secrets/raw responses are not accepted
- capability handoff requires a registered-looking canonical id and object params
- public DTO removes owner, capability params와 internal ranking features
- external knowledge remains observed evidence
- legacy suggestion and topic recommendation fixtures can be adapted without loss
- no production runtime behavior changes in stage 1

## Decisions Requiring Agreement

1. 신규 product domain은 `Recommendation`으로 통일하고 `Suggestion`은 compatibility
   vocabulary로만 남긴다.
2. Candidate, Policy Decision과 materialized Recommendation을 분리한다.
3. 새 lifecycle은 `RecommendationNode`/`recommendation.*`를 사용한다. stage 3에서
   신규 product suggestion write path를 전환하지만 historic `SuggestionNode`는
   backfill하지 않고 필요한 feedback만 compatibility adapter로 읽는다.
4. primary handoff는 하나만 허용하고 presentation과 capability를 분리한다.
5. capability confirmation 요구 여부는 recommendation이 아니라 registry/runtime이
   결정한다.
6. passive delivery/open은 관측 이벤트일 뿐 preference evidence가 아니다.
7. stage 1은 계약·validator·tests·docs까지만 하고 runtime behavior를 바꾸지 않는다.

## Completion Gate

- 위 7개 설계 결정에 대한 사용자 합의
- canonical contract와 validator unit tests 통과
- existing suggestion/topic recommendation regression tests 통과
- architecture decision 문서 작성
- runtime/UI behavior 변경 없음 확인
- 결과 공유 후 commit/merge 승인 요청

## Implementation Result

- `src/recommendations/core/contract.js`
  - canonical vocabulary와 bounded normalization
  - Candidate, Policy Decision과 Recommendation layer 분리
  - Evidence, presentation/capability handoff와 public DTO
  - public DTO에서 owner, policy, dedupe, capability params와 internal features 제거
  - public presentation payload의 secret-like field 방어적 제거
- `src/recommendations/core/validators.js`
  - strict enum, identity, timestamp, expiry와 owner consistency 검증
  - external Knowledge의 `observed / weak`와 provider provenance 강제
  - allowlisted presentation surface와 canonical capability id 검증
  - unknown field, oversized data, raw provider response와 credential 거부
  - capability handoff가 confirmation policy를 선언하는 경로 차단
- `docs/decisions/2026-08-23-proactive-guidance-contract.md`
  - 합의된 canonical vocabulary, lifecycle, handoff와 historic data 정책 기록
- historic `SuggestionNode` backfill 또는 runtime/API/UI 변경 없음

## Automated Validation Result

- New contract/validator focused suite: 17 tests passed
- Existing recommendation/quick suggestion focused regression: 45 tests passed
- Full unit suite: 551 tests passed
- `git diff --check`: passed
- Manual UI validation: not required because stage 1 changes no runtime or UI behavior
