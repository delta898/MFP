# 설정 앱 > 외모 탭 (스타일 선택)

- branch: `codex/feature/settings-appearance-tab`
- base/parent: `codex/feature/design-system-main`
- started: 2026-09-12
- status: in_progress

## 사용자 필요·목표

- warm-editorial(기본)과 quiet-sage-studio(테스트용)를 설정에서 고르게 한다.

## 범위

- 앱 local 탭에 `외모` 추가 (외부 연결·입력 환경·일반 다음).
- 레지스트리 구동 미리보기 카드: `data-style` 래퍼 실렌더, 클릭 즉시 적용.
- localStorage 영속 + 부팅 복원. compatibility 제외.
- `selectable: true` 전환 2건 포함.

## 비목표

- 신규 스타일 추가, compatibility 노출·삭제.
- config.json 저장 (기기 외모 취향은 local).

## 설계

- 미리보기는 목업이 아니라 토큰 실렌더 (속성 셀렉터 특성 활용).
- 탭 전환·키보드 이동은 기존 제네릭 그대로 (allowlist +1만).
- 계약 테스트 + 스모크.

## 진행

- 구현 완료 (외모 탭·레지스트리·영속·계약 테스트). 계약 19/19 Green.
- 스모크 보류: 머신 과부하(load 7+)로 깨끗한 부모(473837c)도 페이지 로드 실패. 변경 무관 환경 이슈. 가벼워지면 재실행.
- 미커밋.
