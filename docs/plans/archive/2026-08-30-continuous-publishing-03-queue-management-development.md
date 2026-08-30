# 연속 발행 Stage 3 — Queue 발행 계획 관리

## 브랜치 정보

- branch: `feature/continuous-publishing-03-queue-management`
- 시작일: 2026-08-30
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 완료 · parent 통합 승인

## 사용자 필요와 목표

`발행 준비 완료`로 등록한 글감을 Queue에서 확인하는 데 그치지 않고, 실제 실행 전에
글감별 발행 계획을 수정하거나 안전하게 대기 상태로 되돌릴 수 있게 한다. Queue 항목을
삭제하는 대신 개인 Topics Sheet의 같은 행과 상태를 유지해 글감을 잃지 않게 한다.

## 범위

- Queue 항목의 주제와 글감별 발행 계획 확인
- 발행 플랫폼, 대상별 카테고리, 글쓰기 전략, 이미지 처리, 외부 참고, 공개·임시 저장·예약 계획 수정
- 수정 전에 ready 계약 재검증
- `대기열에서 빼기`를 Topics 행 삭제가 아닌 `대기` 상태 복귀로 처리
- 변경 성공 후 FIFO Queue 즉시 갱신
- 기존 블로그 화면과 새 빠른 등록 흐름의 회귀 검증

## 비목표

- Queue 행 삭제
- drag-and-drop 또는 별도 우선순위 컬럼
- 원고 생성과 실제 플랫폼 발행
- 실패 자동 재시도와 재시도 횟수 정책
- 여러 PC의 동시 claim

실패 재시도는 연속 발행 runner가 실패·확인 필요 상태를 실제로 만들고 기록하는 단계에서
같은 상태 전이 계약으로 연결한다.

## 제안 설계

- 기존 Topics Sheet 행 번호를 stable mutation target으로 사용한다.
- 새 continuous-publishing service가 행 조회·검증·수정을 소유하고 legacy UI handler를 호출하지 않는다.
- 수정 요청은 상태를 `발행 준비 완료`로 유지하며 글감별 options만 갱신한다.
- Queue 제외는 같은 행의 상태만 `대기`로 바꾸고 글감과 발행 계획은 보존한다.
- UI는 각 Queue 카드의 `발행 계획 수정`, `대기열에서 빼기` 두 액션만 우선 제공한다.

## 진행 기록

- 2026-08-30: Stage 2를 parent에 통합하고 Stage 3 하위 브랜치를 생성했다.
- 2026-08-30: 실패 재시도는 runner 이전에 억지로 도입하지 않고 후속 상태 전이 단계로 미뤘다.
- 2026-08-30: 기존 Topics 편집 gateway를 확장해 Queue의 `platforms`도 options에 함께 갱신하도록 했다.
- 2026-08-30: 키워드·지시사항·참고 URL만 있는 유효한 글감도 새 Queue에서 수정할 수 있게 idea seed 검증을 일치시켰다. 기존 블로그 편집의 subject 검증은 그대로 유지된다.
- 2026-08-30: mutation 직전에 행이 여전히 `발행 준비 완료`인지 재조회해 stale UI가 완료·진행 중 행을 덮어쓰지 않게 했다.
- 2026-08-30: Queue 카드에서 같은 입력 폼으로 발행 계획을 수정하고, 확인 후 글감을 삭제하지 않은 채 `대기`로 되돌리는 UI를 구현했다.
- 2026-08-30: 사용자가 실제 Topics Sheet에서 발행 계획 수정과 `대기` 상태 복귀가 정상 동작함을 확인했다.
- 2026-08-30: `0건 대기 중`이 Topics의 `대기` 상태와 Queue 대기 수를 혼동시키며, 수정·제거 뒤 `빠른 글 작성` 문맥으로 이동하는 UX도 자연스럽지 않음을 확인했다. 기능 계약은 유지하고 라벨·화면 전환은 후속 UI 정리로 분리한다.
- 2026-08-30: 사용자가 Stage 3 완료 처리와 다음 단계 진행을 승인해 완료 기록을 archive로 이동했다.

## 검증 계획

- ready 계획 수정 validation과 row mutation unit test
- Queue 제외가 delete 없이 `대기` 상태만 기록하는 service test
- browser smoke에서 편집, 저장, Queue 제외와 목록 갱신 확인
- 집중 테스트 후 전체 unit regression

## 완료 결과

- Queue 카드에서 글감의 발행 계획을 불러와 수정한 뒤 같은 Topics 행에 저장한다.
- `대기열에서 빼기`는 명시적 확인 후 상태만 `대기`로 변경한다.
- 수정·제외 후 상태별 Topics cache를 무효화하고 FIFO Queue를 즉시 갱신한다.
- stale Queue 항목은 409 응답으로 안전하게 거부하고 새로고침을 안내한다.
- service/UI 집중 테스트, 전체 unit 1,155건과 fixture browser smoke 65 requests가 통과했다.

## 수동 확인과 남은 위험

- 실제 Topics Sheet의 same-row 발행 계획 수정과 `대기` 복귀를 사용자가 확인했다.
- Queue 개수 라벨은 Topics 상태 `대기`와 구분되는 `발행 준비 N건` 또는 `Queue N건`으로 정리해야 한다.
- 수정은 별도 form 이동보다 Queue 내부 modal/drawer를 검토하고, 저장·제외 후 Queue 탭과 scroll context를 유지해야 한다.
- 실패 재시도는 runner가 실패 상태와 로그를 만들 때 함께 설계한다.
