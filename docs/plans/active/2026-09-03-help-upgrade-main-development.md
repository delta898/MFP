# Help 고도화 개발 기록

## Branch

- Branch: `codex/feature/help-upgrade-main`
- Base/parent branch: `dev`
- Start date: 2026-09-03
- Status: 진행 중

## 사용자 필요와 목표

Dashboard는 운영 정보를 중심으로 유지하고, 설치·연동·글쓰기·자동화 안내와 개발자 자료는 앱 안에서 탐색할 수 있는 Help로 분리한다. 기존 사이드바의 외부 문의 링크를 내부 Help 진입점으로 바꾸되 문의 채널 자체는 잃지 않는다.

## 범위

1. 앱 내부 Help 화면과 사이드바 진입 동선
2. 시작하기·글쓰기·자동화·연동 설정 중심의 가이드 정보 구조
3. `app_surface_contents` 기반 원격 가이드 콘텐츠 표시와 안전한 실패 처리
4. 기존 외부 문의 링크를 Help 안의 명시적 `문의하기` 행동으로 보존
5. Dashboard 활용 팁에서 전체 가이드로 이동하는 연결
6. 개발자 블로그·전자책·후원 자료를 핵심 가이드와 분리한 보조 영역

## 명시적 비범위

- Help 콘텐츠 편집용 backoffice
- 전문 검색, 즐겨찾기, 열람 이력 동기화
- 결제·후원 처리
- Help 카탈로그 외 production surface-content 데이터 변경
- 버전 변경, release, push 또는 배포

## 사용자와 결정한 사항

- Dashboard에 가이드 탭을 추가하지 않고 가이드 본체를 Help로 분리한다.
- Dashboard에는 운영 정보와 가벼운 활용 팁·간헐적 teaser만 유지한다.
- 기존 Help의 외부 문의 목적은 삭제하지 않고 내부 Help 화면 안에서 찾을 수 있게 한다.
- 기능을 단계별 sub-feature로 나누고 사용자가 최종 UI를 직접 확인한다.

## 제안 설계와 단계

### 1. 내부 Help 기반

- 내부 view와 sidebar navigation을 추가한다.
- 핵심 분류와 기본 카드 레이아웃을 제공한다.
- 기존 외부 Help URL을 `문의하기` CTA로 보존한다.
- 원격 데이터가 없어도 이해 가능한 로컬 fallback을 제공한다.

### 2. 원격 가이드 카탈로그

- Help 전용 surface/region 계약을 정의하고 원격 콘텐츠를 분류해 표시한다.
- 로딩·빈 상태·실패가 Help 전체를 막지 않게 한다.

### 3. Dashboard 연결과 보조 자료

- Dashboard 활용 팁의 전체 가이드 이동을 연결한다.
- 개발자 블로그·전자책·후원은 핵심 안내와 시각적으로 분리한다.

## 진행 및 변경 기록

- 2026-09-03: Dashboard 2차 고도화 parent를 `dev`에 병합한 뒤 Help 고도화 parent를 시작했다.
- 2026-09-03: 첫 sub-feature `codex/feature/help-upgrade-01-foundation`에서 내부 Help view와 기본 가이드 탐색 동선을 구현하고 사용자 UI 확인 및 전체 unit suite를 완료했다. 세부 기록은 [Help 기반 개발 기록](../archive/2026-09-03-help-upgrade-01-foundation-development.md)을 따른다.
- 2026-09-03: 두 번째 sub-feature `codex/feature/help-upgrade-02-remote-catalog`에서 Help 전용 원격 가이드 카탈로그 연결을 시작했다. 세부 기록은 [원격 카탈로그 개발 기록](../archive/2026-09-03-help-upgrade-02-remote-catalog-development.md)을 따른다.
- 2026-09-04: 2단계 코드와 fixture 기반 자동 검증을 완료하고, 사용자 승인에 따라 Help 카탈로그 운영 SQL을 Development에만 적용했다. 총 11개 placement를 확인했으며 Production에는 적용하지 않았다.
- 2026-09-04: v0.4.1이 installer hot patch로 이미 배포됐다는 사용자 확인에 따라 다음 기능 버전을 `0.4.2` 후보로 정정했다. 사용자 승인 후 Help 카탈로그 11건을 Production에 `minimum_app_version = 0.4.2`로 선반영하고 조회 검증했다.
- 2026-09-04: 2단계를 parent에 병합하고 마지막 sub-feature `codex/feature/help-upgrade-03-dashboard-link`에서 Dashboard 활용 팁과 내부 Help 연결을 시작했다. 세부 기록은 [Dashboard 연결 개발 기록](../archive/2026-09-04-help-upgrade-03-dashboard-link-development.md)을 따른다.
- 2026-09-04: Dashboard 활용 팁 우측에 중복 없는 `전체 가이드 보기` 행동을 추가하고 내부 Help 이동을 자동 검증했다. 사용자 UI 확인을 기다린다.
- 2026-09-04: 사용자가 Dashboard 연결 UI를 승인했다. 3단계 parent 병합 전 전체 단위 테스트 1,305개를 통과했다.

## 최종 결과 및 검증

진행 중. 각 단계는 독립적인 sub-feature 기록과 자동 검증 결과를 남긴다.
