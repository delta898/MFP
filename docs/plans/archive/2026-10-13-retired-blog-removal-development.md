# 이전 Blog 화면 제거 개발 기록

- Branch: `codex/feat/remove-legacy-blog`
- Start date: 2026-10-13
- Base/parent branch: `codex/fbr/retired-surface-removal`
- Status: parent 병합 완료 (`cc0aaa76`); 하위 브랜치 삭제

## 사용자 필요와 목표

Production에서 숨겨진 이전 Blog 화면과 더 이상 사용하지 않는 전용 코드를 제거한다. Blog Beta의 글쓰기, 발행, 관리, 자동화 및 공유 기능은 그대로 유지한다.

## 범위

- 이전 Blog 화면과 전용 navigation/lifecycle/controller/style 참조를 조사하고 확인된 전용 요소 제거
- 구 Blog 화면에 종속된 예약 트렌드/RSS 수집과 자동 발행 스케줄 중단
- Blog Beta와 공유하는 공용 발행/원고 흐름과 provider/API를 보존
- 이전 화면 참조를 전제로 한 구조 계약과 browser fixture 갱신
- 삭제 후보의 호출자와 데이터 흐름을 확인하고 결과를 이 기록에 반영

## 비범위

- Blog Beta의 UI/기능 재설계
- Blog Beta에 숨겨진 글감 폴더·원고 붙여넣기 입력 제거 (별도 단계)
- 네이버/WordPress 발행 capability, 공유 서비스, 지속 데이터/API 계약의 무관한 정리
- SNS 자동 RSS/Buffer 처리 및 Blog Beta 연속 발행 스케줄 중단
- parent FBR의 `dev` 병합, push, release

## 조사 및 설계

다음 영역을 확인한 뒤 전용 화면에만 속하는지 판단한다.

1. `ui/partials/views/blog.html` 및 `ui/index.html` composition, nav alias/deep-link
2. `blog.js`와 관련 controllers의 다른 consumer 여부
3. 구 Blog가 호출하는 `src/ui-api` route/service와 Beta의 호출 관계
4. `dashboard.css` 이동 후 남은 legacy Blog 스타일과 shared CSS/utility 경계
5. 구조 계약, navigation contract, browser smoke의 legacy Blog 가정
6. 구 Blog 예약 작업과 SNS/Blog Beta/수동 실행 경로의 런타임 경계

확인된 경계:

- `blog-topics.js`와 `trend-table.js`는 구 Blog 표 화면 외에도 Shopping의 편집/표 상태에서 공유한다. 이 모듈은 유지한다.
- `quick-discovery.js`와 키워드 모달은 Blog Beta가 사용하므로 유지한다.
- Blog Beta 스마트 댓글은 별도 controller를 가지지만, 구 화면과 같은 댓글 API를 호출한다. API/service는 유지하고 구 화면 controller만 제거한다.
- 구 Blog의 예약 트렌드/RSS 수집과 자동 포스팅은 설정 저장값이 켜져 있어도 더 이상 스케줄링하지 않는다. 저장된 설정값 자체와 수동 API/capability 호출은 유지한다.
- SNS scheduler와 Blog Beta 연속 발행 scheduler는 서로 다른 runtime 경로이며 계속 동작한다.
- 원고 폴더/붙여넣기는 구 Blog partial에도 있었지만, Blog Beta가 자체 partial/controller를 보유하고 별도 계약 테스트가 이를 확인한다. Beta 입력 모드는 이 단계에서 유지한다.

## 진행 기록

- 2026-10-13: 사용자는 이전 Dashboard 제거 결과를 parent FBR에 병합하고, 각 후속 항목도 하위 브랜치에서 작업한 뒤 parent에 합치는 순서를 정했다.
- 2026-10-13: 이전 Dashboard 제거를 parent에 fast-forward 병합했다. 이 브랜치는 최신 parent 커밋에서 시작했다.
- 2026-10-13: 코드 변경 전에 이 기록을 생성했다. 현재는 이전 Blog 화면의 의존성을 조사 중이다.
- 2026-10-13: 사용자는 구 Blog 예약 자동화도 중단하기로 했다. 저장된 설정값은 파괴적으로 지우지 않고 예약 실행에서 무시하며, 수동 실행 API/capability, SNS 자동 처리, Blog Beta 연속 발행은 유지한다.
- 2026-10-13: 공유 경계 조사에서 `blog-topics.js`가 Shopping 편집 기능에도 쓰이고, 구 Blog 스마트 댓글과 Blog Beta가 같은 API를 호출하는 것을 확인했다. 이 공유 모듈/API는 보존하고 구 화면 전용 연결부만 제거한다.
- 2026-10-13: Blog Beta의 원고 폴더 모드는 독립 구현이며 기존 Blog partial을 참조하지 않는 것을 확인했다. Beta 폴더 계약 테스트를 계속 유지했다.

## 결과 및 검증

- 결과: 이전 Blog view/nav 및 그 전용 tab partial과 trend collection/posting, Naver comment draft, batch modules를 제거했다. 구 Blog의 화면 진입/lifecycle 호출과 구 화면 전용 CSS도 걷어냈다.
- 결과: 구 Blog 예약 자동화 scheduler는 중지했다. 기존 설정값은 보존하고 수동 실행 API/capability, SNS 자동 처리, Blog Beta 연속 포스팅은 유지했다.
- 자동 검증: 집중 계약 및 구조 테스트 39건 통과, 2건은 후속 Settings 단계 대상으로 skip. UI 브라우저 스모크 통과(493 fixture 요청, page errors 0). 자동화 런타임 계약은 구 Blog schedules stopped / SNS schedule retained를 확인했다.
- 통합: `codex/feat/remove-legacy-blog`를 `codex/fbr/retired-surface-removal`에 fast-forward 병합했고, feature 브랜치를 삭제했다.
- 수동 확인: 사용자가 Blog Beta를 실제 앱에서 열어 작성·발행·큐·자동화 설정 및 원고 폴더/붙여넣기를 확인한다.
- 남은 위험: `legacy-actions-controllers.js`와 `blog-topics.js`/`trend-table.js`에는 Settings 단계 또는 Shopping과 공유되는 동작이 섞여 있어 파일 전체를 제거하지 않았다. 화면 전용 listener의 추가 분리는 해당 공유 경계를 기준으로 후속 정리한다.
