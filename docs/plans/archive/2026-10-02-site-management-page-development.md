# 사이트 관리 화면 내부 개발 기록

## 브랜치와 상태

- 브랜치: `codex/site-management-page`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: Project 첫 slice 구현 및 사용자 검토 완료; 부모 브랜치 병합 대기
- 상위 기능 계획: [Static Site Builder](2026-10-01-static-site-builder-main-development.md)
- 선행 모델 설계: [Project/Site 데이터 모델 및 사용자 흐름](../archive/2026-10-02-project-site-model-and-user-flow-design.md)
- 선행 UI 진입점: [사이트 메뉴 및 진입 화면](../archive/2026-10-02-site-sidebar-navigation-development.md)

## 사용자 필요와 목표

`웹사이트 > 사이트`에 들어온 사용자가 Project와 Site를 실제로 관리하는 첫 화면 흐름을 제공한다. Cloudflare 연결 없이도 로컬 Project/Site를 만들고 관리할 수 있다는 제품 경계를 유지한다.

## 기능 인벤토리 초안

사용자가 생각한 장기 관리 기능을 아래처럼 정리한다. `export/import`는 선택 기능이며, 구체적인 package·이동·충돌 규칙은 별도 설계가 필요하다.

| 대상 | 기능 |
| --- | --- |
| Project | 생성, 목록, 상세 보기, 편집, 삭제, export(선택), import(선택) |
| Site | 생성, 목록, 상세 보기, 편집, build, preview, deploy, 삭제, export(선택), import(선택) |

Site는 한 Project에 속하고, Project 상세 안에서 해당 Project의 Site를 목록으로 보여주는 구조를 기본 후보로 둔다. Site의 build/preview는 로컬, deploy는 Cloudflare 연동을 사용한다.

## UI 정보 구조 초안

```text
왼쪽 메뉴
└─ 웹사이트
   └─ 사이트
      ├─ Project 목록                         # 첫 slice
      │  ├─ Project 생성                       # 첫 slice
      │  └─ Project 선택
      └─ Project 상세                          # 첫 slice의 상세 진입 수준
         ├─ 개요                               # Project 정보 요약
         ├─ 사이트                             # Site 목록
         └─ 설정                               # domain, 저장 위치, 계정 등 단계적 제공 후보

Project 상세 > 사이트 목록 > Site 선택
└─ Site 상세
   ├─ 개요
   ├─ 편집
   ├─ 빌드 / 미리보기
   └─ 배포
```

참고 패턴은 Vercel의 Project 목록 → Project dashboard 진입 → Overview와 설정 영역의 분리다. BlogGenius는 이를 복제하지 않고 Project/Site 소유 관계와 로컬 build/preview, Cloudflare 배포의 차이를 반영한다. ([Vercel Projects](https://vercel.com/docs/projects), [Project Settings](https://vercel.com/docs/project-configuration/project-settings))

Project 상세를 `개요 / 사이트 / 설정`으로 나누는 안은 사용자가 1차 시각 검토를 위해 승인했다. Site 상세의 하위 IA는 다음 단계에서 개요와 주요 작업(빌드·미리보기·배포), 설정/기록을 확장할 공간으로 둔다.

초기 검토에서 비교한 화면 패턴:

- **한 화면에서 탐색**: Project 목록에서 Project를 선택하면 같은 view의 detail pane/route로 전환하고, Site 상세도 같은 흐름으로 연다. 맥락이 유지되고 좌측 메뉴가 늘지 않는다.
- **목록 + 상세 페이지**: 목록과 Project/Site 상세를 별도 화면으로 둔다. 깊은 설정과 상태를 구성하기 쉽지만 화면 전환과 breadcrumb/back 경로가 필요하다.

사이드바에는 `사이트` 한 항목만 유지하고, Project/Site 하위 메뉴는 사이트 화면 내부의 탭 또는 상세 내비게이션으로 두는 안을 우선 제안한다. 이를 통해 여러 Project/Site가 늘어도 전역 메뉴가 길어지지 않는다.

## 첫 구현 범위 — 사용자 합의 완료

사용자가 동의한 1차 범위는 Project 목록, Project 생성, Project 상세 진입이다. 시각적 polish보다 IA와 확장 경계를 우선하며, 목록에서 기존 Project를 고르고 새 Project를 만든 뒤 선택한 Project 상세로 들어간다.

- 기존 준비 중 화면을 Project 목록 화면으로 교체한다.
- Project가 없을 때 간결한 empty state와 `프로젝트 만들기` 진입을 제공한다.
- Project 생성은 우선 이름만 입력받고 기본 위치인 `workspace/site-hosting/projects/{project_id}`에 저장한다. 별도 root 선택 UI는 후속 단계로 미룬다.
- 상세에 `개요 / 사이트 / 설정` 내부 탭을 제공한다. Site 탭은 소속 Site 목록의 자리이며, 현재는 빈 상태를 표시한다.
- Project 편집/삭제, Site 생성/관리, export/import는 1차 범위에서 구현하지 않는다. 장기 기능 인벤토리와 내부 내비게이션에서 확장 위치만 고려한다.
- Project manifest를 `workspace/site-hosting/projects/{project_id}/project.json`에 저장하고, 같은 위치에 `sites/` 하위 폴더를 준비한다. 기존 workspace JSON manifest 패턴을 따른다.
- 화면의 설명은 짧게 유지하고, 세부 안내는 추후 도움말/블로그 링크에 둔다.

## 명시적 비목표 후보

- Site package 생성 및 Astro/template catalog 연결
- 로컬 Node/Astro 실행기, build, preview
- Cloudflare Project account binding, Worker 생성, 배포, custom domain 설정
- Blog writing/publishing destination 통합
- 다른 Astro 도구에서 수정한 source 변경 감지

## 결정이 필요한 UX/기술 경계

1. Project 생성에서 기본 이름 외에 사용자 지정 Project root를 언제 노출할지. 이번 slice는 기본 위치를 사용하고 경로 선택을 미룬다.
2. Project 목록과 상세를 route/history에 연결할 시기. 이번 slice는 view 내부 이동으로 시작하고 direct link 필요성이 생기면 별도 route contract를 추가한다.
3. Project manifest는 Project 폴더 안에 portable하게 저장한다. 사용자 지정 root가 도입될 때 machine-local registry와 복구 UX를 추가하고, absolute path는 manifest identity로 사용하지 않는다.

## 설계 원칙과 확정된 전제

- Project는 관리 묶음이고 Site가 실제 build/deploy 단위다.
- Project 하나에는 custom root domain을 최대 하나 둔다. 미정이면 도메인 없이 사용 가능하고 `workers.dev`로 확인한다.
- Project 이름은 사용자가 목록과 상세 화면에서 알아보기 위한 표시 이름이며 한글을 포함한 자유로운 이름을 허용한다. 이 이름을 파일 경로나 Cloudflare hostname으로 사용하지 않는다. Project의 안정적인 내부 ID, Site별 Cloudflare Worker 이름, 선택적 사용자 hostname은 각각 분리한다.
- Cloudflare workers.dev 배포 주소의 형식은 `https://<worker-name>.<account-subdomain>.workers.dev/`다. `<account-subdomain>`은 Cloudflare 계정에 설정된 subdomain이고, `<worker-name>`은 Site별 배포 Worker 리소스 이름이다. Project 이름에서 Worker 이름을 직접 파생하지 않는다. BlogGenius는 배포 후 URL을 가져와 사용자가 클릭할 수 있게 보여준다. 계정 subdomain 및 Worker의 workers.dev 활성화 여부를 배포 흐름에서 확인해야 한다. ([Cloudflare 공식 문서](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/))
- Site 하나는 hostname을 정하며 `www`를 허용한다. apex 도메인 처리는 별도 기능이다.
- Site 생성/편집/build/preview는 Cloudflare와 무관하다. 배포 때만 Cloudflare 연결과 Project account 선택이 필요하다.
- Project root는 기본 `workspace/site-hosting/projects/{project_id}`를 사용하고 Project별 사용자 지정 경로를 허용하는 방향이다. 그 경로 입력 UX와 복구 동작은 구현하면서 구체화한다.
- 각 Site 폴더에는 BlogGenius metadata와 표준 Astro source가 함께 있지만 구분되며, 외부 Astro 도구가 source를 열 수 있어야 한다.
- Project/Site 삭제는 local files, metadata, 원격 Worker/domain 영향이 다르므로 숨김/삭제 의미를 분리해 확인한다. 실제 동작은 이 slice 범위와 분리한다.
- 사용자 승인 전에는 구현하지 않는다. 설계 질문을 정리하고 첫 slice를 합의한 다음 구현한다.

## 검증과 완료 조건

- 승인된 slice의 화면 흐름과 persistence contract에 맞는 focused contract/unit test.
- 사용자 화면 흐름을 포함하는 slice가 완료되면 관련 browser smoke.
- 문서의 모델/사용자 흐름과 구현이 일치하는지 확인.
- 사용자는 새 Project 만들기와 저장된 Project 다시 열기를 수동 확인.

## 구현 결과와 검증

- `src/site-hosting/project-repository.js`가 기본 workspace 아래 Project manifest와 `sites/` 경계를 만든다. ID 경로 검증과 atomic manifest write를 적용했다.
- Project 이름 입력 안내를 사용자 표시용 이름임을 드러내도록 간결하게 바꾸고, 한글·임의 이름 예시 placeholder를 추가했다. Cloudflare 주소 규칙과 표시 이름/내부 식별자 분리 원칙을 기록했다.
- `src/ui-api/services/site-hosting-project.service.js`와 전용 local API route가 Project list/create/get을 제공한다. API는 loopback same-origin request로 제한한다.
- 사이트 화면에 Project 목록, 이름 입력 생성 dialog, 상세 breadcrumb와 `개요 / 사이트 / 설정` 탭을 연결했다. Site 생성/편집 동작은 노출하지 않는다.
- Project 상세의 설정 탭에는 기본 저장 위치와 도메인 미설정 상태를 표시한다. root 경로 사용자 지정, domain 편집, Project 편집/삭제는 이번 slice에 포함하지 않는다.
- `node --test src/site-hosting/project-repository.test.js src/ui-api/services/site-hosting-project.service.test.js src/ui-api/routes/site-hosting-project.routes.test.js scripts/ui-script-structure.test.js scripts/view-header-contract.test.js scripts/ui-structure-contract.test.js`: 18 pass, 2 기존 skip.
- `npm run test:ui-browser`: 통과. Project 빈 목록→생성→상세 탭 이동→목록 복귀→재진입을 검증했다.
- `git diff --check`: 통과.
- 사용자 수동 확인: Project 목록/상세 화면을 검토하고 이름 안내 개선을 요청했다. 그 요청을 반영했다. 전체 수동 흐름의 재확인은 사용자가 원할 때 진행한다.
- 최신 변경 검증: `node --test scripts/view-header-contract.test.js` 통과(3 pass, 2 기존 skip), Project/UI focused test 재실행 통과(18 pass, 2 기존 skip), `npm run test:ui-browser` 통과(390 fixture requests), `git diff --check` 통과.

## 진행 기록

- 선행 `codex/site-sidebar-navigation`을 `codex/static-site-builder-main`에 fast-forward 병합하고 삭제했다.
- 메뉴 sub-feature 기록을 archive로 옮기고 상위 계획 및 `docs/README.md`를 갱신했다.
- 이 브랜치는 부모 `codex/static-site-builder-main`에서 serial sub-feature로 생성했다.
- 사용자가 Project/Site 장기 기능 목록을 제시하고, 1차 범위를 Project 목록·생성·상세 진입으로 정했다.
- 사용자는 첫 버전에서 시각적 polish보다 IA와 확장성을 우선하고, 제안된 틀을 구현한 뒤 실제 화면으로 검토하기로 했다.
- Vercel Project dashboard의 목록→상세→개요/설정 분리 패턴을 참고해 Project `개요 / 사이트 / 설정` 내부 탭을 제안하고 1차 틀에 반영했다.
- 1차 범위의 Project repository/API, Project 목록·생성·상세 탭 UI 틀을 구현했다.
- 자동 검증이 통과했고, 사용자가 화면 IA와 배치를 직접 검토할 수 있는 상태다.
- 사용자 의견에 따라 Project 이름을 사용자 표시명으로 명확히 하고 한글 예시 placeholder를 추가했다. Site ID/배포 이름/사용자 hostname과는 분리하며, workers.dev의 `<worker-name>.<account-subdomain>.workers.dev` 규칙을 기록했다.
