# MCP Client Setup

## Purpose
현재 저장소에는 register/publish 중심의 prototype MCP stdio server가 포함되어 있다.

엔트리 포인트:
- `src/mcp/stdio-server.js`

실행 명령:

```bash
npm run mcp:stdio
```

현재 노출되는 tool:
- `content_request_prepare`
- `confirmation_decide`

## What This Supports Today
- `initialize`
- `notifications/initialized`
- `ping`
- `tools/list`
- `tools/call`

즉, MCP 클라이언트가 stdio 기반으로 서버를 띄우고 tool discovery / tool invoke까지 수행하는 최소 경로는 동작한다.

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
      "env": {}
    }
  }
}
```

## Smoke Test Flow
정상 동작 기준 최소 흐름:

1. `initialize`
2. `notifications/initialized`
3. `tools/list`
4. `tools/call` with `content_request_prepare`
5. `tools/call` with `confirmation_decide`

## Current Limitations
- prototype MCP server이며 full production transport hardening 단계는 아직 아니다.
- content domain만 우선 노출한다.
- settings / jobs / suggestions tool surface는 아직 추가하지 않았다.
- OAuth / remote auth / streamable HTTP server는 아직 없다.

## Recommended Next Steps
- Codex/Claude 실제 클라이언트에 1회 연결 후 smoke test
- `settings` / `jobs` tool 추가
- tool input schema를 더 엄격한 JSON schema로 보강
- 필요 시 stdio 외 transport도 검토
