# 쇼핑커넥트 자동 포스팅 안전 제거 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-01-remove-automation`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-10
- Status: 완료 · browser 회귀 통과 및 parent 반영 승인

## 사용자 필요와 목표

쇼핑커넥트 디자인 개편에 앞서 `자동 포스팅 설정` 영역을 제거한다. 화면만 숨겨 기존 설정에 따른 자동 발행이
계속되는 상태를 허용하지 않고, 사용자가 제어할 수 없는 쇼핑 발행이 발생하지 않도록 관련 실행 경계도 닫는다.

## 범위

1. 쇼핑커넥트 자동 포스팅 탭·form·저장·수동 실행 UI 제거
2. 쇼핑 자동 timer 시작과 자동 cycle 진입 제거 또는 명시적 비활성화
3. dashboard 등 자동 쇼핑 상태 노출 제거
4. 사용되지 않는 UI API와 client wiring 정리
5. 기존 빠른 작성과 일괄 발행 동작의 비회귀 focused 검증

## 명시적 비범위

- 빠른 글 작성·글감 관리의 시각 개편
- 즉시 발행과 사용자가 직접 실행하는 다중 선택 발행 제거
- 일반 Blog 자동 발행 또는 SNS 자동화 변경
- 저장된 legacy 설정 파일의 파괴적 마이그레이션

## 설계 원칙

- 단순히 DOM만 숨기지 않고 runtime의 쇼핑 자동 발행 가능성을 함께 닫는다.
- 쇼핑 즉시·선택 발행 경로는 자동 cycle과 분리해 보존한다.
- 다른 자동화 도메인과 공유하는 runtime을 무리하게 해체하지 않고 쇼핑 전용 entrypoint와 상태만 제거한다.
- 제거된 기능을 가리키는 dashboard·readiness·설정 UI를 남기지 않는다.

## 조사·구현 진행

- 자동 포스팅 탭, form, 저장/수동 실행 client controller와 전용 script를 제거했다.
- 쇼핑 자동 timer, runtime state, cycle, 일일 counter, 수동 action과 HTTP API를 제거했다.
- 서버 시작, 설정 저장, MCP/Telegram capability 조립에서 쇼핑 자동 runner hook을 제거했다.
- `/api/v1/auto/status`와 dashboard에서 쇼핑 자동발행 상태·이동 카드를 제거했다.
- 설정 UI와 기본 config sample에서 쇼핑 자동 설정의 소유권을 제거했다.
- 빠른 포스팅과 사용자가 직접 선택하는 일괄 포스팅 경로는 변경하지 않았다.
- 기존 사용자 config 안의 과거 키는 별도 마이그레이션으로 삭제하지 않지만, 앱 runtime과 UI는 더 이상 이를 읽거나 실행하지 않는다.
- 최초 browser 회귀에서 설정 탭 이벤트가 연결되지 않는 실패를 발견했다. 원인은 기존 쇼핑 자동화 client 파일이 블로그
  자동발행 수동 실행 함수까지 소유하고 있던 잘못된 경계였다. 해당 블로그 함수를 블로그 자동화 모듈로 이동하고,
  블로그 variation helper만 공유 normalization 모듈에 남겨 기능 제거 경계를 바로잡았다.

## 검증과 남은 위험

- 전용 제거 계약 테스트를 추가했고, 구조/UI 조립/runtime/HTTP server 관련 focused test 19건이 통과했다.
- browser UI smoke test가 252개 fixture request 기준으로 통과했다.
- `git diff --check`와 변경 JavaScript syntax 검사를 통과했다.
- 전체 단위 테스트는 parent feature의 최종 merge gate에서 실행한다.
- 다음 수동 확인: 쇼핑커넥트에 두 개의 기존 수동 탭만 보이는지, 빠른/선택 포스팅 진입이 유지되는지 확인한다.
