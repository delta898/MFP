# Release Blog Beta Common Execution Lock Development

## Branch

- Branch: `codex/release-blog-next-execution-lock`
- Base/parent: `codex/release-queue-schedule-visibility`
- Start date: 2026-09-02
- Status: Complete — user UI acceptance received, ready for parent merge

## User need and goal

Blog Beta의 빠른 바로 생성, 원고 폴더, 원고 붙여넣기, Queue 단건 실행과 자동 연속 발행이 서로 다른 화면과 API에서 시작된다. 한 작업이 실행 중일 때 다른 경로가 새 발행을 시작하면 중복 생성·발행, Topics 상태 경합과 사용량 처리 충돌이 생길 수 있다. Blog Beta 안에서는 어떤 진입점을 사용하더라도 한 번에 하나의 발행 작업만 실행되게 해야 한다.

## Scope

- Blog Beta의 실제 발행·생성 실행 진입점과 현재 단일 실행 보호 범위를 조사한다.
- 빠른 바로 생성, 원고 폴더, 원고 붙여넣기, Queue runner와 자동·30초 시험 실행을 하나의 서버 권위 실행 잠금으로 조정한다.
- 실행 중 다른 시작 요청은 외부 작업 전에 안정적인 `409` 응답으로 거부한다.
- 공통 실행 상태를 Blog Beta의 관련 실행 버튼과 연결해 중복 클릭과 교차 화면 실행을 막는다.
- 성공, 실패와 예외 모두에서 잠금이 해제되고 다음 실행이 가능함을 자동 테스트한다.

## Non-goals

- 기존 블로그, 쇼핑커넥트, SNS까지 묶는 앱 전체 실행 조정자는 만들지 않는다.
- 여러 앱 인스턴스나 여러 기기 사이의 분산 잠금은 추가하지 않는다.
- 수동 실행 때문에 기존 연속 발행 스케줄을 취소하거나 다시 계산하지 않는다.
- 완료 이력이나 세부 작업 로그 화면을 새로 만들지 않는다.

## Proposed design

- UI 상태가 아니라 서버의 Blog Beta 실행 경계가 잠금의 source of truth가 된다.
- 각 실행 API가 독립 boolean을 갖지 않고 공통 coordinator의 acquire/release 계약을 사용한다.
- 잠금은 작업 identity, 시작 경로와 공개 가능한 진행 요약만 보유하며 요청 payload나 원고를 저장하지 않는다.
- Queue runner의 현재 row 표시와 완료 후 목록 갱신은 유지하고, 공통 잠금은 교차 진입점의 실행 허용 여부만 조정한다.
- UI는 공통 상태 조회를 재사용해 관련 시작 버튼을 비활성화하되, 서버 거부를 최종 안전장치로 유지한다.

## Implementation stages

1. 실행 진입점, 서비스 수명과 현재 runner/UI 상태 계약을 조사한다.
2. 공통 coordinator 계약과 단위 테스트를 추가한다.
3. Blog Beta 실행 경로를 coordinator에 연결하고 실패 시 해제를 검증한다.
4. 관련 UI 트리거 상태와 브라우저 회귀 테스트를 보완한다.

## Decisions and tradeoffs

- 잠금 범위는 이번 릴리스의 새 Blog Beta에 한정해 기존 제품 흐름의 회귀 위험을 줄인다.
- 같은 프로세스 안의 중복 실행을 막는 in-memory single-flight를 우선 사용한다. 다중 기기 분산 잠금은 별도 데이터 소유권과 복구 정책이 필요하므로 범위에서 제외한다.
- 설정 저장이나 목록 조회처럼 실행 대상을 바꾸지 않는 동작은 잠그지 않는다.
- 조사 결과 Beta의 바로 생성과 자동·시험 실행은 모두 continuous runner를 사용하고, 별도 경로는 원고 폴더/붙여넣기의 `local-markdown/publish` 한 종류였다. 따라서 legacy composition root에서 두 서비스에 같은 coordinator를 주입하는 경계를 선택했다.
- legacy 빠른 블로그, 쇼핑커넥트와 SNS 실행에는 coordinator를 주입하지 않아 합의한 Beta 범위를 유지한다.

## Progress and verification

- 2026-09-02: Queue 실행 상태 UX 하위 FB를 부모에 병합하고 사용자와 다음 단계로 Blog Beta 공통 실행 잠금을 진행하기로 합의했다.
- 2026-09-02: bounded public status만 노출하는 in-memory coordinator와 단위 테스트를 추가했다.
- 2026-09-02: continuous runner와 local Markdown publish가 composition root의 같은 coordinator lease를 acquire/release하도록 연결했다. 원고 실행 중 Queue 변경·추가 실행과 반대 방향의 교차 실행은 외부 작업 전에 거부된다.
- 2026-09-02: 원고 폴더/붙여넣기 실행도 공통 상단 진행 상태를 사용하고, 실행 중 두 원고 버튼과 Queue 실행 동작을 함께 비활성화하도록 UI 상태를 연결했다.
- 2026-09-02: Preview와 runner가 버튼 상태를 서로 덮어쓰던 경합을 하나의 동기화 함수로 통합했다. 브라우저 fixture도 원고 발행 중 공통 runner 상태를 반환하도록 맞춰 교차 화면 잠금을 검증했다.
- 2026-09-02: 빠른 글 작성 결과 옆 `상태 보기`는 상단 진행 패널에 실제 실행 중 상태가 있을 때만 표시한다. 완료·실패·대기 상태나 패널을 닫은 뒤에는 볼 대상이 없으므로 숨긴다.
- 2026-09-02: 연속 발행 설정은 서버에서 읽은 저장 스냅샷과 현재 폼을 비교해 실제 변경이 있을 때만 `설정 저장`을 활성화한다. 미저장 상태에서 Blog Beta의 다른 탭이나 앱의 다른 메뉴로 이동하거나 창을 닫을 때 변경사항 유실을 안내한다.
- 2026-09-02: `설정 저장`의 disabled 속성은 정상 적용됐지만 공통 primary hover가 남아 활성 버튼처럼 보이는 문제를 확인했다. 비활성 전용 색상·커서·opacity를 적용하고 hover 이동·그림자를 제거했다.
- 집중 단위·계약 테스트: `node --test src/blog-next/execution-coordinator.test.js src/ui-api/services/content.service.blog-next-execution.test.js src/ui-api/services/continuous-publishing.service.test.js scripts/continuous-publishing-shell-contract.test.js` — 45 passed.
- 브라우저 회귀 테스트: `npm run test:ui-browser` — passed, 124 fixture requests.
- 설정 변경 감지·이탈 확인 및 비활성 시각 상태 보완 후 브라우저 회귀 테스트: `npm run test:ui-browser` — passed, 126 fixture requests.
- 전체 단위 테스트: `npm run test:unit` — 1224 passed.
- 병합 직전 전체 단위 테스트 재실행: `npm run test:unit` — 1224 passed.

## Remaining risks and manual checks

- 여러 앱 인스턴스나 기기에서 동시에 실행하는 경우는 in-memory 잠금 범위 밖이다.
- 화면 전환 직후 poll 전까지는 짧은 표시 지연이 있을 수 있지만, 서버 coordinator가 중복 외부 작업을 최종 차단한다.
- 사용자가 원고 실행 중 교차 화면 잠금, 완료 후 재활성화, 설정 저장 변경 감지와 이탈 안내를 수동 확인했다.
- 유료 AI나 실제 발행은 자동 테스트에서 호출하지 않았다.
