# 연속 발행 Stage 4 — 안전한 단건 Runner

## 브랜치 정보

- branch: `feature/continuous-publishing-04-single-item-runner`
- 시작일: 2026-08-30
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 완료 및 parent 통합 준비

## 사용자 필요와 목표

Queue의 가장 오래된 `발행 준비 완료` 글감 한 건을 선택하여 해당 글감이 소유한 발행 계획대로
원고를 생성하고 발행한다. 먼저 수동 `다음 1건 실행`으로 전체 상태 전이와 실패 복구를 검증한 뒤,
같은 runner를 연속 발행 timer가 호출하게 한다.

## 첫 vertical slice 범위

- FIFO 기준 다음 ready 글감 한 건 선택
- 실행 직전 현재 상태 재확인과 in-process single-flight
- `발행 준비 완료 → 발행 중 → 발행 완료/임시 저장 완료/예약 포스팅 등록 완료` 상태 전이
- 실패 성격에 따른 `발행 준비 완료` 복귀 또는 `실패/확인 필요` 기록
- 글감이 소유한 플랫폼·카테고리·전략·이미지·외부 참고·발행 방식 사용
- 수동 `다음 1건 실행` API와 진행 상태 표시
- 기존 생성·quota·환경별 live publish gate·플랫폼 publisher 재사용

## 비목표

- 주기 timer와 자동 시작 설정
- 여러 PC를 아우르는 distributed lease
- 무제한 자동 재시도
- Queue 우선순위 변경
- 실제 외부 발행을 수행하는 자동 테스트

## 초기 조사 결과

- 기존 `executeBlogRowAction`은 Topics options의 플랫폼과 글감별 계획을 우선 사용할 수 있다.
- 기존 batch wrapper는 전역 `targets`와 `postStatus`를 전달할 수 있으므로 새 runner는 이를 전달하지 않아야 한다.
- 기존 단건 action은 live publish 환경 gate, 라이선스·quota와 최종 상태 기록을 이미 포함한다.
- Naver 세션 검사를 모든 target에 공통 적용하는 현재 동작은 WordPress-only 글감에도 불필요한 차단이 될 수 있어 target-aware preflight가 필요하다.
- 여러 프로세스/PC의 동시 claim은 Sheet status update만으로 원자성이 보장되지 않으므로 첫 slice는 앱 내부 single-flight로 범위를 제한하고, distributed lease는 별도 설계한다.

## 안전 원칙

- 자동 테스트는 fixture/mock만 사용하고 AI, 원격 Sheet mutation과 플랫폼 발행을 호출하지 않는다.
- 수동 실행도 현재 environment의 live publish 정책을 그대로 따른다.
- 상태가 이미 ready가 아니면 실행하지 않는다.
- 치명적 사전조건 실패는 글감을 잃지 않도록 ready로 복귀시키고 사용자에게 원인을 보여준다.
- 중복 발행 방지는 기존 stable operation ID와 publisher ledger를 유지한다.

## 구현 단계

1. runner orchestration과 상태 전이 계약을 dependency-injected domain/application service로 작성
2. 기존 단건 action의 target-aware preflight 보완
3. 수동 실행 API·UI와 진행 상태 연결
4. mocked integration, browser smoke와 전체 unit regression

## 진행 기록

- 2026-08-30: Stage 3를 parent에 통합하고 Stage 4 하위 브랜치를 생성했다.
- 2026-08-30: 자동 timer보다 수동 단건 실행을 먼저 검증하는 vertical slice로 범위를 정했다.
- 2026-08-30: Topics FIFO 조회, in-process single-flight, 진행 상태 유지 API를 구현했다.
- 2026-08-30: runner가 전역 target·post status를 넘기지 않고 행이 소유한 발행 계획을 사용하게 했다.
- 2026-08-30: Development 수동 실행은 manual publish policy를 사용하고, 후속 timer는 automated publish policy를 사용할 경계를 분리했다.
- 2026-08-30: WordPress-only 글감이 Naver session 사전 검사로 차단되지 않도록 target-aware preflight를 적용했다.
- 2026-08-30: 실행 버튼, 브라우저 숨기기, 진행·결과 표시와 polling을 `블로그 Beta`에 연결했다.
- 2026-08-30: 사용자가 Development에서 Queue 글감의 `다음 1건 실행`과 실제 처리 완료를 확인했다.

## 완료 결과

가장 오래된 준비 글감 한 건을 행 계획 그대로 수동 실행하는 수직 흐름을 구현했다.
기존 생성·발행·quota·상태 기록 엔진을 재사용하며, 실행 중인 프로세스 안에서 두 번째 시작을
차단하고 완료·실패 결과를 후속 조회에서도 유지한다.

## 수동 확인과 남은 위험

- Development에서 Queue 글감의 `다음 1건 실행`과 실제 처리 완료를 사용자가 확인했다.
- Naver·WordPress 대상별 추가 조합과 공개·예약 방식은 후속 통합 검증에서 계속 확인한다.
- 동일 Topics Sheet를 여러 PC에서 동시 실행하는 경우는 아직 원자적 claim이 없으므로 지원 범위가 아니다.
