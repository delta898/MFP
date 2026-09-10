# 쇼핑커넥트 navigation shell 통일 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-02-navigation-shell`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-11
- Status: 완료 · 검증 및 sub-branch 커밋 준비

## 사용자 필요와 목표

쇼핑커넥트의 상위 화면 구조와 메뉴 문법을 Blog Beta 및 설정 Beta와 같은 디자인 시스템 기준으로 맞춘다.
기존 기능은 유지하면서 사용자가 `빠른 글 작성`과 `글감 관리`라는 두 작업 영역을 일관된 방식으로 인식하게 한다.

## 범위

1. 쇼핑커넥트 page header, local navigation, content panel의 공통 구조 적용
2. `빠른 포스팅`을 `빠른 글 작성`으로 변경
3. `일괄 포스팅`을 `글감 관리`로 변경
4. 기존 탭 전환과 quick/batch 기능 연결 유지
5. 구조와 용어에 대한 focused contract 검증

## 명시적 비범위

- 빠른 글 작성 내부 form과 action 재설계
- 글감 관리 table과 batch action 재설계
- 상품 분석, 생성, 저장, 발행 도메인 동작 변경
- 전체 단위 테스트(parent 최종 병합 gate에서 수행)

## 설계 결정

- Blog Beta의 내용을 복제하지 않고 공통 shell, navigation, panel anatomy를 재사용한다.
- 이번 slice는 상위 구조와 명칭만 다루며 내부 panel 개편을 섞지 않는다.
- DOM id와 `data-shopping-tab` 값은 기존 동작 호환을 위해 유지하고 사용자에게 보이는 label만 바꾼다.

## 구현 진행

- 작업 시작 전 parent working tree가 깨끗함을 확인했다.
- 쇼핑커넥트 view를 compatibility containment에서 공통 디자인 시스템 surface로 전환했다.
- 상위 navigation에 `ui-top-tabs` 문법과 tab/tabpanel ARIA 연결을 적용하고 label을 `빠른 글 작성`,
  `글감 관리`로 통일했다.
- 구형 shopping tab 전용 스타일 충돌을 제거하고 공통 keyboard navigation을 연결했다.

## 검증과 남은 위험

- shopping shell, 디자인 시스템, 자동 포스팅 제거, view header focused contract 27건을 통과했다.
- UI composition·script structure contract 9건을 통과했고 `git diff --check`도 통과했다.
- 사용자 승인 후 browser UI smoke를 실행해 249개 fixture 요청이 모두 통과했다.
- 최종 시각·탐색 확인은 사용자가 수행한다.
