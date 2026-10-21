# MCP Client Setup

## Purpose
MCP는 Telegram과 같은 Agent Action Catalog와 Agent Runtime을 사용한다. MCP 도구는 런타임에서 사용 가능한 Blog 액션 설명자로부터 생성되며, 별도 비즈니스 실행 경로를 두지 않는다.

엔트리 포인트:
- `src/host/mcp/stdio-server.js` (Host bootstrap; delegates MCP wire handling to the adapter)
- `src/host/mcp/http-server.js` (standalone Host bootstrap; app-managed HTTP lifecycle uses the same adapter)

실행 명령:

```bash
npm run mcp:stdio
npm run mcp:http
```

현재 Blog 도구:
- 글감 저장 또는 발행 대기열 등록
- 글감/대기열 조회, 이동, 수정
- 원고 생성, 저장된 원고 포스팅, 생성 후 포스팅
- 확인이 필요한 액션은 세션에 묶인 확인 도구로 승인/거부

입력과 확인:
- 필수 질문과 선택 입력 안내는 Telegram과 공유하는 Agent Action descriptor에서 관리한다.
- MCP 클라이언트는 typed action schema와 입력 안내를 보고 누락된 필수 값이나 사용자가 지정하겠다고 한 불명확한 옵션을 확인한 뒤 도구를 호출한다. 언급하지 않은 선택 옵션은 해당 action의 기본값을 따른다.
- 원고 생성·포스팅은 키워드, 이미지 방식, 외부 참고, 추가 요청, 네이버/워드프레스 카테고리를 지원한다.
- 확인이 필요한 액션은 Agent Runtime이 preview와 confirmation ID를 돌려주며, 명시 승인 후 같은 런타임에서 실행된다.
- confirmation ID는 발급된 MCP 세션과 연결되어 다른 세션에서 재사용할 수 없다.
- 승인 도구가 시간 초과되거나 결과가 불분명하면 `blog_confirmation_status`로 진행 상태와 최종 결과를 조회한다. 원래 액션이나 승인을 반복해 확인하지 않는다.

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
codex mcp add naver-autoblog -- node /Users/delta898/Project/NaverAutoBlog/src/host/mcp/stdio-server.js
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
- 인자: `/Users/delta898/Project/NaverAutoBlog/src/host/mcp/stdio-server.js`
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
        "/Users/delta898/Project/NaverAutoBlog/src/host/mcp/stdio-server.js"
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
4. `tools/list`에서 `blog_`로 시작하는 Blog action tools 확인
5. 읽기 전용 확인은 `blog_content_queue_list_topics` 호출
6. 변경 옵션이 있으면 승인 전에 `blog_confirmation_update`로 pending confirmation을 갱신하고 새 preview를 확인
7. preview를 확인한 뒤 `blog_confirmation_decide`에 ID와 `approve` 또는 `reject` 전달
8. 승인은 빠르게 접수 응답을 반환하며 실행은 백그라운드에서 진행된다. `blog_confirmation_status`를 조회해 진행 상태와 최종 결과 확인

## Current Limitations
- Blog 글감·대기열·원고 액션을 노출한다. 새 액션은 Agent descriptor와 composition이 노출할 때 도구 목록에도 반영된다.
- MCP 클라이언트가 자연어 대화를 처리하고 필요한 필드를 확인한다. 서버는 typed tool call을 검증·실행한다.
- confirmation preview 뒤에도 `blog_confirmation_update`로 사용자가 추가한 옵션을 검증·반영할 수 있다. 갱신된 preview를 확인하기 전에는 승인하지 않는다.
- settings / jobs / suggestions tool surface는 아직 추가하지 않았다.
- remote auth는 shared bearer token 수준의 최소 전략만 있다.
- Streamable HTTP 중 SSE / resumability / multi-session persistence는 아직 없다.

## Recommended Next Steps
- OpenCode에서 HTTP endpoint 연결 후 읽기 전용 글감 조회 확인
- development 데이터로 글감 저장/거부와 대기열 목록 확인
- `settings` / `jobs` tool 추가
- stdio host 실행은 애플리케이션 런타임의 인증/환경 설정이 필요하다.
