# Development 로그/이력 화면 정리 개발 기록

- Branch: `codex/feat/remove-legacy-logs`
- Start date: 2026-10-13
- Base/parent branch: `codex/fbr/retired-surface-removal`
- Status: 구현, 검증 및 parent 통합 완료

## 사용자 필요와 목표

사용자는 Development 환경에서만 왼쪽 메뉴에 보이는 `로그/이력` 화면도 다른 retired UI와 함께 정리하려 한다. 이 화면의 전용 UI, navigation, refresh 및 UI 전용 log rendering은 제거하되, 대시보드 진행 상태, activity event 수집, 서버 log storage/API처럼 다른 기능이 사용하는 운영 경로를 삭제하지 않는다.

## 범위

- `view-logs`, 전용 내비게이션/탭/자동 새로고침/컨트롤러 제거
- UI 전용 system-log rendering 및 activity timeline 코드와 CSS/test 참조 제거
- 공유 dashboard log API와 progress polling, activity lifecycle store 등 타 caller 보존
- 시스템 로그 열기를 가리키는 job-recovery 추천 흐름의 영향 확인 및 합의된 처리 반영
- parent FBR 기록과 관련 테스트 갱신

## 비범위

- 대시보드 진행 상태에서 사용하는 `/api/v1/dashboard/logs` API 및 서버 log storage 제거
- 공용 activity lifecycle/event store 제거
- 현재 Dashboard Beta 기능 재설계
- parent branch의 `dev` 병합, push 또는 release

## 영향 조사

- `ui/partials/views/logs.html`이 구 화면 markup을 소유한다.
- `ui/index.html`, `ui/scripts/foundation/navigation.js`, `ui/scripts/foundation/lifecycle.js`, `ui/scripts/features/legacy-actions-controllers.js`, `ui/scripts/features/shell/setup-banner.js`가 nav, route, timer refresh, tab/controller 결합을 갖는다.
- `ui/scripts/features/shell/activity-logs.js`, `system-logs.js`, `log-state.js`는 logs 화면 전용으로 보인다. 단, `/api/v1/dashboard/logs`는 `ui/scripts/foundation/progress-state.js`에서도 비동기 작업 진행 내용을 표시하기 위해 사용하므로 보존한다.
- `src/recommendations/producers/job-recovery.js`는 실패 작업 안내를 로그 화면으로 연결했다. 사용자는 실패 안내는 유지하고 로그 연결은 제거하기로 결정했다. 이 안내는 읽기 전용 추천 카드로 남긴다.

## 설계/결정

- 2026-10-13: 제품 화면과 서버 수집/저장 capability를 분리한다. 이 단계는 사용자 요청에 없는 로그 저장 및 API 호환성 변경을 포함하지 않는다.
- 2026-10-13: 사용자는 job-recovery 실패 안내를 유지하고 `시스템 로그 보기` 링크는 제거하기로 결정했다. 별도 대체 화면은 만들지 않고, 안내 내용과 추천 근거를 읽기 전용 카드로 보여준다.

## 검증 및 남은 작업

- 완료: 로그 화면 partial, nav, navigation branch, refresh timer, tab/controller bindings, 전용 renderer/state, 전용 responsive CSS를 제거했다. Development 메뉴 외에도 app composition manifest, UI structure/header contracts, browser smoke의 retired surface 경로를 정리했다.
- 보존: `/api/v1/dashboard/logs`, progress polling, activity event 수집·저장, 서버 로그 저장 및 `/api/v1/logs/*` 진단 API는 유지한다. 이 단계는 UI 삭제이며 shared operation/diagnostic boundary를 변경하지 않는다.
- 실패 작업 추천은 CTA 없이 실패 안내 및 추천 근거만 남도록 했으며, `logs.system` presentation surface 등록도 제거했다. 업데이트 실패 안내는 사라지는 로그 화면 대신 재시도 및 진단 자료 전달 문구를 제공한다.
- 자동 검증: focused recommendation/UI contract tests 38건 통과. Browser UI smoke 통과(426 fixture requests, page errors 0); sandbox에서 Google Fonts 요청 2건이 차단됐다. `git diff --check` 통과. 전체 unit suite는 parent를 `dev`에 통합할 때 별도 승인 후 실행한다.
- 수동 확인: Development 메뉴에서 로그 화면이 사라졌는지, Dashboard Beta의 진행 표시와 실패 작업 안내가 유효한지 확인한다.
