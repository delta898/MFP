# 바로 생성 원고 공통 작업공간 Stage 개발 기록

- Branch: `codex/feat/manuscript-quick-create-workspace`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: 구현 완료, 사용자 hands-on 확인 대기

## 사용자 필요와 목표

주제 기반 `바로 생성`이 원고와 이미지를 만든 뒤, 붙여넣기 및 폴더 입력과 동일한 원고 작업공간으로 자연스럽게 이어진다. 입력 경로별 차이는 초기 원고가 있거나 없는 점으로 제한하고, 원고가 준비된 뒤에는 편집·Markdown·보기 및 이미지 편집 경험을 공유한다.

## 범위

- Blog Beta의 현재 바로 생성 원고 생성, 이미지 슬롯 및 편집/보기 흐름 조사
- AI 원고 생성 완료 후 공통 `블록 | Markdown | 보기` 작업공간으로 연결
- 생성된 원고와 이미지 슬롯/asset 연결을 안정적으로 유지
- 실패·재생성 상황에서도 마지막 유효 원고와 이미지 상태 보존
- 관련 focused contract 및 browser/UI regression 보강

## 비범위

- 붙여넣기 및 폴더 입력 흐름의 동작 변경
- 하단 이미지 관리 영역 제거
- slash command, drag-and-drop, 일괄 이미지 생성
- 발행 동작이나 이미지 provider 계약의 무관한 변경

## 설계 원칙

- `바로 생성`은 초기 원고가 없다는 입력 경로의 차이로 취급하고, 생성 이후 편집은 공통 Manuscript Workspace를 활용한다.
- 기존 Draft/preview/publish 경계와 stable image block ID 연결을 재사용한다.
- AI 작업은 진행 상태와 중복 실행 방지를 제공하고, 실패 시 마지막 유효 결과를 보존한다.
- UI는 사용자가 강조한 `Less is More`, 위치 고정 및 기존 이미지 UX 일관성을 따른다.

## 진행 및 검증

- 조사 결과, AI 생성은 이미 canonical Manuscript Draft를 만들지만 생성 후 원고 편집 화면은 별도 읽기 전용 미리보기와 legacy 이미지 관리 영역에 머물러 있었다. 서버의 Markdown 수정 허용 source kind도 `paste`/`folder`만 포함했다.
- AI source도 canonical draft Markdown 수정 경로를 사용할 수 있도록 허용하고, 생성 완료 후 기존 Tiptap 기반 블록/Markdown/보기 작업공간에 연결했다. AI 이미지 생성 전에도 현재 Markdown 편집 내용을 먼저 저장하도록 붙여넣기/폴더 경로의 flush 동작을 재사용했다.
- AI 작업공간에 공통 고정 툴바와 블록 이미지 상태/조작을 연결했다. 기존 하단 이미지 관리 영역은 제거하지 않고 유지했다.
- `보기`에서는 세 입력 경로 모두 legacy 이미지 확인 UI만 감추고, 해당 UI의 렌더/이벤트 연결은 비활성화했다. 기존 컴포넌트 코드는 남겨두며 이미지 본문 렌더링과 블록 편집 동작은 별도 경로로 유지한다.
- 생성 완료 시 AI Markdown을 editor에 반영하고 블록 모드에서 편집을 시작하도록 했다. 모드 전환, 원고 편집 후 저장, 이미지 생성 전 저장이 canonical draft의 revision 흐름을 따르도록 했다.
- 개발 기록과 browser fixture를 AI 원고의 이미지 marker 및 Markdown 수정 흐름에 맞게 갱신했다.
- 기준 구현 검증 통과: `node --check`, `git diff --check`, `node --test src/content/manuscript-draft-service.test.js` (26/26), `npm run test:ui-browser` (513 fixture requests).
- 이번 legacy UI 비활성화 변경은 `node --check ui/scripts/features/blog/draft-inputs.js`, `node --check scripts/test-ui-browser-smoke.js`, `git diff --check` 통과. 업데이트된 브라우저 시나리오는 fixture 기대값에서 실패하여 재시도하지 않았고, 변경 후 전체 UI 회귀는 아직 확인되지 않았다.
- 후속 브라우저 시나리오 점검에서 AI Markdown fixture가 동일한 원고의 재동기화에도 content version을 올려, 순차 발행된 대상 이력을 잘못 초기화하는 원인을 확인했다. fixture는 원고 Markdown이 실제로 달라질 때만 content version을 올리도록 수정했다. 재검증은 sandbox의 localhost 제약 및 승인 후 Chromium 기동 timeout으로 완료하지 못했다.
- 전체 unit suite는 실행하지 않았다. 부모 feature branch의 `dev` 병합 gate에서 사용자 승인 후 진행한다.

## 남은 위험 및 사용자 확인

- 사용자가 확인할 항목: 바로 생성 후 블록 편집/Markdown/보기 전환, 편집 원고 저장, 이미지 생성·선택 후 화면에서의 유지, 재생성 후 마지막 유효 결과 보존.
- 하단 이미지 관리 영역은 기존과 같이 유지했다. 블록 에디터 이미지 UX가 충분히 안정화된 뒤 별도 결정한다.
- 이번 단계는 feature branch 작업 트리에 있으며 아직 commit/merge하지 않았다.
