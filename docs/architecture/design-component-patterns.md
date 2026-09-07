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
- 완료 action은 화면이 열렸다는 이유만으로 활성화하지 않는다. 실제로 요구하는 최소 입력, 대상과 조건을
  충족할 때만 활성화하며 client 상태는 domain validation과 같은 의미를 사용한다. 하나의 form 안에서도
  보관과 발행처럼 결과가 다르면 활성화 조건을 분리한다.
- 사용자 입력뿐 아니라 추천·불러오기·되돌리기 같은 프로그램 입력도 동일한 availability 동기화를 거친다.

## AI Assist actions

- 글감·키워드·제목처럼 현재 입력을 보조하는 AI action은 공통 `AI Assist` 표현을 사용한다.
- 일반 secondary보다 발견 가능하도록 primary soft surface와 sparkle 또는 짧은 `AI` mark를 사용할 수 있지만, form의 최종 primary action과 같은 filled 강도를 사용하지 않는다. 가까운 영역에 같은 action이 반복되면 텍스트 badge보다 가벼운 공통 symbol을 우선한다.
- label은 `AI`만 표시하지 않고 사용자가 받을 결과를 함께 설명한다.
- 실행 시 사용하는 model role, 진행 상태와 중복 실행 방지는 해당 AI workflow 안에서 명확히 제공한다.

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

## Surface fill semantics

- surface fill은 장식이 아니라 hierarchy, grouping, persistent state 또는 temporary interaction 중 무엇을 전달하는지 설명할 수 있어야 한다.
- 기본 container는 border와 spacing만으로 충분하면 채우지 않는다. hover의 `surface-hover`는 일시적 반응이고, 펼쳐진 disclosure header의 `surface-muted`는 지속 상태이므로 서로 구분한다.
- 단독 checkbox나 radio row는 native checked state만으로 의미가 충분하면 상시 채우지 않는다. option card pattern을 쓸 때만 선택된 항목에 state-dependent soft surface를 적용한다.
- 여러 control을 하나의 의미 단위로 묶을 때는 먼저 fieldset, border와 spacing을 사용한다. nested surface가 실제 hierarchy를 더 명확하게 만들 때만 muted fill을 추가한다.
- 여러 chip을 고르는 selection group은 group border와 spacing으로 범위를 표현하고, 선택된 chip에만 지속적인
  selected fill을 적용한다. 선택된 child가 있다는 이유만으로 group 전체나 그 상위 form section을 채우지 않는다.
- 같은 역할에서 fill 유무가 다르면 상태·hierarchy·density 중 하나의 합당한 이유와 적용 범위가 있어야 한다.

## Help tooltips

- 도움말 trigger는 label보다 강하게 보이지 않는 neutral/info 표현을 쓰고 현재 style의 surface, text와 border token을 따른다.
- tooltip은 `surface-emphasis`, `text-inverse`, 공통 radius와 elevation token을 사용한다. 말풍선 화살표도 같은 surface 색을 사용한다.
- pointer hover뿐 아니라 keyboard focus와 touch focus에서도 내용을 확인할 수 있어야 하며, trigger와 tooltip은 accessible name, `aria-describedby`와 `role="tooltip"`로 연결한다.
- 기본 tooltip은 trigger 중앙에 배치하되 clip·viewport 경계와 충돌하면 실제 가용 공간을 기준으로 start/end placement를 자동 선택한다. 특정 field 이름에 placement를 고정하지 않으며, layout과 viewport가 바뀔 때 다음 노출에서 다시 계산한다. placement 좌표는 즉시 적용하고 opacity처럼 위치를 흔들지 않는 속성만 전환한다. placement가 달라도 말풍선 화살표는 trigger를 가리키며 내용이 container 경계에서 잘리지 않아야 한다.
- `Escape` 또는 focus 이탈로 닫을 수 있어야 한다. tooltip을 닫기 위해 사용자가 내용을 변경하거나 별도 action을 실행할 필요가 없어야 한다.
- 도움말은 짧은 보충 설명에만 사용한다. 작업 성공에 필수인 내용, 오류와 중요한 경고는 항상 보이는 본문이나 validation으로 제공한다.

## Inline guidance, hints and omission

- label 옆 inline metadata는 `(필수)`, `(선택)`, `권장`처럼 현재 상태나 입력 성격을 계속 알려야 하는 한두 단어에 사용한다. 인접 label보다 길어져 독립 문장처럼 보이면 inline metadata로 두지 않는다.
- 항상 보이는 hint는 사용자가 입력하거나 실행하기 전에 반드시 알아야 하는 조건, 형식, 결과 또는 안전 정보를 짧게 설명할 때 사용한다. 오류, 위험, 비용과 필수 선행 조건은 tooltip에 숨기지 않는다.
- tooltip은 없어도 기본 작업을 완료할 수 있는 용어 정의, 선택지 비교와 낮은 빈도의 보충 설명에 사용한다. 단순히 긴 inline 문구를 감추기 위한 대체 수단으로 쓰지 않는다.
- label, 인접 control, disabled·selected 같은 명확한 상태만으로 관계를 충분히 이해할 수 있으면 시각 안내를 생략한다. 접근성에 필요한 관계 설명은 visually hidden description과 `aria-describedby`로 유지할 수 있다.
- 같은 역할의 안내 형식이 다르면 정보 중요도, 노출 빈도 또는 접근성 중 설명 가능한 이유가 있어야 한다.

## Cards and surfaces

- card는 실제 정보 그룹을 표현할 때만 사용한다.
- 제목 아래 metadata는 사용자의 다음 판단이나 행동에 필요한 정보만 둔다. 같은 화면에서 이미 확인 가능한 source
  이름이나 사용자가 해석하기 어려운 내부 block 수처럼 중복·구현 중심인 값은 요약을 풍성하게 보이기 위해 반복하지 않는다.
- style은 card background, border, radius와 elevation을 바꿀 수 있다.
- 모든 card가 hover에서 떠오를 필요는 없다. 클릭 가능성이나 의미가 없으면 움직임을 사용하지 않는다.
- card 안에 같은 역할의 card를 반복해서 중첩하지 않는다.

## Content previews

- preview는 실제 결과의 순서와 비율을 알아볼 수 있어야 하지만 작성·설정 화면 전체를 대신하지 않는다.
- 긴 본문은 작업 맥락을 유지할 수 있는 제한된 높이 안에서 읽게 할 수 있다. 내부 scroll을 둘 때는 page scroll과
  경쟁하지 않을 만큼 충분한 높이를 제공하고 별도의 toolbar나 단계 control을 습관적으로 추가하지 않는다.
- 큰 이미지에는 화면과 preview 높이를 함께 고려한 최대 크기를 두고 `contain`으로 전체 형태를 보존한다.
  실제 결과를 닮게 한다는 이유로 한 이미지가 다음 작업 영역을 지나치게 밀어내거나 임의로 잘리게 하지 않는다.

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
- file, folder처럼 picker가 결정한 값을 보여주는 영역은 편집 가능한 text field처럼 표현하지 않는다. 선택 결과는
  읽기 전용 summary로 표시하고, 변경과 지우기는 이름이 분명한 별도 action으로 제공한다. 긴 값은 한 줄에서
  생략할 수 있지만 전체 값은 accessible name이나 보충 설명으로 확인할 수 있어야 한다.
- 일반 크기의 input, select와 disclosure에 붙는 우측 affordance는 공통 trailing inset을 사용해 같은 기준선과 충분한 클릭 여백을 만든다. icon과 화살표 모양은 기능에 따라 달라도 anchor 위치는 맞춘다.
- 같은 form과 density 안의 동일한 select에는 이 기준을 빠짐없이 적용한다. compact control처럼 밀도가 다른 component만 별도 inset을 사용할 수 있으며, 예외는 사용 맥락과 적용 범위가 분명해야 한다. 획일적인 형태보다 예측 가능한 정렬·간격 규칙을 우선한다.
- 같은 화면의 인접 선택으로 활성화할 수 있고 기능의 존재·의존 관계나 안정적인 layout을 보여주는 편이 유용한 종속 field는 표시한 채 disabled 처리한다. 활성화 조건을 가까운 문구로 설명하고 색상만으로 상태를 전달하지 않는다.
- 현재 작업과 완전히 무관하고 노출이 불필요한 복잡성만 늘리는 종속 field는 숨긴다. disabled와 hidden은 화면 밀도를 일률적으로 맞추기 위한 선택이 아니라 발견 가능성, 맥락 이해와 layout 안정성을 기준으로 결정한다.
- disabled control은 keyboard, 제출과 validation 대상에서 제외한다. 조건이 충족되면 enabled로 전환하고 필요한 경우 required를 함께 적용하며, 상태 전환 중 사용자가 입력한 유효한 값을 임의로 지우지 않는다.
- 특정 platform·provider에서만 유효한 control은 해당 대상이 선택됐을 때만 활성화한다. 비활성 상태와 접힌 summary, validation 및 실제 실행 payload가 같은 의미를 가져야 한다.
- provider 종속 control을 비활성화할 때 사용자의 선호값은 지우지 않고 재활성화 시 복원한다. 도움말이 필요하면 어느 대상에 적용되는 옵션인지 명시한다.
- 작은 불일치를 예외로 둘 때도 기능 차이, 접근성, 비용 또는 복잡도처럼 설명 가능한 이유와 적용하지 않는 범위를 기록한다. 크기만으로 원칙 적용을 생략하지 않는다.
- native date/time input의 닫힌 field는 현재 style의 focus token을 사용한다.
- 내부 picker trigger의 focus ring, 펼쳐진 popup의 색상과 선택 UI는 운영체제·브라우저 소유 영역으로 보고 style pack 예외로 허용한다. focus 위치는 가려서는 안 되며, 시각 통일만을 위해 custom picker로 재구현하지 않는다.

## Progressive disclosure

- 기본 경로에 꼭 필요한 입력과 최종 action을 우선 노출하고, 낮은 빈도의 참고·생성·발행 설정은 의미 단위로 접을 수 있다.
- 접힌 summary는 단순히 `세부 설정`이라고 쓰지 않고 현재 발행 대상, 공개 방식, 이미지 처리와 실행 방식 등 결과에 영향을 주는 값을 요약한다.
- 설정값이 바뀌면 summary도 즉시 갱신한다. 접힘은 값을 초기화하거나 저장·발행 payload에서 제외하는 의미가 아니다.
- keyboard로 summary를 열고 닫을 수 있어야 하며 `focus-visible` 위치를 유지한다.

## Recoverable destructive actions

- 작성 중 내용을 한 번에 지우는 action은 danger 의미를 유지하되, 실행 직후 방금 지운 내용을 되돌릴 수 있게 한다.
- action의 위치는 영향 범위, variant는 결과의 위험도, 노출 여부는 현재 실행 가능성으로 결정한다. form 전체를
  지우는 action은 개별 field heading이 아니라 form 마지막 action group의 반대쪽에 분리하고, 지울 내용이 있을
  때만 표시한다. 같은 역할은 입력 방식과 관계없이 같은 위치·variant·복구 흐름을 사용한다.
- `내용 지우기`처럼 즉시 복구 가능한 단일 action은 실행 뒤 같은 action slot을 중립적인 `되돌리기`가 이어받는다.
  별도 위치에 중복 완료 문구를 추가하지 않으며 keyboard focus도 새로 활성화된 복구 action으로 이동한다.
- 편집 흐름을 닫는 `취소`는 내용을 초기화하는 danger action과 의미가 다르므로 같은 button의 label과 variant를
  바꾸어 재사용하지 않는다. 별도 neutral secondary 또는 tertiary action으로 표현한다.
- 되돌리기는 원래 field 값과 연결된 출처 context를 함께 복원하고 합리적인 첫 입력점으로 focus를 돌려준다.
- 새 입력을 시작하거나 저장·발행 등 후속 상태 전이가 발생하면 오래된 복구 snapshot을 폐기한다.

## Async status and collection states

- 비동기 작업을 소유한 form, 목록 또는 결과 영역은 자신의 `loading`, `empty`, `error`, `success` 상태를
  가까운 status surface와 접근성 속성으로 표현한다. 다른 화면이나 인접 form의 status 영역을 빌려 쓰지 않는다.
- 필수 source를 아직 제공하지 않은 `idle` 상태에서는 결과 placeholder, 빈 preview와 source control이 이미
  전달하는 안내를 반복 노출하지 않는다. source가 제공된 뒤에만 loading, 결과, warning 또는 error를 보여준다.
- 같은 원인의 warning이 여러 건이면 상위 status에는 건수와 사용자 영향만 한 번 요약하고, 대상별 식별 정보는
  결과 안의 상세 목록에 둔다. 같은 조치 문장을 항목마다 반복하지 않는다.
- 결과 자체에서 문제 위치를 볼 수 있다면 해당 위치에는 짧은 상태만 표시하고, 인접 상세 목록에는 조치가 필요한
  항목만 모은다. 정상 항목까지 진단 목록에 반복하거나 플랫폼마다 달라지는 결과를 모호한 가능성 문구로 일반화하지 않는다.
- loading 중에는 실행 control을 잠그고 `aria-busy` 또는 명시적인 진행 문구로 중복 실행 방지 이유를 알린다.
  기존에 유효한 목록이나 결과가 있으면 새 요청 중에도 지우지 않는다.
- 사용자가 누른 하나의 action이 소유하고 짧게 끝나는 작업은 그 action의 label 또는 progress indicator와
  `aria-busy`로 loading을 표현한다. 같은 내용을 별도 status surface에 반복하지 않는다.
- 초기 metadata처럼 이미 badge, placeholder 또는 content skeleton이 진행 상태를 직접 표현하면 별도 loading
  surface를 추가하지 않는다. 독립 status surface는 시작 control과 떨어진 background 작업, 여러 단계의 진행,
  또는 사용자의 주의와 대응이 필요한 warning·error에 사용한다.
- 최초 load 실패처럼 보여줄 유효한 내용이 없을 때는 해당 content 영역 안에 error state와 재시도 방향을 둔다.
  갱신 실패처럼 마지막 정상 내용이 있을 때는 내용을 보존하고 별도 error status로 실패 사실을 알린다.
- empty는 오류가 아니다. 조회 전 `idle`, 정상 요청의 결과 없음 `empty`, 사용자가 적용한 filter의 결과 없음
  `filtered empty`를 문구와 상태로 구분하고 다음 행동을 가까이 제안한다.
- 작업의 일시적인 성공·실패 feedback과 장기적인 예약·실행 요약은 별도 역할이다. 새 feedback이 기존 운영
  summary를 덮어쓰거나 반대로 오래된 summary가 현재 요청 실패를 숨기지 않게 한다.
- 결과를 만드는 AI action은 사용하는 model role을 실행 전 확인할 수 있게 하고, 실행 중 중복 요청을 막으며,
  새 요청 실패 시 마지막 성공 결과를 유지한다.

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
- `블로그 Beta` 빠른 글 작성 보조: AI Assist / 설정 summary disclosure / 내용 지우기 되돌리기
- `블로그 Beta` 원고 폴더·붙여넣기: 공유 발행 설정 / 예약·provider 종속 field / 붙여넣기 되돌리기
- `블로그 Beta` 트렌드 포스팅: 조회 전·loading·empty·filtered empty·error·결과 상태
- `블로그 Beta` 글감 관리: 목록 loading·empty·error / 갱신 실패 시 마지막 정상 목록 보존
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
