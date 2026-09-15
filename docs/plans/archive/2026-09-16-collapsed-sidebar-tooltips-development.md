# Collapsed Sidebar Tooltips

- Branch: `codex/feat/collapsed-sidebar-tooltips`
- Base/parent branch: `release/v0.5.0`
- Start date: 2026-09-16
- Status: Ready to merge (manual visual acceptance pending)

## User need and goal

왼쪽 sidebar를 접으면 아이콘만 남아 메뉴를 구분하기 어렵다. 접힌 desktop 상태에서만 아이콘에 hover하면 메뉴 이름을
tooltip으로 보여 주고, 펼친 상태에서는 텍스트가 이미 보이므로 tooltip을 만들지 않는다.

## Scope

- 모든 static·dynamic sidebar navigation item의 메뉴 이름을 동일하게 처리한다.
- collapsed desktop 상태에서만 표준 tooltip을 활성화한다.
- visible label이 숨겨져도 navigation item의 접근성 이름은 유지한다.

## Non-goals

- navigation 순서와 mobile drawer 동작을 바꾸지 않는다.
- 별도의 시각 tooltip component나 스타일별 tooltip skin을 추가하지 않는다.

## Design

- native `title`은 Electron/WebView에서 hover 표시가 일관되지 않아 사용하지 않는다. tooltip element를 `body`에
  portal로 만들고 fixed position으로 배치해 sidebar의 overflow·scroll container에도 잘리지 않게 한다.
- label text를 canonical source로 사용해 `aria-label`도 동기화한다.
- sidebar 토글·viewport resize·dynamic sidebar item refresh 시마다 tooltip 상태를 다시 계산한다.
- 수동 UI 검토에서 펼친 desktop sidebar의 260px 폭이 메뉴명 대비 넓다는 의견이 나왔다. 동적 메뉴인
  `개발자 응원하기`를 포함한 가장 긴 현재 메뉴명과 로고·접기 버튼을 충분히 보장하는 224px로 줄인다. collapsed
  80px와 mobile drawer 280px는 유지한다.

## Verification plan

- sidebar markup/lifecycle focused contract와 browser smoke에서 collapsed/expanded/mobile 상태를 확인한다.
- review slice 완료 뒤 browser smoke를 실행한다.

## Result and verification

- sidebar label을 단일 source로 사용해 collapsed desktop에서만 portal tooltip과 `aria-label`을 동기화했다.
- static menu, runtime dynamic sidebar link, initial restore, sidebar toggle, viewport resize를 모두 같은 sync path로 처리했다.
- focused sidebar/UI shell contract 9개와 browser smoke를 통과했다.
- 수동 테스트에서 Electron/WebView가 native `title` tooltip을 표시하지 않는 문제가 확인돼, 앱 내 fixed overlay tooltip으로
  교체했다. 교체 후 browser smoke에서 실제 hover tooltip 텍스트가 보이는 것을 검증했다.
- desktop 펼침 폭을 224px로 줄였고, browser smoke에서 동적으로 만든 `개발자 응원하기` 메뉴 label의 실제 폭이
  잘리지 않는 것을 확인했다.
- 전체 단위 테스트 1,834개 중 1,833개가 통과했고, Windows bootstrap 환경 전용 1개는 기존 skip으로 유지됐다.

## Manual checks still required

- desktop에서 sidebar를 접고 각 아이콘 위에 hover해 메뉴 이름이 자연스럽게 보이는지 확인한다.
- sidebar를 다시 펼치거나 창 폭을 mobile로 줄였을 때 tooltip이 남지 않는지 확인한다.
