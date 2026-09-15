# Manuscript Workspace Stage 05: Image Auto Resolution Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace-05-image-auto-resolution`
- Base/parent branch: `codex/feat/manuscript-workspace`
- Start date: 2026-09-15
- Status: complete; verified and ready for parent integration

## User Need

세 가지 빠른 글쓰기 방식의 이미지 작업공간은 정교한 수동 보정을 제공하지만, 사용자가 모든 빈 이미지를
일일이 생성하거나 선택해야만 공개 발행할 수 있어 기존 자동 생성의 편의성을 잃었다. 수동 작업은 필수가
아니라 선택적 보정이어야 하며, 프롬프트가 있는 빈 이미지는 포스팅할 때 자동으로 준비되어야 한다.

## Goal

- 원고 폴더, 원고 붙여넣기, 바로 생성에 하나의 이미지 자동 완성 정책을 적용한다.
- 준비된 이미지와 사용자가 제외한 슬롯은 그대로 존중한다.
- 프롬프트만 있는 발행 대상 슬롯은 포스팅 직전에 자동 생성한다.
- 자동 생성 후 미해결 프롬프트가 남은 공개·예약 요청만 임시 저장으로 안전 전환한다.
- 이미지와 프롬프트가 모두 없는 글은 이미지 없는 글로 정상 발행한다.

## Scope

- canonical Manuscript Draft의 비공개 이미지 상태와 발행 전 자동 완성 정책
- 공통 manuscript publish coordinator의 생성, 재검증, 실제 발행 상태 결정
- 자동 생성 성공분 보존과 실패 슬롯 재시도
- Blog Beta 세 입력 방식의 동일한 사용자 안내와 진행 상태
- UI 적용 순서: 원고 폴더 → 원고 붙여넣기 → 바로 생성

## Non-goals

- 사용자에게 내부 슬롯 상태나 별도 자동 생성 설정 노출
- 제목·본문 편집
- 원고 자동 저장·복원과 수명주기 정리
- 기존 블로그 화면 또는 쇼핑커넥트 적용
- release, version bump, parent merge, push 또는 deployment

## Proposed Design

1. 공통 preflight가 발행 대상이며 이미지가 없고 유효한 프롬프트가 있는 슬롯만 찾는다.
2. 준비된 이미지, `사용 안 함` 슬롯, 이미지 의도가 없는 콘텐츠는 자동 생성 대상에서 제외한다.
3. 대상 슬롯을 공통 이미지 생성 기능으로 채우고 성공한 결과를 Draft revision에 보존한다.
4. 최신 revision을 다시 검증한다. 미해결 프롬프트가 남은 공개·예약 요청은 임시 저장으로 바꾸고,
   그 외에는 사용자가 지정한 임시 저장·즉시 발행·예약 발행을 그대로 실행한다.
5. 중복 실행 방지와 공통 상단 상태를 사용하고, 상세 원인은 애플리케이션 로그에 남긴다.

## Decisions

- 별도의 `빈 이미지 자동 생성` 옵션은 제공하지 않는다. 자동 완성이 기본 동작이다.
- 사용자는 이미지가 없으면 자동 생성되고, 실패하면 안전하게 임시 저장된다는 결과만 알면 된다.
- 세 입력 방식은 한 sub-feature에서 함께 완성해 parent에 부분 정책을 병합하지 않는다.
- 구현과 UI 검토는 단계적으로 진행하며 첫 검토는 원고 폴더 흐름에서 받는다.
- 예약 발행 이미지도 예약 실행 시점이 아니라 예약 등록 전에 생성해 원고 결과를 확정한다.
- 세 입력 방식의 실행 버튼은 선택한 포스팅 옵션과 같은 `블로그에 임시 저장` / `즉시 발행` / `예약 발행`
  문구를 사용한다. 확인과 완료 안내에는 실제 대상 블로그와 실행 결과를 다시 명시한다.
- 이미지 생성 실패로 결과만 임시 저장으로 전환된 경우, 사용자가 보완 후 재시도할 수 있도록 원래 즉시/예약 선택은 유지한다.
- 바로 생성의 `글감 보관`은 발행 설정 없이 아이디어만 남기고, `발행 대기열에 추가`를 선택할 때만 발행 계획을
  점진적으로 공개한다. 원고가 만들어진 뒤에는 준비 단계의 저장·생성 작업을 숨기고 미리보기 아래에 보조
  `원고 다시 만들기`만 제공하며, 실제 발행 CTA는 3단계에만 둔다.
- 빠른 글 작성의 세 입력 방식은 별도 발행 설정 사본을 두지 않는다. 하나의 공통 발행 설정 컴포넌트를 현재
  활성 모드의 슬롯으로 이동하고 설정값도 공유해, 스타일·도움말·의존 필드·기본값 동작이 어긋나지 않게 한다.

## Implementation Stages

1. Shared policy and publish coordinator tests
2. Folder UI behavior, focused tests, browser smoke, user review
3. Paste UI integration and review
4. Direct AI UI integration and review
5. Cross-mode regression, full unit merge gate, documentation archive

## Verification

- shared Draft/image policy unit tests
- publish coordinator success, partial failure, retry, exclusion and no-image tests
- mode-specific focused UI contract tests
- each reviewable UI slice browser fixture smoke
- parent merge 전 사용자 승인 후 full unit suite

## Progress

- 2026-09-15: user approved automatic image completion as the default and kept manual image actions as optional correction.
- 2026-09-15: user selected the UI rollout order: folder, paste, then direct AI, with hands-on review after the folder slice.
- 2026-09-15: stage branch and development record created before material implementation.
- 2026-09-15: added a shared publish preflight that generates only included prompt-backed missing images, preserves each
  successful result, retries remaining slots independently, and keeps the entire preparation and publish operation inside
  the existing Blog Beta execution lock.
- 2026-09-15: narrowed the safe-draft condition to unresolved prompt-backed images. Missing slots without prompt intent are
  omitted from published Markdown and do not block immediate or scheduled publishing; excluded slots remain untouched.
- 2026-09-15: completed the folder UI slice. Missing prompt images no longer disable immediate or scheduled publishing;
  the UI explains automatic completion in the existing hint and confirmation, refreshes the WYSIWYG preview from the
  server result, and reports any effective draft fallback from the actual publish response.
- 2026-09-15: moved direct manuscript publishing from the input module to the execution module after the UI structure
  guard detected an 814-line boundary violation. Focused backend/UI/structure tests passed (60/60), and the final browser
  fixture smoke passed with 336 requests.
- 2026-09-15: committed the shared policy, folder review slice, and cross-mode publish action terminology as `0aef445`.
- 2026-09-15: completed the paste review slice by routing its missing prompt images through the same automatic pre-publish
  resolution policy while keeping direct AI on the prior safety lock until its own review stage. Paste now preserves
  immediate or scheduled publishing, explains the automatic work in the hint and confirmation, and refreshes the preview
  with the generated image result.
- 2026-09-15: paste-slice focused UI/contract tests passed (46/46), the browser fixture smoke passed with 345 requests,
  and `git diff --check` passed. Full unit validation remains deferred to the completed sub-feature merge gate.
- 2026-09-15: began the direct AI review slice. Its preparation actions are separated into `나중에 활용` and `지금 작성`
  rows under a consistent `원고 준비` step, while preview and publishing remain steps 2 and 3. Direct AI now uses the same
  automatic missing-image resolution policy as folder and paste without exposing another option.
- 2026-09-15: completed the direct AI review slice. Removed the now-unreachable client-side forced-draft branch so the
  shared server preflight is the only authority for image-failure fallback. Focused UI/design contracts passed (77/77),
  UI script/style structure checks passed (17/17), the browser fixture smoke passed with 346 requests, and
  `git diff --check` passed.
- 2026-09-15: refined the direct AI action hierarchy after user review. Renamed the queued path to `발행 대기열에 추가`,
  kept its settings hidden until chosen, hid the entire preparation action area after draft creation, and moved
  `원고 다시 만들기` beside the preview as a secondary action. The updated browser fixture smoke passed with 352 requests;
  focused contracts and module-boundary checks also passed.
- 2026-09-15: corrected a visual regression found in hands-on review: later shared action styles had overridden the
  preparation area's grid layout and the native `hidden` state on the pre-generation publish action. An initial browser
  width assertion then exposed an implicit second grid column retained by the legacy action slot; the final rule declares
  one explicit full-width column. Preparation rows now occupy the full form width and hidden draft actions remain hidden.
  Focused style/UI contracts passed (63/63), the browser fixture smoke passed with 345 requests, and `git diff --check`
  passed.
- 2026-09-15: prevented the shared publishing-runner state from overwriting the direct AI generation CTA with
  `포스팅 진행 중...`; manuscript generation now keeps the stage-specific `원고 만드는 중...` label. The browser
  fixture now holds generation briefly and asserts the in-progress copy; focused contracts, the script boundary check,
  and browser smoke passed.
- 2026-09-15: extracted the complete Blog Beta publish settings card into one HTML partial and replaced the three mode
  copies with four placement slots (AI queue/publish, folder, paste). Mode activation reparents the same controls, updates
  contextual titles and summaries, and preserves one setting state. This also removed the visual mismatch around
  `보이지 않게 실행` and corrected a duplicate headless-field id on the unrelated external-reference control. Focused
  UI/structure contracts passed (90/90), browser smoke passed with 347 requests, and `git diff --check` passed.
- 2026-09-15: completed the merge gate. The full unit suite passed with 1,802 tests and one platform-specific skip across
  345 test files. The latest focused UI/structure contracts (90/90), browser smoke (347 fixture requests), and
  `git diff --check` also passed.

## Current Result

- The common server policy is ready for every canonical manuscript source.
- `원고 폴더` exposes the new optional-correction UX and automatically fills untouched prompt images on posting.
- `원고 붙여넣기` now exposes the same automatic completion policy as `원고 폴더`.
- `바로 생성` now uses the common automatic image policy and the same three-step manuscript flow as the other modes.
- All three modes use one shared publishing-settings component and preserve a single settings state while switching modes.
- Automated merge gates are complete. Final visual and exploratory acceptance remains with the user in the integrated
  parent feature.

## Remaining Risks

- 이미지 생성의 부분 성공 뒤 재시도가 이미 성공한 슬롯을 다시 생성하거나 중복 과금하지 않아야 한다.
- 공개·예약 요청의 안전 전환 사유와 실제 결과 상태가 UI, 응답, 로그에서 일치해야 한다.
- 이미지가 없는 글과 프롬프트 해석 실패를 잘못 같은 상태로 취급하지 않아야 한다.
