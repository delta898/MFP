# Design Component and Pattern Guide v0.1

## 문서 상태

- Status: 첫 정식 style 적용을 통해 검증 중
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

## Fields and focus

- label, 입력값, hint와 validation의 typography 역할을 구분한다.
- field border와 focus ring은 canvas와 surface 모두에서 보여야 한다.
- error와 success는 색상 외에 문구 또는 상태 표시를 함께 사용한다.
- 입력 중이거나 실패한 요청 때문에 기존 사용자 값을 임의로 지우지 않는다.

## 현재 검증 사례

- `블로그 Beta` 빠른 글 작성: 내용 지우기 / 글감 보관 / 대기열 추가 / 바로 포스팅
- `블로그 Beta` Smart Comment: 설정 저장 / 댓글 초안 만들기
- `블로그 Beta` 연속 발행 설정: 30초 테스트 / 설정 저장
- `블로그 Beta` 갱신: 최신 데이터 부분 갱신 / 글감 관리 panel 새로고침
- `블로그 Beta` 선택 control: 발행 대상 / 외부 참고 / 실행 방식 / 자동화 설정
- 원고 폴더 및 붙여넣기: 발행 대상 / 포스팅 실행
- 공통 dialog와 전역 상태 action

## 후속 검증 필요

- 대상 밖 view의 form과 modal action은 compatibility scope를 유지한다.
- 두 번째 style에서 component token 누락과 특정 style 종속성을 검증한다.
- style 선택 UI를 만들기 전 keyboard, narrow layout과 진행 중 상태를 다시 검증한다.
