# Card News 디자인 시스템 적용 개발 기록

## Branch

- Branch: `codex/feature/design-system-card-news-10`
- Base/parent branch: `codex/feature/design-system-main`
- Start date: 2026-09-10
- Status: slice 2 진행 중

## 사용자 필요와 목표

Card News의 기존 기능과 작업 상태를 보존하면서 Settings Beta와 Dashboard에서 확립한 디자인 시스템을 적용한다.
색상과 크기를 화면별로 고정하지 않고 공통 navigation, surface, typography, status와 action pattern을 재사용한다.

## 범위

1. Card News 화면 shell과 공통 component foundation 이관
2. 원문 선택·미리보기와 RSS source 관리의 정보 구조 정리
3. 카드 설정·AI 생성 action과 상태 표현 정리
4. 결과·이미지 작업·Buffer 발행 흐름 정리
5. 만든 카드뉴스·ZIP 복원과 responsive/accessibility 정리

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
4. 결과·이미지 작업·SNS 발행
5. 만든 카드뉴스·ZIP 복원·최종 전수 점검

- [Slice 1: 공통 foundation과 화면 shell](../archive/2026-09-10-design-system-card-news-10-01-foundation-development.md)
- [Slice 2: 원문 선택·미리보기·source 관리](../archive/2026-09-10-design-system-card-news-10-02-source-preview-development.md)
