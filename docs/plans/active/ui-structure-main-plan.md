# UI Structure Main Plan

## Status

- Phase: awaiting user UI validation for stage 2
- Started: 2026-08-22
- Integration branch: `feature/ui-structure-main`
- Current child branch: `feature/ui-structure-02-ui-server-boundary`

## Goal

`ui/app.js`, `src/ui-server.js`, `ui/index.html`, `ui/styles.css`의 책임을
기능 경계로 나누고, 이후 기능이 다시 단일 파일에 누적되지 않도록 자동 검증과
문서화된 구조 계약을 마련한다.

## Branch Protocol

1. 각 단계는 최신 `feature/ui-structure-main`에서 별도 child branch로 시작한다.
2. child branch에서는 구현과 자동 검증까지만 진행한다.
3. 자동 검증이 끝나면 사용자에게 실제 UI 테스트를 요청한다.
4. 사용자 승인 전에는 commit하거나 integration branch에 merge하지 않는다.
5. 승인 후 conventional commit을 만들고 integration branch에 merge한 뒤 child branch를 삭제한다.
6. 모든 단계가 끝날 때까지 integration branch를 `dev`에 merge하지 않는다.

## Work Stages

1. `feature/ui-structure-01-regression-guards`
   - 실제 브라우저 UI smoke test
   - 정적 asset, DOM ID, 주요 view/navigation 계약
2. `feature/ui-structure-02-ui-server-boundary`
   - `ui-server.js` composition root와 처리 runtime 분리
3. `feature/ui-structure-03-html-composition`
   - 동기적으로 조립되는 feature HTML partial 도입
4. `feature/ui-structure-04-css-modules`
   - cascade 순서를 보존한 base/component/feature CSS 분리
5. `feature/ui-structure-05-js-foundation`
   - API, dialog, notification, lifecycle, navigation 기반 모듈
6. `feature/ui-structure-06-dashboard-shell`
   - dashboard, account, logs, update, clock, sidebar controller
7. `feature/ui-structure-07-discovery-content`
   - trend, discovery, blog/shopping table controller
8. `feature/ui-structure-08-publishing-social`
   - quick publishing, preview, manual SNS controller
9. `feature/ui-structure-09-settings-automation`
   - section별 settings와 automation controller
10. `feature/ui-structure-10-hardening`
    - 잠재 버그, lifecycle 누수, 중복 선언, 구조 guardrail 정리

## Completed Stage: Regression Guards

### Scope

- 실제 `ui/index.html`, `ui/styles.css`, `ui/app.js`를 브라우저에서 로드한다.
- 사용자 config, 자동 실행기, Telegram, SNS startup 작업과 격리된 fixture API를 사용한다.
- browser console/page error와 정적 asset 실패를 실패로 처리한다.
- 주요 navigation과 quick discovery modal 기본 동작을 확인한다.
- UI를 읽기만 하는 동안 POST 요청이 발생하지 않는지 확인한다.
- DOM ID 중복, 주요 view/navigation 대응, 로컬 asset 존재를 단위 테스트로 보호한다.

### Completion Gate

- 자동 UI structure test가 통과한다.
- headless browser smoke test가 통과한다.
- 사용자가 실제 앱 UI를 테스트하고 commit/merge를 승인한다.

### Automated Validation Result

- UI structure contract: 4 passed
- Browser UI smoke: passed with 28 fixture requests
- Full unit suite: 102 files, 501 tests passed
- Product files under `ui/` and `src/` were not changed in this stage.

## Current Stage: UI Server Boundary

### Scope

- `src/ui-server.js`에 남아 있던 automation 정책 정규화를 독립 runtime으로 분리한다.
- 설정 field 변환, runtime 반영, 쇼핑 이미지/config 저장 정책을 독립 runtime으로 분리한다.
- `src/ui-server.js`는 dependency wiring과 server lifecycle을 담당하는 composition root로 제한한다.
- composition root 크기와 추출된 책임의 재유입을 자동 구조 테스트로 방지한다.
- 분리 중 드러난 주제 이력 미입력 예외와 쇼핑 이미지 설정 미반영을 회귀 테스트와 함께 수정한다.
- config/health 초기화 순서와 무관하게 설정·상단·footer 버전 표시를 함께 갱신한다.

### Completion Gate

- 새 runtime 단위 테스트와 `ui-server.js` 구조 경계 테스트가 통과한다.
- 전체 unit/API/browser UI 회귀 테스트가 통과한다.
- 사용자가 실제 앱에서 설정, 자동화 상태, 주요 화면을 테스트하고 commit/merge를 승인한다.

### Automated Validation Result

- Focused runtime and boundary tests: 19 passed
- Full unit suite: 106 files, 510 tests passed
- Settings API smoke: passed
- Blog automation API smoke: passed
- Browser UI smoke: passed with 28 fixture requests
- Version display regression: static contract passed; browser rerun pending because execution approval was declined
- Full UI API E2E: not run because local-server execution approval was declined

## Non-Goals

- 첫 단계에서 제품 UI 동작이나 디자인을 변경하지 않는다.
- 첫 단계에서 확인된 잠재 버그를 테스트 없이 바로 수정하지 않는다.
- 리팩터링과 프레임워크·번들러 도입을 동시에 진행하지 않는다.
