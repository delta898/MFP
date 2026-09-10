# 쇼핑커넥트 디자인 시스템 적용 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-10
- Status: 진행 중 · slice 1 완료 및 parent 반영 준비

## 사용자 필요와 목표

쇼핑커넥트를 Blog Beta와 같은 navigation·panel·typography·status·action 문법으로 개편한다.
상품 URL 중심의 고유 흐름은 유지하면서 상위 구조를 `빠른 글 작성`과 `글감 관리` 두 영역으로 단순화한다.

## 범위

1. 쇼핑 자동 포스팅 UI와 숨은 실행 가능성의 안전한 제거
2. 상위 shell과 두 탭을 공통 navigation pattern으로 통일
3. 빠른 상품 글 작성 패널의 정보·action 구조 정리
4. 기존 일괄 포스팅을 글감 관리 목록으로 재구성
5. feature hard-coding 제거, responsive/accessibility 및 browser 회귀 검증

## 명시적 비범위

- 상품 분석·글 생성·즉시 발행의 도메인 동작 변경
- Blog Beta 화면 자체의 변경
- 새로운 쇼핑 provider 또는 자동화 기능 추가
- `design-system-main` 이후 브랜치로의 병합

## 사용자 결정과 설계 원칙

- top-level 영역은 `빠른 글 작성`, `글감 관리` 두 개만 둔다.
- `빠른 포스팅`은 `빠른 글 작성`, `일괄 포스팅`은 `글감 관리`로 바꾼다.
- 자동 포스팅은 탭만 숨기지 않는다. 보이지 않는 백그라운드 발행이 남지 않도록 실행·상태·설정 연결을 함께 제거한다.
- Blog Beta의 입력 내용을 복제하지 않고 shell, panel anatomy, 목록·상태·action 문법을 재사용한다.
- 작업을 짧은 sub-feature branch로 나누고 focused 검증 뒤 사용자 확인을 받는다.

## 구현 단계

1. 자동 포스팅 안전 제거 — 완료 ([개발 기록](../archive/2026-09-10-design-system-shopping-connect-11-01-remove-automation-development.md))
2. shell·두 탭·용어 통일
3. 빠른 글 작성 패널 개편
4. 글감 관리 목록 개편
5. hard-coding 검사와 browser 회귀

## 진행 기록

- 현재 쇼핑 자동 포스팅은 화면뿐 아니라 설정 저장·로딩, dashboard 상태, timer와 수동 실행 API까지 연결되어
  있어 탭만 제거하면 기존 활성 설정이 보이지 않게 실행될 위험이 있음을 확인했다.
- slice 1에서 쇼핑 전용 자동 포스팅 UI, 설정 소유권, timer/cycle, 수동 API, runtime hook 및 dashboard 상태를
  함께 제거했다. 빠른 포스팅과 선택 일괄 포스팅 경로는 유지했다.
- 과거 설정 파일을 파괴적으로 수정하지 않는다. 다만 앱은 쇼핑 자동 포스팅 설정을 읽거나 실행 경로에 연결하지 않는다.

## 검증과 남은 위험

- slice 1 focused test 19건 통과(구조, UI 조립, runtime, HTTP server, 설정/이미지 경로).
- slice 1 browser UI smoke test 통과(252 fixture requests). 제거 과정에서 발견한 블로그 수동발행 함수의 잘못된
  모듈 소유권도 블로그 자동화 모듈로 교정했다.
- 사용자 승인에 따라 slice 1을 parent 브랜치에 반영한다.
- browser 회귀와 전체 단위 테스트는 reviewable milestone에서 사용자 승인을 받은 뒤 실행한다.
- 최종 시각·탐색 확인은 사용자가 수행한다.
