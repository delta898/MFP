# 폴더 원고 공통 작업공간 Stage 개발 기록

- Branch: `codex/feat/manuscript-folder-workspace`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: parent 병합 완료 (`0a210ed1`까지 fast-forward)

## 사용자 필요와 목표

원고 폴더를 선택해 불러오는 경우에도 붙여넣기 원고와 같은 편집·Markdown·보기 작업공간을 사용한다. 폴더에서 읽은 파일은 원본을 보존하고 Draft 작업본만 수정한다. 이미지 파일은 Markdown의 순번 marker와 정확히 연결되어야 하며, 기존 이미지 선택/생성/교체 흐름도 안정 ID 기반으로 유지한다.

## 범위

- 폴더 원고의 현재 import, 파일 매핑, Draft 저장/preview/publish 경계 조사
- `블록 | Markdown | 보기` 공통 작업공간에 폴더 경로 연결
- 폴더에서 읽은 Markdown을 Draft 작업본으로 편집하고 보기 결과와 발행 입력에 반영
- `[[IMAGE_N ...]]`와 폴더 내 이미지 파일 매핑 및 stable block ID/asset 관계 보존
- 기존 폴더 이미지를 손상·삭제하지 않는 이미지 선택/교체/생성 동작 확인 및 필요한 최소 연결
- focused contract/browser regression 추가

## 비범위

- 원본 폴더 파일에 편집 결과를 덮어쓰기
- 붙여넣기에서 이미 확정된 재시작 복원 정책 변경
- 기존 하단 이미지 관리 영역 제거
- AI 생성 경로의 편집 UX 통합
- slash command, drag-and-drop, 일괄 이미지 생성 UX 확장

## 초기 설계 원칙

- 붙여넣기와 같은 Tiptap editor/component를 재사용하고, 폴더 전용 편집기를 새로 만들지 않는다.
- 선택 폴더는 입력 원본(snapshot)으로 취급하고, 편집·발행 상태는 app-owned Manuscript Draft 작업본에서 관리한다.
- 폴더 원본 이미지/Markdown은 수정 또는 삭제하지 않는다. 교체/생성은 Draft asset만 갱신한다.
- 폴더 mode의 `IMAGE_N`는 import 당시 파일 자동 매핑에만 사용한다. 편집 후 이미지 연결은 stable block ID/manifest 기준으로 보존한다.
- 동시 수정은 Draft revision을 이용해 충돌을 감지하며, 실패 시 마지막 유효 preview/asset을 보존한다.
- 사용자 요청의 `Less is More`와 이미 승인된 이미지 UX 원칙을 따른다. 기능 확장은 필요한 최소 동작부터 한다.

## 조사 결과 및 결정

- 폴더 선택은 브라우저가 전달한 파일을 app-owned Draft 작업공간에 복사하며, 원본 로컬 파일을 수정하지 않는다.
- 폴더 Draft의 초기 이미지 슬롯에는 stable block ID가 아직 없으므로 첫 Markdown 저장에서는 IMAGE 순번으로 기존 슬롯을 연결하고, 저장된 이후에는 block ID를 우선해 순서 변경에도 asset을 보존한다.
- 서버 `updateMarkdown`는 기존에 붙여넣기 Draft만 허용했지만, 작업공간 복사본을 수정하는 것은 폴더 Draft에도 안전하다. 다만 preview 분석 시 앱 작업공간 경로를 함께 전달해 기존 폴더 이미지 탐색이 계속 가능하도록 한다.
- AI 생성 직전 최신 Markdown을 먼저 저장한다. 저장 과정에서 슬롯 ID가 순번 기반에서 stable block ID 기반으로 바뀔 수 있으므로, 저장 응답의 해당 이미지 슬롯을 다시 찾아 생성한다.
- 보기 전환은 붙여넣기와 같이 `블록 | Markdown | 보기`로 제공한다. 기존 하단 이미지 확인 영역은 제거하지 않고 보기 모드에 남긴다.

## 구현 진행 및 검증

- 폴더 모드에 공통 Tiptap 편집기와 동일한 세 작업 모드를 연결했다. Markdown 편집 및 block editor 변경은 Draft API에 저장되며 보기 결과와 발행 입력에 반영된다.
- 폴더의 원래 IMAGE_N 순번 연결, 첫 stable ID 수화, 이후 ID 기준 재정렬의 asset 보존을 서비스 테스트로 검증했다.
- 브라우저 smoke fixture를 폴더 원고의 실제 `[[IMAGE_N]]` 문법에 맞추고, 폴더 편집기 초기화와 Markdown/보기 전환을 회귀 흐름에 추가했다.
- `node --test scripts/ai-action-availability-contract.test.js src/content/manuscript-draft-service.test.js src/content/local-markdown-preview.test.js` 통과 (47 tests).
- `node --check`로 수정한 UI 스크립트와 browser smoke 스크립트 구문 확인.
- `npm run test:ui-blog-auto` 통과.
- `npm run test:ui-browser` 통과 (516 fixture requests, page errors 0). 기존 smoke selector를 폴더/붙여넣기 editor rail 각각으로 범위 제한했다.
- `git diff --check` 통과.
- 병합 직전 이미지 제목·설명 입력 스타일을 공통 편집기 CSS로 통일했고, 브라우저 UI smoke 통과 (514 fixture requests), `git diff --check` 통과.
- 사용자 hands-on 확인: 폴더 불러오기 후 블록 편집 / Markdown 편집 / 보기 전환, 이미지 제목·prompt 변경 후 생성, 이미지 파일 연결과 블록 순서 변경, 원본 폴더 파일 불변.
- parent `codex/manuscript-workspace-editor`에 fast-forward 병합 완료.

## 남은 위험 및 사용자 확인

- 사용자 hands-on 검증은 구현 완료 후 요청한다.
- OS native Korean IME는 자동 브라우저 테스트만으로 검증되지 않는다.
