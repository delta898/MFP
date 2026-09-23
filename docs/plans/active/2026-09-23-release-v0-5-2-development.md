# v0.5.2 Release Preparation Record

## Branch

- Branch: `release/v0.5.2`
- Base/parent branch: `dev` (`20accad`)
- Start date: 2026-09-23
- Status: `0.5.2-dev1` release candidate prepared; hands-on validation pending

## User Need

전역 새 글 작성 단축키와 최신 AI 모델 현행화를 부담이 크지 않으면서 사용자 효과가 분명한 v0.5.2로 검증하고 배포할 수 있게 정리한다.

## Goal

- 앱과 lockfile 버전을 `0.5.2-dev1`로 일치시킨다.
- `CHANGELOG.md`에 사용자가 체감할 수 있는 v0.5.2 변경을 정리한다.
- Development/Production에 선반영된 `0.5.2+` 모델 catalog를 release candidate 앱에서 검증한다.
- 최종 승인 전까지 stable version, tag, push, packaging과 release publication을 수행하지 않는다.

## Scope

- `CmdOrCtrl+N` 전역 새 글 작성 진입
- 최신 텍스트·이미지 모델과 작업별 자동 reasoning 정책
- Gemini 설정 즉시 반영 및 안전한 오류·로그 정보
- 저장된 화면 style의 첫 paint 적용
- 앱/lockfile version, changelog와 release 검증 기록

## Explicit Non-goals

- v0.5.2 범위와 무관한 신규 기능 추가
- KIE Claude 전용 transport, 이미지 4K 또는 사용자 reasoning 단계 선택 UI
- 사용자 승인 없는 stable 확정, tag, push, package 또는 배포
- dependency와 독립 도구·서비스의 version 변경

## Decisions and Tradeoffs

- 첫 release candidate는 `0.5.2-dev1`로 구분한다.
- 새 39-model remote catalog는 `0.5.2+`에만 노출하고 기존 앱은 이전 published snapshot을 계속 사용한다.
- release note는 내부 catalog·SQL 구조보다 단축키, 선택 가능한 모델, 자동 품질 조절과 오류 복구처럼 사용자가 관찰할 수 있는 결과를 설명한다.
- 실제 유료 모델 생성과 플랫폼별 packaged-app 확인은 release candidate hands-on 단계에서 별도 승인·확인한다.

## Progress

- 2026-09-23: user approved creating `release/v0.5.2` from `dev` and starting at `0.5.2-dev1`.
- 2026-09-23: created the release branch and this record before changing release metadata.
- 2026-09-23: updated `package.json`, the lockfile root package, and the version contract to `0.5.2-dev1`.
- 2026-09-23: added the `0.5.2-dev1` changelog section, limited to observable shortcut, AI model, diagnostics, and startup-style outcomes.
- 2026-09-23: added an explicit catalog routing regression check for the prerelease suffix.
- 2026-09-23: user approved committing, pushing the release branch, and publishing the `v0.5.2-dev1` source tag.

## Verification Results

- Full unit baseline on the same application code before release-only metadata changes: 1,896 passed, 1 platform-only skip, 0 failed across 357 files.
- Focused version, catalog routing, build-environment, release-gate, platform, and retention contracts: 17 passed, 0 failed.
- `node scripts/release-details.js 0.5.2-dev1`: parsed the changelog and produced five release highlights.
- Production read-only routing: app version `0.5.2-dev1` received catalog `2026-09-23.1`, minimum app version `0.5.2`, with 39 models.

## Verification Plan

- package/lockfile/version contract consistency
- changelog parsing and release-detail output
- release/build focused contracts
- release candidate에서 shortcut, model list, provider connection/generation과 initial style 확인
- stable 승인 전 final diff와 required regression 확인

## Remaining Risks

- provider 계정별로 신규 모델 접근 권한과 실제 과금·latency가 다를 수 있다.
- KIE 이미지 신규 route는 실제 유료 생성 smoke가 필요하다.
- macOS와 Windows에서 단축키 표시·동작 및 packaged startup style을 각각 확인해야 한다.
