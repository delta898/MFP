# MCP Internal API Prototype Plan

## Goal
register/publish 핵심 경로를 MCP가 붙을 수 있는 최소 tool contract까지 끌어올린다.

이번 단계의 목표는 “실제 MCP wire server 완성”이 아니라 아래를 빠르게 증명하는 것이다.

1. canonical content request bundle이 Telegram 외 채널에서도 그대로 통한다.
2. confirmation 모델이 Telegram callback 없이도 작동한다.
3. MCP adapter가 capability registry / runtime 위에서 동작할 수 있다.

## Scope
포함:
- canonical content request schema 공용화
- confirmation token schema 초안 정의
- MCP prototype tool surface 정의
- runtime 위에서 동작하는 prototype adapter 추가

제외:
- 실제 MCP server transport 구현
- stdio / HTTP wire protocol 처리
- tool discovery metadata의 완전한 표준화
- settings/jobs/tool 전면 확장

## Current Design

```text
MCP Client
   ↓
Prototype MCP Adapter
   ↓
Canonical Content Request Bundle
   ↓
Agent Runtime / Confirmation Store / Capability Registry
```

핵심 원칙:
- MCP는 Telegram parser를 거치지 않는다.
- MCP 입력은 canonical request 또는 그에 가까운 구조체를 바로 준다.
- preview와 confirmation은 renderer 문자열이 아니라 구조체로 반환한다.
- 실행은 최종적으로 capability execute만 수행한다.

## Prototype Tool Surface

### 1. `content_request_prepare`
입력:
- `conversation_id`
- `user_id`
- `message_id`
- `register_request`
- `publish_request`
- `meta`
- `ui`

역할:
- canonical content request bundle 생성
- prepare capability를 통해 payload normalize
- 실제 실행 action 목록 생성
- runtime confirmation 생성
- confirmation token 반환

출력:
- normalized `bundle`
- structured `previews`
- `confirmation_token`
- runtime confirmation 상태

### 2. `confirmation_decide`
입력:
- `confirmation_id`
- `decision` (`approve` | `reject`)
- `conversation_id`
- `user_id`
- `message_id`

역할:
- 기존 confirmation token 또는 id 기반 결정 수행
- runtime confirmation decision 호출
- approve 시 capability execute 수행

출력:
- confirmation 상태
- execute 결과
- 최신 confirmation token

## Shared Schema Draft

### Canonical Content Request
```json
{
  "request_id": "content.register_topic:telegram:123:55:1710...",
  "conversation_id": "telegram:123",
  "channel": "telegram|mcp|ui",
  "user_id": "123",
  "mode": "prepare|execute",
  "intent": "content.register_topic|content.publish",
  "payload": {},
  "context_refs": {
    "pending_plan_id": null,
    "message_id": "55"
  }
}
```

### Canonical Content Request Bundle
```json
{
  "kind": "content_request_bundle",
  "bundle_id": "content_bundle:telegram:123:55:1710...",
  "source": "telegram_legacy_parser|mcp_tool|ui_form",
  "register_request": {},
  "publish_request": {},
  "meta": {
    "explicit_params": []
  },
  "ui": {
    "show_publish_options": true
  }
}
```

### Confirmation Token
```json
{
  "token_type": "agent.confirmation",
  "confirmation_id": "confirm_xxx",
  "channel": "mcp",
  "user_id": "mcp-user",
  "conversation_id": "mcp:session-1",
  "status": "pending|accepted|rejected|executed|expired",
  "kind": "confirmation|correction",
  "issued_at": "2026-03-13T10:00:00.000Z",
  "expires_at": "2026-03-13T10:10:00.000Z",
  "plan_id": "plan_xxx",
  "action_count": 2,
  "superseded_confirmation_id": ""
}
```

## Execution Semantics
- `register_request`가 있으면 `content.register_topic.execute` action 생성
- `publish_request`가 있고 `auto_trigger !== false` 이면 `content.publish.execute` action 생성
- `publish_request`가 있어도 `auto_trigger === false` 면 preview에는 포함되지만 실제 execute action은 생성하지 않는다
- confirmation은 runtime confirmation store가 관리한다

## Prototype Status
이번 단계에서 목표하는 완료 상태:
- 공용 schema/helper가 `src/internal-api/` 아래에 존재
- Telegram legacy mapper가 그 helper를 재사용
- MCP prototype adapter가 tool list / tool invoke 수준으로 동작
- 최소 단위 테스트로 schema + adapter 흐름이 고정됨

## Next Step After Prototype
- 실제 MCP server transport 연결
- tool metadata를 표준 MCP schema에 맞게 보강
- settings/jobs 계열 tool surface 추가
- content request bundle validator를 더 엄격하게 확장
