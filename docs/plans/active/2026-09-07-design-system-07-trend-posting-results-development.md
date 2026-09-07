# 디자인 시스템 7단계 — 트렌드 포스팅 결과 영역 개발 기록

## Branch

- Branch: `codex/feature/design-system-07-trend-posting-results`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 진행 중 — 결과 table style slice 구현·자동 검증 완료, 사용자 UI 확인 대기

## 사용자 필요와 목표

트렌드 포스팅 개선을 장기 parent나 이전 Stage 7 branch에 계속 누적하지 않고 독립적으로 검토 가능한
sub-feature로 분리한다. 이미 정리된 조회 준비 상태를 출발점으로, 조회 결과가 나타난 뒤의 정보 위계와
상태·행별 action을 Blog Beta 디자인 기준에 맞춘다.

## 범위

1. 최초 조회 전, 조회 중, 결과 있음, 결과 없음, 오류 상태의 결과 영역 노출과 메시지 소유권
2. 결과 filter와 목록 사이의 progressive disclosure 및 중복 안내 제거
3. 행별 `글감 보관` action의 실행 가능, busy, success, error와 재시도 상태
4. 재조회 시 유효한 보관 상태와 마지막 정상 결과 보존
5. 결과 표와 행 action의 desktop·narrow viewport 표현
6. 관련 focused contract, browser smoke 및 사용자 UI 확인

## 명시적 비범위

- 트렌드 provider, API, 수집·저장 계약 변경
- 빠른 글 작성, 글감 관리, 스마트 댓글 또는 기존 `블로그` surface 변경
- 최근 주제 등 새로운 제품 기능 추가
- 실제 원격 저장·발행을 동반하는 검증
- parent merge, push, release 또는 version 변경

## 적용 기준

- 조회 전에는 사용자가 아직 볼 필요가 없는 빈 결과 구조를 미리 노출하지 않는다.
- transient operation 상태는 조회 control 가까이, persistent result 상태는 결과 영역 안에서 한 번만 표현한다.
- 정상 상태를 성공 메시지로 반복 설명하지 않고 결과 자체가 성공을 말하게 한다.
- 행별 action은 해당 행이 busy·success·error를 소유하며 다른 결과의 조작을 불필요하게 막지 않는다.
- 실패해도 마지막 유효 결과와 이미 확인된 보관 상태를 지운 채 빈 화면으로 되돌리지 않는다.
- 의미가 같은 상태와 action은 canonical component guide와 semantic token을 사용하며 화면별 예외를 만들지 않는다.
- 한 번에 하나의 작은 조각을 구현하고 자동 검증 뒤 사용자 UI 확인을 거쳐 다음 조각으로 넘어간다.

## Reviewable slices

### Slice 1. 결과 영역의 상태와 노출

- 최초 조회 전 결과 workspace를 숨긴다.
- loading, empty, error, result 상태의 메시지 소유권을 한 곳으로 정리한다.
- 조회 완료·결과 없음 안내가 filter나 표의 빈 행과 중복되지 않게 한다.

### Slice 2. 행별 보관 action

- 행 단위 busy, success, error와 retry를 제공한다.
- 중복 실행을 막되 다른 행은 계속 조작할 수 있게 한다.
- 재조회 뒤에도 동일 결과의 유효한 보관 상태를 보존한다.

### Slice 3. action hierarchy와 반응형

- 조회, filter, 다운로드·보관 등 action의 중요도와 배치를 공통 기준에 맞춘다.
- 좁은 화면에서 결과 내용과 행 action이 잘리거나 과도하게 밀리지 않게 한다.

### Slice 4. 통합 검증과 기록 마감

- focused contract와 관련 browser smoke를 실행한다.
- 사용자의 desktop·narrow UI 확인 결과를 반영한다.
- parent 통합 전 별도 승인 후 Full unit suite를 수행한다.

## 출발 상태

- parent에는 meta·category·기간과 31일 제한이 유효할 때만 조회를 허용하는 준비 상태가 반영되어 있다.
- loading 중 관련 control을 잠그며, 최초 meta 실패는 재시도 가능한 오류로 표현한다.
- 기존 meta가 있는 갱신 실패에서는 마지막 유효 조건을 보존한다.
- 최신 날짜 badge는 성공이 아닌 neutral metadata로 표현한다.

## 결정과 tradeoff

- 결과 영역 전체를 한 번에 재설계하지 않고 상태 노출, 행 action, 반응형 순서로 나눈다.
- 기존 표 구조를 우선 유지하며 정보 구조 변경이 꼭 필요한 경우 사용자와 별도로 합의한다.
- shared legacy CSS 수정은 다른 surface 회귀 위험이 있으므로 Blog Beta 범위의 semantic pattern을 우선한다.

## 진행 및 변경 기록

- 2026-09-07: Slice 1은 조회 전 결과 workspace와 disabled filter·빈 table을 미리 보여주지 않는 방향으로
  시작했다. 최초 성공 조회 뒤에만 workspace를 열고, 결과가 없으면 table의 한 empty state만 보여준다.
  결과가 있으면 그때 filter를 노출한다. meta 갱신과 조회 성공을 별도 success 문구로 반복하지 않고 badge와
  실제 결과 변화가 완료를 표현하며, loading·error처럼 사용자의 주의나 대응이 필요한 operation만 query
  가까운 live status가 소유한다.
- 2026-09-07: 첫 browser smoke에서 새 workspace 계층 때문에 기존 direct-child overflow 예외가 적용되지 않아
  sticky table header가 행 action의 pointer event를 가로채는 회귀를 발견했다. 테스트 강제 클릭으로 숨기지 않고
  Blog Beta 결과 workspace에 같은 overflow 계약을 명시해 실제 클릭 가능 영역을 복구했다.
- 2026-09-07: 기존 filter의 author-level `display: flex`가 native `hidden` 표시를 덮을 수 있어 Blog Beta의
  `[hidden]` 계약을 명시했다. browser smoke에 최초 숨김, 결과 있음, filter 결과 없음, 조회 결과 없음과 재조회
  전환을 연결해 progressive disclosure가 실제 computed layout에서도 유지되는지 검증한다.
- 2026-09-07: 사용자 확인에서 초기 meta load와 명시적 조회 모두 별도 rectangular loading status를 보여
  다른 workflow보다 과하게 느껴지는 문제를 확인했다. 초기 load는 기존 latest badge와 category placeholder,
  refresh는 회전 icon, 조회는 `조회 중...` button과 `aria-busy`가 각각 진행을 소유하게 하고 별도 loading
  surface를 제거했다. error status는 사용자의 대응이 필요하므로 유지하며, 이 선택 기준을 canonical guide에
  추가했다.
- 2026-09-07: 카테고리 선택 group과 그 상위 조회 section에 동일한 muted fill이 중첩되어 선택 상태가 아닌
  영역 전체를 강조하던 문제를 분리했다. section과 group은 border·spacing으로 범위를 유지하되 기본 surface는
  채우지 않고, 실제 선택된 category chip만 primary fill을 유지한다. multi-select chip group의 재사용 기준도
  canonical surface fill guide에 추가했다.
- 2026-09-07: 결과 table이 legacy 공통 CSS의 blue-gray header, blue hover와 raw-color badge를 그대로 상속해
  활성 style과 이질적인 문제를 분리했다. Blog Beta table 구조와 기능은 유지하고 header·cell·hover·metadata와
  변화 badge를 semantic surface·border·text·primary-soft token으로 연결했다. category는 neutral metadata,
  상승·신규는 product accent, 하락·유지는 문구가 의미를 전달하는 neutral 표현을 사용한다. 재사용 가능한 table
  surface·badge·sortable header 기준은 canonical component guide에 추가했으며 실제 sort 복구는 다음 slice다.
- 2026-09-07: table UI 확인 중 결과 filter select만 native arrow를 사용해 공통 trailing inset보다 오른쪽에
  붙는 적용 누락을 발견했다. 새 token이나 전용 arrow를 만들지 않고 빠른 글 작성에서 검증한
  `blog-next-select-shell`을 재사용해 같은 arrow anchor와 클릭 여백을 적용했으며 narrow width 계약을 함께 유지한다.
  이어진 사용자 확인에서 같은 form의 조회 기간 select도 동일한 누락임을 확인해 같은 shell에 연결했다.
- 2026-09-07: select와 disclosure가 서로 다른 텍스트 glyph 화살표를 사용해 control 높이에 따라 시각적 수직 정렬이
  달라지는 문제를 확인했다. Blog Beta의 `select-shell`, `blog-next-disclosure`, 원고 미리보기의 이미지 확인
  disclosure를 고정 chevron 박스와 공통 수직 중앙 기준으로 통일하고, disclosure 상태는 아이콘 회전으로 표현한다.
- 2026-09-07: 결과 table header의 기존 정렬 affordance와 Blog Beta renderer 연결이 빠져 있던 문제를 확인했다. 구형
  공통 sortable handler와 충돌하지 않도록 Blog Beta 전용 sort state·stable comparator·click/keyboard handler를 추가하고,
  filter 이후 정렬·`aria-sort`·ascending/descending affordance를 함께 제공한다.
- 2026-09-07: `변화` 정렬에서 비수치 상태인 `new`를 숫자 변화량과 같은 Infinity 값으로 취급하면 내림차순 첫 항목이
  되어 의미가 어색해지는 점을 확인했다. `+`, `0`, `-`만 방향별로 비교하고 `new`는 양방향 모두 마지막에 두도록
  명시적 domain 규칙을 적용했다.

## 검증 계획

- 각 slice에서 가장 좁은 관련 contract test를 먼저 실행한다.
- review 가능한 UI 조각이 끝나면 관련 browser smoke를 실행한다.
- 실제 원격 저장은 fixture·mock으로 대체한다.
- 완료 sub-feature를 parent에 통합하기 전 Full unit suite는 사용자 승인을 받고 실행한다.

## 현재 자동 검증

- Blog Beta baseline 및 UI 구조 focused tests: 28 passed, 0 failed
- browser UI smoke: passed (fixture-backed)
- browser 확인 범위: 최초 결과 workspace 숨김, meta 새로고침 뒤 불필요한 success 안내 미노출,
  조회 button busy 상태 복원, 정상 결과·filter 결과 없음·조회 결과 없음·재조회 전환, 결과 행 action 클릭 가능성,
  table header·metadata badge·row hover의 compatibility blue 미사용
- 실제 원격 저장이나 발행은 실행하지 않았다.

## 남은 위험과 수동 확인

- 결과 표는 긴 제목·category·날짜와 행 action이 함께 있어 좁은 폭에서 overflow가 발생할 수 있다.
- 재조회와 행별 저장이 겹칠 때 상태 소유권이 섞이지 않는지 자동·수동 확인이 필요하다.
- 시각적 밀도와 결과 탐색성은 자동 테스트만으로 확정하지 않고 사용자 확인을 받는다.
