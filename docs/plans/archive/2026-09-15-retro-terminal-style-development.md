# Retro Terminal Design Style Development Record

## Branch

- Branch: `codex/feat/retro-terminal-style`
- Base/parent branch: `dev`
- Start date: 2026-09-15
- Status: complete; automated merge gates passed, visual refinement may continue as follow-up

## User Need

최근 추가된 BlogGenius 기능들이 등록된 디자인 스타일 전환에서도 일관되게 동작하는지 검증하면서, 제품의 AI·자동화·
실행 도구 성격과 어울리는 옛 터미널 감성의 선택형 스타일을 하나 더 제공한다.

## Goal

- 기존 style registry와 semantic token 계약을 따르는 `레트로 터미널` 스타일을 추가한다.
- 짙은 화면, 절제된 phosphor 색상, 선명한 경계와 낮은 radius로 터미널 인상을 만든다.
- 한글 본문, 입력, 긴 원고와 이미지 미리보기의 가독성을 유지한다.
- 성공·경고·오류·비활성 상태의 의미와 접근성 대비를 보존한다.
- 개별 기능 화면의 style-specific 분기 없이 최근 추가 기능까지 전체 토큰 적용 상태를 검증한다.

## Scope

- design style registry metadata와 설정 Beta 선택 UI
- 새 style pack CSS와 stylesheet composition
- style contract, density, 구조 및 브라우저 전환 회귀
- canonical style architecture documentation

## Explicit Non-goals

- 실제 terminal emulator, 명령 입력 또는 개발자 로그 UI 추가
- 모든 사용자 문구에 `$`, `>`, `[OK]` 같은 장식 접두사 추가
- 원고 본문과 긴 설명에 강제 monospace 적용
- CRT 깜빡임, 움직이는 scanline 또는 과도한 glow
- 기존 스타일의 시각 재설계
- version bump, release, push 또는 `dev` 병합

## Proposed Design

1. 기존 필수 semantic token 전체를 새 style root에서 구현한다.
2. app chrome, heading, button과 compact status에는 terminal 계열 mono stack을 사용한다.
3. 원고·설명·입력 본문은 한글 가독성이 검증된 기존 sans stack을 유지한다.
4. near-black 배경과 muted phosphor green을 기본으로 하고 amber는 주 행동, blue/red는 정보·위험 의미에만 쓴다.
5. border와 inset surface로 구조를 표현하고 shadow와 radius는 줄인다.
6. 이미지와 미디어는 원색을 유지하며 frame만 스타일 토큰으로 표현한다.

## Verification

- registry/required-token/style-isolation contract
- semantic contrast and density contract
- UI/CSS composition and file-boundary checks
- browser style selection, persistence, state preservation and major-surface smoke
- 사용자 hands-on visual review
- merge 전 사용자 승인 후 full unit suite

## Progress

- 2026-09-15: user selected `레트로 터미널` as an additional optional design style and approved branched development.
- 2026-09-15: created the feature branch and development record before material implementation.
- 2026-09-15: registered `retro-terminal`, added its complete semantic/component token pack and connected it to the ordered CSS composition manifest.
- 2026-09-15: chose amber for primary commands and phosphor green for successful state so action priority and status meaning remain distinct.
- 2026-09-15: used a system monospace-first stack for Latin glyphs and numerals while retaining `Noto Sans KR` as the Korean fallback; no feature-specific style selectors were introduced.
- 2026-09-15: documented the stable style intent and updated the canonical style registry description from four to five product styles.
- 2026-09-15: added focused contract and browser assertions for the new pack, registry count and computed surface values.

## Current Result

`레트로 터미널` is available from the registry-driven appearance selector. It changes palette, type character,
density, geometry and elevation through the existing token boundary while preserving feature DOM and behavior.

Automated verification completed:

- `node --test scripts/design-style-foundation.test.js scripts/settings-next-appearance-contract.test.js scripts/ui-density-contract.test.js` — 29 passed
- `npm run test:ui-browser` — passed, 345 fixture requests
- token contrast spot-check — primary/secondary text and primary/success/info/danger actions are 7.41:1–15.98:1 against their intended dark surfaces
- `npm run test:unit` — 1,809 passed, 0 failed, 1 platform-specific Windows bootstrap test skipped on macOS

Manual checks still required:

- 설정 Beta에서 `레트로 터미널` 선택 카드와 실제 전환 인상
- 대시보드, 블로그 Beta, 카드뉴스의 긴 한글·버튼·상태 대비
- 이미지 미리보기의 원래 색상과 좁은 화면에서의 읽기 품질
- 장시간 사용 시 green/amber 밝기와 피로도

## Remaining Risks

- 녹색 계열만 과도하게 사용하면 상태 의미와 버튼 우선순위가 약해질 수 있다.
- 전역 monospace는 한글 fallback과 긴 글 읽기 품질을 떨어뜨릴 수 있다.
- 장식 효과가 reduced-motion, 저해상도와 장시간 사용성을 해치지 않아야 한다.
- 실제 디스플레이별 phosphor text와 border 대비는 사용자 시각 검토가 필요하다.

## Final Result

- 사용자가 full regression과 `dev` 통합을 승인했으며 모든 자동 merge gate가 통과했다.
- 실제 디스플레이에서의 장시간 가독성과 최종 시각 취향은 release 전 hands-on review 대상으로 남긴다.
- version bump, release와 push는 이 branch 범위에 포함하지 않는다.
