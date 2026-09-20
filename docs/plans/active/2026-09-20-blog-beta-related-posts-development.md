# Blog Beta 연관글 Draft 확정 시점 이전 개발 기록

## Branch

- Branch: `feat/blog-beta-related-posts`
- Base/parent branch: `codex/fix/blog-next-generation-state` (user-directed; contains 918e786 + 30520ce on top of `dev`@27eadee)
- Start date: 2026-09-20
- Status: complete; user verified hands-on, ready for parent merge

## User Need

유료 플랜(pro 이상)에서 글 하단에 '함께 보면 좋은 글' 연관글이 붙어야 하는데, Blog Beta(바로 생성·원고 폴더·원고 붙여넣기)에서는 테스트해도 나오지 않는다. 미리보기는 실제 포스팅될 글 그대로를 보여줘야 한다.

## Goal

- 연관글 자동 연결이 활성화된 플랜에서 Blog Beta 세 입력 방식 모두 미리보기와 발행물에 같은 연관글 섹션을 포함한다.
- Free 플랜에서는 양쪽 모두 미포함으로 유지한다.
- 조회 실패·후보 없음·기능 미지원 사유를 화면 상태로 안내한다(로그에만 남기지 않음).

## Scope

- `src/content/manuscript-draft-service.js`: canonical Draft 생성·갱신 시 연관글 섹션 확정
- `src/ui-api/services/content.service.js`: Draft 호출 경계에서 라이선스 feature 전달
- `ui/scripts/features/blog-next/draft-inputs.js`: 미리보기 검증 안내에 연관글 상태 표시
- 대상 전환(네이버↔워드프레스) 시 연관글 섹션만 재계산
- 회귀 테스트: Pro/Free × 3입력방식 × 대상전환 × 실패 케이스
- `src/ui-runtime/publish-actions-runtime.js`는 변경하지 않음 (781-783행 강제 비활성화 유지, 1312행 직접 붙여넣기 발행 경로 유지)

## Explicit Non-goals

- 기존 생성·대기열 발행 경로의 연관글 동작 변경 없음
- 직접 붙여넣기 발행(`markdownText` 직접 전달)의 발행 시점 추가 동작 변경 없음
- MS Store 작업과 무관. 본 브랜치와 병행 진행하되 서로 머지하지 않음
- 사용자 승인 없는 dev 병합·push
- 본 브랜치는 부모 codex 브랜치의 2개 커밋을 포함하므로, dev 병합 시 부모를 먼저 합치거나 본 브랜치 병합이 부모 커밋을 함께 가져간다. 부모 미병합 상태로 dev에 합치지 않는다.

## Proposed Design

연관글을 발행기가 마지막 순간에 붙이지 않고 canonical Draft 확정 시점에 본문에 포함한다.

1. 라이선스 feature(`enable_related_posts_auto_link`)는 호출 경계(`content.service`)에서 확인해 Draft 확정 단계에 전달한다. Draft 서비스는 라이선스를 직접 보지 않는다.
2. Draft 생성·본문 갱신·대상 전환 후 `refreshDraftRelatedPosts`가 연관글 섹션을 확정한다. 기존 섹션은 교체해 중복을 막고, 끝부분 해시태그 블록이 있으면 연관글을 해시태그 위에 둔다.
3. 미리보기는 완성된 revision을 그대로 표시하므로 미리보기 빌더 수정이 필요 없다.
4. 발행기는 본문을 더 수정하지 않고 해당 revision을 그대로 전달한다. `publish-actions-runtime.js` 781-783행의 workspaceDraft 강제 비활성화는 유지한다. 생성 시점 추가를 켜면 Draft 확정과 중복 조회가 발생하므로 workspaceDraft는 계속 Draft 확정에 위임한다.
5. 네이버↔워드프레스 대상 전환 시 AI 본문은 다시 만들지 않고 연관글 섹션만 다시 계산한다. 마지막 확정 시점의 대상을 매니페스트에 기록해 비교한다.
6. 조회 실패·후보 없음은 원고 밖 미리보기 검증 안내 영역에 표시한다. Free 플랜(`disabled`)은 안내하지 않는다.
7. 미리보기 본문과 발행 payload 본문의 일치를 revision 기준으로 테스트에서 검증한다.

## Affected Boundaries

- `src/content/` (Draft 확정: 신규 `manuscript-related-posts.js` + `manuscript-draft-service.js`)
- `src/ui-api/services/content.service.js` (라이선스 경계)
- `ui/` 미리보기 상태 안내 (`draft-inputs.js` 검증 안내 영역, HTML 변경 없음)
- `src/ui-runtime/` 변경 없음 (781-783행 강제 비활성화 유지, 1312행 직접 붙여넣기 발행 경로 유지)

## Decisions and Tradeoffs

- Draft 서비스가 라이선스를 직접 조회하지 않고 호출자가 flag를 전달한다. 관심사 분리를 유지하고 테스트가 쉬워진다.
- 연관글 조회는 AI·네트워크 작업이므로 진행 상태 표시와 중복 실행 방지를 적용한다(프로젝트 AI 액션 규칙).
- 실패 시 마지막 유효 Draft를 유지하고 새로 실패한 조회로 본문을 비우지 않는다.
- 검증된 원인: `publish-actions-runtime.js:781-783`의 workspaceDraft 강제 `false`, `buildPublishPayload`가 `selectedFiles`만 전달해 1312행 `hasPastedMarkdown` 조건을 통과하지 못함. 플랜 게이팅(free=false, pro/ultra=true)은 정상이므로 게이팅 수정은 범위 밖.

## Progress

- 2026-09-20: user reported missing related posts in Blog Beta and approved this fix direction.
- 2026-09-20: verified root cause in code (781-783행 강제 비활성화, selectedFiles 발행 경로의 조건 미통과, 미리보기 빌더에 연관글 로직 없음).
- 2026-09-20: created `feat/blog-beta-related-posts` from `codex/fix/blog-next-generation-state` (per user direction, not `dev`) with this record before implementation.
- 2026-09-20: implemented draft-time finalization — new `src/content/manuscript-related-posts.js` (pure finalize + hashtag-aware placement + Core section parity), `refreshDraftRelatedPosts` with revision-conflict retry, manifest `related_posts` status, license resolution at the `content.service` boundary, preview validation notices for failed/unavailable. Existing sync create/update APIs unchanged.

## Verification Plan

- Draft 확정 시 연관글 포함·교체·배치 단위 테스트
- Pro + 후보 있음: 미리보기와 발행 payload 동일 섹션 포함
- Free: 양쪽 모두 미포함
- 조회 실패·후보 없음: 양쪽 미포함 + 화면 사유 표시
- 대상 전환 시 섹션만 재계산
- 기존 집중 계약 테스트 전부 통과 후 dev 병합 전 전체 스위트 승인 요청

## Verification Results

- `node --test src/content/manuscript-related-posts.test.js src/content/manuscript-draft-related-posts.test.js src/content/manuscript-draft-service.test.js src/ui-api/services/content.service.blog-next-related-posts.test.js src/ui-api/services/content.service.blog-next-execution.test.js src/ui-api/services/content.service.feature.test.js` — 50 passed
- `node --test scripts/blog-next-baseline-contract.test.js scripts/ui-script-structure.test.js src/ui-runtime/publish-actions-runtime.test.js src/ui-runtime/content-actions-runtime.test.js` — 53 passed
- `git diff --check` — passed (verify before commit)
- Full unit suite before parent merge: pending, requires explicit user approval per policy
- Live verification with a paid plan + connected Naver blog (real candidate fetch, preview/publish parity): left for user hands-on, cannot run with fixtures

## Remaining Risks

- Draft 시점 조회는 발행 대상 블로그 컨텍스트가 필요하므로 대상 전환 재계산 경로를 빠뜨리면 구 섹션이 남는다.
- 조회 지연이 Draft 생성 응답을 늦추므로 상태·타임아웃 설계가 필요하다.
- MS Store 브랜치와 같은 파일(`publish-actions-runtime.js`)을 건드릴 수 있어 병행 시 충돌 가능. 본 브랜치를 먼저 dev에 합치는 것을 권장.
