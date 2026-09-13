# 디자인 시스템 18단계 — 스타일 registry 파일 규칙

- branch: `codex/feature/design-system-18-style-registry-convention`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-14
- status: complete

## 사용자 필요와 목표

새 디자인 스타일을 추가할 때 스타일 ID와 CSS 파일을 같은 이름으로 연결하고, 테스트가 registry를 기준으로 새 스타일을 자동 발견하도록 한다. 새 스타일마다 테스트의 스타일 목록과 파일 매핑을 반복 수정하지 않아도 되는 구조가 목표다.

## 범위

1. 선택 가능 스타일 ID와 `ui/styles/styles/<id>.css` 파일명의 일치 규칙 정의
2. registry를 기준으로 스타일 파일 존재, selector, 필수 token과 CSS manifest 등록 자동 검증
3. 현재 스타일을 명시적으로 열거하는 테스트 제거 또는 registry 기반 전환
4. 관련 구조·디자인 시스템 계약 테스트 실행

## 비범위

- 신규 디자인 스타일 추가
- 기존 스타일의 색상, 밀도, typography 또는 component 외형 변경
- CSS manifest의 자동 파일 탐색이나 cascade 순서 자동 결정
- 설정 Beta의 스타일 선택 UI 변경

## 설계

- style ID는 안정적인 kebab-case 값으로 유지한다.
- style 파일 경로는 `ui/styles/styles/<style-id>.css` 규칙으로 파생한다.
- registry는 사용자 표시 metadata와 선택 가능 여부의 단일 기준이다.
- `ui/styles.css`의 명시적 include 순서는 cascade source of truth로 유지한다.
- compatibility fallback도 같은 파일명 규칙과 token 계약을 따르되 사용자 선택 목록에는 노출하지 않는다.

## 결정과 진행 기록

- 2026-09-14: 사용자가 ID와 CSS 파일명 규칙 통일, 테스트의 registry 기반 자동 발견을 별도 feature branch 범위로 승인했다.
- 2026-09-14: browser classic-script인 style system을 제품 module로 변환하지 않고, 테스트 전용 loader가 실제 runtime registry를 VM에서 읽도록 했다. 제품 runtime과 테스트 사이에 두 번째 style 목록을 만들지 않기 위한 결정이다.
- 2026-09-14: CSS composition manifest는 cascade 순서의 source of truth이므로 명시적 include 방식을 유지했다. 테스트가 registry 순서에서 기대 style module 목록을 파생해 누락과 순서 오류를 검출한다.
- 2026-09-14: 스타일별 시각 의도를 검증하는 warm editorial·quiet sage 전용 assertion은 회귀 계약으로 유지하되, 전체 style inventory와 공통 token·density 검사는 registry 기반으로 전환했다.

## 검증 및 결과

- `design-style-foundation`, `ui-density`, `ui-style-structure`, `settings-next-appearance` focused contract 37개 통과.
- `git diff --check` 통과.
- Full unit suite: 1,692개 중 1,691개 통과, 1개 플랫폼 의존 테스트 skip, 실패 0.
- registry ID는 kebab-case이고 `ui/styles/styles/<id>.css`와 일대일이어야 한다.
- style directory에 registry 없는 CSS가 있거나, registry에 대응 CSS·selector·필수 token·manifest include가 없으면 계약 테스트가 실패한다.
- 설정 Beta의 선택 UI는 기존과 같이 selectable registry entry를 자동 렌더링하며 사용자 노출 동작과 외형 변경은 없다.
- 제품 runtime, CSS 값과 사용자 노출 UI를 변경하지 않아 별도 browser smoke와 수동 시각 확인은 필요하지 않다.
