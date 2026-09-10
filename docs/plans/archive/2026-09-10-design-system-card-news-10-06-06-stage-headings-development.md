# Card News 단계 라벨·패널 헤더 통일 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-06-06-stage-headings`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료 · 자동 검증 통과

## 사용자 필요와 목표

Card News의 `1단계`, `2단계`, `3단계`와 `관리`, `카드 작업` eyebrow가 제목 위에 별도 행을 만들어
Blog Beta·설정 Beta 및 Card News 두 workspace 사이의 heading/sub-menu 시작 위치가 달라지는 문제를 해소한다.
작업 순서는 보존하되 패널 제목과 같은 행의 보조 정보로 표현한다.

## 범위

1. 단계가 있는 heading을 `제목 + inline 단계` 구조로 변경
2. `관리`, `카드 작업`처럼 제목과 중복되는 eyebrow 제거
3. 재사용 가능한 공통 workflow title-row/stage pattern 추가
4. 새 카드뉴스와 만든 카드뉴스의 heading/sub-menu 수직 배치 통일
5. focused contract와 browser smoke 회귀 보강

## 명시적 비범위

- 단계 순서와 생성·발행 동작 변경
- top/sub menu component 변경
- 카드뉴스 내용·상태·버튼 문구 변경
- Card News parent merge

## 설계 원칙

- 단계는 workflow 이해에 필요하므로 삭제하지 않는다.
- 단계는 pill badge가 아니라 제목보다 위상이 낮은 inline 보조 텍스트로 표시한다.
- 단계가 아닌 중복 eyebrow는 제거하고 모든 panel heading을 `제목 → 설명`의 같은 문법으로 맞춘다.
- feature 전용 위치·색상을 만들지 않고 공통 pattern token을 사용한다.
- 구현 중 focused test만 실행하며 browser 회귀와 전체 단위 테스트는 사용자 승인 뒤 실행한다.

## 조사·구현 결과

- 공통 `ui-workflow-title-row`과 `ui-workflow-stage` pattern을 추가했다. 제목과 단계는 baseline으로
  정렬되고 좁은 화면에서는 자연스럽게 wrap되며, 색상·크기·굵기는 semantic token을 사용한다.
- `내용 선택`, `카드 설정`, `SNS에 발행`의 단계를 각각 제목 오른쪽의 `1단계`, `2단계`, `3단계`
  보조 텍스트로 옮겼다.
- 결과 영역의 `카드 작업`과 만든 카드뉴스 목록의 `관리` eyebrow는 제목과 중복되어 제거했다.
- Card News DOM에서 feature 전용 `card-news-eyebrow`를 완전히 제거했고, 공통 heading pattern만 사용한다.
- browser smoke에 inline baseline, 중복 eyebrow 부재, 새 카드뉴스/만든 카드뉴스 heading-to-sub-menu 간격
  일치 검사를 추가했다.
- 동일한 화면 크기에서도 Card News 첫 패널이 Blog Beta·설정 Beta보다 아래에서 시작하는 피드백을 재검토했다.
  공통 토큰을 사용하고는 있었지만 Card News만 `space-6` 패딩과 heading의 추가 `space-1` 상단 margin을
  조합해 기준선이 약 8px 내려간 것이 원인이었다.
- 첫 목록 패널의 inset을 공통 `ui-workflow-panel` anatomy로 옮기고 `space-5`를 적용했다. workflow heading의
  제목 margin도 공통 규칙에서 0으로 정규화하고 heading weight를 공통 `weight-bold` token으로 맞춰 새
  카드뉴스와 만든 카드뉴스가 Blog Beta·설정 Beta의 패널 시작선·제목 위계와 같은 문법을 사용한다.
  Card News의 2열 목록·미리보기 구조는 유지한다.

## 검증과 남은 위험

- `node --test scripts/card-news-shell-contract.test.js`: 15개 통과
- `node --check scripts/test-ui-browser-smoke.js`: 통과
- `git diff --check`: 통과
- 첫 브라우저 smoke에서 발행 패널의 제거된 eyebrow 문구 `3단계 · 선택`을 기대하던 기존 assertion 1곳이
  실패했다. 제품 UI 결함은 아니었으며 selector와 기대값을 공통 `ui-workflow-stage`의 `3단계`로 교정했다.
- `npm run test:ui-browser`: 256개 fixture 요청 통과
- 첫 전체 단위 테스트에서 공통 workflow heading의 기존 `weight-semibold` 기대값 1건이 실패했다.
  Blog Beta·설정 Beta와 같은 `weight-bold` 위계로 바꾼 의도된 계약 변경이므로 디자인 foundation 계약을
  새 weight와 `ui-workflow-panel` inset까지 확인하도록 교정했다.
- 두 번째 실행에서는 같은 foundation 계약의 기존 class 문자열 기대값 2곳이 새 `ui-workflow-panel` class를
  반영하지 못해 실패했다. 새 카드뉴스와 만든 카드뉴스 양쪽에 공통 panel anatomy가 필수임을 확인하도록
  기대값을 교정했다.
- `npm run test:unit`: 1,600개 통과, 1개 skip, 실패 0
- 최종 제목·단계 baseline과 두 workspace의 sub-menu 시작 위치는 사용자 수동 확인이 필요하다.
