# Blog Beta 이전 원고 입력 모드 제거 개발 기록

- Branch: `codex/feat/remove-legacy-writing-modes`
- Start date: 2026-10-13
- Base/parent branch: `codex/fbr/retired-surface-removal`
- Status: 구현·검증 및 parent 통합 완료

## 사용자 필요와 목표

이전에는 Blog Beta 글쓰기가 AI 글쓰기, 원고 폴더, 원고 붙여넣기로 나뉘었지만 현재 사용 흐름은 하나의 통합 글쓰기다. 제품에서 더 이상 노출하지 않는 구분 모드와 전용 코드의 잔여물을 제거하되, 통합 작성기에서 기존 원고를 직접 붙여넣고 편집하거나 이미지 블록을 다루는 현재 기능을 보존한다.

## 범위

- Blog Beta의 숨겨진 folder/paste 별도 mode UI, 상태, 이벤트와 전용 API 호출을 caller 추적 후 제거
- 통합 글쓰기의 직접 입력/붙여넣기, Markdown 전환, 이미지 편집 및 발행 흐름 보존
- 현재 writer가 사용하는 shared manuscript API와 이미지 contracts 보존
- 관련 테스트, app composition 및 parent 개발 기록 갱신

## 비범위

- 통합 Blog Beta 글쓰기 화면의 재설계
- 공유 manuscript draft/API 및 이미지 처리 domain 제거
- 다른 제품 화면의 기존 원고/폴더 기능 삭제 (caller 조사 없이 범위 확장 금지)
- parent FBR의 dev 병합, push, release

## 조사 계획 및 위험 경계

1. Blog Beta의 folder/paste panels, mode switcher, mount/init/callback 호출을 전부 추적한다.
2. 현재 AI 작성 모드와 구분 mode 간 공유 편집기, draft state, API, 이미지 슬롯 흐름을 식별한다.
3. `legacy-actions-controllers.js`에 남은 `quick-manuscript`, `quick-pasted`, `local-markdown` 흐름이 다른 현행 caller를 갖는지 확인한다.
4. legacy-only 경로만 제거하고 focused contract 및 관련 UI/browser 회귀 검증을 수행한다.

특히 `/api/v1/blog/manuscript-drafts/paste`는 통합 AI 작성기에서 빈 원고의 draft를 초기화하는 데도 사용된다. 따라서 route/service는 현행 caller와의 계약을 확인하기 전 삭제 대상이 아니다.

## 결정

- 2026-10-13: 사용자는 예전의 AI/폴더/붙여넣기 세 가지 별도 글쓰기 모드가 하나의 글쓰기로 통합되었다고 정정했다. 이번 단계는 Blog Beta의 이전 별도 입력 mode 잔여물만 제거한다.
- 통합 작성기의 직접 붙여넣기/입력과 이미지 블록은 보존한다.
- `/api/v1/blog/manuscript-drafts/paste`는 AI 작성기의 원고 미리보기/초안 초기화에서 여전히 사용하므로 유지한다. `/api/v1/blog/manuscript-drafts/folder`는 이번 변경된 UI에서 더 이상 호출되지 않지만 서버/API 호환 범위이므로 유지하고, route/service/domain 계약 전체 삭제는 별도 호환성 검토 대상으로 남긴다.
- Site Hosting의 Vault 저장 폴더 선택은 원고 폴더 입력 모드와 이름만 유사한 별도 발행 설정이므로 유지한다.

## 진행 및 검증

- 시작 시 parent `codex/fbr/retired-surface-removal`은 clean 상태였다.
- `blog-next.html`에서 예전 folder/paste 전용 mode partial을 제거했다. 단일 AI writer의 블록/Markdown/미리보기, 이미지 편집, 붙여넣기 입력과 publish slot은 유지했다.
- `draft-inputs.js`, `draft-images.js`, `draft-execution.js`, `quick-flow-ui.js`, `shell.js`, `publishing-targets.js`에서 예전 mode별 상태와 이벤트, 파일 폴더 직렬화, 미리보기/발행 분기를 제거하고 단일 writer 흐름으로 단순화했다.
- old mode 전용 CSS와 partial을 제거했다. Vault 저장 폴더 선택 관련 스타일과 기능은 유지했다.
- 정적 UI 계약 테스트에서 구 mode 노출을 검사하는 assertion을 단일 writer 및 직접 붙여넣기 동작 확인으로 교체했다. 브라우저 스모크의 독립 folder/paste import/publish 시나리오는 제거하고, 두 retired panel 부재와 통합 AI writer의 Markdown ↔ block 전환/내용 유지 확인으로 바꿨다.
- 검증: 관련 8개 UI/계약 테스트 파일에서 84 tests passed; `npm run test:ui-browser` passed (430 fixture requests, 2 blocked external font requests); 변경 JS `node --check`와 `git diff --check` 통과.
- 전체 unit suite는 실행하지 않았다. 이번 단계는 parent branch merge 요청이 아니라서 broad suite approval gate는 적용하지 않았다.
- 남은 수동 확인: 앱에서 빠른 글쓰기의 AI 원고 생성, 기존 원고 붙여넣기, block/Markdown 전환 후 이미지 블록 표시, 직접 발행 및 Site Hosting Vault 폴더 선택을 확인한다.
- `e91545e9`로 parent `codex/fbr/retired-surface-removal`에 fast-forward 통합했다. 앱에서 최종 화면을 확인하는 단계는 사용자 확인으로 남긴다.
