# 붙여넣기 원고 공통 작업공간 Stage 1 개발 기록

- Branch: `codex/feat/manuscript-paste-workspace`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: Stage 1 및 paste 이미지 UX 구현 완료; parent `codex/manuscript-workspace-editor`에 병합 완료

## 사용자 필요와 목표

사용자가 외부 도구에서 작성한 원고를 BlogGenius에 붙여넣은 뒤, 현재의 제한된 미리보기 대신 공통 원고 작업공간에서 편집하고 보기 결과를 확인할 수 있어야 한다. 이 Stage는 붙여넣기 입력을 첫 진입 경로로 삼아 공통 Draft/editor 경계를 실제 앱 흐름에 연결한다.

## 범위

- 붙여넣기 원고의 제목·본문을 공통 원고 작업공간에 연결
- `블록 편집 | Markdown 편집 | 보기` 전환 및 좁은 화면에 갇히지 않는 작업 영역
- 지원하는 최소 블록 편집/서식, 기존 콘텐츠 미리보기
- 번호 없는 `[[IMAGE ...]]` 및 순번 marker의 파싱/표시 테스트
- 현재 앱 Draft 서비스의 revision/save 계약 활용 여부 조사 및 범위 안에서 연결
- focused unit/UI contract 및 관련 browser test

## 비범위

- AI 생성·폴더 입력 경로 통합 (후속 Stage)
- 앱 재시작 이후 미완성 원고 재개
- Markdown raw editor 전체 기능 또는 임의 Markdown의 무손실 왕복 보장
- 본문 내 이미지 생성/교체/업로드 관리의 전체 UX (별도 후속 Stage)
- 발행 플랫폼별 rich-text 변환 정책의 최종 확정

## 설계 기준과 사용자 결정

- 모든 입력 경로는 장기적으로 같은 editor/workspace를 사용하며, 이번 구현에서는 paste만 연결한다.
- 이미지 번호는 폴더에서 파일을 자동 매핑할 때만 필수다. paste 문법은 `[[IMAGE` 블록에 `title`과 `prompt`를 두고 번호는 선택적으로 허용한다.
- 편집기의 이미지 identity는 번호나 배열 위치가 아니라 안정 block ID/asset manifest 경계를 사용한다.
- 편집기 후보는 Tiptap 우선이다. Stage 0 결과 및 사용자 확인을 기준으로 구현 범위를 확정한다.
- 불확실한 서식은 조용히 삭제하거나 발행 결과에서 숨기지 않는다.

## 구현 결과와 검증

- 붙여넣기 화면에 Tiptap 블록 편집기, 최소 도구막대, Markdown raw editor, `보기` 모드를 연결했다. 제목·본문의 현재 지원 서식, 이미지 지시문 블록 표시/프롬프트 수정/순서 이동과 Draft API 기반 미리보기 revision 갱신을 포함한다.
- 번호 없는 `[[IMAGE ...]]`는 paste에서 내부 sourceKey를 부여해 편집 중 식별하고 정규화 Markdown에서는 번호형 marker로 직렬화한다. 폴더에서 이미지 파일을 자동 매핑하는 경우에는 번호 없는 marker를 거부하고 안내한다.
- 오프라인 앱 실행을 위해 Tiptap browser bundle을 로컬 UI 자산으로 빌드하며, 앱 패키징 파이프라인에도 연결했다. 산출물은 약 438 KB (gzip 약 138 KB)이고 외부 CDN에 의존하지 않는다.
- 통과: `npm run build:manuscript-editor`; parser/preview/Draft focused tests 48개; `npm run test:ui-browser` (513 fixture requests). browser 흐름은 marker 없는 입력 → 이미지 블록 → Draft 저장/번호형 직렬화 → 보기 전환을 확인한다.
- 후속 UI 틀 조정: 붙여넣기와 폴더 입력을 `1 원고 → 2 발행`으로 단순화했다. 폴더는 원고/이미지 선택과 미리보기를 원고 단계에 둔다. prompt 편집/이미지 생성·지정·삭제·이동·추가는 별도 논의 전까지 기능 범위에 추가하지 않았다.
- 추가 결정 및 구현: 원고 편집 방식을 `블록 편집 | Markdown 편집 | 보기` 세 모드로 노출하고, Markdown 원문 textarea ↔ Tiptap 전환을 연결했다. 활성 모드는 더 강한 대비로 구분하며, 툴바는 블록 편집에서만 노출한다. 보기 중 툴바가 보이는 것은 `[hidden]`과 flex display 규칙 충돌이 원인으로 확인되어 명시적 hidden 스타일을 추가했다.
- UI 변경 후 `npm run test:ui-browser` 통과 (510 fixture requests). 스모크에서 두 단계 라벨, 세 모드 전환, Markdown 편집 → 블록 반영, 보기 중 툴바 숨김을 검증한다.
- 편집/보기 안정성 보완: 툴바를 블록 편집기 위로 옮기고, 붙여넣기 원고 변경 때마다 발생하던 중복 Markdown 저장 요청을 직렬화했다. 내용과 발행 설정이 이미 동기화되어 있으면 보기 전환 시 서버 요청을 생략하며, revision 충돌은 최신 revision을 다시 읽고 한 번 재시도한다. 보기 모드는 미리보기 갱신을 기다리지 않고 즉시 전환한다. 기존 편집 피드백 안내는 붙여넣기 작업공간에서 제거했다.
- 브라우저 회귀 검증은 툴바 순서와 저장 요청 지연 중 재편집 후 최신 내용의 보기 반영, 충돌 안내 부재를 포함한다. `npm run test:ui-browser` 통과 (517 fixture requests). 실행 중 기존 화면 경로에서 console errors 2건이 기록됐지만 회귀 테스트를 실패시키지 않았으며, 편집기 시나리오에서는 추가 오류가 없었다.
- 후속 UX 확장 범위: 모드 선택을 원고 단계 제목 줄 우상단으로 이동하고 세 모드 모두 동일한 문서형 세로 흐름을 사용한다. Markdown 입력과 보기 영역은 내부 높이 제한을 풀어 페이지에서 자연스럽게 이어지도록 한다. 연관글은 원고의 표준 Markdown 섹션으로 남겨 블록 편집·Markdown 편집·보기에서 동일하게 다루며, Markdown 수정 때 추천 링크를 자동 재생성해 사용자의 편집을 덮어쓰지 않는다.
- 연관글은 RSS 결과의 제목과 URL을 Markdown 링크로 저장하는 방향으로 조정한다. 원고를 만들 때 추천된 링크가 이후 원고 편집 중 유지되고, 발행이 별도 링크를 덧붙여 중복시키지 않는지 회귀 검증한다.
- 적용 완료: 모드 버튼은 `원고` 헤더 우측에 배치했다. Markdown 원문 textarea는 입력 길이에 맞춰 자동으로 높이를 늘리고, 보기 영역도 내부 스크롤 제한 없이 본문과 링크를 끝까지 세로로 보여준다. 추천 연관글은 `## 함께 보면 좋은 글` 아래 제목 포함 Markdown 링크로 기록하고, 사용자의 편집본이 미리보기·발행 payload에 그대로 유지되도록 자동 재수집을 중지했다.
- 최초 paste Draft 생성 때 서버가 RSS 추천 링크를 본문에 확정하는 경우, 응답의 canonical Markdown을 textarea/Tiptap/localStorage에 반영하도록 연결했다. 응답 대기 중 사용자가 원고를 수정했다면 그 편집을 덮어쓰지 않고 추천 섹션만 병합하며, 최신 입력이 서버에 저장되도록 동기화 키를 유지한다.
- 검증: 관련 Draft/API/Markdown 링크 focused tests 23개 통과, `git diff --check` 통과, `npm run test:ui-browser` 통과 (510 fixture requests). 브라우저 테스트는 최초 입력에는 없는 연관글이 서버 응답에서 추가된 뒤 Tiptap·Markdown·보기 모두에서 나타나고 링크를 유지하는 것, 헤더 우측 모드 버튼, 본문 길이에 맞춘 Markdown 높이, 긴 세로 보기 흐름을 확인한다. 테스트 실행 중 전체 앱 경로에서 console error 2건이 계측됐으며 편집기 관련 page error는 없었다. 시각적 디자인 수용 및 실제 네이버/WordPress 발행 확인은 사용자의 hands-on 검증으로 남는다. 변경은 아직 commit되지 않았다.
- unsupported Markdown 변환 guard는 사용자의 요청으로 후속 논의로 미룬다. 이 Stage는 우선 편집 전환의 기본 동작에 집중하며 무손실 round-trip은 약속하지 않는다.
- 후속 시각 조정: 세 모드 버튼을 `블록 | Markdown | 보기`의 한 줄 세그먼트형 컨트롤로 축약하고, 활성 상태는 액션 소프트 컬러로 표시한다. 우측 정렬 및 같은 줄 정렬을 브라우저 스모크에서 확인한다.
- 사용자 결정: 앱 재실행 시 붙여넣기 원고는 복원하지 않는다. 미완성 원고 재개가 이번 범위에 없고, localStorage의 원문만 복원하면 새로운 Draft 생성 시 기존 연관글을 다시 추천해 중복될 수 있다. 실행 중 원고는 그대로 유지하되, 구버전이 남긴 localStorage 값은 시작 시 삭제한다.
- 모드 전환은 편집기/textarea로 포커스를 강제로 옮기지 않고 클릭한 모드 버튼에 유지한다. 컨텐츠 변경 후에도 현재 페이지 스크롤 위치를 보존한다.
- 회귀 검증 추가: 브라우저에서 모드 전환 후 활성 포커스 버튼과 위치/scrollY가 유지되는지, 오래된 localStorage 값이 다음 앱 실행에 복원되지 않고 정리되는지 확인한다.
- 결과: `npm run test:ui-browser` 통과 (513 fixture requests; 0 page/console errors), `git diff --check` 통과. 브라우저 테스트 과정에서 UI fixture 서버의 localhost listen은 sandbox에서 차단되어 승인된 권한 상승으로 테스트를 실행했다.
- 고정 툴바 후속: 서식 도구와 `블록 | Markdown | 보기` 전환을 원고 단계의 단일 sticky 레일로 배치했다. 블록 편집에서만 서식 도구를 표시하고 세 모드 전환은 항상 노출한다. sticky 오프셋은 `.main` 상단 여백 변수와 모바일 상단바의 `ResizeObserver` 실측 높이에서 계산해 레이아웃 조정 시 별도 pixel 보정을 수정하지 않도록 했다. 레일 좌우에는 UI spacing token 기반 여백을 적용한다. 모드 전환 시 클릭한 버튼의 화면 위치도 보존한다.
- 후속 검증: `npm run test:ui-browser` 통과 (508 fixture requests). UI 테스트에서 sticky 위치, 모바일 상단바 실측 높이 동기화, 양쪽 여백, toolbar/mode 정렬 및 서식 도구를 숨긴 Markdown/보기 모드에서도 모드 버튼이 우측에 남는 것, 모드 전환 후 버튼 위치 보존을 확인했다. 시각적 수용은 사용자 hands-on 확인이 남는다.
- `git diff --check` 통과. 변경은 아직 commit되지 않았다. 전체 unit suite는 parent feature를 `dev`에 병합하기 전 사용자 승인 후 실행한다.

## 남은 확인과 위험

- Tiptap의 지원 범위에 맞춘 Markdown 변환이며, 임의의 Markdown 문법을 원문 그대로 보존한다고 보장하지 않는다. 변환 가드는 후속 논의로 미뤘다.
- 사용자 hands-on 확인: macOS 한글 IME 조합, 실제 외부 Markdown 붙여넣기, 번호 없는 이미지 지시문 생성/편집, 3모드 전환, 원고 지우기와 undo/redo.

## 최종 통합 handoff

- 붙여넣기 발행 안내는 `미지정 이미지 N개가 있습니다. 지금은 임시 저장만 가능합니다.`로 단순화했다. `이미지 블록으로 이동 ↑`는 블록 편집 모드로 전환하고 첫 미지정 이미지의 prompt 입력란에 포커스를 둔다.
- 사용자의 요청에 따라 붙여넣기 화면의 `내용 지우기`/전용 복구 버튼과 이에 종속된 snapshot 상태·처리를 제거했다. 사용자는 편집기에서 원고를 직접 편집/삭제한다.
- 마지막 변경 커밋 `7f58c7b6 fix: streamline pasted draft image guidance`; 앞선 이미지 UX/툴바/editor 커밋은 `28a6f3f4`, `3078e9c9`, `15d3eac0`이다.
- 최종 검증: `node --test scripts/ai-action-availability-contract.test.js`, `git diff --check`, `npm run test:ui-browser` 통과 (520 fixture requests; 0 page/console errors). 브라우저 smoke는 첫 미지정 이미지 이동·포커스, 발행 안내, 기존 이미지 패널 이미지 업로드 경로, 내용 지우기 버튼 제거를 포함한다.
- 남은 수동 확인: macOS native Korean IME 및 사용자의 최종 시각/탐색 확인. 전체 unit suite는 이 parent를 `dev`에 병합하기 전에 승인 후 실행한다.
- 다음 단계는 폴더 원고 경로이며 별도 하위 feature branch/개발 기록에서 진행한다. Draft 본문 저장을 folder source에 허용할 때 원본 폴더 불변, stable image block/asset 연결, reorder·삽입·삭제 후 mapping이 보존되는지 설계·검증해야 한다.

## 구현 단계

1. 기존 붙여넣기 화면, Draft API, preview/publish entrypoint의 상태 흐름 조사
2. 공통 editor workspace를 paste 진입점에 연결하고 편집/보기 전환 제공
3. 이미지 marker parse/placeholder와 파일 없는 paste marker의 안정 identity 처리
4. 최소 편집/저장/보기 흐름의 회귀 테스트 및 browser smoke

## 이미지 UX 후속 작업 (진행 중)

- 사용자는 inline 이미지 UX가 안정화될 때까지 기존 하단 이미지 관리 영역을 유지하기로 결정했다. 두 UI가 같은 상태와 서비스 동작을 쓰도록 이미지 media renderer를 공통화하며, 하단 영역을 이 작업에서 제거하지 않는다.
- 이미지 블록의 stable ID를 Markdown directive와 draft image slot manifest에 연결한다. reorder 때 asset이 원래 블록을 따라가고, 번호/sourceKey는 폴더 파일 mapping 용도로 계속 쓴다.
- Inline block에서 제목·prompt 수정, 이미지 생성, 로컬 선택/교체, 이미지 연결 제거, 블록 추가/이동/삭제를 제공한다. 이미지 연결 제거는 title/prompt directive를 남기고, 블록 삭제는 directive를 제거한다. 별도 “발행에서만 제외” 기능은 이번 1차 범위가 아니다.
- 공유 media renderer를 inline block 및 하단 이미지 관리 카드 양쪽에서 사용해 loading/ready/placeholder 상태와 모양의 중복 구현을 피한다.
- 파일 정리는 draft 변경 저장 성공 후 수행한다. generated/user 원본은 더 이상 참조되지 않을 때만 정리하며 folder 원본은 앱에서 삭제하지 않는다.
- 검증 완료: focused manuscript/parser/preview/API tests 60개 통과, `node --check`, `npm run build:manuscript-editor`, `git diff --check`, `npm run test:ui-browser` (511 fixture requests; 0 page errors). Browser flow covers inline image block title/prompt and generate/local-pick controls, plus legacy image manager flows. Sticky rail assertion was made threshold-aware: it scrolls until the layout-derived sticky position is reached, then confirms that further scrolling keeps it fixed.
- 이미지 UX follow-up: inline 이미지 미디어 위에 이미지가 있을 때 hover/focus로 생성·교체·연결 제거를 노출하고, 이미지가 없을 때는 기본 노출한다. 위/아래 이동은 별도 구조 그룹으로 분리하고 블록 삭제는 제목 행의 X 버튼으로 옮겼다. 공통 실행 잠금에서 inline 생성/중지 및 계속 버튼을 기존 이미지 카드와 같은 예외 흐름에 등록해 생성 중에도 조작할 수 있게 한다. 진행 spinner/status, 진행 수, 2단계 중지 확인을 기존 이미지 관리와 맞춘다.
- prompt/title은 입력 즉시 편집기 문서에 반영한다. AI 이미지 생성 직전 붙여넣기 원고의 마지막 변경이 저장되었는지 동기화 키/revision으로 확인하고, 실패 시 생성 요청을 시작하지 않는다. Browser smoke에는 delayed Markdown save 후 generation 요청 순서와 stop → confirm → continue → stop 시나리오를 추가했다.
- 다른 입력 경로 조사: 이미지 media renderer는 공통 재사용 가능하지만 Tiptap editor는 현재 paste에만 mount되어 있고 `updateMarkdown` 서비스도 `source_kind !== paste`를 읽기 전용으로 거부한다. 따라서 AI·folder 적용은 frontend mount만 복제할 수 없으며 source별 편집 저장/폴더 원본 보호 경계를 확장하는 후속 단계가 필요하다. 이번 Stage에서는 그 저장 의미를 임의 변경하지 않는다.
- 이번 변경 검증: focused manuscript/parser/preview/API tests 60개 통과, `npm run build:manuscript-editor` (443.70 KB; gzip 139.59 KB), `node --check`, `git diff --check`, `npm run test:ui-browser` 통과 (522 fixture requests, 0 page/console errors). 브라우저 smoke에서 최신 prompt의 Markdown 저장 완료가 이미지 생성 요청보다 먼저인 것과 중지 확인/계속 진행/중지 완료 흐름을 검증했다. 사용자 hands-on UI/IME 확인은 남았고, 변경은 미커밋 상태다.
- 남은 확인: 사용자 hands-on UI 확인 및 OS native IME. 기존 하단 이미지 관리 영역은 inline UX가 안정화될 때까지 유지한다. 변경은 미커밋 상태다.
- 이미지 생성 중 상태 UI 후속: `중지 확인`과 `계속 진행`을 액션 순서상 붙이고 이미지 선택/제거 액션을 뒤에 두었다. 상태·중지 안내의 아래쪽에 액션 레일 공간을 확보해 가림을 방지하고, 개별 블록 상태 문구에서 불필요한 `1/N`을 제거했으며 헤더의 `이미지 블록` 배지도 생략했다. Browser smoke에서 안내문과 버튼 비겹침, 버튼 인접 순서, 단일 상태 문구 및 배지 제거를 검증했다. 에디터 빌드와 browser smoke (520 fixture requests; 0 page/console errors) 통과. 사용자 hands-on 확인은 남았고 미커밋 상태다.
- 상태 위치 안정화: 생성 중과 중지 확인 중 같은 두 줄 status-copy 슬롯을 사용하고, 안내 문장을 짧게 유지해 상태 변화 때 텍스트가 옆/아래로 이동하지 않도록 했다. 상태 카피는 하단 액션 레일과 겹치지 않는 고정 lane에 배치했다. Browser smoke에서 상태 전후 이미지 영역 기준 copy 좌표 동일성 및 안내문/액션 레일 간격을 검증했다. 최종 browser smoke 516 fixture requests, 0 page errors 통과. 변경은 미커밋이며 화면의 최종 시각 확인은 사용자에게 남아 있다.
- 사용자 화면 재확인 후 수정: 실제 스크린샷에서 공통 미디어 renderer의 “AI 이미지 생성 중” placeholder와 node view 상태가 겹쳐 흐릿한 중복 문구가 생기는 점, 보조 문구가 왼쪽으로 이동한 것처럼 보이는 점을 확인했다. inline editor에서는 공통 renderer의 생성 오버레이를 끄고 불투명 상태 레이어 하나만 사용한다. 상태/보조 문구를 같은 중앙축의 고정 2줄 슬롯에 두고, 하단 액션 레일과 겹치지 않도록 슬롯 위치/폭을 잡았다. 생성 전/중지 확인 상태 간 슬롯 좌표 동일성, 중앙축 일치, placeholder 중복 문구 없음, 액션과 안내 비겹침을 Browser smoke로 검증했다. 번들 빌드 및 smoke 515 fixture requests 통과. 변경은 미커밋이며 사용자 화면 재검토가 남아 있다.
- 사용자 확정 UX: 대기 중에는 placeholder의 `이미지 미지정` 제목과 설명을 보인다. 생성 중/중지 확인 중에는 같은 제목 위치에 `AI 이미지 생성 중`만 표시하고 설명은 노출하지 않되, 설명 행 공간은 비워 고정해 상태 변화로 위치가 이동하지 않게 한다. 중지 안내문은 제거하고 버튼 라벨만으로 확인/계속 동작을 전달한다. 이 상태에서는 공통 renderer의 생성 문구를 억제해 흐릿한 중복 표시를 막는다. Browser smoke에 생성 중/중지 확인 중 동일 문구·좌표와 placeholder 중복 억제를 검증하도록 갱신한다.
