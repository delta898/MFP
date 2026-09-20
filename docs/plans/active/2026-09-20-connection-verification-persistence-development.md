# Connection Verification Persistence (A+C) Development Record

- Branch: `feat/connection-verification-persistence`
- Base: `dev`
- Start date: 2026-09-20
- Status: complete; user verified restart persistence + quit dialogs hands-on, ready for dev merge

## User Need

워드프레스·Google Spreadsheet·AI 설정을 검증했음에도 앱 재시작 후 `확인 필요`로 표시되어, 사용자는 불필요한 불안감과 반복 확인 작업을 겪는다. 검증이 실제로는 기존 정보로 잘 동작한다.

## Root Cause

검증 결과가 메모리 `Map`(`src/connections/verification-state.js`)에만 보관되어 재시작 시 증발한다. 자격증명은 디스크에 있는데 "확인됐다는 증거"가 없어서, 재시작 후엔 무조건 `unverified` → `확인 필요`가 된다.

## Goal (A+C)

- A: 검증 기록을 디스크에 저장. 재시작 후에도 마지막 검증 상태를 기억하고, 신선하면 즉시 `연결됨`, 오래됐으면 백그라운드 조용 재확인 + `확인 중` 표시
- C: 상태를 4분할로 표시 — `미설정 / 확인 중 / 연결됨 / 실패(사유)`. "한 번도 안 해봄"과 "실패함"을 구분해 불필요한 불안을 제거

## Scope

- 신규: 파일 기반 검증 저장소 모듈 (자격증명 서명+상태+확인시각+실패사유, 비밀값 미포함, `config.json`과 분리)
- 연결: 워드프레스(readiness-service + overview-service), Google Sheets, AI 키, Naver 세션 (연결별 확인 비용을 보고 Naver는 범위 조정 가능)
- UI: Beta 채널 칩에 실패 사유 표시, `확인 중` 자동 전이 (버튼 구조는 현행 유지)
- TTL: 기존 freshness 패턴 재사용 (연결별 TTL)

## Non-goals

- 실제 검증 로직(verifyAuth 등) 변경 없음
- `config.json` 스키마 변경 없음
- dev 병합·push (사용자 지시 시에만)
- 작업트리의 기존 미커밋 변경(`shared/naver-trends-core/index.js` 스와이프 조정, `config/config.json.bak2`) 흡수 없음

## Proposed Design

1. `src/connections/verification-store.js`: JSON 파일 기반 저장소. `record(kind, signature, result)`, `read(kind, signature)`, TTL 판정은 호출자(기존 `isFreshVerification` 패턴) 유지
2. `verification-state.js`의 메모리 Map을 store-backed으로 교체 (동일 함수 시그니처 유지 → 호출부 변경 최소화)
3. Overview/readiness는 그대로 `connected/failed/unverified`를 반환하되, 소스가 영속화되어 재시작 후에도 유지됨
4. UI: `failed` + reason/message가 있으면 칩에 사유 표시 (Beta 레지스트리 라벨 확장)

## Affected Boundaries

- `src/connections/` (저장소 + readiness + overview-service)
- `ui/scripts/features/shell/dashboard-beta.js` (실패 사유 표시)
- `src/config-loader.js` (상태 파일 경로 — 신규 파일 위치 결정 필요)

## Decisions and Tradeoffs

- 사용자 승인: A+C 병행 (B 단독안은 시작 시 네트워크 + 일시적 `확인 중` 잔류로 반쪽)
- 저장 위치는 설정 동기화/내보내기에서 제외되는 별도 상태 파일로 (민감정보 제외, 서명 해시만)
- Naver는 현행 유지로 확정 (사용자 결정). 세션 확인이 헤드리스 브라우저를 띄워서 시작 시 자동 재확인 비용이 큼
- AI 결과 뱃지 `준비됨` → `연결됨`으로 변경 (버튼 `연결 확인`과 일치). 이미지 모델 미동작 제보는 사용자 오인으로 확인됨

## Progress
- 2026-09-20: user reported post-restart `확인 필요` anxiety + redundant checks; approved A+C on a separate feature branch.
- 2026-09-20: confirmed in-memory-only verification (`verification-state.js` Map); merged prior nav branch to dev, created this branch + record before implementation.
- 2026-09-20: A implemented — `verification-state.js` is now file-backed (`config/connection_verification.json`, signature-keyed, no secrets, best-effort I/O, corrupt-file tolerant), same exports so callers unchanged; wired `configureConnectionVerificationState` at the legacy-api composition root with `CONFIG_DIR`. 5 new store tests pass.
- 2026-09-20: C implemented for Beta chips — `failed` status renders `연결 실패` label with reason in title/aria (wordpress/naver); other states unchanged.
- 2026-09-20: user scoped the rest to Sheets + per-model AI (Naver deferred). Implemented: generic store fns (`record/readConnectionVerification`, `createConnectionSignature`, `isVerificationTrusted`, TTLs sheets 24h / ai-role 7d); sheets preflight records success/failure in session-runtime; overview google_sheets reports `connected`/`failed` from trusted persisted records (status field untouched otherwise); AI role+single-model tests record per (scope, provider, code, key, url); `getAiRoleSettings.verification` exposes trusted flags; client hydrates AI verification on load. Field edits still invalidate (existing flows).
- 2026-09-20: user reported provider switching loses verification (A→B→A shows 확인 필요). Root cause: client invalidated on every change; server trust only hydrated at load for saved config. Fixed client-side with per-provider verified snapshots (`verifiedSnapshot`, captured on test success and on trusted load after render); invalidate now recomputes by comparing form values (empty key + configured counts as untouched). Server `testAiRoleConnection` records under effective scope (chat/writing → text).
- 2026-09-20: follow-up — restart hydrates only the saved provider; B/C show 확인 필요 after restart despite trusted server records. Fixed by exposing per-role trusted history (`verification[role].history` with provider/code/base_url meta, no secrets) and building client snapshots for every history entry; compare ignores name for preset providers and presetCode for direct. Meta survives file reload; `listConnectionVerifications(kind)` added.
- 2026-09-20: user asked whether the AI check is per-model or per-provider. Verified in `model-connection-tester.js`: Google/Anthropic/OpenAI/direct validate the specific model code (existence + capability), so per-model trust is correct there. KIE only checks account credit → made KIE trust provider-level on both server (signature without code) and client (compare ignores model fields for kie). Label `준비됨` → `연결됨` for consistency with the `연결 확인` button.
- 2026-09-20: user reported Cmd+Q hang after AI checks (stuck after `GUI: Shutting down...`, ~80%). A+C changes add no timers/sockets/servers/children (sync JSON I/O only), so not the cause by construction. Added staged shutdown diagnostics to `before-quit` (active handle dump, server.close callback, agent-memory open/close markers) + updated startup contract. Awaiting user log capture to pinpoint.
- 2026-09-20: log analysis + user repro (provider switching only, no check) identified the real mechanism: provider dropdown marks settings dirty → Cmd+Q runs `before-quit` teardown FIRST (server closed, logs printed) → renderer beforeunload vetoes close on unsaved changes → app stays alive with a dead server; repeat Cmd+Q repeats the cycle (matches double `UI server closed.`). Fixed by moving teardown from `before-quit` to `will-quit`, which only fires when quit actually proceeds. Veto protection for unsaved changes is preserved.
- 2026-09-20: user confirmed the veto is silent (no dialog) → quit permanently trapped. Added explicit quit confirm: `before-quit` asks the renderer for dirty state, shows `저장 안 하고 종료 / 계속 편집` dialog when dirty, sets `window.__bloggeniusForceQuit` to bypass the renderer veto on approved quit. Clean quit path unchanged.
- 2026-09-20: user requested 3-button expansion (save-and-proceed) for both quit and in-app navigation dialogs, same L&F (in-app dialog, not native). Implemented: shared dialog tertiary button (backward compatible), per-scope save-only paths (AI/optional/app-input; core scopes + writing already event-free), `saveAllDirtySettingsNext` dispatcher, 3-way in-app confirm + renderer-driven quit confirm. New `save-proceed.js` module (shell.js size contract).

## Verification Plan

- 저장소 단위 테스트 (기록/조회/TTL/서명 변경 시 무효/재시작 후 유지)
- readiness/overview 회귀 테스트
- Beta 칩 실패 사유 계약 테스트
- 전체 스위트 (병합 전, 승인 후)

## Verification Results

- Focused: 94 passed (store incl. meta/list/trust, readiness, overview, session sheets recording, AI incl. history + key-change invalidation + effective scope, model tester, settings-next + beta + structure contracts)
- Remaining: Naver persistence (deferred by user decision — session check cost); full unit suite before dev merge (approval required); user hands-on restart test (Sheets + AI roles)
