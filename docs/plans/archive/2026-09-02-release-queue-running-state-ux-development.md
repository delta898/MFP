# Release Queue Running State UX Development

## Branch

- Branch: `codex/release-queue-running-state-ux`
- Base/parent: `codex/release-queue-schedule-visibility`
- Start date: 2026-09-02
- Status: Completed — user UI review passed

## User need and goal

공통 발행 상태가 화면 위쪽에만 표시되어 실제로 어떤 대기열 글감이 실행 중인지 목록에서 알기 어렵다. `상태 보기`가 빠른 글 작성 외의 위치에도 반복 노출되고 기본 버튼처럼 보여 화면 완성도를 떨어뜨린다. 실행 중에는 같은 대기열을 변경하거나 추가 실행하지 못하게 해 현재 처리 대상과 Queue 상태를 안정적으로 유지해야 한다.

## Scope

- `상태 보기`는 빠른 글 작성의 바로 생성 결과 안내 옆에서만 제공한다.
- Queue 상단의 중복 링크를 제거하고 Queue 편집 모달에서는 재사용된 링크를 숨긴다.
- 실행 중인 row를 runner `rowIndex`, 상태와 진행 메시지에 연결해 spinner와 처리 중 문구를 표시한다.
- 실행 중에는 Queue의 수정, 위·아래 이동, 빼기와 `지금 실행`을 비활성화한다.
- runner 성공이 확인될 때까지 row를 유지하고, 완료 후 기존 목록 갱신으로 제거한다.
- 성공하기 전에는 UI가 row를 선제 제거하지 않고, 완료 후 서버 Queue 결과를 기준으로 갱신한다.

## Non-goals

- 원고 폴더·붙여넣기 등 서로 다른 Blog Beta 실행 경로를 서버 공통 잠금으로 묶지 않는다.
- 기존 블로그, 쇼핑커넥트와 SNS까지 포함하는 앱 전체 실행 조정자는 추가하지 않는다.
- 완료 이력 화면이나 세부 단계 로그를 새로 만들지 않는다.

## Proposed design

- 공통 runner 상태가 갱신될 때 Queue DOM의 row identity와 `rowIndex`를 비교해 현재 실행 row만 표현을 바꾼다.
- row의 기존 대상·공개 방식 정보는 유지하고, 자동 처리 예상 시간 대신 현재 진행 문구를 우선 표시한다.
- Queue action 잠금은 공통 runner 활성 상태를 단일 기준으로 사용한다. 단순 CSS가 아니라 실제 `disabled`와 `aria-busy`를 동기화한다.
- Queue row는 성공 완료 이벤트 뒤 서버에서 READY 목록을 다시 읽은 결과로 제거한다.

## Decisions and tradeoffs

- 작은 spinner와 명시적인 `처리 중` 텍스트를 함께 사용하고 과도한 애니메이션은 피한다.
- 실행 중에는 현재 row뿐 아니라 전체 Queue 변경 동작을 잠근다. 다른 row 이동이 실행 대상의 Sheet row identity에 영향을 줄 수 있기 때문이다.
- 빠른 글 작성 결과 옆의 상태 이동은 버튼보다 작은 텍스트 링크 계층으로 표현한다.

## Progress and verification

- 2026-09-02: 사용자와 단계 분리 및 Queue 실행 상태 UX 범위를 합의했다.
- 2026-09-02: Queue 상단의 중복 `상태 보기`를 제거하고 빠른 글 작성 결과 옆의 동작을 작은 텍스트 링크로 정리했다. 재사용 폼이 편집 모달로 이동한 경우에는 링크를 숨긴다.
- 2026-09-02: runner가 활성화한 Sheet row를 READY 목록에서 제외된 뒤에도 Queue 응답에 실행 row로 포함해 새로고침·재진입 시 진행 대상이 사라지지 않게 했다.
- 2026-09-02: 실행 row에 spinner, 현재 진행 문구와 `aria-busy`를 연결하고 실행 중 Queue 수정·이동·빼기·추가 실행을 비활성화했다. 30초 테스트도 같은 runner 활성 상태를 따른다.
- 2026-09-02: 실제 앱 검토에서 이동 버튼 외 동작은 비활성 상태가 시각적으로 충분히 드러나지 않고, 일부 차단이 UI `disabled`에만 의존하는 문제가 확인됐다. 모든 Queue 동작과 30초 테스트에 실행 중 서버 거부를 추가하고, UI 이벤트 경합 방지와 공통 비활성 스타일을 보강하는 중이다.
- 2026-09-02: Queue 수정·이동·빼기·지금 실행과 30초 테스트를 UI 이벤트, DOM `disabled`, 서버의 runner lock에서 함께 차단했다. 모든 동작 버튼에 동일한 비활성 색·투명도·커서를 적용해 실제 사용 가능 여부가 화면에서도 분명하게 보이도록 보정했다.
- 2026-09-02: 사용자가 실제 Development 30초 실행으로 진행 row, Queue 잠금과 시험 실행 비활성화를 확인하고 이 단계를 승인했다.
- 집중 테스트: `node --test src/ui-api/services/continuous-publishing.service.test.js scripts/continuous-publishing-shell-contract.test.js` — 38 passed. 실행 중 Queue 변경과 30초 테스트 API 거부를 포함한다.
- 브라우저 회귀 테스트: `npm run test:ui-browser` — passed, 121 fixture requests. 실행 row의 수정·전체 action·30초 테스트가 실제로 disabled이며 비활성 스타일이 적용되는지 포함한다.

## Final result and remaining risks

- 자동 실행 시작과 UI의 다음 상태 poll 사이에는 짧은 지연이 있을 수 있다.
- spinner와 실행 중 비활성 표현은 사용자 UI 검토를 통과했다.
- Blog Beta의 다른 직접 실행 경로와의 서버 공통 잠금은 다음 하위 FB에서 다룬다.
