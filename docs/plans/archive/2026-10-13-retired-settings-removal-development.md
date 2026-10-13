# 이전 Settings 화면 제거 개발 기록

- Branch: `codex/feat/remove-legacy-settings`
- Start date: 2026-10-13
- Base/parent branch: `codex/fbr/retired-surface-removal`
- Status: parent 병합 준비 완료

## 사용자 필요와 목표

Production에서 숨겨진 이전 Settings 화면과 더 이상 필요하지 않은 화면 전용 코드를 정리한다. Settings Beta와 현재 기능이 공유하는 설정 데이터, 저장 경로, 초기화 로직은 보존한다.

## 범위

- 이전 `view-settings` 화면과 전용 partial composition 및 navigation 경로 제거
- 구 화면 전용 UI controller, 스타일, 테스트/브라우저 fixture의 실제 참조를 추적한 뒤 제거
- Beta 및 현행 화면이 쓰는 설정 API, 값, 공용 secret/card 컴포넌트와 런타임 초기화 보존
- Settings Beta deep-link와 dashboard/setup 연결 흐름 보존
- 관련 구조 계약과 개발 기록 갱신

## 비범위

- Settings Beta의 UI/기능 변경
- persisted 설정값, backend routes, 공용 기능을 legacy라는 이름만으로 삭제
- 이전 화면에만 있던 설정 항목의 backend 저장 데이터 삭제
- parent FBR의 `dev` 병합, push, release

## 초기 조사 및 위험 경계

- Parent 브랜치는 Dashboard와 Blog legacy 단계가 통합된 `codex/fbr/retired-surface-removal`이다.
- `ui/partials/views/settings.html`은 구 탭 화면이며, `settings-next.html`은 별도 Beta 화면이다. Navigation은 요청된 legacy `settings`를 Beta로 redirect한다.
- 구 Settings의 원고 프로필 화면과 Settings Beta는 `/api/v1/settings/writing-profile` 및 하위 preview/reference API를 공유한다. Beta 전용 UI/controller가 이미 이 계약을 사용하므로 데이터/API는 보존한다.
- legacy `settingsMajorHasPendingBasicChanges`와 `settingsWritingProfileDirty`는 앱 종료 시 변경 감지 및 Beta의 종료 확인 흐름에서도 읽힌다. 이 결합을 제거할 때 Beta의 dirty-state 계약을 유지할 방법을 확인한다.
- Shopping에는 별도 `shopping-image-settings.js`가 `/api/v1/settings/major`와 이미지 API를 사용한다. 구 화면의 같은 도메인 helper를 제거해도 Shopping 경로가 유지되는지 확인한다.
- `settings-secrets.js`와 `settings-card.js`는 Settings Beta에서도 호출/스타일 참조가 있으므로 공용 코드로 취급한다.
- 오래된 자동화 runner/UI는 retired Blog의 설정 DOM을 직접 제어했고, 사용자는 이전 단계에서 해당 자동화를 중단하기로 했다. Blog Beta 자동화와 `apps/trends/`는 별도 경로여서 유지한다.

## 구현 및 검증 단계

1. Settings 화면과 각 controller/helper의 직접 참조, 기능 중복, app startup side effect를 확인한다.
2. legacy-only shell과 inert route/dirty-state coupling만 제거하고 Beta/Shopping 계약을 보존한다.
3. focused Settings Beta, Shopping 및 app-shell contracts를 실행한다.
4. UI 동작 변경 경계를 포함하는 브라우저 smoke를 실행하고, 결과와 수동 확인 항목을 기록한다.

## 결정 및 진행 기록

- 2026-10-13: 사용자는 legacy 제거 목록의 3번 Settings 단계를 시작하도록 요청했다. 이전 Dashboard/Blog와 같은 parent-child 흐름을 따른다.
- 2026-10-13: 첫 조사에서 Settings Beta가 구 Settings의 원고 프로필 API를 공유하고, Shopping 이미지 기능이 `/api/v1/settings/major` 설정을 이용하는 것을 확인했다. UI 이외의 공유 데이터/런타임 삭제는 범위에서 제외한다.
- 2026-10-13: 기존 설정 UI, 전용 controller·스타일, retired Blog 자동화 UI/controller를 app composition에서 제거했다. Google Sheet URL 열기와 라디오 값 helper는 shared로 옮겼고, 네이버 로그인 상태 확인은 Settings Beta 소유로 이동했다. 쇼핑/공용 발행 사전 확인은 설정 폼 DOM 대신 `/api/v1/settings/core-connections`를 읽도록 분리했다. 이 endpoint는 애플리케이션 비밀번호 원문을 반환하지 않고 설정 여부만 제공한다.
- 2026-10-13: `view-settings` partial과 nav는 제거했지만 `settings` deep-link는 Settings Beta로 보내는 호환 경로로 남겼다. Settings Beta 및 쇼핑이 쓰는 API·저장 데이터, `settings-secrets.js`, `settings-card.js`, `settings-tables.css`(로그 화면 공유), `apps/trends/`는 보존한다.
- 2026-10-13: 서버 런타임을 재확인해 예전 Trends/RSS/Blog 게시 타이머는 이미 `syncAutoRunnerWithConfig()`에서 중단하고 SNS 자동화만 유지하는 것을 확인했다. 이 stage에서 이를 다시 변경하지 않았다.
- 2026-10-13: 삭제된 화면만 검사하던 skip 테스트/오래된 브라우저 fixture 전제를 걷어내고, shell 계약에서 Settings 부재와 deep-link redirect를 확인하도록 바꿨다.

## 결과 및 검증

- 구현 결과: 레거시 Settings의 UI·전용 controller·스타일 및 이전 Blog 자동화 UI/controller 제거. Settings Beta의 저장/연결 흐름, Shopping의 이미지 설정과 발행 준비, Help/Logs 및 Blog Beta는 유지.
- 자동 검증: `node --test scripts/ui-script-structure.test.js scripts/ui-structure-contract.test.js scripts/settings-next-ui-contract.test.js scripts/blog-image-mode-workflows-contract.test.js scripts/help-view-contract.test.js scripts/discovery-badge-contract.test.js` 통과 (34/34). Shopping/게시 준비 관련 focused contracts 통과 (22/22). `npm run test:ui-browser`는 Settings Beta와 여러 현재 화면을 진행한 뒤 Blog Beta 원고 모드 전환 과정의 기존 위치 assertion에서 실패: `scripts/test-ui-browser-smoke.js:5631`, actual top `588.125`, expected `12`. 이 assertion은 변경한 Settings 흐름과 무관한 편집기 레이아웃 기대값이다.
- 사용자 수동 확인: Settings Beta에서 기본 연결·AI·글쓰기·부가 서비스·앱 설정을 확인하고, Blog Beta 작성, Shopping 이미지 설정 및 발행 사전 확인, Help/Logs 진입을 확인한다.
- 검토 결과: 완전 제거된 설정 화면 경로를 대상으로 한 남은 skip/filter 테스트 전제를 정리했다. 공용 발행 사전 확인은 현행 core-connections 계약의 safe read만 사용하며, 비밀번호 원문을 읽지 않는다. 대체 화면과 공유 API 데이터는 보존했다.
- 남은 위험/후속 작업: browser smoke의 원고 모드 전환 위치 assertion 실패는 이번 Settings 제거와 분리해 확인한다. 사용자가 Settings Beta 주요 연결/저장, Blog Beta 작성 흐름, Shopping 이미지 설정 및 발행 사전 확인, Help/Logs 진입을 수동 확인할 수 있다. 변경은 아직 미커밋이며 push는 요청 범위에 포함되지 않는다.
