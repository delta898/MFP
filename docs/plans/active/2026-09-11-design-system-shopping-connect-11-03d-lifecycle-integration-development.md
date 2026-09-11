# 쇼핑커넥트 글감 생명주기 연동 개발 기록

## Branch

- Branch: `codex/feature/design-system-shopping-connect-11-03d-lifecycle-integration`
- Base/parent branch: `codex/feature/design-system-shopping-connect-11`
- Start date: 2026-09-11
- Status: 구현·자동 검증 완료

## 사용자 필요와 목표

쇼핑커넥트에서 작성한 글이 Blog Beta와 같은 생명주기로 이동해야 한다. `글감 보관`한
상품 글이 `보관한 글감`에 바로 나타나고, 같은 항목을 발행 대기열로 옮기거나 수정하고
단건 포스팅할 수 있도록 저장·조회·상태 전이·실행 경계를 일치시킨다.

## 범위

1. 빠른 글 작성의 `글감 보관`과 `바로 포스팅` 요청·상태 계약 검증
2. `준비` 글감의 보관 목록 조회와 `발행 준비 완료` 대기열 조회 일치
3. 보관·대기열 간 상태 전이, 보관 글감 삭제, 글감 수정 연동
4. 항목별 `지금 포스팅`이 선택한 항목과 작성 단계의 발행 계획을 사용하는지 검증
5. 요청 실패 시 마지막 유효 목록·항목 상태 보존과 재시도 피드백
6. 생명주기 service·route·UI contract focused 테스트

## 명시적 비범위

- 연속 발행 설정·scheduler·queue reorder 추가
- 쇼핑 시트 schema와 기존 상품 정보 추출 변경
- Blog Beta 생명주기 동작 변경
- 실제 블로그 발행, 유료 AI 호출, 원격 데이터 변경 테스트

## 설계 원칙

- 상태는 UI 문구가 아니라 저장·조회·실행이 공유하는 명시적 생명주기 계약으로 다룬다.
- 상품 정보와 발행 계획은 같은 글감의 식별자를 유지한 채 상태만 이동한다.
- 삭제를 제외한 상태 전이는 기존 행을 재생성하지 않는다.
- 외부 시트·발행 실패는 마지막 유효 로컬 상태를 지우지 않는다.

## 진행 기록

- 3C를 parent에 fast-forward 병합하고 완료 branch를 삭제한 뒤 3D branch를 시작했다.
- 빠른 글 작성의 `글감 보관`은 새 행을 `준비` 상태로, 바로 포스팅은 `발행 준비 완료` 상태로
  추가한 뒤 같은 행 인덱스로 실행 경계에 전달하는 구조임을 확인했다.
- 문제는 상태 변경·수정·삭제 뒤의 shopping 목록 캐시 무효화가 일관되지 않아, 목록이 짧은 시간
  이전 상태를 다시 보여줄 수 있었던 점이다. 모든 shopping 행 추가·상태 변경·편집·삭제 뒤에
  `shopping` 접두 캐시를 무효화하도록 보정했다.
- UI의 낙관적 상태 변경은 실패 시 수정 전 항목 값과 options를 즉시 복원한다. 성공 후에는 짧은
  확인 조회만 수행하므로, 전파 대기 시간 동안 UI를 잠그거나 오래된 목록으로 되돌리지 않는다.
- 사용자가 지적한 대로 쇼핑 `글감 보관`은 legacy quick-publish URL이나 그 runtime을 호출하지 않는다.
  Blog Beta와 같은 `continuous-publishing` route → controller → lifecycle service 경계를 통과하도록
  `/api/v1/continuous-publishing/shopping/topics` capture API를 추가했다. 전용 row builder가 입력을
  검증한 뒤 shopping Sheet에 `준비` 상태 행을 append하고, 공통 capture 응답 형태로 행 식별자를 돌려준다.
- UI는 Sheet 저장 성공 직후 `글감 보관 완료` toast를 표시한다. 이어지는 목록·dashboard 갱신은
  부가적인 동기화이므로 일시 실패가 저장 성공 피드백을 가리지 않는다.

## 검증과 남은 위험

- focused tests 59건 통과: shopping capture row 생성, Sheet append, continuous route/service capture,
  목록 캐시 무효화와 저장 성공 피드백을 확인했다.
- 브라우저 UI smoke test 통과: fixture 요청 251건으로 쇼핑커넥트의 보관·목록 UI 회귀를 확인했다.
- 사용자가 수동으로 Sheet 저장, toast, 버튼 복구, 보관함과 발행 대기열 간 이동을 확인했다.
- `바로 포스팅`과 대기열의 `지금 포스팅`은 기존 shopping batch runtime 경로를 사용한다. 저장 시점의
  대상 채널을 행별 발행 계획으로 보존하고 Blog Beta runner와 같은 lifecycle 경계로 실행하는 작업은
  다음 slice로 분리한다.
