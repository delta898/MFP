# Card News 공통 Foundation 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10-01-foundation`
- Base/parent branch: `codex/feature/design-system-card-news-10`
- Start date: 2026-09-10
- Status: 완료

## 사용자 필요와 목표

Card News의 첫 화면부터 현재 제품 style을 사용하고, 이후 slice가 기능 전용 UI를 복제하지 않도록 공통 shell,
navigation, surface, typography와 action 기반을 확립한다.

## 범위

1. Card News의 compatibility style scope 제거
2. 상단 intro와 `새 카드뉴스` / `만든 카드뉴스` navigation을 공통 pattern으로 이관
3. 1단계 source·preview, 2단계 generation, 결과·관리의 상위 surface와 heading을 공통 pattern으로 연결
4. 의미 없는 고정 stage badge 제거와 기본 action 위계 정리
5. Card News style hard-coding 재유입을 막는 focused contract 추가

## 명시적 비범위

- source 입력 control, 미리보기 내부와 RSS source 관리 개편
- 생성 field와 AI request 동작 변경
- 결과 card, image workspace, Buffer 발행 panel 개편
- 관리 row와 ZIP import 개편
- backend API 또는 저장 contract 변경

## 설계 결정

- Card News의 읽기·판단 surface는 `.ui-overview-card`와 `.ui-overview-heading`을 재사용한다.
- workspace navigation은 `.ui-segmented-tabs` / `.ui-segmented-tab`과 공통 keyboard controller를 사용한다.
- 고정 `준비 단계` badge는 실제 workflow 상태를 나타내지 않으므로 제거한다.
- 이 slice에서는 feature layout geometry를 유지하고, 하위 영역의 raw palette 제거는 담당 slice에서 완료한다.

## 구현 진행

- 2026-09-10: Dashboard parent를 `codex/feature/design-system-main`에 fast-forward merge하고 삭제했다.
- 2026-09-10: Card News parent와 foundation sub-branch를 최신 design-system main에서 생성했다.
- 2026-09-10: Card News의 compatibility scope와 고정 `준비 단계` badge를 제거했다.
- 2026-09-10: task form과 result처럼 작업 흐름을 표현하는 범용 `.ui-workflow-card`,
  `.ui-workflow-heading`, `.ui-workflow-eyebrow` pattern을 추가하고 상위 Card News surface에 적용했다.
- 2026-09-10: `새 카드뉴스` / `만든 카드뉴스`와 관리 상태 filter를 공통 segmented navigation으로 이관하고
  `aria-controls`, roving `tabindex`, 방향키·Home/End keyboard 이동을 연결했다.
- 2026-09-10: Card News 전용 surface, heading, workspace tab, refresh icon 중복 CSS를 제거했다.
- 2026-09-10: source control, preview 내부, generation field, result/management row에 남은 raw palette는
  각 후속 slice에서 해당 component 의미를 확정하며 제거한다. foundation 대상의 공통 surface와 navigation에는
  raw 색상이나 style 이름 분기를 두지 않았다.

## 검증

- Card News shell + design foundation focused tests: 24개 통과
- Browser UI smoke: 통과 (fixture request 262건)
- Full unit suite: 1,573개 중 1,572개 통과, 실패 0개, 플랫폼 조건부 1개 skip
- `git diff --check`: 통과
- 사용자 시각 확인: 완료

## 최종 결과와 남은 범위

- Card News가 현재 제품 style과 공통 workflow surface/navigation을 사용하는 기반을 마련했다.
- source 입력·preview·generation·result·management 내부의 legacy palette와 세부 layout은 담당 후속 slice에서
  의미 단위로 이관한다.
