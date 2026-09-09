# Dashboard 공통 Foundation 개발 기록

## Branch

- Branch: `codex/feature/design-system-dashboard-09-01-foundation`
- Base/parent branch: `codex/feature/design-system-dashboard-09`
- Start date: 2026-09-09
- Status: 완료

## 사용자 필요와 목표

Dashboard를 Settings Beta의 form card로 복제하지 않으면서 같은 디자인 시스템을 사용하게 한다. Dashboard 전용 CSS에
중복된 surface, heading, status, summary와 action 표현을 범용 pattern으로 분리하고 이후 slice가 이를 조합하게 한다.

## 범위

1. Dashboard Beta를 현재 product style scope에 연결
2. 범용 overview surface·heading·status pattern 정의
3. Dashboard page shell이 공통 pattern을 소비하도록 최소 구조 변경
4. CSS composition, style contract와 Dashboard shell focused 검증

## 명시적 비범위

- readiness 데이터와 navigation 변경
- 발행 흐름·연속 발행 카드 내용 재배치
- 통계, 대기열, 추천과 supporting content 개편
- backend API 또는 runtime 동작 변경

## 설계 결정

- `.ui-settings-card`는 설정 form 전용으로 유지한다.
- Dashboard가 재사용할 component는 `.ui-overview-card`, `.ui-overview-heading`, `.ui-status-badge`처럼 목적 중립 이름을 쓴다.
- 공통 pattern은 semantic style token만 사용하며 Dashboard stylesheet는 grid와 고유 content layout만 소유한다.

## 구현 결과

- Dashboard Beta의 compatibility scope를 제거해 현재 제품 style을 직접 사용하게 했다.
- read/decision surface용 `.ui-overview-card`, `.ui-overview-heading`, `.ui-overview-eyebrow`, `.ui-status-badge`를
  공통 pattern으로 추가했다.
- Dashboard 카드의 중복 border·radius·background·shadow, heading typography, status badge와 refresh icon 표현을
  제거하고 공통 pattern을 사용하게 했다.
- Dashboard 상단 title 영역의 compatibility 전용 파란 장식을 제거해 Settings Beta와 같은 page shell hierarchy로 맞췄다.
- onboarding 강조는 공통 surface 위에 semantic action/status token만 사용하는 Dashboard 고유 상태로 유지했다.
- 공통 overview card와 settings form card의 역할 차이를 design component guide에 기록했다.
- 사용자 시각 검토에서 발견된 compatibility blue 잔존을 반영해 Dashboard, recommendation center, quick recommendation과
  supporting content의 고정 색상·shadow·radius를 제거하고 semantic/component token으로 이관했다.
- 단순 수치는 neutral surface/count badge로 통일하고, 기간 선택은 공통 segmented tab, 전체 목록·가이드 이동은
  공통 text action을 사용하게 했다. 조회·설정·작업 진행 action의 위계도 canonical guide에 추가했다.
- 현재 기본 style만 재현하지 않도록 Dashboard 공통 pattern과 feature CSS가 `warm-editorial` 및
  `quiet-sage-studio` token을 그대로 소비하는 계약 검사를 추가했다.
- 발행 성과의 기간 선택값을 `오늘 결과`처럼 상세 제목에 중복하던 구조를 정적 `요약 / 발행 내역`으로 정리하고,
  양쪽 제목의 typography와 간격을 공통 `.ui-overview-subheading` pattern으로 이관했다.
- 활성 Dashboard Beta와 공유 recommendation center를 전수 조사해 고정 색상·style 분기·legacy token뿐 아니라 고정
  typography와 공통 spacing 우회도 제거했다. 차트 bar의 세밀한 간격, responsive breakpoint와 최소 조작 크기처럼
  기능상 불변인 geometry는 style hard-coding과 구분해 feature/component 책임으로 유지했다.
- 발행 흐름 본문의 원형 상태 indicator는 header의 공통 status badge와 같은 상태를 중복하므로 DOM, controller와
  전용 CSS/animation에서 모두 제거했다.
- 발행 성과의 세 기간이 같은 trend renderer를 사용하도록 결과 통계 계약을 `trend_unit + trend_series`로 일반화했다.
  오늘은 KST 자정부터 현재 시간대까지 시간별, 이번 주와 최근 30일은 일별 bucket을 제공한다. 아직 오지 않은 오늘의
  시간은 0건으로 만들지 않으며, UI는 오늘 시간 label을 3시간 간격으로 간추려 표시한다. label 유무 때문에 0건 막대의
  baseline이 달라지지 않도록 모든 bucket에 같은 axis label slot을 예약하고, 30일은 첫날·7일 간격·마지막 날의
  일자만 표시한다. 전체 월·일은 hover·접근성 label에 유지한다.

## 검증

- Dashboard result read model/service와 shell/design/CSS focused tests: 78개 통과
- 고정 색상·style 분기·legacy alias 재유입 방지 계약: 통과
- 고정 typography와 중복 flow indicator 재유입 방지 계약: 통과
- Browser UI smoke: 통과 (최종 fixture request 261건, 오늘 11개 시간 bucket ↔ 주간 7개 일 bucket 전환,
  모든 시간 bucket의 동일 baseline과 30일 날짜 label 5개 확인 포함)
- Full unit suite: 1,572개 중 1,571개 통과, 실패 0개, 플랫폼 조건부 1개 skip
- Browser에서 `warm-editorial`과 `quiet-sage-studio`를 전환해 card radius·shadow와 neutral count 표현이
  각 style token에 따라 달라지는 것을 확인
- 사용자 시각 확인: 완료
- Dashboard Beta product surface 전수 점검: 완료. 숨겨진 legacy Dashboard의 compatibility CSS는 현재 제품
  surface와 분리된 폐기 대상이므로 이번 style 계약에 포함하지 않았다.

## 남은 범위

- readiness 정보 구조와 navigation은 다음 slice에서 정리한다.
- 발행 흐름, 결과, 대기열·추천 content는 각각 후속 slice에서 공통 pattern 위에 재배치한다.
- 현재 slice 결과는 필수 full unit gate를 통과했으며 parent Dashboard branch에 통합한다.
