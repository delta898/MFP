# Manuscript Workspace Stage 02: Paste Adapter Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace-02-paste`
- Base/parent branch: `codex/feat/manuscript-workspace`
- Start date: 2026-09-15
- Status: implementation complete; focused and browser verification passed; user acceptance and full unit gate pending

## User Need

붙여넣은 Markdown도 원고 폴더와 같은 미리보기·이미지 작업·안전한 발행 경험을 제공해야 한다. 사용자는
입력 방식이 바뀌어도 이미지 생성, 로컬 이미지 선택, 제외·복원 가능 여부와 임시 저장 안전 정책을 다시
학습하지 않아야 한다.

## Goal

기존 `local-markdown` paste 전용 preview/publish 경로를 Stage 01의 canonical Draft/Image Slot 계약에 연결하고,
원고 폴더와 동일한 공통 UI renderer와 exact-revision publish 경로를 사용한다.

## Scope

- Markdown text로 canonical Draft를 만드는 paste source adapter와 API
- paste 입력 변경 시 Draft revision과 canonical Markdown 동기화
- 기존 공통 이미지 카드에서 AI 생성, 로컬 선택, 제외 동작 활성화
- paste에는 원본 이미지가 없으므로 restore는 원본 asset이 생긴 경우에만 노출
- 미완성/의도적 제외 slot의 공통 Draft 안전 정책 재사용
- exact Draft revision preview/publish와 실패 시 마지막 정상 상태 보존
- focused domain/API/UI tests와 relevant browser smoke

## Explicit Non-goals

- 별도 제목·본문 편집 UI 또는 rich text editor
- 바로 생성 결과의 Draft 전환
- 이미지 block 추가·이동·완전 삭제
- 쇼핑커넥트 연결
- 기존 Blog 화면 변경
- 실제 유료 AI 호출 또는 production 발행 테스트

## Proposed Design

1. Draft service에 source-neutral Markdown 생성/갱신 경계를 추가하고 folder adapter도 같은 내부 생성기를 재사용한다.
2. paste 입력은 debounce preview 시 새 Draft를 계속 만들지 않고, 현재 Draft의 expected revision으로 Markdown을 갱신한다.
3. Markdown 구조가 바뀌면 stable slot identity를 다시 계산하되, 동일 slot에는 사용자가 선택·생성한 managed asset과
   제외 상태를 가능한 한 보존한다.
4. paste UI는 folder 전용 분기를 제거하고 동일 이미지 카드 동작과 publish endpoint를 사용한다.
5. 입력 초기화는 화면 상태뿐 아니라 현재 paste Draft 연결도 해제한다. managed Draft 정리는 parent integration의
   lifecycle 정책이 담당한다.

## Decisions and Tradeoffs

- 현재 textarea는 source input이며 이번 단계의 본문 편집기로 확장하지 않는다. 제목/본문 편집은 세 adapter 통합 후
  Stage 04에서 canonical revision 편집으로 제공한다.
- paste는 로컬 이미지 파일을 함께 입력하지 않으므로 missing slot이 기본이다. 사용자는 AI 생성, 내 이미지 선택,
  또는 `사용 안 함`으로 의도를 명시한다.
- 입력 중 매 keystroke마다 새 Draft를 만들지 않고 debounce와 revision update를 사용한다.
- 외부 실패가 발생해도 마지막 정상 preview와 image assets를 지우지 않는다.

## Implementation Stages

1. domain contract: Markdown Draft 생성/갱신과 slot-state 보존
2. API service/controller/routes와 request limits
3. Blog Beta paste UI를 공통 Draft/image/publish path로 연결
4. focused verification와 browser fixture flow
5. 사용자 확인 후 full unit merge gate

## Verification Plan

- Markdown create/update, revision conflict, retained/replaced/excluded slot tests
- service/controller/route delegation과 validation tests
- paste UI contract: 공통 카드 action, Draft safety sync, exact revision publish
- browser fixture: paste → missing slot → local/AI replacement/exclude → preview → Draft publish
- 완료된 하위 stage의 부모 merge 전 사용자 승인 후 full unit suite

## Progress

- 2026-09-15: Stage 01 was merged into the parent feature branch after full unit verification.
- 2026-09-15: user approved starting the paste adapter stage and deferred title/body editing until all three source adapters
  use the common workspace.
- 2026-09-15: created this sub-feature branch and development record before material implementation.
- 2026-09-15: added a paste Draft adapter and Markdown revision mutation. Folder and paste now share internal settings,
  image-slot, exact preview, and publish snapshot contracts.
- 2026-09-15: Markdown updates preserve generated/user-selected assets and intentional exclusion for matching slot indexes,
  while refreshed prompt/title content comes from the newest Markdown revision.
- 2026-09-15: activated the existing common image card renderer and all relevant image actions for paste. Restore remains
  contextual: an intentionally excluded slot can be included again, while a missing paste slot has no false original asset.
- 2026-09-15: replaced paste-only preview/publish requests in Blog Beta with Draft create/update and exact-revision publish.
  The legacy server endpoints remain available for compatibility but this UI no longer depends on them.
- 2026-09-15: added a preview synchronization failure guard. A failed update preserves the last valid preview and assets but
  disables publishing until the current pasted input has a successful canonical revision.
- 2026-09-15: clearing via the recoverable Clear action retains the Draft for Undo. Typing a different manuscript after that
  clear, or manually emptying the textarea, starts a fresh Draft connection so old images do not leak into a new manuscript.
- 2026-09-15: the first browser run exposed an ambiguous shared-card locator after paste gained the same controls as folder;
  the fixture was scoped to the paste panel. A later run exposed transient toasts intercepting a much later unrelated fixture
  action, so the completed paste slice now clears its own test notifications before continuing.
- 2026-09-15: hands-on review found that different image-title lengths shifted the `사용 안 함` action vertically. The
  shared card now reserves a consistent two-line title area, clamps longer titles to two lines, and exposes the full title on
  hover so utility actions align across a row without losing access to the original text.

## Automated Verification

- JavaScript syntax checks and `git diff --check` passed.
- 87 focused Draft domain, controller/route/service/runtime, Blog Beta UI, publishing, and Card News regression tests passed.
- `npm run test:ui-browser` passed with 343 fixture requests. The exercised paste flow covers Draft creation, recoverable
  clear/undo, missing-image Draft safety, local image import, exclusion, restore, preview synchronization, exact revision
  publication, and the existing folder flow without external AI or publishing calls.
- Full unit suite remains pending explicit user approval before parent merge.

## Current Result

Stage 02 is implemented on its sub-feature branch. Pasted Markdown now enters the same Draft/Image Slot workspace as folder
input and uses the same image controls, safety policy, and exact-revision publication path.

## Remaining Risks

- Slot identity is index-based in this stage. Reordering image blocks can therefore intentionally associate the retained asset
  with the new block at that index; structural block editing remains deferred to Stage 04.
- Real image-provider generation still needs the user's hands-on check; automated verification uses fixtures only.
- Draft retention and orphan cleanup remain assigned to the parent integration stage.
