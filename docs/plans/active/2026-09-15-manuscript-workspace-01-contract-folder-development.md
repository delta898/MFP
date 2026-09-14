# Manuscript Workspace Stage 01: Contract and Folder Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace-01-contract-folder`
- Base/parent branch: `codex/feat/manuscript-workspace`
- Start date: 2026-09-15
- Status: implementation complete; focused and browser verification passed; full unit gate and user acceptance pending

## User Need

원고 폴더의 `contents.md`와 일부 존재하거나 누락된 이미지들을 하나의 편집 가능한 작업 상태로 가져오고,
사용자가 각 이미지 영역을 AI로 생성하거나 로컬 파일로 교체·제외·복원하면서 같은 미리보기를 확인한 뒤
그 상태 그대로 발행할 수 있어야 한다.

## Goal

후속 원고 붙여넣기, 바로 생성과 쇼핑커넥트가 재사용할 provider-neutral Draft/Image Asset 계약을 먼저 만들고,
원고 폴더를 첫 source adapter와 UI consumer로 연결한다.

## Scope

- canonical Draft session, revision, content/image-slot와 asset metadata 계약
- private managed workspace와 folder import
- Draft 조회, image AI generation, local image import, exclude와 restore mutation
- revision conflict, validation, structured error와 lifecycle-safe cleanup 기반
- Blog Beta 원고 폴더 미리보기와 이미지 작업 UI
- 현재 원고 폴더 publish settings를 보존하면서 exact Draft revision 발행
- focused unit, service/API, UI contract와 relevant browser verification

## Explicit Non-goals

- 원고 붙여넣기와 바로 생성의 공통 Draft 전환
- Markdown text editor 또는 image block 추가·이동·완전 삭제
- 쇼핑커넥트 UI 연동
- 기존 Blog 화면 변경
- 실제 유료 image provider를 호출하는 자동 테스트

## Proposed Design

1. `src/content` 또는 더 적합한 공통 domain 경계에 Draft 계약과 repository/service를 둔다.
2. folder adapter는 브라우저가 제공한 파일을 검증해 private Draft workspace로 한 번 가져온다.
3. image slot은 stable ID, prompt, current/original asset reference와 origin을 갖는다.
4. mutation은 expected revision을 요구하고 성공 시 revision을 증가시킨다.
5. local import와 AI replacement는 새 asset을 완전히 준비한 다음 manifest를 원자적으로 갱신한다.
6. publish는 `draft_id + revision`으로 snapshot을 고정하며 preview와 같은 resolved content를 사용한다.
7. UI는 Card News의 slot별 action, honest progress, confirmation과 failure-preserving interaction을 따른다.

## Decisions and Tradeoffs

- 원본 folder와 source files는 read-only이며 Draft workspace가 편집용 복사본을 소유한다.
- `원고에서 제거`는 원본 파일이나 block을 없애지 않고 현재 asset만 detach한다. 파일 삭제로 오해할 수 있는
  `삭제`와 동작 범위가 모호한 `이미지 제외`는 사용자-facing 명칭으로 쓰지 않는다.
- `원래 이미지 복원`은 import 당시 folder asset로 되돌린다. 원본이 없는 slot에는 노출하지 않는다.
- AI 생성은 configured writing-image capability를 사용하고 prompt가 없는 slot은 생성 전에 actionable validation을
  반환한다.
- 공통 domain은 Blog destination이나 Shopping Connect 상품 규칙을 알지 않는다.

## Verification Plan

- existing local Markdown parser tests를 회귀 실행한다.
- Draft repository/service tests로 import, revision, replacement, exclude/restore와 failure preservation을 검증한다.
- corrupt/unsupported/oversized local image와 path traversal을 검증한다.
- image provider double로 single/missing generation과 partial failure를 검증한다.
- API controller/route delegation과 payload limit/error contract를 검증한다.
- Blog Beta UI contract와 원고 폴더 browser smoke를 실행한다.
- stage merge 전 full unit suite는 사용자 승인을 다시 받아 실행한다.

## Progress

- 2026-09-15: stage branch created from the manuscript workspace parent branch.
- 2026-09-15: stage development record created before material implementation.
- 2026-09-15: added a provider-neutral Draft service with private workspace ingestion, stable image slots, revisions,
  structured conflicts and exact snapshot materialization for the existing publisher.
- 2026-09-15: folder import copies supported images into the managed workspace, retains an independent original copy for
  restore, and never writes back to the selected source folder.
- 2026-09-15: added content-signature and size validation, bounded aggregate folder ingestion, safe generated/local asset
  replacement, no-store revision-specific preview URLs and failure preservation.
- 2026-09-15: connected create/read/settings/image/publish API routes and increased only the bounded folder-ingestion and
  per-image request limits needed for binary payloads.
- 2026-09-15: Blog Beta folder preview now shows every image slot and provides `AI 이미지 만들기/다시 만들기`, local
  selection/replacement, exclude, restore and fill-missing controls. The preview and publish button update from the same
  revision, and image work disables competing publication.
- 2026-09-15: the first browser run found that `aria-busy` remained on the image list after a mutation and kept intercepting
  later pointer actions. The finalizer now removes the state before re-rendering; the complete browser flow passed afterward.
- 2026-09-15: hands-on review exposed a broken first image and ineffective replacement for real manuscripts that number
  slots from `IMAGE_0`. The slot validator incorrectly accepted only positive indexes while the established Markdown contract
  is zero-based. It now accepts zero, and domain/browser regressions use `IMAGE_0` explicitly.
- 2026-09-15: aligned present and missing image cards around the same fixed media frame, prompt and centered action area.
  Failed browser image loads now become an actionable placeholder instead of a broken-image glyph.
- 2026-09-15: renamed the ambiguous `이미지 제외` action to `원고에서 제거` and explains that the source file is retained.
- 2026-09-15: hands-on Card News comparison established the shared visual grammar: numbered media surface, centered actions
  for an empty slot, hover/focus actions over an existing image, title below the media, and a collapsible prompt with copy.
  Existing-image actions are `AI 재생성`, `이미지 교체`, and `원고에서 제거`; restore remains a secondary empty-state action.
- 2026-09-15: hardened the browser image-error path so it replaces only the failed `<img>` with a placeholder. The card's
  sequence, prompt, and recovery controls remain mounted and become immediately available after a load failure.
- 2026-09-15: prompt copy now resolves the owning manuscript input type instead of assuming folder input, preserving reuse
  when paste and direct-generation adapters adopt the same card renderer in later stages.
- 2026-09-15: aligned the existing-image label exactly with Card News as `AI 재생성`. Added card-width-aware compact action
  spacing and type so all three labels remain readable when a responsive grid makes an individual card narrow.

## Automated Verification

- 75 focused domain, legacy parser/workspace, API controller/route/service, Blog Beta UI and continuous-publishing contract
  tests passed, including zero-index image lookup and replacement.
- JavaScript syntax checks and `git diff --check` passed.
- A post-review focused recheck passed all 30 selected Draft domain and Blog Beta UI contract tests.
- `npm run test:ui-browser` passed after the review correction with 337 fixture requests. The exercised zero-based folder flow
  covered import, two-slot preview, local replacement, remove, restore, AI replacement confirmation and exact revision
  publication without external calls.
- Full unit suite remains pending explicit user approval before parent merge.

## Manual Checks Still Required

- Select a real folder containing `contents.md`, a mix of present/missing images and valid prompts.
- Confirm each slot's AI generation and local replacement with the configured real image provider.
- Confirm exclude/restore and final Naver/WordPress draft publication match the preview.
- Confirm large/corrupt image guidance is understandable. No production publish should be performed without explicit intent.

## Current Result

Stage 01 is implemented on its sub-feature branch. The folder path now uses the shared Draft/Image Asset boundary and
provides the agreed image workspace while preserving the existing publishing engine behind an exact revision snapshot.

## Remaining Risks

- The current transport copies the selected folder into the Draft through one bounded JSON request. It avoids repeated
  preview transfers but still incurs base64 overhead during initial ingestion; a streaming/multipart transport is a future
  optimization if larger manuscripts become necessary.
- Draft retention and orphan cleanup remain assigned to the parent integration stage so active/retryable publication assets
  are not removed prematurely.
- Real providers can fail after accepting an image request. Existing assets are preserved, but real-provider UI acceptance
  remains necessary.
