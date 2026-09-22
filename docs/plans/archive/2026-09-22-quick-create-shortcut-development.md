# Quick Create Shortcut Development Record

- Branch: `codex/quick-create-shortcut`
- Base/parent branch: `dev` (`449ae66`)
- Start date: 2026-09-22
- Status: complete; approved for `dev` merge on 2026-09-22

## User Need

사용자가 앱의 어느 화면에 있더라도 메뉴를 찾거나 대시보드로 돌아가지 않고 새 글 작성을 빠르게 시작할 수 있어야 한다.

## Goal

기존 `새 글 작성` 메뉴와 Blog Beta 빠른 생성 진입 경로에 `CmdOrCtrl+N`을 연결한다. 설정의 미저장 변경 보호와 현재 모달 작업을 보존하면서 새 글 제목 입력란으로 이동한다.

## Scope

- Electron 파일 메뉴의 `새 글 작성`에 `CmdOrCtrl+N` 표시 및 accelerator 연결
- 기존 `navigateToBlogQuickCreate()` 경로 재사용
- 이미 열린 blocking dialog/modal이 있으면 뒤에서 화면을 전환하지 않음
- 설정 미저장 변경의 기존 저장/폐기/취소 흐름 유지
- shell contract 및 관련 browser smoke 검증

## Non-goals

- 새로운 빠른 생성 화면이나 별도 키보드 이벤트 계층 추가
- 생성·발행 중 작업의 취소 또는 상태 정책 변경
- AI 모델 카탈로그 현행화
- `dev` 병합, push, release 작업

## Design Decisions

- 단축키는 OS 관례에 맞춰 Electron menu accelerator인 `CmdOrCtrl+N`으로 소유한다.
- renderer에 별도 전역 keydown listener를 추가하지 않는다. 메뉴 클릭과 단축키가 같은 진입 함수를 사용하게 해 동작 차이를 막는다.
- 미저장 설정 확인은 기존 `navigateTo()`가 소유한다.
- 이미 열린 modal transaction은 사용자의 현재 결정을 우선하므로 shortcut을 무시한다.

## Implementation Progress

- 2026-09-22: `dev`에서 branch 생성 및 범위 확정.
- Electron 파일 메뉴의 `새 글 작성`에 `CmdOrCtrl+N` accelerator를 연결했다.
- `navigateToBlogQuickCreate()`가 열린 modal dialog를 감지하면 현재 화면과 dialog를 유지하도록 보호했다.
- Dashboard/Blog Beta browser smoke에 modal 차단과 정상 빠른 생성 진입 검증을 추가했다.
- browser smoke에서 제품이 이미 Settings Beta로 전환한 뒤에도 숨겨진 legacy Settings 화면을 기다리는 기존 후속 검증을 발견했다. 이번 branch 범위 밖의 테스트 경로는 변경하지 않았다.

## Verification

- `node --test scripts/dashboard-beta-shell-contract.test.js`: 12 passed
- `npm run test:ui-blog-auto`: passed
- `npm run test:ui-e2e`: passed (sandbox 외부 로컬 포트 허용 후 재실행)
- `npm run test:ui-browser`: 새 modal 차단과 정상 빠른 생성 진입 구간은 통과했지만, 이후 기존 legacy Settings 대기(`view-settings`)에서 timeout. 현재 제품 계약은 `settings` 요청을 Settings Beta로 redirect하므로 별도 test-debt다.
- `npm run test:unit`: 1,887 tests, 1,886 passed, 1 Windows-only skip, 0 failed
- Pending: user hands-on confirmation

## Final Result

`CmdOrCtrl+N`이 Electron의 `새 글 작성` 메뉴와 연결되며, 메뉴 클릭과 단축키 모두 동일한 Blog Beta 빠른 생성 진입 경로를 사용한다. 열린 modal transaction은 보존되고, 기존 설정 미저장 확인 및 제목 입력 포커스 동작도 유지된다.

## Remaining Risks / Manual Checks

- macOS `Cmd+N`과 Windows/Linux `Ctrl+N` 메뉴 표시 및 실제 동작
- 일반 입력란 포커스 상태에서 빠른 생성으로 이동하고 제목 입력란에 포커스되는지 확인
- 설정 미저장 확인에서 취소하면 현재 화면이 유지되는지 확인
- 열린 modal/dialog 중 shortcut이 배경 navigation을 일으키지 않는지 확인
- browser smoke의 retired Settings 검증 경로를 별도 유지보수 작업에서 Settings Beta/Social 경로로 교체
