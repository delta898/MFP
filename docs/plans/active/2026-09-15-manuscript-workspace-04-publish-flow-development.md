# Manuscript Workspace Stage 04: Publish Flow Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace-04-publish-flow`
- Base/parent branch: `codex/feat/manuscript-workspace`
- Start date: 2026-09-15
- Status: implementation complete; ready for user UI review

## User Need

Blog Beta의 빠른 글 작성이 설정과 실행 버튼을 한 화면에 섞어 보여 주어, 사용자가 현재 글을 만드는 중인지
미리보는 중인지 발행하는 중인지 파악하기 어렵다. 세 입력 방식은 `준비 → 미리보기 → 발행`이라는 같은 흐름을
제공해야 한다.

## Goal

- 바로 생성의 글 생성 입력에서 플랫폼·발행 설정을 분리한다.
- 세 입력 방식 모두 원고가 준비된 뒤 미리보기와 이미지 확인을 거쳐 발행 설정으로 진행한다.
- 생성 전에는 `글감 보관`과 `글감 대기열에 추가`를 별도 경로로 유지한다.
- 작성 중 원고 자동 저장·복원 UI는 이번 단계에서 추가하지 않는다.

## Scope

- Blog Beta 빠른 글 작성의 단계 구조, 문구, 버튼 우선순위와 반응형 배치
- 플랫폼 중립적인 바로 생성 입력과 발행 단계의 단일 플랫폼 선택
- 글감 대기열과 현재 원고 직접 발행의 의미를 UI에서 명확히 구분
- 관련 focused UI/domain tests와 browser fixture 검증

## Non-goals

- 제목·본문 편집
- 작성 중 원고 목록, 앱 재시작 복원 또는 사용자용 자동 저장 기능
- 원고 작업공간 보존 기간과 정리 정책 구현
- 기존 블로그 화면 또는 쇼핑커넥트 적용
- release, version bump, push 또는 deployment

## Proposed Design

1. `글 준비`: 주제·키워드·작성 옵션 바로 뒤에 `글감 보관`, `글감 대기열에 추가`, `원고 만들기`를 함께 제공한다.
2. `미리보기`: canonical Draft 본문과 이미지 slot을 확인·보완한다.
3. `발행 설정`: 플랫폼, 카테고리, 공개 상태와 실행 방식을 정한 뒤 현재 미리보기 원고를 직접 처리한다.

플랫폼은 AI 본문 프롬프트의 입력으로 사용하지 않고 발행 projection의 입력으로 취급한다. 관련 글, 이미지
업로드와 provider별 payload는 플랫폼 선택 이후 구성한다. 기존 대기열은 생성 전 topic과 발행 계획을 저장하고
실행 시 원고를 생성하는 기능이므로, canonical Draft snapshot이나 사용자가 보완한 이미지를 저장하는 기능으로
확장하지 않는다.

## Decisions

- `글감 보관`과 `글감 대기열에 추가`는 생성 전 아이디어에만 사용한다. 대기열은 실행 시 원고를 생성한다.
- 작성 중 상태는 내부 Draft workspace로 유지하되 이번 단계에서는 사용자용 복원 기능으로 표현하지 않는다.
- 플랫폼 선택은 발행 설정에 둔다. 플랫폼별 문체 생성 기능이 별도로 도입되기 전까지 플랫폼 변경 때문에
  원고를 다시 생성하도록 요구하지 않는다.
- 생성된 원고의 발행 설정과 직접 실행은 대기열과 분리한다. 이미지 사용 대상 slot의 누락은 직접 발행 전
  validation 대상이며 의도적으로 제외한 slot은 누락으로 보지 않는다.

## Verification

- 빠른 글 작성 구조·문구·단계 상태 focused contract tests
- 플랫폼 변경 시 AI 원고 재생성을 요구하지 않는 계약 test
- 생성 전 글감 대기열과 생성 후 원고 직접 발행의 경계 tests
- reviewable UI slice 완성 후 Blog Beta browser fixture smoke
- parent merge 전 full unit suite는 사용자 승인 후 실행

## Progress

- 2026-09-15: user approved the simplified flow and explicitly deferred user-facing autosave and draft recovery.
- 2026-09-15: stage branch and development record created before implementation.
- 2026-09-15: user clarified that the current queue stores an idea and generates its manuscript only when executed.
  Persisting a completed Draft snapshot in the queue is explicitly deferred.
- 2026-09-15: added the shared three-step visual grammar to all quick-writing inputs. Direct AI starts with idea actions,
  hides idea storage/queue actions after generation, and then exposes preview followed by direct-publish settings.
- 2026-09-15: clarified the queue action as `글감 대기열에 추가` with an explicit note that the manuscript is generated
  when the queue runs. No Draft snapshot or edited image is added to the queue.
- 2026-09-15: direct AI generation no longer requires a completed delivery schedule and changing the publish platform
  after generation no longer invalidates the manuscript. The transient generation projection omits related-post links;
  the selected platform remains a Draft publish setting.
- 2026-09-15: removed raw request/server log panels from the three manuscript modes. AI generation and direct manuscript
  publishing now report concise running, completed, and failed states through the shared top operation status; detailed
  diagnostics remain in the application log.
- 2026-09-15: kept all three idea actions immediately after content settings. Publish settings stay out of the initial
  generation path; choosing the queue action first reveals its delivery plan for confirmation, while successful manuscript
  generation places the same settings after preview as direct-publish settings.
- 2026-09-15: focused backend/UI contracts passed (61/61). The final Blog Beta browser fixture smoke passed with 326
  requests after covering contextual queue settings, AI generation status, preview transition, and folder/paste publishing.

## Current Result

- `바로 생성`: 내용 입력과 글 구성 바로 아래에서 글감 보관, 글감 대기열 추가 또는 원고 생성을 선택한다.
- 글감 대기열 추가: 최초 선택 시 대기열의 발행 계획만 펼쳐 확인하게 하고, 다시 누르면 글감으로 저장한다.
- 생성 성공 후: 글감 작업 버튼은 숨기고 미리보기/이미지 작업공간, 발행 설정, 현재 원고 실행 순으로 보여 준다.
- `원고 폴더`와 `원고 붙여넣기`: 같은 `원고 준비 → 미리보기 → 발행` 단계와 상단 진행 상태를 사용한다.
- 원고 화면에는 저수준 요청 로그를 노출하지 않고, 실패 원인은 사용자 메시지와 애플리케이션 로그로 남긴다.
- Full unit suite has not been rerun because this review slice is awaiting hands-on UI acceptance.

## Remaining Risks

- 브라우저 fixture로 동작 계약은 확인했지만 최종 간격, 긴 라벨, 작은 창 배치는 사용자 hands-on UI 확인이 필요하다.
- 이번 단계는 기존 대기열을 원고 snapshot 저장소로 확장하지 않았다. 향후 원고 대기열이 필요하면 별도 데이터
  수명주기와 복원 계약으로 설계해야 한다.
