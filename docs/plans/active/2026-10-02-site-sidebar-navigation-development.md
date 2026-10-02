# 사이트 메뉴 및 진입 화면 개발 기록

## 브랜치와 상태

- 브랜치: `codex/site-sidebar-navigation`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: 자동 검증 완료; parent merge 대기
- 상위 기능 계획: [Static Site Builder](2026-10-01-static-site-builder-main-development.md)
- 선행 설계 기록: [Project/Site 모델 및 사용자 흐름](../archive/2026-10-02-project-site-model-and-user-flow-design.md)

## 사용자 필요와 목표

사용자가 BlogGenius 안에서 사이트 기능을 쉽게 찾을 수 있도록 왼쪽 메뉴에 `웹사이트 > 사이트` 진입점을 추가한다. 사이트 기능은 Project 목록에서 시작한다는 잠정 사용자 흐름을 보여주되, Project/Site 데이터 모델과 생성 동작은 별도 하위 기능으로 다룬다.

## 범위

- 왼쪽 메뉴에 `웹사이트` 그룹과 `사이트` 메뉴를 추가한다.
- 위치는 잠정안인 `홈 → 웹사이트 → 콘텐츠 → 계정 → 시스템`을 적용한다. `콘텐츠 → 웹사이트` 대안의 장단점과 추후 재검토 가능성은 설계 기록에 남아 있다.
- 메뉴 선택 시 기존 앱 navigation/view lifecycle을 따른다.
- 첫 진입 화면에는 준비 중 상태만 간결하게 표시한다. 비활성·미구현 action은 노출하지 않는다.
- 기존 사이드바 디자인 시스템의 그룹, 간격, typography, icon 표현을 재사용한다.
- 관련 navigation/UI contract 검증을 추가 또는 갱신한다.

## 명시적 비목표

- Project/Site 생성, 목록 저장, 편집 및 삭제
- Astro/template 연결, source 편집, preview/build
- Cloudflare account 선택, Worker 생성 및 배포
- 글쓰기·발행 흐름 통합
- 그룹 순서의 영구 확정

## 설계 및 영향 경계

- 사이드바 markup은 `ui/index.html`의 기존 navigation 구조를 따른다.
- 새 view는 기존 view routing과 partial/include 체계를 재사용한다.
- 기존 mobile quick mode에서도 새 view를 잘못된 블로그 화면으로 강제 이동시키지 않는다.
- Feature-owned UI copy는 간결하게 유지한다. SSG 안내 콘텐츠는 추후 관련 가이드 링크로 제공하며 메뉴 화면에 긴 설명을 넣지 않는다.
- 디자인은 기존 sidebar group heading, nav button, empty state와 공통 design guide를 따른다.

## 결정 및 고려한 대안

- 메뉴 그룹명 `웹사이트`, 항목명 `사이트`를 사용한다.
- 잠정적으로 콘텐츠 그룹 위에 둔다. 사이트 Project와 build/deploy를 다루는 새 관리 영역을 앞에 보여주는 장점이 있다.
- 콘텐츠를 먼저 두는 대안은 기존 BlogGenius의 익숙한 글쓰기 흐름을 보존한다. 실제 메뉴 탐색과 사용자 피드백을 확인해 순서를 바꿀 수 있다.
- 메뉴만 추가하면 이동 후 빈 화면이 되므로 최소 진입 scaffold를 함께 두되, 실제 Project 기능은 이 범위에 끌어오지 않는다.

## 구현 진행

- 새 하위 브랜치를 부모 `codex/static-site-builder-main`에서 생성했다.
- 최초 시도는 `codex/project-site-model-and-flow`에서 시작했으나, 사용자가 하위 기능을 직렬로 진행하기로 정해 해당 시도 변경을 stash로 보존했다.
- Project/Site 설계 feature를 부모 `codex/static-site-builder-main`에 먼저 병합하고, 이 브랜치를 `-main`에서 새로 생성한 뒤 보존된 메뉴 변경을 복원했다.
- 사용자가 sidebar 순서를 `홈 → 웹사이트 → 콘텐츠 → 계정 → 시스템`으로 잠정 적용하고 사용 후 변경할 수 있다고 확인했다.
- 메뉴 진입 view는 향후 Project 목록이 될 예정이며, 이번 slice에서는 기능이 준비 중임을 알리는 최소 화면만 둔다.
- `ui/index.html`에 `웹사이트 > 사이트` 그룹/메뉴를 추가하고 잠정 순서를 적용했다.
- `ui/partials/views/site-hosting.html`에 짧은 준비 중 화면을 추가했다. 실제 기능이 없는 버튼은 노출하지 않는다.
- Review 피드백을 반영해 공통 view header 설명을 추가하고 empty-state 제목을 공통 스타일 대상인 `h3`로 맞췄다.
- `scripts/view-header-contract.test.js`에 새 view header와 empty-state heading 계약을 포함했다.
- Browser smoke에서 데스크톱 navigation 목록과 모바일 메뉴 선택 경로에 `site-hosting` 이동을 추가했다.
- `ui/scripts/foundation/navigation.js`에서 모바일 quick mode도 이 view로 이동 가능하게 했다.
- 상위 계획 및 Project/Site 사용자 흐름 설계 문서에 메뉴 순서의 잠정성, 반대 순서의 장단점, 추후 재검토 가능성을 동기화했다.

## 검증 및 남은 작업

- `git diff --check` 통과.
- `node --test scripts/view-header-contract.test.js scripts/ui-structure-contract.test.js`: 통과 (10 pass, 2 기존 skip).
- `npm run test:ui-browser`: 통과. 데스크톱 top-level navigation과 모바일 메뉴에서 `사이트` view를 여는 경로를 검증했다.
- 함께 실행한 `scripts/ui-script-structure.test.js`는 `ui/app.js`의 기존 112줄 상한 검사에서 실패했다. `ui/app.js`는 이 branch에서 수정하지 않았고 나머지 JS composition checks는 통과했다.
- `git diff --check` 통과.
- 사용자는 데스크톱과 좁은 창에서 `웹사이트 > 사이트` 메뉴가 보이고, 눌렀을 때 준비 중 화면이 열리는지 확인할 수 있다.
- sub-feature parent merge 전에는 관련 focused test를 통과시키고, UI 변경이므로 관련 browser/UI regression도 확인한다.

## 종료 요약

- 구현 결과: 메뉴, navigation 연결, 준비 중 진입 화면 완료
- 자동 검증: focused contract 및 browser smoke 통과. 무관한 기존 JS manifest 줄 수 상한 검사 1건 실패.
- 사용자 수동 확인: 구현 후 전달
- 커밋 상태: 미커밋
