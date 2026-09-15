# Design Component and Pattern Guide

## 문서 상태

- Status: Blog Beta 검증 기반의 운영 중인 living contract
- Initial source stage: `codex/feature/design-system-03-first-style`
- 적용 대상: 공통 shell, `블로그 Beta`, `설정`에서 검증된 반복 UI

이 문서는 style의 색상 취향이 아니라 component의 의미, 상태와 배치 계약을 정의한다. 구체적인 색상·radius·shadow 값은 각 style pack이 component token으로 공급한다.

## Product terminology

- API, Sheet와 설정 저장소의 identifier는 안정적인 내부 값으로 유지하되 사용자에게 그대로 노출하지 않는다.
- 여러 화면에서 반복되는 platform·provider·상태 명칭은 공통 presentation formatter를 단일 출처로 사용한다.
  동일한 대상을 화면별 약칭이나 영문 표기로 바꾸지 않으며, 문맥상 더 짧은 일반 명칭이 필요한 경우에만 그 이유와
  범위를 별도로 정한다.
- Blog UI의 platform 표준 명칭은 `네이버 블로그`, `워드프레스`다. 설정 summary, 목록 metadata와 실행 확인처럼
  선택된 발행 대상을 표현하는 곳에서는 이 명칭을 사용한다.

## Action variants

### Primary

- 현재 맥락의 주된 완료 행동에 사용한다.
- 하나의 action group에는 원칙적으로 하나만 둔다.
- filled treatment를 사용할 수 있으며 loading 중 중복 실행을 막는다.

### Secondary

- primary를 보조하거나 다른 안전한 결과를 만드는 행동에 사용한다.
- primary와 같은 filled 강도로 경쟁하지 않는다.
- 기본 표현은 outline 또는 낮은 강조 surface다.
- 건너뛰기·닫기처럼 결과를 남기지 않는 낮은 위험의 dismiss action은 neutral secondary 또는 tertiary로 표현한다.
- `관심 없음`처럼 추천을 명시적으로 제외하고 향후 선호에 반영하는 negative feedback은 낮은 강조의 danger outline을 사용할 수 있다. 삭제처럼 복구 불가능한 행동으로 과장하지 않으며 filled danger나 별도 확인 dialog는 사용하지 않는다.

### Tertiary / Ghost

- 닫기, 가벼운 이동, 낮은 빈도의 보조 행동에 사용한다.
- 투명 배경을 기본으로 하며 hover와 focus에서만 surface를 드러낼 수 있다.

### Danger / Negative feedback

- 삭제, 초기화와 되돌리기 어려운 행동 또는 사용자가 대상을 명시적으로 제외하는 negative feedback에 사용한다.
- 평상시 primary보다 강하게 보일 필요는 없지만 위험 의미를 숨기지 않는다.
- 대상과 영향을 확인해야 하는 행동은 실행 전 확인 흐름을 유지한다.
- 구현은 공통 `.ui-danger-action` variant를 사용한다. feature stylesheet가 같은 danger border, text와 hover
  표현을 복제하지 않으며, primary·secondary·ghost 중 배치 위계는 유지한 채 위험 의미만 더한다.
- negative feedback은 낮은 강조 outline을 유지하고 확인 dialog를 요구하지 않는다. 복구가 어렵거나 자료를 삭제하는 danger action만 영향과 확인 흐름을 추가한다.

### Action wording

- action label은 `실행`, `처리`, `빼기` 같은 내부 동작보다 사용자가 얻게 될 결과를 설명한다.
- 같은 control의 결과가 선택된 mode나 상태에 따라 달라지면 `발행`, `임시 저장`, `예약 등록`처럼 실제 결과에 맞춰
  label을 바꾼다. 결과 차이가 중요하지 않을 때만 하나의 포괄적인 label을 사용한다.
- default, confirmation, loading과 실패 후 복구 상태는 같은 핵심 동사를 유지해 사용자가 다른 작업으로 오해하지 않게 한다.

### Dashboard action hierarchy

- Dashboard의 primary action은 현재 card가 제시하는 상태를 실제 다음 작업으로 진행시키는 대표 행동이다. 독립된 card마다
  하나를 둘 수 있지만 같은 action group 안에서는 하나만 사용한다.
- 설정 변경·재조회·대체 경로는 secondary, 전체 목록·상세·가이드로 이동하는 단순 탐색은 공통 `.ui-text-action`을
  사용한다. 같은 위치에 있다는 이유로 역할이 다른 행동을 같은 모양으로 만들지 않는다.
- 반복 collection card의 `적용`, `선택`처럼 각 item을 작업 흐름에 반영하는 행동은 해당 item action group의 primary가
  될 수 있다. dismiss나 보관 같은 보조 행동은 secondary 또는 ghost로 낮춘다.

## Form action group

- transactional dialog는 하나의 좁고 명확한 작업을 완료하는 surface로 사용한다. 기본 footer는 dismissive action과
  하나의 primary completion action으로 구성하고, 명확히 다른 결과가 필요할 때만 secondary action 하나를 더한다.
  세 개를 넘는 footer action이나 반복적인 `저장하고 계속`이 필요하면 full page, non-modal panel 또는 autosave가
  더 적합한지 먼저 검토한다.
- transactional dialog의 primary action은 유효한 변경을 확정하고 dialog를 닫는다. `취소`, close icon과 `Escape`는
  같은 dismiss contract를 사용하고, 변경이 없으면 바로 닫되 저장 ambiguities나 데이터 손실이 있으면 폐기 여부를
  확인한다. 저장 실패 시 dialog와 입력값을 유지한다.
- 편집 dialog의 save action은 입력이 유효하고 최초 또는 마지막 저장 기준과 비교해 실제 반영할 변경이 있을 때만
  활성화한다. 사용자가 값을 원래 상태로 되돌리면 다시 비활성화하고, 변경 없는 save를 dialog dismiss의 대체
  동작으로 사용하지 않는다. 단순 확인이나 다음 단계 이동처럼 persistence가 목적이 아닌 completion action은 예외다.
- content editor dialog는 content 저장만 소유한다. collection 사이 이동, 실행·발행처럼 별도 lifecycle을 바꾸는
  action은 원래 collection row나 목적이 분명한 별도 flow가 소유하며 content 저장의 암묵적 부수 효과로 넣지 않는다.
- 완료형 form과 dialog의 action group은 내용의 마지막에 둔다.
- desktop에서는 inline-end에 모으고 primary를 가장 끝에 둔다.
- 성격이 다른 danger action은 가능한 경우 반대쪽에 분리한다.
- DOM과 keyboard 순서는 시각적 진행 순서와 일치시킨다.
- 좁은 화면에서는 한 열로 쌓을 수 있으며 button 너비와 간격을 일관되게 유지한다.
- 상태 문구와 action이 함께 있을 때 상태를 가리거나 action 위치를 흔들지 않는다.
- 닫힌 dialog는 opacity나 pointer 차단에만 의존하지 않고 layout·렌더링 및 접근성 트리에서 제외한다. 열 때만
  명시적으로 노출해 초기 화면이나 view 전환 중 dialog surface가 순간적으로 보이지 않게 한다.
- 공통 native dialog는 `.ui-transaction-dialog`와 `.ui-transaction-dialog-form`을 사용하고,
  `header → body → feedback/result → footer` 순서를 유지한다. footer는 `.ui-transaction-dialog-footer`, action 묶음은
  `.ui-transaction-dialog-footer-actions`가 소유한다. feature stylesheet는 dialog 최대 폭처럼 업무에 필요한 geometry만
  조정하고 중앙 배치, backdrop, surface, footer 경계와 responsive stack을 복제하지 않는다.

Reference basis: [Material dialogs](https://m1.material.io/components/dialogs.html),
[IBM Carbon modal](https://carbondesignsystem.com/components/modal/usage/),
[Fluent 2 dialog](https://fluent2.microsoft.design/components/web/react/core/dialog/usage),
[Apple modality](https://developer.apple.com/design/human-interface-guidelines/modality),
[GNOME dialogs](https://developer.gnome.org/hig/patterns/feedback/dialogs.html).

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
- AI가 필요한 action과 필요하지 않은 action이 한 workflow에 함께 있으면 화면 전체를 막지 않는다. 준비되지 않은
  model role에 의존하는 action만 비활성화하고, 같은 문맥 안에 설정 필요 이유와 해당 role 설정으로 가는 복구
  action을 제공한다. credential 누락 같은 내부 오류를 실행 마지막에 그대로 노출하지 않는다.

## Refresh actions

- 작은 상태나 부분 데이터만 갱신할 때는 갱신 대상 바로 옆에 icon-only tertiary action을 둔다.
- 목록이나 panel 전체를 다시 불러올 때는 `새로고침`이라는 명시적인 secondary action을 사용한다.
- 설정 화면의 panel refresh는 정상 작업을 반복하는 primary path가 아니라, 앱 밖에서 계정·권한·세션·연결 값이
  바뀌었거나 최신 확인이 실패했을 때 사용하는 recovery action이다. 직접 연결·확인·로그인 action 뒤에는
  background reconciliation을 우선하고, 모든 card에 refresh를 복제하지 않는다.
- 조건을 적용해 새로운 결과를 요청하는 행동은 새로고침과 구분하고 `조회`, `검색`, `탐색`처럼 결과를 설명하는 primary label을 사용한다.
- icon-only action은 앱에서 같은 icon을 사용하고 접근 가능한 이름과 tooltip을 모두 제공한다. 갱신 대상이 모호하면 text action을 사용한다.
- 실행 중에는 진행 상태를 보여주고 `aria-busy`와 disabled 상태로 중복 실행을 막는다.

## Icon and text actions

- icon-only action은 새로고침, 보기, 닫기, 삭제처럼 제품 전반에서 같은 symbol로 반복되고 의미가 익숙한 경우에만 사용한다.
  목록의 반복 행이나 좁은 toolbar처럼 label이 content를 밀어내는 위치에서는 icon-only가 우선할 수 있다.
- icon-only action은 공통 `.ui-icon-action`을 사용하고 `aria-label`과 `title`을 모두 제공한다. icon 모양, hit area,
  hover, focus와 disabled 상태를 feature stylesheet에서 다시 정의하지 않는다.
- 삭제 icon은 평상시에 중립적으로 보이고 hover·focus에서만 danger tone을 사용한다. 저장 전 임시 행 제거처럼 취소로
  되돌릴 수 있는 작업은 별도 확인을 요구하지 않지만, 저장된 자료 삭제나 복구 불가능한 작업은 icon 하나에 맡기지 않고
  명시적인 text action과 확인 절차를 사용한다.
- `적용`, `취소`, `내용 확인`처럼 결과·범위·다음 상태를 읽어야 하는 action과 제품 고유 동사는 text label을 사용한다.
  사용자가 icon 의미를 추측해야 하거나 action 결과가 중요한 경우 공간이 좁더라도 text를 생략하지 않는다.
- 짧은 modal에서 footer의 `취소`가 항상 보이면 header에 같은 의미의 `닫기`를 중복 배치하지 않는다. 내용이 길어 footer가
  화면 밖으로 밀리거나 footer가 없는 확인용 modal일 때만 header close를 제공하며, 이때는 공통 close icon을 사용한다.
  `ESC`는 native modal의 보조 종료 수단으로 유지하되 명시적 종료 action을 대신하지 않는다.

## Sensitive credential fields

- 저장된 password, token, API key와 credential은 화면과 read API에 원문·부분값·길이를 반환하거나 표시하지 않는다.
  화면은 `등록됨` 여부만 사용하며, 값 변경을 위한 input은 항상 빈 상태에서 시작한다.
- 설정의 secret input은 공통 registration presentation을 사용한다. 등록된 값은 `{대상} 등록됨` placeholder와
  `변경할 때만 새 값을 입력하세요` hint로만 알리고, 미등록 상태는 해당 값의 입력 목적을 placeholder·hint에 표현한다.
- 사용자가 이번 입력에서 직접 작성한 secret에 한해 input 끝의 accessible show/hide control을 제공할 수 있다. 이 control은
  현재 입력값만 전환하며 저장된 원문을 다시 채우거나 표시하지 않는다.
- secret이 이미 등록된 상태에서 빈 input을 제출하면 기존 secret을 유지한다. 삭제는 별도의 명시적·확인 가능한 action으로만
  제공하며, 빈값 submit을 삭제로 해석하지 않는다.
- 설정의 secret show/hide는 공통 controller와 `data-settings-next-secret-toggle` 계약을 사용한다. provider별
  controller는 동일한 visibility event와 accessible label 갱신을 다시 구현하지 않는다.

## Summary-to-detail and settings density

- 한 local panel의 summary가 하위 설정 card와 1:1 대응할 때, summary 전체는 해당 card로 이동하는
  button이 될 수 있다. 이동 뒤에는 관련 설정의 첫 action 또는 form에 keyboard focus를 두고, hover와
  `focus-visible`로 clickability를 표현한다. 연결·검증 상태는 `.ui-settings-readiness-card`와 상태 dot을 사용하고,
  현재 설정값의 요약은 `.ui-settings-summary-card`를 사용해 상태 색이나 성공 dot을 붙이지 않는다. 단순 정보
  summary에는 이 interaction을 추가하지 않는다.
- 설정 card의 높이는 content-driven이다. 고정 높이, 화면 높이에 맞춘 stretch, footer를 card 하단으로 밀어내는
  spacer를 사용하지 않는다. `header → body → reserved feedback → footer`가 바로 이어지며, footer는 feedback
  바로 다음의 고정 action anchor를 유지한다.
- compact settings card에서는 control의 최소 조작 높이와 reserved feedback의 실제 한 줄 높이만 유지한다. card 내부의
  행 gap과 readiness summary padding은 한 density 단계 낮추며, 빈 feedback에 추가 여백을 예약하지 않는다. 공간을
  줄이기 위해 label, hint 또는 상태 정보를 생략하지 않는다.
- 구현은 공통 `settings-card` pattern을 단일 출처로 사용한다. `.ui-settings-card`,
  `.ui-settings-card-heading`, `.ui-settings-card-detail`, `.ui-settings-card-feedback`,
  `.ui-settings-card-footer`, `.ui-settings-summary-card`, `.ui-settings-readiness-card`, `.ui-settings-field`, `.ui-settings-field-grid`가
  anatomy·density와 field의 `label → control → hint` typography를 소유한다. 화면별 stylesheet에는 provider 고유
  상태·action layout만 둔다.
- Settings card의 heading과 첫 body 요소 사이에는 공통 heading-to-body gap을 둔다. body 안의 field·hint·feedback·footer는
  compact gap을 유지한다. 특정 화면이 heading 간격을 별도로 키우거나 줄이지 않으며, 별도 density가 필요한 card family는
  공통 custom property로 그 예외 범위를 명시한다.
- summary/readiness의 detail 이동과 feedback text/tone 갱신은 공통 settings-card controller가 소유한다. 화면 controller는
  target id와 feedback id만 지정하며, 같은 scroll·focus·feedback DOM 조작을 복사하지 않는다. 단, OAuth·로그인·외부
  연결 확인처럼 provider에 의존하는 workflow와 domain validation은 해당 feature에 남긴다.
- Settings top menu 아래 local sub-menu는 독립된 목적이 둘 이상일 때만 사용한다. 단일 목적 panel에는 tab을
  장식으로 추가하지 않고 panel heading, readiness summary와 shared card hierarchy를 사용한다.
- summary/readiness card는 desktop에서 1~3개면 한 row의 같은 너비 column으로, 4개면 2×2 grid로 배치한다. 더 좁은
  viewport에서는 한 column으로 축소한다. card 수가 바뀌었다고 빈 column을 남기거나 한 card만 다음 row에 남기지 않는다.
- 저장되는 설정 영역의 summary와 설정을 만들거나 검증하는 보조 작업은 같은 row에 섞지 않는다. 보조 작업을 상단에서
  빠르게 접근할 필요가 있으면 공통 `.ui-settings-shortcut-card`를 별도 group에 배치하고 detail card 이동 동작은 동일한
  `data-settings-card-target` controller를 재사용한다.
- 의미와 위계가 같은 독립 field가 desktop에서 3개이면 1×3으로 배치한다. 중간 폭에서는 2+1, mobile에서는 한 column으로
  축소하며 full-width field는 모든 column을 span한다. 의미상 두 쌍인 4개 field는 2×2 구조를 유지한다.
- model configuration처럼 공급자 선택과 직접 입력이 공존하는 card는 field 수가 아니라 사용자의 선택에 따라 동일한
  grid slot을 교체한다. preset은 `공급자·모델 / Base URL·API Key`, direct는 `공급자·모델 이름 / Base URL·API Key`의
  2×2 구조를 사용한다. preset 모델의 이름을 별도 field로 반복하지 않는다.
- 선택에 따라 같은 2×2 model grid의 field 설명이 바뀌더라도 각 field는 `label → control → 한 줄 도움말 slot`을
  항상 확보한다. 설명이 없으면 빈 slot을 유지해 다음 row·footer의 위치가 움직이지 않게 한다. transport가 고정된
  provider의 Base URL은 example placeholder가 아닌 실제 endpoint를 read-only로 표시한다.
- AI 공급자·모델·Base URL·credential 또는 상속 source가 바뀌면 이전 연결 확인 결과는 즉시 무효화한다. 이전
  성공·실패 feedback은 제거하고 readiness는 새 입력의 중립 `설정 필요` 또는 `연결 확인 필요` 상태로 돌아간다.
  새 공급자에 저장된 편집값이 있더라도 과거의 연결 결과를 복원하지 않으며, 현재 조합으로 다시 확인한 결과만 표시한다.
- AI model role은 역할별·공급자별 profile을 유지한다. 공급자를 전환하면 그 provider의 model·Base URL·credential
  등록 여부를 복원하고, 빈 key input은 해당 provider에 저장된 key를 유지한다. 화면과 read API는 원문 대신
  `OpenAI API Key 등록됨`처럼 provider를 명시한 등록 상태만 표시한다.
- 다른 role을 상속하는 설정의 안내문·readiness는 source role의 provider·model 변경과 같은 event에서 즉시 다시
  계산한다. 이전 model 이름을 유지한 채 status만 갱신하지 않으며, 상속을 끄거나 별도 model을 선택한 경우에만
  독립 상태를 유지한다.
- `연결 확인`처럼 검증과 함께 설정을 확정하는 action을 가진 card에서 provider·model·endpoint·credential·상속 source를
  변경하면 즉시 설정 공통 dirty scope에 등록한다. 이탈 시 변경한 card 이름을 포함한 discard 확인을 보이고,
  해당 action의 성공 뒤에만 dirty를 해제한다. 실패 시 입력값과 dirty 상태를 유지한다.

## Overview data sections

- 같은 overview card 안에서 요약 수치와 상세 목록을 나란히 보여줄 때는 양쪽에 같은 위계의 정적 subheading을 둔다.
  기간·filter 선택값을 상세 제목에 반복하지 않으며, 선택값은 filter와 결과·빈 상태 문구에서만 표현한다.
- overview 내부의 정적 section 제목은 공통 `.ui-overview-subheading`이 typography와 heading-to-content 간격을 소유한다.
  feature stylesheet에서 고정 font size나 margin으로 같은 위계를 다시 정의하지 않는다.

## Selection controls

- native select의 공통 arrow shell은 `styles/patterns/select-shell.css`의 `.ui-select-shell`을 사용한다. 두 개 이상의
  surface에서 쓰이는 control wrapper에는 feature 이름을 붙이지 않으며, feature stylesheet가 같은 arrow·padding 규칙을
  복제하지 않는다.
- checkbox와 radio는 운영체제의 native control과 keyboard 동작을 유지한다.
- 선택 강조색은 browser 기본값에 맡기지 않고 현재 style의 primary action 색을 사용한다.
- checked, unchecked와 disabled를 색상만으로 구분하지 않으며 label과 native 상태를 함께 유지한다.
- status나 link를 위한 별도의 의미 색상을 선택 표시의 임의 accent로 사용하지 않는다.

## Surface fill semantics

- surface fill은 장식이 아니라 hierarchy, grouping, persistent state 또는 temporary interaction 중 무엇을 전달하는지 설명할 수 있어야 한다.
- 기본 container는 border와 spacing만으로 충분하면 채우지 않는다. hover의 `surface-hover`는 일시적 반응이고, 펼쳐진 disclosure header의 `surface-muted`는 지속 상태이므로 서로 구분한다.
- 단독 checkbox나 radio row는 native checked state만으로 의미가 충분하면 상시 채우지 않는다. option card pattern을 쓸 때만 선택된 항목에 state-dependent soft surface를 적용한다.
- 짧은 설명이 필요한 복수 선택 항목은 `.ui-selectable-card-grid` 안에 `.ui-selectable-card`와
  `.ui-selectable-card-copy`를 사용한다. checked, disabled, hover와 focus 표현은 공통 pattern이 소유하고 feature는
  선택 가능 여부·최대 개수·업무별 이유만 계산한다.
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
- 같은 현재 설정이나 상태를 summary와 action 주변에 반복하지 않는다. 하나의 시각적 출처를 정하고, 다른 control이
  같은 설명을 필요로 하면 별도 문구를 복제하지 않고 그 출처를 `aria-describedby`로 참조한다.
- 같은 역할의 안내 형식이 다르면 정보 중요도, 노출 빈도 또는 접근성 중 설명 가능한 이유가 있어야 한다.

## Cards and surfaces

- 공통 primitive 간격 숫자를 feature에 직접 복사하지 않는다. page 제목과 첫 content 사이에는 `--ui-density-page-gap`,
  정보 section에는 `--ui-density-section-padding`, action bar에는 `--ui-density-action-padding`, field와 동급 item 사이에는
  `--ui-density-field-gap`을 사용한다. 입력과 button은 `--ui-density-control-*` 계약을 사용해 style 전환 시 밀도와 radius가
  함께 바뀌게 한다. preview 비율, media 크기, icon hit area처럼 업무·조작 의미가 있는 geometry는 feature가 유지한다.
- 밀도는 화면 전체를 일률적으로 축소하는 설정이 아니다. 같은 역할은 같은 token을 사용하되, 읽기 중심 surface와
  반복 선택·목록, 긴 편집 영역은 서로 다른 역할을 유지한다. mobile breakpoint도 새 고정값을 만들기보다 동일 token과
  기존 responsive layout을 조합한다.
- card는 실제 정보 그룹을 표현할 때만 사용한다.
- Dashboard처럼 현재 상태를 읽고 다음 행동을 판단하는 surface는 공통 `.ui-overview-card`를 사용한다. 제목 영역은
  `.ui-overview-heading`, 짧은 분류는 `.ui-overview-eyebrow`, 상태는 `.ui-status-badge`가 소유한다. feature stylesheet는
  grid, section 간격과 domain 고유 content layout만 정의하고 card border·radius·background·shadow, heading typography와
  status tone을 다시 구현하지 않는다.
- `.ui-settings-card`는 저장·검증하는 form anatomy, `.ui-overview-card`는 읽기·판단하는 summary anatomy에 사용한다.
  둘은 같은 style token을 소비하지만 footer와 field 구조를 억지로 공유하지 않는다.
- 실행 상태와 domain 상태는 `.ui-status-badge`와 semantic `data-state`로 표현한다. `loading`, `warning`, `success`,
  `error`처럼 의미가 있는 상태만 status 색을 사용한다. `Beta`처럼 제품 단계나 release 구분은 상태가 아니므로
  `.ui-release-badge`를 사용하며 feature별 badge 외형을 다시 만들지 않는다.
- 반복되는 loading 표현은 공통 feedback primitive를 사용한다. button 내부 진행은 `.ui-loading-action.is-loading`,
  문장형 진행 표시는 `.ui-loading-indicator[data-state="loading"]`, 독립 표시기는 `.ui-spinner`와 크기 modifier를 사용한다.
  feature는 spinner border, animation과 간격을 다시 정의하지 않고 실행 중 disabled와 accessible label만 소유한다.
- 데이터가 없어서 사용자가 다음 행동을 선택해야 하는 완결된 빈 surface는 `.ui-empty-state`를 사용한다. 오류 빈 상태는
  semantic `data-state="error"`로 구분한다. preview 내부 안내, 입력 전 prompt, 일시적 loading처럼 기존 작업 문맥 안의
  placeholder는 `.ui-workflow-empty` 또는 feature의 contextual pattern을 유지하며 모든 빈 문구를 같은 card로 만들지 않는다.
- source 선택, preview, 편집과 결과처럼 하나의 작업을 단계적으로 진행하는 surface는 `.ui-workflow-card`와
  `.ui-workflow-heading`을 사용한다. 이 pattern은 공통 card와 typography token을 소유하고 feature stylesheet는
  단계별 grid, preview 비율과 결과 item 배치처럼 업무 고유 layout만 정의한다. 저장 form 또는 현황 summary의
  anatomy를 작업 화면에 억지로 복사하지 않는다.
- 앞 단계의 결과를 보면서 이어서 수행해야 하는 선택·실행은 modal로 문맥을 덮지 않고 다음 `.ui-workflow-card`로
  아래에 연다. 다음 단계는 필요한 연결, 자산과 호환 대상이 준비된 뒤에만 표시하고, 미충족 사유는 앞 단계 결과의
  가까운 feedback slot에서 정확한 설정 위치와 함께 설명한다. 이 feedback은 현재 작업 화면 안에서 설정 화면으로
  이동시키지 않는다. 도움말처럼 작업 맥락 밖의 참고 자료는 명시적인 외부 link로 별도 page에서 연다.
- 다음 단계에서 사용할 변환값은 단계가 열리기 전에 준비해 실제 제출 field에 반영한다. URL 단축처럼 선택적인
  provider 기능은 provider 이름을 UI에 노출하지 않고, 미설정·실패 시 원본값으로 fallback한다. 사용자가 제출 전
  보는 값과 실제 전송값이 달라지는 숨은 후처리는 피한다.
- 작업 surface의 반복 field와 초기 안내는 `.ui-workflow-field`, `.ui-workflow-empty`를 사용한다. 확인 상태는
  `.ui-status-badge`의 `loading`, `ready`, `stale` 같은 semantic state로 표현하며 feature가 상태 색을 다시 정의하지 않는다.
- selectable card 묶음은 `.ui-selectable-card-group` fieldset 안에 legend와 `.ui-selectable-card-grid`를 둔다.
  native fieldset에서 grid gap이 legend 아래에 일관되게 적용되지 않으므로 group pattern이 공통 field 간격 token으로
  `legend → card grid` 여백을 명시하며 feature stylesheet에서 임의 간격을 다시 만들지 않는다.
- 동급 field 3개는 `.ui-workflow-field-grid`로 desktop 1×3, 중간 폭 2+1, mobile 1열로 축소한다. 긴 서술 field와
  연관된 단일 boolean을 같은 줄에 둘 때는 `.ui-workflow-detail-grid`의 2:1 비율을 사용하고 mobile에서는 1열로 내린다.
  단일 boolean은 별도 card를 만들지 않고 `.ui-inline-choice`의 `label → 짧은 설명` 구조로 표현한다.
- 결과 생성 workflow는 사용하는 model role과 담당 결과를 실행 전에 알 수 있어야 한다. 별도 안내 행이 새로운 정보를
  주지 않는다면 workflow heading 설명에 자연스럽게 통합한다. 일시적인 진행·경고·실패는 action과 같은 footer row의
  `.ui-workflow-feedback` 한 곳에 표시하고 feature가 상태 색을 복제하지 않는다. 실행 중에는 같은 요청뿐 아니라 요청
  payload를 바꿀 수 있는 field도 잠근다. 완료 후 field가 바뀌면 기존 결과는 보존하되 현재 결과와 새 입력이 다름을
  feedback으로 알리고, 다음 실행 때 새 설정을 적용한다.
- 일반 settings card와 짧은 workflow의 body/action 경계는 divider 없이 공통 spacing으로 구분한다. horizontal divider는
  스크롤 본문과 분리되는 modal·sticky footer, 긴 form의 명확한 최종 action, 위험하거나 독립적인 실행 영역처럼 실제
  경계 의미가 있을 때만 사용한다. 단순히 button을 강조하거나 빈 공간을 채우기 위해 추가하지 않는다.
- 순서가 있는 media 결과는 `.ui-sequence-badge`로 번호를 표시하고, 상태 색을 순번 장식에 사용하지 않는다. 기본 결과 수가
  명확한 workflow는 그 수에 맞는 desktop column을 우선하고 중간 폭과 mobile에서 단계적으로 줄인다. 빈 media는 실제
  결과로 오해할 기본 이미지를 넣지 않고, semantic token으로 만든 낮은 대비의 placeholder pattern을 공통 muted surface에
  사용해 비어 있음과 조작 가능성을 함께 알린다.
- 결과 item은 현재 필요한 다음 행동 하나만 primary로 둔다. media가 없을 때 `만들기`는 primary이지만 이미 완성된 media의
  `다시 만들기`, 로컬 파일 교체, prompt 확인·복사와 다운로드는 secondary 또는 tertiary이다. 완성 세트에서는 결과를
  사용하는 다음 단계가 primary가 되며 재생성은 secondary로 내려간다. 다운로드 anchor처럼 button과 같은 위계가 필요한
  control은 `.ui-button-link`를 사용한다.
- 긴 보조 원문을 접어 두는 결과 item은 divider 아래 하나의 detail tool row를 사용한다. 왼쪽 disclosure는 내용을
  `보기/접기`, 오른쪽 `.ui-text-action`은 같은 원문을 `복사`하는 독립 action으로 두며, 복사를 별도 bordered button이나
  media action으로 올리지 않는다. 펼친 원문은 같은 row 아래 전체 너비의 muted detail surface에 표시한다.
- media를 생성하거나 직접 선택하는 행동은 media 영역 안의 한 control group에 둔다. 빈 상태에서는 두 경로를 중앙에
  명시적으로 표시한다. 완성 뒤에는 결과 감상을 우선해 같은 위치의 한 줄 작업 bar를 pointer hover 또는 keyboard
  focus-within에만 반투명 overlay로 표시하고 다시 생성·교체·받기를 제공한다. hover가 없는 coarse-pointer 환경에서는
  발견 가능성을 위해 같은 한 줄 bar를 항상 표시한다. 설명 영역에는 prompt처럼 media 제작을 보조하는 확인·복사
  action만 남긴다.
- 반복 media card는 같은 grid row에서 전체 card와 설명 영역을 stretch하고, 하단 detail tool row를 `margin-top: auto`로
  정렬한다. 제목·본문 길이가 달라도 하단 action 위치가 흔들리지 않게 하되 고정 px 높이나 내용 잘림으로 맞추지 않는다.
- source registry처럼 주 작업에는 필요하지만 자주 바꾸지 않는 값은 toolbar의 보조 action에서 modal surface로 연다.
  해당 기능 화면이 값을 단독 소유하고, 설정 화면에 같은 editor를 복제하지 않는다. 명시적 적용에 성공한 뒤에만
  source 목록을 무효화·재조회하며 이전 정상 preview나 후속 결과를 임의로 지우지 않는다.
- 수치, 개수, 기간과 category는 성공·정보 상태가 아니다. 상태 의미가 없는 통계 card는 같은 neutral surface를 사용하고,
  단순 개수는 `.ui-count-badge`로 표시한다. 성공·경고·실패 색상은 실제 domain 상태가 있을 때만 사용한다.
- 추천·가이드처럼 Dashboard의 보조 콘텐츠도 공통 overview/supporting surface를 사용한다. 카드 전체에 장식 목적의 특정
  색상이나 gradient를 고정하지 않고, 실제 action·focus·작은 icon에만 현재 style의 primary accent를 사용한다.
- product style 대상 feature와 shared pattern은 고정 색상, style 이름 조건문과 compatibility alias를 소유하지 않는다.
  색상·radius·spacing·shadow는 semantic/component token으로 결정해 `warm-editorial`, `quiet-sage-studio` 등 등록된
  style에서 같은 정보 위계를 유지하면서 서로 다른 표현과 density를 제공한다.
- product style 대상 overview의 typography는 `--ui-type-*`, `--ui-weight-*`, `--ui-line-height-*` token을 사용한다.
  feature stylesheet에 특정 style에서만 자연스러운 px 글자 크기나 숫자 font weight를 고정하지 않는다. chart bar 간격,
  responsive breakpoint와 icon hit area처럼 정보 시각화·조작에 필요한 불변 geometry는 feature/component가 소유할 수 있다.
- 동일한 domain 상태를 card header badge와 body indicator처럼 두 번 표현하지 않는다. 상태의 대표 위치는 header의
  `.ui-status-badge`이며, body에는 상태를 이해하거나 다음 행동을 결정하는 내용만 둔다.
- 선택 control, 실행 중 row, table header 구분선과 sticky footer의 shadow는 역할별 component token을 사용한다.
  같은 숫자로 보이더라도 선택 강조, 상태 outline, 경계선과 elevation을 하나의 범용 shadow로 합치지 않는다.
- 제목 아래 metadata는 사용자의 다음 판단이나 행동에 필요한 정보만 둔다. 같은 화면에서 이미 확인 가능한 source
  이름이나 사용자가 해석하기 어려운 내부 block 수처럼 중복·구현 중심인 값은 요약을 풍성하게 보이기 위해 반복하지 않는다.
- style은 card background, border, radius와 elevation을 바꿀 수 있다.
- 모든 card가 hover에서 떠오를 필요는 없다. 클릭 가능성이나 의미가 없으면 움직임을 사용하지 않는다.
- card 안에 같은 역할의 card를 반복해서 중첩하지 않는다.
- card의 제목이나 넓은 content 영역 전체가 수정·상세 보기 action이면 pointer cursor, hover·focus 반응과
  accessible name을 일관되게 제공한다. 반복되는 편집 목록처럼 동작이 문맥상 자명하면 별도 label을 생략하고,
  그렇지 않을 때만 `수정`, `보기`처럼 결과를 설명하는 작은 상시 cue를 둘 수 있다. 전체 영역은 하나의
  button과 accessible name을 유지하고 같은 동작의 label이나 별도 button을 중복 추가하지 않는다.
- 외부 원문 확인이 결과를 판단하는 자연스러운 다음 단계라면 card의 대표 제목을 원문 link로 사용할 수 있다.
  제목 link는 hover·focus에서 조작 가능성을 드러내고 새 창 이동을 accessible name으로 알린다. card 안에 별도의
  실행·작성 link가 있으면 원문 읽기와 후속 action의 목적 및 URL을 구분하며 card 전체를 중복 link로 만들지 않는다.
- 상시 cue는 caption size와 muted text를 기본으로 하며 badge surface나 독립 action처럼 강조하지 않는다.
  accessible name에 이미 동작이 포함되어 있으면 시각 cue를 보조 기술이 중복해서 읽지 않게 한다.
- 반복 row의 action group은 같은 역할의 control이 행마다 같은 열과 폭을 사용해 수직으로 정렬한다. label 길이가
  달라져도 이동·보조·primary action의 위치를 흔들지 않으며, 좁은 화면에서는 고정 열보다 자연스러운 줄바꿈과
  조작 가능한 폭을 우선한다.
- 같은 entity가 collection 사이를 이동할 때 row의 공통 metadata 순서와 용어는 유지한다. 특정 collection에서만
  의미가 있는 처리 순서·예상 시각 같은 정보는 공통 metadata 뒤에 추가할 수 있지만, 위치가 바뀌었다는 이유만으로
  키워드·상태 등 서로 다른 정보 체계로 교체하지 않는다. 공통 값이 정해지지 않았다면 생략으로 의미를 숨기기보다
  `발행 대상 미정`처럼 짧고 명확한 상태를 표시한다.
- 하나의 collection row에 content action과 여러 보조 action이 함께 있으면 pointer hover와 내부 keyboard
  focus를 row 전체의 `surface-hover`로 연결해 현재 작업 위치를 보여준다. 실제 control의 focus ring은 유지하고,
  일시적인 row 반응을 선택 상태처럼 지속하거나 별도의 accent text 강조와 중복하지 않는다.

## Data tables

- table canvas, header, cell border와 row hover는 현재 style의 `surface`, `surface-muted`, `surface-hover`,
  `border`와 `text` token을 사용한다. compatibility palette나 원시 색상을 feature table에 직접 상속하지 않는다.
- header는 열의 구조를 구분하는 낮은 강조 surface로 표현하고 primary action이나 selected row처럼 보이지 않게 한다.
- row hover는 pointer가 위치한 행을 찾는 일시적 반응일 뿐 선택·성공 상태를 뜻하지 않는다. hover가 사라지면
  기본 surface로 돌아가며 layout과 text 대비를 흔들지 않는다.
- category 같은 metadata badge는 neutral surface를 기본으로 한다. 상승·하락·신규처럼 domain 의미가 있는 값도
  문구나 기호를 함께 사용하고, 오류·성공용 status 색을 의미가 다른 데이터에 빌려 쓰지 않는다.
- table header와 cell은 같은 열 정렬 기준을 공유한다. 자연어와 긴 식별자는 시작 정렬(start), 날짜와 상태 badge,
  조작 button group은 가운데 정렬(center)을 기본으로 하며, 단독 숫자 값은 비교가 쉬운 끝 정렬(end)을 사용한다.
- 정렬은 데이터의 읽기 방식에 따라 열 단위로 결정하고 모든 cell을 획일적으로 맞추지 않는다. 상태 badge나 action처럼
  하나의 시각 단위로 읽는 값은 해당 열 전체를 가운데 정렬하되, 내부 텍스트의 읽기 방향은 유지한다.
- 짧은 categorical badge 또는 badge group은 긴 자연어와 달리 가운데 정렬을 허용한다. 열 폭이 넓고 값이 짧아
  시작 정렬이 불필요한 여백을 만들 때 적용하며, header와 badge group 모두 같은 기준선을 사용한다.
- 정렬 가능한 열은 비정렬 header와 affordance가 구분되어야 한다. 실제 button, keyboard 동작과 `aria-sort`로
  조작 가능성과 현재 방향을 함께 전달하며 색상만으로 정렬 상태를 표시하지 않는다.
- 정렬은 결과 필터링 뒤에 적용하고, 같은 값의 순서는 원래 결과 순서를 안정적으로 유지한다. 열을 바꾸면 오름차순으로
  시작하고 같은 열을 다시 선택하면 오름차순·내림차순을 교대한다. 정렬 affordance는 결과가 없는 상태에서는 조작점으로
  노출하지 않으며, 해당 table의 renderer와만 연결해 다른 table 상태를 변경하지 않는다.
- 숫자 변화량과 비수치 상태가 섞인 열은 상태를 숫자 값으로 강제하지 않는다. 트렌드 변화에서는 `+`, `0`, `-`를
  방향에 따라 정렬하고 `new`는 오름차순·내림차순 모두 숫자 값 뒤에 둔다. 동일 상태의 기존 순서는 유지한다.
- 결과 table이 좁은 화면에서 최소 읽기 폭을 유지해야 하면 table 구조를 억지로 카드로 바꾸지 않고 가로 스크롤을 제공한다.
  단, action group은 줄바꿈으로 조작점을 숨기거나 겹치게 만들지 않으며 전체 action에 계속 접근할 수 있어야 한다.

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
- 여러 제품 surface에서 같은 timer 기능을 제공하면 공통 widget DOM·초기화 코드·token을 재사용한다. page header는
  `intro + optional utility` slot으로 배치할 수 있고, utility가 없어도 intro 시작선과 content frame은 유지한다.
  좁은 화면에서는 utility를 intro 아래로 자연스럽게 쌓되 별도의 feature 전용 복사본을 만들지 않는다.

## Discovery badges

- `new`처럼 새 기능의 발견을 돕는 badge는 상태 오류나 긴급 알림이 아니므로 animation이나 위험색을 사용하지 않는다.
- 비활성 navigation에서는 작은 filled primary badge로 일반 보조문구보다 분명하게 표현한다.
- 활성 navigation에서는 inverse badge로 전환해 active surface 위의 대비를 유지한다.
- badge는 메뉴 label을 대신하지 않으며, 접근 가능한 이름으로 의미를 전달한다.

## Fields and focus

- label, 입력값, hint와 validation의 typography 역할을 구분한다.
- 같은 form density의 checkbox·radio label은 공통 label size와 weight를 사용한다. 개발·진단 전용 여부는 노출
  조건으로 구분하며 typography 예외의 근거로 삼지 않고, 보조 설명만 caption·secondary text로 낮춘다.
- Settings card 안의 radio·checkbox 선택 묶음은 `.ui-settings-choice-group`을 사용한다. legend는 공통 field label의
  size·semibold, option label은 같은 size의 regular weight를 사용하며, 화면별 stylesheet가 이를 다시 정의하지 않는다.
- field border와 focus ring은 canvas와 surface 모두에서 보여야 한다.
- error와 success는 색상 외에 문구 또는 상태 표시를 함께 사용한다.
- 입력 중이거나 실패한 요청 때문에 기존 사용자 값을 임의로 지우지 않는다.
- file, folder처럼 picker가 결정한 값을 보여주는 영역은 편집 가능한 text field처럼 표현하지 않는다. 선택 결과는
  읽기 전용 summary로 표시하고, 변경과 지우기는 이름이 분명한 별도 action으로 제공한다. 긴 값은 한 줄에서
  생략할 수 있지만 전체 값은 accessible name이나 보충 설명으로 확인할 수 있어야 한다.
- 일반 크기의 input, select와 disclosure에 붙는 우측 affordance는 공통 trailing inset을 사용해 같은 기준선과 충분한 클릭 여백을 만든다. icon과 화살표 모양은 기능에 따라 달라도 anchor 위치는 맞춘다. select와 disclosure 화살표는 텍스트 glyph가 아니라 고정된 아이콘 박스를 사용하고 control 높이의 수직 중앙에 배치한다. disclosure는 닫힘·펼침 상태를 같은 아이콘의 회전으로 표현한다.
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

- 파괴적 action의 사전 확인 여부는 label의 위험한 어감이 아니라 복구 가능성, 외부 영향과 사용자 비용으로 결정한다.
  삭제·발행처럼 되돌리기 어렵거나 외부 상태를 바꾸는 action은 대상과 영향을 보여주고 확인받는다. 실행 직후 같은
  맥락에서 이전 상태를 완전하게 복원할 수 있는 로컬 action은 아래 되돌리기 계약을 충족하면 사전 확인을 생략할 수 있다.
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
- 별도 source 입력 없이 action으로 시작하는 workflow는 결과 영역에 다음 행동과 결과 사용법을 알려주는 초기 안내
  하나를 둘 수 있다. 같은 제품 surface의 empty state와 공통 border, typography, spacing과 density를 사용하고,
  heading·summary·안내 card가 같은 사실을 반복하지 않게 한다.
- 같은 원인의 warning이 여러 건이면 상위 status에는 건수와 사용자 영향만 한 번 요약하고, 대상별 식별 정보는
  결과 안의 상세 목록에 둔다. 같은 조치 문장을 항목마다 반복하지 않는다.
- 결과 자체에서 문제 위치를 볼 수 있다면 해당 위치에는 짧은 상태만 표시하고, 인접 상세 목록에는 조치가 필요한
  항목만 모은다. 정상 항목까지 진단 목록에 반복하거나 플랫폼마다 달라지는 결과를 모호한 가능성 문구로 일반화하지 않는다.
- loading 중에는 실행 control을 잠그고 `aria-busy` 또는 명시적인 진행 문구로 중복 실행 방지 이유를 알린다.
  기존에 유효한 목록이나 결과가 있으면 새 요청 중에도 지우지 않는다.
- 하나의 비동기 operation이 같은 데이터 집합의 순서·소속·내용·실행 상태를 바꾸는 동안에는, 오래된 상태를
  기준으로 요청이 겹칠 수 있는 refresh와 sibling mutation action도 같은 operation scope에서 잠근다. 단순 tab
  전환이나 읽기처럼 진행 중인 결과와 충돌하지 않는 navigation까지 획일적으로 막지 않는다. 잠금 범위는 button의
  개수가 아니라 동시 실행 시 데이터 또는 사용자 결과가 충돌하는지로 결정한다.
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

### Connection and readiness states

#### Feature action readiness

- 대시보드는 AI 글쓰기, 콘텐츠 저장 공간, 발행 채널처럼 제품 전체의 시작 준비 상태를 요약한다. 기능 화면은 이 요약을
  큰 진입 차단 popup으로 반복하지 않고, 현재 action에 실제로 필요한 항목만 버튼 가까이 안내한다.
- 메뉴와 화면 진입 자체는 허용한다. 설정 없이도 가능한 탐색·미리보기·입력은 유지하고, 저장·AI 생성·발행처럼 해당
  capability가 반드시 필요한 action만 비활성화한다.
- 비활성 action에는 이유와 정확한 설정 card로 이동하는 text action을 같은 문맥에 둔다. 설정 키 이름, credential 누락
  원문이나 내부 provider 표현을 사용자에게 노출하지 않는다.
- client는 안전한 readiness endpoint의 `ready / unavailable / unknown` 상태를 사용한다. 명시적인 `unavailable`만
  선제 차단하고, 최초 조회 실패 같은 `unknown`은 실행 요청을 허용한 뒤 server validation이 최종 판단한다.
- UI 비활성화는 편의와 조기 안내이며 보안·정합성 경계가 아니다. 비용 발생, 원격 저장 및 발행을 시작하는 server
  action은 같은 capability를 다시 검증하고 안정적인 error code와 사용자가 취할 다음 행동을 반환한다.
- 하나의 workflow에서도 `글감 보관`, `AI 원고 생성`, `발행`은 서로 다른 조건을 가질 수 있다. 전체 설정 하나로 묶어
  가능한 action까지 함께 차단하지 않는다.

#### Settings connection card anatomy

- Settings의 account, document, channel connection card는 `header → body → feedback → footer` 순서를 공통 문법으로
  사용한다. header 왼쪽에는 title과 한 줄 description, 오른쪽에는 현재의 지속 상태 badge 하나만 둔다.
- connection card는 credential과 연결 검증만 소유한다. Organization·발행 채널처럼 이번 자동 발행·카드뉴스 실행의
  대상을 고르는 값은 해당 실행 화면이 소유하며, 연결 화면에는 선택 control로 중복하지 않는다.
- 연결 credential의 유효성과 기능의 실행 허가는 분리한다. 연결 card는 token·endpoint·허용 대상과 연결 확인만
  관리하며, background daemon·수신 adapter·알림 발송의 사용 여부를 함께 켜거나 끄지 않는다. 연결값 변경으로 이미
  활성화된 runtime에 새 credential을 재적용해야 할 때만 runtime을 안전하게 재시작할 수 있다.
- 연결 card 자체가 알림 channel을 나타낼 때는 title 앞에 label 없는 checkbox를 둘 수 있다. 이 checkbox는 해당
  channel의 발송 허용만 제어하며, 연결 상태 badge·credential·inbound adapter와 역할을 섞지 않는다. 연결이
  불완전하면 checkbox는 비활성화한다. 같은 선택을 별도 화면이나 badge에 반복하지 않는다.
- 공통 외부 서비스의 책임은 `연결 → 목적지 → 이벤트 → 입력 채널`로 구분한다. `부가 서비스`는 credential과 검증,
  `앱 > 알림`은 발송 채널, 각 기능은 알림을 만들 이벤트, `앱 > 외부 연결`은 Telegram 수신·원격 MCP 같은 inbound
  adapter의 활성화와 실행 상태를 소유한다.
- body에는 field, field별 hint와 계정·세션 같은 지속 정보만 둔다. 같은 연결 상태를 body나 footer에 다시 label로
  반복하지 않는다.
- footer는 왼쪽의 선택적 `footer detail slot`과 오른쪽 action group으로 구성한다. footer detail slot은 현재 설정,
  선택 또는 사용자가 방금 실행한 연결 확인의 한 줄 결과를 표시한다. 연결 확인 성공·실패는 모두 이 slot을 사용하고,
  실패는 danger tone과 사용자가 다음에 확인할 값을 함께 쓴다. 정보가 없으면 slot과 여백을 예약하지 않는다. action은
  항상 공통 footer action group으로 감싸 오른쪽 anchor를 유지하며, 좁은 화면에서는 detail 뒤에 자연스럽게 줄바꿈한다.
- feedback은 body 다음, footer 직전의 전용 surface 한 곳에서 field-level validation이나 여러 단계 workflow의
  사용자 대응 안내만 보여준다. 정상 성공은 persistent badge가 이미 표현하므로 같은 사실을 feedback으로 반복하지 않는다.
  새 입력으로 결과의 전제가 바뀌면 오래된 feedback을 지운다.
- footer에는 action만 두고 inline-end에 한 group으로 정렬한다. 같은 connection의 `연결 해제`·`로그아웃`과
  확인 action을 함께 둘 때는 danger outline과 확인 dialog로 의미를 구분한다.
- feedback surface는 한 줄 높이를 항상 예약하고, 긴 문구는 한 줄 안에서 줄임 처리하되 assistive technology와 title로
  전체 문구를 제공한다. feedback의 출현·소멸·내용 변화가 footer 또는 primary action의 좌표를 움직여서는 안 된다.
  footer는 card 안의 고정된 interaction anchor다.
- 사용자가 시작한 operation의 loading은 그 button label과 card/form의 `aria-busy`에만 표시한다. feedback이나
  button 옆에 같은 `확인 중` 문구를 추가하지 않는다. OAuth처럼 별도 화면에서 이어지는 여러 단계 흐름은 다음
  행동을 설명하는 feedback을 함께 둘 수 있으나 button의 loading label과 같은 문장을 복제하지 않는다.
- 직접 operation의 응답이 끝나면 해당 action의 loading도 끝낸다. 이후 여러 connection을 다시 읽는 aggregate
  reconciliation은 background에서 수행하며 button을 계속 loading 상태로 붙잡지 않는다. reconciliation 결과가
  달라지면 persistent badge와 readiness summary를 나중에 갱신한다.

- 외부 계정·문서·발행 채널은 `미설정`, `설정됨/확인 필요`, `확인 중`, `연결됨`, `다시 로그인 필요`, `확인 실패`를
  서로 다른 상태로 다룬다. credential이나 주소가 저장됐다는 사실만으로 `연결됨` 또는 `접근 가능`으로 표시하지 않는다.
- `연결됨`은 현재 검증 source가 성공을 확인한 경우에만 사용한다. 저장값만 있으면 `확인 필요`, 인증이 만료됐으면
  `다시 로그인 필요`, 최초 확인 자체가 실패했으면 `확인 실패`와 재시도 방향을 보여준다.
- 새로고침 실패 시 마지막으로 검증된 상태와 입력은 유지하고, 최신 확인에 실패했다는 일시적 feedback을 별도로 둔다.
  유효한 이전 상태가 없는 최초 실패에서는 실패를 정상·미연결 상태로 가장하지 않는다.
- 연결·해제·로그인·로그아웃·검증이 진행되는 동안 같은 connection scope의 sibling mutation과 상태 새로고침을
  함께 잠근다. 다른 독립 connection과 tab navigation은 충돌하지 않는 한 계속 사용할 수 있다.
- 한 local panel이 동급 connection 항목 여러 개를 관리하면 content 시작부의 readiness group도 항목별 1:1 summary
  card로 구성한다. 사용 빈도만으로 같은 제품 역할의 provider를 축소하거나 optional 위계로 내리지 않는다.
- 데이터 삭제·전체 초기화처럼 복구가 어렵고 편집 completion과 lifecycle이 다른 danger action은 inline-start에
  분리한다. 반면 다시 연결할 수 있는 `연결 해제`, `로그아웃`처럼 같은 connection을 관리하는 문맥적 action은
  관련 확인 action과 inline-end group에 둘 수 있다. 이 경우 danger outline과 확인 dialog로 의미를 구분하고,
  더 안전하고 자주 쓰는 action을 읽기 흐름의 마지막에 둔다.
- connection form이 사용자의 목적 action 전에 값을 내부적으로 반영하더라도 button label에는 `저장하고` 같은
  구현 절차를 노출하지 않고 `접근 확인`, `로그인`, `연결 확인`처럼 사용자가 얻을 결과만 쓴다. 정상 상태에서는
  `저장됨` label을 상시 노출하지 않으며 현재 연결 상태와 가능한 action에 시선을 집중시킨다.
- 내부 반영과 외부 확인은 결과를 별도로 추적한다. 외부 확인만 실패한 예외 상황에서는 `입력값은 반영됨 · 연결 확인 실패`처럼
  부분 성공을 알려 사용자가 같은 값을 다시 입력하지 않게 한다. 반영 자체가 실패하면 입력을 유지하고 해당 action을 재시도할 수 있게 한다.

## Tab panels and content start

- 같은 수준의 top-level tab은 하나의 공통 content frame과 panel inset을 사용한다.
- panel 시작부는 `intro → local navigation → status and tools → primary content`의 역할 순서를 기본 문법으로 삼는다. 기능에 필요하지 않은 slot은 생략하며 빈 여백을 남기지 않는다.
- 모든 panel을 같은 모양으로 강제하지 않는다. 대신 첫 의미 요소의 시작선, slot 사이의 수직 rhythm과 heading hierarchy를 일관되게 유지한다.
- intro는 tab label을 반복하지 않고 사용자가 얻을 결과나 다음 행동을 설명할 때만 표시한다.
- `블로그 Beta`의 top-level panel은 예측 가능한 시작점을 위해 동일한 `제목 + 한 줄 설명` intro slot을 사용한다. 이는 해당 제품 surface의 규칙이며 모든 tab UI에 일괄 강제하지 않는다.
- top-level tab은 사용자가 독립된 주 작업으로 인식하고 직접 진입할 필요가 있는 기능에 사용한다. 특정 작업 영역의
  운영 방식만 조정하는 저빈도 설정은 해당 영역의 local navigation에 둔다. 구현 모듈이 분리되어 있다는 이유만으로
  top-level tab을 추가하지 않는다.
- local tab의 count badge와 보조 action은 해당 view의 역할에 따라 선택적으로 제공한다. 목록이 아닌 설정 view에는
  의미 없는 count나 refresh를 복제하지 않는다.
- local navigation과 status/tool이 같은 줄에 있어도 별도 role group으로 구분한다.
- 같은 수준의 local tab과 mode switch는 공통 segmented navigation을 사용한다. count는 segment 내부 badge로, refresh 같은 도구는 segment 바깥의 보조 action으로 둔다.
- 구현에서는 top-level navigation에 `.ui-top-tabs` / `.ui-top-tab`, local navigation에 `.ui-segmented-tabs` / `.ui-segmented-tab` 공통 pattern을 사용한다. keyboard 이동은 공통 `handleUiTabNavigationKeydown` controller를 사용한다. feature class와 activation callback은 업무 상태 전이만 연결하며 공통 크기·간격·색상·focus·방향키 계산을 다시 정의하지 않는다.
- navigation과 panel intro의 typography는 역할에 따라 다음 semantic token을 사용한다. 모든 tab button은 제품 font family를
  상속하며 native button의 기본 font에 맡기지 않는다.

  | 역할 | size | weight | line-height |
  | --- | --- | --- | --- |
  | panel 제목 | `--ui-type-heading-size` | `--ui-weight-bold` | `--ui-line-height-tight` |
  | 제품 surface의 top-level tab | `--ui-type-body-size` | `--ui-weight-semibold` | `--ui-line-height-tight` |
  | panel 한 줄 설명 | `--ui-type-body-size` | `--ui-weight-regular` | `--ui-line-height-body` |
  | local segmented tab | `--ui-type-label-size` | `--ui-weight-semibold` | `--ui-line-height-tight` |
  | tab count badge | `--ui-type-caption-size` | tab label 상속 | `--ui-line-height-tight` |

- top-level tab과 설명은 같은 body size를 사용할 수 있다. navigation은 semibold, 설명은 regular·secondary color로 역할을
  구분하며, 읽기 문장을 작게 줄여 hierarchy를 만들지 않는다. local tab은 label size로 한 단계 낮춘다.
- count badge는 별도 굵기 강조 없이 작은 크기·surface·radius로 보조 정보임을 표현한다.
- 선택 상태는 지속적인 surface·text 표현, hover는 일시적 반응, `focus-visible`은 keyboard 위치를 나타내는 ring으로 각각 구분한다.
- native checkbox와 선택 button도 브라우저 기본 outline에 맡기지 않고 현재 style의 focus token을 사용한다. focus ring은 checked/selected 표현을 대체하지 않는다.
- tab은 `aria-controls`/`aria-labelledby`, roving `tabindex`, 좌우 방향키와 `Home`/`End` 이동을 지원한다.
- tab 전환은 사용자가 읽던 page scroll을 임의로 초기화하지 않는다. 전환으로 숨겨지는 panel 안에 focus가 있었다면 새 선택 tab 또는 합리적인 첫 작업점으로 focus를 복구한다.

## 현재 검증 사례

- `블로그 Beta` 빠른 글 작성: 내용 지우기 / 글감 보관 / 대기열 추가 / 바로 포스팅
- `블로그 Beta` 빠른 글 작성 보조: AI Assist / 설정 summary disclosure / 내용 지우기 되돌리기
- `블로그 Beta` 키워드 분석·AI 제목 추천: 빈 입력·분석 loading / 글쓰기 모델 readiness와 설정 복구
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
- `설정` 기본 연결: 공용 top/local navigation / header Timer utility / 연결 상태 구분 / scoped 저장 및 갱신
- `카드뉴스` SNS 발행: 사전 조건을 통과한 inline 3단계 / selectable channel card / channel별 결과 및 부분 실패 재시도
- 공통 footer 외부 링크와 Blog Beta native time field: style별 field focus ring / native picker UI 예외

## 후속 검증 필요

- 대상 밖 view의 form과 modal action은 compatibility scope를 유지한다.
- 다른 제품 surface로 확산할 때 component token 누락과 특정 style 종속성을 계속 검증한다.
- style 선택 UI를 만들기 전 keyboard, narrow layout과 진행 중 상태를 다시 검증한다.
