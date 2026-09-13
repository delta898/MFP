# 뷰 루트 스코핑 + 외모 자가위반 제거 (P0 + P2)

- branch: `codex/feature/design-consistency-p0-p2`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-12
- status: complete (2026-09-14)

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
- 후속(2026-09-12): discovery-modal 75건 토큰 매핑 완료. 색상 하드코딩·레거시 var 0건, 전부 --ui-*. 폰트 px·모션은 제외. 풀 suite 1673 pass / 0 fail.
- 후속 P5(2026-09-12): 정본 {640·768·1100} (+밴드 엣지 769/961, 동결 legacy 1240). 35건 이동, 계약 강제, 영향 테스트 6건 갱신. 태블릿(768) 스크린샷目视. 풀 suite 1674 pass / 0 fail.
- 후속(2026-09-12): 폰트 px·웨이트 180건 토큰 매핑(현행 구역. 시계 숫자·모바일 스케일·아이콘 글리프·레거시 제외). 모션은 트랜지션 선언만 토큰으로(루프·등장 연출 유지). 영향 테스트 3건 갱신. 블로그 스크린샷目视. 풀 suite 1676 pass / 0 fail.
- 결정(2026-09-12): 시계 identity 색(계절·뽀모도로·플립)은 유지(A). 카드 배경·텍스트는 토큰 추종, 악센트층은 계절 정체성 보존.
- 잔여 마무리(2026-09-12): Ultra 300 표기 정합, 레거시 설정 handoff 전면 Beta 전환(데드 헬퍼·핸들러 삭제), docs 설정 용어 정리, premium-input 실체 정의, 키워드 모달 문구·footer 정렬. 스모크 통과(278). 중간 2144 실패 1회는 격리 재현 정상·단독 재실행 통과로 부하성 플레이크 판정.
- 계약 마무리(2026-09-14): 제품 style 대상 view와 stylesheet 계약을 `scripts/design-system-targets.js` 한 곳으로 통합했다. strict 검사에서 제외되는 파일은 compatibility·접근성·시계 identity 등 이유를 manifest에 명시하며, 신규 대상이 조용히 검사에서 빠지지 않게 했다.
- 기존 `type, weight, motion` 테스트가 motion을 검사하지 않던 오류를 바로잡았다. typography와 motion 검사를 분리하고, 현행 surface의 transition이 `--ui-motion-*` 또는 `--ui-transition-*` token을 사용하며 raw duration을 소유하지 않는지 검증한다.
- 구현은 동작·DOM·레이아웃·시각 값을 변경하지 않는 계약/기록 범위로 한정했다. focused design/style 계약 63건이 통과했다.
- 최종 병합 게이트(2026-09-14): `npm run test:unit` 전체 1,680건 중 1,679건 통과, 1건 skip, 0건 실패. 사용자 승인 후 parent 병합 대상으로 확정했다.
