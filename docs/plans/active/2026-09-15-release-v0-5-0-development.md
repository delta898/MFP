# v0.5.0 Release Preparation Record

## Branch

- Branch: `release/v0.5.0`
- Base/parent branch: `dev`
- Start date: 2026-09-15
- Status: stable `0.5.0` finalized; awaiting verification and authorized push/tag

## User Need

최근 완료한 안정성, 메모리, 네트워크, Blog Beta 글쓰기 및 디자인 스타일 개선을 하나의 검증 가능한
`v0.5.0` 릴리스 후보로 정리한다. 첫 준비 버전은 `0.5.0-dev1`로 시작한다.

## Goal

- 앱 버전 source와 lockfile root metadata를 `0.5.0-dev1`로 일치시킨다.
- `CHANGELOG.md`에 포함될 사용자 관점의 v0.5.0 범위를 정리한다.
- build 입력, 버전 일관성, 자동 회귀와 주요 수동 검토 항목을 확인한다.
- 최종 승인 전까지 tag, push, package publish와 release publication을 수행하지 않는다.

## Scope

- `package.json` 및 `package-lock.json`의 앱 버전
- 기존 root `CHANGELOG.md`의 v0.5.0 release notes
- release/build version contract와 관련 자동 검증
- release 후보의 최종 diff 및 hands-on validation 목록

## Explicit Non-goals

- 독립적으로 versioned된 도구, plugin 또는 server의 버전 변경
- 사용자 승인 없는 tag, push, packaging 또는 배포
- release 범위와 무관한 새 기능 추가
- raw commit history나 내부 구현 단계를 release note로 나열

## Proposed Stages

1. `0.5.0-dev1` prerelease version metadata 정렬
2. v0.5.0 사용자 가치를 기준으로 release scope와 `CHANGELOG.md` 정리
3. 관련 focused/build 계약 및 full regression 검증
4. 사용자 hands-on 검토와 남은 release blocker 정리
5. 별도 승인 후 최종 버전 확정, commit/tag/push/package/release 수행

## Decisions and Tradeoffs

- 개발 중간 산출물을 구분할 수 있도록 안정 버전 `0.5.0` 대신 `0.5.0-dev1`부터 사용한다.
- 앱과 lockfile root 버전만 함께 올리고 Electron, dependency와 독립 도구 버전은 그대로 둔다.
- 릴리스 노트는 내부 구조가 아니라 사용자가 체감하는 안정성, 작업 흐름과 기능을 중심으로 통합한다.
- 릴리스 노트에서는 제품 화면을 `Beta`로 부르지 않고 `블로그`, `설정`처럼 사용자에게 보이는 정식 기능명으로 표현한다.

## Progress

- 2026-09-15: user approved creating `release/v0.5.0` from `dev` and starting at `0.5.0-dev1`.
- 2026-09-15: created the release branch and this record before changing version metadata.
- 2026-09-15: aligned the app package version and both lockfile root version fields to `0.5.0-dev1` without changing dependency versions.
- 2026-09-15: updated the explicit desktop version contract from the prior stable version to the new prerelease checkpoint.
- 2026-09-15: updated the maintained backlog marker to identify `v0.5.0` as the next release in preparation while keeping `v0.4.3` as the latest published release.
- 2026-09-15: drafted the Unreleased notes around major user outcomes: unified manuscripts and images, selectable styles, consolidated settings, simplified publishing and shopping flows, bounded recommendation storage, Windows startup recovery, and Telegram connectivity.
- 2026-09-15: kept `Beta` terminology out of the release copy and ordered the first five changelog items so generated update highlights include the unified workspace, styles, settings, Windows startup recovery, and Telegram reliability.
- 2026-09-15: added a dry-run-first Development reset utility for repeatable bootstrap testing. Its default mode clears settings locally, while `--full` covers local user state and the guarded `--reset-development-user` path can reset only the current machine's Development license lifecycle. Crash diagnostics, source defaults, secrets, shared server data, and Production are excluded.
- 2026-09-15: narrowed deletion ownership after review: user-created `config.json.bak*`, arbitrary files and custom-workspace manuscripts are preserved; only known app-owned workspace subtrees and runtime state are eligible for deletion.
- 2026-09-16: traced the hosted Windows build delay to the packaged `--version` probe. Electron could consume that switch before the app entrypoint, causing the external launcher to wait for a readiness signal that a version command should never require. The launcher now handles version/help commands before starting Electron, while CI no longer treats `--version` as application startup evidence.
- 2026-09-16: strengthened Windows release verification around real execution: the portable package must reach renderer readiness in normal and safe modes, and the generated installer must silently install into a clean runner path where the installed launcher must reach the same normal-mode checkpoint. Authenticode status is reported explicitly, but CI does not claim to verify SmartScreen reputation for the currently unsigned artifacts.
- 2026-09-16: advanced the prerelease checkpoint from `0.5.0-dev5` to `0.5.0-dev6` for this Windows verification correction.
- 2026-09-20: user authorized the stable `v0.5.0` release (commit, push, tag-triggered CI build). Finalized app and lockfile metadata at `0.5.0`, consolidated the `0.5.0-dev2`–`dev6` Windows verification notes out of the user-facing changelog, promoted the Unreleased outcomes to `## [0.5.0]`, and updated the backlog marker to `v0.5.0`.
- 2026-09-16: removed the redundant Local Supabase rebuild job from environment validation. Hosted Development drift remains the pre-production environment check, while local validation commands remain available for intentional developer use.

## Corrections

- The first focused run correctly failed because `scripts/version-contract.test.js` still asserted `0.4.3`; package and lockfile were already consistent. The release-owned expectation was updated to `0.5.0-dev1` before rerunning the checks.
- The first live Development reset preview was rejected before execution because the current Supabase CLI accepts one prepared statement per query file. The generated `BEGIN; DO; ROLLBACK/COMMIT` batch was replaced with one atomic `DO` statement; preview remains read-only and apply keeps statement-level transaction atomicity.
- Repeated GPU/sandbox variants did not address the Windows failure because the delay occurred in a command-classification boundary, not graphics initialization or SmartScreen. Those diagnostic retries were removed instead of increasing timeouts again.

## Verification Plan

- package/lockfile version consistency
- release and build configuration contracts
- focused tests for release-only edits
- user approval before the final broad regression gate when required

## Verification Results

- `node --test scripts/version-contract.test.js` — 3 passed
- `node --test scripts/build-environment-config.test.js scripts/environment-release-gate.test.js scripts/release-platform-contract.test.js scripts/release-retention.test.js` — 11 passed
- explicit package/lockfile check confirmed all three app version fields are `0.5.0-dev1`
- `node scripts/release-details.js 0.5.0-dev1` confirmed the Unreleased fallback produces five user-facing update highlights without Markdown artifacts
- `git diff --check` — passed
- `node --test scripts/clear-dev-state.test.js` — 8 passed
- `./clear_dev.sh --help` and local partial/full dry-runs — passed without deleting data
- `./clear_dev.sh --full --reset-development-user --dry-run` — passed against the Development Supabase target with a single read-only `DO` statement; no local or remote data was deleted
- focused Windows packaging, Electron startup, and environment workflow contracts — passed after replacing version-only execution with real portable and installed-application startup verification and removing Local Supabase CI reconstruction
- 2026-09-20 stable `0.5.0` gate: `node --test scripts/version-contract.test.js` — 3 passed; release/build contracts — 11 passed; `git diff --check` — passed; `node scripts/release-details.js 0.5.0` — 5 user-facing highlights; `npm run test:unit` — 1834 passed, 1 Windows-only skipped, 0 failed

## Remaining Risks

- v0.4.3 이후 변경 범위가 넓어 사용자 관점 release note의 중복과 누락을 함께 검토해야 한다.
- prerelease suffix가 update channel과 artifact naming에 반영되는지 build 계약으로 확인해야 한다.
- 실제 Windows packaged startup은 플랫폼별 hands-on 검증이 별도로 필요하다.
- Development Supabase preview and CLI integration were verified read-only; the destructive apply path remains intentionally unexecuted until a real disposable-user reset is confirmed.
- Windows support requires the planned PowerShell wrapper after the shell workflow is accepted.
- Windows CI verifies technical startup on a hosted runner, not SmartScreen reputation or trusted-publisher UX. Until Windows artifacts are Authenticode-signed, a clean end-user Windows installation remains a required manual release check.
