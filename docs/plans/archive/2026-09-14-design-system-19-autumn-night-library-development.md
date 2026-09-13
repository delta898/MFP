# 디자인 시스템 19단계 — 가을밤 서재 스타일

- branch: `codex/feature/design-system-19-autumn-night-library`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: complete

## 사용자 필요와 목표

새 스타일을 실제로 하나 추가해 registry·CSS 파일명·manifest·자동 계약 기반이 확장에 충분한지 검증한다. 기존 두 밝은 스타일과 분명히 구분되는 어두운 가을 분위기의 `가을밤 서재`를 제공한다.

## 범위

1. `autumn-night-library` style token module 추가
2. runtime registry와 CSS composition manifest 등록
3. 설정 Beta 선택 UI 자동 노출 검증
4. 공통 component와 주요 화면의 dark-style 호환성 점검
5. 발견된 밝은 화면 전제를 style-neutral token 계약으로 제한 보정
6. focused contract와 browser smoke, 사용자 시각 확인

## 비범위

- 화면별 autumn 전용 selector 추가
- 기능, DOM, API, 저장 구조 변경
- 기존 `따뜻한 에디토리얼`, `고요한 세이지 스튜디오`의 시각 변경
- legacy 화면의 독립적인 dark mode 개편

## 제안 스타일

- ID: `autumn-night-library`
- 이름: `가을밤 서재`
- 짙은 월넛·에스프레소 canvas와 surface
- 따뜻한 아이보리 본문, 구리색 primary action, 마른 잎 olive status
- 기존 editorial보다 작은 radius와 조금 촘촘한 density
- 어두운 배경에서는 큰 그림자보다 surface·border 대비로 hierarchy를 표현

## 결정과 진행 기록

- 2026-09-14: 사용자가 신규 스타일 추가 용이성 검증을 위해 어두운 가을 스타일을 별도 feature branch에서 구현하도록 승인했다.
- 2026-09-14: 기존 두 스타일과 중복을 피하고 밝은 배경 hard-coding을 드러내기 위해 밝은 가을이 아닌 `가을밤 서재` 방향을 선택했다.
- 2026-09-14: style token module, runtime registry와 explicit CSS manifest include만으로 설정 Beta 선택 UI에 세 번째 스타일이 자동 노출됐다. 화면별 style selector는 추가하지 않았다.
- 2026-09-14: 어두운 surface에서 hierarchy는 큰 shadow보다 surface·border 대비를 사용하고, primary action은 copper, success는 dried olive로 분리했다.
- 2026-09-14: 사용자 시각 확인에서 글감 추천 dialog footer가 밝은 흰색 영역으로 분리되는 문제가 발견됐다. 원인은 공통 legacy modal footer의 `#f8fafc` 하드코딩이었으며, autumn 전용 override 대신 `--ui-surface-muted`로 교정해 모든 style이 자신의 surface hierarchy를 사용하도록 했다.
- 2026-09-14: dialog footer 보정 후 사용자가 `가을밤 서재`의 시각 결과를 승인했다.

## 검증 및 결과

- 디자인 style·density·CSS structure·설정 외모 focused contract 38개 통과.
- Browser UI smoke 310 fixture request 통과. Chromium에서 Dashboard 공통 card와 글감 추천 dialog footer가 autumn token의 계산 색상을 실제 적용하고 selectable registry에 노출되는 것을 확인했다.
- 핵심 대비 점검: primary text/surface 12.50:1, secondary text/surface 7.96:1, primary button text/background 5.27:1, muted text/surface 4.81:1.
- 전체 단위 테스트 1,693개 중 1,692개 통과, 플랫폼 의존 1개 제외, 실패 0개.
- `git diff --check` 통과.
- 사용자가 설정 Beta와 dialog의 전체적인 색감·이질감·가독성을 시각 확인하고 승인했다.
- 남은 위험: 독립적인 legacy 화면은 이번 범위에서 별도 dark-mode 개편을 하지 않았으며, 이후 화면 변경 시에도 공통 semantic token을 사용해야 한다.
