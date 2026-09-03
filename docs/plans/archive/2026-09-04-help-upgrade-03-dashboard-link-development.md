# Help 고도화 3단계 Dashboard 연결 개발 기록

## Branch

- Branch: `codex/feature/help-upgrade-03-dashboard-link`
- Base/parent branch: `codex/feature/help-upgrade-main`
- Start date: 2026-09-04
- Status: 완료

## 사용자 필요와 목표

Dashboard는 운영 정보를 중심으로 유지하되, 활용 팁에서 더 자세한 안내가 필요한 사용자가 내부 Help로 자연스럽게 이동할 수 있게 한다. Help 고도화의 마지막 연결 동선을 완성한다.

## 범위

- Dashboard 활용 팁에서 내부 Help로 이동하는 명시적 행동
- 기존 Dashboard 정보 밀도와 원격 tip 회전 동작 보존
- navigation 및 browser UI 회귀 검증
- Help parent 개발 기록 최종 정리

## 명시적 비범위

- Dashboard 카드 구조 재설계
- Help 검색·즐겨찾기·열람 기록
- 새로운 원격 콘텐츠 또는 Supabase 데이터 변경
- release, push 또는 배포

## 사용자와 결정한 사항

- 가이드 본체는 Dashboard 탭이 아니라 내부 Help가 소유한다.
- Dashboard에는 운영 정보와 가벼운 활용 팁만 유지한다.
- 개발자 블로그·전자책·후원 자료는 2단계에서 Help의 보조 영역으로 이미 분리했다.

## 제안 설계

- 현재 Dashboard 활용 팁 카드의 주 행동을 유지한다.
- 카드 또는 section 수준에 `전체 가이드 보기` 보조 행동을 한 곳만 제공해 중복 CTA를 피한다.
- 내부 `navigateTo('help')` 경계를 사용하고 외부 브라우저를 열지 않는다.

## 진행 및 변경 기록

- 2026-09-04: 2단계를 Help parent에 병합한 뒤 마지막 Dashboard 연결 sub-feature를 시작했다.
- 2026-09-04: Dashboard `BlogGenius 활용 팁` section 우측에 `전체 가이드 보기`를 한 번만 배치하고, 기존 내부 navigation 경계로 Help에 연결했다. 원격 팁 카드 자체의 행동은 변경하지 않았다.
- 2026-09-04: 사용자가 최종 UI와 내부 Help 이동을 확인하고 1차 Help 고도화 범위를 승인했다.

## 최종 결과 및 검증

Dashboard에서 내부 Help로 이어지는 최소 동선을 구현하고 사용자 UI 확인을 완료했다. 향후 콘텐츠가 늘어나면 정보 구조와 탐색 방식을 별도 최적화한다.

- focused dashboard/help/UI contracts: 17 passed
- browser smoke: 176 fixture requests passed
- `git diff --check`: 통과
- full unit suite: 1,305 passed
- remote mutation: 없음
