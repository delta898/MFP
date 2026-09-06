# 디자인 시스템 3단계 첫 정식 Style 개발 기록

## Branch

- Branch: `codex/feature/design-system-03-first-style`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-06
- Status: 완료 — 사용자 시각 확인, 자동 검증 및 Gate 2 합의 완료

## 사용자 필요

2단계에서 만든 다중 style 기반 위에 BlogGenius의 첫 정식 시각 스타일을 만든다. 단순히 색상 theme를 교체하는 데 그치지 않고, 제품이 더 아름답고 편리해지도록 공통 행동 위계와 반복 component를 정리하면서도 기존 기능·상태·접근성 계약을 보존해야 한다.

사용자는 현재 compatibility 화면에서 완료형 form의 action이 왼쪽에 모인 점과 파란색·짙은 slate색 filled button이 서로 경쟁하는 점을 개선 대상으로 확인했다. 큰 문제가 아니면 즉시 임의 수정하지 않고 원칙과 가이드를 먼저 정립한 뒤 일관되게 적용하기로 했다.

## 목표

1. 사용자가 선택한 하나의 시각 방향을 첫 정식 style pack으로 구현한다.
2. 공통 shell과 `블로그 Beta`에 같은 semantic/component contract로 적용한다.
3. button, form action, field, card, status와 focus의 반복 규칙을 공통 component/pattern으로 정리한다.
4. 완료형 form의 primary action을 inline-end 하단에 두고 secondary·destructive action의 위계를 분리한다.
5. 비대상 surface가 compatibility와 새 style의 불완전한 혼합으로 깨지지 않도록 적용 경계를 검증한다.
6. 기능, DOM, ARIA, keyboard order, 사용자 입력과 마지막 정상 결과 보존을 style과 분리한다.
7. 구현 및 사용자 시각 검토 후 Design Principles Gate 2를 수행한다.

## 범위

### 포함

- 첫 style의 visual direction brief와 사용자 합의
- palette, typography, spacing/density, radius, elevation, focus, state와 motion 값
- 첫 정식 style pack 및 registry 연결
- button과 form action group의 공통 variant/pattern
- 핵심 field, card, status, loading/error와 focus 표현
- 공통 shell, sidebar/navigation, topbar, clock, 전역 상태 적용
- `블로그 Beta` quick writing, topics/queue, management, automation, Smart Comment 적용
- 비대상 surface의 compatibility containment 조사 및 필요한 최소 보호
- focused contract, browser smoke, 전체 단위 회귀와 사용자 시각 검토
- Gate 2 원칙별 적용 사례·충돌·수정 여부 기록

### 명시적 비범위

- style 선택 UI와 사용자 설정 저장
- 두 번째 정식 style과 별도 dark theme 축
- Dashboard, 설정, 카드뉴스, SNS, 쇼핑커넥트와 legacy `블로그`의 전면 redesign
- 모든 raw value와 inline style의 일괄 제거
- feature 기능, 정보 구조, API와 데이터 소유권 변경
- style별 DOM 또는 feature JavaScript 분기
- 발견한 모든 경미한 UI 문제의 즉시 수정
- version, release, tag, push와 배포

## 제안 산출물

1. **Visual Direction Brief**: 스타일 성격, 색상·서체·형태·밀도·motion 방향과 Do/Don't
2. **First Style Pack**: semantic 및 필요한 component token 값
3. **Component & Pattern Guide v0.1**: button, form action, field, card, status와 focus 규격
4. **공통 shell 적용**: navigation, topbar, clock와 전역 상태
5. **`블로그 Beta` 적용**: 핵심 작성·관리·자동화 flow
6. **Compatibility containment**: 비대상 surface 보호 경계와 검증
7. **검증 자료**: token/DOM/ARIA/상태/반응형 contract, browser smoke와 사용자 확인 flow
8. **Gate 2 기록**: 원칙별 실제 적용 근거와 사용자 합의

## 구현 단계

### Work 1. 현행 시각·component 감사

- 공통 shell과 `블로그 Beta`의 대표 상태와 selector 경계를 목록화한다.
- semantic token 밖에 남은 핵심 raw 시각 결정과 중복 button/field/card 규칙을 찾는다.
- 비대상 surface가 전역 semantic/legacy alias를 통해 영향을 받는 경로를 확인한다.
- 기능을 막는 결함과 후속 backlog로 보낼 개선점을 구분한다.

### Work 2. 시각 방향 후보 및 사용자 합의

- 서로 구분되는 2~3개 방향을 같은 평가 항목으로 제안한다.
- 파란색·검정 중심의 현행 조합을 기본값으로 반복하지 않는다.
- primary 강조색, neutral 관계, typography, radius, elevation과 density를 함께 비교한다.
- 사용자가 하나를 선택하고 조정한 뒤에만 style 구현을 시작한다.

### Work 3. 공통 component와 action pattern

- primary, secondary, tertiary와 danger action의 의미·상태·시각 강도를 고정한다.
- 완료형 form action group의 desktop/mobile 배치와 keyboard order를 구현한다.
- field, card, status와 focus 중 반복성이 확인된 최소 규칙만 승격한다.
- feature 이름이나 특정 style 이름에 결합된 variant를 만들지 않는다.

### Work 4. 첫 style pack과 containment

- 승인된 방향을 semantic/component token 값으로 구현하고 registry에 연결한다.
- `compatibility`는 fallback과 회귀 비교 기준으로 유지한다.
- 공통 shell과 대상 surface에는 첫 style을 완결되게 적용하고 비대상 surface에는 필요한 compatibility 경계를 둔다.
- style 전환이나 fallback이 DOM 재생성·feature 분기를 요구하지 않게 한다.

### Work 5. 공통 shell과 `블로그 Beta` 적용

- shell부터 적용하고 focused/browser 검증 후 `블로그 Beta`로 이동한다.
- quick writing, queue/management, automation과 Smart Comment의 default/hover/focus/active/disabled/loading/error 상태를 확인한다.
- 사용성 결함은 목표 달성에 필요한 것만 수정하고 나머지는 근거와 함께 후속 작업으로 남긴다.

### Work 6. 검증, 사용자 확인과 Gate 2

- token completeness, 금지된 결합과 compatibility containment를 자동 검사한다.
- 관련 UI contract와 browser smoke, 전체 단위 suite를 실행한다.
- 사용자가 desktop, 좁은 화면, keyboard와 대표 Blog Beta flow의 시각 완성도를 확인한다.
- 각 Design Principle의 실제 적용 사례와 충돌을 `유지`, `수정`, `보류`로 검토하고 사용자와 합의한다.

## 완료 조건

- 사용자가 visual direction과 대표 화면을 승인한다.
- 하나의 action group에서 여러 filled button이 같은 강도로 경쟁하지 않는다.
- primary, secondary, tertiary와 danger의 의미와 표현이 일관된다.
- 공통 shell과 `블로그 Beta`의 핵심 시각 결정이 style/component contract를 통한다.
- 비대상 surface가 치명적인 혼합 style로 깨지지 않는다.
- desktop, 좁은 화면, keyboard focus와 주요 상태가 검증된다.
- 기능·DOM·ARIA·상태·입력 보존 회귀가 없다.
- focused tests, browser smoke와 full unit suite가 통과한다.
- Design Principles Gate 2와 사용자 합의가 완료된다.

## 사용자와 합의한 결정

- 3단계는 첫 정식 style 적용 단계다.
- 구현 전 시각 방향을 먼저 합의한다.
- 첫 적용 범위는 공통 shell과 `블로그 Beta`다.
- compatibility style은 fallback과 비교 기준으로 유지한다.
- 완료형 form/dialog의 primary action은 inline-end 하단에 두고 secondary와 destructive action의 위계를 분리한다.
- 현행의 파란색·짙은 slate색 button 조합을 새 style의 기본 방향으로 간주하지 않는다.
- 경미한 문제는 즉시 개별 수정하지 않고 원칙·가이드·공통 pattern을 통해 이후 일관되게 적용한다.
- style 선택 UI는 두 개 이상의 검증된 정식 style이 준비된 뒤 제공한다.
- Gate 2 합의 전에는 확장성 검증 단계로 넘어가지 않는다.

## 중단 및 재합의 기준

- 비대상 surface를 보호하려면 대규모 DOM 변경이나 전면 migration이 필요한 경우
- style 방향이 정보 구조나 feature 행동 변경을 요구하는 경우
- 공통 component 승격이 기존 접근성·keyboard contract를 바꾸는 경우
- 사용자 선택이 운영 비용이 큰 신규 font, asset 또는 외부 의존성을 요구하는 경우
- 첫 style 하나를 위해 semantic contract에 과도한 예외가 생기는 경우

## 진행 및 변경 기록

- 2026-09-06: `codex/feature/design-system-main`에서 3단계 sub-feature branch를 시작했다.
- 2026-09-06: 목표, 범위, 산출물, Work 1~6과 중단 기준을 기록했다.
- 2026-09-06: 1차 component 감사를 수행했다. 전역 `button.primary/secondary` 규칙이 대상 밖 surface에도 적용되고, Blog Beta에는 quick form, draft, automation, Smart Comment별 action group이 따로 존재해 공통 action pattern이 필요함을 확인했다.
- 2026-09-06: 새 style의 root semantic token은 legacy alias를 통해 미이전 surface에도 전달될 수 있으므로, 첫 style 적용 전에 compatibility containment를 contract와 test로 고정해야 함을 확인했다.
- 2026-09-06: 대상 CSS에는 시계의 계절 표현처럼 component가 소유할 값과 아직 의미를 분류해야 할 raw color가 함께 남아 있다. raw value 개수 자체를 목표로 삼지 않고 공통 결정과 component 고유 결정을 구분해 이전한다.
- 2026-09-06: 같은 Blog Beta form/action 구조로 `따뜻한 에디토리얼`, `고요한 세이지`, `소프트 플럼` 세 시각 방향 후보를 준비했다. 모두 primary를 하나의 filled action으로 제한하고 secondary를 outline, destructive action을 분리한 동일한 위계를 사용한다.
- 2026-09-07: 사용자가 A안 `따뜻한 에디토리얼`을 첫 정식 style 방향으로 선택했다. canonical visual direction 문서를 만들고 구현을 시작했다.
- 2026-09-07: `warm-editorial` style pack, 비대상 view의 명시적 compatibility scope와 공통 action pattern의 초기 구현을 추가했다. Blog Beta 빠른 작성 action은 destructive, secondary, primary 순서가 시각·keyboard 순서와 일치하도록 DOM과 layout을 함께 정리했다.
- 2026-09-07: Blog Beta의 field-level AI 보조 action을 secondary로 낮추고, 연속 발행 설정과 공통 dialog의 secondary-primary 순서를 완료 방향과 일치시켰다. 공통 card는 style별 hover elevation을 선택할 수 있게 해 Warm Editorial에서는 비상호작용 card의 불필요한 lift를 제거했다.
- 2026-09-07: shell navigation, update/help/footer, 전역 발행 상태와 Blog Beta validation/focus 표현의 blue·slate raw 결정을 semantic token으로 이전했다. clock의 계절색처럼 독립적인 component 의미가 있는 값은 유지했다.
- 2026-09-07: 첫 focused run에서 새 action 순서와 semantic color를 과거 literal로 고정한 테스트 3건을 발견했다. 사용자-visible contract가 바뀐 quick action 순서는 새 순서로, 순수 style literal 검사는 semantic token 검증으로 교정했다. feature CSS가 900줄 경계를 넘은 문제는 action 규칙을 공통 pattern 파일로 이동해 해결했다.
- 2026-09-07: 첫 browser smoke도 과거 action 순서와 compatibility 흰색을 직접 기대해 중단됐다. warm root, containment, primary/secondary 계산 style을 검증하도록 보강한 뒤 204 fixture request smoke가 통과했다.
- 2026-09-07: legacy Blog와 Shopping edit modal에는 compatibility scope를 명시하고, Blog Beta에서도 쓰는 공통 dialog는 shared action pattern을 사용하게 했다. 이로써 비대상 feature overlay와 대상 공통 overlay의 경계를 분리했다.
- 2026-09-07: focused contract, browser UI smoke, Blog automation API smoke와 full unit suite를 모두 통과해 사용자 시각 확인 후보를 완성했다.
- 2026-09-07: 사용자가 대표 화면의 `따뜻한 에디토리얼` 시각 결과를 승인했다. 다만 `오늘의 발견` 카드의 `관심 없음` hover에서 feature 전용 상태와 공통 secondary hover가 충돌해 짙은 배경과 빨간 글자가 섞이는 실제 결함을 발견했다.
- 2026-09-07: `관심 없음`은 파괴적 행동이 아니라 낮은 위계의 선호 피드백이므로 danger가 아닌 neutral 상태로 분류하고 이 구분을 component guide에 명문화했다. hover selector를 공통 action보다 명확한 component 상태로 고정하고, muted surface·secondary text·무이동 표현이 끝까지 적용되는 browser 회귀 검사를 추가했다. 수정 후 browser UI smoke가 통과했다.
- 2026-09-07: 사용자 확인에서 `트렌드 조회`가 primary임에도 짙은 slate색으로 표시되는 문제를 발견했다. 전체 primary/secondary override를 검사한 결과, legacy `.auto-manual-row button` 색상 규칙이 Blog Beta의 semantic primary를 덮고 있었고, Blog Beta가 사용하는 discovery modal footer에도 같은 종류의 legacy variant override가 남아 있었다.
- 2026-09-07: 공통 row/modal 규칙은 크기·배치만 소유하도록 줄이고, 과거 색상 보존이 필요한 legacy modal과 view의 시각 규칙은 명시적인 compatibility scope 아래로 제한했다. Blog Beta의 `트렌드 조회`와 discovery modal action이 Warm Editorial component token을 사용하는 browser 회귀 검사를 추가했다.
- 2026-09-07: Blog Beta 기준 화면 검토에서 부분 데이터 갱신은 icon, 글감 관리 전체 갱신은 text button으로 달랐고 checkbox는 browser 기본 blue accent를 사용하고 있음을 확인했다. 차이를 제거하는 대신 갱신 범위에 따라 icon tertiary와 명시적 secondary를 선택하고, 조건 실행은 primary `조회`로 구분하는 기준을 component guide에 추가했다.
- 2026-09-07: 부분 갱신 icon의 크기·hover·focus·loading을 공통 refresh action pattern으로 승격하고 접근 가능한 이름과 tooltip 계약을 고정했다. checkbox/radio는 native 동작을 유지하면서 style의 `--ui-action-primary`를 accent로 사용하도록 공통 selection-control pattern을 추가했다. compatibility scope에서는 기존 blue, Warm Editorial에서는 terracotta를 사용한다.
- 2026-09-07: 전체 회귀에서 과거 feature 전용 refresh loading selector를 고정한 contract 1건이 실패했다. 공통 pattern으로 이동한 실제 소유권과 DOM class를 검사하도록 테스트를 현행화했으며 기능 또는 사용자-visible 동작의 실패는 아니었다.
- 2026-09-07: 사용자가 동일한 세로 위치에서 촬영한 다섯 Blog Beta tab을 비교했다. 빠른 글 작성은 mode switch, 트렌드는 우측 최신 데이터 utility, 글감 관리는 local tab과 refresh, 스마트 댓글은 title/description intro, 연속 발행은 enable checkbox로 시작해 top-level panel의 첫 정보 역할과 시작선이 모두 달랐다.
- 2026-09-07: 클릭해 전환한 tab에는 주황 outline이 남지만 최초 active인 빠른 글 작성에는 나타나지 않아 selected 상태와 focus 상태가 시각적으로 겹치는 문제도 확인했다. keyboard focus 자체는 보존하되 active, hover, focus-visible을 서로 다른 상태로 정의해야 한다.
- 2026-09-07: 이 문제는 첫 style의 색상 수정이 아니라 다섯 panel의 정보구조와 공통 anatomy 작업이므로 현재 3단계에서 UI를 변경하지 않는다. `Blog Beta 탭 구조와 콘텐츠 시작점 일관성`을 먼저 수행하고, 그 공통 shell 위에서 `빠른 글 작성 대표 흐름 재설계`를 수행하는 두 독립 P1 일감으로 backlog에 등록했다.

## 후속 독립 일감 분석

### A. Blog Beta 탭 구조와 콘텐츠 시작점 일관성

#### 관찰

| Tab | 현재 첫 요소 | 사용자가 처음 인식하는 역할 | 불일치 |
| --- | --- | --- | --- |
| 빠른 글 작성 | 바로 생성 / 원고 폴더 / 원고 붙여넣기 mode switch | 입력 방식 선택 | 목적 설명 없이 두 번째 navigation부터 시작한다. |
| 트렌드 포스팅 | 우측 최신 데이터 badge와 icon refresh | 보조 상태·도구 | 핵심 작업보다 utility가 먼저 보이고 상단 공백이 크다. |
| 글감 관리 | 발행 대기열 / 보관한 글감 local tab과 refresh | 하위 navigation | tab 안에서 다시 tab으로 시작하지만 이 계층을 설명하는 intro가 없다. |
| 스마트 댓글 | title, badge와 description | 기능 목적 | 다섯 화면 중 유일하게 명시적인 panel intro를 가진다. |
| 연속 발행 설정 | 연속 발행 사용 checkbox | 설정 control | 기능 목적·현재 상태 요약 없이 form fragment로 시작한다. |

#### 원인

- top-level panel은 공통 card padding과 flex gap만 공유하고 내부 첫 요소의 역할을 정의하지 않는다.
- 각 feature가 성장하면서 mode switch, utility, local tab, intro와 form을 독립적으로 첫 위치에 추가했다.
- content inset은 비슷하지만 첫 요소의 높이·정렬·margin이 달라 tab 전환 때 화면이 위아래·좌우로 흔들려 보인다.
- top-level tab은 active 표현은 있지만 명시적인 focus-visible pattern이 없어 pointer 선택 뒤 browser outline이 상태 표현처럼 남을 수 있다.

#### 후보 설계 원칙

1. **같은 좌표보다 같은 문법**: 모든 panel은 `intro → local navigation/summary → primary content` slot을 공유하되 필요 없는 slot은 생략할 수 있다.
2. **첫 의미 요소의 안정성**: panel의 content inset과 첫 slot 시작선을 공통 contract로 고정한다.
3. **목적이 도구보다 먼저**: refresh, badge, enable checkbox 같은 utility/control은 기능의 목적 또는 현재 상태보다 먼저 화면의 주인공이 되지 않는다.
4. **중첩 navigation의 계층 표시**: top-level tab과 mode/local tab은 radius, 크기, 배경과 간격으로 계층을 구분한다.
5. **상태 분리**: selected는 현재 위치, hover는 탐색 가능성, focus-visible은 keyboard 위치만 표현한다.
6. **정적 대칭을 강제하지 않음**: task, list와 settings panel은 내용이 다르므로 같은 높이나 동일한 component를 강제하지 않는다.

#### 다음 구현 범위

- 다섯 panel의 공통 anatomy component/class와 desktop/narrow spacing contract
- 목적 중심 title/description 또는 compact summary의 tab별 적용 여부 결정
- mode switch, local tab, status utility와 enable control의 slot 재배치
- active/hover/focus-visible 상태 및 tab keyboard contract
- tab 전환 시 scroll/focus 보존과 첫 slot bounding-box browser 검증
- 빠른 글 작성 내부 field 재구성은 제외하고 후속 일감에 연결

### B. 빠른 글 작성 대표 흐름 재설계

- 기본 화면에는 주제, 키워드, 제목, 사용자 경험·요청과 AI Assist를 중심으로 둔다.
- 참고 자료, 글쓰기/이미지 설정과 발행 세부 control은 접을 수 있지만 현재 적용값과 위험한 실행 결과를 summary로 유지한다.
- `AI Assist`는 일반 secondary보다 식별 가능하되 primary보다 강하지 않은 별도 semantic candidate로 실제 화면에서 검증한다.
- A의 공통 panel anatomy를 먼저 적용해 shell과 내부 form 재설계가 서로 같은 영역을 반복 수정하지 않게 한다.

## 최종 결과 및 검증

- `따뜻한 에디토리얼` style pack과 공통 action/card pattern 구현 완료
- 공통 shell과 `블로그 Beta` 적용, 비대상 view 및 legacy edit modal compatibility containment 완료
- focused style/shell/Blog Beta contracts: 51 passed, 0 failed
- browser UI smoke: passed, 204 fixture requests
- Blog automation API smoke: passed
- full unit suite: 1,482 passed, 0 failed, 1 skipped
- 사용자 시각 확인: 대표 화면 승인 완료 (`관심 없음` hover 후속 결함 수정 포함)
- Gate 2 합의: Product Experience Principles 8개 모두 `유지`; 확인된 적용 gap은 후속 P1 일감으로 분리
- commit, merge, release, tag, push, 배포: 수행하지 않음

## Gate 2 검토 결과

2026-09-07 사용자와 Product Experience Principles 8개를 모두 `유지`하기로 합의했다. 첫 정식 style이 원칙에 따라 실제 시각·행동 결정을 안내했음을 확인했으며, 빠른 글 작성의 과밀도와 tab별 시작 문법 차이는 원칙 자체의 결함이 아니라 적용이 더 필요한 영역으로 판단해 두 독립 P1 일감으로 분리했다.

| 원칙 | 결정 | 첫 style 적용 근거와 후속 사항 |
| --- | --- | --- |
| 1. 사용자의 목적이 화면의 주인공이다 | 유지 | 빠른 작성의 최종 primary를 하나로 제한하고 field-level AI 보조 action을 secondary로 낮췄다. 사용자 시각 검토에서 action 위계를 승인했다. |
| 2. 아름다움은 차분한 명료함에서 나온다 | 유지 | warm surface, ink neutral, 낮은 elevation을 사용하고 비상호작용 card의 hover lift를 제거했다. 사용자가 대표 화면의 시각 방향을 승인했다. |
| 3. 시작은 단순하게, 필요한 깊이는 가까이에 둔다 | 유지 | style 선택 UI를 추가하지 않았고 기존 flow를 보존했다. 사용자 검토에서 빠른 글 작성의 과밀도와 tab별 시작 문법 차이를 실제 적용 gap으로 확인해 두 독립 P1 일감으로 등록했다. 원칙 자체는 수정하지 않는다. |
| 4. 시스템 상태가 보이면 신뢰가 생긴다 | 유지 | 전역 발행 상태와 Blog Beta validation을 의미별 status token으로 분리했고 상태 contract가 통과했다. |
| 5. 사용자의 작업은 가능한 한 이어져야 한다 | 유지 | style과 action class 변경이 입력·마지막 결과·실행 상태를 지우지 않으며 관련 회귀와 browser flow가 통과했다. |
| 6. 같은 의미는 같은 방식으로 표현한다 | 유지 | 공통 action/card component token과 form action pattern을 만들고 quick, automation, Smart Comment, dialog에 같은 위계를 적용했다. |
| 7. 접근성과 반응형 동작은 기본 품질이다 | 유지 | DOM과 keyboard 순서를 시각 순서에 맞추고 focus ring·disabled·reduced motion·narrow stacking 계약을 유지했다. top-level tab의 selected/focus-visible 분리는 후속 panel anatomy 일감에 포함했다. |
| 8. 스타일은 달라져도 제품은 낯설어지지 않는다 | 유지 | root style과 feature 행동을 분리하고, 비대상 view/modal은 명시적인 compatibility scope로 보호했다. 기능·DOM contract와 browser smoke가 통과했다. |

### 구현에서 확인한 tradeoff

- first style의 전역 semantic token을 바로 적용하면 legacy alias를 통해 미이전 surface에 부분적으로 전파된다. 전면 migration 대신 view/modal 단위의 명시적 compatibility scope를 두었고, 후속 surface migration 때 해당 scope를 하나씩 제거한다.
- warm 느낌을 서체 변화만으로 과장하지 않고 한국어 가독성과 배포 안정성을 위해 기존 sans 계열을 유지했다.
- 시계의 계절색은 primary action과 다른 component 의미이므로 제거하지 않았다. 다만 실제 화면에서 primary와 경쟁하는지는 사용자 검토 대상으로 남긴다.
