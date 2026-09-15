# Manuscript Workspace Stage 03: Direct AI Adapter Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace-03-ai`
- Base/parent branch: `codex/feat/manuscript-workspace`
- Start date: 2026-09-15
- Status: complete; focused, browser, and full unit verification passed; ready for parent integration

## User Need

`바로 생성`으로 만든 글도 원고 폴더와 원고 붙여넣기처럼 같은 미리보기와 이미지 작업공간에서 보완한 뒤
발행할 수 있어야 한다. 입력 방식에 따라 이미지 생성·교체·제외, 미완성 이미지 안전 정책 또는 발행 동작을
다시 학습하게 해서는 안 된다.

## Goal

기존 AI 생성 결과와 target별 preview session을 canonical Draft로 변환하고, 공통 이미지 카드와
exact-revision publish 경로를 사용하도록 Blog Beta의 `바로 생성` 흐름을 연결한다.

## Scope

- 기존 바로 생성 요청·응답·preview session과 Naver/WordPress 결과 구조 조사
- AI 생성 결과를 canonical Draft로 가져오는 source adapter와 API
- Blog Beta 바로 생성 상태를 Draft ID/revision 기반 공통 작업공간에 연결
- 모든 글쓰기 화면의 Naver/WordPress 발행 대상을 단일 선택으로 통일하고, 신규 실행 경계에서 정확히 한 대상을 요구
- 공통 AI 이미지 생성, 로컬 이미지 선택, 제외·복원과 미완성 이미지 안전 정책 적용
- canonical Draft에서 선택한 발행 대상별 projection과 exact-revision publish 유지
- 생성 또는 Draft 전환 실패 시 마지막 정상 결과 보존과 재시도 가능 상태
- focused domain/API/UI tests와 relevant browser smoke

## Explicit Non-goals

- 제목·본문 편집 UI 또는 rich text editor
- 이미지 block 추가·이동·완전 삭제
- 쇼핑커넥트 실제 연결
- 제목·본문 편집과 무관한 기존 Blog 화면 개편
- 실제 유료 AI 호출 또는 production 발행 테스트
- Draft session cleanup 및 orphan asset 정리(Stage 05)
- 버전 bump, release, parent/dev merge, push

## Proposed Design

1. AI 생성 자체는 기존 검증된 generation 경계를 유지하고, 성공 결과를 source adapter에서 canonical Markdown과
   image slots로 정규화한다.
2. 생성 결과의 Naver/WordPress 차이는 Draft domain에 복제하지 않고 publish projection 경계에 남긴다.
3. UI는 생성 중 상태만 source adapter가 소유하고, 생성 완료 뒤에는 folder/paste와 같은 Draft renderer와
   mutation/publish endpoint를 사용한다.
4. AI 또는 Draft 전환 실패는 이전 정상 Draft·preview를 지우지 않으며 중복 실행을 막고 원인을 표시한다.
5. 사용자가 확인한 Draft revision만 발행하며, 미완성인 발행 대상 slot은 자동으로 임시 저장 정책과 동기화한다.
6. 저장 계약은 호환성을 위해 `platforms: string[]`을 유지하되 신규 작성·발행은 배열 원소를 정확히 하나로 제한한다.
   기존 다중 대상 글감은 임의로 하나를 고르지 않고 편집 화면에서 사용자가 명시적으로 해소하도록 한다.

## Implementation Stages

1. 기존 direct-generation data flow와 target projection 계약 확정
2. AI-result Draft adapter와 API/service tests
3. Blog Beta 공통 renderer·image actions·publish path 연결
4. focused verification와 browser fixture flow
5. 사용자 확인 후 full unit merge gate

## Verification Plan

- AI result normalization, revision snapshot, target projection과 validation unit tests
- service/controller/route delegation과 invalid input tests
- UI contract: generation success → common Draft workspace, failure preservation, exact revision publish
- browser fixture: 바로 생성 → Draft preview → image mutation → safety sync → target publish
- 완료된 하위 stage의 부모 merge 전 사용자 승인 후 full unit suite

## Progress

- 2026-09-15: user approved starting direct AI generation integration after Stage 02 was merged into the parent branch.
- 2026-09-15: created the dedicated Stage 03 branch and development record before material implementation.
- 2026-09-15: existing direct generation was confirmed to invoke generation per platform. The user chose the simpler
  product rule “one manuscript, one platform”, so all writing target controls were changed to radios while persisted
  arrays remain compatible.
- 2026-09-15: added a generation-only quick-publish mode that reuses existing validation and generation but skips Topics
  Sheet writes, recommendation save events, dedupe persistence and publication. Its successful output is imported into
  the canonical Draft with generated originals retained for restore.
- 2026-09-15: connected direct AI writing to the shared preview, image actions, missing-image Draft safety and
  exact-revision publish flow. Changing source inputs or platform after generation keeps the last preview but requires
  regeneration before publishing.
- 2026-09-15: enforced one target at Draft, quick/local/shopping publishing, topic capture/execution, internal request and
  MCP schema boundaries. Historical multi-target queue rows require explicit editing rather than silent selection.
- 2026-09-15: focused backend tests passed (64/64), focused UI contracts passed (93/93), and the browser fixture smoke
  passed with the direct AI Draft flow included. No paid AI or real publication was invoked.
- 2026-09-15: the full unit merge gate initially exposed the UI module size limit and one obsolete multi-target fixture.
  The AI execution state was separated into a bounded module and the fixture was aligned with the approved single-target
  contract. A sandbox-only local listen restriction was confirmed separately; the authorized final run passed with
  1,798 tests, 1,797 passed, 1 intentionally skipped, and 0 failed.
- 2026-09-15: browser smoke passed again after the module split (339 fixture requests), confirming the composed script
  order and direct AI Draft interaction remained intact.

## Current Result

Direct AI writing now generates exactly one platform manuscript, imports it into the same canonical Draft/Image Slot
workspace as folder and paste sources, and publishes only the reviewed revision. All writing target selectors are
exclusive radio choices; API/runtime boundaries also reject missing or legacy multi-target publication requests.

The implementation is ready to commit and fast-forward into the parent feature branch.

## Remaining Risks

- The generation-only flow retains the existing transient quick-preview workspace until Stage 05 cleanup is implemented.
- Historical multi-target rows remain readable but cannot execute until the user selects and saves one platform.
- Final visual and exploratory acceptance on the user's app remains pending.
