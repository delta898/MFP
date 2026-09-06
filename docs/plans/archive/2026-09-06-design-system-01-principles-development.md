# 디자인 시스템 1단계 원칙·현황·계약 개발 기록

## Branch

- Branch: `codex/feature/design-system-01-principles`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-06
- Status: 완료

## 사용자 필요와 목표

시각 스타일을 바꾸기 전에 BlogGenius에 맞는 Design Principle과 구체적인 실행 가이드를 정의하고, 현재 UI 구조가 다중 style을 지원하려면 무엇이 달라져야 하는지 확인한다. 다음 구현 단계가 추상적인 선언이나 전면 재작성으로 흐르지 않도록 명확한 계약과 단계별 경계를 만든다.

## 범위

- 현재 UI, CSS, 공통 컴포넌트, view 구성 방식 조사
- 반복되는 시각 규칙과 하드코딩, 불일치, 잠재 UI 결함 분류
- 제품 수준 Design Principle 초안
- 원칙별 Operational Guideline, Do/Don't, 검토 기준 초안
- `1 style = 1 theme`를 전제로 한 style의 개념 및 책임 경계
- semantic token과 style pack이 충족해야 할 초기 contract
- 다음 구현 단계와 우선 적용 범위 제안

## 명시적 비범위

- CSS, HTML, JavaScript 동작 변경
- 첫 스타일의 최종 시각 디자인 및 적용
- 사용자가 합의하지 않은 UI 구조나 동선 변경
- 기존 `블로그` surface 변경
- 버전 변경, commit, merge, release, tag, push 또는 배포

## 제안 설계

1단계 산출물은 선언적인 원칙만 작성하지 않는다. 각 원칙을 `의도 → 실행 규칙 → 피해야 할 패턴 → 리뷰 질문`으로 연결한다. 시각 기반은 원시 값과 semantic token을 분리하고, 각 style pack이 동일한 기능·정보 구조 위에서 하나의 완결된 시각 체계를 제공하는 최소 계약을 정의한다.

## 구현 단계

1. UI 파일과 스타일 의존성 목록 작성
2. 반복 패턴, 예외, 결합 지점, 잠재 결함 분류
3. Design Principle 및 실행 가이드 초안 작성
4. 다중 style contract 및 점진적 migration 경계 작성
5. 문서 일관성 검사와 사용자 합의 항목 정리

## 사용자와 결정한 사항

- 상세 가이드는 필요하지만 Design Principle과 동일 문서 수준으로 뒤섞지 않는다.
- 원칙, 실행 가이드, style foundation, component/pattern guide를 계층화한다.
- component별 세부 규칙은 실제 적용 과정에서 검증하며 점진적으로 축적한다.
- 1단계 합의 전에는 실제 UI/CSS를 변경하지 않는다.
- 첫 foundation 적용 범위는 공통 shell과 `블로그 Beta`로 제한한다.
- 별도 theme 축을 만들지 않고 `1 style = 1 theme`로 시작한다.
- 현재 외형은 compatibility style로 먼저 보존한다.
- 사용자용 style 선택 UI는 둘 이상의 검증된 style이 준비된 뒤 제공한다.
- Design Principles는 `v0.1 Working Principles`로 출발하고 세 번의 필수 검토 후 `v1.0` 승격 여부를 결정한다.

## 진행 및 변경 기록

- 2026-09-06: 디자인 시스템 parent에서 첫 sub-feature branch를 시작했다.
- 2026-09-06: 1단계를 원칙, 현황 조사, 다중 style contract 수립으로 제한했다.
- 2026-09-06: UI composition, CSS token, raw value, inline style, responsive, focus와 reduced-motion 현황을 정적 조사했다.
- 2026-09-06: [Design Principles v0.1](../../architecture/design-principles.md), [현재 UI 기반 조사](./2026-09-06-current-ui-foundation-audit.md), [다중 Style Contract v0.1](../../architecture/design-style-system.md)을 작성했다.
- 2026-09-06: `블로그 Beta`를 포함한 여러 surface에서 정의되지 않은 semantic 형태의 CSS 변수를 확인했다. 실제 교정은 contract 합의 이후 구현 단계로 미뤘다.
- 2026-09-06: 사용자가 첫 적용 범위와 style 계약을 승인했다. 별도 light/dark 확장 축은 초기 설계에서 제거했다.
- 2026-09-06: 사용자가 Design Principles `v0.1`과 compatibility style 완료 후, 첫 style 완료 후, 두 번째 style 검증 후의 필수 검토 일정을 승인했다.

## 현재 제안

- Design Principle은 제품 경험 원칙과 시스템 구현 원칙을 분리한다.
- 첫 foundation 적용 범위는 공통 shell과 `블로그 Beta`로 제한한다.
- 현재 외형을 compatibility style로 먼저 포착한 뒤 첫 정식 style을 적용한다.
- 하나의 style pack이 하나의 완결된 theme를 제공하며 별도 theme 선택 축은 두지 않는다.
- 실제 사용자용 style 선택 UI는 둘 이상의 검증된 style이 준비된 이후 제공한다.
- 세 차례 Design Principles 검토를 다음 단계 진입 gate로 운영하며 각 결과를 사용자와 합의한다.

## 최종 결과 및 검증

- Design Principles `v0.1 Working Principles`와 세 차례 필수 검토 Gate를 사용자와 합의했다.
- 다중 style 기반을 `1 style = 1 theme`의 단일 축으로 정의하고 첫 적용 범위를 공통 shell과 `블로그 Beta`로 확정했다.
- Design Principles와 style contract를 canonical architecture 문서로 승격하고 정적 조사 기록을 archive에 보존했다.
- 정적 조사: CSS partial 33개, 약 15,209줄, inline style 201개 확인
- 잠재 결함: fallback 없는 미정의 semantic 변수 참조 확인
- 문서 일관성: `git diff --check` 통과
- full unit suite: 1,474개 중 1,470 passed, 3 failed, 1 skipped
- sandbox 포트 제한으로 실패한 Trends API 2건: 권한 있는 환경에서 focused 재실행 23 passed
- 남은 1건: `dev`부터 존재하지 않는 `docs/plans/active/serpapi-collection-01-contracts-plan.md`를 참조하는 기존 structure test 실패로, 이번 단계 범위 밖의 잔여 문제
- 수동 UI 확인: 이 단계에서는 필요하지 않음
- release, tag, push, 배포: 수행하지 않음
