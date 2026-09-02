# Release Dashboard Readiness Status Development

## Branch

- Branch: `codex/release-dashboard-readiness-status`
- Base/parent: `codex/release-queue-schedule-visibility`
- Start date: 2026-09-02
- Status: Complete — implementation and user UI review passed

## User need and goal

대시보드 상단의 Health, Naver, Plan, 버전 pill은 서로 다른 성격의 정보를 같은 모양과 강한 색으로 나열해 시각적으로 산만하고, 정상 Health와 중복 버전은 행동 가치가 낮다. 사용자는 실제 발행 준비 상태와 남은 사용량을 한눈에 보고, 조치가 필요한 항목에서 바로 설정 화면으로 이동할 수 있어야 한다.

## Scope

- 여러 색의 독립 pill을 하나의 정돈된 준비 상태 바로 교체한다.
- 네이버 로그인 상태와 선택 기능인 WordPress 설정 상태를 같은 발행 채널 영역에 표시한다.
- 남은 기본 사용량을 주 정보로, 플랜명을 보조 정보로 표시한다.
- Google Sheet 미설정과 서비스 상태 오류는 문제가 있을 때만 표시한다.
- 각 상태를 관련 설정 또는 계정 화면 이동과 연결한다.
- 대시보드의 정상 Health 및 버전 표시는 제거하되 Footer와 설정의 버전 표시는 유지한다.

## Non-goals

- WordPress에 매번 실제 접속 요청을 보내 연결 상태를 검증하지 않는다. 현재 계약이 제공하는 설정 여부를 정확히 표현한다.
- 계정, 설정 또는 업데이트 화면의 기존 상태 UI를 재설계하지 않는다.
- 새로운 서버 상태 저장소나 별도 API를 추가하지 않는다.
- 선택 기능인 WordPress 미사용을 오류나 경고로 취급하지 않는다.

## Proposed design

- 흰색 단일 container 안에 `발행 채널`과 `이용 가능` 두 정보 그룹을 배치한다.
- 발행 채널은 `네이버 로그인됨/로그인 필요`, `WordPress 설정됨/미사용`으로 표시한다.
- 사용량은 `기본 N회 남음`을 강조하고 Tester 등 플랜명은 작은 보조 텍스트로 둔다.
- Google Sheet 미설정은 `Google Sheet 설정 필요`, Health 실패는 `서비스 확인 필요`라는 예외 action으로만 나타낸다.
- 정상 상태는 차분한 색과 작은 점만 사용하고, 조치가 필요한 상태에만 주황/빨강을 사용한다.

## Implementation stages

1. 기존 account overview와 health 계약을 준비 상태 표현에 매핑한다.
2. Dashboard markup과 typography를 단일 readiness bar로 교체한다.
3. 상태별 표시와 관련 화면 이동을 연결한다.
4. 구조·브라우저 회귀를 보완하고 사용자 UI 검토 항목을 정리한다.

## Decisions and tradeoffs

- Health 정상은 앱이 이미 동작하는 상황에서 중복 정보이므로 숨기고 실패만 행동 가능한 예외로 노출한다.
- 버전은 Footer와 설정, 업데이트 가능 여부는 업데이트 배너가 담당하므로 Dashboard에서 제거한다.
- WordPress 상태는 live 연결 검증이 아닌 구성 값 존재 여부이므로 `연결됨` 대신 `설정됨`을 사용한다.
- WordPress 미설정은 선택하지 않은 정상 사용 방식이므로 `미사용` 중립 상태로 표현한다.

## Progress and verification

- 2026-09-02: 사용자와 단일 준비 상태 바, 정상 Health·버전 제거, 네이버·WordPress·사용량 중심 및 예외 상태 원칙에 합의했다.
- 2026-09-02: 기존 네 개의 pastel pill을 흰색 단일 readiness bar로 교체하고 발행 채널, 이용 가능, 예외 action으로 정보 위계를 나눴다.
- 2026-09-02: account overview의 네이버 세션, WordPress·Google Sheet 설정 상태와 라이선스 사용량을 재사용했다. WordPress 미설정은 중립적인 `미사용`, Google Sheet 미설정과 Health 실패만 action으로 표시한다.
- 2026-09-02: 네이버·WordPress는 블로그 설정, 사용량은 계정 및 구독, Google Sheet는 일반 설정, Health 오류는 로그 및 이력으로 이동하게 했다.
- 2026-09-02: 사용자가 실제 화면에서 정보 구조와 동작을 확인하고 부모 브랜치 병합 대상으로 승인했다.
- 구조·composition 테스트: `node --test scripts/view-header-contract.test.js scripts/ui-structure-contract.test.js scripts/ui-style-structure.test.js scripts/ui-script-structure.test.js` — 18 passed.
- 브라우저 회귀 테스트: `npm run test:ui-browser` — passed. 정상 Health와 Google Sheet 숨김, 네이버 로그인됨, WordPress 미사용, 기본 사용량·플랜 계층 및 WordPress 설정 이동을 포함한다.
- 부모 병합 전 전체 단위 테스트: `npm run test:unit` — 1229 passed.

## Remaining risks and manual checks

- 작은 창과 긴 플랜명에서 줄바꿈이 과도하지 않은지 확인해야 한다.
- 네이버 로그인 필요, WordPress 미사용, 사용량 0회와 Health 실패의 색상 위계가 과도하지 않은지 사용자 검토가 필요하다.
- WordPress는 설정 존재 여부만 제공하므로 실제 접속 가능 여부와 혼동되지 않는 문구를 유지해야 한다.
