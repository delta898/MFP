# Card News 메뉴 계층 통일 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-06-05-navigation-hierarchy`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · parent merge 준비 완료

## 사용자 필요와 목표

Card News의 `새 카드뉴스 / 만든 카드뉴스`와 각 화면 안의 하위 선택 메뉴가 Blog Beta·설정 Beta에서 정한
top menu / sub-menu 계층과 다르게 보이는 문제를 바로잡는다. 같은 위상의 메뉴는 같은 공통 component와
동일한 너비·선택·키보드 동작을 사용해야 한다.

## 범위

1. Card News workspace 전환을 공통 `ui-top-tabs / ui-top-tab`으로 변경
2. 내용 입력 방식과 만든 카드뉴스 상태 필터를 공통 `ui-segmented-tabs / ui-segmented-tab` 하위 메뉴로 유지·검증
3. top/local menu의 ARIA tab 관계와 키보드 이동 보존
4. Card News 전용 top menu 크기 보정 제거
5. focused UI contract와 browser smoke 회귀 보강

## 명시적 비범위

- Card News 목록, 미리보기, 생성·발행 기능 변경
- 탭 명칭이나 정보 구조 변경
- Blog Beta·설정 Beta 자체의 메뉴 변경
- Card News parent를 design main에 merge

## 설계 원칙

- 화면 최상위 기능 전환은 `ui-top-tabs`, 선택 화면 내부 전환은 `ui-segmented-tabs`를 사용한다.
- feature CSS로 공통 메뉴의 너비·모양을 다시 정의하지 않는다.
- 기존 workspace와 source/filter 상태 및 event handler를 재사용하고 표현 component만 교정한다.
- 구현 중 focused test만 실행하며 browser 회귀와 전체 단위 테스트는 사용자 승인 뒤 실행한다.

## 조사·구현 결과

- `새 카드뉴스 / 만든 카드뉴스` workspace menu를 공통 `ui-top-tabs / ui-top-tab`으로 변경해 페이지 전체
  너비와 최상위 위상을 Blog Beta·설정 Beta와 맞췄다.
- `피드에서 선택 / URL 직접 입력 / 내용 직접 입력`에 있던 feature 전용 3등분·전체 너비 CSS를 제거해
  공통 segmented sub-menu가 콘텐츠 너비를 소유하게 했다.
- `만든 카드뉴스` 상태 menu의 compact density와 강제 flex 확장을 제거해 새 카드뉴스의 sub-menu와 같은
  regular segmented 규격을 사용하게 했다.
- 피드 플랫폼 선택은 sub-menu 아래의 세부 필터이므로 compact density를 유지했다.
- top/local menu의 기존 ARIA 관계, tab 상태와 키보드 event handler는 변경하지 않았다.
- focused contract와 browser smoke에 top menu 전체 너비, local menu 콘텐츠 너비, 공통 class 사용 계약을
  추가했다.

## 검증과 남은 위험

- `node --test scripts/card-news-shell-contract.test.js`: 14개 통과
- `node --check scripts/test-ui-browser-smoke.js`: 통과
- `git diff --check`: 통과
- 첫 browser smoke에서 media action의 top 좌표가 0.1875px 달랐지만 기존 검사가 각 좌표를 정수로 반올림해
  서로 다른 행으로 오판했다. 실제 action bar는 `nowrap` 한 줄이었다. 같은 행 판정을 1px 이내 허용으로
  고쳐 sub-pixel 렌더링 차이를 실제 줄바꿈과 구분했다.
- `npm run test:ui-browser`: 통과 (249 fixture requests)
- `npm run test:unit`: 1,599개 통과, 실패 0개, 기존 Windows bootstrap 1개 skip
- 최종 메뉴 간격과 좁은 화면의 줄바꿈은 사용자 수동 확인이 필요하다.
