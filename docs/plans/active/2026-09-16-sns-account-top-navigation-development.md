# SNS and Account Top Navigation Alignment

- Branch: `codex/fix/sns-account-top-navigation`
- Base/parent branch: `release/v0.5.0`
- Start date: 2026-09-16
- Status: Ready to merge (manual visual acceptance pending)

## User need and goal

SNS와 내 정보 화면이 다른 정식 화면과 달리 Top Menu가 없어 비어 보이고, 제목 아래 첫 surface의 border 시작 높이도
화면마다 달라 보인다. 두 화면의 실제 정보 구조를 공통 Top Menu 패턴으로 표현하고 첫 콘텐츠 시작선을 정렬한다.

## Scope

- SNS의 현재 작성 흐름에 맞는 최소 Top Menu를 제공한다.
- 내 정보의 실제 주요 섹션을 Top Menu로 탐색할 수 있게 한다.
- 두 화면의 title, Top Menu, 첫 콘텐츠 surface 사이 수직 리듬을 공통 패턴에 맞춘다.
- 키보드 tab 이동, `aria-controls`/`aria-selected`, 기존 데이터 로딩과 action을 보존한다.

## Non-goals

- SNS 발행 기능, Buffer 계약 또는 내 정보 데이터 모델을 변경하지 않는다.
- 단지 빈 공간을 채우기 위한 동작 없는 장식 tab은 만들지 않는다.
- 다른 화면의 전면적인 간격 재설계는 포함하지 않는다.

## Proposed stages

1. SNS·내 정보의 현재 section과 stylesheet ownership을 조사한다.
2. 기존 `ui-top-tabs`와 local navigation 계약을 재사용해 의미 있는 navigation을 구성한다.
3. 첫 콘텐츠 surface의 시작 위치와 responsive 동작을 정렬한다.
4. 정적 UI 계약과 browser smoke를 실행하고 수동 확인 항목을 기록한다.

## Decisions and tradeoffs

- 새로운 화면 전용 tab 스타일을 만들기보다 정식 화면들이 사용하는 공통 Top Menu를 우선 재사용한다.
- 한 화면에 실제로 분리 가능한 내용이 하나뿐이면 가짜 다중 tab 대신 현재 작업을 나타내는 단일 navigation을 허용한다.
- 사용자와 협의해 SNS는 `직접 작성`, 내 정보는 `이용 현황` 단일 tab으로 구성한다. 쇼핑커넥트의 현재 단일
  `빠른 글 작성` tab과 같은 패턴이며 기존 콘텐츠를 인위적으로 나누지 않는다.
- 단일 tab은 단순한 상태 표시에 머물지 않는다. tab 아래에 해당 작업의 큰 제목·짧은 설명을 둔 뒤 실제 form 또는
  정보 card를 시작한다. SNS는 `SNS 게시물 작성`, 내 정보는 `이용 현황`을 사용하고, 내 정보 첫 card의 중복
  eyebrow는 `현재 플랜`으로 바꾼다.

## Progress

- 두 화면에 `ui-top-tabs` 기반 단일 Top Menu와 연결된 `tabpanel` 접근성 관계를 추가했다.
- SNS에만 있던 title 하단 추가 margin과 내 정보의 top-level grid gap을 제거해 공통 title → Top Menu → content
  border 시작 리듬을 사용하도록 정렬했다.
- title 바로 다음 형제가 `ui-top-tabs`인 모든 정식 화면은 공통 tab navigation stylesheet가 동일한
  `--ui-density-page-gap`을 소유하도록 해 화면별 margin 보정을 없앴다.
- 초기 구현에서 SNS·내 정보의 tab 아래가 곧바로 세부 field 또는 plan card로 시작하는 차이가 확인됐다. 두 화면에
  공통 panel intro anatomy를 적용해 `큰 제목 → 설명 → 여백 → 실제 항목` 리듬으로 보정했다.
- 수동 확인에서 내 정보의 intro가 첫 card 밖에 놓여 SNS·쇼핑커넥트와 다시 달라 보이는 문제가 발견됐다. intro와
  `현재 플랜`을 하나의 summary surface로 묶고, 내부 항목은 separator로만 구분하도록 수정했다.

## Verification

- 집중 UI·density·기존 Top Menu 회귀 계약 45개 통과.
- 브라우저 smoke 369 fixture requests 통과. 단일 tab의 accessible panel 연결과 기존 SNS·내 정보 흐름을 확인했다.
- SNS와 내 정보 Top Menu 및 첫 content border의 좌측·수직 위치를 동일 viewport에서 비교하는 browser assertion을 추가했다.
- 최초 geometry assertion은 화면별로 보존된 scroll 위치까지 절대 좌표로 비교해 실패했다. 각 view 상단 기준 상대
  좌표를 비교하도록 교정해 실제 화면 내부 정렬 계약만 검증한다.
- panel intro의 browser 좌표는 글꼴 반올림으로 1px 차이가 날 수 있어, visual alignment assertion은 1px 이내로
  검증한다. focused contract 45개와 browser smoke를 재실행해 통과했다.
- summary surface 보정 후 관련 focused contract 14개와 browser smoke를 다시 통과했다.
- 병합 게이트의 전체 단위 테스트에서 기존 쇼핑커넥트 계약 하나가 실패했다. `release/v0.5.0`의 글감 관리 숨김 구현은
  `quick`만 허용하지만, 오래된 계약은 `quick + batch`를 요구하고 있었다. 제품 동작 변경 없이 계약 기대값을 현재
  단일 workflow 정책으로 정정한 뒤 전체 테스트를 재실행한다.
- 정정 후 전체 단위 테스트 1,831개 중 1,830개가 통과했고, Windows bootstrap 환경 전용 1개는 기존 skip으로 유지됐다.

## Manual checks still required

- 정식 style별 SNS·내 정보의 Top Menu, panel intro, 첫 실제 항목의 수평선 확인.
- 좁은 화면에서 tab label과 콘텐츠가 겹치거나 잘리지 않는지 확인.
