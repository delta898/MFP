#!/usr/bin/env bash

set -euo pipefail

MCP_URL="${MCP_URL:-http://127.0.0.1:4578/mcp}"
MCP_PROTOCOL_VERSION="${MCP_PROTOCOL_VERSION:-2025-11-05}"
MCP_TOKEN="${MCP_TOKEN:-}"
MCP_THEME="${MCP_THEME:-curl smoke test theme}"
MCP_APPROVE_FLOW="${MCP_APPROVE_FLOW:-0}"

TMP_DIR="$(mktemp -d)"
LAST_HEADERS_FILE=""
LAST_BODY_FILE=""
LAST_STATUS=""
SESSION_ID=""

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

log() {
  printf '[mcp-smoke] %s\n' "$*" >&2
}

fail() {
  printf '[mcp-smoke][FAIL] %s\n' "$*" >&2
  exit 1
}

json_get() {
  local file="$1"
  local path="$2"
  node -e '
const fs = require("fs");
const file = process.argv[1];
const pathExpr = process.argv[2];
const input = JSON.parse(fs.readFileSync(file, "utf8"));
const parts = pathExpr.split(".").filter(Boolean);
let current = input;
for (const part of parts) {
  if (current == null) {
    current = undefined;
    break;
  }
  if (/^\d+$/.test(part)) current = current[Number(part)];
  else current = current[part];
}
if (typeof current === "object") {
  process.stdout.write(JSON.stringify(current));
} else if (current !== undefined) {
  process.stdout.write(String(current));
}
' "$file" "$path"
}

json_string() {
  node -e 'process.stdout.write(JSON.stringify(process.argv[1] || ""));' "$1"
}

json_assert() {
  local file="$1"
  local expression="$2"
  local message="$3"
  node -e '
const fs = require("fs");
const file = process.argv[1];
const expression = process.argv[2];
const message = process.argv[3];
const input = JSON.parse(fs.readFileSync(file, "utf8"));
const ok = Function("input", `return (${expression});`)(input);
if (!ok) {
  console.error(message);
  process.exit(1);
}
' "$file" "$expression" "$message" || fail "$message"
}

extract_session_header() {
  local headers_file="$1"
  node -e '
const fs = require("fs");
const raw = fs.readFileSync(process.argv[1], "utf8");
const line = raw.split(/\r?\n/).find((entry) => /^mcp-session-id:/i.test(entry));
if (line) process.stdout.write(line.split(":").slice(1).join(":").trim());
' "$headers_file"
}

curl_json() {
  local method="$1"
  local payload="${2:-}"
  local auth_mode="${3:-configured}"

  LAST_HEADERS_FILE="$TMP_DIR/headers.$RANDOM.txt"
  LAST_BODY_FILE="$TMP_DIR/body.$RANDOM.json"

  local -a headers
  headers+=(-H "Accept: application/json, text/event-stream")
  headers+=(-H "mcp-protocol-version: ${MCP_PROTOCOL_VERSION}")

  if [[ -n "$SESSION_ID" ]]; then
    headers+=(-H "mcp-session-id: ${SESSION_ID}")
  fi

  if [[ "$auth_mode" == "configured" && -n "$MCP_TOKEN" ]]; then
    headers+=(-H "Authorization: Bearer ${MCP_TOKEN}")
  fi

  if [[ "$method" == "POST" ]]; then
    headers+=(-H "Content-Type: application/json")
  fi

  if [[ "$method" == "POST" ]]; then
    LAST_STATUS="$(
      curl -sS -o "$LAST_BODY_FILE" -D "$LAST_HEADERS_FILE" -w '%{http_code}' \
        -X "$method" \
        "${headers[@]}" \
        --data "$payload" \
        "$MCP_URL"
    )"
  else
    LAST_STATUS="$(
      curl -sS -o "$LAST_BODY_FILE" -D "$LAST_HEADERS_FILE" -w '%{http_code}' \
        -X "$method" \
        "${headers[@]}" \
        "$MCP_URL"
    )"
  fi
}

assert_status() {
  local actual="$1"
  local expected="$2"
  local message="$3"
  [[ "$actual" == "$expected" ]] || {
    [[ -f "$LAST_BODY_FILE" ]] && cat "$LAST_BODY_FILE" >&2 || true
    fail "$message (expected ${expected}, got ${actual})"
  }
}

run_missing_session_check() {
  log 'Checking tools/list without session -> expect 400'
  local saved_session="$SESSION_ID"
  SESSION_ID=""
  curl_json "POST" '{"jsonrpc":"2.0","id":9001,"method":"tools/list","params":{}}'
  assert_status "$LAST_STATUS" "400" 'tools/list without session should fail'
  json_assert "$LAST_BODY_FILE" 'input.error && input.error.message === "Missing MCP session id."' 'missing-session error message mismatch'
  SESSION_ID="$saved_session"
}

run_unauthorized_check() {
  [[ -n "$MCP_TOKEN" ]] || return 0
  log 'Checking initialize without Authorization -> expect 401'
  local saved_session="$SESSION_ID"
  SESSION_ID=""
  curl_json "POST" "{\"jsonrpc\":\"2.0\",\"id\":9000,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"${MCP_PROTOCOL_VERSION}\"}}" "omit"
  assert_status "$LAST_STATUS" "401" 'initialize without token should fail when bearer auth is enabled'
  json_assert "$LAST_BODY_FILE" 'input.error && input.error.message === "Unauthorized."' 'unauthorized error message mismatch'
  SESSION_ID="$saved_session"
}

run_initialize() {
  log 'Initializing MCP session'
  local payload
  payload="$(cat <<JSON
{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"${MCP_PROTOCOL_VERSION}","capabilities":{},"clientInfo":{"name":"curl-smoke","version":"1.0.0"}}}
JSON
)"
  curl_json "POST" "$payload"
  assert_status "$LAST_STATUS" "200" 'initialize should succeed'
  SESSION_ID="$(extract_session_header "$LAST_HEADERS_FILE")"
  [[ -n "$SESSION_ID" ]] || fail 'initialize should return mcp-session-id header'
  json_assert "$LAST_BODY_FILE" 'input.result && input.result.serverInfo && input.result.serverInfo.name === "naver-auto-blog-mcp-prototype"' 'serverInfo.name mismatch'
  log "Session established: ${SESSION_ID}"
}

run_tools_list() {
  log 'Listing tools'
  curl_json "POST" '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
  assert_status "$LAST_STATUS" "200" 'tools/list should succeed'
  json_assert "$LAST_BODY_FILE" 'Array.isArray(input.result?.tools) && input.result.tools.some((tool) => tool.name === "content_request_prepare")' 'content_request_prepare missing'
  json_assert "$LAST_BODY_FILE" 'Array.isArray(input.result?.tools) && input.result.tools.some((tool) => tool.name === "confirmation_decide")' 'confirmation_decide missing'
}

run_prepare_register_only() {
  log 'Preparing register-only request'
  local payload
  local theme_json
  theme_json="$(json_string "$MCP_THEME")"
  payload="$(cat <<JSON
{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"content_request_prepare","arguments":{"register_request":{"theme":${theme_json}}}}}
JSON
)"
  curl_json "POST" "$payload"
  assert_status "$LAST_STATUS" "200" 'content_request_prepare should succeed'
  json_assert "$LAST_BODY_FILE" 'input.result && input.result.isError === false' 'prepare should not be error'
  json_assert "$LAST_BODY_FILE" 'input.result?.structuredContent?.ok === true' 'prepare structuredContent.ok should be true'
  json_assert "$LAST_BODY_FILE" 'input.result?.structuredContent?.status === "confirmation_required"' 'prepare should require confirmation'
  json_assert "$LAST_BODY_FILE" 'input.result?.structuredContent?.bundle?.register_request?.payload?.theme === process.env.MCP_THEME' 'prepared theme mismatch'
  json_get "$LAST_BODY_FILE" 'result.structuredContent.confirmation_token.confirmation_id'
}

run_reject_confirmation() {
  local confirmation_id="$1"
  [[ -n "$confirmation_id" ]] || fail 'confirmation_id is required for reject step'
  log 'Rejecting pending confirmation'
  local payload
  payload="$(cat <<JSON
{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"confirmation_decide","arguments":{"confirmation_id":"${confirmation_id}","decision":"reject"}}}
JSON
)"
  curl_json "POST" "$payload"
  assert_status "$LAST_STATUS" "200" 'confirmation_decide reject should succeed'
  json_assert "$LAST_BODY_FILE" 'input.result?.structuredContent?.status === "rejected"' 'reject should produce rejected status'
}

run_optional_approve_flow() {
  [[ "$MCP_APPROVE_FLOW" == "1" ]] || return 0
  log 'Preparing optional approve flow with register+publish'
  local payload
  local theme_json
  theme_json="$(json_string "${MCP_THEME} approve flow")"
  payload="$(cat <<JSON
{"jsonrpc":"2.0","id":5,"method":"tools/call","params":{"name":"content_request_prepare","arguments":{"register_request":{"theme":${theme_json},"platforms":["naver"]},"publish_request":{"target":"naver","auto_trigger":true,"options":{"post_status":"draft"}},"ui":{"show_publish_options":true}}}}
JSON
)"
  curl_json "POST" "$payload"
  assert_status "$LAST_STATUS" "200" 'optional prepare should succeed'
  json_assert "$LAST_BODY_FILE" 'input.result?.structuredContent?.confirmation_token?.action_count === 2' 'optional approve flow should prepare 2 actions'
  local confirmation_id
  confirmation_id="$(json_get "$LAST_BODY_FILE" 'result.structuredContent.confirmation_token.confirmation_id')"
  [[ -n "$confirmation_id" ]] || fail 'optional approve flow confirmation_id missing'

  log 'Approving optional confirmation (this may register rows and trigger publish)'
  payload="$(cat <<JSON
{"jsonrpc":"2.0","id":6,"method":"tools/call","params":{"name":"confirmation_decide","arguments":{"confirmation_id":"${confirmation_id}","decision":"approve"}}}
JSON
)"
  curl_json "POST" "$payload"
  assert_status "$LAST_STATUS" "200" 'optional approve should succeed'
  json_assert "$LAST_BODY_FILE" 'input.result?.structuredContent?.status === "executed"' 'approve should execute actions'
}

run_delete_session() {
  log 'Closing session'
  curl_json "DELETE" ''
  assert_status "$LAST_STATUS" "204" 'DELETE /mcp should close session'
}

main() {
  export MCP_THEME
  log "Target URL: ${MCP_URL}"
  run_unauthorized_check
  run_initialize
  run_missing_session_check
  run_tools_list
  local confirmation_id
  confirmation_id="$(run_prepare_register_only)"
  run_reject_confirmation "$confirmation_id"
  run_optional_approve_flow
  run_delete_session
  log 'All smoke test steps passed'
}

main "$@"
