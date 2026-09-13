# 디자인 시스템 15단계 — 역할 기반 밀도 토큰 적용

- branch: `codex/feature/design-system-15-density-tokens`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: in_progress

## 사용자 필요와 목표

디자인 시스템 대상 화면에서 같은 역할의 여백, control 높이와 radius가 feature별 숫자로 갈라지지 않게 한다. 화면을 일률적으로 축소하지 않고 page, section, card, field, compact control의 역할에 맞는 밀도 계약을 만들며 현재 style마다 의도된 차이를 유지한다.

## 범위

1. 역할 기반 spacing, control, radius 밀도 토큰과 검사 계약 확립
2. SNS를 기준 surface로 전환하고 첫 시각 확인
3. Discovery 계열의 카드와 결과 목록 전환
4. Blog Beta의 작성, 관리 surface 전환
5. focused contract와 관련 browser smoke, 문서 최신화

## 비범위

- 기능 흐름, 정보 구조, API와 데이터 변경
- 모든 화면을 동일한 크기와 간격으로 강제
- legacy surface 전면 이관
- 대형 feature CSS 파일 분할
- CSS cascade layer 도입

## 제안 설계와 진행 단계

- style은 기존 primitive spacing 값을 유지하면서 역할별 component token을 제공한다.
- shared pattern은 역할 token을 소비하고 feature는 업무 고유 grid, preview 비율, 접근 가능한 hit area만 소유한다.
- SNS에서 밀도 위계와 반응형 축소를 먼저 검증한다. 사용자 시각 확인 뒤 같은 계약을 Discovery와 Blog Beta에 확장한다.
- 각 단계는 독립적인 focused test와 논리 커밋으로 남긴다. reviewable slice에서만 browser smoke를 실행한다.
- parent 병합 전 full unit suite는 사용자 승인 후 실행한다.

## 결정과 진행 기록

- 2026-09-14: 사용자가 별도 feature branch에서 단계를 나눠 연속 진행하고, 필요한 시점에만 확인을 요청하도록 승인했다.
- 2026-09-14: 이번 branch는 밀도 토큰과 SNS, Discovery, Blog Beta 적용까지만 담당한다. CSS 분할과 cascade layer는 후속 고위험 구조 작업으로 유지한다.
- 2026-09-14: 사용자가 SNS 적용 후 시각 확인을 요청했다. 따라서 역할 토큰과 SNS 적용까지만 첫 review slice로 묶고, 승인 전에는 Discovery와 Blog Beta를 변경하지 않는다.
- 2026-09-14: page gap, section/action padding, field gap, 일반/compact control 높이, control inline padding과 radius를 style contract로 추가했다. 미디어 크기, textarea 높이와 grid column은 기능 의미가 있는 geometry로 유지한다.
- 2026-09-14: SNS가 새 밀도 계약을 소비하도록 전환했다. 중첩 section 안에서 작업 공간 field에 다시 적용되던 좌우 margin은 제거해 heading, field와 channel grid의 content edge를 맞췄다.

## 검증 및 결과

- 역할 기반 밀도와 SNS focused contract 38건 통과.
- SNS review slice browser UI smoke 277 fixture requests 통과.
- 사용자가 SNS의 변경된 밀도와 정렬을 시각 확인하고 다음 단계 진행을 승인했다.
