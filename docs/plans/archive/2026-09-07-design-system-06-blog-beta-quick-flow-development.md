# 디자인 시스템 6단계 — Blog Beta 빠른 글 작성 대표 흐름 개발 기록

## Branch

- Branch: `codex/feature/design-system-06-blog-beta-quick-flow`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 완료 — 사용자 UI 검토 및 Full TC 통과, parent 통합 준비

## 사용자 필요와 목표

가장 자주 쓰는 빠른 글 작성 화면이 길고 밋밋하며, 핵심 입력과 차별화된 AI 보조 기능의 위계가 약하다. 처음에는 쉽게 시작하고 필요할 때만 세부 설정을 열 수 있도록 대표 흐름을 재구성한다.

## 범위

1. 주제·키워드·제목과 경험·요청을 기본 경로로 유지
2. 참고 자료, 생성 방식과 발행 세부 설정을 progressive disclosure로 정리
3. 접힌 설정에도 발행 대상·공개 방식·이미지 처리·실행 방식의 현재 값을 요약
4. `글감 추천`, `키워드 탐색`, `AI 제목 추천`을 공통 `AI Assist` pattern으로 정의
5. 긴 form의 최대 폭, section rhythm과 하단 action 접근성 개선
6. `내용 지우기` 후 즉시 복구할 수 있는 되돌리기 검토 및 적용
7. desktop·좁은 화면과 keyboard 흐름 자동 검증 및 사용자 시각 검토

## 명시적 비범위

- AI prompt, 모델 역할 또는 생성 결과 계약 변경
- 저장 형식, 발행 대상과 실제 publishing 동작 변경
- 원고 폴더·원고 붙여넣기 기능 재설계
- 다른 Blog Beta top-level tab 또는 기존 `블로그` surface 개편
- style 선택 UI, release, push 또는 배포

## 설계 원칙

- 기본 화면에는 글을 시작하는 데 필요한 입력과 최종 행동만 우선 노출한다.
- 세부 설정은 숨기는 대신 접힌 상태에서 현재 실행 결과를 요약한다.
- AI Assist는 일반 secondary보다 발견 가능하되 primary 실행과 경쟁하지 않는다.
- 기존 입력값과 기본값, 저장·대기열·즉시 발행 semantics를 보존한다.
- 위험한 초기화는 복구 가능성을 함께 제공한다.

## 구현 단계

1. 현재 field와 action을 기본·선택·실행 설정으로 분류하고 의존 관계를 조사한다.
2. disclosure 구조, summary 문법과 AI Assist 상태를 사용자와 합의한다.
3. markup과 style을 기능 변경 없이 재구성한다.
4. 설정 summary와 내용 지우기 되돌리기 상호작용을 연결한다.
5. focused contract, browser smoke와 사용자 UI 검토를 수행한다.

## 완료 조건

- 기본 경로의 정보량이 줄고 핵심 입력과 primary action이 명확하다.
- 접힌 설정에서 현재 발행 결과를 오해하지 않는다.
- 세 AI Assist action이 하나의 의미 체계를 공유한다.
- 기존 저장·대기열·발행 기능과 입력값이 보존된다.
- 관련 focused tests와 browser smoke가 통과하고 사용자가 대표 화면을 승인한다.

## 검증 계획

- 구현 중: 빠른 글 작성 구조·상태·기존 동작 focused contract
- reviewable slice 완료 시: 관련 Blog Beta browser smoke
- full unit suite: parent merge 후보가 준비된 뒤 사용자에게 수행 시점과 범위를 설명하고 승인받아 실행
- 수동 확인: 첫 화면 밀도, disclosure 요약, AI Assist 식별성, keyboard·좁은 화면, 지우기·되돌리기

## 진행 기록

- 2026-09-07: Stage 5를 parent에 fast-forward 병합하고 완료 branch를 삭제했다.
- 2026-09-07: parent에서 Stage 6 branch를 시작하고 기존 합의와 backlog를 목표·범위·비범위로 구체화했다.
- 2026-09-07: 사용자 요청에 따라 확장성 검증을 위해 임시 활성화했던 Quiet Sage Studio 대신 주 style인 Warm Editorial을 UI root의 활성 style로 복원했다. Compatibility fallback과 Quiet Sage의 정식 registry·style pack은 유지한다.
- 2026-09-07: style foundation focused contract 17개와 browser UI smoke 225 fixture request를 통과했다. 브라우저 검사는 Warm Editorial 초기 렌더링, Quiet Sage 전환과 입력·DOM·focus 상태 보존을 확인한다.
- 2026-09-07: 기존 form의 DOM id 기반 저장·발행 의존성을 확인하고 주제·키워드·제목·참고 지시를 기본 경로로 유지했다. 참고 URL·외부 참고·글쓰기 전략·이미지 처리는 `참고·글 구성`, 대상·카테고리·공개 방식·예약·실행 방식은 `발행 설정` disclosure로 이동했다.
- 2026-09-07: 두 disclosure의 접힌 summary가 기존 기본값과 사용자 변경을 즉시 반영하도록 연결했다. 접힘은 값이나 payload를 변경하지 않으며 기존 편집·저장·대기열·바로 발행 id와 semantics를 유지한다.
- 2026-09-07: 세 보조 action을 primary soft surface와 `AI` mark를 공유하는 `AI Assist` pattern으로 통일하고 최종 primary action과 filled hierarchy를 분리했다.
- 2026-09-07: `내용 지우기` 직전의 작성 field와 trend context를 일시 snapshot으로 보존하고 inline `되돌리기`로 복구하도록 구현했다. 새 입력이나 후속 상태 전이에서는 snapshot을 폐기한다.
- 2026-09-07: 증가한 markup이 구조 경계를 넘지 않도록 publish status와 editor modal을 기존 composition pattern의 하위 partial로 분리했다.
- 2026-09-07: quick-flow·기존 publishing·style·HTML/CSS 구조 focused contract 47개와 browser UI smoke 225 fixture request를 통과했다. browser 검사는 기본 접힘, summary 변경, 두 style focus, 내용 지우기와 되돌리기를 포함한다.
- 2026-09-07: 1차 사용자 검토에서 세 action의 반복 `AI` pill이 과도하고, 발행 대상 간격이 좁으며 `참고·지시사항`이 내부 용어처럼 느껴진다는 feedback을 확인했다. AI Assist는 accessible label의 AI 의미는 유지하면서 가벼운 sparkle mark로 바꾸고, 대상 간격을 확대하며 label을 `담고 싶은 경험·방향`으로 교정했다.
- 2026-09-07: native select 화살표와 disclosure 화살표의 우측 여백이 달라 같은 설정 영역의 기준선이 흔들리는 문제를 확인했다. 이번 단계에서는 `글쓰기 전략`과 `이미지 처리`만 공통 trailing inset의 자체 화살표로 교정하고, 일관성 기준은 component guide에 기록했다. 다른 화면 적용은 각 후속 phase 범위로 남겼다.
- 2026-09-07: 사용자와 surface fill은 장식이 아니라 hierarchy·grouping·state·interaction 의미를 가져야 하며, 시각적 예외에는 설명 가능한 이유가 필요하다는 원칙을 합의했다. disclosure의 hover/open fill은 상태 표현으로 유지하고, 단독 boolean row의 상시 muted fill은 제거했다. 기존 도움말의 고정 slate 색을 현재 style token으로 교체하고 focus·touch 노출, accessible 연결과 `Escape` 닫기를 추가했다. 적용 범위는 이번 대표 흐름으로 제한하고 기준만 component guide에 승격했다.
- 2026-09-07: 같은 form의 `포스팅 옵션` select가 trailing inset 적용에서 누락되고, 왼쪽 help tooltip이 disclosure 경계에 잘리며, 예약 발행 종속 field의 `hidden`이 flex rule에 덮이는 문제를 확인했다. 동일 density select의 전면 적용, 경계 인접 tooltip의 start/end placement, 종속 field의 hidden+disabled+required 상태 계약을 guide에 보강하고 현재 흐름에 적용했다. 예약 일시 값은 mode 전환 중 보존한다.
- 2026-09-07: `포스팅 옵션`에만 start placement modifier를 붙인 1차 보정이 `글쓰기 전략`의 동일한 clipping을 해결하지 못했다. field별 hard-coding을 제거하고 tooltip을 열 때 disclosure·viewport 경계를 측정해 center/start/end를 선택하는 공통 collision-aware placement로 교정했으며, guide에도 layout 기반 자동 선택 원칙을 명시했다.
- 2026-09-07: collision-aware placement 적용 직후에도 기존 transform transition이 중앙 좌표에서 시작해 잠시 경계를 넘는 현상을 browser 검사에서 확인했다. 위치는 즉시 확정하고 opacity만 전환하도록 교정해 노출 과정에서도 clipping이 없게 했다.
- 2026-09-07: 사용자는 인접한 `포스팅 옵션`으로 활성화되는 `예약 일시`는 숨김보다 disabled 노출이 관계 이해와 발견 가능성에 낫다고 판단했다. guide에 disabled/hidden 선택 기준을 명문화하고, 예약 일시는 항상 보이되 비예약 상태에서 disabled와 활성화 조건 문구를 제공하며 예약 발행에서 enabled+required로 전환하도록 교정했다. 입력값 보존은 유지한다.
- 2026-09-07: disabled 상태와 인접 control만으로 예약 일시의 의존 관계가 충분한데 긴 inline 안내가 혼자 예외처럼 보인다는 feedback을 반영했다. inline metadata·항상 보이는 hint·tooltip·시각적 생략의 선택 기준을 guide에 추가하고, 비예약 상태의 안내는 visually hidden description으로 전환했다. 예약 발행일 때만 짧은 `(필수)`를 표시한다.
- 2026-09-07: `보이지 않게 실행`은 네이버에만 유효하므로 워드프레스 단독 선택에서 활성화된 상태가 provider 의미와 어긋나는 작은 예외를 확인했다. provider 종속 control과 예외 판단 기준을 guide에 추가하고, 네이버 미선택 시 checkbox를 disabled 처리하되 checked 선호는 보존했다. summary에서는 무관한 실행 방식을 제외하고, 직접·선택 실행 runner payload도 대상에 네이버가 있을 때만 headless를 적용하도록 맞췄다.
- 2026-09-07: 최종 구조 검사에서 `quick-queue.js`가 800줄 module boundary를 넘은 것을 확인했다. 이번 단계에서 추가한 summary·종속 field·tooltip placement 책임을 `quick-flow-ui.js`로 분리하고 composition manifest와 구조 계약에 등록해 기능·queue orchestration과 표현 상태의 경계를 복구했다.

## 1차 사용자 확인 항목

- 핵심 입력 네 개와 두 접힌 설정만 보이는 첫 화면의 정보 밀도
- AI Assist 세 action의 발견 가능성과 `바로 포스팅`과의 위계
- `참고·글 구성`, `발행 설정` summary 문구와 펼친 내부 배치
- 내용 지우기 후 되돌리기의 위치와 이해 가능성
- 좁은 화면에서 summary와 action이 자연스럽게 쌓이는지 여부

## 최종 결과와 검증

- 사용자는 대표 흐름의 progressive disclosure, AI Assist, 선택 control, 도움말, 예약 일시 및 provider 종속 상태가 의도대로 동작함을 직접 확인했다.
- focused contract와 구조 검사 53개가 통과했다.
- browser UI smoke가 223 fixture request를 통과했다. 핵심 입력·설정 summary·도움말 충돌 배치·예약 일시 상태·네이버 종속 headless·지우기 복구를 포함한다.
- 사용자 승인 후 Full TC를 수행해 1,498 passed, 0 failed, 1 skipped로 통과했다.
- `quick-queue.js`는 표현 상태 책임 분리 후 785줄로 800줄 module boundary를 충족한다.
- 다른 빠른 작성 mode와 Blog Beta top-level panel에 대한 패턴 확산은 각각의 후속 phase에서 수행한다.
