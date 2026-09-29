# 원고 분량 및 키워드 카운터 개발 기록

- Branch: `codex/feat/manuscript-content-counts`
- Start date: 2026-09-29
- Base/parent branch: `dev`
- Status: 구현 진행 중

## 사용자 필요와 목표

블로그 원고를 작성하면서 제목 글자 수, 본문 글자 수, 어절 수를 확인하고, 설정된 키워드가 본문에 몇 번 등장하는지
빠르게 검수하고 싶다. 본문 카운트에는 이미지 생성 prompt나 image-block 내부 직렬화 표식을 포함하지 않는다.

## 범위

- Blog Beta 원고 편집 영역에서 제목 글자 수, 본문 글자 수, 공백 기준 어절 수를 실시간으로 표시한다.
- 작성 흐름에 키워드가 있으면 본문에서 키워드별 출현 횟수를 센다. 후보 추출에 유료 AI 호출을 사용하지 않는다.
- 카운터 요약은 `[블록, Markdown, 보기]` 전환 왼쪽에 배치하고, 키워드별 상세는 길이에 따라 접근 가능한 보조 tooltip/popover에 표시한다.
- 툴바 폭을 줄이되 기능을 제거하지 않는다. 연관 서식을 묶고, 되돌리기/다시 실행 및 이미지 추가 등 인지도가 높은 동작을 compact/icon action으로 표현한다.
- 관련 UI contract/browser regression을 보완한다.

## 비범위

- 외부 SEO 점수, 키워드 밀도 권장치 또는 경고 판정
- AI 기반 제목 키워드 추출, 형태소 분석 라이브러리 도입
- 발행 payload, prompt 또는 원고 저장 schema 변경
- 기존 `블로그` surface 수정

## 설계 결정과 확인할 사항

- 분량 정보는 제목과 본문을 구분하고, 본문은 실제 작성 텍스트만 센다. 이미지 block의 title/prompt 및 내부 marker는 제외한다.
- 한국어 단어 수는 형태소 분석 단어 수가 아니라 공백 기준 `어절` 수로 명확하게 이름 붙인다.
- 키워드 횟수는 현재 원고 흐름에서 제공되는 주제/목표 키워드가 있을 때만 표시한다. 붙여넣기·폴더 원고처럼 키워드가 없을 때 제목에서 임의 추출하지 않는다.
- 키워드 정규화, 복합 키워드, 영어 대소문자, 겹치는 키워드 계산 규칙을 구현 전에 기존 데이터 계약과 대조해 확정한다.
- Tooltip은 hover뿐 아니라 keyboard focus와 click/tap에서도 열 수 있어야 한다.
- 툴바는 사용자 확인 방향대로 라벨을 전부 없애지 않는다. 서식·목록 그룹을 합치고 친숙한 작업만 아이콘화한다.

## 진행 및 검증

- 시작 기준: `dev` (`d65bb5d9`), 작업 트리 깨끗함.
- 구현: Blog Beta의 AI, 폴더, 붙여넣기 편집 툴바 왼쪽에 제목 글자 수·본문 글자 수·어절 수를 표시하고, AI 작성 화면에서 기존 키워드 입력값별 본문 출현 횟수를 hover/focus/click 도움말로 제공한다.
- 본문 카운트는 Markdown 제목과 문법 기호 및 `[[IMAGE...]]` 전체 블록을 제외한다. 이미지 title/prompt는 본문 텍스트로 세지 않는다.
- 툴바 동작을 제거하지 않고 본문/소제목/목록/인용/이미지/undo/redo를 compact glyph 버튼, title, 접근성 이름으로 줄였다. 굵게/기울임은 익숙한 B/I를 유지했다.
- 키워드는 기존 AI 글감 키워드 입력값만 사용한다. AI 추출이나 키워드 없는 원고의 제목 기반 추정은 하지 않는다.
- 후속 UX 반영: 툴바를 왼쪽, 통계를 가운데, `[블록, Markdown, 보기]`를 오른쪽에 배치했다. 모든 도구 아이콘은 `aria-label`과 동일한 스타일의 hover/focus-visible 툴팁을 갖는다.
- 도구 클릭 시 `mousedown.preventDefault()`가 ProseMirror selection을 보존하고 command 실행 시 editor에 focus를 되돌린다. 편집 조작 후 바로 이어서 입력할 수 있도록 의도한 편집기 동작이다.

## 남은 작업

- 키워드는 comma/newline 분리, case-insensitive 비교, phrase의 겹치지 않는 단순 문자열 출현 횟수로 계산한다. 형태소 분석이나 의미 기반 매칭은 하지 않는다.
- 네이티브 `details/summary`를 사용해 hover/focus와 click/tap 모두 키워드 popover를 열 수 있게 했다.
- 툴바는 모든 명령을 유지하면서 주요 편집 명령을 아이콘화하고, B/I 표기는 유지했다.
- 집중 검증: `node --test scripts/manuscript-content-counts-contract.test.js scripts/manuscript-image-workspace-contract.test.js scripts/continuous-publishing-shell-contract.test.js` — 23개 통과.
- 최초 `npm run test:ui-browser`는 Blog Beta 흐름 뒤 실행되는 레거시 Blog/Shopping 전용 검사에서 기대 OAuth 요청이 없어 실패했다. 사용자 결정에 따라 해당 레거시 검사 단계와 전용 OAuth fixture 응답을 smoke 경로에서 제거했다.
- 제거 뒤 최종 브라우저 검증에서는 의도적으로 차단된 외부 폰트/위젯 요청이 console error로 잡혔다. smoke가 이미 외부 요청을 의도적으로 차단하므로 해당 `ERR_BLOCKED_BY_CLIENT`만 known noise로 제외했다.
- 최종 `npm run test:ui-browser` 통과: fixture 요청 486건, 외부 요청 4건 차단. Blog Beta 및 공용 smoke 구간은 유지.
- 집중 contract 23개와 JS syntax, `git diff --check` 통과.
- 수동 확인: 통계 숫자 업데이트, hover/focus/click 키워드 popover, 좁은 화면에서 툴바 줄바꿈, 심볼 버튼의 이해도/가독성.
