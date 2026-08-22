# UI Structure Main Plan

## Status

- Phase: stage 5 automated validation passed; awaiting manual UI validation
- Started: 2026-08-22
- Integration branch: `feature/ui-structure-main`
- Current child branch: `feature/ui-structure-05-js-foundation`

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

## Completed Stage: UI Server Boundary

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
- Manual UI validation: passed, including the corrected settings version display

## Completed Stage: HTML Composition

### Scope

- `ui/index.html`은 document/sidebar/update banner/footer/script를 보유하는 bounded shell로 제한한다.
- dashboard, blog, shopping, social, account, settings, logs 및 overlay markup을 feature partial로 분리한다.
- blog와 settings는 탭 단위 nested partial로 한 번 더 분리하고 partial당 500줄 상한을 적용한다.
- 서버가 listen하기 전에 partial을 동기적으로 한 번 조립하고 완성된 HTML만 브라우저에 제공한다.
- include 경로 이탈, HTML 이외 파일, 누락 파일, 순환 참조는 서버 시작 전에 실패시킨다.
- 구조 테스트와 browser fixture 모두 raw shell이 아니라 실제 조립 결과를 검증한다.

### Completion Gate

- 조립 결과가 분리 전 `ui/index.html`과 동일한 DOM source를 유지한다.
- composition 단위 테스트와 UI shell 구조 계약이 통과한다.
- 전체 unit/API/browser UI 회귀 테스트가 통과한다.
- 사용자가 실제 앱에서 주요 화면과 modal을 테스트하고 commit/merge를 승인한다.

### Automated Validation Result

- Pre-split/composed HTML: byte-for-byte identical, 2,938 lines
- Shell sizes: index 190 lines, blog 38 lines, settings 36 lines; largest partial 411 lines
- Focused composition and structure tests: 9 passed
- Full unit suite: 107 files, 514 tests passed
- UI API E2E: passed; verifies the served shell is fully composed
- Settings API smoke: passed
- Blog automation API smoke: passed
- Browser UI smoke: passed with 28 fixture requests
- Manual UI validation: passed

## Completed Stage: CSS Modules

### Scope

- `ui/styles.css`를 명시적인 cascade 순서만 보유하는 bounded manifest로 제한한다.
- 기존 스타일을 base, layout, component, feature 모듈로 분리하되 selector와 선언 순서는 재배치하지 않는다.
- 서버가 listen하기 전에 CSS를 동기 조립해 브라우저에는 기존과 같은 단일 `/styles.css`를 제공한다.
- HTML/CSS 조립기가 경로·확장자·누락·순환 검증을 공유하도록 text composition 기반을 둔다.
- CSS manifest 순서, 모든 모듈의 도달 가능성·유일성, 모듈당 900줄 상한을 구조 테스트로 보호한다.

### Completion Gate

- 조립 결과가 분리 전 `ui/styles.css`와 byte-for-byte 동일하다.
- CSS composition과 cascade 구조 계약 테스트가 통과한다.
- 실제 서버 E2E가 완성 CSS 응답을 확인하고 browser smoke가 computed style을 확인한다.
- 사용자가 실제 앱의 desktop/mobile 주요 화면과 modal을 테스트하고 commit/merge를 승인한다.

### Automated Validation Result

- Pre-split/composed CSS: byte-for-byte identical, 9,046 lines
- Manifest: 36 lines, 19 ordered modules; largest module 832 lines
- Focused composition and structure tests: 13 passed
- Full unit suite: 109 files, 518 tests passed
- UI API E2E: passed; verifies the served stylesheet is fully composed
- Settings API smoke: passed
- Blog automation API smoke: passed
- Browser UI smoke: passed with 28 fixture requests, including desktop computed styles and mobile sidebar flow
- Manual UI validation: passed

## Current Stage: JavaScript Foundation

### Scope

- `ui/app.js`는 명시적인 classic-script 실행 순서만 보유하는 bounded manifest로 제한한다.
- API client, notification, dialog, readiness, navigation, lifecycle 기반을 독립 파일로 분리한다.
- 나머지 기능 코드는 6~9단계의 controller 분리를 위한 임시 feature 경계로 나눈다.
- 서버가 listen하기 전에 JavaScript를 동기 조립해 브라우저에는 기존과 같은 단일 `/app.js`를 제공한다.
- include 경로 이탈, JavaScript 이외 파일, 누락 파일, 순환 참조를 서버 시작 전에 실패시킨다.
- manifest 순서와 모든 모듈의 도달 가능성·유일성·크기 상한을 구조 테스트로 보호한다.

### Completion Gate

- 조립 결과가 분리 전 `ui/app.js`와 byte-for-byte 동일하다.
- JavaScript composition과 classic-script 구조 계약 테스트가 통과한다.
- 실제 서버 E2E와 browser smoke가 완성된 단일 script 응답과 주요 UI 동작을 확인한다.
- 사용자가 실제 앱의 navigation, dialog, notification, 설정 저장 경고를 테스트하고 commit/merge를 승인한다.

### Automated Validation Result

- Pre-split/composed JavaScript: byte-for-byte identical, 13,812 lines
- Manifest: 17 ordered modules; largest foundation module 669 lines, largest temporary feature module 2,825 lines
- Focused composition and structure tests: 16 passed
- Full unit suite: 111 files, 522 tests passed
- UI API E2E: passed; verifies `/app.js` is fully composed and contains no raw include directive
- Settings API smoke: passed
- Blog automation API smoke: passed
- Browser UI smoke: passed with 28 fixture requests
- Manual UI validation: pending

## Non-Goals

- 첫 단계에서 제품 UI 동작이나 디자인을 변경하지 않는다.
- 첫 단계에서 확인된 잠재 버그를 테스트 없이 바로 수정하지 않는다.
- 리팩터링과 프레임워크·번들러 도입을 동시에 진행하지 않는다.
