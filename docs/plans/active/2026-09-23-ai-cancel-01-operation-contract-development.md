# AI 생성 취소 01 — 작업 수명주기와 서버 계약 개발 기록

- 브랜치: `codex/feature/ai-cancel-01-operation-contract`
- 시작일: 2026-09-23
- 기준/부모 브랜치: `codex/feature/ai-generation-cancellation`
- 상태: 구현 완료·커밋 준비, 전체 unit suite 및 parent 병합 보류
- parent 기록: `2026-09-23-ai-generation-cancellation-main-development.md`
- 계약 결정: `../../decisions/2026-09-23-ai-generation-cancellation-contract.md`

## 사용자 필요와 목표

블로그 Beta에서 오래 걸리는 AI 원고 생성에 취소를 요청하고, 서버가 실제로 작업을 종료했는지 확인한 뒤 다른 모델로 재시도할 수 있어야 한다. 이 첫 단계는 모델별 중단보다 앞서 작업의 식별·상태·취소 접수·잠금 해제 계약을 만든다.

## 범위

- 서버가 발급하는 작업 ID와 시작·상태 조회·취소 API
- 활성 작업 단일 실행 잠금과 종료 상태의 짧은 보존
- 취소 요청 후 실행이 끝나기 전까지 잠금 유지, 중복 취소와 늦은 취소 처리
- 실행 Promise의 실패 포착, 취소된 결과의 Draft 반영 차단
- 서비스·controller·route 및 집중 테스트

## 비범위

- UI 버튼과 폴링 화면
- 실제 Gemini/OpenAI/KIE HTTP 요청·재시도·폴링 중단
- 임시 작업 디렉터리의 최종 정리 정책과 원격 KIE 작업 취소
- 기존 블로그 화면과 발행 취소

## 제안 설계와 영향 경계

`src/blog-next/`에 생성 작업 수명주기 관리자를 두고 기존 실행 coordinator의 lease를 재사용한다. 시작은 작업 등록과 동시에 응답하고, 백그라운드 Promise의 결과를 제한된 기간 동안 조회할 수 있게 한다. 취소 요청은 signal을 보낸 뒤 `cancel_requested`를 반환하며, 실제 실행 종료·정리 후 `canceled`로 전이한다. 서비스의 Draft 생성 경계는 signal을 확인해 취소된 작업의 결과를 저장하지 않는다.

기존 동기 생성 API는 이 단계에서 유지한다. 새 API는 `manuscript-drafts/ai/operations` 아래에 추가한다. UI 전환 단계에서 구 API 사용 종료 또는 유지 여부를 다시 검토한다.

## 결정과 트레이드오프

- 장시간 POST를 단순히 끊는 것으로는 서버 작업 중단을 보장하지 못하므로 작업 조회·취소 endpoint를 별도로 둔다.
- 작업 ID는 서버에서 발급한다. 다른 작업 ID나 이미 완료한 작업을 취소해도 현재 실행이 영향받지 않게 한다.
- 이 단계에서는 실제 모델 호출에 signal이 전달되지 않으므로, 취소 요청 후 현재 모델 호출이 끝날 때까지 잠금이 유지될 수 있다. 사용자에게 취소가 즉시 완료된 것처럼 표시하지 않는다.
- 원고 Draft 영속 생성 직전부터는 commit 경계로 취소를 거절한다. 이 경계 전후 경합을 테스트한다.

## 진행 기록

- 2026-09-23: parent의 미커밋 설계 문서를 보존한 채 sub-feature 브랜치를 만들고 개발 기록을 시작했다.
- 2026-09-23: `src/blog-next/ai-generation-operations.js`에 단일 작업 수명주기 관리자를 추가했다. 별도 작업 ID, 상태·단계 조회, 취소 접수, commit 경계, 종료 결과의 한시 보존, lease 해제를 구현했다.
- 2026-09-23: 기존 동기 원고 생성 API는 유지하고 새 `/api/v1/blog/manuscript-drafts/ai/operations` 시작·현재·ID별 상태·취소 route를 추가했다. 공통 원고 생성 서비스는 취소 신호를 받아 모델 호출 뒤 Draft 생성 전 재확인한다.
- 2026-09-23: 생성 결과가 취소 후 늦게 도착해도 Draft를 만들지 않고 preview session을 정리하도록 했다. 이미지별 transport와 생성 중 임시 폴더 정리는 후속 단계로 남겼다.
- 2026-09-23: 사용자가 병합 전 전체 unit suite를 이번에는 보류하기로 했다. 병합 게이트는 면제되지 않으므로 sub-feature를 parent에 병합하거나 다음 sub-feature를 시작하지 않는다.

## 결과와 검증

- 구현 결과: 서버 작업 계약과 취소 후 Draft 반영 차단 완료. UI와 provider 전파는 아직 없음.
- 자동 검증: 작업 관리자, coordinator, 서비스, controller, route 집중 검사 32개 통과. `git diff --check` 통과. 전체 unit suite는 사용자 요청으로 보류했으며 parent 병합 전에 반드시 실행해야 한다.
- 수동 확인: UI 연결 이후 사용자가 실제 취소·재시도를 확인해야 한다.
- 남은 위험: 현재 transport는 아직 중단 신호를 소비하지 않는다. 이 단계 단독으로는 지연을 즉시 해소하지 못한다.
