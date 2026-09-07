# Design Component and Pattern Guide v0.1

## 문서 상태

- Status: Design Principles v1.0 기반, Blog Beta 적용 기준 확장 중
- Source stage: `codex/feature/design-system-03-first-style`
- 적용 대상: 공통 shell과 `블로그 Beta`에서 검증된 반복 UI

이 문서는 style의 색상 취향이 아니라 component의 의미, 상태와 배치 계약을 정의한다. 구체적인 색상·radius·shadow 값은 각 style pack이 component token으로 공급한다.

## Action variants

### Primary

- 현재 맥락의 주된 완료 행동에 사용한다.
- 하나의 action group에는 원칙적으로 하나만 둔다.
- filled treatment를 사용할 수 있으며 loading 중 중복 실행을 막는다.

### Secondary

- primary를 보조하거나 다른 안전한 결과를 만드는 행동에 사용한다.
- primary와 같은 filled 강도로 경쟁하지 않는다.
- 기본 표현은 outline 또는 낮은 강조 surface다.
- `관심 없음`, 건너뛰기처럼 낮은 위험의 선호·dismiss feedback은 부정적인 문구만으로 danger로 분류하지 않고 neutral secondary 또는 tertiary로 표현한다.

### Tertiary / Ghost

- 닫기, 가벼운 이동, 낮은 빈도의 보조 행동에 사용한다.
- 투명 배경을 기본으로 하며 hover와 focus에서만 surface를 드러낼 수 있다.

### Danger

- 삭제, 초기화와 되돌리기 어려운 행동에 사용한다.
- 평상시 primary보다 강하게 보일 필요는 없지만 위험 의미를 숨기지 않는다.
- 대상과 영향을 확인해야 하는 행동은 실행 전 확인 흐름을 유지한다.

## Form action group

- 완료형 form과 dialog의 action group은 내용의 마지막에 둔다.
- desktop에서는 inline-end에 모으고 primary를 가장 끝에 둔다.
- 성격이 다른 danger action은 가능한 경우 반대쪽에 분리한다.
- DOM과 keyboard 순서는 시각적 진행 순서와 일치시킨다.
- 좁은 화면에서는 한 열로 쌓을 수 있으며 button 너비와 간격을 일관되게 유지한다.
- 상태 문구와 action이 함께 있을 때 상태를 가리거나 action 위치를 흔들지 않는다.

## Button states

- `default`: 역할별 배경·border·text 대비가 구분된다.
- `hover`: 색상 또는 낮은 elevation 변화로 반응하되 layout을 흔들지 않는다.
- `focus-visible`: style의 focus ring을 사용하며 outline을 대체할 때 동등 이상의 가시성을 제공한다.
- `disabled`: 실행할 수 없음을 opacity와 cursor로 함께 표시한다.
- `loading`: label 또는 진행 표시로 상태를 알리고 중복 실행을 막는다.
- reduced motion에서는 lift와 불필요한 transition을 제거한다.

## Refresh actions

- 작은 상태나 부분 데이터만 갱신할 때는 갱신 대상 바로 옆에 icon-only tertiary action을 둔다.
- 목록이나 panel 전체를 다시 불러올 때는 `새로고침`이라는 명시적인 secondary action을 사용한다.
- 조건을 적용해 새로운 결과를 요청하는 행동은 새로고침과 구분하고 `조회`, `검색`, `탐색`처럼 결과를 설명하는 primary label을 사용한다.
- icon-only action은 앱에서 같은 icon을 사용하고 접근 가능한 이름과 tooltip을 모두 제공한다. 갱신 대상이 모호하면 text action을 사용한다.
- 실행 중에는 진행 상태를 보여주고 `aria-busy`와 disabled 상태로 중복 실행을 막는다.

## Selection controls

- checkbox와 radio는 운영체제의 native control과 keyboard 동작을 유지한다.
- 선택 강조색은 browser 기본값에 맡기지 않고 현재 style의 primary action 색을 사용한다.
- checked, unchecked와 disabled를 색상만으로 구분하지 않으며 label과 native 상태를 함께 유지한다.
- status나 link를 위한 별도의 의미 색상을 선택 표시의 임의 accent로 사용하지 않는다.

## Cards and surfaces

- card는 실제 정보 그룹을 표현할 때만 사용한다.
- style은 card background, border, radius와 elevation을 바꿀 수 있다.
- 모든 card가 hover에서 떠오를 필요는 없다. 클릭 가능성이나 의미가 없으면 움직임을 사용하지 않는다.
- card 안에 같은 역할의 card를 반복해서 중첩하지 않는다.

## Embedded widgets

- timer, clock처럼 독립적인 내부 표현을 가진 widget도 제품 shell 안에서는 현재 style의 surface, border, radius, elevation과 기본 text를 따른다.
- 계절, 진행 단계나 집중·휴식처럼 widget 고유 의미가 있는 색은 점, 진행 표시, 짧은 상태 문구 등 국소적인 accent로 사용할 수 있다.
- widget 고유 accent가 외곽 card 전체를 지배하거나 primary action과 경쟁하지 않게 한다.
- style마다 widget DOM이나 기능을 분기하지 않는다.

## Discovery badges

- `new`처럼 새 기능의 발견을 돕는 badge는 상태 오류나 긴급 알림이 아니므로 animation이나 위험색을 사용하지 않는다.
- 비활성 navigation에서는 작은 filled primary badge로 일반 보조문구보다 분명하게 표현한다.
- 활성 navigation에서는 inverse badge로 전환해 active surface 위의 대비를 유지한다.
- badge는 메뉴 label을 대신하지 않으며, 접근 가능한 이름으로 의미를 전달한다.

## Fields and focus

- label, 입력값, hint와 validation의 typography 역할을 구분한다.
- field border와 focus ring은 canvas와 surface 모두에서 보여야 한다.
- error와 success는 색상 외에 문구 또는 상태 표시를 함께 사용한다.
- 입력 중이거나 실패한 요청 때문에 기존 사용자 값을 임의로 지우지 않는다.
- native date/time input의 닫힌 field는 현재 style의 focus token을 사용한다.
- 내부 picker trigger의 focus ring, 펼쳐진 popup의 색상과 선택 UI는 운영체제·브라우저 소유 영역으로 보고 style pack 예외로 허용한다. focus 위치는 가려서는 안 되며, 시각 통일만을 위해 custom picker로 재구현하지 않는다.

## Tab panels and content start

- 같은 수준의 top-level tab은 하나의 공통 content frame과 panel inset을 사용한다.
- panel 시작부는 `intro → local navigation → status and tools → primary content`의 역할 순서를 기본 문법으로 삼는다. 기능에 필요하지 않은 slot은 생략하며 빈 여백을 남기지 않는다.
- 모든 panel을 같은 모양으로 강제하지 않는다. 대신 첫 의미 요소의 시작선, slot 사이의 수직 rhythm과 heading hierarchy를 일관되게 유지한다.
- intro는 tab label을 반복하지 않고 사용자가 얻을 결과나 다음 행동을 설명할 때만 표시한다.
- `블로그 Beta`의 다섯 top-level panel은 예측 가능한 시작점을 위해 동일한 `제목 + 한 줄 설명` intro slot을 사용한다. 이는 해당 제품 surface의 규칙이며 모든 tab UI에 일괄 강제하지 않는다.
- local navigation과 status/tool이 같은 줄에 있어도 별도 role group으로 구분한다.
- 같은 수준의 local tab과 mode switch는 공통 segmented navigation을 사용한다. count는 segment 내부 badge로, refresh 같은 도구는 segment 바깥의 보조 action으로 둔다.
- 선택 상태는 지속적인 surface·text 표현, hover는 일시적 반응, `focus-visible`은 keyboard 위치를 나타내는 ring으로 각각 구분한다.
- native checkbox와 선택 button도 브라우저 기본 outline에 맡기지 않고 현재 style의 focus token을 사용한다. focus ring은 checked/selected 표현을 대체하지 않는다.
- tab은 `aria-controls`/`aria-labelledby`, roving `tabindex`, 좌우 방향키와 `Home`/`End` 이동을 지원한다.
- tab 전환은 사용자가 읽던 page scroll을 임의로 초기화하지 않는다. 전환으로 숨겨지는 panel 안에 focus가 있었다면 새 선택 tab 또는 합리적인 첫 작업점으로 focus를 복구한다.

## 현재 검증 사례

- `블로그 Beta` 빠른 글 작성: 내용 지우기 / 글감 보관 / 대기열 추가 / 바로 포스팅
- `블로그 Beta` Smart Comment: 설정 저장 / 댓글 초안 만들기
- `블로그 Beta` 연속 발행 설정: 30초 테스트 / 설정 저장
- `블로그 Beta` 갱신: 최신 데이터 부분 갱신 / 글감 관리 panel 새로고침
- `블로그 Beta` 선택 control: 발행 대상 / 외부 참고 / 실행 방식 / 자동화 설정
- 원고 폴더 및 붙여넣기: 발행 대상 / 포스팅 실행
- 공통 dialog와 전역 상태 action
- `블로그 Beta` top-level tab과 panel: 역할 기반 시작 slot / keyboard tab navigation / scroll 안정성
- 공통 footer 외부 링크와 Blog Beta native time field: style별 field focus ring / native picker UI 예외

## 후속 검증 필요

- 대상 밖 view의 form과 modal action은 compatibility scope를 유지한다.
- 다른 제품 surface로 확산할 때 component token 누락과 특정 style 종속성을 계속 검증한다.
- style 선택 UI를 만들기 전 keyboard, narrow layout과 진행 중 상태를 다시 검증한다.
