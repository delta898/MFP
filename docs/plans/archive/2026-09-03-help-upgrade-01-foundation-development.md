# Help 고도화 1단계 기반 개발 기록

## Branch

- Branch: `codex/feature/help-upgrade-01-foundation`
- Base/parent branch: `codex/feature/help-upgrade-main`
- Start date: 2026-09-03
- Status: 완료

## 사용자 필요와 목표

사이드바의 Help를 단순 외부 문의 링크가 아니라 BlogGenius 사용법을 앱 안에서 찾는 출발점으로 만든다. 사용자는 처음 설정할 항목과 자주 쓰는 기능을 빠르게 구분하고, 도움이 더 필요할 때 기존 문의 채널로 이동할 수 있어야 한다.

## 범위

- 앱 내부 Help view 및 sidebar navigation
- `시작하기`, `콘텐츠 만들기`, `자동화·관리` 기본 분류
- 기존 공식 가이드 URL을 활용하는 핵심 가이드 카드
- 기존 외부 Help URL을 `문의하기` CTA로 보존
- 로딩 없이 즉시 사용할 수 있는 로컬 기본 콘텐츠
- focused UI contract와 browser smoke 검증

## 명시적 비범위

- Supabase Help 전용 surface/region 및 production 데이터 변경
- Dashboard에서 Help로 이동하는 연결
- 검색·즐겨찾기·열람 이력
- 전자책·후원 콘텐츠의 본격적인 카탈로그
- release, push 또는 배포

## 제안 설계

- Help는 기존 view 전환 구조를 따르는 독립 view로 구현한다.
- 첫 화면은 긴 문서가 아니라 목적별 카드와 명확한 외부 CTA를 제공한다.
- 설치부터 AI 설정까지는 `시작하기`, 실제 글 작성은 `콘텐츠 만들기`, 업데이트와 자동화 관련 안내는 `자동화·관리`로 구분한다.
- 모든 외부 링크는 안전한 새 창 열기 계약을 재사용한다.
- 원격 콘텐츠 연동 전에도 Help가 비어 보이지 않도록 검증된 공식 링크를 로컬 기본값으로 제공한다.

## 진행 및 변경 기록

- 2026-09-03: Help 고도화 parent에서 첫 foundation sub-feature를 시작했다.
- 2026-09-03: 사이드바의 외부 Help 링크를 내부 `도움말` view 진입 버튼으로 전환했다.
- 2026-09-03: 설치·네이버·WordPress·Google Sheets·AI 설정을 5단계 시작 안내로 구성하고, 콘텐츠 만들기와 자동화·관리 카드를 분리했다.
- 2026-09-03: 빠른 글 작성과 연속 발행 설정은 앱 내부 화면으로 연결하고, 상세 설명은 공식 블로그 가이드로 연결했다.
- 2026-09-03: 기존 카카오 커뮤니티 링크는 화면 하단의 `문의하기` CTA로 보존했다.
- 2026-09-03: 모바일 quick mode에서도 Help를 열 수 있도록 탐색 허용 범위를 조정했다.
- 2026-09-03: 사용자 검토에서 Help만 Timer Widget이 빠진 불일치를 확인해 다른 주요 화면과 동일한 전역 시계를 헤더에 추가했다.
- 2026-09-03: 사용자가 내부 Help 화면과 Timer Widget을 확인하고 1단계 마감을 승인했다.

## 최종 결과 및 검증

- focused Help/UI composition/header contract 통과 (21 tests)
- Timer Widget 추가 후 browser smoke 재실행 통과 (176 fixture requests)
- full unit suite 통과 (1,300 tests)
- diff validation: `git diff --check` 통과
- 사용자 UI 확인 완료: 시작 단계의 밀도, 활용 카드 위계, 문의 동선과 Timer Widget 배치를 승인했다.
