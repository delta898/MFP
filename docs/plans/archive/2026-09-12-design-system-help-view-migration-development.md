# Help 뷰 디자인 시스템 이관

- branch: `codex/feature/design-system-help`
- base/parent: `codex/feature/design-system-main` (`b55b4a7`)
- started: 2026-09-12
- status: complete (2026-09-12, merged to parent)

## 사용자 필요·목표

- 도움말 페이지가 마이그레이션된 화면(내 정보 등)과 시각적으로 이질적이다.
- 같은 디자인 시스템 적용으로 위계·액션·토큰을 일치시킨다.

## 범위

- 대상: `ui/partials/views/help.html`, `ui/styles/features/help.css`, `ui/scripts/features/shell/help.js`(최소), 신규 계약 테스트 1건.
- 적용: `ui-overview-card/heading/eyebrow`, `--ui-*` 토큰, 액션 variant 정리, 900/640 분기, reduced-motion.

## 비목표

- 가이드 문구·URL·순서 변경 없음.
- surface-content API, DB 변경 없음.
- 신기능 없음.

## 설계·영향 경계

- `help.js`가 region ID 4종 + 클래스(`help-catalog-copy/step-number/link-arrow/supporting-card-*/guide-navigation-target`)에 의존. 클래스명 유지가 원칙, 변경 시 JS 동반 수정.
- surface-content API 실패 시 로컬 폴백 마크업 유지.
- partial 500줄·CSS 900줄 가드 유지(현재 130/411).

## 사용자 결정

1. 관리 카드 primary 없음 — `연속 발행 설정`·`연결 설정 확인` 둘 다 secondary.
2. `✎/✓` 문자 아이콘 → 공용 symbol로 교체.

## 단계

- S0: `scripts/help-view-design-system-contract.test.js` 신설, Red 확인.
- S1: 마크업 이관 (eyebrow, primary 1개=글쓰기 카드만, 뱃지 `.ui-count-badge`).
- S2: 스타일 토큰 전환, 장식(gradient/lift/고정색) 제거, 5단계 3+2 폴백.
- S3: JS 최소 (focus 토큰, reduced-motion의 scroll auto).
- S4: 계약 테스트 Green + 브라우저 스모크 1회 + 사용자 수동 4장면.

## 진행

- 2026-09-12: S0~S4 완료. 계약 테스트 신설·Green, 브라우저 스모크 통과.
- `help-view-contract.test.js`(구 CTA 클래스 assert) + 스모크 로케이터를 신 클래스로 갱신.
- 문의하기는 `button.primary`가 앵커 미지원이라 `ui-button-link secondary`로 결정 (계약 테스트도 그에 맞춤).
- 단계 숫자 `help-step-number` 제거 → 공용 `ui-sequence-badge`로 (정적+동적 렌더 포함).
- 변경 파일: `help.html`, `help.css` 전면, `help.js` 2줄, 테스트 3건. 미커밋.
- 후속(2026-09-12): 행 타이틀 `label-size→body-size`로 상향. 내 정보 행 값(15px semibold)과 같은 “먼저 읽는 값” 역할로 맞춤. 계약 테스트 Green 유지, interaction 불변이라 스모크는 생략.
- 후속(2026-09-12): 고정 샷 대조에서 제목→설명 리듬 부재 확인. 공용 `overview-card.css`에 `.ui-overview-heading p` 추가(본문/secondary/상단 space-2 — `ui-workflow-heading p`와 동일). 도움말·내 정보·대시보드 세 화면에 동일 적용. 계약 15/15 + 스모크 통과.
- 후속(2026-09-12): 5단계 높이 통일(`li{display:grid}`, 실측 68px×5 균등), 토픽 아이콘 제거(사용자 결정)+단일열 구조, CTA 하단 고정(`grid-template-rows`+`align-self:end`, 바닥 간격 21px 실측). 스크린샷目视+계약+스모크(265) 통과. 여백은 균등 카드 유지로 결정(제안 채택).
- 후속(2026-09-12): 도움말의 레거시 설정 링크(`data-help-nav="settings"`) → 설정 Beta 기본 연결(`settings-next`+`core` 탭)로 전환. 동적 카탈로그에는 설정 링크 없음 확인. 구/신 계약 테스트 갱신 + 스모크 통과. dashboard·알림 등 다른 화면의 레거시 링크는 본 브랜치 범위 밖.
- 버그 수정(2026-09-12): S2에서 넣은 `.help-view{display:grid}`가 합성 순서(help.css가 app-chrome보다 뒤) + 동등 명시도로 `.view{display:none}`을 눌러 도움말이 전 페이지에 노출됨. `#view-help.active`로 스코핑, 같은 잠복 위험의 `#view-account.active`도 함께 경화. 계약 가드 추가. 대시보드 활성 시 help `display:none` 실측 + 계약 15/15 + 스모크 통과. (스모크는 클래스만 보고 visibility를 안 봐서 못 잡았음.)

## 검증·리스크

- 자동: 계약 테스트 + `test-ui-browser-smoke.js`.
- 수동: 5단계·카드 2종·문의하기·640px + API 실패 폴백.
- 리스크: API 블록 vs 로컬 마크업 구조 차이, 5열→3+2 어색 시 대안(2+3/세로 플로우).
