# Remote MCP Server Plan

## Goal
`BlogGenius App 실행 -> Claude/ChatGPT 등에서 remote MCP 연결 -> 채팅에서 글감 등록/발행 요청` 흐름을 지원한다.

지원 대상 시나리오:
1. BlogGenius App이 실행 중인 같은 컴퓨터에서 MCP client 연결
2. 같은 LAN 상의 다른 컴퓨터에서 MCP client 연결
3. nginx reverse proxy 또는 외부 IP를 통해 public remote MCP client 연결

## Background
- 현재 MCP prototype은 `src/mcp/stdio-server.js` 기반의 local stdio transport까지 완료되었다.
- canonical content request bundle, confirmation token, prepare/confirm execute 흐름은 internal capability 경로 위에서 동작한다.
- Codex GUI 기준으로 `prepare -> confirm -> execute -> Google Sheet append`까지 실동 확인을 마쳤다.
- 이번 단계의 한계는 transport가 `stdio`라는 점이다. 이는 local child-process 연결에는 적합하지만 remote attach UX에는 맞지 않는다.
- BlogGenius는 현재 `1 app = 1 user` 전제의 독립 application이다.
- remote MCP client는 사실상 `1개 연결`을 우선 가정한다.

## Desired User Experience
1. 사용자가 BlogGenius App을 실행한다.
2. App이 별도 remote MCP service endpoint를 연다.
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
- UI server와 MCP server는 별도 service로 분리한다.
- 앱 프로세스는 `UI Server`와 `McpRemoteService`를 함께 관리한다.
- 기본 포트는 `UI 4577`, `MCP 4578`로 분리한다.
- 기본 bind host는 `127.0.0.1`로 둔다.
- `enabled`, `host`, `port`, `path`, `auth`는 UI 설정에서 사용자가 제어한다.
- auth 기본 정책도 UI 설정에서 제어하되, 구조는 최소 shared bearer token을 우선 지원한다.
- confirmation persistence는 multi-tenant 분리보다 `현재 MCP session 우선 -> 앱 전역 fallback` 수준의 단순 모델을 우선 적용한다.

## First Implementation Target
- `src/mcp/http-server.js` 또는 동등한 remote transport entry 추가
- `src/mcp/remote-service.js` 또는 동등한 app-managed service 추가
- `/mcp` 단일 endpoint prototype
- `initialize`, `tools/list`, `tools/call` 최소 경로 지원
- `content_request_prepare`, `confirmation_decide`만 우선 노출
- localhost와 로컬 네트워크에서 다른 host가 붙는 수준의 prototype 완성
- reverse proxy 앞단에서 외부 URL로 연결 가능한 구조 확보

## Open Questions
- public 노출 시 auth 기본값을 `none`으로 둘지 `bearer`로 둘지
- UI에서 MCP 설정 변경 시 서비스 재시작 UX를 어떻게 보여줄지
- settings 화면에 endpoint preview / copy UX를 어느 정도까지 넣을지

## Validation Target
- BlogGenius App 실행 중 remote MCP endpoint가 열린다.
- 외부 MCP host가 remote endpoint에 연결할 수 있다.
- 채팅에서 `글감 등록해줘` 요청 후 confirmation/execute까지 동작한다.
- 실제 Google Sheet append 또는 publish prepare가 정상 반영된다.
- same-machine / LAN / reverse-proxy URL 시나리오별로 접속 주소가 문서화된다.

## Suggested Starting Order
1. 계획 문서에 구조/기본값 고정
2. `McpRemoteService` 분리
3. MCP HTTP endpoint prototype을 service에 연결
4. MCP 설정 모델 및 UI 설정 추가
5. 최소 인증 추가
6. localhost / LAN smoke test
7. reverse proxy setup guide 문서화
