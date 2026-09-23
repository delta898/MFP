# Settings Discard Navigation Development Record

## Branch

- Branch: `codex/fix/settings-discard-navigation`
- Base/parent branch: `release/v0.5.2` (`42c09bd`)
- Start date: 2026-09-23
- Status: implemented and automatically verified; native title visual review pending

## User Need

설정에 저장하지 않은 변경이 있을 때 다른 메뉴를 선택하고 `변경사항 버리고 이동`을 눌러도 변경만 폐기되고 목적 화면으로 이동하지 않는 문제를 해결한다.

## Goal

- 변경 폐기와 목적 화면 이동을 불필요한 설정 재조회에서 분리한다.
- 변경 폐기 즉시 UI를 마지막 저장값으로 되돌리고, 설정에 다시 들어왔을 때도 그 값이 정상적으로 표시되게 한다.
- 실제 3방향 대화상자의 폐기 버튼부터 목적 화면 활성화까지 브라우저 회귀 테스트로 보호한다.
- native title에서 내부 용어 `WebUI`를 제거하고 플랫폼별로 중복을 최소화한다.

## Scope

- Settings Beta 미저장 변경 이탈 guard
- 네트워크 요청 없는 로컬 저장값 복원과 설정 재진입 시 서버 재확인
- 관련 UI contract 및 browser smoke 검증
- macOS native title은 비우고 Windows/Linux 및 browser title은 `BlogGenius`로 유지

## Explicit Non-goals

- 설정 저장 API 또는 데이터 형식 변경
- 다른 화면의 미저장 변경 guard 재설계
- v0.5.2의 다른 기능·버전·CHANGELOG 변경
- frameless window, custom title bar 또는 native window control 변경
- parent merge, tag 또는 push

## Diagnosis and Design

- 현재 guard는 폐기 직후 `loadSettingsNext({ force: true })`를 기다린 다음에야 navigation을 계속한다.
- 이 reload는 여러 원격 요청을 함께 기다리므로, 지연 또는 미완료 요청이 있으면 변경 상태만 지워지고 목적 화면 전환이 막힐 수 있다.
- 이탈 시에는 각 설정 모듈이 보관한 마지막 저장 상태로 UI를 동기적으로 복원하고 즉시 navigation을 허용한다.
- Settings Beta 진입 경로의 기존 강제 reload는 서버 상태 재확인용으로 유지하되, 폐기 의미와 화면 이동은 이 네트워크 요청에 의존하지 않는다.
- 기존 browser smoke는 이전 `showUiConfirm`을 대체하는 방식이라 현재 `showUiThreeWayChoice`의 실제 폐기 버튼을 검증하지 못한다. 실제 tertiary button을 클릭하는 흐름으로 갱신한다.
- HTML title은 browser tab 식별을 위해 `BlogGenius`로 유지하고, Electron native title update는 main process에서 제어한다. macOS는 본문 로고와 중복되므로 빈 제목을 사용하고 Windows/Linux는 window switcher 식별을 위해 `BlogGenius`를 사용한다.

## Verification Plan

- 설정 UI contract test
- 실제 폐기 버튼을 사용하는 browser smoke
- diff check
- Electron startup/title contract test
- parent merge 전 full unit suite는 사용자 승인 후 실행

## Implementation Progress

- Settings Beta 이탈 guard에서 `loadSettingsNext({ force: true })` 선행 대기를 제거했다.
- 폐기 선택은 core connection, AI role, writing defaults, app input, optional service가 가진 마지막 저장 상태를 각 모듈의 UI에 즉시 다시 적용한다.
- AI 공급자별 임시 draft도 함께 제거해 나중에 공급자를 전환했을 때 폐기한 값이 다시 나타나지 않게 했다.
- 로컬 복원이 끝나면 dirty scope를 정리하고 원래 navigation을 즉시 계속한다.
- Settings Beta 재진입은 기존 진입 경로의 강제 reload로 서버 상태를 재확인한다.
- browser smoke를 실제 3방향 dialog 조작으로 갱신해 다음을 검증한다.
  - `변경사항 버리고 이동` 후 Dashboard가 활성화된다.
  - dirty state가 해제된다.
  - 이동 시 설정 API를 다시 호출하지 않으며, 숨겨진 Settings UI도 이미 마지막 저장값으로 복원되어 있다.
  - Settings 재진입 시 저장된 AI 모델 이름이 복원된다.
  - `계속 편집`은 Settings에 머물며 변경 상태를 보존한다.
- 검증 중 발견한 기존 browser smoke drift를 현재 계약에 맞췄다.
  - retired legacy Settings 요청은 Settings Beta로 이동한다.
  - 콘텐츠 연결 검사는 해당 core tab을 명시적으로 활성화한다.
  - selectable design style 수는 현재 registry와 같은 6개다.
- `BlogGenius WebUI` HTML title을 `BlogGenius`로 정리했다.
- Electron은 `page-title-updated`의 기본 native title 반영을 막고 macOS에서는 빈 제목, 다른 OS에서는 `BlogGenius`를 유지한다.

## Verification Results

- `node --test scripts/settings-next-ui-contract.test.js scripts/ui-script-structure.test.js`: 15 passed, 0 failed.
- 최종 `npm run test:ui-browser`: passed with 391 fixture requests.
- `node --test src/gui/electron-main-startup-contract.test.js scripts/ui-structure-contract.test.js`: 18 passed, 0 failed.
- 첫 browser run은 retired legacy Settings 화면을 기다리는 기존 기대값 때문에 수정 구간 전에 실패했다.
- 두 번째 run은 비활성 core tab의 버튼을 누르는 기존 전제에서 실패했다.
- 세 번째 run은 다른 기능에서 추가된 여섯 번째 style을 5개로 기대하는 기존 drift에서 실패했다.
- 위 세 기대값을 현재 제품 계약에 맞춘 뒤 전체 browser smoke가 끝까지 통과했다.
- 2026-09-23: user confirmed the discard-and-navigate flow works correctly in hands-on testing.

## Remaining Risks

- 설정 재진입 직후 원격 조회가 실패해도 폐기 시 복원한 마지막 저장 UI를 유지하며, 기존 오류 feedback 정책을 사용한다.
- `저장 후 이동`은 기존 scope별 저장 계약을 그대로 사용하며 이번 변경에서 동작을 바꾸지 않았다.
- macOS native title과 Windows title 표시는 실제 각 플랫폼 창에서 최종 확인이 필요하다.
- parent merge 전 required full unit suite가 남아 있다.
