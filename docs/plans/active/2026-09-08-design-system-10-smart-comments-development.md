# 디자인 시스템 10단계 — Blog Beta 스마트 댓글 개발 기록

## Branch

- Branch: `codex/feature/design-system-10-smart-comments`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-08
- Status: 구현 완료 — parent 병합 전 full unit 승인 대기

## 사용자 필요와 목표

Blog Beta의 `스마트 댓글` 화면을 지금까지 정립한 디자인 원칙과 component guide에 맞춰 점검하고,
사용자가 대상·실행 조건·진행 상태·결과를 간결하고 일관되게 이해하도록 작은 reviewable slice로 개선한다.

## 범위

1. 스마트 댓글 화면의 정보 hierarchy, typography, spacing과 component 상태
2. 입력·선택·실행 action의 활성화 조건과 사용자 언어
3. loading, busy, empty, error와 마지막 정상 상태 보존 방식
4. 결과 목록 또는 반복 행의 정렬·상호작용·접근성
5. 재사용 가능한 판단의 canonical design guide 반영
6. focused contract, 관련 browser smoke와 사용자 시각 확인

## 명시적 비범위

- 스마트 댓글의 수집·AI 생성·등록 정책 자체를 임의로 변경하는 작업
- 빠른 글 작성, 트렌드 포스팅, 글감 관리와 연속 발행 설정의 추가 재설계
- 실제 외부 댓글 등록, 유료 AI 호출 또는 production 데이터 변경을 포함한 검증
- release, version bump, tag, push 또는 배포

## 제안 설계와 단계

- 현재 markup·상태 관리·스타일과 canonical guide를 먼저 대조한다.
- 개선 후보를 사용자 위험과 시각적 영향 기준으로 아래의 작은 slice에 배치한다.
- 각 slice는 합의 후 구현하고 focused 자동 검증과 사용자 시각 확인을 분리한다.

### Slice 1. 최초 진입과 idle/loading 상태

- 아직 댓글 만들기를 실행하지 않은 `idle`에서는 다음 행동을 알려주는 안내 하나는 유지하되, `준비된 댓글`,
  `아직 만든 댓글이 없습니다`와 별도 안내를 겹쳐 반복하지 않는다. 글감 관리와 같은 공통 empty-state component의
  border, typography, 위치와 높이를 사용한다.
- 첫 요청 이후에는 같은 영역이 실제 결과 또는 정상 empty 안내로 전환된다.
- 설정 metadata loading rectangle은 코드 경로에는 있지만 현재 실행 화면에서 사용자에게 보이는 현상으로 재현되지
  않았다. 빠른 정상 응답에서는 그대로 두고, 실제 지연 환경에서 flicker가 확인될 때만 delayed indicator 기준으로
  다룬다. 설정 load 실패는 설정 form 가까이에서 실패와 재시도 방향을 제공하며 결과 영역을 빌려 쓰지 않는다.

### Slice 1-A. 중복 metadata와 form 안내

- disclosure summary의 `글쓰기 모델/Chat Model 사용`을 model role의 유일한 시각 출처로 사용한다. action group 아래의
  `현재: …` 문구는 제거하되 실행 button의 accessible description은 기존 summary를 참조해 AI role 식별 계약을 유지한다.
- 개발 환경 전용 checkbox도 동일한 semantic form label·caption token을 사용한다. 진단용이라는 기능 범위는
  production 노출 여부로 구분하며 임의 typography 예외를 만들지 않는다.
- 긴 guidance는 후보 수 option의 `권장`, `AI 사용량 높음`과 반복되는 비용 설명을 제거하고, 실제 결과 구조만 알리는
  `후보 글마다 세 가지 댓글 초안을 만듭니다.` 수준으로 줄이는 방향을 우선한다.

### Slice 2. 비동기 operation scope와 복구

- 설정 저장은 별도 saving state를 가져 중복 저장과 저장 중 실행을 막고, label·`aria-busy`·disabled를 같은 상태에서
  동기화한다.
- 전체 댓글 생성 중에는 요청 snapshot과 화면 설정이 달라지지 않도록 충돌하는 설정·저장·재생성 action을 잠근다.
  복사와 외부 글 열기처럼 결과를 변경하지 않는 action은 불필요하게 막지 않는다.
- 개별 재생성은 해당 card에 `aria-busy`를 제공하고 다른 생성 요청과 겹치지 않게 한다. 실패 시 기존 초안을 유지하고
  `만드는 중...`으로 고착된 button을 반드시 복원한다.

### Slice 3. progress·completion·result의 상태 소유권

- 여러 단계를 거치는 장기 생성에는 현재 progress surface를 유지한다.
- 정상 완료는 결과 heading과 건수 summary가 소유하므로 동일한 `댓글 준비 완료` surface를 중복하지 않는다.
  부분 성공·한도 대기·실패처럼 사용자의 주의나 조치가 필요한 상태만 독립 status surface에 남긴다.
- 새 요청이나 재생성이 실패해도 마지막 정상 댓글과 복사 가능 상태를 보존한다.

### Slice 4. surface와 정보 hierarchy

- settings container → results container → result card → draft surface로 이어지는 중첩을 줄인다. 결과 영역 자체는 heading과
  spacing으로 구분하고 실제 글 단위 card만 유지하는 방향을 우선 검토한다.
- `네이버 전용`은 중요한 scope metadata이므로 유지하되 primary action과 경쟁하는 강조 badge가 아니라 neutral caption
  수준으로 표현한다.
- 후보 수 option과 guidance의 중복은 Slice 1-A에서 먼저 정리하고, 여기서는 결과 이후의 card hierarchy만 다룬다.

### Slice 5. 결과 action과 narrow 접근성

- 각 글의 세 댓글 초안에서 tone·본문·복사 action이 같은 열과 폭을 사용하도록 정렬한다.
- `댓글 복사`, `이 글의 댓글 다시 만들기`, `네이버에서 댓글 쓰기`의 위계와 action 소유 범위를 명확히 하고,
  좁은 화면에서도 모든 action의 조작 크기와 자연스러운 줄바꿈을 보장한다.
- keyboard focus, external-link accessible name과 결과별 실패·재시도 위치를 focused/browser contract로 검증한다.

## 사용자와의 결정

- 2026-09-08: `codex/feature/design-system-main`을 parent로 스마트 댓글 전용 sub-feature branch를 시작한다.
- 2026-09-08: 구현 전에 기존 디자인 가이드와 이전 Blog Beta 개선 사항을 기준으로 개선 후보를 도출한다.
- 2026-09-08: 최초 안내는 제거하지 않고 글감 관리와 같은 공통 empty-state로 표현한다. 같은 사실을 반복하는 결과
  heading·summary는 최초 상태에서 숨기고, 실제 요청 이후에만 결과 구조로 전환한다.
- 2026-09-08: AI model role은 disclosure summary 한 곳에서만 시각적으로 보여주고 실행 action의 접근성 설명도
  그 summary를 재사용한다. 개발 전용 control도 공통 form typography를 따르며 긴 후보 안내는 결과 구조만 남긴다.
- 2026-09-08: 작은 copy/style 항목은 지나치게 잘게 나누지 않고 하나의 화면 정리 묶음으로 진행하며, 비동기 동작과
  결과 card 묶음이 자동 검증할 가치가 있는 경계에 도달하면 사용자에게 테스트 시점을 알린다.

## 진행 기록

- 2026-09-08: clean parent에서 sub-feature branch와 독립 개발 기록을 만들었다.
- 2026-09-08: current markup, `smart-comment.js`, feature styles와 canonical component guide를 대조했다. 코드에는
  최초 settings load status surface 경로가 있으나 실제 실행 중인 BlogGenius에서는 사용자에게 보이는 rectangle으로
  재현되지 않았다. 반면 실행 전부터 결과 heading·summary·empty card를 모두 노출해 idle 안내가 중복되는 것은
  실제 접근성 화면 상태에서 확인했다.
- 2026-09-08: 사용자 지적에 따라 코드상 가능한 순간 상태를 체감 UI 결함으로 단정했던 초기 진단을 교정했다.
  loading surface 제거는 현재 slice에서 제외하고, 첫 실제 결과 전 불필요한 결과 placeholder만 첫 후보로 좁혔다.
- 2026-09-08: 사용자는 실행 전 안내 자체는 유용하므로 유지하되 글감 관리의 공통 empty-state 스타일로 맞추고,
  결과 heading·summary와의 중복만 제거하는 방향을 제안했다. AI role의 disclosure summary와 action-row 문구 중복,
  진단 checkbox의 임의 font, 후보 수 option과 긴 guidance의 반복도 함께 개선 후보로 제시했다.
- 2026-09-08: 설정 저장에는 독립 saving lock이 없어 중복 요청이 가능하고, 개별 재생성 실패 시 button이 disabled
  `만드는 중...` 상태로 남는 복구 누락을 확인했다. 전체 생성 중 설정 변경도 허용되어 요청 snapshot과 화면 상태가
  달라질 수 있으므로 비동기 operation scope를 시각 polish보다 앞선 correctness slice로 분류했다.
- 2026-09-08: 장기 작업 progress는 독립 surface가 합당하지만 정상 완료 surface와 결과 summary는 같은 사실을
  반복한다. results outer surface 안에 글 card와 draft surface가 다시 중첩되는 구조도 simple-first/card nesting 기준에
  따라 별도 hierarchy slice로 분리했다.
- 2026-09-08: 첫 화면 정리 묶음을 구현했다. 초기 안내에 공통 `blog-next-empty-state`를 적용하고 최초 상태에서는
  결과 heading·summary를 숨겼다. 결과 요청 이후 renderer가 heading과 results/empty 상태를 명시적으로 활성화한다.
- 2026-09-08: 하단의 중복 `현재: model` 문구를 제거하고 실행 button이 disclosure summary를 설명으로 참조하게 했다.
  진단 checkbox는 label/caption semantic type token으로 교정했고, 후보 안내는 후보 글마다 세 어조를 하나씩 만든다는
  결과 정보만 남겼다.
- 2026-09-08: 공통 guide에 초기 action workflow의 단일 empty-state, 같은 설정의 단일 시각 출처와 접근성 재사용,
  개발·진단 control에도 동일한 form typography를 적용하는 기준을 추가했다.
- 2026-09-08: 비동기 operation scope를 보강했다. 설정 load·저장, 전체 생성과 개별 재생성은 하나의 충돌 범위로
  판단해 설정 control, 저장·전체 생성과 sibling 재생성 action을 함께 잠근다. 댓글 복사와 외부 글 열기는 결과를
  바꾸지 않으므로 계속 허용한다.
- 2026-09-08: 요청 전에 설정 snapshot을 확정하고 form과 action에 `aria-busy`를 동기화했다. 개별 재생성은 대상
  card만 busy로 표시하며 성공·실패 모두에서 button label과 disabled 상태를 복원해 `만드는 중...` 고착을 막는다.
- 2026-09-08: 사용자 제안에 따라 결과 card의 제목을 실제 `postUrl` 원문 link로 연결했다. 제목은 원문 읽기,
  `네이버에서 댓글 쓰기`는 `commentUrl` 기반 후속 작성 action으로 목적과 URL을 분리하고, 원문 URL이 없으면
  일반 제목을 유지한다. 새 창 accessible name과 hover·focus affordance를 함께 제공했다.
- 2026-09-08: 대표 제목을 원문 판단 link로 사용할 수 있는 조건과 card 안의 별도 실행 link와 목적을 구분하는 기준을
  canonical component guide에 추가했다.
- 2026-09-08: 사용자가 초기 안내, model 정보 정리와 제목 원문 link의 실제 동작을 확인했다. 정상 완료 status와
  결과 summary 통합, 결과 outer surface 축소는 현재 화면에서 명확한 문제로 확인되지 않아 simple-first 원칙에 따라
  이번 branch에서 추가 변경하지 않기로 했다.
- 2026-09-08: focused Blog Beta/Smart Comment contract 23개와 제목 link contract 3개가 통과했다. browser UI smoke도
  235 fixture requests로 통과했다.

## 검증 계획

- slice별 관련 UI/contract test
- reviewable slice 완료 시 관련 browser smoke
- sub-feature parent 병합 전 사용자 승인과 full unit suite

## 최종 결과

- 최초 스마트 댓글 안내가 글감 관리와 공통 empty-state 문법을 사용하며 중복 heading·summary를 노출하지 않는다.
- model role은 disclosure summary 한 곳에서 표시하고 실행 action도 같은 설명을 접근성 정보로 재사용한다.
- 진단 checkbox와 inline guidance가 공통 typography·간결성 기준을 따른다.
- 설정 저장·전체 생성·개별 재생성은 충돌 범위를 잠그고 실패 후 기존 결과와 action 상태를 복원한다.
- 결과 제목에서 네이버 원문을 확인하고 별도의 댓글 작성 action으로 다음 단계를 진행할 수 있다.
- parent 병합 전 full unit suite와 최종 기록 archive가 남아 있다.
