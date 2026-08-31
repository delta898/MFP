# 연속 발행 Stage 10-2: 자동 글감 공통 계획 UI

## 브랜치 정보

- branch: `feature/continuous-publishing-10-auto-topic-ui`
- 시작일: 2026-08-31
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 완료

## 사용자 필요

Trends와 RSS가 자동으로 만드는 글감의 발행 계획을 기존 자동 포스팅 설정에서 빌려 쓰지 않고,
사용자가 이해하기 쉬운 `자동 글감` 화면에서 하나의 공통 계획으로 관리해야 한다.

## 목표

- `블로그 Beta`에 `자동 글감` 메뉴를 제공한다.
- Trends/RSS가 공유할 발행 대상, 글쓰기 전략, 이미지 처리, 외부 참고와 포스팅 옵션을 설정한다.
- Stage 10-1의 `AUTO_TOPIC_PLAN` 설정 계약을 조회·저장한다.
- 최초 저장 전 legacy fallback 값과 저장 후 명시 설정을 동일한 폼에서 자연스럽게 다룬다.
- 기존 Blog Beta UI의 간결한 문구와 컴포넌트 스타일을 재사용한다.

## 명시적 비목표

- 이 단계에서 Trends/RSS 수집기를 새 계획으로 전환하지 않는다.
- Trends/RSS 출처별 세부 설정 UI를 이전하지 않는다.
- 수동 트렌드 대기열 추가를 구현하지 않는다.
- 예약 발행, 다중 발행 프로필이나 별도 scheduler를 추가하지 않는다.
- 기존 `블로그` 메뉴를 제거하거나 바꾸지 않는다.

## 합의된 결정

1. 메뉴 이름은 `자동 글감`이다.
2. Trends와 RSS는 하나의 공통 발행 계획을 사용한다.
3. 공통 계획은 포스팅 대상, 글쓰기 전략, 이미지 처리, 외부 참고와 즉시 발행·임시 저장만 포함한다.
4. 예약 발행은 제외한다.
5. 화면은 설명을 늘리기보다 기존 Blog Beta 폼 패턴을 재사용해 단순하게 구성한다.

## 구현 단계

1. Blog Beta navigation·partial·settings API 사용 방식 조사
2. 독립 `자동 글감` view와 controller 추가
3. major settings 조회·저장 및 validation/error/loading 연결
4. UI contract/browser regression과 문서 현행화

## 검증 계획

- 메뉴·필드·허용 옵션 DOM contract
- API 응답으로 폼 초기화 및 legacy source 처리
- 저장 요청에 완전한 `AUTO_TOPIC_PLAN` 포함
- 저장 중 중복 실행 차단과 실패 시 기존 입력 보존
- 기존 Blog Beta 주요 browser regression

## 진행 기록

- 2026-08-31: Stage 10-1을 parent에 통합하고 UI 전용 하위 브랜치를 시작했다.
- 2026-08-31: `블로그 Beta`의 독립 탭으로 `자동 글감`을 추가하고 공통 발행 계획 폼을 연결했다.
- 2026-08-31: 저장 전에 최신 major settings 전체를 읽고 `AUTO_TOPIC_PLAN`만 병합해 다른 설정을 보존하도록 했다.
- 2026-08-31: 빈 발행 대상을 UI에서 먼저 차단하고 저장 중 중복 요청을 막으며, 실패 시 현재 입력을 유지하도록 했다.

## 결과

- 포스팅 대상, 글쓰기 전략, 이미지 처리, 외부 참고와 즉시 발행·임시 저장을 한 화면에서 관리한다.
- 최초 진입 시 Stage 10-1이 제공하는 legacy fallback 또는 명시 저장 계획을 그대로 표시한다.
- 예약 발행과 출처별 카테고리는 이 공통 계획 화면에 노출하지 않는다.
- 실제 Trends/RSS 수집 행 생성은 아직 바뀌지 않았다.

## 자동 검증

- Stage 10 UI/domain/script focused tests: passed
- browser UI smoke: passed, 실제 탭 진입·계획 로드·변경·저장 요청 확인
- legacy blog auto API smoke: passed
- full unit suite: 1,202 passed, 0 failed
- `git diff --check`: passed

## 사용자 확인 항목

1. `블로그 Beta > 자동 글감` 탭의 간격과 기존 화면과의 스타일 일치
2. 기존 자동 포스팅 설정이 초기값으로 나타나는지 확인
3. 설정 저장 후 화면 재진입 시 같은 값이 유지되는지 확인
4. 포스팅 대상을 모두 끄면 저장이 차단되는지 확인

- 2026-08-31: 사용자가 UI 로드·저장 동작을 확인하고 다음 단계 진행을 승인했다.

## 남은 위험과 후속

- 다음 단계에서 Trends/RSS producer가 수집 시점의 공통 계획을 각 Topics 행에 복사하도록 연결해야 한다.
- 출처별 카테고리와 활성화·수집 조건 UI는 후속 단계에서 기존 화면을 참고해 이전한다.
