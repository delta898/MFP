# 디자인 시스템 4단계 확장성 검증 개발 기록

## Branch

- Branch: `codex/feature/design-system-04-extensibility-validation`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 완료 — 사용자 시각 확인, 자동 검증 및 Gate 3 `v1.0` 승격 합의 완료

## 사용자 필요

첫 정식 style인 `따뜻한 에디토리얼`이 보기 좋은 단일 결과에 머무르지 않고, 다른 시각 체계도 같은 기능·DOM·접근성 계약 위에서 교체 가능해야 한다. 구조 검증이 끝나기 전에 Blog Beta의 정보 구조를 크게 바꾸거나 다른 제품 surface로 확산해 첫 style의 우연한 결합을 복제하지 않는다.

## 목표

1. 작고 명확하게 대비되는 두 번째 검증 style pack으로 다중 style 계약을 실제로 검증한다.
2. Warm Editorial에만 맞춘 raw value, selector, component 예외와 의미가 부족한 semantic token을 찾는다.
3. style 변경이 기능, DOM, ARIA, keyboard 순서, 입력과 마지막 정상 결과를 바꾸지 않음을 확인한다.
4. compatibility, Warm Editorial과 검증 style의 적용·fallback·containment 경계를 자동화된 계약으로 고정한다.
5. Gate 3에서 Design Principles와 style contract의 `v1.0` 승격 여부를 사용자와 결정한다.

## 범위

### 포함

- Warm Editorial 적용 결과와 style registry/token/component contract 감사
- Warm Editorial과 분명히 대비되는 작은 검증 style의 방향 제안 및 사용자 합의
- 공통 shell과 Blog Beta의 대표 상태에 필요한 최소 두 번째 style pack
- 공통 action, field, card, selection control, status, navigation과 focus 상태 비교
- style 전환·fallback·compatibility containment의 구조 및 browser 회귀 검증
- 첫 style 종속성 제거와 필요한 최소 semantic/component contract 보강
- desktop·좁은 화면·keyboard의 대표 사용자 확인 흐름
- Design Principles Gate 3 및 `v1.0` 승격 판단 기록

### 명시적 비범위

- 두 번째 style을 전 화면에 적용하는 정식 제품 완성
- 사용자용 style 선택 UI와 설정 영속화
- Blog Beta 탭 anatomy 또는 빠른 글 작성 정보 구조 개편
- Dashboard, 설정, 카드뉴스, SNS, 쇼핑커넥트와 legacy `블로그`의 style migration
- dark theme를 별도 축으로 추가하는 작업
- 기능, API, 데이터 소유권 또는 발행 동작 변경
- version, release, tag, push와 배포

## 제안 산출물

1. **확장성 감사 결과**: 첫 style 종속성, 계약 누락과 수정 우선순위
2. **Validation Style Brief**: 검증할 시각 축과 의도적 대비 범위
3. **두 번째 검증 Style Pack**: 대표 surface에 필요한 최소 token 값
4. **보강된 공통 계약**: style-neutral component와 pattern 경계
5. **검증 자료**: registry/token/containment, browser와 접근성 회귀
6. **Gate 3 기록**: 원칙별 유지·수정·보류 및 `v1.0` 승격 결정

## 구현 단계

### Work 1. 첫 style 종속성 감사

- style registry, semantic/component token과 legacy alias의 소유권을 다시 확인한다.
- `warm-editorial` 이름, terracotta/cream 계열 raw value와 Warm Editorial 전용 selector가 공통 계층에 새어 나온 곳을 찾는다.
- 두 번째 style이 값 교체만으로 표현되지 않는 항목을 contract gap과 feature 고유 표현으로 분류한다.

### Work 2. 검증 축과 시각 방향 합의

- Warm Editorial과 대비되어 구조적 약점을 잘 드러내는 2~3개의 작은 방향을 제안한다.
- 취향 투표보다 색상 대비, density, radius, elevation과 상태 표현 중 어떤 계약을 검증하는지 명시한다.
- 사용자가 방향과 대표 확인 화면을 승인한 뒤 구현한다.

### Work 3. 최소 검증 style 구현

- 새 style은 동일한 semantic/component contract에 값만 연결하는 것을 기본으로 한다.
- 공통 계층에 style 이름이나 feature별 예외를 추가하지 않는다.
- 필요한 계약 확장은 두 style 모두에서 의미가 성립할 때만 승격한다.

### Work 4. 전환·containment 검증

- compatibility, Warm Editorial과 검증 style의 등록, 선택, fallback을 확인한다.
- 공통 shell과 Blog Beta 대표 화면에서 DOM·ARIA·상태·입력 보존을 확인한다.
- 비대상 surface가 명시적인 compatibility 경계를 유지하는지 검증한다.

### Work 5. 사용자 확인과 Gate 3

- 동일한 대표 화면을 두 style로 비교해 위계, 가독성, focus와 상태 표현을 확인한다.
- 발견한 문제를 style 값, 공통 계약, component pattern 또는 후속 surface migration으로 분류한다.
- Design Principles 8개와 style contract를 `유지`, `수정`, `보류`로 검토하고 `v1.0` 승격 여부를 합의한다.

## 완료 조건

- 사용자가 검증 style 방향과 대표 비교 화면을 승인한다.
- 두 style이 동일한 DOM과 feature JavaScript를 사용한다.
- 공통 component와 pattern에 특정 style 이름을 요구하는 분기가 없다.
- 필수 semantic/component token과 fallback이 자동 검증된다.
- 비대상 surface의 compatibility containment가 유지된다.
- focused tests, 관련 browser smoke와 full unit suite가 통과한다.
- Gate 3 결과와 후속 Blog Beta 개편·surface migration 순서가 기록된다.

## 사용자와 합의한 결정

- Stage 3 Gate 2에서 Product Experience Principles 8개를 모두 유지한다.
- Stage 4는 다른 페이지 확산이나 Blog Beta 정보 구조 개편보다 먼저 수행한다.
- 두 번째 style은 정식 확산보다 구조 검증을 위한 작은 범위로 시작한다.
- Gate 3 이후 Blog Beta panel anatomy와 빠른 글 작성 흐름을 차례로 고도화하고, 그 결과를 다른 surface로 확산한다.
- 사용자용 style 선택 UI는 둘 이상의 검증된 정식 style이 준비된 뒤 별도로 결정한다.
- 두 번째 검증 style은 후보 1 `고요한 세이지 스튜디오`로 확정한다.

## 중단 및 재합의 기준

- 두 번째 style을 위해 feature DOM이나 JavaScript 분기가 필요한 경우
- 검증 style의 범위가 사실상 전 화면 redesign으로 확대되는 경우
- style 전환이 입력, 실행 상태, 접근성 또는 비대상 surface를 변경하는 경우
- 새 font, asset 또는 외부 의존성이 필요한 경우
- Gate 3 전에 Blog Beta 정보 구조 변경이 필요하다고 판단되는 경우

## 진행 및 변경 기록

- 2026-09-07: Stage 3를 parent에 fast-forward 병합하고 완료된 sub-feature branch를 삭제했다.
- 2026-09-07: `codex/feature/design-system-main`에서 4단계 확장성 검증 sub-feature branch를 시작했다.
- 2026-09-07: 확장성 검증을 먼저 수행한 뒤 Blog Beta 구조 개편, 이후 다른 surface migration으로 진행하기로 사용자와 합의했다.
- 2026-09-07: Work 1의 1차 정적 감사를 수행했다. `warm-editorial` 이름은 registry, style pack과 import/test 경계에만 존재해 공통 component의 명시적인 style-name 분기는 발견되지 않았다.
- 2026-09-07: 공통 action/card와 Blog Beta의 새 navigation/status/Smart Comment 규칙은 semantic/component token을 사용한다. 반면 기존 `automation-settings.css`, shared feedback와 batch modal에는 blue/slate/white raw value가 상당수 남아 있어 style 이름 결합은 아니지만 palette 결합을 숨길 수 있다. 두 번째 style에서는 대표 상태를 실제로 노출해 component 고유색, compatibility 잔여물과 새 공통 token 후보를 구분해야 한다.
- 2026-09-07: 현재 HTML은 Warm Editorial을 명시하고 resolver의 안전한 fallback은 Compatibility를 유지한다. 사용자 선택 UI 없이도 programmatic style 적용, 알 수 없는 ID fallback과 DOM·입력 보존을 검증 대상으로 삼는다.
- 2026-09-07: 두 번째 style은 색상만 바꾸는 유사안을 피하고 cool/warm, compact/relaxed, low/clear elevation과 radius 차이 중 구조적으로 의미 있는 축을 의도적으로 달리해야 한다. 방향 선택 전 각 후보가 어떤 계약 결함을 발견할 수 있는지 비교한다.
- 2026-09-07: 사용자가 `고요한 세이지 스튜디오`를 두 번째 검증 style로 선택했다. cool mineral/sage palette, 작은 radius, 낮은 elevation과 약간 compact한 spacing을 검증 축으로 확정했다.
- 2026-09-07: `quiet-sage-studio`를 registry와 CSS composition에 연결하고 현재 root 검증 style로 적용했다. Compatibility fallback과 Warm Editorial pack은 그대로 유지하고 사용자용 선택 UI는 추가하지 않았다.
- 2026-09-07: 첫 focused run은 새 CSS include 때문에 manifest의 60줄 경계를 한 줄 넘기고 include 기대 목록이 과거 상태여서 39 passed, 1 failed로 중단됐다. 불필요한 빈 줄을 제거하고 새 style의 명시적 cascade 위치를 계약에 추가해 40 passed로 회복했다.
- 2026-09-07: 첫 browser run은 두 곳의 action 계산색이 Warm Editorial literal을 직접 기대해 실패했다. Quiet Sage 계산값으로 현행화하는 데 그치지 않고 runtime에서 `Warm Editorial → Quiet Sage`로 전환하는 동안 같은 input DOM과 값이 보존되는 검증을 추가했다. 수정 후 browser smoke는 210 fixture requests로 통과했다.
- 2026-09-07: Quiet Sage에서 공통 toast/dialog의 고정 blue 상태색·shadow와 Blog Beta trend 설정 surface의 blue-gray raw palette가 드러났다. feedback의 surface/status/overlay와 trend의 panel/category/label 표현을 공통 semantic token으로 교정했으며 style-name selector는 추가하지 않았다.
- 2026-09-07: semantic 교정 후 focused style/shell/Blog Beta contracts 41개와 browser UI smoke 204 fixture requests가 통과했다.
- 2026-09-07: 사용자 시각 검토에서 timer widget의 계절 표현이 Quiet Sage 외곽과 충돌하고 navigation의 `new` badge가 지나치게 약한 점을 확인했다. 제품 style이 embedded widget의 외곽을 소유하고 widget 의미색은 국소 accent로 제한하며, discovery badge는 active navigation보다 약하지만 일반 보조문구보다 분명하게 표현하기로 합의했다.
- 2026-09-07: `내용 지우기`의 붉은 표현은 보색 장식이 아니라 danger 의미임을 확인해 유지했다. 현재 확인 없이 입력을 지우는 동작은 Stage 4의 시각 확장성 범위를 넘으므로 빠른 글 작성 후속 일감에 `되돌리기` 제공 조건으로 기록했다.
- 2026-09-07: timer/clock widget의 외곽 surface, border, radius, elevation과 기본 control을 제품 style token으로 이전하고 계절색은 점·메시지·진행 표현에 남겼다. navigation `new` badge는 비활성 메뉴에서 filled primary, 활성 메뉴에서 inverse로 표현해 animation 없이 발견 가능성을 높였다.
- 2026-09-07: 보강 후 focused contracts 42개와 browser UI smoke 206 fixture requests가 통과했다. browser에서는 Quiet Sage timer 외곽 계산값과 `new` badge의 inactive/active 대비 전환까지 확인했다.
- 2026-09-07: 사용자가 Quiet Sage 대표 화면과 timer/new badge 보강 결과를 승인해 사용자 시각 확인을 완료했다.
- 2026-09-07: merge 후보 전체 단위 suite는 1,485 passed, 0 failed, 1 skipped로 통과했다. 공통 component, pattern, layout과 feature CSS에는 두 정식 style ID를 직접 판별하는 selector가 없음을 다시 확인했다.

## Work 1 초기 감사 결과

### 확인된 강점

- style registry와 style pack 이외의 공통 코드에는 `warm-editorial` 이름을 조건으로 한 분기가 없다.
- primary/secondary/tertiary/danger action, card, selection control과 핵심 Blog Beta 상태는 style token을 소비한다.
- 비대상 view와 legacy edit modal은 명시적인 compatibility scope를 가지므로 검증 style의 전역 token 전파를 격리할 수 있다.

### 검증이 필요한 경계

1. **잔여 raw palette**: Blog Beta 자동화 설정과 일부 shared overlay가 기존 blue/slate/white 값을 직접 사용한다. 모든 raw value를 일괄 치환하지 않고, 검증 화면에서 실제로 충돌하는 의미만 공통 contract로 승격한다.
2. **초기 선택과 fallback**: root의 명시적 style ID, registry default와 runtime 적용 함수의 역할이 나뉘어 있다. style ID 전환과 잘못된 ID fallback이 화면 상태를 바꾸지 않는지 확인한다.
3. **형태 계약의 실효성**: style contract가 spacing, typography, radius, elevation과 motion까지 요구하지만 현재 두 정식 비교 대상이 없다. 두 번째 style에서 형태 축을 실제로 달리해 component가 값을 소비하는지 확인한다.
4. **공유 component의 소유권**: clock처럼 독립적인 계절 의미를 가진 색과 feedback/status처럼 style 의미를 따라야 하는 색을 구분해야 한다. 단순한 raw color 개수 감소를 성공 기준으로 삼지 않는다.

### Work 2 후보가 충족해야 할 조건

- Warm Editorial과 한눈에 구별되되 제품의 정보·행동 위계는 동일해야 한다.
- 최소한 색상 온도와 radius/elevation 또는 density 중 하나를 의도적으로 달리한다.
- 사용자 취향에 맞춘 두 번째 완성품보다 계약 결함을 잘 드러내는 진단 도구여야 한다.
- 외부 font·asset 없이 기존 배포 환경에서 재현 가능해야 한다.

## Work 2 검증 Style 후보

### 후보 1. 고요한 세이지 스튜디오 — 추천

- **성격**: 차가운 회백색 canvas, 밝은 mineral surface, 절제된 sage/evergreen primary
- **형태 축**: Warm Editorial보다 작은 radius, 거의 평면에 가까운 elevation, 약간 compact한 spacing
- **검증 가치**:
  - 따뜻한 cream/terracotta가 사라져도 action 위계와 selected 상태가 유지되는지 확인한다.
  - card 구분이 shadow가 아니라 surface와 border 계약으로도 성립하는지 확인한다.
  - spacing과 radius token이 실제 component에 전달되는지 드러낸다.
  - green primary가 success 상태와 혼동되지 않도록 semantic status 분리를 시험한다.
- **제품 적합성**: 차분하고 글쓰기 친화적인 성격은 유지하면서 Warm Editorial과 충분히 구별된다.

### 후보 2. 소프트 플럼 워크스페이스

- **성격**: 옅은 cool-lilac canvas, 깨끗한 neutral surface, muted plum primary
- **형태 축**: 조금 더 둥근 radius, 부드럽지만 분명한 elevation, relaxed spacing
- **검증 가치**:
  - 넓은 spacing과 큰 radius에서도 긴 form과 좁은 화면이 무너지지 않는지 확인한다.
  - plum accent가 danger·warning과 시각적으로 구분되는지 시험한다.
  - translucent surface와 overlay 대비가 다른 색온도에서도 충분한지 확인한다.
- **제품 적합성**: 친근하고 창작 도구다운 개성이 강하지만 Warm Editorial과 형태적 부드러움이 일부 겹친다.

### 후보 3. 클리어 잉크 유틸리티

- **성격**: 거의 무채색인 pearl canvas와 graphite text, 제한적으로 사용하는 amber primary
- **형태 축**: 가장 작은 radius, 명확한 1px border, shadow 최소화, 가장 compact한 spacing
- **검증 가치**:
  - 색상과 장식에 기대지 않고 typography·정렬·border만으로 hierarchy가 유지되는지 강하게 시험한다.
  - density 하한과 긴 한국어 label, keyboard focus의 충돌을 발견하기 쉽다.
  - raw blue/slate 값이 남은 component가 가장 두드러져 palette 결합 탐지에 유리하다.
- **제품 적합성**: 가장 강한 진단안이지만 사용자가 선호하지 않은 검정 계열 button 인상에 가까워 정식 확장 후보로서는 우선순위가 낮다. primary는 graphite가 아니라 amber로 제한한다.

### 추천 판단

`고요한 세이지 스튜디오`를 첫 검증 style로 추천한다. Warm Editorial과 색온도, elevation, radius와 density가 모두 달라 구조 검증력이 충분하고, 검증 후 정식 두 번째 style로 발전시킬 가능성도 가장 높다. `클리어 잉크 유틸리티`는 더 공격적인 stress test가 필요할 때 후속 개발 도구로 남기고, `소프트 플럼 워크스페이스`는 제품 개성 확장 후보로 보존한다.

## 최종 결과 및 검증

- `고요한 세이지 스튜디오` 최소 검증 pack, registry 및 root 연결 완료
- Warm Editorial과 Quiet Sage의 runtime 전환 중 DOM·입력 보존 검증 완료
- 공통 feedback 및 Blog Beta trend의 첫 style/compatibility palette 결합 교정 완료
- focused style/shell/Blog Beta contracts: 42 passed, 0 failed
- browser UI smoke: passed, 206 fixture requests
- full unit suite: 1,485 passed, 0 failed, 1 skipped
- 사용자 시각 확인: 완료
- Gate 3 합의: Product Experience Principles 8개 모두 `유지`; Design Principles와 다중 Style Contract `v1.0` 승격
- commit, merge, release, tag, push, 배포: 수행하지 않음

## Gate 3 검토 결과

2026-09-07 사용자와 Product Experience Principles 8개를 모두 `유지`하고 Design Principles와 다중 Style Contract를 `v1.0`으로 승격하기로 합의했다. 두 번째 style은 단순한 palette 교체를 넘어 색온도, density, radius와 elevation을 함께 달리했고, 그 과정에서 첫 style 또는 compatibility 표현에 가려져 있던 실제 결합을 발견했다. 공통 feedback, Blog Beta trend surface와 embedded clock 외곽을 semantic contract로 교정한 뒤에도 동일 DOM·기능·상태·입력을 유지했다.

| 원칙 | 제안 | 두 style 비교 근거와 후속 사항 |
| --- | --- | --- |
| 1. 사용자의 목적이 화면의 주인공이다 | 유지 | Warm Editorial과 Quiet Sage 모두 primary 하나와 낮은 강조의 보조 action 위계를 유지했다. style 차이가 작업 우선순위를 바꾸지 않았다. |
| 2. 아름다움은 차분한 명료함에서 나온다 | 유지 | Warm Editorial은 따뜻한 surface와 낮은 elevation, Quiet Sage는 border 중심의 평면성을 사용했지만 두 style 모두 과도한 장식 없이 정보 그룹을 유지했다. |
| 3. 시작은 단순하게, 필요한 깊이는 가까이에 둔다 | 유지 | style은 정보 구조를 변경하지 않았다. 빠른 작성 과밀도와 tab 시작 문법은 이미 독립 P1 일감으로 분리되어 원칙 적용을 이어간다. |
| 4. 시스템 상태가 보이면 신뢰가 생긴다 | 유지 | info/success/warning/danger와 진행 상태가 style별 token으로 유지됐다. sage primary와 teal success도 문구·상태 맥락으로 분리했다. |
| 5. 사용자의 작업은 가능한 한 이어져야 한다 | 유지 | runtime style 전환에서 동일 input DOM과 값이 유지됐다. `내용 지우기`의 즉시 소실은 원칙 적용 gap으로 확인해 후속 `되돌리기` 일감에 포함했다. |
| 6. 같은 의미는 같은 방식으로 표현한다 | 유지 | action, selection, refresh, feedback, discovery badge와 embedded widget 외곽을 공통 component/pattern 규칙으로 표현했다. 새 style이 실제 raw palette 결합을 찾아내 계약을 보강했다. |
| 7. 접근성과 반응형 동작은 기본 품질이다 | 유지 | DOM·ARIA·keyboard 순서를 변경하지 않았고 focus, disabled, reduced motion과 좁은 화면 계약이 자동 회귀를 통과했다. |
| 8. 스타일은 달라져도 제품은 낯설어지지 않는다 | 유지 | 두 정식 style이 동일 registry, token contract, DOM과 JavaScript를 사용한다. 공통 계층에 style ID 분기가 없고 compatibility containment도 유지됐다. |

### Style Contract 승격 결정

- `1 style = 1 theme`, root `data-style`, registry와 safe fallback 모델을 유지한다.
- style이 palette, typography, spacing/density, radius, elevation, motion과 texture를 소유하는 현재 범위를 유지한다.
- 기능·DOM·navigation hierarchy·action priority·상태 전이·ARIA·keyboard order·입력 보존은 style 밖에 둔다.
- embedded widget의 외곽과 discovery badge 규칙을 검증된 component guide로 유지한다.
- Compatibility는 미이전 surface의 임시 containment와 fallback으로 유지하고, surface migration 때 명시적으로 제거한다.
- 사용자 style 선택 UI는 이번 승격에 포함하지 않고, 둘 이상의 정식 제공 style을 결정한 뒤 별도 제품 단계로 진행한다.

### `v1.0` 이후 변경 규칙

- Product Experience Principles 변경은 반복되는 새로운 문제와 사용자 합의를 요구한다.
- operational/component guideline은 실제 화면 검증에 따라 계속 발전시킬 수 있다.
- 필수 token 제거·의미 변경, style이 소유할 수 있는 범위 변경과 theme 축 추가는 contract version 변경 대상으로 본다.
- token 추가와 새 style pack은 하위 호환을 유지하면 기존 `v1.x` 안에서 확장할 수 있다.
