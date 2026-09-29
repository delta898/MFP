# 원고 이미지 블록 UI 고도화 개발 기록

- Branch: `codex/feat/manuscript-image-block-ui-polish`
- Start date: 2026-09-29
- Base/parent branch: `codex/manuscript-image-workflow`
- Status: 2차 시각 피드백 반영, 사용자 시각 검토 대기
- Parent feature: [원고 이미지 작업 흐름 개선](2026-09-29-manuscript-image-workflow-development.md)

## 사용자 필요와 목표

이미지 생성·선택·편집 기능은 연결되어 있지만 이미지 블록의 정보와 조작 흐름이 아직 시각적으로 정돈되지 않았다.
블로거가 title/prompt를 읽고 편집한 뒤 미리보기와 다음 작업을 자연스럽게 찾을 수 있도록 Blog Beta 블록 UI를
고도화한다.

## 범위

- 상단의 블록 이동·삭제 제어, 이미지 미리보기와 title/prompt 입력, 하단 작업 영역의 기존 배치를 유지한다.
- 정보 위계, 간격과 정렬, 비어 있음/준비됨/생성 중/오류 상태, 버튼 우선순위와 좁은 화면 대응을 다듬는다.
- 기존 Blog Beta (`view-blog-next`) 원고 이미지 블록에만 적용한다.
- UI 변경에 필요한 계약/브라우저 회귀 검증을 보완한다.

## 비범위

- 이미지 생성·title/prompt 생성 API, 데이터 모델, publishing 동작 변경
- 새 조작 기능, 새 AI provider/model selector 또는 과금 흐름
- 기존 `블로그` surface 및 다른 콘텐츠 UI 개편
- 별도의 범용 block editor 동작 추가

## 설계 방향과 trade-off

- 사용자가 검토한 화면 구성을 기준으로 이미지 미리보기와 텍스트 편집을 한 눈에 비교하고, 작업 버튼은 그 아래에
  둔다. 구조 제어는 블록 헤더에 남겨 콘텐츠 작업과 분리한다.
- 새 라벨이나 도움말을 늘리기보다 기존 UI 구성요소와 디자인 토큰을 사용해 우선순위와 밀도를 개선한다.
- 상태 표현은 결과 보존 및 중복 실행 방지 계약을 해치지 않아야 하며, AI 생성 흐름 자체는 이번 단계에서 바꾸지 않는다.

## 구현 단계

1. 현재 Blog Beta 이미지 블록 template/CSS와 사용자 제공 화면을 기준선으로 기록한다.
2. 가장 큰 위계·정렬·반응형 문제를 소수의 변경으로 개선한다.
3. 관련 UI contract를 실행하고 browser smoke에서 기존 이미지 조작 흐름을 확인한다.
4. 자동 검증을 넘기는 시각적 수용은 사용자 hands-on 확인으로 남긴다.

## 진행 및 검증

- 조사 결과 이미지 블록 전용 node view는 `ui/scripts/features/blog-next/manuscript-editor-entry.js`에 있고, 현재 구조는
  헤더 제어 → 좌우 미디어/필드 → 프롬프트 지시 입력과 작업 버튼이다. 스타일은
  `ui/styles/features/continuous-publishing-drafts.css`에서 관리한다.
- dotted/unfinished outer treatment를 테마 card surface로 정리하고 헤더 구분선, 더 균형 잡힌 미디어/필드 비율,
  통일된 필드 간격과 하단 action separation을 추가했다. Preview는 4:3 프레임에 맞추고 좁은 폭에서는 block의
  실제 inline-size로 좌우 레이아웃을 세로로 전환하도록 container query를 사용한다.
- 사용자 화면 리뷰 후 preview/text 비율을 1.2:0.8로 바꾸고, fields를 미디어 높이에 맞춰 prompt textarea의 하단
  경계를 정렬했다. 이미지 stage는 theme surface 색과 독립된 중립 배경 및 고정 대비 테두리를 사용한다. 이동 버튼은
  화살표 glyph만 보이고 title/aria-label은 유지한다. 추가 요청 라벨을 작은 `추가 요청 · 선택` 한 줄로 바꾸고
  입력/생성 버튼을 같은 높이와 중앙 정렬로 맞췄다.
- 후속 시각 검토에서 옅은 stage 배경은 어두운 테마에서 여전히 튀고, outline형 프롬프트 버튼도 입력과 높이를 맞춘 탓에
  크기감이 그대로라는 피드백을 받았다. stage를 고정 웜 중간톤 (`#e5e2d8`, 경계 `#aaa89b`)으로 낮추고,
  `프롬프트 만들기`를 테두리 없는 `ui-text-action compact`로 바꾸되 입력과 같은 높이/수직 중앙 정렬은 유지했다.
- 세 테마를 비교한 후 고정색 자체가 맞지 않을 수 있다는 사용자 판단에 동의해, 빈 미리보기 stage를 테마 표면색/경계색으로
  되돌리고 낮은 대비의 SVG 물결선 3개와 선형 이미지 아이콘을 배치했다. 실제 이미지가 있으면 기존 render 경로가 placeholder
  전체를 이미지로 교체하므로 장식은 노출되지 않는다. browser contract는 테마 토큰 사용 및 아이콘/파형 수를 검증한다.
- 후속 검증: focused UI/style/slash contracts 41/41 통과. browser smoke에서 테마 토큰 색, 아이콘, 물결선, 레이아웃 assertion은
  통과했고 이후 legacy slash suggestion 대기 구간 (`scripts/test-ui-browser-smoke.js:4678`) timeout으로 종료했다.
- Node view source 변경 뒤 `npm run build:manuscript-editor`를 실행해 `ui/scripts/vendor/manuscript-editor.js`를
  갱신했다 (473.33 KB; gzip 150.02 KB).
- 빌드 전 browser smoke에서 move control이 기존 텍스트를 노출해 실패했다. UI가 node view source 대신 vendor bundle을
  불러오는 경계를 확인하고 공식 build를 수행했으며, 재검증에서 화살표 전용 표시와 나머지 visual assertions가 통과했다.
- Blog Beta baseline/style structure/density focused tests 41/41 통과, browser smoke에서는 사용자 이미지 블록의
  데스크톱/480px compact layout, 이미지 폭 우세, prompt/media 하단 정렬, 추가 요청 한 줄/동일 높이·중앙, stage 색의
  computed assertions를 추가해 통과했다. 전체 focused UI/style/slash contracts 41/41 통과. 전체 smoke는 새 assertions를
  지난 뒤 기존 slash suggestion test에서 timeout (`scripts/test-ui-browser-smoke.js:4663`)으로 종료했다.
- AI image generation smoke 동작은 fixture 서버를 사용한다. Playwright 외부 네트워크 차단은 headless/headed에
  공통 적용되어 실제 모델 호출/과금과 시각 확인 테스트를 분리한다.

## 남은 위험

- 실제 글꼴/테마 조합과 이미지 asset별 화면 대비, 시각 품질은 사용자의 hands-on review가 필요하다.
- browser smoke는 현행 legacy slash-command 시나리오 timeout이 남아 있어 이후 slice 검증에서 다시 확인해야 한다.
