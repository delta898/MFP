# 이전 Dashboard 제거 개발 기록

- Branch: `codex/feat/remove-legacy-dashboard`
- Start date: 2026-10-13
- Base/parent branch: `codex/fbr/retired-surface-removal`
- Status: 구현 및 focused/browser 검증 완료; 사용자 수동 확인 대기

## 사용자 필요와 목표

Production에서 숨겨진 이전 Dashboard의 UI와 더 이상 쓰지 않는 코드를 제거한다. `Dashboard Beta`의 기본 화면, 표시 데이터, 다른 화면의 정상 동작은 그대로 유지한다.

## 범위

- 이전 `view-dashboard` partial과 숨은 nav 항목 제거
- 이전 Dashboard의 navigation/lifecycle/refresh/compatibility CSS 참조 추적 및 제거
- `loadDashboard()`를 부르는 다른 화면을 확인해 필요한 갱신은 현행 Beta가 소유하는 기능 또는 명시적 도메인 함수로 이동하고, 불필요한 옛 화면 갱신 호출 제거
- 이전 화면 전용 summary/external-content API가 다른 caller가 없으면 이 단계에서 제거 가능한지 검토
- 기존 Dashboard Beta의 account/readiness, 운영 현황, 통계, 추천 콘텐츠 동작을 보호하는 계약 갱신

## 비범위

- Dashboard Beta UI/기능 변경
- 로그/이력 메뉴나 API 제거
- Blog/Settings 구 화면 및 원고 폴더·붙여넣기 입력 제거
- 계정, 권한, 사용량, 자동 포스팅 또는 공용 recommendation API 동작 변경

## 조사 결과와 설계

- 이전 화면은 `ui/partials/views/dashboard.html`이고, nav는 `ui/index.html`에서 숨겨져 있다. 현재 화면은 `view-dashboard-beta`이며 기본 active 화면이다.
- `ui/scripts/foundation/navigation.js`와 `ui/scripts/foundation/lifecycle.js`에는 이전 view ID의 진입·refresh 분기가 남아 있다.
- `ui/scripts/features/shell/dashboard.js`의 `loadDashboard()`는 이전 readiness/stat/schedule DOM뿐 아니라 account overview 렌더링, 앱 버전 동기화, 네이버 로그인 오류 알림, 추천 center refresh도 한다. 다른 feature에서 여러 곳이 이 함수를 부른다.
- Dashboard Beta도 account overview와 recommendation center를 별도로 불러온다. 제거 과정에서 필요한 계정/알림 도메인 효과를 실수로 잃지 않도록 caller별 의미를 확인한다.
- `dashboard-content.js`와 `/api/v1/dashboard/summary`, `/api/v1/dashboard/external-content`는 구 Dashboard의 코드와 연결돼 보이나, API 경계에 다른 caller가 없는지 전수 검색 후 제거 여부를 정한다.

구 Dashboard 마크업을 제거하기 전에 다음을 확인했다.

1. `loadDashboard()` 호출부를 한 곳씩 분류해 Beta 진입 시 자동 갱신으로 대체 가능한지 검토한다.
2. account overview, session issue notification, version sync, recommendation center가 어느 모듈의 소유인지 확인하고 필요한 공용 경로를 보존한다.
3. API route/controller/service와 CSS composition의 다른 consumer 여부를 확인한다.
4. UI contract와 browser smoke fixture를 이전 화면이 아닌 Beta 흐름으로 갱신한다.

## 진행 기록

- 2026-10-13: 이전 Dashboard 메뉴가 Production에서 hidden이고 Dashboard Beta가 현재 메뉴·기본 화면임을 확인했다.
- 2026-10-13: 초기 검색에서 `loadDashboard()`가 이전 화면 외부의 설정, 글 발행, 계정 흐름에서도 호출됨을 발견했다. 단순 partial 삭제는 검증된 제거 단위가 아니므로 각 callsite의 목적을 분리하는 범위로 좁힌다.
- 2026-10-13: 제거 구현 전에 이 기록을 만들고 sub-feature branch에서 작업을 시작했다.
- 2026-10-13: 구 화면에서만 사용하는 summary/activity/external-content API, 피드 수집 코드, dashboard scripts와 styles를 제거했다. 로그 조회 API와 activity event 기록은 다른 진단·운영 흐름에서 사용하므로 유지했다.
- 2026-10-13: Beta account overview에 기존 세션 만료 알림을 옮겨 기존 `loadDashboard()`의 간접 효과를 보존했다. 화면 외부의 불필요한 대시보드 refresh 호출은 제거했다.
- 2026-10-13: Beta clock과 Blog의 기존 탭/필터 CSS를 각 소유 스타일 모듈로 옮긴 뒤 구 `dashboard.css`를 삭제했다.
- 2026-10-13: 구조 계약과 browser smoke fixture에서 제거된 화면 및 모듈 참조를 갱신했다.

## 결과 및 검증

- 자동 검증: Dashboard Beta, UI structure/style, navigation, discovery, Settings, shopping, URL utility 계약 74건 통과. `node scripts/test-ui-browser-smoke.js` 통과(499 fixture requests, 외부 Google Fonts 요청 2건은 테스트에서 차단). 사용자가 요청한 전체 단위 테스트 `node scripts/run-unit-tests.js`도 통과(2,271 tests: 2,259 pass, 12 skipped, 0 fail). 샌드박스 네트워크 권한 때문에 첫 실행에 로컬 서버 기반 5건이 차단되어 권한 승인 후 재실행했다. `git diff --check` 통과.
- 수동 확인: Dashboard Beta를 열어 준비 상태, 최근 운영 현황, 결과 통계, 추천 영역, 새로고침 동작을 확인한다.
- 남은 위험: Beta dashboard account refresh 시 네이버 세션 알림이 기존과 동일하게 작동하는지, 그리고 Blog filter/tabs와 clock 스타일이 유지되는지 수동 확인이 필요하다. 구 Dashboard API를 직접 호출하는 외부 사용자나 별도 로컬 스크립트가 있다면 해당 호출은 더 이상 지원되지 않는다.
