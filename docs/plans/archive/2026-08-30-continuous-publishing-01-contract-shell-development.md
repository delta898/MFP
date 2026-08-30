# 연속 발행 Stage 1 — 계약과 독립 화면 골격

## 브랜치 정보

- branch: `feature/continuous-publishing-01-contract-shell`
- 시작일: 2026-08-30
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 완료·사용자 승인

## 사용자 필요와 목표

기존 `블로그` 메뉴의 동작과 DOM을 건드리지 않고 새 연속 발행 경험을 개발할 독립 경계를 만든다.
사용자에게는 임시 `블로그 Beta` 메뉴와 `빠른 글 작성 / 발행 대기열 / 연속 발행 설정` 구조를
보여주고, 이후 vertical slice가 같은 계약 위에서 확장되게 한다.

## 범위

- 사이드바 `블로그 Beta` 메뉴와 독립 view partial
- 새 view 전용 CSS namespace와 JavaScript feature module
- 빠른 글 작성의 세 입력 방식 존재를 드러내는 shell
- Topics 상태와 발행 설정 소유권의 canonical 계약
- 새 구조가 기존 블로그 화면과 섞이지 않는 구조·브라우저 smoke test
- 문서 index와 backlog 현행화

## 비목표

- Topics Sheet 읽기·쓰기
- AI 원고 생성과 preview
- 실제 Naver/WordPress 발행
- 연속 발행 timer 또는 Queue consumer
- 기존 `블로그` 메뉴의 HTML·JavaScript 변경

## 제안 설계

- 새 DOM id와 CSS class는 `blog-next-*` prefix를 사용한다.
- 새 JavaScript는 `ui/scripts/features/blog-next/` 아래에서 관리한다.
- view 로더와 sidebar routing의 공용 확장 지점만 최소 변경한다.
- 사용자 표시 이름은 `블로그 Beta`, 내부 route/view 이름은 `blog-next`를 사용한다.
- Stage 1 shell에는 실행 가능한 것처럼 보이는 가짜 버튼을 만들지 않고 다음 단계에서 제공될 기능을 명확히 표시한다.

## 상태 계약

```text
대기
  → 발행 준비 완료
  → 발행 중
  → 발행 완료 | 임시 저장 완료 | 예약 포스팅 등록 완료
  → 실패 | 확인 필요
```

- `대기`: 글감은 저장됐지만 자동 실행 계약이 완성되지 않았다.
- `발행 준비 완료`: 원고 생성 완료가 아니라 글감과 발행 계획이 유효하다.
- `발행 중`: 한 실행기가 해당 행을 처리하고 있다.
- terminal 상태는 대상별 결과를 요약하되 부분 성공 정보는 별도 실행 결과에 보존한다.

## 설정 소유권 계약

- 글감 소유: platforms, platform categories, writing strategy, image mode, external reference, post status, schedule date
- 연속 발행 소유: enabled, allowed time window, interval, notification
- 연속 발행기는 글감 소유 값을 덮어쓰지 않는다.

## 진행 기록

- 2026-08-30: parent와 Stage 1 브랜치를 만들고 문서부터 시작했다.
- 2026-08-30: `blog-next-*` namespace의 독립 sidebar view와 세 기능 탭 shell을 추가했다.
- 2026-08-30: 빠른 글 작성의 `바로 생성 / 원고 폴더 / 원고 붙여넣기` 입력 모드 shell을 추가했다.
- 2026-08-30: topic과 automation 설정 소유권 및 상태 의미를 코드 계약으로 추가했다.
- 2026-08-30: 새 shell은 API, AI와 발행 호출 없이 UI 전환만 수행하도록 제한했다.

## 검증 계획

- partial/view registry와 script include 구조 검사
- 기존 `블로그` route와 새 `blog-next` route의 DOM 격리 검사
- 브라우저 smoke에서 메뉴 이동과 세 탭 전환 확인
- 관련 구조 contract 및 전체 unit 회귀 확인

## 완료 결과

- sidebar에 기존 `블로그`와 분리된 `블로그 Beta` view를 추가했다.
- `빠른 글 작성 / 발행 대기열 / 연속 발행 설정` 탭과 세 입력 방식 shell이 독립적으로 전환된다.
- 새 JavaScript는 `blog-next-*` DOM만 제어하며 legacy blog controller, data API, AI와 발행 경로를 호출하지 않는다.
- Topics 상태와 topic/automation 설정 소유권을 `src/continuous-publishing/contract.js`로 고정했다.
- canonical 기능 계약을 `docs/features/continuous-publishing.md`에 기록하고 backlog에 진행 항목을 추가했다.
- 모바일 quick mode에서는 아직 실행 기능이 없는 Beta 메뉴를 숨겨 기존 모바일 진입 흐름을 유지한다.

자동 검증:

- 연속 발행 계약·UI composition 집중 테스트 17개 통과
- browser UI smoke test 통과 (fixture request 56건)
- 전체 unit regression 1,140개 통과
- `git diff --check` 통과

## 수동 확인과 남은 위험

- 사용자가 Stage 1 결과를 승인했다. 실제 입력 필드가 연결되는 Stage 2에서 정보 밀도와 레이아웃을 다시 확인한다.
- Stage 1은 의도적으로 Topics, AI와 발행을 연결하지 않아 모든 panel이 안내 shell이다.
- 실제 필드와 Queue 목록이 들어오면 빈 상태 높이, 작은 화면 탭 배치와 정보 밀도를 다시 조정한다.
