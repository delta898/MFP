# 디자인 시스템 17단계 — CSS 모듈 소유 경계 정리

- branch: `codex/feature/design-system-17-css-module-boundaries`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: complete

## 사용자 필요와 목표

커진 feature CSS를 화면 역할과 component 소유권에 맞는 작은 module로 나눠, 스타일 변경의 영향 범위를 예측하기 쉽게 한다. 기존 화면의 계산 스타일, cascade 결과, 반응형 layout과 동작은 유지한다.

## 범위

1. 큰 CSS module의 selector·media-query·DOM 소유 경계 조사
2. SNS와 Discovery module 분할 및 composition 계약 보강
3. Blog Beta 글쓰기·글감 관리·발행 설정 영역 분할
4. 공통 clock과 responsive 규칙의 소유 경계 정리
5. manifest, cascade layer, module reachability 및 크기 계약 갱신
6. focused UI contract, browser smoke와 merge gate 검증

## 비범위

- 사용자에게 보이는 layout, spacing, color, typography, density 변경
- selector 명칭 또는 DOM 구조의 전면 개편
- 기능 동작과 API 계약 변경
- legacy Blog의 독립적인 디자인 개선
- cascade layer 순서 변경

## 설계 원칙

- 파일 길이만 줄이지 않고 하나의 module이 하나의 명확한 화면·component 책임을 갖도록 나눈다.
- 기존 selector와 선언은 가능한 그대로 이동하고, 같은 layer 안에서 기존 상대 순서를 보존한다.
- 공통화되지 않은 feature selector를 편의상 component layer로 승격하지 않는다.
- responsive rule은 base selector와 함께 이해할 수 있도록 feature-owned module을 우선하고, 전역 shell breakpoint만 공통 responsive module에 남긴다.
- 분할 과정에서 발견한 중복·스타일 개선은 이번 branch에서 함께 수정하지 않고 별도 후속으로 기록한다.

## 단계

1. SNS·Discovery: 최근 정리된 화면을 기준 사례로 삼아 module naming과 검증 방식을 확립한다.
2. Blog Beta: quick writing, queue/management, automation/publishing 책임으로 나눈다.
3. 공통 영역: clock과 전역 responsive의 shell/component 경계를 마지막에 정리한다.

## 결정과 진행 기록

- 2026-09-14: 사용자가 작업량에 따라 적절히 나누되 별도 feature branch에서 연속 진행하고, 시각 판단이나 추가 승인이 필요한 시점에만 확인을 요청하도록 승인했다.
- 2026-09-14: cascade layer 전환이 완료되어 모든 새 module은 기존 소유 layer를 그대로 유지한다.
- 2026-09-14: SNS는 composer/channel, media, actions, density 책임으로 분리하고 기존 `social-surfaces.css`를 마지막 feature variant로 유지했다.
- 2026-09-14: Discovery는 quick discovery shell, keyword research, responsive, writing assists로 분리했다.
- 2026-09-14: Blog Beta는 연속 발행 shell·queue·automation·drafts·responsive와 quick publishing·comment drafts·manuscript·support 경계로 분리했다. selector와 DOM 계약은 변경하지 않았다.
- 2026-09-14: 공통 clock은 shell, Pomodoro controls/faces, celebration, status로 분리했다. 기존 설정 화면 CSS는 core, preview, categories, help, images 책임으로 분리했다.
- 2026-09-14: 전역 mobile breakpoint는 선언 순서를 유지하면서 mobile quick base, shell, forms, Blog quick, footer module로 분리했다. 동일한 `max-width: 960px` 조건을 반복해 각 파일이 독립적으로 유효한 CSS가 되도록 했다.
- 2026-09-14: 브라우저 스모크에서 footer focus shadow 비교가 간헐적으로 기본 shadow를 읽었다. CSS 회귀가 아니라 160–180ms interaction transition 도중 계산 스타일을 읽는 경쟁임을 확인했고, focus transition의 안정 상태를 기다린 뒤 비교하도록 테스트를 보완했다.
- 2026-09-14: 첫 full unit suite에서 SNS busy-state 구조 테스트 1건이 분할 전 단일 `social.css`만 읽어 실패했다. 테스트가 SNS owner module 전체를 검사하도록 갱신했으며 제품 CSS나 동작의 실패는 아니었다.
- 2026-09-14: CSS companion module naming과 ownership 규칙을 `docs/architecture/design-style-system.md`에 정식 반영했다.

## 검증 및 결과

- SNS focused contracts: 38개 통과.
- Discovery focused contracts: 46개 통과.
- Blog Beta focused contracts: 106개 통과.
- 공통 clock·settings·responsive focused contracts: 66개 통과.
- 최종 분할 관련 통합 contract: 74개 통과.
- Browser UI smoke: 308 fixture request, 통과.
- Full unit suite: 1,692개 중 1,691개 통과, 1개 플랫폼 의존 테스트 skip, 실패 0.
- `git diff --check`: 통과.
- 분할된 선언은 기존 layer와 상대 순서를 유지했다. responsive는 원본 mobile block의 모든 내부 rule을 한 번씩 같은 순서로 보존한다.
- 남은 확인: 대표 desktop 화면과 960px 이하 화면의 육안 확인은 후속 전체 디자인 수동 점검에 포함한다.

## 최종 결과와 후속 위험

- 대형 SNS, Discovery, Blog Beta, clock, legacy automation settings와 전역 responsive CSS가 화면·component 책임별 module로 나뉘었다.
- composition manifest와 디자인 시스템 대상 manifest가 새 module을 단일 순서로 추적하며, reachability·중복·layer·크기·token 계약이 분할 파일까지 검사한다.
- 기능, DOM, selector, API와 사용자 노출 layout은 변경하지 않았다.
- 위험은 responsive media block을 여러 동일 조건 block으로 나눈 데 따른 브라우저별 해석 차이지만, 표준적으로 동등하며 focused contract와 Chromium browser smoke로 검증했다. 최종 사용자 시각 확인은 남아 있다.
