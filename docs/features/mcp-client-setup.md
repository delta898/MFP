# MCP Client Setup

## Purpose
현재 저장소에는 register/publish 중심의 prototype MCP server가 포함되어 있다.

엔트리 포인트:
- `src/mcp/stdio-server.js`
- `src/mcp/http-server.js`

실행 명령:

```bash
npm run mcp:stdio
npm run mcp:http
```

현재 노출되는 tool:
- `content_request_prepare`
- `confirmation_decide`

핵심 입력 철학:
- MCP는 글감 등록/발행에 필요한 핵심 필드만 다룬다
- 주로 사용하는 입력은 `theme(주제)`, `keywords`, `instruction(참고/지시사항)`, `naver_category`, `wordpress_category`, `platforms`, `image_gen`, `external_reference`
- `image_gen` 기본값은 `true`
- `external_reference` 기본값은 `true`
- spreadsheet append는 `content_request_prepare` 시점이 아니라 `confirmation_decide approve` 이후 실행 시점에만 일어난다
- register + publish를 함께 승인한 경우, publish는 방금 append된 row를 우선 대상으로 삼는다
- publish approval은 전체 발행 로그가 끝날 때까지 동기 대기하지 않고, `발행 시작` acknowledgement를 먼저 반환한다
- `theme(주제)`가 없으면 서버는 바로 append하지 않고 `needs_clarification` 결과를 반환해 host가 추가 질문을 하도록 유도한다

## What This Supports Today
- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

즉, MCP 클라이언트가 stdio 또는 HTTP 기반으로 서버에 연결하고 tool discovery / tool invoke까지 수행하는 최소 경로는 동작한다.

## Codex CLI Setup
Codex CLI에서는 `codex mcp add`로 로컬 stdio 서버를 등록할 수 있다.

예시:

```bash
codex mcp add naver-autoblog -- node /Users/delta898/Project/NaverAutoBlog/src/mcp/stdio-server.js
```

확인:

```bash
codex mcp list
codex mcp get naver-autoblog
```

주의:
- 절대 경로를 사용하는 편이 가장 안전하다.
- `npm run mcp:stdio` 대신 `node .../stdio-server.js` 직접 실행이 클라이언트 설정에서는 더 단순하다.
- 서버 로그는 stdout을 오염시키지 않도록 stderr로 분리되어 있다.
- 개발 모드에서는 `cwd`가 프로젝트 루트여야 `config/`와 OAuth 토큰 파일을 올바르게 찾는다.

## Codex GUI Setup
Codex GUI의 `맞춤형 MCP`에서 `STDIO`를 선택했다면 아래처럼 설정한다.

- 이름: `bloggenius-mcp`
- 실행 명령: `node`
- 인자: `/Users/delta898/Project/NaverAutoBlog/src/mcp/stdio-server.js`
- 환경 변수:
  - `DEBUG_MCP=1` (선택)
- 작업 중인 디렉터리: `/Users/delta898/Project/NaverAutoBlog`

중요:
- `작업 중인 디렉터리`가 `~/code` 같은 기본값으로 남아 있으면 MCP 서버가 다른 위치의 `config/`를 찾게 된다.
- 이 경우 `Google 계정 미연동`, `Google OAuth client not ready`처럼 보이는 오진이 날 수 있다.
- Codex GUI 설정을 바꾼 뒤에는 앱을 완전히 재시작하는 편이 가장 안전하다.

## Claude / MCP JSON Config Example
stdio 기반 MCP 클라이언트가 `mcpServers` 형식을 사용한다면 아래처럼 붙일 수 있다.

```json
{
  "mcpServers": {
    "naver-autoblog": {
      "command": "node",
      "args": [
        "/Users/delta898/Project/NaverAutoBlog/src/mcp/stdio-server.js"
      ],
      "cwd": "/Users/delta898/Project/NaverAutoBlog",
      "env": {}
    }
  }
}
```

`cwd`를 지원하는 host라면 설정하는 편이 안전하다.

## Remote HTTP Prototype
BlogGenius App을 실행하면 `McpRemoteService`가 UI 서버와 별도로 함께 관리된다.

기본 endpoint:

```text
http://127.0.0.1:4578/mcp
```

설정 위치:
- 앱 UI의 `설정 -> MCP` 탭
- 저장 후 `config/config.json`의 `mcp.remote.*`

예시:

```json
{
  "mcp": {
    "remote": {
      "enabled": false,
      "host": "127.0.0.1",
      "port": 4578,
      "path": "/mcp",
      "auth": {
        "bearer_token": "change-me"
      },
      "allowed_origins": [
        "http://localhost:3000"
      ]
    }
  }
}
```

초기 설치 직후에는 `config/config.json`에 `mcp` 섹션이 없을 수 있다.
이 경우 앱은 런타임에서 기본값을 사용한다:
- `enabled: false`
- `host: 127.0.0.1`
- `port: 4578`
- `path: /mcp`
- `auth.bearer_token: 비어 있음`

이 상태에서 MCP 설정 UI를 열면, 저장된 token이 아직 없을 때 화면에는 32-byte random -> base64url 43자 draft token이 표시될 수 있다.
이 draft token은 저장 전까지는 UI 값이며, 저장하면 `config/config.json`에 기록된다.
반대로 token을 비우고 저장하면 인증 없음(`none`)으로 동작한다.

현재 remote transport 동작 방식:
- request/response 본 경로는 `POST /mcp`다.
- `initialize` 응답 시 `mcp-session-id` 헤더를 발급한다.
- 후속 `tools/list`, `tools/call` 요청은 같은 `mcp-session-id`를 포함해야 한다.
- `DELETE /mcp` with `mcp-session-id`로 세션 종료가 가능하다.
- 서버 응답은 현재 `application/json` 중심이며 SSE streaming/resume은 아직 없다.

주의:
- 기본 bind는 `127.0.0.1:4578`을 권장한다.
- 로컬호스트 외 노출 시에는 bearer token을 설정하는 편이 안전하다.
- Origin 검사는 localhost / same-host / `allowed_origins`만 허용한다.
- `0.0.0.0`으로 바인딩한 경우 MCP client는 `0.0.0.0`이 아니라 실제 LAN IP 또는 reverse proxy URL을 사용해야 한다.
- `Bearer Token 재발급`은 UI에서 새 값을 발급한 뒤, `저장 및 적용` 시 파일과 서비스 구성에 반영된다.

접속 URL 예시:
- 같은 컴퓨터: `http://127.0.0.1:4578/mcp`
- 같은 네트워크: `http://192.168.x.x:4578/mcp`
- reverse proxy/public: `https://your-domain.com/mcp`

reverse proxy 사용 시 원칙:
- MCP client에는 내부 포트가 아니라 외부에서 실제로 보이는 최종 URL을 넣는다.
- 예: nginx가 `https://blog.example.com/mcp`를 내부 `127.0.0.1:4578/mcp`로 전달하면, MCP client 설정은 `https://blog.example.com/mcp`다.

## Smoke Test Flow
정상 동작 기준 최소 흐름:

1. `initialize`
2. `notifications/initialized` 또는 `mcp-session-id` 저장
3. `tools/list`
4. `tools/call` with `content_request_prepare`
5. `tools/call` with `confirmation_decide`

## Current Limitations
- prototype MCP server이며 full production transport hardening 단계는 아직 아니다.
- content domain만 우선 노출한다.
- settings / jobs / suggestions tool surface는 아직 추가하지 않았다.
- remote auth는 shared bearer token 수준의 최소 전략만 있다.
- Streamable HTTP 중 SSE / resumability / multi-session persistence는 아직 없다.

## Recommended Next Steps
- Codex/Claude 실제 클라이언트에 remote endpoint 연결 smoke test
- single-user / single-client 가정 기준 confirmation fallback 단순화 점검
- `settings` / `jobs` tool 추가
- tool input schema를 더 엄격한 JSON schema로 보강
