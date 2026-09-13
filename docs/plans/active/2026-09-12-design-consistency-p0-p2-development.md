# 뷰 루트 스코핑 + 외모 자가위반 제거 (P0 + P2)

- branch: `codex/feature/design-consistency-p0-p2`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-12
- status: in_progress

## 결정

- P0는 동작 변경 없이 가드레일로 간다. 전 뷰를 grid+gap으로 뒤집으면 기존 마진과 이중 간격이 생겨 전 화면 육안 QA가 필요하다. 대신 bare view-root `display` 금지 계약 테스트로 재발을 막는다.
- help·account의 `#view-X.active`는 패턴 예시로 유지.

## P2

- 레지스트리 항목에 `blurb` 추가, appearance 문구맵 삭제, 기본값 하드코딩 → 첫 selectable.

## 검증

- 계약 (신규 2건 포함) + 풀 suite 1669 pass / 0 fail.
- shell.js 800줄 상한에 걸려 init 호출을 lifecycle로 이동한 것 포함.
- 후속 P1(2026-09-12): danger-outline 2종 → `ui-danger-action` (레거시 설정 2버튼), discovery hex 뱃지 → `ui-status-badge` + 신규 `danger` 상태. 레거시 구역(content-tabs/automation/writing 뱃지)은 P4로 제외. 풀 suite 1671 pass / 0 fail. 스모크는 상호작용 불변이라 생략.
- 후속 P3(2026-09-12): 스핀 키프레임 6종 → `ui-refresh-action-spin` 통일, indeterminante 프로그래스 2종 → `.ui-progress-indeterminate` 신설(feedback.css), 툴팁 토큰화+키보드 parity. 엠티 10종은 구조가 제각각이라 공용 3줄 유틸로 못 묶고 보류. 풀 suite 1673 pass / 0 fail.
- 후속 P6(2026-09-12, audit 1번 영역): 현행 구역 색상 하드코딩 토큰화 — responsive 셸/모바일, social(스피너 흰색·다크칩 제외), clock 중립부. 제외: 레거시 전용 파일, 폰트 px, 모션 시간, 계절·뽀모도로·플립 identity 색, discovery-modal 벌크(별도 규모). 풀 suite 1673 pass / 0 fail.
- 미커밋.
