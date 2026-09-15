# Manuscript Workspace Stage 07: Integration and Lifecycle Development Record

## Branch

- Branch: `codex/feat/manuscript-workspace-07-integration`
- Base/parent branch: `codex/feat/manuscript-workspace`
- Start date: 2026-09-15
- Status: complete; verified and ready for parent integration

## User Need

빠른 글 작성의 세 입력 방식이 하나의 원고 작업공간으로 통합되었지만, 앱 전용 `manuscript-drafts`
작업공간과 바로 생성의 중간 결과가 언제 복구되고 언제 정리되는지 명확해야 한다. v0.5.0 배포 전에 장기 사용으로
파일이 계속 쌓이지 않도록 하고, 정리 작업이 진행 중이거나 재시도 가능한 원고를 손상시키지 않도록 안정화해야 한다.

## Goal

- 성공적으로 끝난 원고와 만료된 원고·고아 asset을 명시적인 수명주기에 따라 정리한다.
- 진행 중이거나 최근 실패하여 재시도 가능한 원고는 보존한다.
- 앱 재시작 후 남은 작업공간을 안전하게 분류하고, 자동 정리 결과를 운영 로그로 확인할 수 있게 한다.
- 폴더·붙여넣기·바로 생성의 공통 실행 및 오류 경계를 최종 회귀 검증한다.

## Scope

- canonical Manuscript Draft workspace의 metadata와 lifecycle API
- 성공 발행 후 정리, 시작 시 만료 정리, orphan/temporary asset 정리
- 바로 생성 중간 preview workspace의 안전한 정리
- 정리·복구·자동 이미지 완성·실제 발행 상태에 대한 진단 로그
- Blog Beta 세 빠른 글쓰기 방식의 접근성 및 통합 회귀
- parent 개발 기록과 안정화 결과 문서화

## Explicit Non-goals

- 제목·본문 Markdown 편집과 이미지 block 추가·이동·완전 삭제
- 기존 `블로그` 화면 또는 쇼핑커넥트 연동
- 사용자 계정 간 Draft 동기화나 클라우드 백업
- v0.5.0 버전 변경, release branch, parent의 `dev` 병합, push 또는 배포

## Proposed Design

1. 각 Draft workspace에 생성·수정 시각과 lifecycle 상태를 원자적으로 기록한다.
2. 최근 변경된 Draft는 `active`로 보존하고, 성공 발행 뒤에는 해당 snapshot을 `completed` 정리 대상으로 표시한다.
3. 앱 시작 시 보수적인 TTL을 넘긴 비활성 Draft만 정리한다. 유효한 최근 Draft와 활성 lease는 보존한다.
4. Draft가 참조하는 asset 집합을 기준으로 managed orphan만 제거하며, source folder와 사용자가 선택한 원본은
   절대 삭제하지 않는다.
5. 바로 생성의 transient preview는 canonical Draft import가 성공한 뒤 정리하고, 실패 시에는 진단 가능한 범위에서
   짧게 보존한 후 TTL 정리한다.
6. 정리 실패는 앱 시작과 발행을 막지 않되 대상·사유·보존 여부를 비밀정보 없이 로그에 남긴다.

## Implementation Stages

1. 현행 workspace·temporary preview 소유권과 호출 경계 조사
2. lifecycle metadata, cleanup policy와 focused unit tests
3. startup/success integration, failure isolation과 logs
4. cross-mode UI/accessibility and browser regression
5. full unit merge gate, record archive and parent integration readiness

## Decisions and Tradeoffs

- 제목·본문 편집은 사용자가 v0.5.0 이후 검토하기로 했으므로 이번 stage에서 제외한다.
- 자동 정리는 공간 회수보다 데이터 안전을 우선하며, 최근·활성·재시도 가능 원고는 보존한다.
- 원본 폴더 및 외부 파일은 workspace lifecycle의 소유 대상이 아니다.
- 정리 실패는 비치명적 유지보수 오류로 다루고 마지막 유효 원고 및 앱 시작을 보존한다.

## Verification

- TTL 경계, active/retry 보존, completed cleanup과 orphan asset unit tests
- 잘못된 metadata, 파일 잠금/삭제 실패와 시작 시 failure isolation tests
- 세 입력 방식 publish integration focused tests
- 사용자-visible integration slice의 browser fixture smoke
- parent merge 전에 사용자 승인 후 full unit suite

## Progress

- 2026-09-15: user approved Stage 07 as the next sub-feature and kept text editing deferred.
- 2026-09-15: created the dedicated branch and development record before material implementation.
- 2026-09-15: confirmed that canonical Draft directories previously had no cleanup API and direct-AI preview sessions expired
  only in memory, leaving generated platform directories behind after import or process interruption.
- 2026-09-15: added explicit `active` and `completed` lifecycle metadata. Active/retryable Drafts use a conservative seven-day
  retention; successfully handled Drafts keep their exact revision and preview URLs for 24 hours before startup cleanup.
- 2026-09-15: added marker-owned transient preview cleanup. Canonical AI import and normal preview completion now release the
  generated directory immediately; interrupted sessions are removed after six hours on the next startup. External and
  unmarked workspace directories are never removed by this policy.
- 2026-09-15: documented the canonical Draft, publish, lifecycle, ownership and failure contracts in
  `docs/architecture/manuscript-workspace.md`.
- 2026-09-15: focused lifecycle, content-service, publish-runtime, API composition, Blog image, quick-flow,
  continuous-publishing and UI structure gates passed (87/87). Browser smoke passed with 347 fixture requests, and
  `git diff --check` passed.
- 2026-09-15: completed the merge gate. The full unit suite passed with 1,808 tests, one Windows-specific skip and
  zero failures across 347 test files. The stage record and canonical architecture documentation were finalized.

## Current Result

Lifecycle ownership and automatic cleanup are implemented and all automated merge gates are complete. Final hands-on
verification remains with the user in the integrated parent feature.

## Remaining Risks

- 너무 짧은 TTL은 사용자가 다시 보완할 원고를 잃게 하고, 너무 긴 TTL은 디스크 증가를 방치한다.
- 현재 UI에는 앱 재시작 후 최근 Draft를 다시 여는 목록이 없으므로 7일 보존은 사용자 복구 기능이 아니라 안전 유예다.
- Windows에서 잠긴 파일은 첫 정리에서 남을 수 있으나 시작을 막지 않고 다음 초기화 때 재시도한다.
