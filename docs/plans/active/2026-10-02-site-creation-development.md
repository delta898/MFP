# Project Site 생성 개발 기록

## 브랜치와 상태

- 브랜치: `codex/site-creation`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: 구현 중; 임시 Astro template 하나로 선택 및 로컬 Site 생성 연결
- 상위 기능 계획: [Static Site Builder](2026-10-01-static-site-builder-main-development.md)
- 선행 Project 관리 slice: [Project 목록·생성·상세](../archive/2026-10-02-site-management-page-development.md)

## 사용자 필요와 목표

Project의 `사이트` 탭에서 새 Site를 추가하고, template을 고르고, 사용자가 알아볼 이름을 입력해 로컬 Site 폴더와 기본 정보를 만든다. Site 준비는 Cloudflare 연결 없이 가능해야 한다.

## 합의한 사용자 흐름과 범위

1. Project 상세에서 Site 목록을 바로 확인하고 `사이트 만들기`를 연다.
2. 사용 가능한 template을 선택한다.
3. Site를 구분할 이름을 입력한다.
4. Site 폴더와 기본 정보를 만들고 Project의 Site 목록에 표시한다.

Project는 이름만으로 생성한다. Domain, root 위치 변경 등 설정은 Site 생성을 진행하며 실제로 필요한지 드러날 때 Project 설정에서 다룬다. Cloudflare 연결·Worker 생성·배포, build/preview, 콘텐츠 저작, export/import는 이 sub-feature의 범위가 아니다.

## 설계 원칙과 미확정 항목

- Project 표시 이름, Site 내부 ID, Site 표시 이름, 사용자 hostname, 배포 대상의 기술 이름은 역할이 다르므로 우선 서로 다른 개념으로 둔다. 같은 문자열을 재사용할 수 있는지는 편의상 구현 세부로 두고, 식별자 계약을 성급히 합치지 않는다.
- 배포 대상 이름을 Site 생성 시 저장할지, 배포 준비 시 생성할지는 흐름 구현에 필요한 최소 결정만 한다. Cloudflare Worker라는 이름을 일반 Site 개념으로 노출하지 않는다.
- Site의 `이름`과 선택 template이 요구하는 사이트 제목/title 설정이 중복될 수 있다. 화면에서 이름이 어떤 용도인지 구분하고, template 필수 입력이 있을 때만 추가 질문한다.
- 외부 template repository는 BlogGenius와 별도 소유다. 기존 template contract spike는 후보일 뿐 합의된 사양이 아니므로 근거 없이 표준으로 채택하지 않는다.
- 사용자 승인: 이번 흐름을 실물로 검증할 수 있게 BlogGenius 내부 `src/site-hosting/templates/minimal-homepage`에 새로 만든 간단한 임시 template 하나를 둔다. 이는 별도 template project의 canonical catalog/spec으로 채택하지 않으며, 외부 catalog가 준비되면 catalog 공급 경계를 확장/교체한다.
- 임시 Astro source는 Site 폴더의 최상위에 복사하고 BlogGenius metadata는 `.bloggenius/site.json`에 저장한다. manifest에는 안정적인 내부 Site ID, Project ID, 화면 표시 이름, template ID/version, 선택적 hostname, 생성/수정 시각을 기록한다.
- 현재 임시 template은 Astro 정적 홈페이지 한 페이지와 기본 `package.json`/`astro.config.mjs`로 제한한다. 일반 설정 언어, 변환 엔진, 사용자별 template 옵션은 만들지 않는다.
- Project root domain은 최대 하나라는 합의를 유지한다. Site hostname은 별도이며 custom domain 미설정이어도 Site 생성 가능하다. 이번 생성 흐름에서 hostname 입력이 실제 필요하지 않으면 Project의 Site 목록 이후 단계로 미룬다.

## 명시적 비목표

- 자유 형식 Astro site builder 제공
- Amade CLI/Docker 실행 또는 기존 Amade template 재사용
- 외부 template catalog/spec을 이 브랜치에서 새 표준으로 확정
- Cloudflare OAuth, account 연결, Worker 생성/배포 및 custom domain 적용
- Astro 실행기, build, local preview
- 기존 Site의 template 변경/upgrade/migration

## 구현/검증 계획

1. 기존 Project persistence/API와 Site 목록의 빈 상태를 확인한다.
2. template 선택에 필요한 최소 source/contract를 합의한다.
3. Site identity와 manifest/folder의 최소 영속 모델을 정의하고, 사용자 흐름을 구현한다.
4. 생성, 목록 반영, 잘못된 입력 및 생성 실패 복구를 focused unit/contract/browser 검증한다.
5. 문서를 갱신하고 사용자가 Site 생성 및 재진입을 확인한다.

## 결정 및 진행 기록

- 사용자는 Project 상세 `사이트` 탭에서 `사이트 추가 → template 선택 → Site 구분 이름 입력 → Site 폴더/기본 정보 생성 및 목록 표시` 흐름을 새 sub-feature에서 진행하기로 승인했다.
- 사용자는 실제 UI 확인 뒤, Project 상세에서 Site 목록을 바로 보여주고 상단에 `사이트 만들기`를 두는 방향을 승인했다. `개요` 탭은 제거하고 설정은 보조 화면으로 둔다. Site가 없는 상태에도 상단 생성 버튼을 유지한다. 초기 설계에서 탭 안의 Site 목록을 기본으로 두었던 결정을 이 IA로 조정했다.
- 사용자는 이번 흐름에 한해 BlogGenius 안의 새롭고 아주 간단한 임시 template 하나를 사용하고, 추후 template source/catalog 연결을 확장하기로 승인했다.
- Project 생성은 이름만 받으며, 세부 Project 설정은 Site 생성 과정에서 필요한 항목을 확인한 뒤 다룬다.
- Site별 workers.dev 주소는 단순하게 자동 생성한다. Project 이름은 URL 구성에 넣지 않는다.
- Site/배포 모델은 Cloudflare 용어에 종속시키지 않되, 지금부터 복수 배포 provider를 일반화하는 추상 계층을 만들지는 않는다.
- Template 선택은 읽기 전용 catalog 목록으로 제공하고, 선택한 항목의 ID/version만 Site metadata에 기록한다. 임시 catalog는 단일 Astro starter만 제공한다.

## 구현 결과 및 검증

- Project 상세를 Site 목록 중심으로 바꾸고 `개요`/`사이트` 탭을 제거했다. Project 진입 즉시 Site 목록을 읽으며, 상단 및 빈 상태에서 `사이트 만들기`로 추가할 수 있다. Project 설정은 보조 화면으로 이동할 수 있다. 현재 선택지는 새로 만든 `간단한 홈페이지` 하나이며 Cloudflare 연결을 요구하지 않는다.
- 임시 starter는 `src/site-hosting/templates/minimal-homepage/`에 있다. standard Astro static project (`package.json`, `astro.config.mjs`, `src/pages/index.astro`)를 Site 폴더 루트에 복사한다. 이 fixture와 catalog reader는 외부 template repository를 대신하는 정식 규격이 아니며 공급 위치를 바꿀 수 있도록 분리했다.
- Site 폴더는 `workspace/site-hosting/projects/{project_id}/sites/{site_id}/`다. 표준 Astro source는 이 경로의 루트에, BlogGenius metadata는 `.bloggenius/site.json`에 저장한다. metadata는 안정적인 Site ID와 Project ID, 사용자 표시 이름, 선택 template ID/version, hostname, 생성/수정 시각을 담는다.
- 사이트 목록은 Site 표시 이름과 template 표시명만 노출한다. Site ID, 경로, Cloudflare worker name은 이번 UI에서 노출하지 않는다.
- Template catalog/site repository/service/local route와 UI flow에 focused 테스트를 추가했다. 다음 테스트 결과를 확인했다: 28 tests, 26 pass, 2 기존 skip.
- `npm run test:ui-browser`는 Project 진입 시 Site 목록 자동 조회, 빈 목록 생성 액션, Site 생성, 설정 화면 왕복을 반영한 뒤 통과했다(393 fixture requests). 사용자가 전체 smoke 반복은 불필요하다고 해 최종 copy/정리 후 재실행은 중단했다.
- 최종 상태 focused 검증: 관련 unit/contract 30개 중 28 pass, 기존 skip 2개; `node --check`와 `git diff --check` 통과. 시각적 UI 평가는 이번 기능 검증 목표에 포함하지 않았다.
- 남은 사용자 확인: Project의 `사이트` 탭에서 임시 template을 고르고 한글 Site 이름으로 생성해 목록에 표시되는지 확인한다. 현재 branch는 아직 commit/merge하지 않았다.
