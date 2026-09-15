# Unified Manuscript Workspace Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace`
- Base/parent branch: `dev`
- Start date: 2026-09-15
- Status: active; Stages 01-02 complete; Stages 03-05 pending

## User Need

Blog Beta의 빠른 글 작성은 `바로 생성`, `원고 폴더`, `원고 붙여넣기`마다 미리보기와 발행 흐름이
서로 다르다. 사용자는 입력 방식과 관계없이 완성된 원고의 본문과 이미지 상태를 한곳에서 확인하고,
각 이미지 영역을 AI로 생성하거나 로컬 이미지로 교체한 뒤, 확인한 그대로 발행할 수 있어야 한다.

## Goal

세 입력 방식을 source adapter로 제한하고 이후 흐름을 하나의 원고 작업공간으로 통합한다.

1. 입력 소스를 canonical Draft로 변환한다.
2. 이미지 영역별로 AI 생성, 로컬 이미지 선택, 교체, 제외와 복원을 제공한다.
3. 모든 변경을 미리보기에 즉시 반영한다.
4. 사용자가 확인한 Draft revision과 실제 발행 revision이 일치하게 한다.
5. 이후 Markdown 텍스트 편집과 이미지 영역 추가·이동·삭제를 같은 구조 위에 제공한다.

## Scope

- Blog Beta (`view-blog-next`)의 빠른 글 작성 세 방식만 대상으로 한다.
- `원고 폴더 → 원고 붙여넣기 → 바로 생성` 순으로 공통 작업공간을 적용한다.
- Draft session, revision, image slot, asset와 validation 계약을 도입한다.
- 카드뉴스에서 검증한 per-slot AI 생성과 로컬 이미지 선택 경험을 재사용 가능한 capability로 정리한다.
- 폴더 원본과 사용자가 선택한 외부 파일은 직접 수정하거나 삭제하지 않는다.
- 이미지 작업 실패 시 기존 정상 이미지와 마지막 정상 미리보기를 보존한다.
- 자동 테스트는 provider double과 임시 workspace를 사용하고 유료 AI를 호출하지 않는다.
- Draft와 Image Asset 경계는 추후 쇼핑커넥트가 상품 원고·상품 이미지 source adapter로 재사용할 수 있게
  Blog 화면, Naver 발행 또는 특정 콘텐츠 종류에 종속되지 않게 설계한다.

## Explicit Non-goals

- 기존 `블로그` 화면의 UI 또는 발행 흐름 변경
- 이번 v0.5.0 범위에서 쇼핑커넥트 화면과 발행 흐름을 실제로 연동하는 작업
- 이미지 crop, filter, canvas, template 편집기
- 1차 이미지 단계에서 임의 문단 사이에 이미지 block을 새로 삽입하거나 이동하는 기능
- 폴더의 `contents.md`나 원본 이미지 덮어쓰기
- 공급자별 이미지 생성 로직을 UI나 Draft domain에 직접 결합
- 이 feature 작업 중 버전 bump, release, push 또는 배포

## Proposed Design

### Source adapters

- `folder`: `contents.md`와 폴더 이미지를 읽어 Draft로 가져온다.
- `paste`: 붙여넣은 Markdown을 Draft로 가져온다.
- `ai`: 생성 결과와 target별 preview session을 canonical Draft로 수렴한다.

Blog Beta adapter는 공통 Draft에 Blog 전용 source를 공급하는 첫 consumer다. 추후 쇼핑커넥트는 상품 정보,
제휴 disclosure, CTA와 상품 이미지를 자신의 adapter와 extension metadata로 제공하되 공통 Draft·asset·revision
계약을 재사용한다. 공통 domain은 쇼핑 provider, FTC 문구 또는 상품 API를 직접 알지 않는다.

### Canonical Draft

Draft는 최소한 다음 상태를 소유한다.

- `draft_id`, `revision`, source kind와 표시 정보
- canonical Markdown, title, derived content items
- stable image slots와 prompt
- slot별 current asset, original asset, asset origin, status
- validation 결과와 dirty/updated 상태
- 발행 대상별 설정 또는 projection 입력

Markdown을 본문의 source of truth로 두고 preview content는 파생한다. 이미지 asset은 stable slot ID로
연결하며 파일 이름 prefix를 편집 상태의 identity로 사용하지 않는다.

### Image workspace

각 이미지 slot은 다음 동작을 제공한다.

- 이미지가 없을 때 `AI 이미지 만들기` 또는 `내 이미지 선택`
- 이미지가 있을 때 `AI 다시 만들기` 또는 `이미지 교체`
- 현재 Draft에서 `이미지 제외`
- 가져올 당시의 이미지로 `원래 이미지 복원`
- 실제 생성에 사용되는 prompt 확인
- `빈 이미지 모두 만들기` bulk action

`이미지 제외`는 asset과 slot의 연결만 해제한다. 폴더 원본이나 외부 파일은 삭제하지 않고, 이미지 block과
prompt는 유지한다. block 자체의 추가·이동·삭제는 텍스트 편집 단계에서 제공한다.

사용자가 선택한 asset은 폴더 asset과 자동 생성 결과보다 우선한다. AI 또는 local replacement는 새 asset을
먼저 검증·저장하고 Draft revision을 원자적으로 바꾼 뒤 이전 managed asset을 정리한다. 실패 시 기존 asset을
유지한다.

### Reusable boundary

카드뉴스 service를 Blog에서 직접 호출하지 않는다. 이미지 provider 호출, local asset import, 형식·크기 검증,
안전한 교체와 정리를 공통 image asset capability로 추출하고 Card News와 Manuscript Draft가 각각 자신의 domain
state에 적용한다. UI 문법과 진행/확인 패턴도 기존 Card News 경험을 따른다.

### Preview and publish consistency

반복 preview 요청에 이미지 binary를 다시 싣지 않는다. local asset은 Draft workspace에 한 번 가져오고 안전한
preview URL로 조회한다. Publish는 원래 folder file 목록이나 붙여넣은 text를 다시 해석하지 않고
`draft_id + revision + publish settings`를 받아 그 snapshot을 발행한다. revision이 오래되었으면 발행 전에 충돌을
알린다.

### Session lifecycle

Draft와 managed assets는 앱 전용 private workspace에 둔다. 편집 또는 실패 상태에서는 복구할 수 있게 유지하고,
성공적으로 종료한 Draft, 만료된 Draft와 orphan asset은 명시적 정책에 따라 정리한다. 원본 source는 항상
read-only다.

## Implementation Stages

1. `01-contract-folder`
   - Draft/Image Asset domain과 API 계약
   - folder adapter와 원고 폴더 image workspace
   - exact-revision preview/publish path의 첫 구현
2. `02-paste`
   - paste adapter를 같은 Draft와 UI에 연결
   - local/AI image slot 작업과 실패 복구 일치
3. `03-ai`
   - 바로 생성 preview session을 공통 Draft 계약으로 수렴
   - canonical manuscript에서 Naver/WordPress publish projection 생성
4. `04-text-editing`
   - canonical Markdown 편집
   - 이미지 영역 추가·이동·완전 삭제와 derived preview 재계산
5. `05-integration`
   - session cleanup, recovery, logs, accessibility와 전체 회귀 안정화
   - v0.5.0 release 준비 전 최종 검증 자료 정리

각 stage는 부모에서 하위 feature branch를 만들고 독립 개발 기록, focused verification과 사용자 확인을 거친다.
완료된 stage는 사용자의 merge 요청 후 부모로 fast-forward merge하고 하위 branch를 정리한다.

### Stage records

- [Stage 01: Draft/Image Asset contract and folder workflow](../archive/2026-09-15-manuscript-workspace-01-contract-folder-development.md) — complete
- [Stage 02: Paste adapter](../archive/2026-09-15-manuscript-workspace-02-paste-development.md) — complete
- [Stage 03: Direct AI adapter](../archive/2026-09-15-manuscript-workspace-03-ai-development.md) — complete

## Decisions and Tradeoffs

- 세 화면에 비슷한 버튼을 복제하는 대신 source adapter와 공통 workspace를 분리한다.
- `삭제`의 기본 의미는 복구 가능한 이미지 제외다. 구조적인 block 삭제는 별도 편집 동작으로 둔다.
- 이미지 처리 방식은 초기/fallback 정책이고, 사용자의 slot별 선택이 최종 우선순위다.
- AI가 만든 Naver/WordPress 원고를 독립 편집하는 대신 하나의 canonical Draft를 우선한다. provider별 변환은
  발행 projection 경계에서 수행해 같은 글을 두 번 편집하는 문제를 피한다.
- Card News의 base64 local-image import 경험과 제한은 참고하되, 새 Draft API에서는 asset을 한 번만 가져오고
  preview마다 재전송하지 않는 계약을 우선한다.
- 쇼핑커넥트 확장을 위해 공통 Draft에는 provider별 상품 literal이나 발행 규칙을 넣지 않는다. 기능별 필수
  validation과 projection은 adapter/capability 경계에 남기고, 공통 workspace는 원고·asset·revision만 소유한다.
- 하나의 원고는 하나의 플랫폼에만 발행한다. UI는 radio로 통일하고 저장 배열은 호환성을 유지하되 정확히 한
  원소만 허용한다. 기존 다중 대상 데이터는 묵시적으로 축소하지 않고 사용자가 편집해 선택하도록 한다.

## Verification Strategy

- Draft, revision conflict, slot/asset resolution과 cleanup unit tests
- local image type/size/content validation과 atomic replacement tests
- AI generator double을 사용한 success, partial failure와 previous-asset preservation tests
- service/controller/route contract tests
- Blog Beta folder, paste, AI focused UI contract tests
- 각 사용자-visible stage 완료 시 관련 browser smoke 1회
- 각 하위 stage와 부모를 merge하기 전 사용자의 별도 승인을 받아 full unit suite 실행
- 사용자 hands-on 확인: 이미지 생성·선택·교체·제외·복원, 미리보기 일치와 실제 임시 발행

## Progress

- 2026-09-15: user approved the unified manuscript workspace direction and staged feature-branch development.
- 2026-09-15: user added per-image AI generation and local-image selection based on the Card News image workspace.
- 2026-09-15: confirmed that existing Card News safely copies local assets, replaces only after a new asset succeeds,
  preserves unaffected images on failure, and provides slot-level/bulk AI actions; these behaviors form the reuse baseline.
- 2026-09-15: parent branch created from `dev` after committing the unrelated AI provider backlog update separately.
- 2026-09-15: user identified Shopping Connect as the next planned consumer. Its integration is deferred, while the shared
  contracts must remain content-kind and publishing-provider neutral.
- 2026-09-15: Stage 01 branch and development record were created for the common contract and folder workflow.
- 2026-09-15: Stage 01 implemented the first reusable Draft/Image Asset vertical slice and folder image workspace. Focused
  tests and the full browser fixture flow passed.
- 2026-09-15: user accepted the Stage 01 behavior and deferred title/body editing until folder, paste, and direct-generation
  adapters are complete. The parent plan retains text editing as Stage 04.
- 2026-09-15: Stage 01 passed its full unit gate with 1,784 tests, 1,783 passed, 1 intentionally skipped, and 0 failed.
  The finalized stage record was archived for parent integration.
- 2026-09-15: Stage 02 began on a dedicated sub-feature branch to connect pasted Markdown to the common Draft/Image Slot
  workspace before direct AI generation is migrated.
- 2026-09-15: Stage 02 connected pasted Markdown to the common Draft/Image Slot workspace, including revision-safe updates,
  shared image actions, missing-image Draft safety, exact-revision publishing, and aligned card actions.
- 2026-09-15: Stage 02 passed focused tests, the browser fixture flow, and its full unit gate with 1,788 tests, 1,787 passed,
  1 intentionally skipped, and 0 failed. The user approved parent integration and deferred Draft cleanup to Stage 05.
- 2026-09-15: Stage 03 began on a dedicated sub-feature branch to converge direct AI generation results into the common
  Draft/Image Slot workspace.
- 2026-09-15: Stage 03 implemented single-platform direct AI generation, canonical Draft import, shared image workspace,
  exact-revision publishing and single-target enforcement across writing surfaces. Focused backend/UI contracts and the
  browser fixture smoke passed.
- 2026-09-15: Stage 03 passed its full unit merge gate with 1,798 tests, 1,797 passed, 1 intentionally skipped, and
  0 failed. The browser fixture smoke also passed after the final UI module split.

## Current Result

The parent is ready to receive the completed direct AI adapter and single-platform publishing rule. Text editing and
lifecycle integration remain pending.

## Remaining Risks

- The direct AI adapter still uses a transient generated preview directory before importing the canonical Draft; Stage 05
  must clean that intermediate workspace safely.
- Local image decoding must reject disguised or corrupt input based on content, not only filename or browser MIME.
- Draft cleanup must not remove assets still referenced by an active or retryable publication.
