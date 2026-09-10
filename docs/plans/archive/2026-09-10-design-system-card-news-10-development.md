# Card News 디자인 시스템 적용 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-10
- Status: 완료 · 사용자 UI 확인 및 자동 검증 통과

## 사용자 필요와 목표

Card News의 기존 기능과 작업 상태를 보존하면서 Settings Beta와 Dashboard에서 확립한 디자인 시스템을 적용한다.
색상과 크기를 화면별로 고정하지 않고 공통 navigation, surface, typography, status와 action pattern을 재사용한다.

## 범위

1. Card News 화면 shell과 공통 component foundation 이관
2. 원문 선택·미리보기와 RSS source 관리의 정보 구조 정리
3. 카드 설정·AI 생성 action과 상태 표현 정리
4. 결과·개별 이미지 작업 흐름 정리
5. Buffer SNS 발행 흐름 정리
6. 만든 카드뉴스·ZIP 복원과 responsive/accessibility 및 상태 정합성 점검

## 명시적 비범위

- Card News 생성·발행 backend의 재설계
- 자동 생성 또는 예약 발행 추가
- AI model, quota 또는 외부 서비스 credential 정책 변경
- 기존 `블로그` surface 변경

## 사용자 결정

- Card News는 별도 parent feature branch와 review 가능한 slice별 sub-branch로 진행한다.
- 각 slice의 구현과 focused 자동 검증 뒤 사용자가 직접 UI를 확인한다.
- 사용자 승인 뒤에만 해당 slice를 commit하고 parent에 merge한 뒤 sub-branch를 삭제한다.
- 기능별 raw 색상·style 조건문을 추가하지 않고 `warm-editorial`, `quiet-sage-studio`가 같은 DOM과 동작을 공유한다.

## 구현 slices

1. 공통 foundation과 화면 shell
2. 원문 선택·미리보기·source 관리
3. 카드 설정·AI 생성
4. 결과·개별 이미지 작업
5. SNS 발행
6. 만든 카드뉴스·ZIP 복원·최종 전수 점검

- [Slice 1: 공통 foundation과 화면 shell](../archive/2026-09-10-design-system-card-news-10-01-foundation-development.md)
- [Slice 2: 원문 선택·미리보기·source 관리](../archive/2026-09-10-design-system-card-news-10-02-source-preview-development.md)
- [Slice 3: 카드 설정·AI 생성](../archive/2026-09-10-design-system-card-news-10-03-generation-development.md)
- [Slice 4: 결과·개별 이미지 작업](../archive/2026-09-10-design-system-card-news-10-04-results-development.md)
- [Slice 5: SNS 발행](../archive/2026-09-10-design-system-card-news-10-05-publishing-development.md)
- [Slice 6-1: 상태 체계·만든 카드뉴스 목록](../archive/2026-09-10-design-system-card-news-10-06-01-managed-status-development.md)
- [Slice 6-2: 프로젝트 snapshot·재진입](../archive/2026-09-10-design-system-card-news-10-06-02-project-snapshot-development.md)
- [Slice 6-3: style hard-coding 전수 검사](../archive/2026-09-10-design-system-card-news-10-06-03-style-audit-development.md)
- [Slice 6-4: ZIP 가져오기 dialog 전환](../archive/2026-09-10-design-system-card-news-10-06-04-zip-dialog-development.md)
- [Slice 6-5: top/sub menu 계층 통일](../archive/2026-09-10-design-system-card-news-10-06-05-navigation-hierarchy-development.md)
- [Slice 6-6: 단계 라벨·패널 헤더 통일](../archive/2026-09-10-design-system-card-news-10-06-06-stage-headings-development.md)

## 최종 결과

- Card News의 top menu, local menu, panel, typography, status badge, action과 dialog를 공통 디자인 시스템
  pattern과 semantic token 기반으로 통일했다.
- `새 카드뉴스`와 `만든 카드뉴스`를 같은 목록 → 원문 확인 → 카드 작업 → 발행 문법으로 정리하고,
  목록·미리보기·카드 결과의 연결 상태를 workspace별로 분리했다.
- 카드 설정, 빈 이미지와 완성 이미지의 action, hover 도구, 고정된 카드 본문 영역과 3열 기본 배치를
  일관된 작업 흐름으로 정리했다.
- 발행 UI를 modal이 아닌 3단계 inline panel로 바꾸고, 필수 연결을 진입 전에 확인하며 외부 도움말은
  별도 웹 페이지로 열도록 정리했다.
- 피드 소스 관리와 ZIP 가져오기는 transaction dialog pattern을 사용하고, feature별 고정 palette와
  중복 heading/eyebrow를 제거했다.

## 검증과 인수

- focused Card News 계약 테스트: 15개 통과
- `npm run test:ui-browser`: 256개 fixture 요청 통과
- `npm run test:unit`: 1,600개 통과, 1개 환경 의존 테스트 skip, 실패 0
- 사용자가 각 slice의 실제 화면과 주요 동선을 순차 확인하고 Card News 디자인 개선 종료를 승인했다.

## 남은 비범위 작업

- RSS별 생성 개수, 피드 조회 수의 의미와 제한, 카드뉴스 삭제, 저우선순위 주기 발행은
  `docs/backlog.md`의 별도 기능 작업으로 유지한다.
- 상태·재진입의 추가 기능 정합화 역시 디자인 parent의 범위를 넓히지 않고 별도 backlog에서 다룬다.
