# 붙여넣기 원고 공통 작업공간 Stage 1 개발 기록

- Branch: `codex/feat/manuscript-paste-workspace`
- Start date: 2026-09-28
- Base/parent branch: `codex/manuscript-workspace-editor`
- Status: 구현 완료; 사용자 UI 확인 후 parent merge 준비

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
- `git diff --check` 통과. 변경은 아직 commit되지 않았다. 전체 unit suite는 parent feature를 `dev`에 병합하기 전 사용자 승인 후 실행한다.

## 남은 확인과 위험

- Tiptap의 지원 범위에 맞춘 Markdown 변환이며, 임의의 Markdown 문법을 원문 그대로 보존한다고 보장하지 않는다. 변환 가드는 후속 논의로 미뤘다.
- 사용자 hands-on 확인: macOS 한글 IME 조합, 실제 외부 Markdown 붙여넣기, 번호 없는 이미지 지시문 생성/편집, 3모드 전환, 원고 지우기와 undo/redo.

## 구현 단계

1. 기존 붙여넣기 화면, Draft API, preview/publish entrypoint의 상태 흐름 조사
2. 공통 editor workspace를 paste 진입점에 연결하고 편집/보기 전환 제공
3. 이미지 marker parse/placeholder와 파일 없는 paste marker의 안정 identity 처리
4. 최소 편집/저장/보기 흐름의 회귀 테스트 및 browser smoke
