# 디자인 시스템 9단계 — Blog Beta 글감 관리 개발 기록

## Branch

- Branch: `codex/feature/design-system-09-blog-queue-management`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-08
- Status: 진행 중 — slice 설계

## 사용자 필요와 목표

Blog Beta의 `글감 관리`를 기존 디자인 원칙과 component guide에 맞춰 작은 reviewable slice로 개선한다.
발행 대기열과 보관한 글감에서 사용자가 항목의 의미, 가능한 행동과 처리 결과를 빠르게 이해할 수 있게 하되,
기존 저장·정렬·실행 동작과 마지막 정상 목록 보존 계약은 유지한다.

## 범위

1. 발행 대기열과 보관한 글감의 행별 정보·action hierarchy
2. 이동·수정·보관·삭제·즉시 처리 action의 사용자 언어와 상태
3. 목록 loading, refresh, empty, error와 busy 상태 점검
4. desktop과 narrow viewport의 action 접근성 및 overflow
5. 반복 가능한 판단의 canonical component guide 반영
6. focused contract, 관련 browser smoke와 사용자 시각 확인

## 명시적 비범위

- 빠른 글 작성, 트렌드 포스팅, 스마트 댓글과 연속 발행 설정의 별도 재설계
- publishing engine, queue 저장 순서 또는 Topics schema 변경
- drag-and-drop 정렬, bulk action, 검색·filter와 pagination 같은 신규 기능
- 다른 제품 surface에 대한 동시 적용
- release, version bump, tag, push 또는 배포

## 초기 진단

- `빼기`는 실제로 글감을 삭제하지 않고 `보관한 글감`으로 이동하지만 결과를 충분히 설명하지 않는다.
- `지금 실행`은 임시 저장·예약 발행·즉시 발행 중 어떤 결과를 처리하는지 label만으로 알기 어렵다.
- 제목 영역은 실제 수정 button이지만 시각적으로는 일반 제목에 가까워 수정 가능성을 hover 전에는 발견하기 어렵다.
- 위·아래 이동은 icon-only action으로 accessible name과 tooltip을 제공하고 경계 항목을 disabled 처리하므로 기본
  의미 계약은 갖췄다. 다만 action 간 간격·그룹과 공통 icon 표현은 시각 검토가 필요하다.
- 대기열 행마다 primary action 하나가 있고 보조 action은 ghost이므로 형식상 action-group 계약과 맞지만,
  반복되는 filled action의 시각 강도와 실제 핵심 행동이 일치하는지 확인해야 한다.
- 보관한 글감의 `삭제`는 명시적 label과 복구 불가 confirmation을 제공해 위험 의미를 숨기지 않는다.
- 목록은 최초 loading/error와 갱신 실패 시 마지막 정상 결과 보존을 이미 지원하므로 동작을 재구현하기보다
  표현과 회귀 gap만 확인한다.

## Reviewable slices

### Slice 1. 행별 action 의미와 발견 가능성

- 모호한 action label을 실제 결과를 설명하는 사용자 언어로 교정한다.
- 제목을 선택하면 수정한다는 affordance를 과한 control 추가 없이 명확히 한다.
- 이동·보관·삭제·처리 action의 primary/secondary/tertiary 의미와 keyboard name을 맞춘다.
- 실행 중 label과 confirmation도 기본 label과 같은 결과 언어를 사용한다.

### Slice 2. 행 정보 hierarchy와 metadata

- title, platform, 발행 방식과 처리 예상 정보의 우선순위를 정리한다.
- `naver` 같은 내부/영문 값을 사용자 언어로 표현하고 중복 metadata를 줄인다.
- 상태·순서 badge가 본문이나 action과 경쟁하지 않게 한다.

### Slice 3. async·refresh·empty/error 점검

- 최초 loading, empty, error와 마지막 정상 목록을 유지한 refresh failure를 재검증한다.
- tab count, list busy와 refresh button 상태가 같은 source of truth를 반영하는지 확인한다.
- 처리 중 중복 action 방지와 실패 후 복구 상태를 확인한다.

### Slice 4. narrow layout과 통합 검증

- 제목과 metadata가 긴 경우에도 action을 잃지 않고 조작할 수 있게 한다.
- icon-only action의 target size, focus-visible, disabled와 tooltip을 확인한다.
- focused contract, 관련 browser smoke와 사용자 검토 후 parent merge gate를 준비한다.

## 첫 slice 제안

첫 구현은 기능 변경 없이 다음 세 항목으로 제한한다.

1. `빼기`를 `보관으로 이동`처럼 실제 결과를 설명하는 label로 바꾼다.
2. `지금 실행`은 item의 발행 방식과 관계없이 내부 실행 용어를 쓰지 않도록 `지금 처리` 또는 결과별 label로 교정한다.
3. 제목 영역의 accessible name과 낮은 강조의 수정 cue를 맞추되 별도 filled button은 추가하지 않는다.

구체적인 즉시 처리 label은 사용자와 합의한 뒤 구현한다.

## 검증 계획

- 변경 slice별 관련 queue/UI contract
- reviewable UI slice 완료 시 관련 browser smoke
- 사용자 수동 확인: action 의미, visual hierarchy, desktop/narrow 배치
- Full unit suite: parent merge gate에서 별도 승인 후 실행

## 완료 조건

- 모든 행별 action이 실행 결과를 사용자 언어로 설명한다.
- 수정 가능성과 현재 queue 상태를 hover에만 의존하지 않고 이해할 수 있다.
- action priority와 위험 의미가 component guide와 일치한다.
- loading·refresh·failure가 마지막 정상 목록과 action 상태를 깨뜨리지 않는다.
- 좁은 화면에서도 제목과 모든 필수 action에 접근할 수 있다.
- 새 판단이 canonical guide와 focused contract에 남는다.

## 사용자와 결정한 사항

- `글감 관리`는 별도 sub-feature branch에서 작은 slice로 진행한다.
- 이전 typography branch에서 확정한 역할별 typography 기준을 그대로 사용한다.
- 첫 slice 구현 전 action wording과 범위를 다시 합의한다.

## 진행 기록

- 2026-09-08: clean `codex/feature/design-system-main`에서 sub-feature branch를 시작했다.
- 2026-09-08: 이전 진단을 현재 markup, queue renderer, state/confirmation과 component guide에 다시 대조해
  action 의미·발견 가능성을 첫 slice로 선정했다.
- 2026-09-08: Slice 1의 첫 조각에서 대기열 `빼기`를 실제 결과인 `보관으로 이동`으로 교정했다. 즉시 처리
  action은 item의 발행 방식에 따라 `지금 발행`, `지금 임시 저장`, `지금 예약 등록`으로 구분하고 confirmation,
  busy와 실패 복구 문구가 같은 결과 동사를 공유하도록 하나의 copy helper로 묶었다.
- 2026-09-08: action label은 내부 동작보다 사용자 결과를 설명하고 default·confirmation·loading·복구 상태에서
  같은 핵심 동사를 유지한다는 기준을 canonical component guide에 추가했다.
- 2026-09-08: Slice 1 첫 조각 focused queue/shell contract 33개와 `git diff --check`가 통과했고 사용자가
  action 문구와 방향을 확인했다.
- 2026-09-08: Slice 1의 두 번째 조각에서 제목 전체가 기존 수정 button인 구조와 accessible name을 유지하면서
  caption/muted `수정` cue를 제목 옆에 추가했다. cue는 별도 action이나 badge가 아니며 보조 기술에는 중복
  노출하지 않는다. hover·focus에서는 기존 title 반응과 같은 primary text로 전환한다.
- 2026-09-08: 넓은 card content가 action일 때 hover에만 발견 가능성을 맡기지 않고 필요 시 낮은 강조의 상시
  결과 cue를 제공하되 같은 action button을 중복하지 않는 기준을 canonical component guide에 추가했다.
- 2026-09-08: Slice 1 두 번째 조각의 focused queue/shell contract 34개와 `git diff --check`가 통과했다.
- 2026-09-08: 사용자 확인 결과 반복 row와 pointer 반응만으로 수정 동작이 충분히 명확해 상시 `수정` cue는
  정보 중복으로 판단해 제거했다. 대신 accessible name과 hover·focus 반응은 유지했다.
- 2026-09-08: 실행 결과에 따라 primary action 문구 길이가 달라도 이동·보관·실행 control의 열이 흔들리지
  않도록 desktop action group을 역할별 고정 grid로 정렬하고, 좁은 화면에서는 기존 flex 흐름을 유지했다.
- 2026-09-08: Slice 2 첫 조각에서 닫힌 queue editor modal을 opacity 상태뿐 아니라 native `hidden`과 scoped
  `display: none`으로 렌더링에서 제외했다. editor를 열 때만 hidden 상태를 해제해 최초 글감 관리 진입 중 흰
  modal surface가 순간 노출될 수 있는 경로를 차단했다.
- 2026-09-08: modal flash 보강 후 focused queue/shell contract 34개와 `git diff --check`가 통과했다.
- 2026-09-08: Slice 2 두 번째 조각에서 최초 목록 placeholder와 공통 loading status bar를 제거했다. 최초 진입과
  직접 새로고침은 count 및 refresh action이 진행 상태를 소유하고, 이동·삭제·보관과 background refresh는 해당
  action 상태만 유지한다. 독립 status surface는 사용자의 대응이 필요한 load error에만 남겼다.
- 2026-09-08: loading feedback 정리 후 focused queue/shell contract 34개와 `git diff --check`가 통과했다.
- 2026-09-08: 실패 feedback도 소유 위치별로 교정했다. 최초 load 실패는 비어 있는 목록 내부 error state만,
  기존 목록의 갱신 실패는 목록을 유지한 채 management status만 표시해 같은 오류 안내가 중복되지 않게 했다.
- 2026-09-08: 실패 feedback 분리 후 focused queue/shell contract 34개와 `git diff --check`가 통과했다.
- 2026-09-08: 교정 후 focused queue/shell contract 34개와 `git diff --check`가 통과했다.

## 최종 결과

- 구현 및 검증 후 갱신한다.
