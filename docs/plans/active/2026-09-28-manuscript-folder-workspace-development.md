# 폴더 원고 공통 작업공간 Stage 개발 기록

- Branch: `codex/feat/manuscript-folder-workspace`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: 계획 및 구현 조사 중

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

- TODO: 기존 folder preview/Draft API 경계와 `updateMarkdown` source 제한 확인.
- TODO: folder original snapshot과 편집 작업본의 실제 소유권을 검증하고 구현 계약 확정.

## 구현 진행 및 검증

- TODO

## 남은 위험 및 사용자 확인

- 사용자 hands-on 검증은 구현 완료 후 요청한다.
- OS native Korean IME는 자동 브라우저 테스트만으로 검증되지 않는다.
