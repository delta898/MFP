# Internal API Redesign Plan

## Purpose
현재 Telegram 중심으로 자란 Agent 경로를 `channel-neutral internal API` 중심 구조로 재편한다. 목표는 다음 두 가지다.

1. 프로그램의 핵심 기능(글감 등록, 발행, 설정 조회/변경, 작업 실행)을 안정된 내부 계약으로 통일한다.
2. 이후 Telegram, MCP Server, Web UI 같은 상위 채널/서비스를 같은 내부 실행 계층 위에 얹을 수 있게 만든다.

## Why Now
현재는 `agent runtime / planner / capability / memory` 분리가 많이 진행됐지만, 여전히 아래 문제가 남아 있다.

- Telegram adapter 안에 핵심 동작 분기와 UI 성격의 판단이 일부 남아 있다.
- `register/publish` 핵심 기능은 legacy 경로와 agent 경로가 공존한다.
- capability 입력/출력/preview/confirmation 모델이 MCP-ready 수준으로 엄격히 고정되지 않았다.
- 사용자가 보는 확인 카드와 실제 실행 payload가 일부 경로에서 어긋날 수 있다.
- 세부 옵션(`image`, `external reference`, `category`, `schedule`, `post_status`, `targets`)이 기능마다 다르게 다뤄진다.

즉 지금은 기능 추가보다 **내부 실행 계약을 먼저 고정**해야 한다.

## Target State
상위 채널은 모두 같은 내부 API를 사용한다.

```text
Telegram / MCP / UI / future adapters
            ↓
      Internal Agent API
            ↓
Planner / Runtime / Capability Registry
            ↓
Config / Jobs / Publishing / Memory / Knowledge
```

핵심 원칙:
- 자연어는 internal API로 바로 가지 않는다. parser/planner를 거쳐 구조화된 request가 된다.
- capability만 상태를 변경할 수 있다.
- preview / confirmation / result는 채널 중립 구조체여야 한다.
- Telegram은 renderer와 callback adapter만 담당한다.
- MCP는 같은 internal API를 tool contract로 노출한다.

## Scope
이번 단계는 **설계와 1차 구조 정리**가 목표다.

포함:
- Internal API contract 정의
- Capability input/output/preview/confirmation 모델 정리
- 핵심 기능 우선순위 재정의
- Legacy register/publish 경로를 internal API 관점에서 재배치하는 계획
- MCP-ready contract를 고려한 interface 정의

제외:
- MCP transport 실제 구현
- 외부 provider 확대
- 고급 multi-step autonomous planning
- 문장 품질 개선 전반

## Recent Progress
- `content.register_topic.prepare/execute` capability 추가
- Telegram 등록 확인 카드는 `content.register_topic.prepare`를 통해 정규화된 파라미터를 사용
- Telegram 등록 확정은 `content.register_topic.execute` capability를 통해 시트에 등록
- `content.publish.prepare/execute` capability 추가
- Telegram 발행 확정은 `content.publish.execute` capability를 통해 발행 실행으로 연결
- `request-mapper` 추가: legacy Telegram `parsedData`를 canonical content request bundle로 변환
- Telegram register/publish pending payload를 raw `parsedData` 대신 canonical request bundle로 저장
- Telegram preview / toggle / confirm execute 경로를 canonical request bundle 기준으로 재배선
- 등록 요청 UI는 단순 유지, 발행 요청일 때만 발행 옵션(`post_status`, `auto_trigger`) 노출
- canonical bundle mapper / Telegram renderer 단위 테스트 추가

## Internal API Surface (Draft)

### 1. Query
현재 상태를 읽는다.

- `settings.get`
- `pending.get`
- `preferences.get`
- `system.get_status`
- `content.get_recent_topics`

### 2. Prepare
실행 전 preview/confirmation을 만든다.

- `content.register_topic.prepare`
- `content.publish.prepare`
- `settings.update.prepare`
- `jobs.run.prepare`

### 3. Confirm
pending plan을 적용/취소/대체한다.

- `plan.confirm`
- `plan.cancel`
- `plan.replace`

### 4. Execute
확정된 plan 또는 non-interactive action을 실행한다.

- `content.register_topic.execute`
- `content.publish.execute`
- `settings.update.execute`
- `jobs.run.execute`

### 5. Suggest
기억/외부지식을 바탕으로 추천을 만든다.

- `suggestions.get`
- `content.idea.suggest`

## Canonical Request Model
모든 상위 채널은 내부적으로 아래 request model로 정리된다.

```json
{
  "request_id": "req_xxx",
  "conversation_id": "conv_xxx",
  "channel": "telegram",
  "user_id": "telegram:-100...",
  "mode": "query|prepare|confirm|execute|suggest",
  "intent": "content.register_topic",
  "payload": {},
  "context_refs": {
    "pending_plan_id": null,
    "message_id": null
  }
}
```

register/publish 같이 하나의 사용자 요청이 여러 content action으로 확장될 수 있는 경우에는 단일 request만으로는 pending UI 상태를 표현하기 어렵다.
현재 Telegram legacy adapter에서는 아래 `content request bundle`을 canonical pending payload로 사용한다.

```json
{
  "kind": "content_request_bundle",
  "bundle_id": "content_bundle:telegram:123:55:1710...",
  "source": "telegram_legacy_parser",
  "register_request": {
    "request_id": "content.register_topic:telegram:123:55:1710...",
    "conversation_id": "telegram:123",
    "channel": "telegram",
    "user_id": "123",
    "mode": "prepare",
    "intent": "content.register_topic",
    "payload": {
      "theme": "구글 애드센스",
      "keywords": [],
      "platforms": ["naver", "wordpress"],
      "options": {
        "image_gen": false,
        "external_reference": true,
        "post_status": "draft"
      },
      "source": "telegram"
    },
    "context_refs": {
      "pending_plan_id": null,
      "message_id": "55"
    }
  },
  "publish_request": {
    "request_id": "content.publish:telegram:123:55:1710...",
    "conversation_id": "telegram:123",
    "channel": "telegram",
    "user_id": "123",
    "mode": "prepare",
    "intent": "content.publish",
    "payload": {
      "target": "all",
      "platforms": ["naver", "wordpress"],
      "targetRowIndices": [],
      "auto_trigger": true,
      "settingsOverrides": {
        "PUBLISH_AUTO_HEADLESS": true
      },
      "options": {
        "post_status": "draft"
      }
    },
    "context_refs": {
      "pending_plan_id": null,
      "message_id": "55"
    }
  },
  "meta": {
    "explicit_params": ["image_gen", "post_status"]
  },
  "ui": {
    "show_publish_options": true
  }
}
```

이 bundle은 Telegram adapter에서 다음 용도로 사용한다.

- preview 렌더링의 단일 source of truth
- 토글(button callback)에 따른 pending payload 갱신
- confirm 시 `content.register_topic.execute` / `content.publish.execute` 입력 재구성
- 발행 요청이 아닐 때 publish UI를 숨기기 위한 분기

## Canonical Plan Model
planner는 action envelope가 아니라 아래 plan 모델을 만든다.

```json
{
  "plan_id": "plan_xxx",
  "goal": "구글 애드센스 주제로 글감 등록",
  "kind": "prepare|execute|query|suggest",
  "requires_confirmation": true,
  "replace_pending_strategy": "same-domain-latest",
  "steps": [
    {
      "step_id": "step_1",
      "capability_id": "content.register_topic.prepare",
      "type": "prepare",
      "params": {
        "theme": "구글 애드센스",
        "keywords": [],
        "options": {
          "image_gen": true,
          "external_reference": true
        }
      },
      "preconditions": []
    }
  ]
}
```

## Canonical Result Model
runtime/capability는 채널 독립 결과를 반환한다.

```json
{
  "result_type": "query|prepared|executed|suggested|error",
  "title": "등록 준비가 완료되었습니다.",
  "summary": "주제와 옵션을 확인하세요.",
  "data": {},
  "preview": {
    "kind": "topic_registration",
    "fields": []
  },
  "confirmation": {
    "required": true,
    "plan_id": "plan_xxx",
    "actions": ["confirm", "cancel"]
  },
  "meta": {
    "capability_ids": [],
    "provider_ids": []
  }
}
```

## Preview Model
사용자-facing preview는 capability마다 제각각 문자열을 만들지 않고, 구조체를 반환하고 renderer가 표현한다.

### Topic Registration Preview
```json
{
  "kind": "topic_registration",
  "theme": "구글 애드센스",
  "keywords": [],
  "options": {
    "image_gen": true,
    "external_reference": false
  }
}
```

### Publish Preview
```json
{
  "kind": "publish_request",
  "platforms": ["wordpress"],
  "auto_trigger": true,
  "target_row_count": 1,
  "options": {
    "post_status": "draft"
  },
  "settings": {
    "headless": true
  }
}
```

### Settings Update Preview
```json
{
  "kind": "settings_update",
  "domain": "settings.trends",
  "before": {"time": "07:30"},
  "after": {"time": "08:00"}
}
```

## Capability Design Rules
1. Capability는 채널별 문구를 만들지 않는다.
2. Capability는 최소 입력 schema와 normalized 출력 schema를 가진다.
3. Capability는 validation/correction 결과를 구조체로 반환한다.
4. Capability는 실제 side effect만 수행한다.
5. Capability는 `register`, `publish`, `settings`, `jobs`, `suggestions`로 namespace를 명확히 구분한다.

## Priority Capabilities for Refactor
### P0 — core value path
- `content.register_topic.prepare`
- `content.register_topic.execute`
- `content.publish.prepare`
- `content.publish.execute`

### P1 — operational control
- `settings.get`
- `settings.update.prepare`
- `settings.update.execute`
- `jobs.run.prepare`
- `jobs.run.execute`

### P2 — assistance
- `suggestions.get`
- `content.idea.suggest`
- `preferences.get`

## Refactor Targets
### Telegram-specific logic that should move down
- request normalization (`parsedData` -> canonical content request bundle)
- option toggles semantics
- platform/post status interpretation
- confirm 시 capability execute input 재구성 규칙

### Telegram-specific logic that should remain
- inline keyboard rendering
- callback query ack/edit/send
- human-facing markdown formatting
- request bundle을 Telegram message/card에 바인딩하는 transport glue

## Legacy Register/Publish Migration Strategy
현재 register/publish는 legacy 흐름이 실전 핵심이다. 이것을 한 번에 agent path로 바꾸지 않는다.

1. 기존 parser/legacy 진입 유지
   - 완료
2. 내부적으로 `content.register_topic.prepare/execute`, `content.publish.prepare/execute` capability를 먼저 구현
   - 완료
3. Telegram legacy 경로는 그 capability를 호출하는 adapter로 얇게 변경
   - 진행됨
   - 현재는 legacy parser 입력을 유지하되, adapter 내부에서 canonical content request bundle로 즉시 변환한 뒤 preview/toggle/confirm을 처리한다.
4. 이후 MCP/UI도 같은 capability를 호출
   - 미진행

## Current Status Summary
현재 register/publish 경로는 완전한 agent planner path는 아니지만, Telegram 내부 상태와 실행 계약은 이전보다 훨씬 internal API에 가깝게 정리되었다.

- 입력 진입: legacy `Core.parseTelegramRequest` 유지
- 내부 pending 상태: canonical content request bundle 사용
- preview: canonical request payload 기반 renderer 사용
- toggle: canonical bundle payload 직접 수정
- confirm execute: canonical bundle에서 capability execute input 재구성

즉, 현재 단계의 의미는 `legacy parser in / canonical execution contract inside` 로 보는 것이 가장 정확하다.

## Next Recommended Steps
- Telegram callback naming을 `content_request.*` 계열로 정리
- content request bundle schema/validator를 internal API 공용 모듈로 승격
- MCP/UI가 같은 canonical content request model을 공유하도록 contract 추출
- 이후 legacy parser를 planner-compatible parser로 대체할 수 있는지 검토

즉 **legacy behavior를 지우는 것이 아니라, 아래쪽 실행 계층을 먼저 공통화**한다.

## Confirmation Model Rules
- confirmation은 plan 기준이다.
- 이전 pending과 충돌 여부는 planner rule이 결정한다.
- 채널은 `confirm/cancel/replace`만 표출한다.
- “등록 요청”은 등록 옵션만 보인다.
- “발행 요청”만 target/post_status 등 발행 옵션을 보인다.
- 요청 범위를 넘어서는 옵션은 노출하지 않는다.

## Validation / Correction Rules
- validation은 capability 앞단에서 수행한다.
- correction proposal은 preview 전 단계에서 생성한다.
- user confirmed correction은 domain knowledge alias로 저장한다.
- runtime은 correction proposal을 confirmation payload로 승격한다.

## MCP Readiness Requirements
Internal API가 아래를 만족하면 MCP layer를 얹을 수 있다.

- capability id가 stable하다
- input schema가 명확하다
- output schema가 stable하다
- preview/confirmation/result가 채널 중립 구조체다
- error payload가 machine-readable하다
- confirmation이 Telegram callback 전용 모델에 묶여 있지 않다

## Phase Plan
### Phase 1 — Internal API contract
- request / plan / result / preview / confirmation 모델 고정
- P0 capability contract 정리
- legacy register/publish를 capability wrapper로 이동

### Phase 2 — Runtime boundary cleanup
- Telegram service에서 register/publish domain logic 제거
- channel-neutral result renderer contract 확정
- capability validation/correction 일관화

### Phase 3 — MCP-ready exposure
- tool-friendly schema 정리
- confirmation token model 정리
- internal API를 MCP adapter가 호출 가능하게 정리

## Completion Criteria
이번 리팩터링 1차 완료 기준:
- register/publish 핵심 기능이 internal capability를 통해 수행된다.
- Telegram은 preview/renderer/callback adapter로 축소된다.
- preview/confirmation/result 구조가 MCP-ready contract를 가진다.
- settings / jobs / content 기능이 같은 result model을 따른다.
- 문서가 `architecture/agent-runtime.md`와 sync된다.

## Out of Scope for This Round
- MCP transport implementation
- external provider UI
- 자연어 품질 전체 개선
- proactive suggestion
- 고급 autonomous multi-step planning
