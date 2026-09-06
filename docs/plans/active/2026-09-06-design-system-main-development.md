# 디자인 시스템 고도화 개발 기록

## Branch

- Branch: `codex/feature/design-system-main`
- Base/parent branch: `dev`
- Start date: 2026-09-06
- Status: 진행 중

## 사용자 필요와 목표

BlogGenius를 단계적으로 더 아름답고 편리하며 안정적인 제품으로 발전시킨다. 단일 테마나 일회성 스타일 교체에 머무르지 않고, 명시적인 Design Principle과 교체 가능한 스타일 기반을 먼저 만든 뒤 하나의 완성도 높은 스타일을 적용하고 후속 스타일을 확장할 수 있어야 한다.

## 범위

1. 제품과 UI 의사결정에 사용할 Design Principle 및 실행 가이드
2. 현재 UI 구조, 시각 규칙, 반복 패턴, 불일치와 잠재 결함 조사
3. semantic token, 공통 컴포넌트, UI pattern, style pack의 책임 분리
4. 하나의 style이 하나의 완결된 시각 체계를 제공하는 다중 style 구조
5. 합의한 첫 번째 스타일의 단계적 적용
6. 후속 스타일 연결로 확장성 검증
7. 변경 과정에서 발견된 사용성 문제와 UI 회귀의 단계적 개선

## 명시적 비범위

- 초기 단계에서 모든 화면을 한 번에 재작성하는 작업
- 기능 동작이나 정보 구조를 스타일별로 임의 변경하는 구조
- 디자인과 무관한 도메인·provider·agent 구조 개편
- 사용자 합의 없이 앱 전체의 시각 표현을 일괄 교체하는 작업
- 버전 변경, release, tag, push 또는 배포

## 제안 설계

디자인 시스템은 다음 계층으로 분리한다.

1. **Design Principles**: 스타일과 무관하게 유지되는 제품·UX 판단 기준
2. **Operational Guidelines**: 원칙을 실제 화면 결정으로 번역하는 Do/Don't와 검토 기준
3. **Style Foundation**: semantic color, typography role, spacing, radius, elevation, density, motion, state 계약
4. **Shared Components and Patterns**: 반복 가능한 컴포넌트와 사용자 흐름별 패턴
5. **Style Packs**: 동일한 semantic contract에 색상 모드를 포함한 구체적인 시각 값을 연결하는 교체 가능한 스타일

## 제안 단계

### 1. 원칙·현황·계약

- 현재 UI와 CSS 구조를 조사한다.
- Design Principle과 실행 가이드 초안을 만든다.
- 다중 스타일이 지켜야 할 style contract와 책임 경계를 제안한다.
- 이후 단계와 적용 순서를 위험도에 따라 나눈다.
- 실제 UI/CSS 변경은 사용자 합의 이후 단계로 미룬다.

### 2. 스타일 기반

- semantic token과 단일 축의 style 선택 구조를 구현한다.
- 공통 컴포넌트가 원시 값을 직접 사용하지 않도록 점진적으로 이동한다.
- 기존 외형과 동작을 최대한 유지하면서 기반 자체를 검증한다.

### 3. 첫 스타일 적용

- 합의한 시각 방향을 style pack으로 구현한다.
- 우선 합의한 제품 표면에 적용하고 자동 UI 회귀 및 사용자 시각 검토를 수행한다.
- 적용 과정에서 발견한 사용성 문제와 UI 결함은 범위를 기록해 함께 개선한다.

### 4. 확장성 검증 및 후속 스타일

- 작은 검증용 두 번째 style pack으로 첫 스타일 종속성을 찾는다.
- 구조가 검증되면 후속 정식 스타일을 별도 단계로 확장한다.

## 사용자와 결정한 사항

- Design Principle을 먼저 만들고 그 기준에 따라 UI를 개선한다.
- 단순 theme/style 교체가 아니라 다중 style 기반을 구축한다.
- 초기 계약은 `1 style = 1 theme`로 단순화하고 light/dark를 별도 축으로 미리 설계하지 않는다.
- 첫 기반 적용 범위는 공통 shell과 `블로그 Beta`로 제한한다.
- 현재 외형을 compatibility style로 먼저 보존한다.
- 사용자용 style 선택 UI는 둘 이상의 검증된 style이 준비된 뒤 제공한다.
- 첫 스타일을 적용한 뒤 새로운 스타일을 점진적으로 확장한다.
- 큰 작업을 parent feature branch와 단계별 sub-feature branch로 나눈다.
- 각 단계는 조사, 합의, 구현, 자동 검증, 사용자 UI 확인의 경계를 명확히 한다.
- Design Principles는 `v0.1 Working Principles`로 시작한다.
- compatibility style 기반 완료 후, 첫 정식 style 적용 후, 두 번째 style 확장성 검증 후에 필수 원칙 검토를 수행한다.
- 세 검토는 다음 단계 진행을 위한 gate이며, 결과와 사용자 합의를 개발 기록에 남긴다.

## 진행 및 변경 기록

- 2026-09-06: `dev`에서 디자인 시스템 고도화 parent branch를 시작했다.
- 2026-09-06: 1단계를 원칙·현황·계약 수립으로 정의했다. 실제 UI/CSS 변경은 1단계 합의 이후로 미룬다.
- 2026-09-06: `codex/feature/design-system-01-principles`에서 1단계 조사를 시작했다. 세부 기록은 [1단계 개발 기록](../archive/2026-09-06-design-system-01-principles-development.md)을 따른다.
- 2026-09-06: 사용자가 첫 적용 범위, `1 style = 1 theme`, compatibility style, style 선택 UI 제공 시점을 승인했다.
- 2026-09-06: 사용자가 Design Principles `v0.1` 출발과 세 차례 필수 검토 게이트를 승인했다.
- 2026-09-06: 1단계 원칙·현황·계약 수립을 완료했다. Design Principles와 style contract는 architecture로 승격하고 세부 조사와 개발 기록은 archive로 이동했다.
- 2026-09-06: `dev`에서 독립적으로 수정한 SerpApi archive 계획 테스트 경로를 parent에 동기화했다. 동기화 후 full unit suite는 1,473 passed, 0 failed, 1 skipped로 기준선을 회복했다.
- 2026-09-06: `codex/feature/design-system-02-foundation`에서 compatibility style, semantic token, registry, 공통 shell과 `블로그 Beta`의 제한 migration을 목표로 2단계를 완료했다. 세부 기록은 [2단계 개발 기록](../archive/2026-09-06-design-system-02-foundation-development.md)을 따른다.
- 2026-09-06: Gate 1에서 Product Experience Principles 8개를 모두 유지하고, 완료형 form/dialog의 primary action을 inline-end 하단에 두며 secondary·destructive action의 위계를 분리하는 운영 가이드를 추가하기로 사용자와 합의했다. compatibility 외형은 즉시 바꾸지 않고 첫 정식 style에서 공통 action pattern으로 적용한다.
- 2026-09-06: `codex/feature/design-system-03-first-style`에서 첫 정식 style의 시각 방향 합의, 공통 component/action pattern, 공통 shell과 `블로그 Beta` 적용 및 Gate 2를 목표로 3단계를 시작했다. 세부 기록은 [3단계 개발 기록](../archive/2026-09-06-design-system-03-first-style-development.md)을 따른다.
- 2026-09-07: 첫 style 사용자 검토에서 빠른 글 작성의 과밀도와 AI 보조 action의 낮은 식별성, 다섯 Blog Beta tab의 서로 다른 콘텐츠 시작 문법을 확인했다. 현재 3단계의 정보구조 비범위는 유지하고, `Blog Beta 탭 구조와 콘텐츠 시작점 일관성`과 `빠른 글 작성 대표 흐름 재설계`를 순서가 있는 독립 P1 일감으로 등록했다.
- 2026-09-07: Gate 2에서 Product Experience Principles 8개를 모두 유지하기로 합의하고 3단계를 완료했다. 확인된 적용 gap은 후속 P1 일감으로 유지하고, 다음 단계는 작은 두 번째 style pack으로 첫 style 종속성을 찾는 확장성 검증으로 진행한다.

## Design Principles 필수 검토 일정

1. **Gate 1 — compatibility style 기반 완료 후**: 현재 구조에 원칙을 적용할 수 있는지 검토한다.
2. **Gate 2 — 첫 번째 정식 style 적용 완료 후**: 원칙이 실제 시각·사용성 결정을 안내했는지 검토한다.
3. **Gate 3 — 두 번째 style 확장성 검증 후**: 첫 style 종속성을 확인하고 `v1.0` 승격 여부를 결정한다.

각 Gate는 사용자 합의 전에는 완료로 처리하지 않으며 다음 디자인 시스템 단계로 진행하지 않는다. 상세 검토 항목과 기록 규칙은 [Design Principles v0.1](../../architecture/design-principles.md)을 따른다.

## 현재 위험과 확인할 결정

- 기존 UI가 단일 CSS와 페이지별 예외에 강하게 결합되어 있다면 점진적 이전 경계가 필요하다.
- style별 허용 범위를 넓힐수록 검증 대상이 증가하므로 초기 token contract를 제한해야 한다.
- 공통 shell과 `블로그 Beta` 이후 surface의 migration 순서와 범위는 단계별 사용자 합의가 필요하다.
- 첫 스타일의 시각적 성격과 제품 인상을 별도 단계에서 합의해야 한다.

## 최종 결과 및 검증

- 진행 중
- commit, merge, release, tag, push, 배포: 수행하지 않음
