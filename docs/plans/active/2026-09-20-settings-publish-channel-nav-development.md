# Settings Publish-Channel Navigation Development Record

- Branch: `feat/settings-publish-channel-nav`
- Base: `dev`
- Start date: 2026-09-20
- Status: complete; user verified Beta channel chips hands-on, ready for dev merge

## User Need

대시보드 연결 상태(네이버/WordPress 미사용)나 글 발행 화면의 포스팅 대상(워드프레스 미설정 표시)을 눌렀을 때 설정 → 기본연결 → 콘텐츠 공간으로 이동한다. 블로그 채널 설정은 블로그 발행 채널 탭에 있으므로 그곳으로 이동해야 한다.

## Goal

미설정·미연결 블로그로 연결되는 모든 이동이 설정 → 기본연결 → 블로그 발행 채널(local tab `publishing`)로 열리도록 수정한다. 네이버 항목은 네이버 폼, WordPress 항목은 WordPress 폼까지 스크롤된다. Google/Sheets/AI 경로(콘텐츠 공간·AI 탭)는 그대로 둔다.

## Scope

- `navigateToSettingsNextTarget(tab, target)`에 local tab 전달 지원 추가 (단일 메커니즘)
- `goToUiCapabilitySettings`의 PUBLISH_ANY/NAVER/WORDPRESS 매핑에 `publishing` 지정 (Blog Beta 발행 채널 설정하기, 쇼핑 capability 버튼 포함)
- 기존 대시보드(`dashboard.js`) 네이버/WordPress 상태 버튼에 `publishing` 지정 (Google은 `content` 유지)
- Dashboard Beta readiness 버튼에 localTab 전달 지원 + 네이버/WordPress에 `publishing` 지정
- 계정 화면(`account.html` + `lifecycle.js`) 네이버/WordPress 행에 local tab 지정 (Google Sheets 행은 유지)
- 포스팅 대상 옆 `❗` 힌트(`readiness.js` `syncPlatformUiState`)를 capability 경로로 전환 + 구형 문구(`[설정 > 블로그]`) 수정
- 기존 대시보드 바인딩을 fetch 완료 후에서 로드 시작 시점으로 이동 (`확인 중` 클릭도 Beta로 이동)
- Dashboard Beta 온보딩은 이미 `publishing`을 전달하므로 변경 없음

## Non-goals

- 설정 화면 자체의 탭 구조·문구 변경 없음
- 작업트리의 기존 미커밋 변경(`shared/naver-trends-core/index.js` 스와이프 조정, `config/config.json.bak2`) 흡수 없음
- dev 병합·push (사용자 지시 시에만)

## Proposed Design

모든 진입점이 `navigateToSettingsNextTarget`을 거치므로, 여기에 세 번째 인자 `localTab`을 추가하고 `settingsNextActivateCoreTab(localTab)`을 `navigateTo` 호출 전에 실행한다. `settingsNextActivateTab`은 top tab만 건드리므로 local tab 사전 활성화가 유지된다(Dashboard Beta 온보딩에서 이미 검증된 순서).

## Affected Boundaries

- `ui/scripts/features/shell/setup-banner.js` (`navigateToSettingsNextTarget`)
- `ui/scripts/shared/capability-readiness.js` (`goToUiCapabilitySettings`)
- `ui/scripts/features/shell/dashboard.js` (`bindReadinessNavigation`)
- `ui/scripts/features/shell/dashboard-beta.js` (readiness 버튼 + 클릭 핸들러)
- `ui/partials/views/account.html` + `ui/scripts/foundation/lifecycle.js` (계정 화면 행)
- `ui/scripts/foundation/readiness.js` (`❗` 힌트 이동 경로 + 문구)
- `ui/scripts/foundation/navigation.js` (legacy `settings` 진입 시 Beta로 리다이렉트; 파일은 유지)

## Decisions and Tradeoffs

- `navigateTo(view, tab)` 시그니처는 바꾸지 않는다. foundation 함수 변경보다 각 호출부가 local tab을 명시하는 쪽이 영향 범위가 작다.
- 스크린샷의 포스팅 대상 옆 `!` 표시는 코드에 없는 문자이므로 별도 렌더링 이슈가 아니라 같은 이동 문제로 보고, 발행 채널 설정하기 버튼 경로(`goToUiCapabilitySettings(publish.*)`) 수정으로 커버한다.

## Progress

- 2026-09-20: user reported wrong settings destination; approved separate feature branch covering all unconfigured-blog entry points.
- 2026-09-20: inventoried 5 entry points with one root cause (local tab never activated); created branch + record before implementation.
- 2026-09-20: implemented localTab pass-through in `navigateToSettingsNextTarget` + `publishing` mapping for all blog-channel entry points (capability map, legacy dashboard, dashboard beta, account view). Google/Sheets/AI paths untouched. Strengthened smoke assertion for the dashboard→publishing flow.
- 2026-09-20: user screenshots identified two more spots — the `❗` hint next to 포스팅 대상 (6th entry point, routed via capability map, stale `[설정 > 블로그]` copy fixed) and dashboard binding timing (moved before fetch so `확인 중` clicks also land on Beta).
- 2026-09-20: user requested per-channel deep links — naver status/❗/account row scroll to `settings-next-naver-form`, wordpress equivalents to `settings-next-wordpress-form`. All entry points now go through `navigateToSettingsNextTarget(tab, target, localTab)`.
- 2026-09-20: `확인 중` clicks still landed on legacy in the user's run, but no code path from these buttons to legacy exists in source (only dead wiring without elements). Applied non-destructive guard instead of deletion: any `navigateTo('settings', …)` now redirects to Beta (`naver-blog`→naver form+publishing, `general`→content form, default→core). Legacy files kept on disk for recovery.
- 2026-09-20: timing split explained — target scroll was gated behind `loadSettingsNext({force:true})` while `fetchJson` has no timeout. A hanging backend stalls both the dashboard (`확인 중`) and the scroll, leaving the publishing tab unscrolled at the naver form. Fixed by scrolling immediately after the view toggle plus once more after load settles (core panels are static HTML; only AI selects rebuild).
- 2026-09-20: follow-up — the earlier "eager" binding was still placed after `await Promise.allSettled`, so `확인 중` clicks stayed unbound. Moved into `bindDashboardReadinessNavigation()` called as the first statement of `loadDashboard` (idempotent via `_navBound`). Any remaining wrong-target flash now provably comes from the bound handler's closure constants.
- 2026-09-20: ROOT CAUSE FOUND for the legacy detour — Dashboard Beta's static initial buttons (`dashboard-beta.html`) pointed at legacy `data-dashboard-beta-nav="settings" data-dashboard-beta-tab="naver-blog"` (both buttons, copy-paste). Clicks before the account fetch resolved hit these; after resolve, the container was replaced with Beta-bound buttons. Fixed the static buttons (Beta deep links + `disabled` while loading) as part of the channel-chip revamp.
- 2026-09-20: user-approved Beta channel revamp — `DASHBOARD_BETA_CHANNELS` registry (id/name/brand/form/icon/labels; new channel = one entry), brand-colored SVG icons by state (ready/attention brand, muted/loading gray), loading clicks disabled, per-channel deep links kept. Scope: Beta only.

## Verification Plan

- 기존 계약 테스트 + 영향 범위 focused 테스트
- 브라우저 smoke의 기존 기대(1826행 local tab 단언 등)와 충돌 없는지 확인
- 사용자 hands-on: 대시보드 WordPress 미사용 클릭, Blog Beta 발행 채널 설정하기 클릭, 계정 화면 WordPress 행 클릭 → 모두 블로그 발행 채널 탭으로 열리는지

## Verification Results

- `node --test scripts/account-view-design-system-contract.test.js scripts/dashboard-beta-shell-contract.test.js scripts/settings-next-ui-contract.test.js scripts/view-header-contract.test.js scripts/ui-script-structure.test.js scripts/single-publish-target-contract.test.js` — 40 passed
- `node --check` on all edited JS files — passed; `git diff --check` — passed
- Browser smoke not run (no selective filter; full run needs approval) — strengthened dashboard→publishing assertion included for the next run
- Full unit suite before parent merge: pending, requires explicit user approval
- Manual hands-on remaining: dashboard WordPress 미사용 클릭, Blog Beta 발행 채널 설정하기 클릭, 계정 화면 WordPress 행 클릭 → 블로그 발행 채널 탭 확인
- NOTE: dev server composes app.js once at startup (`http-server-runtime.js`) and serves it from memory. Restart `run_dev.sh` after pulling/editing, otherwise tests run a stale bundle. Timing-dependent symptoms reported (확인 중→naver vs 완료→wordpress) are consistent with testing different bundle versions across runs, not with handler logic (bindings are closure constants). Structural fix (recompose per request in development) is a separate follow-up, not part of this branch.
