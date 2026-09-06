# Runtime Credential Security 브라우저 Smoke 보완 개발 기록

## Branch

`feature/runtime-credential-security-browser-smoke-fix`

## 목표

Parent 최종 검증에서 발견된 브라우저 smoke 정체를 해소한다. 키워드 적용 시 정상적으로 표시되는
사용자 확인창에 테스트가 응답하지 않아 무기한 대기하는 문제만 보완하며 제품 동작은 변경하지 않는다.

## 설계와 결정사항

- 기존 키워드가 있는 상태에서 새 키워드를 적용하면 확인이 필요하다는 제품 계약은 유지한다.
- 테스트가 확인 응답을 명시적으로 승인하고 원래 confirm 함수를 반드시 복원한다.
- 빈 주제 자동 입력과 키워드 교체 결과를 모두 계속 검증한다.

## 검증

- Browser UI smoke
- 관련 keyword discovery 단위/계약 테스트
- 전체 unit regression
- `git diff --check`

## 결과

- 기존 키워드 교체 확인창에 테스트가 명시적으로 승인 응답을 주고 원래 함수를 복원한다.
- 자동글감 탭의 비동기 초기 로딩 완료를 기다린 후 결과 표시를 검증한다.
- Dashboard 초기 발견 갱신과 사용자의 수동 갱신을 각각 POST 계약으로 반영한다.
- 제품 코드는 변경하지 않았다.

검증 결과:

- Browser UI smoke: 통과, fixture request 56건
- 전체 unit regression: 1,050 passed
- `git diff --check`: 통과
