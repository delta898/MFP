# 원고 이미지 블록 모드 전환 복원 개발 기록

- Branch: `codex/feat/manuscript-image-mode-restore`
- Start date: 2026-10-13
- Base/parent branch: `dev`
- Status: 구현 및 자동 검증 완료; `dev` 병합 준비 완료

## 사용자 필요와 목표

블록 편집기에서 생성하거나 불러온 이미지가 Markdown 편집으로 전환했다가 블록 편집으로 돌아오면 이미지 블록 안에 표시되지 않는다. 실제 Draft 이미지 asset은 남아 있지만 사용자에게 사라진 것으로 보인다. 모드 전환 직후 기존 asset을 이미지 블록에 다시 연결해 표시한다.

## 범위

- 블록 ↔ Markdown 왕복 시 기존 이미지 asset 표시 복원
- 붙여넣기, AI 작성, 폴더 원고 등 공통 편집기 경로 확인
- 이미지 보존 및 왕복 전환에 대한 브라우저 회귀 검증

## 비범위

- 이미지 저장 형식이나 Draft asset 소유권 변경
- 임의 Markdown의 무손실 왕복 보장
- 기존 이미지 관리 UI, 이미지 생성/업로드 동작 변경
- 전체 단위 테스트 실행, 커밋, 병합, 푸시

## 조사 결과와 설계

- 이미지 Markdown marker에는 stable block ID, 제목, 프롬프트가 직렬화된다. 이미지 URL/존재 여부는 별도 Draft 이미지 manifest/preview 데이터에서 제공된다.
- `setMarkdown()`은 Markdown을 다시 parse하므로 URL/존재 여부가 기본값으로 초기화된다. mode 전환 직후 `syncImages()`를 호출하지 않아 이미지가 없는 placeholder로 보일 수 있다.
- 블록 전환 시 현재 preview의 이미지 목록을 다시 연결한다. 이미지 marker identity와 asset 매핑은 기존 `syncImages()` 계약을 따른다.

## 구현 및 검증 이력

- 2026-10-13: `dev`에서 작업 브랜치를 생성했다. Markdown 재파싱 후 paste/AI/folder 경로 모두 저장된 preview 이미지 목록을 즉시 editor에 재연결하도록 공통 복원 함수를 추가했다.
- 브라우저 회귀는 paste 원고에서 이미지를 불러온 뒤 Markdown → 블록으로 전환해 동일한 image URL이 유지되는지 확인한다. focused contract는 세 입력 경로 모두 복원 처리를 호출하는지 확인한다.
- 검증 통과: `node --test scripts/manuscript-image-workspace-contract.test.js` (3 tests), `node --check` (변경한 JS 2개), `git diff --check`, `npm run test:ui-browser` (496 fixture requests; 앱 페이지 오류 없이 통과, 외부 Google Fonts 요청 2건은 테스트 환경에서 차단).
- 전체 단위 테스트는 샌드박스에서 loopback bind 권한 부족으로 5건 실패한 뒤, 승인된 로컬 loopback 실행으로 재검증해 통과했다: `node scripts/run-unit-tests.js` (2,257 passed, 0 failed, 15 skipped; 2,272 total).
- `dev` 병합 전 코드 리뷰 및 `git diff --check`를 완료했다. 자동 검증은 통과했으며, 실제 화면의 최종 시각 확인은 사용자가 원할 때 할 수 있다.

## 최종 결과

- 이미지 asset 저장/Markdown 포맷/서버 계약은 변경하지 않았다. editor의 기존 `syncImages()`를 호출해 UI 상태만 복원한다.
- Markdown을 직접 수정해 이미지 marker의 ID나 순서를 바꾸는 경우에는 기존 preview/asset reconciliation 규칙이 계속 적용된다. 임의 Markdown 변환의 무손실 왕복은 보장 범위가 아니다.
- 결과적으로 사용자가 Markdown 보기로 전환했다가 블록 편집기로 돌아와도 불러온 이미지가 다시 표시된다.
