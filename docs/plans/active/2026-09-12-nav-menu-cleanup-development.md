# 좌측 메뉴 정리 (new/Beta 뱃지 제거, 레거시 설정 숨김, 설정 개명)

- branch: `codex/feature/nav-menu-cleanup`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-12
- status: in_progress

## 변경

1. 대시보드 `new` 뱃지 제거.
2. 카드뉴스 `new` 뱃지 제거.
3. 레거시 설정 메뉴 `hidden` (뷰·라우트는 유지, 삭제는 별도 단계).
4. 설정 Beta의 `Beta` 뱃지 제거.
5. `설정 Beta` → `설정` (메뉴, 설정 화면 h1·탭 aria, UI 문구 5건, 서버 메시지 1건).
6. `.nav-new-badge` CSS 규칙 제거 (사용처 0건).

## 비목표

- 레거시 설정 뷰 삭제 (별도 예정).
- docs/ 용어 정리 (후속 제안).

## 검증

- 영향 테스트 갱신 + 브라우저 스모크 통과.
- 스모크의 숨은 레거시 의존 2건도 함께 수정 (숨은 버튼 클릭 → navigateTo/evaluate 방식).

## 진행

- 완료. 미커밋.
