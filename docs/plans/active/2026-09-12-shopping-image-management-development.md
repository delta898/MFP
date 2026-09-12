# 쇼핑커넥트 이미지 관리 섹션 신설

- branch: `codex/feature/shopping-image-management`
- base/parent: `codex/feature/design-system-main` (`0f4e0ec`)
- started: 2026-09-12
- status: complete (2026-09-12, merged to parent)

## 사용자 필요·목표

- 레거시 설정 > 쇼핑커넥트의 CTA 기본 이미지 설정+복원이 Settings Beta에 없다.
- 소유권상 쇼핑커넥트 화면이 가져야 한다. 빠른 글 작성 탭에 `이미지 관리` 접이 섹션 신설.

## 범위

- `shopping.html` 빠른 탭에 disclosure 섹션 1개 (CTA 3슬롯, cta1 필수, 슬롯별 변경, 기본 이미지로 복원, 미리보기).
- 신규 JS/CSS + 계약 테스트. 기존 `/api/v1/settings/shopping-image` 저장/미리보기 API 재사용.
- 디자인 시스템(disclosure, secondary, feedback 슬롯) 준수.

## 비목표·제약

- 레거시 모듈(`settings/shopping-images.js`, legacy 컨트롤러)과 연동·import 금지. 동작만 참고하고 새로 구현. 레거시는 별도 삭제 예정.
- Settings Beta에 두지 않는다.
- 부모 브랜치의 미커밋 로그-게이팅 작업을 흡수하지 않는다.

## 설계

- `참고·글 구성`, `발행 설정`과 같은 disclosure 형식. 요약행에 현재 상태 요약.
- 복원은 되돌리기 가능한 단일 action → 중립 secondary, 사전 확인 없음.
- cta1 미설정 시 저장 차단 + feedback에 다음 행동 명시.

## 진행

- 2026-09-12: 구현 완료. `shopping.html`에 `blog-next-disclosure` 3번째 섹션, 신규 JS/CSS 모듈, 매니페스트 등록, 계약 테스트 4건 Green.
- 저장 경로: 파일 업로드(`/api/v1/settings/shopping-image`) 후 image 4키 scoped `POST /api/v1/settings/major`, 초기값은 `GET major`의 slots. 서버 변경 없음.
- 구조 테스트 매니페스트 순서 2건에 신규 항목 등록.
- 계약+구조 22건 Green, 스모크 통과. (중간에 겹쳐 실행한 스모크 1회가 타이밍 실패했으나 단독 재실행 통과 — 변경 무관.)
- 후속(2026-09-12): 순서 이미지→글 구성→발행 설정으로 이동, 라벨 단축(교체/복원/삭제), 액션 우하단 고정(copy flex+auto). 계약 Green. interaction 불변이라 스모크 생략.
- 후속(2026-09-12): 2열 그리드+썸네일 확대(contain), 메타를 기본값/파일명으로. URL 입력은 제외(레거시에도 없는 UI, 희소 기능). 계약 Green.
- 후속(2026-09-12): 저장 버튼 primary 승격 + feedback을 footer 행으로 통합. 경계 밀착은 공용 `.blog-next-disclosure-grid` 래퍼 누락이 원인이라 감싸서 해결(하단 간격 실측 21px). 계약 Green.
- 후속(2026-09-12): 카드 고정 높이(12rem)+이미지 전체표시(contain, wide 판정 삭제)+액션 전 카드 한 줄. 구조를 상단(top 3:2)/액션행 분리로 변경, (필수) nowrap. 스크린샷目视+계약 Green.
- 미커밋. 부모의 미커밋 로그-게이팅 작업은 손대지 않음.

## 검증·리스크

- 계약 테스트 + 브라우저 스모크 1회.
- 리스크: 슬롯 업로드·미리보기 API 응답 형식은 레거시와 동일해야 함(서버는 그대로).
