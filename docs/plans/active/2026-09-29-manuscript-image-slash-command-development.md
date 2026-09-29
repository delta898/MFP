# 원고 이미지 `/image` Slash Command 개발 기록

- Branch: `codex/feat/manuscript-image-slash-command`
- Start date: 2026-09-29
- Base/parent branch: `codex/manuscript-image-workflow`
- Status: 구현 완료, 최종 브라우저 재검증·사용자 확인 대기

## 사용자 필요와 목표

블로그 원고를 작성하는 흐름을 벗어나 상단 도구막대로 이동하지 않고, 원하는 본문 위치에서 `/image`를 입력해
BlogGenius의 기존 이미지 블록을 빠르게 추가한다.

## 범위

- 바로 생성·원고 폴더·원고 붙여넣기가 공유하는 Tiptap 블록 편집기에 `/image` slash command 추가
- `/` 입력 시 이미지 블록 항목을 표시하고 query로 필터링
- 방향키·Enter·Escape와 pointer 선택 지원
- 선택 시 slash query 범위를 제거하고 기존 `manuscriptImage`를 현재 위치에 삽입
- 기존 stable `blockId`, 빈 title·prompt, 사용 가능한 `sourceKey` 할당과 Markdown 직렬화 계약 재사용
- 기존 상단 `이미지 추가` 버튼과 command 동작 유지

## 비범위

- 이미지 title·prompt AI 생성
- slash command 선택과 동시에 이미지 생성 실행
- `/image` 이외의 block/format command
- 공통 블록 drag handle, 이동·삭제·복제 UX
- Markdown 원문 편집 textarea의 slash command
- 기존 이미지 block NodeView의 action 재설계

## 제안 설계

- Tiptap의 editor extension/plugin 경계에 image 전용 slash suggestion을 둔다.
- command item 정의와 실제 이미지 삽입 함수를 분리해 toolbar와 slash가 동일한 insertion 경로를 사용한다.
- 일반 URL이나 문장 중 `/`에는 열리지 않도록 빈 문단 또는 문단 시작의 query로 범위를 제한한다.
- 선택하면 입력한 slash text를 삭제한 같은 위치에 image node를 삽입하고, 이후 원고 작성을 계속할 수 있는 cursor 경계를 보장한다.
- menu는 앱의 기존 typography·surface·focus 스타일을 따르고 listbox/option semantics와 keyboard focus를 제공한다.

## 검증 계획

- slash trigger/query/filter/keyboard/pointer/escape 동작 focused test
- 삽입 위치, 중복되지 않는 sourceKey·blockId, Markdown 왕복과 undo/redo 계약 확인
- 기존 toolbar image command 회귀 확인
- editor bundle build와 관련 Blog Beta browser smoke
- 전체 unit suite는 parent의 `dev` 병합 전 별도 승인 후 실행

## 진행, 결정 변경과 결과

- Tiptap core에는 완성형 slash UI가 자동으로 포함되지 않으며, 현재 Vanilla JavaScript 편집기에는 관련 extension이 설치되어 있지 않다.
- 기존 `command('image')`는 커서 위치에 빈 `manuscriptImage`를 추가하므로 slash command는 이 삽입 계약을 재사용한다.
- `@tiptap/suggestion` 기반 image 전용 extension과 Vanilla JavaScript listbox popup을 추가했다. `/`, `/image`, `/이미지`를
  지원하며 최상위 단독 문단에서만 열린다.
- toolbar와 slash가 같은 source key·block ID·빈 title/prompt 생성 함수를 사용한다. Block node는 inline query 범위를 직접
  치환하지 않고 slash가 차지한 최상위 문단 전체를 기존 `manuscriptImage`로 교체한다.
- StarterKit의 Enter keymap과 suggestion 선택이 충돌할 수 있어 image slash extension에 우선 keyboard shortcut을 두었다.
  Escape 뒤 같은 위치에서 다시 입력할 때 dismiss 상태를 초기화하는 조건도 명시했다.
- focused browser script와 기존 Blog Beta browser smoke에 `/`, Escape, `/image`, Enter, pointer, undo/redo, 삭제 검사를 추가했다.
- `npm run build:manuscript-editor`, focused static contract 3건, 변경 JavaScript syntax, `git diff --check`는 통과했다.
- 전체 Blog Beta browser smoke는 새 시나리오 전에 기존 비동기 상태 assertion 두 곳에서 각각 중단되어 이번 기능의 회귀
  근거로 사용할 수 없었다. focused browser 검사는 구현 중 문제를 재현해 block 경계와 키맵을 보완하는 데 사용했으나,
  최종 보완 뒤 재실행은 브라우저 실행 권한이 승인되지 않아 아직 통과 결과가 없다.

## 남은 위험과 사용자 확인

- 한글 IME 조합 중 slash menu 간섭 여부와 좁은 화면에서 popup 위치는 자동 검사와 hands-on 확인이 필요하다.
- 목록·인용 같은 중첩 node 안에서 `/image` 허용 범위는 우선 최상위 빈 문단으로 제한하고 실제 사용성을 확인한다.
- 최종 hands-on 전에 focused browser script를 재실행해 Enter와 pointer 두 선택 경로, undo/redo, 삭제를 확인해야 한다.
