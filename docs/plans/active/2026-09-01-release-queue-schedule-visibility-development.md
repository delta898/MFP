# Release Queue Schedule Visibility Development

## Branch

- Branch: `codex/release-queue-schedule-visibility`
- Base/parent: `release/v0.4.0`
- Start date: 2026-09-01
- Status: Parent integration branch in progress

## User need and goal

연속 발행을 켠 사용자가 발행 대기열을 보면서 각 글감이 언제 처리될지 파악할 수 있어야 한다. 자동 또는 수동 처리가 끝난 뒤에는 이미 처리된 글감이 열린 대기열에 계속 남아 있지 않도록 목록이 갱신되어야 한다.

## Scope

- 현재 자동화 스케줄과 대기열 순서를 기준으로 각 준비 글감의 처리 예상 시간을 제공한다.
- 대기열 UI에 처리 예상 시간을 기존 보조 정보 계층으로 표시한다.
- 자동 또는 수동 runner 완료를 감지하면 열린 대기열을 갱신한다.
- 순서 변경, 수동 처리 완료, 자동 처리 완료 후 예상 시간을 다시 계산한다.
- 관련 도메인, API, UI 계약과 브라우저 회귀 테스트를 보완한다.

## Non-goals

- 수동 실행 때문에 기존 자동 타이머를 취소하거나 다시 계산하지 않는다.
- 완료 이력 화면을 새로 만들지 않는다.
- 여러 기기 사이의 분산 실행 잠금은 추가하지 않는다.
- 글감별 고정 예약 시각을 저장하지 않는다.

## Proposed design

- 자동화 설정 API가 가진 `next_run_at`과 허용 시간대/간격 계산을 대기열 예상 시간의 기준으로 사용한다.
- 첫 준비 글감은 현재 다음 자동 실행 시각, 이후 글감은 동일한 허용 시간대 규칙을 적용한 순차 예상 시각을 받는다.
- 예상 시간은 글감에 고정된 예약이 아니라 현재 순서 기준의 파생 정보다.
- UI는 이를 `처리 예상`으로 표현해 실제 공개 시각이나 예약 포스팅 시각과 구분한다.
- runner 상태의 완료 식별자가 바뀌면 대기열을 다시 불러와 성공 항목 제거와 다음 예상 시간 이동을 반영한다.

## Stages and sub-feature records

- 완료: 현재 순서 기준 처리 예상 시간과 runner 완료 후 목록 갱신 기반.
- 완료: Queue 실행 상태 UX — `../archive/2026-09-02-release-queue-running-state-ux-development.md`.
- 완료: Blog Beta 공통 실행 잠금과 연속 발행 설정 변경 보호 — `../archive/2026-09-02-release-blog-next-execution-lock-development.md`.
- 완료: 전역 연속 발행 상태 — `../archive/2026-09-02-release-global-publishing-status-development.md`.
- 완료: Dashboard 사용 준비 상태 — `../archive/2026-09-02-release-dashboard-readiness-status-development.md`.

## Decisions and tradeoffs

- 수동 `지금 실행`은 자동 스케줄의 예외 실행이다. 성공 후에도 기존 자동 실행 시각은 유지하며 다음 준비 글감이 그 시각을 이어받는다.
- 처리 시간은 실행 소요 시간에 따라 밀릴 수 있으므로 글감별 영구 예약 데이터로 취급하지 않는다.
- 대기열 전체를 고빈도로 다시 읽지 않고 runner 상태 변화를 기준으로 필요한 시점에 갱신한다.

## Progress and verification

- 2026-09-01: 사용자와 범위 및 수동 실행 시 자동 타이머 유지 원칙을 합의했다.
- 2026-09-01: 허용 시간대와 발행 간격을 재사용하는 순서 기반 처리 예상 시간 계산을 추가했다.
- 2026-09-01: 대기열 API가 자동화 상태와 글감별 `processing_estimate_at`을 반환하고, UI가 첫 글은 `다음 처리`, 이후 글은 `처리 예상 … 이후`로 표시하게 했다.
- 2026-09-01: 글감 관리 탭에서 runner 완료 시각 변화를 감시하고 완료 후 대기열을 다시 읽도록 했다. 수동 실행은 scheduler를 갱신하지 않는다.
- 2026-09-02: Queue 실행 상태 하위 단계에서 실행 row 표시, 완료 후 제거, 실행 중 수정·이동·제외·추가 실행과 30초 시험 실행 차단을 구현하고 사용자 UI 검토를 통과했다.
- 2026-09-02: 공통 실행 잠금 하위 단계에서 continuous runner와 원고 폴더/붙여넣기를 같은 서버 coordinator로 묶고 교차 화면 중복 실행을 차단했다.
- 2026-09-02: 연속 발행 설정 저장 버튼의 변경 감지와 미저장 이탈 안내까지 사용자 검토를 마치고 하위 단계를 완료했다.
- 단위 테스트: `node --test src/continuous-publishing/automation-settings.test.js src/ui-api/services/continuous-publishing.service.test.js` — 30 passed.
- UI 계약 테스트: `node --test scripts/continuous-publishing-shell-contract.test.js` — 14 passed.
- 브라우저 회귀 테스트: `npm run test:ui-browser` — passed, 117 fixture requests.
- Queue 실행 상태 하위 단계 브라우저 회귀: `npm run test:ui-browser` — passed, 121 fixture requests.
- 부모 병합 전 전체 단위 테스트: `npm run test:unit` — 1217 passed.
- 공통 실행 잠금 브라우저 회귀: `npm run test:ui-browser` — passed, 124 fixture requests.
- 공통 실행 잠금 전체 단위 테스트: `npm run test:unit` — 1224 passed.

## Remaining risks and manual checks

- 여러 앱 인스턴스가 같은 대기열을 동시에 처리하는 경우는 이번 범위의 보호 대상이 아니다.
- 최종 글꼴, 간격, 긴 제목에서의 배치는 사용자 UI 검토가 필요하다.
