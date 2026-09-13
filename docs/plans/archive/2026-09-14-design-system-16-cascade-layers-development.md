# 디자인 시스템 16: CSS Cascade Layer

- branch: `codex/feature/design-system-16-cascade-layers`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: complete

## 사용자 필요와 목표

확장된 화면과 공통 컴포넌트의 CSS 우선순위를 명시적인 계층으로 관리해, 기능을 추가하거나 스타일을 수정할 때 예상하지 못한 전역 회귀가 발생하는 위험을 줄인다. 현재 승인된 화면의 레이아웃·색상·밀도·동작은 유지한다.

## 범위

1. 현재 CSS composition 순서와 override 의존성 조사
2. `reset`, `tokens`, `base`, `components`, `features`, `utilities`, `overrides`, `legacy` 계층 계약 정의
3. 조합 진입점과 feature CSS에 점진적으로 cascade layer 적용
4. layer 순서·포함 범위·금지 패턴을 검사하는 정적 계약 보강
5. 관련 UI contract와 browser smoke를 통한 비회귀 검증

## 비범위

- 사용자에게 보이는 레이아웃·색상·타이포그래피·밀도 변경
- 기능 동작 또는 API 계약 변경
- cascade 전환과 무관한 CSS 명칭·파일 전면 개편
- legacy Blog 화면의 독립적인 디자인 개선

## 제안 설계와 단계

1. CSS manifest와 composition runtime을 source of truth로 삼아 실제 결합 순서를 조사한다.
2. 모든 layer의 전역 순서를 단일 위치에서 먼저 선언한다.
3. 공통 foundation과 component 경계를 우선 명시하고, feature 파일은 기존 로딩 순서를 보존한 채 같은 `features` 계층 안에 둔다.
4. 기존 비계층 CSS가 계층 CSS보다 무조건 우선하는 CSS 규칙을 고려해 한 번에 경계를 닫거나, 검증 가능한 독립 구간으로만 전환한다.
5. 최종 전환 후 임의의 unlayered product rule이 다시 추가되지 않도록 계약 테스트를 둔다.

## 결정과 진행 기록

- 2026-09-14: 사용자가 밀도 토큰 적용과 SNS 작업 공간 캐시 완료 후 cascade layer를 다음 별도 feature branch로 진행하도록 승인했다.
- 2026-09-14: 이번 변경은 시각적 redesign이 아니라 CSS 우선순위의 구조화이며, 사용자 승인 화면을 그대로 유지한다.
- 2026-09-14: Google Fonts `@import` 다음에 전체 layer 순서를 한 번 선언하고, composition manifest의 모든 module을 `tokens`, `base`, `components`, `features`, `utilities` 중 실제 소유 경계에 배정했다. `reset`, `overrides`, `legacy`는 계약상 예약하되 현재 module은 배정하지 않는다.
- 2026-09-14: 초기 안전 전환에서는 기존 module을 `legacy`에 두고 일부 modern module만 낮은 layer로 옮겼다. 이 방식은 layer 우선순위가 selector specificity보다 먼저 적용되어, 높은 `legacy` layer의 광범위한 form rule이 Blog Beta tooltip과 theme별 footer focus rule을 덮는 회귀를 만들었다.
- 2026-09-14: selector specificity를 키우거나 예외 override를 추가하지 않고, 모든 module을 디렉터리 소유 경계에 따라 같은 전역 layer 계약 안으로 닫는 방식으로 수정했다. 기존 module 간 상대 순서는 각 layer 안에서 보존했다.
- 2026-09-14: `ui/styles.css` 외부의 module 내용은 변경하지 않았다. 따라서 이번 slice는 cascade 소유권과 우선순위 구조만 변경하며 레이아웃·색상·밀도·동작의 의도된 변화가 없다.
- 2026-09-14: architecture 문서에 layer 순서, 소유권, unlayered rule 금지, `overrides`/`legacy` 사용 조건과 `!important`의 역순 우선순위를 기록했다.
- 2026-09-14: full unit merge gate 통과 후 parent branch 통합 대상으로 확정했다.

## 검증 및 결과

- CSS composition runtime test 통과.
- 디자인 시스템 및 화면별 focused UI contract 138건 통과.
- browser UI smoke 통과: fixture request 309건, 실패 0건.
- parent merge gate full unit suite 통과: 1,692건 중 1,691건 통과, Windows 전용 1건 skip, 실패 0건.
- 구조 계약은 전체 module의 reachability·중복·크기 제한뿐 아니라 정확한 layer 순서, module별 layer 소유권, `legacy` 무배정, manifest 내 raw CSS 금지를 검사한다.
- 자동 검증으로 기능 및 selector 계약의 비회귀를 확인했다. 대표 화면과 두 style pack의 최종 시각 확인은 사용자가 수행한다.

## 수동 확인 항목

1. Dashboard Beta, Blog Beta, 설정 Beta, SNS의 기본 화면이 전환 전과 동일하게 보이는지 확인한다.
2. Warm Editorial과 Quiet Sage Studio를 각각 적용해 button·footer·tooltip의 hover/focus 표현을 확인한다.
3. 좁은 창에서 navigation과 주요 card가 기존 responsive layout을 유지하는지 확인한다.
