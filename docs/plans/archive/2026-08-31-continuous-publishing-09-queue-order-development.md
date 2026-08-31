# 연속 발행 Stage 9: Spreadsheet 기반 대기열 순서 변경

## 브랜치 정보

- branch: `feature/continuous-publishing-09-queue-order`
- 시작일: 2026-08-31
- base/parent branch: `feature/continuous-publishing-main`
- 상태: 구현·자동 검증 완료, parent 통합 승인

## 사용자 필요

발행 대기열에 여러 글감이 쌓였을 때 사용자가 실제 처리 순서를 간단히 바꿀 수 있어야 한다.
대부분 한 PC와 하나의 Spreadsheet를 연결해 사용하므로 분산 Queue나 다중기기 충돌 제어보다
사용자가 눈으로 확인하는 Topics Sheet의 실제 행 순서를 그대로 발행 순서로 사용하는 단순한 구조가 적합하다.

## 목표

- Topics Sheet에서 `발행 준비 완료`인 행의 위에서 아래 순서를 연속 발행 순서로 사용한다.
- 사용자가 준비 항목을 바로 위 또는 아래의 준비 항목 기준으로 이동할 수 있게 한다.
- 순서 변경 직후 Sheet 캐시와 화면 목록을 갱신한다.
- 자동 실행은 캐시된 화면 상태가 아니라 최신 Sheet를 읽어 첫 준비 항목을 선택한다.
- 실행 직전 `발행 준비 완료` 상태 재검증을 유지한다.

## 명시적 비목표

- 별도의 Supabase Queue, `발행순서` 컬럼이나 topic UUID를 추가하지 않는다.
- 다중기기 lock, lease, version 충돌 병합을 도입하지 않는다.
- 드래그앤드롭이나 별도 순서 편집 모드를 만들지 않는다.
- `보관한 글감`의 순서를 변경하지 않는다.

## 승인된 결정

1. 실제 Topics Sheet 행 순서가 Queue 순서다.
2. 자동 실행은 매번 최신 Sheet에서 `발행 준비 완료`만 필터링해 가장 위 항목을 선택한다.
3. UI는 준비 항목 오른쪽 동작 영역에 `↑`, `↓`, `빼기`, `지금 실행` 순으로 배치한다.
4. 첫 항목의 `↑`, 마지막 항목의 `↓`는 비활성화한다.
5. 순서 버튼은 작고 낮은 강조의 보조 버튼으로 제공하고 tooltip과 접근 가능한 이름을 제공한다.
6. 클릭 즉시 Sheet에 반영하며 별도 저장·취소나 편집 모드를 만들지 않는다.
7. 외부에서 Sheet를 직접 변경한 뒤 화면이 오래된 경우 사용자가 새로고침하는 운영 원칙을 유지한다.

## 설계

1. application service가 최신 준비 Queue를 읽어 이동 대상과 인접 준비 항목을 결정한다.
2. Google Sheets의 행 이동 요청으로 대상 행 전체를 인접 준비 항목 앞이나 뒤로 이동한다.
3. 이동 성공 후 topics cache를 무효화하고 갱신된 Queue를 반환한다.
4. UI는 이동 중 목록 동작을 잠그고 성공 후 서버가 반환한 최신 목록을 렌더링한다.
5. 자동 runner가 최상단 준비 글감을 선택하기 직전 topics cache를 무효화해 최신 행 순서를 사용한다.

## 구현 단계

1. Google Sheets 행 이동 helper와 단위 테스트
2. Queue reorder service·route·controller 계약과 테스트
3. 준비 목록의 위·아래 UI와 browser regression
4. runner의 최신 Sheet 조회 보장과 관련 문서 현행화

## 검증 계획

- 첫·중간·마지막 항목의 이동 가능 여부
- 인접 준비 항목 사이에 다른 상태 행이 있어도 올바른 위치로 이동하는지 확인
- 이동 전 대상이 더 이상 준비 상태가 아니면 거부
- 이동 성공 후 cache 무효화와 최신 Queue 반환 확인
- 자동 runner가 최신 Sheet의 첫 준비 항목을 선택하는지 확인
- UI 계약·브라우저 smoke와 관련 단위 회귀

## 진행 기록

- 2026-08-31: 사용자와 한 PC·한 Spreadsheet 운영 전제를 확인하고 실제 Sheet 행 순서를 발행 순서로 사용하기로 합의했다.
- 2026-08-31: 별도 순서 컬럼과 드래그앤드롭을 제외하고 오른쪽 동작 영역의 위·아래 버튼으로 즉시 반영하는 UI를 확정했다.
- 2026-08-31: Google Sheets `MoveDimensionRequest`로 행 전체를 이동하는 helper와 인접 준비 항목 계산을 구현했다. 중간에 `대기` 등 다른 상태 행이 있어도 준비 항목 기준으로 올바른 앞·뒤 위치를 계산한다.
- 2026-08-31: 순서 변경 API가 요청 시 최신 Topics Sheet를 읽고 상태·경계를 다시 검증한 뒤 cache를 무효화하고 갱신된 Queue를 반환하게 했다.
- 2026-08-31: 자동 runner와 Queue 조회도 실행 직전 cache를 비우고 최신 Sheet 순서를 읽도록 보강했다.
- 2026-08-31: 준비 카드 오른쪽에 낮은 강조의 위·아래 버튼을 추가하고 첫 위·마지막 아래를 비활성화했다. 브라우저 회귀 테스트에서 실제 순서 변경, 경계 버튼, 복원과 후속 실행 흐름을 검증했다.
- 2026-08-31: 사용자 확인 전 검토에서 매 이동 성공 Toast와 원격 Sheet 왕복 뒤 화면을 바꾸는 방식이 과하고 느리게 느껴진다는 피드백을 반영했다. 화면은 클릭 즉시 낙관적으로 교환하고 성공 시 조용히 서버 결과로 동기화하며, 실패할 때만 이전 순서 복원과 오류 Toast를 제공한다.
- 2026-08-31: 사용자가 성공 Toast 제거와 즉시 반응 방식 반영 후 Stage 9의 parent 통합을 승인했다.

## 결과

- Topics Sheet의 실제 행 순서와 화면의 발행 대기열 순서가 하나의 기준을 사용한다.
- 사용자는 준비 카드 오른쪽에서 한 칸씩 순서를 바꿀 수 있으며 변경은 즉시 Sheet에 반영된다.
- 화면은 클릭 즉시 바뀌고 성공 알림은 표시하지 않는다. 원격 반영 실패 시에만 이전 순서로 복원하고 오류를 알린다.
- 자동 실행은 화면 cache가 아니라 최신 Sheet의 첫 `발행 준비 완료` 항목을 선택한다.
- 다중기기 lease, 별도 순서 컬럼, drag UI 없이 합의한 단순 구조를 유지했다.

## 자동 검증

- `node --test src/continuous-publishing/queue-order.test.js src/ui-api/services/continuous-publishing.service.test.js`
  - 27개 통과
- `node --test scripts/continuous-publishing-shell-contract.test.js src/continuous-publishing/queue-order.test.js src/ui-api/services/continuous-publishing.service.test.js`
  - 37개 통과
- `npm run test:ui-browser`
  - 97개 fixture request 기반 browser smoke 통과
- `npm run test:unit`
  - 1,193개 통과

## 사용자 수동 확인

- 실제 Topics Sheet에서 중간·첫·마지막 준비 글감의 위·아래 이동
- 화면 새로고침 후 순서 유지
- 순서를 바꾼 뒤 `지금 실행` 또는 연속 발행이 최상단 준비 글감을 선택하는지 확인
