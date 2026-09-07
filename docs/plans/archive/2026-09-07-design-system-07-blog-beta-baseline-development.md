# 디자인 시스템 7단계 — Blog Beta 기준면 완성 개발 기록

## Branch

- Branch: `codex/feature/design-system-07-blog-beta-baseline`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-07
- Status: 완료 — parent 통합 승인 및 Full TC 통과

## 사용자 필요와 목표

Stage 5에서 정립한 Blog Beta panel anatomy와 Stage 6에서 검증한 빠른 글 작성의 component·상태 문법을
Blog Beta의 남은 화면과 상태에 적용한다. 새 디자인 방향이나 기능을 추가하는 대신 Blog Beta 전체를
다른 제품 surface로 확산할 수 있는 완성된 디자인 기준면으로 만든다.

## 범위

1. `빠른 글 작성`의 `원고 폴더`와 `원고 붙여넣기` mode
2. `트렌드 포스팅`, `글감 관리`, `스마트 댓글`, `연속 발행 설정`의 주요 화면과 상태
3. loading, empty, error, disabled, selected, hover, focus-visible과 좁은 화면 표현
4. 반복되는 결정의 공통 component/pattern 또는 semantic token 정리
5. 새로 확인한 반복 기준의 canonical 디자인 문서 반영
6. focused contract, Blog Beta browser smoke와 사용자 시각·상호작용 검토

## 명시적 비범위

- 기존 `블로그` surface 변경
- AI prompt, model role 또는 생성 결과 계약 변경
- publishing engine, 저장 형식, payload 또는 backend 동작 변경
- 새 provider나 제품 기능 추가
- Warm Editorial 또는 Quiet Sage Studio의 전면 재디자인
- 사용자용 style 선택·저장 UI
- Blog Beta 밖 제품 surface migration
- 완료 이력, 실행 중 취소 등 별도 backlog 제품 기능
- release, version bump, tag, push 또는 배포
- 브라우저가 소유한 native date/time picker 내부 UI 강제 styling

## 설계 방향

- 같은 모양을 복제하지 않고 같은 의미의 component, action과 상태에 같은 계약을 적용한다.
- 화면별 one-off CSS보다 semantic class, 공통 pattern CSS와 재사용 가능한 상태 helper를 우선한다.
- 사용자의 마지막 유효 입력과 비동기 결과를 실패 때문에 지우지 않는다.
- 상태 표현은 색상만으로 구분하지 않고 문구, native state와 접근성 속성을 함께 사용한다.
- 새 UI 표현 책임은 이미 경계에 가까운 orchestration module에 누적하지 않는다.
- inventory에서 큰 정보구조 또는 기능 재설계가 필요한 항목은 Stage 7에 억지로 포함하지 않고 후속 범위로 제안한다.

## Reviewable slices

### Slice 0. 상태·화면 inventory와 계약 확정

- 각 화면의 정상, loading, empty, error, disabled, selected, hover와 focus-visible 상태를 조사한다.
- action hierarchy, dependent field, 값 보존, desktop/narrow와 두 style 적용 상태를 기록한다.
- 기존 focused/browser coverage와 누락을 연결한다.

### Slice 1. 원고 폴더·원고 붙여넣기

- 입력 방식의 차이는 유지하고 `원고 입력/선택 → 검증·미리보기 → 발행 설정 → 포스팅 실행` 문법을 공유한다.
- 발행 대상, 카테고리, 공개 방식, 예약 일시, 이미지 처리와 실행 방식의 의미를 Stage 6 계약에 맞춘다.
- mode 전환 시 입력과 유효한 설정값을 보존한다.
- 붙여넣기 내용 지우기의 복구 가능성을 적용한다.

### Slice 2. 트렌드 포스팅

- 조회 조건 미완성, loading, empty, error와 결과 있음 상태를 구분한다.
- refresh, query와 결과 저장 action의 의미·busy·retry 상태를 정리한다.
- 결과 필터, 날짜 종속 field, category selection과 표 overflow를 검증한다.

### Slice 3. 글감 관리

- 발행 대기열과 보관 목록의 loading, empty, error 상태를 정리한다.
- refresh와 행별 action의 위계, busy 상태와 실패 시 마지막 정상 목록 보존을 검증한다.
- local tab keyboard focus와 좁은 화면의 제목·action overflow를 검증한다.

### Slice 4. 스마트 댓글·연속 발행 설정

- 스마트 댓글의 설정 저장, AI 실행, 결과 보존과 model role 표시를 점검한다.
- 연속 발행 enable 상태와 종속 field, 저장 상태, Development 전용 시험 action 위계를 점검한다.
- 두 form의 select inset, disclosure, focus-visible과 narrow layout을 공통 기준에 맞춘다.

### Slice 5. Blog Beta 통합 검증과 문서화

- 세 빠른 작성 mode와 다섯 top-level panel의 상태·keyboard·반응형 계약을 함께 검증한다.
- Warm Editorial을 기본 활성 style로 유지하고 Quiet Sage Studio에서 기능·DOM·상태 불변을 검증한다.
- 반복 가능한 새 판단을 canonical component guide에 반영하고 screen-specific 예외를 줄인다.

## 초기 UI gap inventory

이 inventory는 코드 변경 전 정적 조사 결과다. 실제 구현 범위는 각 slice에서 focused browser 상태를 재현해
확정하며, 기능 동작 변경이 필요한 항목은 제외한다.

| Surface | 확인된 현재 기준 | 우선 확인할 gap | 기존 검증 근거 | Slice |
| --- | --- | --- | --- | --- |
| 원고 폴더 | 폴더 선택, validation, preview, 발행 설정과 직접 실행을 제공한다. | 예약 일시가 hidden이고, select trailing inset·명시적 target grouping·provider 종속 headless 계약이 Stage 6과 다르다. source·preview·설정·action 순서와 좁은 화면도 확인한다. | `quick-manuscript-folder-row-contract`, `continuous-publishing-shell-contract` | 1 |
| 원고 붙여넣기 | Markdown 입력, 지우기, preview, 발행 설정과 직접 실행을 제공한다. | 발행 설정 markup이 폴더 mode와 중복되고 동일한 상태 gap이 있다. 내용 지우기 복구와 입력/설정 보존을 확인한다. | `continuous-publishing-shell-contract`, browser fixture 일부 | 1 |
| 트렌드 포스팅 | 최신 데이터 refresh, 조건 조회, 결과 filter와 글감 보관을 제공한다. | 조회 전 filter 활성 상태, loading/empty/error 구조, 저장 retry, category focus와 table narrow overflow를 하나의 상태 문법으로 검증해야 한다. | `continuous-publishing-shell-contract`, browser smoke 일부 | 2 |
| 글감 관리 | 대기열/보관 local tab, count, refresh와 동적 목록을 제공한다. | 목록 fetch 오류가 quick form status에 의존하고 목록 자체의 loading/error 구조가 약하다. refresh busy, 마지막 정상 목록 보존과 row action narrow layout을 확인한다. | `continuous-publishing-shell-contract`, panel anatomy contract | 3 |
| 스마트 댓글 | 전용 form, AI 세부 설정, 진행/실패와 결과 보존 계약이 있다. | select/disclosure 공통 문법, action hierarchy, model role·사용량 안내, candidate empty/error와 좁은 화면을 두 style에서 점검한다. | `blog-next-smart-comment-contract`, browser smoke 일부 | 4 |
| 연속 발행 설정 | enable, 허용 시간, 간격, 알림, Development 시험과 저장을 제공한다. | enable과 종속 field의 disabled 계약, dirty/loading/success/error 표현, 시험과 저장 action 위계, native time focus 예외를 확인한다. | `continuous-publishing-shell-contract`, automation tests | 4 |
| Blog Beta 공통 | 다섯 panel intro/local navigation anatomy와 top-level keyboard 계약이 있다. | 상태 component의 공통성, desktop/narrow overflow, 두 style 의미 불변과 screen-specific CSS 누적 여부를 통합 검증한다. | `blog-next-panel-anatomy-contract`, design style contract, browser smoke | 5 |

## 영향 경계와 현재 구조 위험

- `ui/partials/views/blog-next.html`은 빠른 작성, 트렌드, 글감 관리와 스마트 댓글 markup을 함께 소유한다.
- `ui/scripts/features/blog-next/quick-queue.js`는 785줄로 module boundary에 가깝다. 새 표현 상태 책임을 직접 추가하지 않는다.
- `ui/styles/features/publishing.css`와 `ui/styles/features/automation-settings.css`는 각각 800줄 안팎이다.
  Stage 7 공통 규칙은 기존 대형 stylesheet에 무조건 누적하지 않고 Blog Beta pattern 경계를 먼저 검토한다.
- 원고 두 mode는 유사한 발행 설정 markup을 각각 보유한다. 기능별 DOM hook을 보존하면서 공통 의미 계약을
  적용할 방법을 우선 검토하고, 단순 문자열 조립이나 field별 예외로 합치지 않는다.

## 검증 계획

- 각 slice 구현 중: 해당 Blog Beta focused contract와 구조 검사
- 각 slice 완료 시: 변경 상태에 대한 focused browser assertion 또는 기존 fixture 보강
- 전체 slice 완료 시: Blog Beta 주요 흐름 browser smoke
- 사용자 수동 확인: 세 mode 값 보존, async 상태, keyboard focus, 두 style와 좁은 화면
- Full unit suite: 사용자 UI 승인 후 별도 승인을 받고 실행
- commit과 parent merge: Full TC 통과 후 사용자가 명시적으로 요청할 때만 진행

## 완료 조건

- 세 빠른 작성 mode가 입력 방식은 달라도 동일한 발행 설정·상태·action 문법을 공유한다.
- 다섯 Blog Beta top-level panel의 주요 상태가 공통 디자인 원칙과 component pattern을 따른다.
- selected, hover, focus-visible, disabled, loading, empty와 error가 서로 혼동되지 않는다.
- desktop과 좁은 화면에 clipping, 비정상 overflow, 불필요한 높이 차이와 비정상 focus 순서가 없다.
- Warm Editorial이 기본 활성 style로 유지되고 Quiet Sage Studio에서도 기능·DOM·상태가 깨지지 않는다.
- 기존 저장·발행·대기열·mode 전환 동작과 유효한 마지막 상태가 보존된다.
- 새 판단이 일회성 수정으로 끝나지 않고 canonical 디자인 가이드에 반영된다.
- focused tests와 browser smoke가 통과하고 사용자가 최종 시각·탐색 흐름을 승인한다.
- 승인 후 Full TC가 통과해야만 parent 통합 후보가 된다.

## 사용자와 결정한 사항

- Stage 7은 한 sub-feature branch에서 진행하되 다섯 reviewable implementation slice와 선행 inventory로 나눈다.
- 새 디자인 방향이나 대규모 기능 재설계가 아니라 Stage 5·6에서 확립한 기준의 확산과 상태 완결에 집중한다.
- 사용자가 최종 시각·탐색 UI 검토를 담당한다.
- Full TC, commit과 parent merge는 각각 정해진 승인 관문을 따른다.

## 진행 기록

- 2026-09-07: 실제 parent branch, clean working tree와 최근 commit을 확인했다.
- 2026-09-07: 사용자가 Stage 7 목표, 범위, 5개 reviewable slice와 검증 순서를 승인했다.
- 2026-09-07: `codex/feature/design-system-main`에서 Stage 7 branch를 시작했다.
- 2026-09-07: 코드 변경 전에 정적 UI gap inventory와 현재 구조 위험을 기록했다.
- 2026-09-07: Slice 1에서 원고 폴더·붙여넣기를 `원고 입력/선택 → 검증·미리보기 → 발행 설정 → 포스팅 실행`
  구조로 정리했다. 두 mode는 결과에 영향을 주는 발행 설정 summary, 공통 select affordance, 예약 일시
  disabled/required 전환과 provider 종속 category·headless 상태를 공유한다. mode 전환 중 유효한 값은
  보존하며 붙여넣기 내용 지우기는 즉시 되돌릴 수 있다.
- 2026-09-07: 빠른 작성 세 mode에 완전한 tab 관계, roving `tabindex`, 좌우 방향키와 `Home`/`End`
  이동을 적용했다. 증가한 markup은 `quick-draft-modes.html` partial로 분리해 HTML 500줄 경계를 유지했다.
- 2026-09-07: Slice 2에서 트렌드 포스팅의 조회 전, loading, empty, filtered empty, error와 result 상태를
  분리했다. 조회 전 filter는 disabled이며 table busy와 refresh/query action 상태를 명시한다.
- 2026-09-07: Slice 3에서 글감 관리 목록이 자신의 loading/error 상태를 소유하게 했다. 최초 load 실패는
  목록 안에서 재시도를 안내하고, 갱신 실패는 마지막 정상 목록을 유지한 채 별도 status로 알린다. local tab의
  완전한 ARIA 관계와 keyboard 이동도 추가했다.
- 2026-09-07: 글감 관리의 UI 상태 책임을 `queue-ui.js`로 분리해 `quick-queue.js`를 781줄로 유지했다.
- 2026-09-07: Slice 4에서 스마트 댓글의 model role을 실행 action과 연결하고 설정 disclosure summary에
  현재 역할을 표시했다. 설정 load와 AI 실행 중 control·`aria-busy` 상태를 명시하고 기존 성공 결과 보존
  계약을 유지했다.
- 2026-09-07: 연속 발행 설정은 `연속 발행 사용`에 따라 시간·간격·알림 field를 disabled/enabled 처리하며
  값을 보존한다. 설정 load/save feedback과 장기적인 다음 실행 summary를 별도 status로 분리했다.
- 2026-09-07: 반복 확인된 async 상태 소유권, 최초 실패와 갱신 실패, idle/empty/filtered empty, 운영
  feedback과 summary 분리, AI 결과 보존 기준을 component guide에 승격했다.
- 2026-09-07: 완료된 Stage 5 panel anatomy와 Stage 6 대표 흐름 일감을 현행 backlog에서 제거했다.
- 2026-09-07: 사용자 UI 검토 결과 Stage 7을 한 번에 완료 처리하지 않고 `원고 폴더`부터 작은
  reviewable slice로 다시 나누기로 했다. 첫 보정은 글꼴에 의존해 깨져 보이던 폴더 지우기 문자와,
  외곽 preview·본문 section·본문 canvas·image figure가 중첩된 미리보기 계층으로 제한했다.
  지우기 표시는 접근 가능한 이름을 유지한 CSS icon으로 바꾸고, 미리보기는 제목·부가정보 아래 하나의
  읽기 surface를 두며 상세 image matching은 접힌 `이미지 확인`으로 분리했다.
- 2026-09-07: 원고 폴더의 source 미선택 상태에서는 입력 자체가 다음 행동을 충분히 설명하므로 별도 안내와
  빈 preview를 노출하지 않기로 했다. 폴더 선택 뒤에만 loading·결과·warning·error를 표시하고, 정상 결과의
  상시 성공 문구도 생략한다. 같은 원인의 누락 이미지 warning은 상단에서 건수와 영향만 한 번 요약하고
  누락 대상은 `이미지 확인` 상세 목록에서 식별하도록 역할을 분리했다. 이 판단은 async 상태의 공통 기준으로
  component guide에 반영했다.
- 2026-09-07: 원고 폴더 선택 영역에서 tab·section heading·field label·placeholder·button이 같은 행동을
  반복 설명하던 구조를 줄였다. picker가 결정한 폴더명은 편집 가능한 input 대신 선택 결과 summary로 표시하고,
  긴 이름은 말줄임과 전체 이름 title을 함께 제공한다. 지우기 action은 font나 CSS 선 조합에 의존하지 않는
  SVG icon으로 교체했으며, 선택 후에는 실행 동작을 명확히 하도록 button label을 `원고 폴더 변경`으로 바꾼다.
- 2026-09-07: 사용자 확인에서 SVG 지우기 icon 자체는 정상이나 absolute button의 `top: 50%`가 button
  시작점을 중앙에 놓아 아래로 밀리는 문제를 확인했다. 상하 inset과 auto margin으로 button box 자체를
  수직 중앙 정렬하고 내부 SVG도 flex 중앙 정렬하도록 교정했다.
- 2026-09-07: 원고 폴더 미리보기 header에서 선택 영역과 중복되는 긴 폴더명, 사용자가 해석하기 어려운
  `본문 N개`, 경고·상세 영역과 중복되는 `이미지 N/N개` metadata를 제거하고 실제 글 제목만 남겼다.
  제목 아래 metadata는 사용자의 다음 판단이나 행동에 필요한 경우에만 둔다는 기준을 component guide에 반영했다.
- 2026-09-07: 이미지 누락 warning의 `임시 저장될 수 있습니다`는 플랫폼과 이미지 처리 방식별 실제 결과를
  모호하게 일반화하므로 제거했다. 상단 status는 `이미지 N개를 확인해 주세요`로 영향 범위만 짧게 알리고,
  본문은 누락 위치를 `이미지 파일 없음`으로 표시하며, 접힌 `이미지 확인`에는 정상 매칭을 반복하지 않고
  누락 항목의 번호·제목·prompt만 표시한다. 누락이 없으면 진단 disclosure 자체를 숨긴다.
- 2026-09-07: 실제 결과를 닮은 미리보기는 유지하되 긴 본문과 세로 이미지 한 장이 이후 작업 영역을 과도하게
  밀어내지 않도록 folder preview의 읽기 높이와 이미지 최대 높이를 desktop·narrow viewport별로 제한했다.
  이미지는 자르지 않고 `contain`으로 전체 비율을 보존하며 별도 toolbar나 확대 기능은 추가하지 않았다.
- 2026-09-07: 사용자는 `원고 폴더`와 `원고 붙여넣기`를 source 진입 방식만 다른 하나의 원고 작업공간으로
  통합하고, folder 원고도 원본을 암묵적으로 덮어쓰지 않는 범위에서 수정하며, image block에 로컬 이미지를
  연결·교체해 preview와 실제 발행에 동일하게 사용하는 후속 방향을 제안했다. 이는 editor state, asset
  ownership, preview API와 publish payload를 함께 바꾸는 새 제품 기능이므로 Stage 7에는 포함하지 않는다.
  공통 작업공간 모듈, 이미지 우선순위와 단계적 구현안은 `docs/backlog.md`의 P1 일감으로 기록했다.
- 2026-09-07: 사용자 확인을 거친 Stage 7 기준면 변경을 `048e58a`에 커밋했다. 별도 요청이었던 개발 저널
  seed는 `abf82a6`으로 분리했다. 이후 적용한 folder preview 높이·이미지 최대 크기 조정은 최종 시각 확인과
  커밋이 남아 있다.
- 2026-09-07: Stage 7 종료 점검에서 folder mode에서 정립한 idle·preview 기준이 paste mode에는 아직
  적용되지 않은 것을 확인해 종료 판정을 철회했다. 첫 보정으로 paste source의 중복 section heading과
  idle validation을 제거하고, textarea에 내용이 있을 때만 `내용 지우기`를 노출하도록 했다. 이후 조각에서
  두 mode의 preview markup, 상태와 image diagnostics를 공통 계약으로 통합한다.
- 2026-09-07: folder와 paste의 source 이후 preview를 동일한 `blog-next-manuscript-preview` markup과
  semantic CSS로 통합했다. 두 mode 모두 제목·단일 본문 surface·누락 image disclosure를 사용하고,
  기술 metadata·중첩 section·정상 success 문구를 노출하지 않는다. 반복 image warning 요약, 누락 항목만
  보여주는 diagnostics, 본문과 이미지 최대 높이도 같은 rendering helper와 style contract를 사용한다.
- 2026-09-07: 공통 preview 적용 뒤에도 folder source에만 남아 있던 고정 하단 margin이 warning의 수직
  위치를 다르게 만들고, tertiary `ghost` button은 색상 token만 있고 기본 button box 계약이 없어 paste의
  `내용 지우기`가 브라우저 기본 형태로 표시되는 예외를 확인했다. folder 전용 간격을 제거하고 primary·
  secondary·tertiary가 크기·테두리·typography·interaction 기본값을 공유하도록 action primitive를 보강했다.
- 2026-09-07: 바로 생성과 원고 붙여넣기의 `내용 지우기`가 같은 복구 가능한 전체-form action인데도 서로 다른
  위치와 표현을 사용하던 예외를 정리했다. 두 action을 form 마지막 action group의 반대쪽에 둔 동일한 저강도
  danger action으로 통합하고 실제 지울 내용이 있을 때만 표시한다. 편집 mode의 `취소`는 danger 초기화와 다른
  중립 행동이므로 별도 button으로 분리했다. 위치·variant·노출을 각각 영향 범위·위험도·실행 가능성으로 정하는
  기준은 component guide에 승격했다.
- 2026-09-07: 사용자 확인 뒤 복구 가능한 지우기는 `내용 지우기`와 `되돌리기`가 떨어진 두 위치를 차지하기보다
  같은 action slot을 교대 사용하는 것이 직접 조작의 연속성에 맞다고 결정했다. 바로 생성과 원고 붙여넣기 모두
  지운 직후 같은 위치에 neutral `되돌리기`를 표시하고 focus를 이동하며, 별도 완료 문구는 반복 안내로 보아
  제거했다. 새 입력과 후속 상태 전이 시 복구 action을 폐기하는 기존 계약은 유지한다.
- 2026-09-07: 바로 생성의 완료 action이 빈 입력이나 지우기 직후에도 활성화되고, platform별 category가 선택과
  무관하게 편집되는 적용 gap을 확인했다. 글감 보관은 domain의 idea seed 조건, 대기열·즉시 발행은 idea seed와
  target·예약 조건을 각각 반영하도록 공통 availability를 두었다. platform 종속 category는 원고 mode와 같이
  표시를 유지한 채 disabled/enabled 처리하고 값을 보존한다. 사용자·AI·트렌드·복구 입력은 같은 동기화를 거친다.
- 2026-09-07: 사용자 반복 UI 확인과 최종 action·category 상태 보정을 마쳐 Stage 7의 `빠른 글 작성` 범위를
  완료로 판단했다. 세 source mode의 입력 이후 공통 원고 편집과 로컬 이미지 교체는 별도 feature로 유지하며,
  Stage 7 전체 완료 판정과 상위 branch 통합 전에는 나머지 Blog Beta panel 확인과 승인된 Full TC가 남아 있다.
- 2026-09-07: 트렌드 포스팅 첫 조각은 조회 준비 상태와 최초 meta load 실패에 한정했다. meta·category·기간과
  31일 제한이 모두 유효할 때만 조회 action을 활성화하고, loading 중 category·기간·조회 control을 잠근다.
  최초 실패 시 badge와 category placeholder가 더 이상 `확인 중`에 머물지 않고 새로고침 재시도를 안내한다.
  갱신 실패에 기존 meta가 있으면 선택값과 사용 가능한 기존 조건은 보존한다. 최신 날짜 badge는 성공 상태가
  아니라 정보 metadata이므로 success 색을 제거하고 neutral semantic token을 사용한다.
- 2026-09-07: parent 통합 전 Full TC에서 manuscript image disclosure의 focus 표시와 결과 상태 행이 각각
  정의되지 않은 `--ui-radius-xs`, `--ui-space-7`을 참조한 사실을 발견했다. 단일 사용처를 위해 새 토큰을
  추가하지 않고 기존 공통 값인 `--ui-radius-sm`, `--ui-space-8`로 교정했다.

## 구현 결과와 자동 검증

- Blog Beta 세 빠른 작성 mode가 공통 tab keyboard 문법과 발행 설정 상태 계약을 공유한다.
- 트렌드, 글감 관리, 스마트 댓글과 연속 발행 설정이 각 작업 영역 안에서 주요 비동기 상태를 표현한다.
- Warm Editorial과 Quiet Sage Studio는 동일 DOM·기능을 사용하고 style-specific selector를 추가하지 않았다.
- 최신 Stage 7 및 기존 Blog Beta focused contract·구조 검사: 52 passed, 0 failed
- browser UI smoke: passed (fixture-backed)
- parent 통합 전 Full unit suite: 1,512 passed, 0 failed, 1 skipped
- browser smoke 범위: 세 mode keyboard 이동, 발행 설정·예약 값 보존, provider 종속 state, 붙여넣기
  되돌리기, 트렌드 filter state, 글감 관리 local tab, 스마트 댓글 model role, 연속 발행 종속 field·저장
  feedback, 두 style focus와 390px narrow panel/mode overflow
- 실제 AI, 원격 데이터 변경과 실제 발행은 실행하지 않았다.

## 사용자 UI 확인 대기

- 원고 폴더·붙여넣기에서 입력/미리보기/접힌 발행 설정/실행의 위계와 화면 밀도
- 세 빠른 작성 mode의 방향키 이동, mode 전환 시 값 보존과 붙여넣기 지우기·되돌리기
- 트렌드 포스팅의 조회 전 filter 잠금, 결과 없음과 filter 결과 없음의 구분
- 글감 관리의 local tab, empty/loading/error 표현과 좁은 화면의 행 action 배치
- 스마트 댓글의 모델 역할 표시, disclosure와 최종 실행 action 위계
- 연속 발행을 끈 상태의 종속 field, 켠 뒤 편집·저장 feedback과 30초 시험 action 위계
- Warm Editorial과 Quiet Sage Studio의 desktop·좁은 화면 시각 균형

## 남은 결정과 위험

- native date/time picker 내부 focus 색과 popup UI는 브라우저 소유 known issue로 유지한다.
- 사용자 UI 승인 전에는 시각적 완료로 판정하지 않는다.
- Full unit suite는 사용자 UI 승인과 별도 실행 승인 뒤에만 수행한다.
- 현재 브랜치의 구현 범위는 빠른 글 작성 완료와 트렌드 포스팅의 조회 준비 상태까지로 확정했다. 나머지
  트렌드 포스팅 개선은 갱신된 parent에서 별도 sub-feature branch로 이어간다.
- parent merge와 완료 branch 삭제는 이 기록을 마감하는 `cmd` 절차에서 수행한다. push와 release는 수행하지 않는다.
- 원고 공통 editor와 로컬 이미지 연결은 Stage 7 완료 조건이 아니며 별도 feature scope와 검증 계획으로 시작한다.
