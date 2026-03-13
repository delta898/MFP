# Remote MCP Server Plan

## Goal
`BlogGenius App 실행 -> Claude/ChatGPT 등에서 remote MCP 연결 -> 채팅에서 글감 등록/발행 요청` 흐름을 지원한다.

## Background
- 현재 MCP prototype은 `src/mcp/stdio-server.js` 기반의 local stdio transport까지 완료되었다.
- canonical content request bundle, confirmation token, prepare/confirm execute 흐름은 internal capability 경로 위에서 동작한다.
- Codex GUI 기준으로 `prepare -> confirm -> execute -> Google Sheet append`까지 실동 확인을 마쳤다.
- 이번 단계의 한계는 transport가 `stdio`라는 점이다. 이는 local child-process 연결에는 적합하지만 remote attach UX에는 맞지 않는다.

## Desired User Experience
1. 사용자가 BlogGenius App을 실행한다.
2. App이 remote MCP endpoint를 연다.
3. Claude / ChatGPT / 기타 MCP host에서 해당 remote MCP를 등록한다.
4. 사용자는 채팅에서 글감 등록, 발행 준비, 승인 같은 요청을 보낸다.
5. BlogGenius App이 내부 capability를 실행하고 결과를 반환한다.

## Next Job Scope
- `Streamable HTTP` 기반 remote MCP transport 추가
- BlogGenius App 실행 시 remote MCP endpoint를 함께 제공할 수 있는 구조 설계
- 기존 `content_request_prepare`, `confirmation_decide` tool을 remote transport에서도 재사용
- host 연결을 위한 최소 인증 전략 정의
- remote transport 기준 로그/에러/confirmation lifecycle 정리

## Out of Scope
- settings/jobs 전체 MCP surface 확장
- OAuth/provider 설정 UX 대규모 개편
- production-grade multi-tenant auth
- public internet exposure를 위한 배포 인프라 자동화

## Design Direction
- `stdio` transport는 유지하고, 별도 remote transport를 추가한다.
- business logic는 계속 `Agent Runtime -> Capability Registry -> Memory` 경로를 사용한다.
- Telegram-specific 구조를 remote MCP에 끌고 오지 않는다.
- transport 차이와 무관하게 canonical request / confirmation contract를 공유한다.

## First Implementation Target
- `src/mcp/http-server.js` 또는 동등한 remote transport entry 추가
- `/mcp` 단일 endpoint prototype
- `initialize`, `tools/list`, `tools/call` 최소 경로 지원
- `content_request_prepare`, `confirmation_decide`만 우선 노출
- 로컬 네트워크에서 다른 host가 붙는 수준의 prototype 완성

## Open Questions
- BlogGenius App 프로세스에 어떤 방식으로 HTTP MCP server를 붙일지
- app 구동 시 항상 활성화할지, 설정으로 on/off 할지
- 인증을 bearer token, local shared secret, session token 중 무엇으로 둘지
- confirmation persistence를 remote client별로 어떻게 분리할지

## Validation Target
- BlogGenius App 실행 중 remote MCP endpoint가 열린다.
- 외부 MCP host가 remote endpoint에 연결할 수 있다.
- 채팅에서 `글감 등록해줘` 요청 후 confirmation/execute까지 동작한다.
- 실제 Google Sheet append 또는 publish prepare가 정상 반영된다.

## Suggested Starting Order
1. remote transport 진입점 설계
2. MCP HTTP endpoint prototype 구현
3. 최소 인증 추가
4. host 연결 smoke test
5. 문서화 및 setup guide 업데이트
