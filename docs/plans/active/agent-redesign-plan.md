# Agent Redesign Plan

> Status: active plan
>
> Canonical structure docs now live under:
> - `/Users/delta898/Project/NaverAutoBlog/docs/architecture/overview.md`
> - `/Users/delta898/Project/NaverAutoBlog/docs/architecture/agent-runtime.md`
> - `/Users/delta898/Project/NaverAutoBlog/docs/architecture/memory-graph.md`
> - `/Users/delta898/Project/NaverAutoBlog/docs/architecture/knowledge-providers.md`
>
> This file should track open work and sequencing. Stable conclusions should be promoted out of this plan.

## 현재 다음 작업 순서

## Phase 1 실전 안정화 체크리스트

### 완료
- Planner 계층 분리 (`parser -> planner -> runtime`)
- planner rules 분리
- setting update preflight query composition
- confirmation을 plan 기준으로 확장
- suggestion / content idea / provider / validator 기본 구조 연결
- same-domain pending confirmation replacement
- text 기반 최신 pending 적용/취소 처리

### 남은 항목
1. **deterministic parser coverage 확대**
   - 시간/시간대 외 자주 쓰는 on/off, 기본 AI/Custom AI, provider 제어 표현 보강

2. **confirmation UX 일관화**
   - correction / replacement / multi-step preview 메시지 정리
   - 현재값 / 변경값 / 대체 여부 표시 규칙 통일

3. **provider failure visibility**
   - Telegram 응답 또는 로그에서 knowledge provider 실패가 더 분명히 보이도록 정리

4. **validator 적용 범위 확대**
   - trends 외 나머지 자주 쓰는 setting domain에도 동일한 validation / correction 흐름 확장

### Phase 1 종료 기준
- Telegram에서 설정 조회/변경/확인/취소가 안정적으로 동작한다.
- pending confirmation follow-up이 자연스럽게 동작한다.
- 글감 추천과 추천 feedback이 memory loop에 기록된다.
- provider가 실패해도 원인을 추적할 수 있다.
- planner / runtime / capability / memory 경계가 유지된다.

### Phase A — 구조 보강
1. **Planner 분리**
   - 현재 parser + runtime 조합을 `planner` 계층으로 분리
   - 멀티스텝 action composition 준비
   - confirmation을 action 단위에서 plan 단위로 확장할 기반 마련

2. **MCP transport 실구현**
   - 현재 `mcp_tool`은 계약만 있고 실행 구현이 없음
   - knowledge provider 구조의 확장성을 실제로 증명해야 함
   - 1차는 최소 invoke contract + normalize path 확보

### Phase B — memory / scoring 고도화
3. **Preference scoring 개선**
   - 단순 누적에서 벗어나 최근성, confidence, feedback 반영
   - accepted/rejected, helpful/not_helpful를 선호 승격 규칙에 반영

4. **Suggestion actionability 강화**
   - 정보성 추천과 실행형 제안을 더 명확히 구분
   - 실행 가능한 제안은 다음 action으로 직접 연결

### Phase C — provider / retrieval 확장
5. **Knowledge provider 관리 capability**
   - provider 조회/활성화/비활성화/요약 상태를 capability로 노출
   - UI 없이도 Telegram에서 provider 상태를 파악할 수 있게 정리

6. **Artifact 범위 확장**
   - 현재 content idea 중심 artifact를 topic 등록, 발행 결과, comment draft까지 확장
   - retrieval에서 더 넓은 결과 맥락을 사용할 수 있게 함

### Phase D — domain intelligence 확장
7. **Domain validation 확장**
   - trends 외 다른 설정 도메인에도 동일한 validator / correction / learned alias 구조 적용
   - ambiguous literal 처리 품질 개선

---

## Planner 설계 초안

## 목적

현재 구조에서는 Telegram parser가 거의 바로 action envelope를 생성하고, runtime은 검증과 실행만 담당한다.
이 방식은 단일 action에는 충분하지만 다음 경우에 한계가 있다.

- 한 요청에서 여러 action을 순서대로 조합해야 하는 경우
- 조회 후 변경/실행처럼 단계가 있는 경우
- suggestion을 바로 실행 가능한 다음 action으로 연결해야 하는 경우
- confirmation을 action 하나가 아니라 계획 전체 기준으로 다뤄야 하는 경우

Planner는 이 간극을 메우기 위한 계층이다.

## 목표 역할

Planner는 **해석된 intent를 실행 가능한 계획(plan)으로 바꾸는 계층**이다.

### Parser와의 분리
- Parser:
  - 사용자 메시지를 해석한다
  - action 후보 또는 goal을 구조화한다
- Planner:
  - 그 후보를 capability 실행 계획으로 정리한다
  - 순서, confirmation 범위, 의존성, precondition을 판단한다

### Runtime과의 분리
- Runtime:
  - planner 결과를 검증하고 실행한다
  - confirmation store와 event 기록을 담당한다
- Planner:
  - 무엇을 어떤 순서로 실행할지 결정한다

## Planner 입력 / 출력

### 입력
- parsed envelope 또는 intent candidate
- typed retrieval context
- capability registry metadata

### 출력
```json
{
  "plan_id": "plan_123",
  "goal": "트렌드 수집 시간을 변경",
  "steps": [
    {
      "id": "step_1",
      "action": {
        "id": "act_1",
        "type": "setting.update",
        "domain": "settings.trends",
        "name": "set_time",
        "params": {
          "time": "07:30"
        }
      },
      "preconditions": [],
      "requires_confirmation": true
    }
  ],
  "confirmation_mode": "plan",
  "reason": "사용자 요청에 따라 트렌드 수집 시간을 07:30으로 변경"
}
```

핵심은 `action list`가 아니라 `plan with steps`를 반환하는 것이다.

## 1차 Planner 책임

1. **action normalization**
- parser가 만든 action들을 planner가 다시 정리
- 중복 action 제거
- 순서 고정

2. **dependency ordering**
- 예:
  - 설정 조회 → 설정 변경
  - suggestion 수락 → 실제 action 실행

3. **confirmation scope 결정**
- 단일 action이면 기존처럼 처리 가능
- 다중 step이면 plan 전체를 한 번에 확인

4. **precondition 명시**
- 실행 전 필요한 조건을 step에 붙임
- 예:
  - `requires_known_category`
  - `requires_enabled_provider`

## 2차 Planner 책임

1. **multi-step composition**
- 예:
  - "현재 시간 확인하고 7시 반으로 바꿔줘"
  - 조회 + 변경의 2-step plan

2. **conditional planning**
- 예:
  - pending confirmation이 있으면 새 변경보다 기존 것을 먼저 정리

3. **suggestion-to-action bridge**
- suggestion을 단순 텍스트가 아니라 실행 가능한 next action으로 연결

## 권장 파일 구조

```text
src/agent/
  planner.js
  planner-contract.js
  planner-rules.js
```

### planner.js
- `createPlanner(...)`
- `buildPlan(parsedEnvelope, context)`

### planner-contract.js
- plan shape
- step shape
- confirmation mode enum

### planner-rules.js
- ordering rule
- dedupe rule
- plan-level confirmation rule

## Runtime 변경 방향

현재:
- parser → runtime validate → preview/execute

변경 후:
- parser → planner → runtime validate plan → preview/execute plan

즉 runtime은 더 이상 raw envelope를 직접 실행하지 않고, planner 결과를 소비한다.

## 1차 구현 순서

1. `planner-contract.js` 추가
2. `planner.js`에서 단일 action plan 래핑
3. runtime이 envelope 대신 plan도 받을 수 있게 확장
4. confirmation result에 `plan_id`, `steps`를 노출
5. 이후 multi-step composition 추가

## 1차 완료 기준

- 현재 단일 action 흐름이 planner를 거쳐도 동작해야 함
- 외부 동작 변화 없이 내부 경로가 `parser -> planner -> runtime`으로 정리되어야 함
- confirmation payload가 action 중심이 아니라 plan 중심으로 확장 가능해야 함

## 목적

이 프로젝트를 `Telegram 챗봇 + 블로그 자동화 도구`에서 `대화형 운영 에이전트`로 재설계한다.

최종 목표는 다음 3가지를 동시에 만족하는 것이다.

1. 사용자의 자연어 요청을 이해하고 작업으로 실행한다.
2. 대화/행동/결과 데이터를 기억하고, 사용자 성향과 패턴을 축적한다.
3. 축적된 기억을 바탕으로 더 나은 응답, 더 나은 콘텐츠, 선제안까지 가능하게 한다.

본 문서는 기존 Telegram/Kuzu 구조와의 하위호환을 고려하지 않는다. 필요 시 구조를 새로 정의한다.

---

## 핵심 원칙

### 1. Channel과 Agent를 분리한다
- Telegram은 입력/출력 채널일 뿐이다.
- 실제 해석, 실행, 기억 기록은 모두 Agent Runtime이 담당한다.

### 2. Capability 기반으로만 시스템을 제어한다
- 에이전트는 raw config를 직접 수정하지 않는다.
- 허용된 capability만 실행한다.
- 설정 조회/변경, 작업 실행, 콘텐츠 생성 모두 capability registry를 통해 수행한다.

### 3. Memory는 event-first로 설계한다
- 원본은 이벤트다.
- 선호, 패턴, 인사이트는 이벤트를 해석해서 생성한 2차 데이터다.
- 대화 원문과 해석 결과를 섞지 않는다.

### 4. AI는 해석기이고, 시스템은 실행기다
- AI는 intent parsing, memory distillation, suggestion generation, content generation을 담당한다.
- 실제 적용/수정/실행은 validator + executor가 담당한다.

### 5. 선제안은 마지막 단계다
- 먼저 “정확히 이해하고, 정확히 바꾸고, 정확히 기록”하는 구조를 만든다.
- 그 다음에 패턴 추출과 suggestion engine을 얹는다.

---

## 목표 사용자 경험

사용자는 Telegram에서 다음을 할 수 있어야 한다.

### 조회
- 현재 트렌드 수집 시간이 언제야?
- 자동 블로그 포스팅 허용 시간대가 뭐야?
- 지금 Telegram 채팅 모델이 뭐야?

### 변경
- 트렌드 수집 시간을 오전 7시로 바꿔줘.
- 트렌드 카테고리에 `여행` 추가해줘.
- 자동 블로그 포스팅 허용 시간대를 09:00~18:00으로 바꿔줘.

### 실행
- 지금 트렌드 수집 실행해줘.
- 네이버 스마트 댓글 5개 초안 만들어줘.

### 콘텐츠
- 제주 여행 주제로 글감 저장해줘.
- 방금 그 글감으로 워드프레스까지 발행해줘.

### 미래 목표
- 최근 패턴을 보고 먼저 제안하기
- 선호에 맞춘 댓글/글/설정 추천

---

## 상위 아키텍처

```text
Telegram / UI / CLI
        ↓
Channel Adapter
        ↓
Agent Runtime
   ├─ Intent Parser
   ├─ Planner
   ├─ Confirmation Manager
   ├─ Responder
   └─ Memory Context Builder
        ↓
Capability Registry
   ├─ settings.*
   ├─ jobs.*
   ├─ content.*
   └─ suggestions.*
        ↓
Execution Layer
        ↓
Config / Runners / Content Services / Playwright
        ↓
Memory System (Kuzu)
```

---

## 컴포넌트 설계

## 1. Channel Adapter

초기 채널은 Telegram만 지원한다.

### 책임
- 메시지 수신
- callback/button 수신
- Agent Runtime 호출
- 응답 렌더링

### 비책임
- intent parsing
- config 변경
- Kuzu 직접 접근
- 작업 로직 분기

### 향후 확장
- UI 채널
- CLI 채널
- Webhook/API 채널

---

## 2. Agent Runtime

대화형 요청을 실제 action으로 바꾸는 핵심 레이어다.

### 주요 서브모듈
- `intent-parser`
- `planner`
- `confirmation-manager`
- `context-builder`
- `responder`

### 동작 흐름
1. 채널에서 message input 수신
2. memory context 구성
3. AI로 action schema 파싱
4. action validation
5. confirmation 필요 여부 판단
6. capability 실행
7. 결과 응답 생성
8. event 기록

---

## 3. Capability Registry

Agent가 실제로 할 수 있는 일의 목록이다.

### 설계 원칙
- capability는 명확한 입력/출력/검증 규칙을 가진다.
- capability만 시스템 상태를 바꿀 수 있다.
- 자연어는 capability로 변환될 뿐, 실행권한을 직접 갖지 않는다.

### 1차 지원 capability

#### settings.trends
- `get_time`
- `set_time`
- `get_categories`
- `add_category`
- `remove_category`

#### settings.blog_auto
- `get_enabled`
- `set_enabled`
- `get_time_window`
- `set_time_window`

#### settings.telegram
- `get_chat_ai_mode`
- `set_chat_ai_mode`

#### settings.custom_ai
- `get_summary`

#### jobs
- `run_trends_collect`
- `run_rss_collect`
- `run_naver_comment_draft`

#### content
- `register_topic`
- `publish_article`
- `generate_comment_draft`

### 1차 비지원
- secret/raw credential 변경
- raw config patch
- license/path/저수준 시스템 설정
- 여러 도메인을 한 번에 바꾸는 복합 변경

---

## 4. Memory System

## 4-1. 목표

Memory는 단순 로그 저장이 아니라 다음 3가지를 지원해야 한다.

1. 현재 요청에 필요한 맥락 제공
2. 사용자 선호와 패턴 축적
3. suggestion의 근거 제공

## 4-2. 메모리 계층

### A. Event Log
원본 사실 저장

예:
- user.message.received
- agent.intent.parsed
- agent.reply.generated
- confirmation.requested
- confirmation.accepted
- confirmation.rejected
- setting.updated
- job.executed
- topic.registered
- publish.completed
- comment_draft.generated
- suggestion.shown
- suggestion.accepted
- suggestion.rejected

### B. Working Memory
최근 맥락

예:
- 최근 대화
- 최근 action
- 최근 설정 변경
- pending confirmation
- 최근 생성 결과

### C. Preference Memory
반복적으로 검증된 선호

예:
- 선호 댓글 톤
- 선호 플랫폼
- 선호 AI role 선택
- 선호 시간대
- 선호 카테고리/주제

### D. Suggestion Memory
선제안 및 추천 기록

예:
- 어떤 제안을 보여줬는지
- 수락했는지 거절했는지
- 같은 제안 cooldown 상태

---

## 5. Kuzu 스키마 초안

기존 스키마를 유지하지 않는다. 아래 기준으로 재정의한다.

## 노드

### `User`
- `id`
- `channel`
- `username`
- `created_at`

### `Conversation`
- `id`
- `channel`
- `started_at`
- `last_activity_at`

### `Message`
- `id`
- `role` (`user`, `agent`, `system`)
- `text`
- `timestamp`
- `channel_message_id`

### `Action`
- `id`
- `type`
- `domain`
- `name`
- `params_json`
- `status`
- `timestamp`

### `SettingChange`
- `id`
- `domain`
- `key`
- `before_json`
- `after_json`
- `timestamp`

### `JobRun`
- `id`
- `job_name`
- `status`
- `started_at`
- `finished_at`
- `result_json`

### `Artifact`
- `id`
- `artifact_type`
- `title`
- `summary`
- `payload_json`
- `timestamp`

### `Preference`
- `id`
- `name`
- `value_json`
- `confidence`
- `evidence_count`
- `updated_at`

### `Suggestion`
- `id`
- `type`
- `summary`
- `payload_json`
- `status`
- `created_at`

## 관계

### 사용자/대화
- `(User)-[:HAS_CONVERSATION]->(Conversation)`
- `(Conversation)-[:HAS_MESSAGE]->(Message)`
- `(User)-[:SENT]->(Message)`

### 파싱/실행
- `(Message)-[:PARSED_TO]->(Action)`
- `(Action)-[:CHANGED]->(SettingChange)`
- `(Action)-[:TRIGGERED]->(JobRun)`
- `(Action)-[:PRODUCED]->(Artifact)`

### 선호/제안
- `(User)-[:HAS_PREFERENCE]->(Preference)`
- `(Suggestion)-[:BASED_ON]->(Preference)`
- `(User)-[:ACCEPTED]->(Suggestion)`
- `(User)-[:REJECTED]->(Suggestion)`

### 근거 추적
- `(Preference)-[:DERIVED_FROM]->(Message)`
- `(Preference)-[:DERIVED_FROM]->(Action)`
- `(Suggestion)-[:DERIVED_FROM]->(Action)`

---

## 6. AI Role 설계

Custom AI를 포함한 AI 전략은 역할 기반으로 본다.

## 6-1. Role 목록

### `agent_chat_model`
용도:
- Telegram 질의 해석
- action schema 생성
- 설정 조회/변경 요청 이해
- 짧은 운영 응답 생성

권장:
- 기본값 `Custom AI`

### `agent_memory_model`
용도:
- 이벤트 요약
- preference 추출
- 패턴 분석
- suggestion 초안 생성

권장:
- 기본값 `Custom AI`

### `content_generation_model`
용도:
- 장문 글 생성
- 고품질 콘텐츠 생성
- 더 긴 문맥 기반 초안 생성

권장:
- 기본값 `기본 AI`

## 6-2. AI와 Kuzu의 협업

### 요청 처리 시
1. Kuzu에서 관련 memory 조회
2. `agent_chat_model`이 action으로 파싱
3. capability 실행
4. event를 다시 Kuzu에 저장

### 사후 학습 시
1. 최근 event 조회
2. `agent_memory_model`이 요약/선호/패턴 추출
3. Preference / Suggestion memory 저장

---

## 7. Action Schema

모든 자연어 요청은 최종적으로 이 구조로 수렴한다.

```json
{
  "actions": [
    {
      "type": "setting.update",
      "domain": "settings.trends",
      "name": "set_time",
      "params": {
        "time": "07:00"
      },
      "requires_confirmation": true
    }
  ]
}
```

### 필드 정의
- `type`
  - `setting.query`
  - `setting.update`
  - `job.run`
  - `content.register`
  - `content.publish`
  - `content.generate`
- `domain`
  - `settings.trends`
  - `settings.blog_auto`
  - `settings.telegram`
  - `jobs`
  - `content`
- `name`
  - 실제 capability명
- `params`
  - capability 입력 파라미터
- `requires_confirmation`
  - 즉시 실행 가능 여부

---

## 8. Confirmation Flow

위험한 변경은 항상 확인 후 적용한다.

### 확인 대상
- 설정 변경
- job 실행
- 발행
- destructive action

### 플로우
1. action parse
2. diff 생성
3. Telegram confirmation 메시지 전송
4. 승인/거절 수신
5. 승인 시 capability 실행
6. 결과/이벤트 저장

### 예시
```text
현재 값: 09:00
변경 값: 07:00
정말 변경할까요?
```

---

## 9. Retrieval 전략

AI에게 Kuzu 전체를 그대로 넘기지 않는다. 현재 요청에 필요한 context packet만 만든다.

### 최근 컨텍스트
- 최근 대화 N개
- 최근 action N개
- pending confirmation

### 관련 선호
- 현재 요청과 관련된 preference만 선택
- 예: 댓글 요청이면 comment tone / ai mode / topic preference

### 관련 이력
- 같은 setting/domain/action의 최근 성공/실패

### 출력 형태
```json
{
  "recent_context": [],
  "preferences": [],
  "related_history": []
}
```

---

## 10. Preference 추출 규칙

장기 기억은 쉽게 만들지 않는다.

### 승격 조건 예시
- 동일 선호가 3회 이상 반복
- 사용자가 같은 설정을 2회 이상 유지
- 동일 suggestion을 2회 이상 수락
- 같은 유형 결과를 반복 복사/채택

### 예시
- 댓글 초안에서 공감형 반복 사용
- Telegram chat에서 Custom AI 반복 사용
- 여행/등산 주제가 최근 10개 중 다수

### 저장 방식
- `confidence`
- `evidence_count`
- `updated_at`

---

## 11. Suggestion Engine

선제안은 1차 핵심 기능이 아니지만 구조에는 포함한다.

### 1차 범위
- 요청 기반 next-step suggestion
- 반복 설정 변경에 대한 정리 제안
- 최근 선호 기반 옵션 제안

### 예시
- 최근 자주 쓰는 카테고리를 기본 카테고리로 저장할까요?
- 최근 댓글 초안은 공감형을 자주 사용했습니다. 기본 톤으로 고정할까요?

### 제약
- unsolicited suggestion 남발 금지
- 거절 시 cooldown
- 근거 없는 suggestion 금지

---

## 12. 권장 파일 구조

```text
src/agent/
  runtime.js
  intent-parser.js
  planner.js
  responder.js
  confirmation-store.js
  context-builder.js

src/capabilities/
  index.js
  settings/
    trends.js
    blog-auto.js
    telegram.js
    custom-ai.js
  jobs/
    trends.js
    rss.js
    naver-comment-draft.js
  content/
    topic.js
    publish.js

src/memory/
  index.js
  event-store.js
  preference-store.js
  suggestion-store.js
  retrieval.js
  kuzu-schema.js
  extractors/
    preferences.js
    patterns.js

src/channels/
  telegram/
    adapter.js
    renderer.js
    callbacks.js
```

---

## 13. 단계별 구현 계획

## Phase 1. Foundation
목표:
- Telegram을 얇은 adapter로 전환
- Agent Runtime 도입
- Capability Registry 기초 구현

포함:
- 새 Telegram adapter
- 새 agent runtime
- 새 action schema
- confirmation store

## Phase 2. Memory Reset
목표:
- Kuzu event-first schema 재작성
- 기존 Message 중심 메모리 폐기

포함:
- 새 Kuzu schema
- event writer
- retrieval helper

## Phase 3. Settings Control 1차
목표:
- Telegram에서 설정 조회/변경 가능

포함:
- trends / blog_auto / telegram / custom_ai 일부 capability
- diff + confirm flow
- 결과 기록

## Phase 4. Content/Job Integration
목표:
- topic register / publish / comment draft / jobs를 Agent action으로 통합

## Phase 5. Preference Extraction
목표:
- event 기반 장기 선호 생성

## Phase 6. Suggestion Engine
목표:
- next-step suggestion
- 제한적 proactive suggestion

---

## 14. 현재 구조 진행 현황

이 문서는 초기 설계안으로 시작했지만, 현재는 1차 foundation이 이미 구현된 상태다. 아래는 **2026-03-12 기준 실제 반영된 구조**다.

### 14-1. 이미 구현된 핵심 구조

#### Agent Runtime / Channel
- Telegram을 직접 로직 처리하는 서비스가 아니라 channel adapter로 쓰는 구조가 도입되었다.
- Telegram 입력은 `Agent Runtime -> Capability Registry -> Memory` 경로를 우선 탄다.
- confirmation preview / apply / cancel flow가 동작한다.

#### Action Schema / Capability
- action schema 기반으로 조회/변경/실행/생성 요청을 구조화한다.
- 현재 settings, jobs, suggestions, content ideas 계층이 capability registry에 연결되어 있다.
- 잘못된 요청은 validation 단계에서 차단하거나 correction proposal로 전환한다.

#### Memory / Kuzu
- Kuzu는 event-first memory backend로 재정리되었다.
- 단순 event 저장 외에 아래 typed node/relationship가 materialize 된다.
  - Message
  - Action
  - SettingChange
  - JobRun
  - Artifact
  - Preference
  - Suggestion
  - DomainKnowledge
- typed retrieval helper가 최근 message/action/setting/job/artifact/preference/pending confirmation을 context packet으로 구성한다.

#### Preference / Suggestion
- settings 변경 결과를 기반으로 preference memory가 누적된다.
- suggestion은 feedback loop를 가진다.
  - action proposal: `수락 / 거절`
  - informational hint: `도움됨 / 별로`
- feedback는 graph에 기록되고 이후 suggestion suppression/weighting에 활용된다.

#### Content Idea Lane
- 운영 suggestion과 별도로 `content.idea.suggest` lane이 분리되었다.
- 최근 추천된 아이디어와 artifact feedback를 반영해 반복 추천을 줄인다.
- content idea 결과는 `ArtifactNode`로 graph에 저장된다.

#### Domain Validation / Learned Alias
- 시간, 시간대, AI mode 등은 strict validation을 수행한다.
- 트렌드 카테고리는 correction proposal과 learned alias flow를 가진다.
- 사용자가 보정 제안을 수락하면 alias memory가 저장되고, 이후 동일 표현은 learned alias로 정규화된다.

#### Knowledge Provider Architecture
- knowledge는 `kind + transport + config` 구조로 재정의되었다.
- transport는 현재 다음 3개를 기준으로 둔다.
  - `builtin_api`
  - `mcp_tool`
  - `internal_query`
- provider instance는 설정 기반으로 로드된다.
- suggestion / content ideas는 route별로 knowledge provider를 조회한다.

#### SerpApi Trends 1차 연결
- 첫 외부 knowledge provider 샘플은 `trends + builtin_api + SerpApi`로 연결되었다.
- 현재는 다음 구조를 가진다.
  - provider definition
  - route-based fetch
  - normalize contract
  - suggestion / content_ideas routing
- provider 조회 성공/실패는 knowledge trace log로 확인 가능하다.

### 14-2. 현재 구조적으로 달성된 것

현재 시점의 시스템은 아래 루프를 이미 가진다.

1. Telegram 자연어 요청 수신
2. action schema로 파싱
3. capability validation / correction / confirmation
4. 실행
5. event graph 기록
6. preference / suggestion / artifact memory 누적
7. 이후 요청에서 memory retrieval 재활용

즉, “질의 → 실행 → 기억 → 다음 질의에 반영”의 1차 Agent loop는 이미 성립했다.

---

## 15. 현재 남은 핵심 구조 작업

구조를 기준으로 보면, 1차 foundation 이후 남은 큰 항목은 아래와 같다.

### 15-1. Planner 분리

현재는 `parser + runtime` 조합으로 단일 action 중심 흐름을 처리한다.

이 구조는 다음 상황에서 한계가 있다.
- 복합 요청
- 멀티스텝 작업
- 조회 후 비교 후 변경
- 여러 capability를 조합하는 계획형 요청

따라서 이후에는 `Planner`를 별도 계층으로 분리해야 한다.

#### Planner가 맡을 역할
- action sequencing
- multi-step plan 생성
- plan preview 생성
- plan rollback / partial failure 처리

현재 시점 기준으로 **가장 큰 남은 구조 작업** 중 하나다.

### 15-2. MCP Transport 실구현

현재 `mcp_tool` transport는 contract만 있고 실제 호출 로직은 없다.

즉 provider architecture는 이미 확장 가능하게 설계되었지만,
실제 “builtin 외 transport도 같은 구조로 동작하는가”는 아직 증명되지 않았다.

향후 목표:
- MCP tool invocation transport 구현
- normalize contract 재사용
- 동일 provider kind가 `builtin_api` / `mcp_tool` 모두로 동작 가능함을 검증

### 15-3. Preference Promotion / Scoring 고도화

현재 preference는 누적형에 가깝다.

향후에는 아래 요소를 반영해야 한다.
- 최근성
- evidence 수
- accepted / rejected 비율
- helpful / not_helpful 비율
- decay / cooldown

즉 단순 count가 아니라 “승격된 장기 선호”의 신뢰도를 계산해야 한다.

### 15-4. Suggestion Actionability 강화

현재 suggestion은 크게 두 종류다.
- 실행 제안
- 정보성 힌트

향후에는 suggestion이 더 직접적인 다음 액션 체인을 가질 수 있어야 한다.

예:
- “이 제안을 바로 적용할까요?”
- “이 트렌드를 바탕으로 글감 3개 생성할까요?”
- “실패한 작업을 같은 조건으로 재실행할까요?”

### 15-5. Artifact 범위 확장

현재 artifact는 주로 content idea 결과 중심이다.

향후에는 아래도 artifact 체계로 더 일관되게 넣는 것이 좋다.
- topic 등록 결과
- publish 결과
- comment draft 결과
- external knowledge snapshots

### 15-6. Validator 범위 확장

현재 validator는 일부 고위험 도메인만 커버한다.

향후에는 더 넓은 설정/실행 capability에도 동일 철학을 적용해야 한다.
- 허용값 검증
- alias / canonicalization
- correction proposal
- learned domain knowledge

---

## 16. 현재 시점의 우선순위

구조 관점에서 다음 우선순위는 아래와 같다.

1. `Planner` 분리
2. `MCP transport` 실구현
3. `Preference scoring` 고도화
4. `Suggestion actionability` 확장
5. `Artifact / validator` 범위 확장

즉 현재 판단은 다음과 같다.

- **1차 foundation은 상당 부분 완료**
- **다음 큰 구조 단계는 Planner와 MCP transport**

이는 이후 외부 API / MCP / 내부 지식 / 사용자 기억을 함께 쓰는 진짜 운영형 Agent로 가기 위한 핵심 단계다.

---

## 17. Knowledge Provider 설계 원칙

외부 연동 구조는 다음 원칙을 유지한다.

### 17-1. Provider type을 고정 기능명으로 두지 않는다

다음과 같은 방식은 지양한다.
- `weather_builtin`
- `news_builtin`
- `mcp_weather`
- `mcp_news`

대신 아래 3층으로 분리한다.

### 17-2. `kind`
무슨 정보를 주는지
- `trends`
- `weather`
- `news`

### 17-3. `transport`
어떻게 가져오는지
- `builtin_api`
- `mcp_tool`
- `internal_query`

### 17-4. `provider instance`
실제 연결 정의

예:
```json
{
  "id": "trends-main",
  "kind": "trends",
  "transport": "builtin_api",
  "enabled": true,
  "label": "SerpApi Trends",
  "config": {
    "vendor": "serpapi",
    "api_key": "..."
  }
}
```

이 구조를 유지하면:
- provider kind 확장 가능
- transport 확장 가능
- 사용자별 connection 설정 가능
- suggestion/content/기타 engine에서 route별 사용 가능

### 17-5. 현재 1차 샘플

현재 외부 provider 샘플은 다음이다.
- `kind = trends`
- `transport = builtin_api`
- `vendor = serpapi`

이는 provider architecture 자체를 검증하기 위한 첫 샘플이며,
UI 없이도 config 기반으로 활성화할 수 있게 두었다.

---

## 18. Development / Release Routine

업데이트 배너와 `update.json` 메타데이터를 안정적으로 자동 생성하려면, 개발 루틴도 일정한 규칙을 가져야 한다.

핵심 목표는 다음 두 가지다.

1. 개발 중에는 빠르게 작업한다.
2. 릴리즈 직전에는 일관된 구조로 버전/릴리즈 노트를 정리한다.

### 18-1. 기본 원칙

#### 버전은 릴리즈 직전에만 확정한다
- 개발 도중 기능 하나 끝날 때마다 버전을 올리지 않는다.
- `main`에 릴리즈 준비가 끝났을 때만 버전을 확정한다.
- 즉 평소 개발 커밋과 릴리즈 커밋을 분리한다.

#### 커밋 메시지는 Conventional Commit 형식을 사용한다
권장 prefix:
- `feat`
- `fix`
- `refactor`
- `docs`
- `chore`

예시:
- `feat: add serpapi trends provider`
- `fix: preserve knowledge config during runtime sync`
- `refactor: split agent runtime and capability registry`
- `docs: update agent redesign plan`
- `chore: release v0.1.7-dev1`

#### 사용자용 릴리즈 노트의 source of truth는 CHANGELOG다
- 커밋 메시지는 개발자용 기록이다.
- 사용자가 보는 업데이트 설명은 `CHANGELOG.md` 기준으로 정리한다.
- `build.sh`는 커밋 로그보다 `CHANGELOG.md`를 우선 읽어 `update.json.details`를 생성한다.

### 18-2. 권장 작업 흐름

#### 평소 개발
1. feature branch에서 작업
2. 기능 단위로 커밋
3. 커밋 메시지는 conventional format 사용
4. 버전은 아직 올리지 않음

#### 릴리즈 직전
1. 대상 기능이 `main`에 정리되어 있는지 확인
2. 릴리즈 버전 결정
3. `CHANGELOG.md`에 해당 버전 섹션 작성
4. 릴리즈용 커밋 수행
   - 예: `chore: release v0.1.7-dev1`
5. `build.sh` 실행
6. `build.sh`가 `update.json` 생성
7. 배포 후 update banner / update details에 반영

### 18-3. update.json 메타데이터 생성 원칙

`update.json`은 단순 버전/에셋 목록만이 아니라, UI가 읽을 수 있는 릴리즈 메타를 포함해야 한다.

권장 필드:

```json
{
  "tag_name": "v0.1.7-dev1",
  "published_at": "2026-03-12T10:00:00Z",
  "body": "간단한 릴리즈 요약",
  "details": {
    "summary": "Agent runtime과 knowledge provider 구조를 도입했습니다.",
    "highlights": [
      "Telegram Agent runtime foundation",
      "Kuzu event-first memory redesign",
      "SerpApi trends provider support"
    ]
  },
  "assets": []
}
```

#### 데이터 우선순위
1. `CHANGELOG.md`
2. 없으면 커밋 로그 기반 fallback

즉 release metadata는 **커밋 메시지에 직접 의존하지 않고**, `CHANGELOG.md`에서 사용자용 문장을 가져오도록 설계한다.

### 18-4. build.sh의 역할

향후 `build.sh`는 아래를 자동 수행하는 방향으로 설계한다.

1. 현재 릴리즈 버전 확인
2. `CHANGELOG.md`에서 해당 버전 섹션 추출
3. `Added / Changed / Fixed` 항목에서 highlights 생성
4. `update.json.details.summary` / `highlights` 채우기
5. zip과 함께 `update.json` 업로드

즉 HTML 릴리즈 페이지를 별도로 만들지 않아도,
앱 내부의 “자세히 보기”는 `update.json.details`만으로 충분히 구성 가능하게 한다.

### 18-5. 이 루틴을 택하는 이유

이 방식의 장점:
- 개발 중에는 버전 관리 부담이 적다
- 릴리즈 직전에만 정리하면 된다
- 업데이트 설명이 개발자 관점이 아니라 사용자 관점으로 유지된다
- `build.sh` 자동화가 단순하고 안정적이다
- update banner / update details 체계를 확장하기 쉽다

결론적으로, 이 프로젝트의 권장 루틴은 다음 한 줄로 요약된다.

> 개발 중에는 기능 단위 conventional commit, 릴리즈 직전에만 버전 확정과 CHANGELOG 정리, 그리고 `build.sh`가 CHANGELOG 기반으로 `update.json.details`를 생성한다.

## 14. 1차 구현 우선순위

아래 순서로 가는 것이 가장 안전하다.

1. 새 `agent runtime` 추가
2. 새 `telegram adapter` 추가
3. `kuzu schema` 재정의
4. `settings capability` 4~6개 구현
5. `confirmation flow` 구현
6. event 기록 추가
7. retrieval + context packet

---

## 15. Non-Goals (1차에서 하지 않을 것)

- 기존 Telegram/Kuzu 하위호환 유지
- 모든 설정 전체 제어
- raw config patch editing
- 모든 대화의 완전한 chain-of-thought 저장
- 적극적인 proactive spam
- 자동 self-optimizing behavior

---

## 16. 성공 기준

1. Telegram에서 1차 capability 조회/변경이 안정적으로 동작한다.
2. 모든 action과 결과가 event-first로 Kuzu에 기록된다.
3. 현재 요청에 맞는 memory retrieval이 가능하다.
4. 대화/설정/작업/결과가 하나의 Agent flow로 연결된다.
5. 이후 preference/suggestion engine을 얹기 쉬운 구조가 된다.

---

## 17. Phase 1 상세 설계

Phase 1의 목표는 “Telegram에서 일부 설정을 안정적으로 조회/변경하는 Agent 기반 제어면”을 만드는 것이다.

이 단계에서는 아래만 완성하면 된다.

1. Telegram adapter를 얇게 만들기
2. Agent Runtime 도입
3. Action Schema 고정
4. Capability Registry 1차 도입
5. Confirmation Flow 도입
6. Event-first 기록 시작

### Phase 1 범위 포함
- settings query
- settings update
- 일부 job run
- confirmation handling
- Kuzu event logging

### Phase 1 범위 제외
- proactive suggestion
- preference extraction
- complex multi-action planning
- raw config editing
- UI/CLI channel 통합

---

## 18. Action Schema 상세

Phase 1에서 Agent가 생성하는 표준 내부 포맷은 아래로 고정한다.

```json
{
  "version": "1.0",
  "conversation_id": "conv_20260312_xxx",
  "message_id": "msg_20260312_xxx",
  "actions": [
    {
      "id": "act_001",
      "type": "setting.update",
      "domain": "settings.trends",
      "name": "set_time",
      "params": {
        "time": "07:00"
      },
      "requires_confirmation": true,
      "reason": "사용자가 트렌드 수집 시간을 오전 7시로 변경 요청함"
    }
  ]
}
```

### 상위 필드
- `version`
  - action schema 버전
- `conversation_id`
  - 현재 대화 세션 id
- `message_id`
  - 현재 사용자 메시지 id
- `actions`
  - 실행할 action 목록

### action 필드
- `id`
  - action 내부 식별자
- `type`
  - `setting.query`
  - `setting.update`
  - `job.run`
  - `content.register`
  - `content.publish`
  - `content.generate`
- `domain`
  - capability namespace
- `name`
  - 실제 capability 이름
- `params`
  - 검증 가능한 입력 파라미터
- `requires_confirmation`
  - 실행 전 사용자 승인이 필요한지
- `reason`
  - 파싱 근거 요약

### Phase 1에서 허용하는 type/domain 조합

#### setting.query
- `settings.trends.get_time`
- `settings.trends.get_categories`
- `settings.blog_auto.get_enabled`
- `settings.blog_auto.get_time_window`
- `settings.telegram.get_chat_ai_mode`
- `settings.custom_ai.get_summary`

#### setting.update
- `settings.trends.set_time`
- `settings.trends.add_category`
- `settings.trends.remove_category`
- `settings.blog_auto.set_enabled`
- `settings.blog_auto.set_time_window`
- `settings.telegram.set_chat_ai_mode`

#### job.run
- `jobs.run_trends_collect`
- `jobs.run_rss_collect`
- `jobs.run_naver_comment_draft`

### 금지 규칙
- 하나의 사용자 메시지에서 action 최대 3개
- 서로 다른 domain 3개 이상 혼합 금지
- secret 수정 action 생성 금지
- params에 schema 없는 key 포함 금지

---

## 19. Capability Interface 상세

모든 capability는 동일한 인터페이스를 따른다.

```js
{
  id: 'settings.trends.set_time',
  type: 'setting.update',
  domain: 'settings.trends',
  validate(params, context) => ({ ok, errors, normalizedParams }),
  preview(params, context) => ({ summary, before, after }),
  execute(params, context) => ({ success, message, data, sideEffects }),
  confirmPolicy: 'required'
}
```

### 공통 필드
- `id`
  - fully-qualified capability id
- `type`
  - action type
- `domain`
  - logical domain
- `validate`
  - 입력 검증 및 정규화
- `preview`
  - 사용자 확인 전에 보여줄 diff 생성
- `execute`
  - 실제 적용
- `confirmPolicy`
  - `required`
  - `optional`
  - `never`

### context 구조

```js
{
  user: {
    id,
    channel,
    username
  },
  conversation: {
    id
  },
  runtime: {
    now,
    locale,
    timezone
  },
  configSnapshot,
  memoryContext
}
```

### execute 반환 규격

```json
{
  "success": true,
  "message": "트렌드 수집 시간을 07:00으로 변경했습니다.",
  "data": {
    "time": "07:00"
  },
  "sideEffects": [
    "config_saved",
    "runner_synced"
  ]
}
```

### 1차 capability별 preview 예시

#### `settings.trends.set_time`
```json
{
  "summary": "트렌드 수집 시간을 변경합니다.",
  "before": { "time": "09:00" },
  "after": { "time": "07:00" }
}
```

#### `settings.blog_auto.set_time_window`
```json
{
  "summary": "블로그 자동 포스팅 허용 시간대를 변경합니다.",
  "before": { "from": "09:00", "to": "23:00" },
  "after": { "from": "07:00", "to": "21:00" }
}
```

---

## 20. Telegram Confirmation Flow 상세

Confirmation은 Agent Runtime이 관리하고, Telegram은 렌더링만 한다.

### 상태 모델
- `pending`
- `accepted`
- `rejected`
- `expired`
- `executed`

### pending confirmation 저장 구조

```json
{
  "id": "confirm_xxx",
  "conversation_id": "conv_xxx",
  "message_id": "msg_xxx",
  "channel": "telegram",
  "user_id": "123456",
  "actions": [...],
  "preview": [...],
  "created_at": "2026-03-12T12:00:00+09:00",
  "expires_at": "2026-03-12T12:10:00+09:00",
  "status": "pending"
}
```

### Telegram UX

#### setting.update 요청 시
1. 사용자가 자연어 요청
2. Agent가 action parse
3. preview 생성
4. Telegram에 diff 메시지 전송
5. 버튼 표시
   - `승인`
   - `취소`
6. 승인 시 execute
7. 결과 요약 회신

### 버튼 callback payload

```json
{
  "type": "confirmation.accept",
  "confirmation_id": "confirm_xxx"
}
```

또는

```json
{
  "type": "confirmation.reject",
  "confirmation_id": "confirm_xxx"
}
```

### confirmation 메시지 예시

```text
[설정 변경 요청]
트렌드 수집 시간을 변경합니다.

- 현재: 09:00
- 변경: 07:00

적용할까요?
```

### 만료 정책
- 기본 TTL: 10분
- 만료 시 실행 불가
- “만료되어 다시 요청해 주세요” 응답

---

## 21. Kuzu Event Schema 상세

Phase 1에서는 모든 것을 다 저장하지 않고, 실행 흐름에서 반드시 필요한 이벤트만 저장한다.

### EventNode

Event 중심 설계를 단순화하기 위해 Phase 1에서는 단일 `Event` 노드를 먼저 도입한다.

```text
Event
- id
- event_type
- timestamp
- actor_type
- actor_id
- conversation_id
- message_id
- payload_json
```

### 권장 event_type
- `user.message.received`
- `agent.intent.parsed`
- `agent.confirmation.requested`
- `agent.confirmation.accepted`
- `agent.confirmation.rejected`
- `capability.query.executed`
- `capability.update.executed`
- `capability.job.executed`
- `capability.execution.failed`
- `agent.reply.generated`

### Phase 1 관계

#### 노드
- `User`
- `Conversation`
- `Event`
- `Preference` (placeholder only, actual extraction은 Phase 5)

#### 관계
- `(User)-[:HAS_CONVERSATION]->(Conversation)`
- `(Conversation)-[:HAS_EVENT]->(Event)`
- `(User)-[:TRIGGERED]->(Event)`

### payload_json 예시

#### `agent.intent.parsed`
```json
{
  "actions": [
    {
      "type": "setting.update",
      "domain": "settings.trends",
      "name": "set_time",
      "params": { "time": "07:00" }
    }
  ]
}
```

#### `capability.update.executed`
```json
{
  "capability_id": "settings.trends.set_time",
  "before": { "time": "09:00" },
  "after": { "time": "07:00" },
  "side_effects": ["config_saved", "runner_synced"]
}
```

### Phase 1에서 EventNode를 먼저 쓰는 이유
- 구현이 빠르다
- 모든 흐름을 일단 일관되게 기록 가능하다
- 이후 Phase 2/3에서 `Action`, `SettingChange`, `JobRun` 전용 노드로 분해하기 쉽다

즉 Phase 1은 “event-first” 원칙만 확보하고, 물리적 세분화는 다음 단계로 미룬다.

---

## 22. Retrieval Contract

Agent Runtime이 intent parsing 전에 memory에서 받아오는 context의 형식은 아래로 고정한다.

```json
{
  "recent_events": [],
  "pending_confirmations": [],
  "preferences": [],
  "related_events": []
}
```

### 필드 의미
- `recent_events`
  - 최근 대화 및 실행 이벤트
- `pending_confirmations`
  - 아직 답하지 않은 확인 요청
- `preferences`
  - 현재 요청과 관련된 선호
- `related_events`
  - 같은 setting/domain에 대한 과거 이력

### 1차 retrieval 범위
- 최근 이벤트 20개
- pending confirmation 최대 3개
- 동일 domain 관련 이벤트 10개

---

## 23. 파일 단위 구현 계획

Phase 1에서 새로 만들 파일은 아래를 우선한다.

### `src/agent/runtime.js`
- request entrypoint
- context build
- parse
- validate
- confirm or execute
- response build

### `src/agent/confirmation-store.js`
- in-memory pending confirmation store
- create / get / accept / reject / expire

### `src/agent/action-schema.js`
- action schema validator
- type/domain/name allowlist

### `src/capabilities/index.js`
- registry loader
- capability resolve

### `src/capabilities/settings/trends.js`
- get_time
- set_time
- get_categories
- add_category
- remove_category

### `src/capabilities/settings/blog-auto.js`
- get_enabled
- set_enabled
- get_time_window
- set_time_window

### `src/capabilities/settings/telegram.js`
- get_chat_ai_mode
- set_chat_ai_mode

### `src/capabilities/settings/custom-ai.js`
- get_summary

### `src/capabilities/jobs/*.js`
- run_trends_collect
- run_rss_collect
- run_naver_comment_draft

### `src/memory/event-store.js`
- append event
- query recent events
- query related events

### `src/memory/retrieval.js`
- build context packet

### `src/channels/telegram/adapter.js`
- Telegram incoming message to agent request
- callback -> confirmation handling

---

## 24. 구현 순서

실제 작업 순서는 아래로 고정한다.

### Step 1
- `action-schema`
- `confirmation-store`
- `capability registry` 골격

### Step 2
- `event-store`
- `retrieval contract`
- `runtime` 기본 흐름

### Step 3
- `telegram adapter` 최소 구현
- setting.query 지원

### Step 4
- setting.update + confirmation flow

### Step 5
- job.run 일부 지원

### Step 6
- 응답 문구 정리
- 이벤트 로깅 정리

---

## 25. Phase 1 완료 기준

아래 시나리오가 모두 통과하면 Phase 1 완료로 본다.

### Query
- 현재 트렌드 수집 시간이 언제야?
- 자동 블로그 포스팅 허용 시간대가 뭐야?
- 지금 Telegram 채팅 모델이 뭐야?

### Update
- 트렌드 수집 시간을 07:00으로 바꿔줘.
- 트렌드 카테고리에 여행 추가해줘.
- 자동 블로그 포스팅 허용 시간대를 09:00~18:00으로 바꿔줘.

### Job
- 지금 트렌드 수집 실행해줘.

### Event
- 위 요청/파싱/승인/실행/응답이 모두 Kuzu Event로 남아야 함

### Failure
- 잘못된 시간 형식
- 허용되지 않은 capability
- 만료된 confirmation
- 실행 실패
에 대해 일관된 에러 응답이 가능해야 함
