# Minimalism Style Development Record

- Branch: `feat/style-minimalism`
- Base: `dev`
- Start date: 2026-09-21
- Status: complete; user verified hands-on, ready for dev merge

## User Need

외모 설정에 '미니멀' 스타일 추가. 극도로 단순한 화면을 원하는 사용자를 위한 일곱 번째 스타일.

## Goal

모노크롬에 가까운 절제된 팔레트, 플랫(그림자 없음), 작은 라운딩의 미니멀 테마를 테마 계약(필수 토큰 전부, `[data-style]` 스코프, 레지스트리 등록)을 지켜서 추가한다.

## Scope

- 신규 `ui/styles/styles/minimalism.css` (전체 토큰, 채널 토큰 포함)
- `ui/styles.css` include + 캐시버스트 bump (styles.css?v=3 → v=4)
- `style-system.js` 레지스트리 등록 (선택 가능)
- 계약 테스트: 테마 특성 단언 + 채널 토큰 목록 + 파일/레지스트리 parity(자동)

## Non-goals

- 레이아웃·밀도 대수술 (기존 배치를 깨지 않는 범위에서 절제)
- v0.5.1 배포 (이후 별도 작업)
- dev 병합·push (사용자 지시 시에만)

## Proposed Design

- quiet-sage 구조를 틀로 전체 토큰 복사 후 값만 조정 (parity 보장)
- 캔버스 플랫 화이트, 텍스트 near-black, 액션 단일 뉴트럴(짙은 회색), 상태색은 절제된 버전 유지(구분 가능성 보존)
- 그림자 none, radius 작게(sm 2px / md 4px / lg 6px, full 유지), 타이포·밀도는 가독 범위 유지
- 라벨 `미니멀`, blurb 극도의 단순함 표현

## Decisions and Tradeoffs

- 상태색(성공/경고/위험)을 완전히 없애지 않음. 구분 불가능해지면 오류·경고를 놓치므로 절제된 톤으로 유지
- 밀도 토큰은 소폭만 조정. 레이아웃 붕괴 위험 대비

## Progress

- 2026-09-21: user requested minimalism style on a separate branch (v0.5.1 to follow). Created branch + record before implementation.
- 2026-09-21: implemented `minimalism.css` (full token parity from quiet-sage structure; flat white, near-black ink, small radii, no shadows), registry entry (selectable), styles.css include + cache-bust v3→v4, trait contract test + channel-token list updated.

## Verification Plan

- 스타일 계약 테스트 (토큰 parity 자동 + 특성 단언)
- 채널 토큰 목록 테스트
- 전체 스위트 (병합 전, 승인 후)
- 사용자 hands-on: 외모에서 미니멀 선택 후 주요 화면 육안 확인

## Verification Results

- Focused style contracts 40 passed (foundation incl. new minimalism trait + parity, appearance, beta shell, structure) + http-server-runtime 7 passed
- Full unit suite before dev merge: pending, requires explicit user approval
- User hands-on: 외모에서 미니멀 선택 후 주요 화면 육안 확인
