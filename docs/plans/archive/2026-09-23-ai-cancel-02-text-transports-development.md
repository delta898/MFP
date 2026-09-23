# AI 생성 취소 02 — 텍스트 transport 중단 개발 기록

- 브랜치: `codex/feature/ai-cancel-02-text-transports`
- 시작일: 2026-09-23
- 기준/부모 브랜치: `codex/feature/ai-generation-cancellation`
- 상태: 구현·집중 검증 완료, parent에 fast-forward 병합됨
- parent 기록: `2026-09-23-ai-generation-cancellation-main-development.md`
- 계약 결정: `../../decisions/2026-09-23-ai-generation-cancellation-contract.md`

## 사용자 필요와 목표

AI 글쓰기 응답이 느리거나 실패해 재시도되는 동안 사용자가 취소하면 텍스트 모델 호출과 재시도 대기를 실제로 중단해야 한다. 첫 단계에서 만든 서버 작업 signal을 현재 글쓰기 경로 끝까지 전달한다.

## 범위

- Blog Beta AI 원고 생성의 `executeQuickPublish` → `Core.generateContent` → 공통 텍스트 transport로 signal 전달
- Gemini, OpenAI 호환 호출(OpenAI·Anthropic 호환·KIE 텍스트 등 현재 routing 기준)의 현재 HTTP 요청·재시도 대기 중단
- 취소 오류와 일반 provider 실패·타임아웃 구분, 취소 후 추가 재시도 금지
- 참고자료 수집과 단계 사이의 가능한 중단 지점 확인
- 선택 모델의 작업 시작 snapshot 범위를 검토하고, 이번 텍스트 경로에서 동작 중 설정 변경의 영향을 차단
- 모의 HTTP 및 집중 회귀 테스트

## 비범위

- 이미지 모델, KIE Market 이미지 비동기 작업과 다운로드 중단
- UI 취소 버튼·상태 안내
- 다른 Blog/Agent/Discovery/댓글 경로에 취소 UI 추가
- 유료 AI 호출 또는 원격 작업 실행

## 설계와 영향 경계

하위 함수에 선택적 `signal`을 전달해 기존 호출자는 변하지 않게 한다. transport에서는 HTTP 요청의 중단과 재시도 대기의 중단을 모두 처리한다. 상위 생성 조립기의 catch는 취소를 일반 생성 실패로 바꾸거나 후속 이미지 준비로 진행시키지 않는다. 모델 설정은 생성 시작 시 복사한 선택값을 요청에 사용한다.

## 결정과 트레이드오프

- provider별 모델 ID가 아니라 transport 경계에서 공통 취소를 구현한다.
- 텍스트 응답이 이미 완료된 뒤 취소되면 파일 쓰기와 다음 단계 시작 전에 신호를 재확인한다.
- 외부 참고 수집의 네트워크 호출을 얼마나 세밀하게 끊을지는 기존 API 표면을 조사해 결정한다. 최소한 다음 요청으로 넘어가지는 않아야 한다.

## 진행 기록

- 2026-09-23: parent의 첫 단계가 집중 검사 후 병합된 것을 확인하고 두 번째 sub-feature를 만들었다. 기능 코드 변경 전 개발 기록을 시작했다.
- 2026-09-23: 생성 서비스에서 작업 시작 시 글쓰기 모델 설정을 복사하고 signal과 함께 quick-publish runtime, Core, 공통 텍스트 호출까지 전달했다. 중간에 전역 모델 설정이 바뀌어도 진행 중 작업은 최초 선택을 사용한다.
- 2026-09-23: Gemini 및 OpenAI 호환 텍스트 요청에 Axios signal을 전달했다. 취소는 일반 실패·한도 오류·재시도 대상으로 처리하지 않으며, 재시도 대기에도 즉시 종료 가능한 타이머를 사용한다.
- 2026-09-23: 참고 URL 조회는 Axios 요청을 중단한다. 선택적 외부 참고 검색은 현 gateway가 자체 중단 신호를 받지 않아 로컬 대기만 종료하고 후속 텍스트 생성은 시작하지 않는다. 원격 조회가 이미 접수됐을 수 있다는 점은 남은 제약이다.
- 2026-09-23: Core가 AI 텍스트 응답을 받은 뒤에도 파일 저장 직전 신호를 확인한다. 생성 조립기의 catch와 이미지별 catch는 취소를 일반 실패로 삼키지 않도록 했다. 이미지 HTTP 호출 자체의 중단은 다음 단계다.
- 2026-09-23: 모의 HTTP에서 Gemini, OpenAI, Anthropic 호환, KIE Responses/OpenAI-chat 경로의 진행 중 중단과 재시도 대기 중단을 확인했다. 취소 뒤 `contents.md`를 쓰지 않고, 선택 모델 snapshot이 유지되는 것도 검증했다.
- 2026-09-23: `93ddd59`를 parent `codex/feature/ai-generation-cancellation`에 fast-forward 병합하고 sub-feature 브랜치를 삭제했다. 완료 기록은 archive로 이동했다.

## 결과와 검증

- 구현 결과: Blog Beta AI 원고 생성에서 텍스트 요청과 재시도 대기를 취소할 수 있으며 취소된 결과는 파일/원고로 넘어가지 않는다. 이미지 호출은 아직 직접 중단하지 않는다.
- 자동 검증: 관련 transport·Core·runtime·서비스·작업 관리자 집중 테스트 40개 통과. UI 변경이 없으므로 브라우저 smoke는 이번 단계에 불필요.
- 수동 확인: 최종 UI 연결 후 실제 장시간 요청을 사용자가 확인한다.
- 남은 위험: 이미지 단계와 미리보기 등록 전 임시 폴더 정리는 후속 단계에서 다룬다.
