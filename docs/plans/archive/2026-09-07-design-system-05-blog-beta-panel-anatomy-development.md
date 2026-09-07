# 디자인 시스템 5단계 — Blog Beta Panel Anatomy 개발 기록

## Branch

- Branch: `codex/feature/design-system-05-blog-beta-panel-anatomy`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 완료 — parent merge 준비

## 사용자 필요와 목표

Blog Beta의 다섯 top-level tab에서 같은 위치를 비교했을 때 첫 콘텐츠의 종류, 시작선, 여백과 선택 상태 표현이 서로 달랐다. 각 기능의 개성은 유지하면서도 사용자가 탭을 이동할 때 같은 제품 안에 있다는 예측 가능성과 안정적인 리듬을 느끼게 한다.

## 범위

1. 다섯 tab의 첫 viewport와 콘텐츠 시작 구조 조사
2. 공통 panel anatomy와 slot별 사용 기준 정의
3. content inset, 첫 의미 요소 시작선, heading hierarchy와 수직 rhythm 통일
4. selected, hover, focus-visible 상태 분리
5. tab 전환 시 scroll 위치와 focus 이동 계약 정립
6. desktop과 좁은 화면의 focused contract 및 browser 검증
7. 사용자 시각·탐색 검토를 위한 대표 흐름 정리

## 명시적 비범위

- 빠른 글 작성 내부 form의 progressive disclosure 재설계
- AI Assist 시각·상호작용 pattern의 최종 구현
- 기능 로직, 저장 형식, 발행 동작 변경
- 기존 `블로그` surface 또는 다른 제품 화면 migration
- style 선택 UI, release, push 또는 배포

## 제안 설계

모든 tab을 같은 화면으로 만들지 않고 공통 content frame 안에 다음 역할 기반 slot을 둔다.

1. **Intro**: 화면 목적과 사용자가 얻는 결과. 설명이 자명한 밀도 높은 작업 화면에서는 생략 가능하다.
2. **Local navigation**: mode switch나 하위 tab. 존재할 때 정해진 시작 위치와 간격을 사용한다.
3. **Status and tools**: 최신성, 필터, refresh처럼 primary content를 보조하는 상태와 도구.
4. **Primary content**: form, 목록, 카드 또는 설정 등 실제 작업 영역.

slot의 존재 여부는 기능 의미가 결정한다. 생략된 slot이 빈 여백을 남기지 않도록 spacing rule을 연결하고, 첫 번째로 존재하는 의미 요소는 공통 시작선에 맞춘다.

## 영향 경계

- Blog Beta top-level tab container와 tab panel markup
- panel 공통 layout/style token 및 component pattern
- tab 선택·keyboard focus와 scroll 처리
- UI structure/style contract tests와 browser smoke fixture
- Design Principles와 component pattern 문서의 panel anatomy 규칙

## 구현 단계

1. 현재 다섯 tab의 DOM, CSS, focus와 scroll 동작을 조사해 차이를 표로 기록한다.
2. 공통 anatomy와 선택적 slot, spacing·heading 계약을 문서와 contract test로 먼저 확정한다.
3. 공통 container/pattern을 구현하고 각 tab을 기능 변경 없이 이동한다.
4. selected·hover·focus-visible과 반응형 동작을 교정한다.
5. focused tests와 관련 browser smoke를 수행하고 사용자 시각 검토 흐름을 전달한다.

## 사용자와 결정한 사항

- Blog Beta의 탭별 첫 콘텐츠 불일치를 독립 일감으로 분석하고 개선한다.
- 공통화를 동일한 모양의 강제가 아니라 동일한 content inset, 시작선, 수직 간격과 heading hierarchy로 정의한다.
- 빠른 글 작성 대표 흐름 재설계는 이 단계의 공통 anatomy를 먼저 적용한 뒤 별도 Stage 6에서 진행한다.
- 모든 디자인 단계는 `codex/feature/design-system-main`에 모으며 전체 디자인 개편 완료 전에는 `dev`에 통합하지 않는다.
- Blog Beta의 모든 top-level panel에 동일한 `제목 + 한 줄 설명` intro를 둔다. 문구는 tab label을 반복하지 않고 사용자가 얻는 결과를 설명한다.
- 빠른 글 작성 mode switch와 글감 관리 local tab은 하나의 segmented navigation component로 통일한다. 글감 관리의 count badge와 refresh 역할은 유지한다.
- Quiet Sage Studio는 검증용 임시 theme가 아니라 사용자 승인과 확장성 검증을 마친 두 번째 정식 style로 취급한다.
- 트렌드 category 선택 button과 Blog Beta checkbox의 브라우저 기본 황적색 focus outline은 의도하지 않은 적용 gap이다. checked/selected 상태를 유지하면서 현재 style의 focus token으로 교정한다.

## 대안과 tradeoff

- 각 tab의 현재 구조를 유지하고 여백만 보정하면 변경 위험은 작지만 구조적 불일치가 계속된다.
- 모든 tab에 intro와 toolbar를 강제하면 표면은 정돈되지만 단순 설정 화면에 불필요한 요소가 생긴다.
- 따라서 역할 기반의 선택적 slot과 공통 시작 규칙을 사용한다. 구조 변경은 수반되지만 기능별 밀도와 의미를 보존할 수 있다.

## 완료 조건

- 다섯 tab이 문서화된 panel anatomy를 따른다.
- 첫 의미 요소의 시작선과 기본 inset·수직 rhythm이 대표 viewport에서 일관된다.
- selected, hover, focus-visible이 시각적으로 구분된다.
- tab 전환의 scroll·focus 계약이 자동 검증된다.
- 관련 focused tests와 browser smoke가 통과한다.
- 사용자가 대표 desktop 및 좁은 화면을 직접 확인하고 Stage 5 완료를 승인한다.

## 검증 계획

- 구현 중: 변경 경계를 다루는 focused contract tests
- reviewable slice 완료 시: 관련 Blog Beta browser smoke
- full unit suite: sub-feature merge 후보가 준비된 뒤 사용자에게 수행 시점과 범위를 설명하고 승인받아 실행
- 수동 확인: 다섯 tab의 첫 viewport, mouse/keyboard tab 전환, 좁은 화면과 scroll 복원

## 현재 위험과 후속 작업

- 기존 tab별 markup 결합도가 높으면 공통 container 추출 과정에서 기능 selector가 깨질 수 있다.
- 브라우저별 native focus 동작과 scroll restoration 차이를 명시적으로 확인해야 한다.
- native date/time picker indicator의 내부 focus 색은 Electron/Chromium 소유 known issue로 허용한다. 정확한 style 통일에는 별도 custom trigger가 필요하며 이번 stage에서는 도입하지 않는다.
- 빠른 글 작성 내부 정보구조와 AI Assist는 Stage 6으로 남긴다.

## 진행 기록

- 2026-09-07: parent에서 Stage 5 sub-feature branch를 시작하고 범위, 비범위, anatomy 초안과 완료 조건을 기록했다.
- 2026-09-07: 현재 markup과 style을 조사했다. 다섯 panel은 공통 outer card만 공유하고 첫 요소의 역할은 각각 local navigation, 우측 status/tool, local navigation과 tool의 결합, intro, enable control로 달랐다.
- 2026-09-07: top-level tab button에는 `aria-controls`가 있으나 고유 `id`, panel의 `aria-labelledby`, 비선택 tab의 roving `tabindex`, 좌우·Home·End keyboard 이동이 없음을 확인했다. 선택 상태와 focus-visible의 분리, tab 전환 시 scroll 안정성도 자동 계약이 없었다.
- 2026-09-07: 공통 `panel lead`, `intro`, `local navigation` role class를 도입했다. 빠른 글 작성과 글감 관리는 local navigation, 스마트 댓글은 기존 intro를 연결하고, 트렌드와 연속 발행에는 기능 결과를 설명하는 intro를 추가했다.
- 2026-09-07: top-level tab과 panel의 양방향 accessible naming, roving `tabindex`, 좌우·Home·End keyboard 이동을 구현했다. mouse 선택과 keyboard focus ring이 별도 상태로 보이도록 `focus-visible` 규칙을 추가했다.
- 2026-09-07: panel anatomy style을 독립 CSS module로 분리해 기존 900줄 module boundary를 유지했다.
- 2026-09-07: focused contract 29개와 browser UI smoke를 통과했다. browser smoke는 다섯 panel의 공통 시작선·최소 lead 높이, keyboard 이동, scroll 안정성과 기존 Blog Beta 흐름을 포함해 217 fixture request를 검증했다.
- 2026-09-07: 사용자 시각 검토에 따라 빠른 글 작성과 글감 관리에도 공통 intro를 추가하고, 다섯 intro가 같은 DOM·typography·최소 높이를 사용하도록 정규화했다.
- 2026-09-07: 빠른 글 작성과 글감 관리의 local navigation을 공통 segmented component로 통합하고 refresh는 별도 tool group으로 유지했다.
- 2026-09-07: keyboard 탐색에서 발견된 category 선택 button과 checkbox의 브라우저 기본 황적색 outline을 Blog Beta 범위의 `--ui-focus-ring`으로 교체했다.
- 2026-09-07: 사용자 feedback 반영 후 focused contract 29개와 browser UI smoke를 다시 통과했다. 최종 browser 검사는 공통 intro 5개, segmented navigation 2개, 계산된 선택 배경 일치와 checkbox focus ring을 포함해 218 fixture request를 검증했다.
- 2026-09-07: 통합한 segmented navigation에서 Quiet Sage의 track과 selected surface 대비가 너무 낮아 선택을 식별하기 어렵다는 사용자 feedback을 확인했다. selected에는 primary soft 채움과 inset border를, hover에는 중립 surface를 사용하고 count badge를 selected surface와 분리했다.
- 2026-09-07: 첫 browser 재검사에서 글감 관리의 기존 후행 selector가 공통 selected 배경을 덮는 cascade 충돌을 발견했다. 공통 segmented selector의 component 경계를 명확히 해 두 local navigation이 실제 계산 스타일에서도 같도록 교정했다.
- 2026-09-07: cascade 교정 후 focused contract 26개와 browser UI smoke를 통과했다. 최종 browser 검사는 두 segmented navigation의 selected 계산 배경 일치, track과의 대비 및 inset 경계를 포함해 219 fixture request를 검증했다.
- 2026-09-07: keyboard 탐색에서 공통 footer 외부 링크와 native time picker trigger에 브라우저 기본 황적색 outline이 남는 것을 확인했다. footer는 공통 style focus token에 연결하고, Blog Beta time input은 내부 trigger outline 대신 전체 field의 style focus ring을 사용하도록 교정했다.
- 2026-09-07: 펼쳐진 native date/time popup의 색상과 내부 선택 UI는 운영체제·브라우저 소유 예외로 유지하고 custom picker를 만들지 않기로 사용자와 합의했다.
- 2026-09-07: 첫 dual-style browser 검사에서 스크립트 `focus()`가 link의 `:focus-visible`을 재현하지 못해 기본 shadow만 측정했다. 실제 사용자 동작과 같은 Tab 이동으로 검사를 수정했다.
- 2026-09-07: 수정 후 focused contract 38개와 browser UI smoke를 통과했다. browser 검사는 footer link와 time field가 Warm Editorial·Quiet Sage에서 서로 다른 focus token을 사용하고, Chromium picker indicator의 별도 outline이 제거되는 것을 포함해 224 fixture request를 검증했다.
- 2026-09-07: 사용자 keyboard 재검토에서 time picker indicator의 outline 제거가 내부 focus 위치를 보이지 않게 만든 회귀를 확인했다. indicator의 native focus 시점과 keyboard 동작은 유지하고 outline 색만 style token으로 바꾸도록 수정했으며, 세 빠른 글 작성 mode의 `datetime-local` 달력 indicator에도 같은 계약을 적용했다.
- 2026-09-07: `outline-color`만 지정한 첫 교정은 Chromium의 picker indicator 계산 스타일에서 style token 적용을 신뢰할 수 없어 browser 검사에 실패했다. host input의 keyboard focus 시 indicator에 token 기반 outline 전체를 명시하도록 교정하고, shadow UI 내부 focus 도달은 사용자 수동 확인 항목으로 유지했다.
- 2026-09-07: 최종 교정 후 focused contract 38개와 browser UI smoke를 통과했다. browser 검사는 time field의 Tab 진입과 두 정식 style focus ring을 포함해 223 fixture request를 검증했다. native clock/calendar indicator의 내부 Tab 위치 표시는 사용자 재확인이 필요하다.
- 2026-09-07: 사용자 재검토에서 host input의 `:focus-visible`에 picker indicator outline을 연결한 규칙이 field 내부 텍스트 focus에도 아이콘 ring을 표시하고, 정작 indicator 자체 focus에는 Chromium 기본 ring이 남는 역전 현상을 확인했다. Chromium이 지원하는 `::-webkit-calendar-picker-indicator:focus`로 대상을 좁혀 field와 trigger의 focus 위치를 분리했다.
- 2026-09-07: indicator focus 대상 교정 후 focused contract 26개와 browser UI smoke를 통과했다. browser 검사는 224 fixture request를 검증했으며, Chromium shadow UI의 실제 indicator focus ring 색은 사용자 수동 재확인이 필요하다.
- 2026-09-07: 사용자 수동 재확인에서 indicator 자체 focus에는 여전히 Chromium 기본 황적색 ring이 적용됨을 확인했다. selector 존재와 실제 author style 적용은 별개였으며, focus 표시 제거와 custom trigger 구현 모두 비용 대비 부적절하다고 판단했다. 효과 없는 override를 제거하고 native picker 내부 focus 색을 known issue 및 style pack 예외로 확정했다.
- 2026-09-07: 세 빠른 글 작성 mode 중 바로 생성의 첫 필드만 10px 낮게 시작하는 것을 확인했다. 별도 의미 없는 topic form 전용 `margin-top`을 제거하고 공통 mode panel padding을 단일 시작 기준으로 삼았다.
- 2026-09-07: 최종 정렬 교정 후 focused contract 27개와 browser UI smoke를 통과했다. browser 검사는 225 fixture request를 검증했으며, 사용자가 대표 화면과 keyboard focus를 직접 확인해 Stage 5 UI 검토를 완료했다.
- 2026-09-07: parent merge gate Full TC 첫 실행에서 1,488 passed, 1 failed, 1 skipped를 확인했다. 기능 실패가 아니라 Stage 5 markup 증가로 `blog-next.html`이 524줄이 되어 partial 500줄 구조 경계를 넘은 문제였다. 연속 발행 panel을 하위 partial로 분리하고 HTML 계약들이 composed view를 검증하도록 교정했다.
- 2026-09-07: 두 번째 Full TC에서 구조 경계는 회복됐으나 디자인 action 계약 한 곳이 조합 전 원본 partial을 읽어 분리된 연속 발행 action을 찾지 못했다. 이 계약도 composed view를 읽도록 교정했다.
- 2026-09-07: 관련 구조·디자인 계약 41개를 통과한 뒤 세 번째 Full TC에서 1,489 passed, 0 failed, 1 skipped를 확인했다. Stage 5의 구현, 사용자 UI 검토와 parent merge gate 검증이 모두 완료됐다.

## 현황 조사

| Tab | 현재 첫 요소 | 역할 판단 | 주요 불일치 |
| --- | --- | --- | --- |
| 빠른 글 작성 | 입력 mode switch | Local navigation | panel 목적/구조를 나타내는 공통 wrapper 없음 |
| 트렌드 포스팅 | 최신 데이터 badge와 icon refresh | Status and tools | 우측에만 놓여 왼쪽 시작선이 비고 primary content와의 관계가 약함 |
| 글감 관리 | 상태 local tab과 text refresh | Local navigation + tools | 두 역할이 하나의 시각 container에 결합됨 |
| 스마트 댓글 | 제목·설명 intro | Intro | 유일하게 명시적인 heading hierarchy를 가짐 |
| 연속 발행 설정 | enable checkbox | Primary control | 설명 없이 설정 본문이 바로 시작되고 heading 연결이 없음 |

공통 개선 방향은 각 첫 요소를 역할 slot으로 명명하고 동일한 panel inset과 slot 간 gap을 적용하는 것이다. Trend의 우측 status/tool은 빈 top row로 남기지 않고 의미 있는 intro 또는 primary query와 관계가 드러나는 header composition으로 정리한다. Queue는 local navigation과 tools를 같은 row에 둘 수 있지만 각각의 role wrapper를 분리한다.

## 최종 결과 및 검증

- 구현 결과: 공통 panel anatomy와 역할 slot, 트렌드·연속 발행 intro, accessible top-level tab 관계와 keyboard navigation 적용
- canonical guide: panel 시작 문법, 선택·hover·focus-visible 분리와 scroll/focus 원칙 추가
- focused contract: 27 passed, 0 failed
- browser UI smoke: passed, 225 fixture requests
- syntax 및 diff whitespace 검사: 통과
- 사용자 수동 확인: 대표 panel 시작점, local selected 상태, checkbox·link·native date/time keyboard focus를 확인했다. native picker 내부 황적색 focus ring은 known issue로 승인했다.
- full unit suite: 1,489 passed, 0 failed, 1 skipped
