# 공통 원고 작업공간 편집 경험 개발 기록

- Branch: `codex/manuscript-workspace-editor`
- Start date: 2026-09-28
- Base/parent branch: `dev`
- Status: Stage 0 기술 prototype 완료; Stage 1 paste workspace 구현 완료, 사용자 확인/통합 대기

## 사용자 필요와 목표

AI 생성, 폴더 불러오기, 원고 붙여넣기는 입력 방법만 다를 뿐, 원고를 편집하고 결과를 확인한 뒤 발행하는 경험은 같아야 한다. 지금은 생성 이후 제목·본문 편집과 이미지 위치별 관리가 약하고, 입력별 화면/상태 구현이 나뉘어 있다. 세 경로를 하나의 원고 작업공간으로 모으고, 사용자가 최종 발행 전에 본문과 이미지를 직접 다듬을 수 있게 한다.

이번 문서는 구현 전에 전체 여정과 기술 경계를 함께 검토하기 위한 제안이다. 구현 승인이나 플랫폼별 발행 변환 정책의 최종 결정을 뜻하지 않는다.

## 범위와 비범위

포함:

- AI·폴더·붙여넣기 입력을 공통 원고 작업공간에 연결
- `편집 ↔ 보기` 전환 및 편집 내부 `블록 편집 ↔ Markdown 편집`
- 제목·본문·인라인 이미지 블록의 편집, AI 이미지 생성, 내 이미지 선택/교체/제외
- 입력 원본 보존, 현재 세션 자동 저장, 미리보기/발행 revision 일치
- 네이버·WordPress 발행을 위한 플랫폼별 후처리/검증 경계

비포함:

- 앱 재시작 후 미완성 원고를 찾아 재개하는 기능
- 이미 발행된 외부 플랫폼 게시물 편집
- 이번 설계 단계에서의 production UI/서비스 구현 및 구체적인 네이버 미지원 서식 처리 규칙
- 원본 폴더 파일을 편집 결과로 덮어쓰기

## 사용자가 합의한 방향

- 모든 입력 경로가 같은 공통 편집/보기 모듈과 원고 상태 계약을 사용한다. 우선 붙여넣기에 연결하고, 이후 AI 생성·폴더 경로도 같은 모듈에 연결한다.
- 전체 기획은 이미지와 최종 발행까지 포함해 먼저 하고, 개발은 검토 가능한 단계로 나눈다.
- 작업공간은 현재보다 넓게 쓰며, `편집 ↔ 보기` 전환을 둔다.
- 편집 방식은 블록 편집을 먼저, Markdown 원문 편집을 후속으로 둔다.
- 이미지 prompt 포맷은 바꿔도 되며 하위 호환은 요구하지 않는다.
- 이미지 지시문은 붙여넣기 원고에서 선택적으로 사용할 수 있고, 이미지 파일과 원고를 함께 매핑하는 폴더 불러오기에서는 순번형 `[[IMAGE_N ...]]`를 사용한다. 외부 도구에서 작성할 때 안내할 공통 문법은 `[[IMAGE` 블록이며 번호는 선택 항목으로 문서화한다. 붙여넣기 테스트에서 번호 없는 표식 파싱을 확인한다.
- Tiptap을 우선 후보로 삼고, vanilla JavaScript 기반의 작고 앱 스타일에 맞는 custom toolbar를 우선한다. 비교 prototype에서 Crepe의 UI가 현재 앱과 맞지 않게 보였고 Tiptap custom toolbar가 선호되었다. 이는 Crepe 자체의 보편적 품질 판정은 아니다.
- 발행 대상 플랫폼이 달라져도 작성 중 후보 글/원고를 재수집하지 않는 공통 흐름을 원한다. 편집기에서 지원하지 않는 서식을 플랫폼 발행 시 어떻게 처리할지는 추후 확정한다.

## 현재 구현 조사 결과

- `docs/architecture/manuscript-workspace.md`와 `src/content/manuscript-draft-service.js`에 공통 Draft, 이미지 slot, preview/publish 경계가 있다. AI·folder·paste adapter는 Draft 서비스에 진입하지만 현재 UI 편집 흐름은 입력별 호출/상태로 나뉘어 있다.
- 현재 `updateMarkdown()`은 `paste`만 허용하고 AI/folder는 읽기 전용으로 거부한다. 공통 편집 UX를 위해 이 제한과 입력 원본 보호 경계를 정리해야 한다.
- 원본 폴더는 읽기 전용이며 작업 workspace로 복사된다. 이미지 교체 실패 시 이전 정상 asset을 보존하고 revision으로 동시 변경을 감지하는 동작이 있다.
- 이미지 생성·수동 교체·제외·복원은 있으나 본문 이미지 block 삽입·이동·완전 삭제 UX와 안정 ID 계약은 없다. 기존 순번형 `[[IMAGE_n ...]]`는 새 계약으로 전환 가능하다.
- 서버 Draft 보존은 있으나 runtime 재시작 후 사용자가 다시 여는 복구 목록은 없다. 이번 범위에서는 재개 UX를 만들지 않는다.

## 제안: 사용자 경험

### 1. 세 진입점에서 하나의 작업공간으로

```text
AI 생성 ─┐
폴더 ────┼→ 공통 원고 작업공간 → 보기/편집 → 이미지 정리 → 발행
붙여넣기 ┘
```

각 경로는 원고와 source 정보만 넘긴다. 이후 제목, 본문, 이미지, 저장, 보기, 발행 설정은 같은 component/controller와 Draft revision을 사용한다. 우선 붙여넣기에 통합하되, AI·폴더에 별도 편집기를 만들지 않고 adapter만 추가한다.

### 2. 모드와 레이아웃

- 작업공간 상단에 `블록 편집 | Markdown 편집 | 보기`를 둔다. 넓은 한 화면을 한 모드가 차지하도록 하고 상시 좌우 분할은 기본값으로 삼지 않는다.
- 블록 편집에서는 지원 서식용 도구막대를 표시하고, Markdown 편집에서는 원문 textarea, 보기에서는 발행 결과만 표시한다. 현재 선택은 명확한 활성 스타일과 `aria-pressed`로 표현한다.
- 편집은 제목과 본문이 한 문서처럼 이어지는 넓은 캔버스다. 툴바는 제목/선택 블록에 필요한 서식만 제공한다: 문단, 제목 단계, 굵게, 기울임, 링크, 글머리/번호 목록, 인용, 실행 취소/다시 실행. 표·색상·임베드 등 플랫폼별 결과가 불확실한 기능은 처음부터 노출하지 않는다.
- `보기`는 발행 순서의 제목·본문·이미지를 보여준다. 발행 문구가 별도라면 보기에서도 합쳐진 게시물 결과를 확인할 수 있게 한다. 편집 mode의 내부 장식/조작 UI는 보기 결과에 포함하지 않는다.
- 저장 상태는 한 군데에서 `저장 중 / 저장됨 / 저장 실패`로 표현한다. 편집/보기 전환은 동일 최신 Draft revision에서 이뤄지고, 저장 실패 시 변경 내용을 버리거나 전환으로 감추지 않는다.
- 편집 중 중지/취소 시 이미 합의된 동작을 사용하고, 중복 생성/발행은 잠금 및 진행 상태로 막는다.

### 3. 이미지 UX — 기존 하단 영역을 대체

제안은 기존의 항상 펼쳐진 본문 아래 이미지 영역을 그대로 유지하지 않는 것이다. 같은 이미지를 본문과 갤러리에 중복 표시하면 원고가 길어지고 이미지와 삽입 위치의 관계도 약해진다.

- 이미지와 prompt는 본문 흐름의 **이미지 블록**으로 둔다. 블록에는 실제 이미지 또는 명확한 빈 placeholder, 선택적 prompt/설명, 처리 상태가 표시된다.
- 블록 편집에서 placeholder를 누르면 그 자리에서 `AI 이미지 만들기`, `내 이미지 선택`, `제외`를 제공한다. 생성된 이미지는 그 블록의 asset을 채운다. 교체는 새 이미지가 성공적으로 준비된 뒤에만 기존 이미지를 바꾼다.
- 이미지 생성은 기술적으로 블록 편집 안에서 지원 가능하다. Tiptap custom node view는 Vanilla JavaScript로 인터랙티브한 노드 UI를 만들 수 있고, Markdown 변환용 custom parse/serialize handler도 제공한다. 단, 이미지 생성 호출은 editor node 자체가 아니라 기존 공통 Draft/image service에 위임한다. 이렇게 해야 편집기 재마운트나 모드 전환에 서비스 로직이 묶이지 않는다.
- 블록을 선택하면 prompt 수정, 이미지 교체, 대체 이미지 선택, 제외/복원 등의 도구를 노출한다. 본문에서 이미지를 제외하는 것과 이미지 블록 자체를 삭제하는 것은 구분하고, 완전 삭제는 명확한 별도 동작으로 제공한다.
- 기존 하단 이미지 영역은 기본적으로 제거하고, 그 자리를 **접힌 `이미지 관리 · n개` 보조 패널**로 대체하는 안을 제안한다. 펼치면 썸네일/상태 목록, 해당 본문 위치로 이동, 실패한 생성 재시도 및 전체 진행 상태를 제공한다. 이미지를 직접 편집하는 주 경로는 inline block이며, 보조 패널은 탐색/일괄 상태 확인용이다. 화면을 계속 차지하지 않게 기본 접힘 상태로 둔다.
- `보기`에서는 이미지 asset만 최종 크기/비율로 렌더하고 prompt와 편집 버튼은 숨긴다. 비어 있거나 실패한 image block은 게시 결과에서 조용히 사라지지 않고, 사용자가 보기에서 인지할 수 있는 미완성 표시와 발행 검증 오류를 제공한다.
- Markdown 편집에서는 이미지 블록을 Markdown의 안정적인 한 줄 지시문으로 보이게 하고, 현재 이미지 asset은 지시문에 binary/base64로 넣지 않고 별도 asset reference로 보존한다. 지시문을 선택하면 공통 이미지 관리 도구가 해당 block을 대상으로 동작한다. 블록 모드에서만 이미지 생성 가능하게 제한하지 않는다.

### 4. 저장, 원본과 이미지 상태

- 편집 가능한 문서는 app-owned Draft의 canonical 구조 문서다. title, text/formatting blocks, image blocks 및 안정 ID를 저장하고, 이미지 파일은 별도 asset store에서 ID로 참조한다.
- AI/paste/folder에서 처음 가져온 원고와 원본 파일은 immutable source snapshot이다. 편집은 working copy만 변경한다. 폴더 원본을 수정하지 않는다.
- 본문 순서/블록 위치와 이미지 연결은 숫자 배열 index가 아닌 안정적인 block ID로 맺는다. 이동/삽입/삭제 뒤에도 엉뚱한 이미지를 가리키지 않도록 한다.
- AI 생성, 내 이미지 선택, 교체는 기존 이미지 서비스와 권한/용량 검증을 공유한다. 생성 오류나 업로드 실패는 원고를 지우지 않고 기존 정상 asset을 유지한다.
- Draft 변경은 debounce autosave하고 revision을 올린다. 저장 전환 중 최신 결과가 확정되지 않으면 보기/발행 시점을 기다리거나 저장 오류로 설명한다. 다른 최신 revision과 충돌할 때 자동으로 덮어쓰지 않는다.
- 앱 재시작 후 복구 목록은 이번 범위 밖이다. 다만 같은 실행 세션 안의 탭/모드 이동, 편집기 재마운트, 미리보기 진입에서 현재 작업이 사라지지 않아야 한다.

### 5. 미리보기와 플랫폼 발행 경계

- 편집/보기가 공유하는 canonical 문서가 원본이다. 보기 렌더와 최종 발행 변환은 같은 문서 revision을 읽는다.
- 발행 직전에 adapter가 플랫폼별 payload를 만든다. WordPress는 Markdown→HTML 변환 등 현재 지원 경로를 활용하고, 네이버는 브라우저 자동화에 맞는 제한/검증을 별도 adapter에 둔다.
- 에디터에 표시하지 않는 기능을 숨기고, 발행되지 않을 기능을 발행 시 조용히 삭제하지 않는 원칙을 둔다. 네이버 비호환 요소의 구체 정책(자동 변환, 사용자 확인, 발행 차단 등)은 발행 adapter 설계 단계에서 결정한다. 본 설계에서는 adapter가 변환 불가 항목을 감지해 사용자에게 설명할 수 있는 경계까지 요구한다.
- 게시 직전 본문·이미지·발행 문구가 같은 Draft revision인지 확인한다. 발행 실패/재시도는 사용자의 최신 편집을 덮어쓰지 않는다.

## 제안: 내부 구조와 계약

### Canonical document

Tiptap/ProseMirror JSON을 편집기의 사적인 저장 형태로만 취급하지 않고, app-owned `ManuscriptDocument` schema로 정의한다. Tiptap은 이 schema의 편집기 adapter다. 초기 block type은 `paragraph`, 제한된 `heading`, `bulletList`, `orderedList`, `blockquote`, `horizontalRule`, `image`다. 허용 범위 밖 node/mark는 조용히 제거하지 않고 입력 단계에서 보존 가능한 원문 fallback 또는 명시적 unsupported 상태로 잡는다.

```text
ManuscriptDraft
  sourceSnapshot: { sourceKind, originalTitle, originalMarkdown, importedAt }
  document: { schemaVersion, blocks[] }
  assets: [{ assetId, mimeType, dimensions, origin, storageRef }]
  revision / lifecycle / timestamps

ImageBlock
  blockId                 // stable identity
  prompt?                 // AI generation instruction, editable
  caption?                // user-visible optional text
  assetId?                // external asset reference, never base64 in Markdown
  status                  // empty | generating | ready | error | excluded
```

실제 필드 이름/저장 위치는 기존 Draft API와 대조 후 확정한다. 원고 문서와 binary asset을 분리하되 한 Draft revision에 묶어 저장/검증한다. prompt 없는 수동 이미지는 `assetId`만 가진 image block, prompt만 있는 블록은 생성 placeholder다.

### Markdown bridge

- Markdown은 별도 복제 데이터가 아니라 canonical 문서의 입출력 편집 표면이다. 블록→Markdown 변환 결과를 원고에 반영할 때 canonical 문서로 다시 parse하고 같은 Draft 저장 경로에 넣는다.
- 방금 확인한 폴더 입력 매핑을 고려해 현재 `[[IMAGE_N ...]]`의 번호는 제거하지 않는 방향으로 수정 제안한다. 현재 importer는 `IMAGE_0`를 `00_...` 파일, `IMAGE_1`을 `01_...` 파일과 연결한다. 숫자 없는 prompt marker로 바꾸려면 동등하게 명확한 `file:` 지정 또는 별도 사용자 매핑 UI가 필요한데, 이는 AI 생성에 파일명을 요구하거나 폴더 입력 UX를 늘린다.
- 번호의 **의미를 분리**한다. 폴더 importer에서만 `N`은 최초 import 때 파일을 찾는 `sourceKey`로 필수다. 붙여넣기·AI 등 다른 경로의 이미지 지시문에서는 번호를 선택적으로 둔다. 가져오는 즉시 앱은 독립적인 안정 `blockId`와 `assetId` 연결을 부여한다. 편집기 안에서는 blockId로 연결하므로 이동·삽입·삭제가 기존 파일/이미지 연결을 바꾸지 않는다.
- Markdown 편집 표현은 사용자가 제공한 marker 번호가 있으면 보존하고, 번호가 없는 marker도 그대로 표현할 수 있어야 한다. 번호 없는 marker를 폴더 importer에 적용할 때는 파일 자동 매핑이 불가능하므로 명시적인 오류/매핑 안내를 제공한다. 삭제 뒤 번호 공백은 허용한다. ID metadata 추가 여부/표기는 prototype에서 실제 parser round-trip을 검증한 뒤 정한다.
- 외부 편집기에서 붙여넣기 원고에 이미지 위치/생성 지시를 표시할 사용자 문법 후보는 다음과 같다. 번호는 생략 가능하며, 폴더 importer에서 파일 매핑이 필요할 때만 `IMAGE_N` 번호를 요구한다.
  ```text
  [[IMAGE
  title: <title>
  prompt: <prompt>
  ]]
  ```
  폴더 파일 매핑 형식은 `[[IMAGE_N ...]]`로 유지한다. 붙여넣기 importer가 번호 없는 marker를 인식하고, 폴더 importer가 번호를 sourceKey로 해석하는 것을 Stage 1 paste 및 Stage 3 folder 검증에 각각 포함한다. 이 문법은 아직 구현/계약 테스트 완료 전의 합의된 설계 메모다.
- 이미지 실제 파일은 directive에 넣지 않는다. asset manifest가 `blockId → assetId`를 관리한다. 사용자가 Markdown에서 이미지 directive를 삭제하면 그 block을 제거할지, asset을 미연결 상태로 보존할지 동작을 정의하고 테스트한다.
- AI 글쓰기 prompt, 이미지 계획 prompt, 출력 validator, paste/folder importer, preview parser, WordPress/Naver serializer, writing-profile 예시와 테스트 fixture는 하나의 공통 image-block contract를 사용하도록 함께 갱신한다. 새 문법 전환을 parser 한 곳 수정으로 끝난 것으로 간주하지 않는다. 카드뉴스의 `image_prompt`처럼 별도 구조화 필드는 manuscript marker 변경 대상이 아니다.
- 요청 이미지 개수는 기존처럼 plan의 expected count다. AI 최초 출력 검증은 marker 개수와 필수 title/prompt를 확인한다. 폴더 import에서는 sourceKey의 누락·중복·파일 매칭 실패를 검증한다. 붙여넣기/AI 경로에서는 marker 순번이 필수가 아니며, 편집 후 canonical 문서는 marker의 현재 본문 순서와 무관하게 manifest의 stable blockId/assetId 연결을 사용한다.
- **중요 위험:** Tiptap 공식 Markdown extension은 공식 문서상 Beta이며, 일반 Markdown 외의 사용자 문법은 custom tokenizer/parse/serialize 구현이 필요하다. 전체 원고의 무손실 round-trip은 보장하지 않는다. 사용자는 우선 충실한 기본 편집 흐름을 원하므로, unsupported 구문에 대한 변환 가드/안내는 후속으로 미룬다. 사용자 원고를 실제로 검증하는 단계에서 문법 지원 범위와 보존 정책을 별도 결정한다.

### Service boundaries

- `ManuscriptDraftService`: 생성/편집/저장/revision/원본 snapshot 수명주기의 유일한 쓰기 경계
- `ManuscriptEditorAdapter`: canonical document ↔ Tiptap editor state와 Markdown import/export
- `ManuscriptImageService`: prompt 생성, 사용자 파일 연결/교체, 제외/복원 및 asset 수명 관리
- `ManuscriptPreviewRenderer`: canonical document와 같은 revision의 보기 결과 생성
- `PublishingAdapter`: 플랫폼별 제약검사와 payload 직렬화. 편집기 UI에 플랫폼별 예외를 하드코딩하지 않음
- `SourceImportAdapter`: AI, 폴더, paste의 최초 원고/source snapshot 전달만 담당

## 제안 개발 단계와 완료 기준

### Stage 0 — 설계 승인 및 기술 위험 prototype (완료)

- 위 wireflow, document/image 계약, Markdown syntax 후보, 플랫폼 경계, 비범위를 리뷰하고 사용자 승인 받기.
- prototype에서 Tiptap Vanilla JS custom image node view 안의 이미지 작업 control, Markdown custom block parse/serialize, 한글 IME, undo/redo, list/link/bold/heading round-trip, draft service 호출, 번들 크기/빌드 영향을 확인.
- Tiptap 공식 Markdown extension Beta와 수동 serializer 대안을 비교한다. round-trip이 불충분하면 Markdown 편집 mode를 raw source editor + validation으로 유지하거나 적용 대상을 좁히는 안을 제안하고, 승인 없이 데이터를 덮어쓰는 방식은 금지.
- 완료 현황: 별도 prototype page에서 기존 순번 marker import, fixture 파일 매핑, stable block ID, reorder 후 identity 유지, prompt Markdown 왕복, 한글 텍스트 입력을 자동 브라우저 테스트로 확인했다. Build 및 focused test 통과.
- 미검증/미완료: OS native IME composition, 실제 앱 Draft service 연동, undo/redo, 굵게/링크/heading/list를 포함한 전체 Markdown 왕복, 실제 image node view에서 생성·교체 UX와 번들 영향을 검증하지 않았다. 따라서 Stage 0은 초기 핵심 위험을 좁힌 prototype 완료이지, production 편집기 계약 전체 승인 완료를 뜻하지 않는다.
- 사용자 확인: 열린 prototype에서 한글 IME를 직접 입력하고 marker/file mapping을 확인한 후 Stage 1 착수를 결정한다.

### Stage 1 — Paste 경로 공통 workspace, 3가지 원고 모드

- 붙여넣기 입력만 우선 연결하되, UI와 service API는 source-specific하지 않은 공통 모듈.
- 블록 편집/Markdown 편집/보기, 제목·지원 서식 편집, inline 이미지 placeholder/asset 보기, 세션 내 autosave를 구현.
- unsupported Markdown 변환 가드는 Stage 1에서 구현하지 않고 원고 편집 범위가 검증될 때 설계한다.
- 완료: paste 원고가 블록 순서/지원 서식/이미지를 유지하며 모드 전환되고 저장·보기·발행 입력이 같은 revision 사용. 저장 오류/revision 충돌/undo-redo 테스트 통과.

### Stage 2 — 이미지 제작·관리 경험 (진행 중)

- 이미지 directive의 안정 ID를 원고 블록과 이미지 슬롯에 연결한다. 블록 순서를 바꿔도 같은 asset이 같은 이미지 블록을 따라야 한다.
- 블록 편집에서는 기존 생성/파일 선택 흐름을 재사용해 AI 생성, 로컬 이미지 선택·교체, 이미지 연결 제거, 이미지 블록 추가·이동·삭제를 제공한다. Markdown 모드는 directive 원문 편집을 유지하고, 보기는 연결된 이미지를 표시한다.
- 이미지 UI는 공유 media renderer로 모듈화해 본문 블록과 기존 하단 이미지 관리 영역이 함께 사용한다. 현재 하단 영역은 병행 검증을 위해 유지하며, inline UX가 안정화되고 사용자 확인을 받은 뒤 제거 여부를 결정한다.
- `이미지 제거`는 이미지 asset 연결만 해제하고 directive의 제목·prompt는 남긴다. `이미지 블록 삭제`는 directive 자체를 원고에서 제거한다. 별도의 “발행에서만 제외” 기능은 이번 inline UX에 추가하지 않는다.
- manifest 저장이 성공한 뒤 앱이 소유한(generated/user) 미참조 asset만 정리한다. 원고 폴더에서 온 원본 파일은 자동 삭제하지 않는다.
- 완료: 생성/선택/교체/연결 제거/블록 추가·이동·삭제 및 상태 UI를 focused/browser 테스트로 검증하고, 기존 하단 영역과 동일한 asset·revision 상태를 확인한다. 하단 영역 제거는 안정화 후 별도 결정으로 둔다.

### Stage 3 — AI·Folder source 통합과 원본 보호

- AI와 폴더도 paste와 같은 workspace에 연결. importer 외의 UX를 복제하지 않는다.
- 완료: 세 입력 경로에서 동일 동작/검증, 폴더 원본과 초기 snapshot 불변, 이미지와 편집본만 app workspace에서 변경.

### Stage 4 — 플랫폼 발행 검증 및 hardening

- WordPress/Naver adapter가 canonical document의 같은 revision을 받아 변환·검증하고 미지원 서식/이미지 상태를 감지한다.
- 구체적인 네이버 처리 UX는 별도 합의 후 구현하며, 조용한 서식 삭제는 허용하지 않는다.
- 완료: 보기와 각 플랫폼 최종 발행 payload 차이를 계약 테스트로 확인, 미지원 항목 사용자 안내, publish 중복 방지/실패 보존, focused UI/browser 테스트 완료.

모든 stage의 자동화 게이트를 통과한 뒤 사용자가 화면을 직접 확인한다. 앱 재시작 후 원고 재개는 별도 backlog 항목이다.

## 사용자 검토가 필요한 제안 선택지

아래는 기본 추천안이며, 반대가 없으면 Stage 0 prototype에서 검증한다.

1. **하단 이미지 영역:** inline 이미지 UX 안정화 전에는 기존 영역을 유지한다. 양쪽을 같은 shared media component/서비스에 연결해 중복 구현을 피하고, 안정화 후 제거 또는 보조 패널화 여부를 결정한다.
2. **이미지 생성 접근:** 1차는 블록 편집 안에서 생성·선택·교체한다. Markdown mode는 directive 원문 편집에 집중하고, 보기 모드는 연결된 이미지/placeholder를 표시한다.
3. **문서 모델:** editor JSON 직접 영속화가 아니라 app-owned canonical block schema + 별도 asset manifest를 두고 Tiptap은 adapter로 사용한다. Markdown의 실질 round-trip은 prototype으로 확인 후 gate를 통과해야 노출한다.

논의가 특히 필요한 제품 결정은 3번의 Markdown mode에서 미지원 구문 발견 시 정책이다. 추천은 **원문을 보존하고 저장을 막거나 명시적 변환 확인을 받는 것**이다. 조용히 손실시키는 정책은 피한다. 기술 prototype이 정확한 한계를 보여준 뒤 확정한다.

## 주요 위험과 대응

- Tiptap Markdown extension의 Beta/변환 edge case: 공통 editor 채택과 Markdown mode 채택을 분리하고, parser round-trip fixture 및 원문 보존 gate를 둔다.
- `[[IMAGE_N ...]]` 번호는 폴더 source 파일 매핑에만 필수다. 다른 입력 경로에서는 선택 사항이며, 내부 identity는 stable blockId/assetId로 관리한다. 문법 전환은 producer/parser/validator/renderer/publisher fixture와 폴더명 `NN_...` 매핑 테스트를 함께 확인한다.
- 에디터 기능과 플랫폼 발행 지원 불일치: 최소 toolbar와 제한 schema, 발행 adapter 검사로 통제한다. 미지원 기능의 자동 제거는 금지한다.
- editor state와 asset state 비동기 경합: blockId/assetId 및 revision을 모든 이미지 mutation에 전달하고 stale response를 거부한다.
- 큰 원고/이미지 다수의 작업공간 성능: 접힌 보조 이미지 관리자, 썸네일 lazy loading, 본문에서만 필요 자산 로딩을 고려한다.
- 기존 세 경로로 인한 회귀: paste → AI → folder 순으로 같은 browser smoke flow를 추가하고 source별 초기화만 fixture 차이를 둔다.

## 진행 상황과 검증

- Tiptap custom toolbar와 Milkdown Crepe를 비교하는 prototype을 확인했다. 사용자는 Tiptap을 우선 후보로 선택했다.
- 현재 비교 sub-branch 변경은 `codex/manuscript-workspace-editor`에 commit `cefff418`로 fast-forward 반영됐고 sub-branch는 요청에 따라 삭제됐다.
- 본 제품 코드는 아직 변경하지 않았다. Stage 0은 `prototypes/manuscript-editor/stage0.html` 독립 prototype이며, 검사 스크립트는 `scripts/test-manuscript-editor-stage0.js`이다.
- `npm run test:editor-stage0`와 prototype Vite build를 통과했다. Playwright 한글 입력 검사는 통과했으나 OS native IME 조합 입력은 사용자 hands-on 확인이 남아 있다. 빌드는 기존 비교 페이지와 prototype을 함께 묶으므로 경고가 나타난 chunk 크기를 제품 번들 크기로 해석하지 않는다.

## 다음 단계

Stage 1 하위 브랜치 `codex/feat/manuscript-paste-workspace`에서 붙여넣기 경로의 Tiptap 블록 편집/보기, Draft revision 갱신, 번호 없는 이미지 지시문 인식과 폴더 번호 필수 검증을 구현했다. 관련 focused tests와 browser smoke는 통과했고 실제 OS IME 및 사용자 UI 확인이 남아 있다. 전체 unit suite는 parent feature를 dev에 병합하기 전 승인 후 실행한다. 상세 진행은 [Stage 1 개발 기록](2026-09-28-manuscript-paste-workspace-development.md)을 참조한다.

이미지 UX 후속 구현: paste 블록 편집기에 stable-ID 기반 이미지 title/prompt 편집, AI 생성, 로컬 이미지 선택·교체, 이미지 연결 제거, 블록 추가·이동·삭제를 연결했다. Inline block과 기존 하단 이미지 관리 영역은 shared media renderer를 사용하며, 하단 영역은 아직 유지한다. 이미지 연결 제거는 directive/prompt를 남기고, block 삭제는 directive를 없앤다. manifest 저장 후 app-owned 미참조 asset만 정리하고 folder 원본은 자동 삭제하지 않는다. 60 focused tests, editor bundle build, browser smoke (511 fixture requests) 및 diff 검사가 통과했다. 사용자 hands-on 시각 확인은 남았고, 하단 영역 제거는 inline UX 안정화 뒤 별도 결정한다. 상세 진행은 [Stage 1/이미지 UX 개발 기록](2026-09-28-manuscript-paste-workspace-development.md)을 참조한다.

추가 이미지 UX 개선: 인라인 생성 상태/진행 표시와 카드뉴스·기존 이미지 카드와 일치하는 2단계 중지 확인, hover/focus 기반 미디어 액션, 이동/블록 삭제의 별도 위계를 적용했다. 편집 중 최신 prompt 저장을 확인한 뒤에만 AI 생성 요청을 보내도록 순서를 보장했다. 공통 실행 잠금의 inline 중지/계속 버튼 예외 등록까지 연결했다. 60 focused tests, editor bundle build, `git diff --check`, `node --check`, browser smoke (522 fixture requests; 0 page/console errors)가 통과했다. AI/폴더 경로는 현재 서비스가 본문 수정을 paste source에만 허용하므로 UI 연결을 복제하기 전에 source별 편집 저장 경계와 folder 원본 보호를 설계해야 한다. 상세 내용과 테스트 결과는 Stage 1 하위 기록을 참조한다.
