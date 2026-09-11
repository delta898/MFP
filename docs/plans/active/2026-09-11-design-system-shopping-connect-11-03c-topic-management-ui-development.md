# 쇼핑커넥트 글감 관리 UI 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-03c-topic-management-ui`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-11
- Status: 구현 완료 · 사용자 UI 확인 완료 · browser 회귀 대기

## 사용자 필요와 목표

쇼핑커넥트의 `글감 관리`를 Blog Beta의 글감 관리와 같은 글쓰기·발행 모델로 인식할 수 있도록
목록, 상태와 action의 UI 문법을 통일한다. 쇼핑 글은 상품 중심이라는 차이만 유지하고,
작성 후 보관한 글감이 관리와 발행으로 이어지는 흐름은 Blog Beta와 일관되게 만든다.

## 범위

1. Blog Beta 글감 관리의 panel, local tab, queue card, status 및 item action 구조 재사용
2. `발행 대기열`과 `보관한 글감` 두 view로 쇼핑 글감 생명주기 표현
3. 상품명, 상품 링크, 발행 방식을 queue card의 최소 정보로 표시
4. loading, empty, running, result 상태와 새로고침 표현 통일
5. 기존 filter, search, checkbox, table, pagination, batch action UI와 잔여 코드 제거

## 명시적 비범위

- `글감 보관` 요청의 Google Sheet 저장 실패 원인 분석과 보정
- 발행 대기열 순서 재배치와 연속 발행 runtime 추가
- 쇼핑 글감 schema나 Google Sheet 열 변경
- 전체 unit suite 및 browser 회귀 실행
- parent 또는 `design-system-main` 병합

## 설계 결정

- Blog Beta와 쇼핑커넥트는 `작성 → 보관 → 관리 → 발행` 생명주기를 공유한다.
- 화면 구조와 interaction 문법은 공통으로 하고, 목록의 핵심 내용만 블로그 주제와 쇼핑 상품으로 구분한다.
- 기능 검증과 수정은 UI 통일 이후 별도 단계에서 수행하여 시각 변경과 동작 변경을 분리한다.
- 첫 범위에서는 연속 발행 설정을 노출하지 않고 `발행 대기열`과 `보관한 글감`만 제공한다.
- 기존 쇼핑 일괄 관리 테이블의 구조는 재사용하지 않는다. Blog Beta와 같은 queue item과 항목별 action 모델을
  쇼핑 글감에 적용한다.

## 구현 진행

- 3B를 parent에 fast-forward 반영한 뒤 parent에서 3C branch를 시작했다.
- 처음에는 기존 쇼핑 table·filter·batch action을 유지한 채 스타일만 재배치했으나, 이는 사용자가 요청한
  공통 글감 관리 모델이 아니라는 피드백을 받았다.
- 해당 접근을 폐기하고 Blog Beta 글감 관리와 같은 panel intro, 두 개의 segmented view, count badge,
  새로고침, queue item 및 empty state 구조로 다시 구성했다.
- `발행 대기열`에는 `발행 준비 완료`와 `발행 중`, `보관한 글감`에는 `준비` 상태를 배치한다.
- 보관 항목은 `대기열로 이동`·`삭제`, 대기 항목은 `보관으로 이동`·`지금 포스팅` action을 갖는다.
- 기존 상태 filter, 검색, checkbox 일괄 선택, table, pagination UI는 제거했다.
- 제거된 UI에만 사용되던 inline edit 상태·controller, pagination·sort·selection helper,
  일괄 발행 설정 ID 동기화,
  browser smoke의 구형 table selector도 함께 제거했다.
- 즉시 포스팅은 빠른 글 작성의 발행 대상·실행 방식 선택을 공유하며, 항목별 발행으로만 노출한다.
- 시각 비교 후 쇼핑 패널에도 Blog Beta와 같은 panel gap을 직접 재사용하고, 성공 메시지는
  목록을 밀어내는 inline status 대신 공통 toast로 통일했다. 빈 상태·새로고침 문구와 실패 시
  이전 목록 유지 방식도 Blog Beta와 같게 맞춰다.

## 검증과 남은 위험

- 글감 관리 4건, UI controller 구조 8건, 빠른 글 작성 4건, 상품 preview 4건,
  쇼핑 navigation shell 3건, 전체 UI 조립 구조 7건과 변경 JavaScript syntax check를 통과했다.
- `git diff --check`를 통과했다.
- browser 회귀와 전체 unit suite는 사용자 승인 전 실행하지 않는다.
- 사용자가 Blog Beta와 쇼핑커넥트 글감 관리를 비교하고 UI 구조를 확인했다.
- 기존 저장·목록 갱신·발행 action의 실제 동작 검증과 보정은 3D 후속 단계에서 수행한다.
