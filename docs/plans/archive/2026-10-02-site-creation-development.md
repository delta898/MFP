# Project Site 생성 개발 기록

## 브랜치와 상태

- 브랜치: `codex/site-creation`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: 완료 — Project/Site 생성부터 로컬 설정, 전체 빌드·미리보기, Cloudflare 배포 및 사용자 도메인 연결까지 구현; 다음 완성도 작업은 별도 FBR에서 진행
- 상위 기능 계획: [Static Site Builder](2026-10-01-static-site-builder-main-development.md)
- 선행 Project 관리 slice: [Project 목록·생성·상세](../archive/2026-10-02-site-management-page-development.md)

## 사용자 필요와 목표

Project에서 Site 종류(template)와 사용자가 알아볼 이름을 선택해 로컬 Site를 만든다. BlogGenius가 Astro를 실행해 로컬 build와 preview를 제공하고, 사용자가 원할 때 Cloudflare `workers.dev`로 배포한다. Site 생성과 로컬 build/preview는 Cloudflare 연결 없이 사용할 수 있어야 한다.

## 합의한 사용자 흐름과 범위

1. Project 상세에서 Site 목록을 바로 확인하고 `사이트 만들기`를 연다.
2. 사용 가능한 template을 선택한다.
3. Site를 구분할 이름을 입력한다.
4. Site 폴더와 기본 정보를 만들고 Project의 Site 목록에 표시한다.

Project는 이름만으로 생성한다. Site 생성은 template 종류와 표시 이름만 받는다. Site의 hostname/domain은 생성 후 사이트 설정에서 입력한다. 이번 PoC의 배포는 연결된 Cloudflare 계정 중 첫 번째 계정에 Site별 Static Assets Worker를 배포하고 `workers.dev` 주소로 확인하는 범위까지 포함한다. 계정 선택 UI, Cloudflare에 custom domain을 실제 연결하는 처리, 콘텐츠 저작, export/import는 범위에서 제외한다.

## 설계 원칙과 미확정 항목

- Project 표시 이름, Site 내부 ID, Site 표시 이름, 사용자 hostname, 배포 대상의 기술 이름은 역할이 다르므로 우선 서로 다른 개념으로 둔다. 같은 문자열을 재사용할 수 있는지는 편의상 구현 세부로 두고, 식별자 계약을 성급히 합치지 않는다.
- 배포 대상 이름은 Site ID에서 자동 생성해 재배포 시 같은 Worker를 갱신한다. 이번 PoC는 Cloudflare Workers Static Assets 구현에 한정하고 Cloudflare Worker라는 용어를 Site 개념이나 생성 입력으로 노출하지 않는다.
- Site의 `이름`과 선택 template이 요구하는 사이트 제목/title 설정이 중복될 수 있다. 화면에서 이름이 어떤 용도인지 구분하고, template 필수 입력이 있을 때만 추가 질문한다.
- 외부 template repository는 BlogGenius와 별도 소유다. 기존 template contract spike는 후보일 뿐 합의된 사양이 아니므로 근거 없이 표준으로 채택하지 않는다.
- 사용자 승인: 이번 흐름을 실물로 검증할 수 있게 BlogGenius 내부 `src/site-hosting/templates/minimal-homepage`에 새로 만든 간단한 임시 template 하나를 둔다. 이는 별도 template project의 canonical catalog/spec으로 채택하지 않으며, 외부 catalog가 준비되면 catalog 공급 경계를 확장/교체한다.
- 임시 Astro source는 Site 폴더의 최상위에 복사하고 BlogGenius metadata는 `.bloggenius/site.json`에 저장한다. manifest에는 안정적인 내부 Site ID, Project ID, 화면 표시 이름, template ID/version, 선택적 hostname, 생성/수정 시각을 기록한다.
- Site는 BlogGenius 관리 개념과 표준 Astro 프로젝트를 하나의 디렉터리에서 함께 보유한다. `.bloggenius/site.json`은 BG 전용이고, Astro 프로젝트 파일은 루트에 둔다. `node_modules`와 `dist`는 재생성 가능한 산출물로 본다. export/import가 구현되면 둘은 제외하고, `package.json`과 lock 파일로 복원한다.
- 현재 임시 template은 Astro 정적 홈페이지 한 페이지와 기본 `package.json`/`astro.config.mjs`로 제한한다. 일반 설정 언어, 변환 엔진, 사용자별 template 옵션은 만들지 않는다.
- Project UI를 숨기고 내부 `default` Project만 쓰기로 결정했으므로, 도메인 설정은 Site 소유로 둔다. `hostname`은 선택적 서브도메인 부분(예: `blog`), `domain`은 기본 도메인(예: `example.com`)이다. 전체 사용자 주소는 두 값을 조합해 계산하며, 둘 다 비어 있으면 custom domain 미설정이다. `workers.dev` 배포 주소와 Cloudflare 연결 상태는 별도다. custom domain 연결은 Cloudflare 계정에 해당 활성 Zone이 있고 기존 배포 Worker가 준비된 뒤 별도 명시 동작으로 수행한다.

## 명시적 비목표

- 자유 형식 Astro site builder 제공
- Amade CLI/Docker 실행 또는 기존 Amade template 재사용
- 외부 template catalog/spec을 이 브랜치에서 새 표준으로 확정
- Cloudflare 계정 선택 UI
- 기존 Site의 template 변경/upgrade/migration
- Site 상세를 별도 페이지로 만들지 modal로 열지 결정
- 목록과 카드(grid) 보기 전환, 삭제를 포함한 사이트별 확장 관리 메뉴

## 구현/검증 계획

1. 기존 Project persistence/API와 Site 목록의 빈 상태를 확인한다.
2. template 선택에 필요한 최소 source/contract를 합의한다.
3. Site identity와 manifest/folder의 최소 영속 모델을 정의하고, 사용자 흐름을 구현한다.
4. 생성, 목록 반영, 잘못된 입력 및 생성 실패 복구를 focused unit/contract/browser 검증한다.
5. 현재 설치된 앱 내장 런타임만으로 표준 Astro source를 build하고 결과 HTML을 확인한다.
6. Astro preview 명령 또는 BlogGenius 로컬 정적 서버 중 미리보기 실행 경계를 선택하고 통합한다.
7. 공식 Cloudflare Node SDK로 `dist/` Static Assets를 첫 번째 연결 계정의 Site별 Worker에 올리고, `workers.dev` 주소를 Site metadata에 기록한다.
8. 문서를 갱신하고 사용자가 Site 생성/build/preview/deploy 흐름을 확인한다.

## 결정 및 진행 기록

- 사용자는 Project 상세 `사이트` 탭에서 `사이트 추가 → template 선택 → Site 구분 이름 입력 → Site 폴더/기본 정보 생성 및 목록 표시` 흐름을 새 sub-feature에서 진행하기로 승인했다.
- 사용자는 실제 UI 확인 뒤, Project 상세에서 Site 목록을 바로 보여주고 상단에 `사이트 만들기`를 두는 방향을 승인했다. `개요` 탭은 제거하고 설정은 보조 화면으로 둔다. Site가 없는 상태에도 상단 생성 버튼을 유지한다. 초기 설계에서 탭 안의 Site 목록을 기본으로 두었던 결정을 이 IA로 조정했다.
- 사용자는 이번 흐름에 한해 BlogGenius 안의 새롭고 아주 간단한 임시 template 하나를 사용하고, 추후 template source/catalog 연결을 확장하기로 승인했다.
- Project 생성은 이름만 받으며, 세부 Project 설정은 Site 생성 과정에서 필요한 항목을 확인한 뒤 다룬다.
- Site별 workers.dev 주소는 단순하게 자동 생성한다. Project 이름은 URL 구성에 넣지 않는다.
- Site/배포 모델은 Cloudflare 용어에 종속시키지 않되, 지금부터 복수 배포 provider를 일반화하는 추상 계층을 만들지는 않는다.
- 사용자는 A-to-Z 검증을 위해 현재 연결된 Cloudflare 계정 한 개에 Site를 배포하는 PoC 범위를 승인했다. 계정 입력/선택 UI는 만들지 않고, 계정 목록의 첫 항목을 사용한다. 배포 Worker 이름은 Site ID에서 자동 생성하며 custom domain은 다루지 않고 `workers.dev` 주소로 확인한다. 기존 Cloudflare SDK PoC는 실제 공개 배포까지 성공했고, 이번에는 OAuth 연결과 Astro `dist/`를 BlogGenius 제품 흐름에 통합한다.
- 최초 통합 배포 시 `GET /accounts/{account_id}/workers/subdomain`에서 Cloudflare `403 Authentication error`가 발생했다. 이 시점은 Worker 생성보다 앞이므로 원격 Worker 쓰기는 진행되지 않았다. API 문서상 해당 조회는 Workers Scripts Read 또는 Write를 허용하며, 전체 흐름은 script 목록 조회와 쓰기 작업을 모두 사용하므로 두 scope가 필요하다. 기존 refresh token은 과거 동의 범위일 수 있어 OAuth Client에 두 scope를 허용한 뒤 재연결해 새 권한을 발급받는다.
- 후속 OAuth client 확인에서 Cloudflare 생성 UI는 `Workers Scripts Read/Write`와 `Content Read-Only`를 검색해도 보여주지 않고, `Workers Editor` (`workers-scripts.edit`)만 제공했다. 사용자는 이 client로 배포를 시험하기로 했다. 개발용 OAuth client 설정은 새 client로 바뀌어 있으며, 다음 검증을 위해 인증 요청 scope를 `memberships.read workers-scripts.edit`로 맞췄다. 이번 OAuth 승인/배포 결과로 새 Editor scope가 이 흐름을 허용하는지 확인한다. 실제 재인증과 배포는 사용자가 진행한다.
- 첫 재인증 후 표시된 401/403 안내는 기존 `Workers Scripts Read/Write` 문구를 고정해 실제 실패 단계를 구분하지 못했다. 권한 오류에 거부된 배포 단계(workers.dev 조회, Worker 목록 조회/생성, 업로드, 버전/배포 처리 등)를 짧게 표시하도록 개선했다. 새 오류 단계가 나오면 Editor 권한이 어느 API 동작에서 막히는지 이어서 확인한다.
- Cloudflare 401/403을 원문 JSON으로 노출하지 않고 권한 확인 및 재연결 안내로 정규화하며, 배포 실패 시 버튼 라벨을 `배포`로 복구한다.
- 제품에는 검증된 `cloudflare@7.2.0`을 production dependency로 추가한다. SDK는 OAuth access token을 Bearer credential로 사용하고, 실제 asset bytes 업로드만 Cloudflare의 서명 업로드 endpoint로 보낸다. 연결 token에 Workers Scripts 쓰기 권한이 없으면 OAuth를 다시 승인해야 한다.
- Template 선택은 읽기 전용 catalog 목록으로 제공하고, 선택한 항목의 ID/version만 Site metadata에 기록한다. 임시 catalog는 단일 Astro starter만 제공한다.
- 사용자는 BG Site와 Astro 프로젝트를 개념상 구분하되 단일 Site 폴더에서 결합하기로 승인했다. `.bloggenius/site.json`의 BG 메타데이터와 Astro 프로젝트 루트의 표준 파일을 각각 보존한다. 외부 Astro 도구는 BG 메타데이터를 무시하고 루트 프로젝트를 사용한다.
- 사용자는 Site 생성 후 세부 설정을 미루고, 다음 진행은 우선 local build와 preview라고 승인했다. 새 feature branch를 추가하지 않고 `codex/site-creation`에서 계속한다. 원격 배포는 이후 단계다.
- 사용자는 개발 중 npm audit 취약점이 남아도 기능을 끝까지 연결하고 지속 사용하며 상황을 관찰하기로 결정했다. 취약점은 숨기거나 audit를 통과한 것으로 취급하지 않는다. 출시 준비 시점에 다시 평가한다.
- 실행 환경 조사에서 앱 배포물은 Electron 기반이며 Node 런타임을 포함한다. Electron의 공식 `ELECTRON_RUN_AS_NODE` 실행 기능으로 Astro CLI를 앱 내부 런타임에서 시작하는 최소 PoC가 성공했다. Astro는 공식적인 programmatic API 대신 안정된 CLI를 우선 검토한다(공식 API 문서상 programmatic API는 experimental).
- 사용자는 Astro CLI를 GitHub Actions의 OS별 앱 패키징에 포함할 수 있는지, 라이선스와 실제 사용자 설치 흐름을 확인 요청했다. 현 `.github/workflows/build.yml`은 macOS arm64/Windows x64 각각에서 `npm ci` 후 Electron Packager를 실행하므로, production dependency로 선언하면 양쪽 앱 패키지에 포함되는 구조다.
- 임시 Site 복사본에서 Electron embedded Node 24와 앱에 넣은 npm CLI를 사용해 Astro 7.3.5 의존성을 설치하고 `astro build` 정적 산출물 생성에 성공했다. Astro CLI는 앱 전역 번들만으로 표준 프로젝트 설정의 `astro/config`를 해결할 수 없어, 외부 Astro 도구와 호환할 정상적인 Site별 의존성 설치가 필요하다는 점을 확인했다.
- 새 임시 Site 복사본에서 BlogGenius와 무관한 OS Node/npm으로 `npm install`과 `npm run build`도 성공했다. `.bloggenius/site.json`이 있는 상태에서도 일반 Astro 프로젝트 root 동작에 영향이 없었다.
- 실제 export 기능은 아직 구현하지 않았다. 임시 아카이브에서 `node_modules`와 `dist`를 제외하고 Astro 프로젝트와 `.bloggenius/site.json` 및 lock 파일만 옮긴 뒤, 새 경로에서 `npm ci`와 build가 성공했다. 따라서 표준 lock 파일을 template에 포함하기로 하고 `package-lock.json`을 추가했다.
- 앱 production dependency로 npm CLI `12.2.0`을 고정했다. 앱 내장 Node 24에서 실행할 수 있고, Site별 lockfile 설치에는 npm을 사용한다. npm 11은 install 중 esbuild lifecycle script 허용 여부를 안내했지만, 생성된 platform package만으로 sample build가 성공했다.
- npm 12.2.0에서도 임시 Site를 `--ignore-scripts`로 설치하고 Electron embedded Node 24로 `npm run build`를 실행해 성공한 것을 별도 PoC로 확인했다. 제품 실행기는 외부 Astro project와의 호환을 위해 표준 `npm ci`를 사용하므로 dependency lifecycle script가 실행될 수 있다.
- 패키지 관리자 비교 audit에서 npm 11.16.0은 7건(critical 1, high 5, low 1), npm 12.2.0은 3건(moderate 1, high 2) 취약점이 나타났다. npm 12 dependency override 시도는 bundled dependency에 적용되지 않았다. 사용자는 이 상태를 개발 단계에서 감수하고, 출시 전에 재평가하기로 했다.
- 같은 산출물을 Astro programmatic `preview()` API로 로컬 HTTP 응답(200)까지 확인했다. 이 API는 공식 문서에서 experimental로 분류된다. 제품 preview는 Astro의 비공개 API 대신 `dist/`를 제공하는 BlogGenius loopback 정적 서버로 연결한다.
- npm 12.2.0은 audit에서 3건(1 moderate, 2 high) 취약점이 보고됐다. 자동 수정을 시도했으나 bundled dependency는 해결되지 않았다. 사용자는 개발 기능 진행을 멈추지 않고 취약점을 인지한 채 사용하며 출시 준비에서 재평가하기로 결정했다. 보안 테스트/audit 결과를 조작하거나 경고를 제거하지 않는다.
- 라이선스 1차 조사: Astro 저장소의 라이선스는 MIT이며, npm CLI는 Artistic License 2.0과 각 dependency의 개별 라이선스를 명시한다. 앱에 재배포한다면 관련 고지/notice 포함 여부를 확인해야 한다. 별도 법률 자문을 대신하는 판단은 아니다.
- 최소 template은 고정 버전 `astro@7.3.5`와 `package-lock.json`을 Site에 포함한다. 앱 전역 CLI 번들만으로는 정상적인 외부 Astro 프로젝트와 호환되지 않아 Site 로컬 의존성 방식을 사용한다. 앱에 포함된 npm CLI는 각 Site에서 `npm ci --no-audit --no-fund`와 `npm run build`를 실행한다. Site build script와 의존성 lifecycle script가 사용자 컴퓨터에서 실행되는 점은 출시 전 보안 재평가 항목이다.

## 구현 결과 및 검증

- Project 상세를 Site 목록 중심으로 바꾸고 `개요`/`사이트` 탭을 제거했다. Project 진입 즉시 Site 목록을 읽으며, 상단 및 빈 상태에서 `사이트 만들기`로 추가할 수 있다. Project 설정은 보조 화면으로 이동할 수 있다. 현재 선택지는 새로 만든 `간단한 홈페이지` 하나이며 Cloudflare 연결을 요구하지 않는다.
- 임시 starter는 `src/site-hosting/templates/minimal-homepage/`에 있다. standard Astro static project (`package.json`, `astro.config.mjs`, `src/pages/index.astro`)를 Site 폴더 루트에 복사한다. 이 fixture와 catalog reader는 외부 template repository를 대신하는 정식 규격이 아니며 공급 위치를 바꿀 수 있도록 분리했다.
- Site 폴더는 `workspace/site-hosting/projects/{project_id}/sites/{site_id}/`다. 표준 Astro source는 이 경로의 루트에, BlogGenius metadata는 `.bloggenius/site.json`에 저장한다. metadata는 안정적인 Site ID와 Project ID, 사용자 표시 이름, 선택 template ID/version, hostname, 생성/수정 시각을 담는다.
- 사이트 목록은 Site 표시 이름과 template 표시명만 노출한다. Site ID, 경로, Cloudflare worker name은 이번 UI에서 노출하지 않는다.
- Template catalog/site repository/service/local route와 UI flow에 focused 테스트를 추가했다. 다음 테스트 결과를 확인했다: 28 tests, 26 pass, 2 기존 skip.
- `npm run test:ui-browser`는 Project 진입 시 Site 목록 자동 조회, 빈 목록 생성 액션, Site 생성, 설정 화면 왕복을 반영한 뒤 통과했다(393 fixture requests). 사용자가 전체 smoke 반복은 불필요하다고 해 최종 copy/정리 후 재실행은 중단했다.
- 최종 상태 focused 검증: 관련 unit/contract 30개 중 28 pass, 기존 skip 2개; `node --check`와 `git diff --check` 통과. 시각적 UI 평가는 이번 기능 검증 목표에 포함하지 않았다.
- Site 생성 slice는 `d2c3359a` (`feat: create local Astro sites from templates`)로 커밋했다.
- Astro 7.3.5를 각 Site의 `package.json` dependency로 선언하고 lock 파일을 template에 포함했다. Electron embedded Node/npm 조합으로 Astro를 설치하고 build하는 PoC, 일반 OS Node/npm에서 독립 Astro build, 복사한 export/import fixture에서 `npm ci` 후 build를 각각 확인했다. Site와 Astro 프로젝트를 한 디렉터리에 결합해도 BG 전용 메타데이터를 `.bloggenius/`에 분리하면 독립 동작한다.
- `src/site-hosting/astro-site-runtime.js`에 Site별 npm CLI 실행과 build output 정적 서버를 연결했다. npm 호출은 별도 child process에서 실행하고 BG 프로세스 환경변수 전체를 넘기지 않는다. npm run script가 Astro CLI의 `#!/usr/bin/env node`를 찾을 수 있도록 앱 내장 Node를 가리키는 작은 실행 shim을 임시 runtime 경로에 둔다. preview는 `127.0.0.1`에만 바인딩하고 `dist/` 밖으로 나가는 경로를 차단한다.
- 초기 구현에서는 build 전 미리보기를 안내 오류로 막았다. 후속 기본 작업 공간 slice에서 미리보기 동작이 매번 전체 빌드 후 서버를 열도록 바꿨다. API에는 build 상태 조회와 미리보기 종료 경로도 제공한다.
- 관련 runtime/service/route focused 테스트 7개가 통과했다. 실제 loopback HTTP 응답, MIME type, traversal 차단, build 전 preview 차단을 검증했다. JS syntax check와 `git diff --check`도 통과했다. 사용자 요청대로 UI browser smoke는 실행하지 않았다.
- Cloudflare 배포 통합 구현: OAuth 요청에 Worker Scripts read/write scope를 포함하고, 연결된 계정 중 첫 계정으로 Static Assets 업로드/버전 생성/배포를 수행한다. Cloudflare가 새 deployment에 100% 트래픽을 연결했는지 조회하고 공개 URL의 HTTP 응답도 확인한다. 배포 결과 URL과 Worker/version/deployment ID를 Site metadata에 저장한다. Site 카드의 `배포` 동작 하나로 build와 publish를 수행하고, 배포 URL을 다시 열 수 있다.
- 배포 통합 focused 테스트 9개와 JS syntax/`git diff --check`가 통과했다. 기존 Astro runtime focused test 2개는 loopback listener에 sandbox 권한이 필요해 승인 후 별도로 재실행해 통과했다. UI browser smoke는 사용자의 지시에 따라 생략했다.
- 권한 실패 단계 표시 변경 후 `node --test src/site-hosting/cloudflare-static-assets-deployer.test.js` 4개 통과, 배포 모듈 syntax와 `git diff --check` 통과.
- Site 생성/build/preview/deploy 경로는 `a891cec7` (`feat: add Astro site build preview and Cloudflare deploy`)로 커밋했다. 다음 기본 작업 공간 및 사이트 관리 첫 화면 slice는 현재 작업 중이다.
- 미완료: npm 12.2.0 audit 취약점 3건 및 라이선스 고지 방식은 출시 준비 시 재검토한다.
- 첫 사이트 관리 화면의 목업은 [기본 작업 공간 목업](2026-10-02-site-management-default-workspace-mockup.svg)에 저장했다. 목업은 Project/Site 계층과 핵심 동작 배치를 논의하는 큰 틀이며, 세부 문구와 타이틀 패턴은 기존 UI를 기준으로 조정한다. Site 상세 진입을 페이지로 할지 modal로 할지는 후속 설계에서 결정한다.
- 사용자는 기본 Project/Site를 예외적 고정 리소스보다 다시 준비할 수 있는 로컬 기본 작업 공간 개념으로 제안했다. workspace에 Project가 없으면 `default` ID의 일반 Project를 만들고, 해당 Project에 기본 Site가 없으면 기본 템플릿으로 다시 만든다. 삭제 기능이 추가될 때 재생성 시점과 삭제 범위를 정한다.
- 사이트 메뉴 진입은 기본 작업 공간의 Site 목록을 우선 보여준다. `프로젝트 관리`는 전체 프로젝트 목록으로 이동하고, `사이트 추가`는 현재 Project에 추가한다. 목록/카드 전환은 추후 확장으로 둔다. Site row는 이름·템플릿 정보·로컬 준비/배포 상태와 미리보기·빌드 폴더 열기·배포 동작을 제공한다.
- 미리보기와 배포는 매번 전체 빌드를 실행한다. 미리보기는 빌드 후 열리고, 배포는 사용자 동작으로만 시작한다. 빌드 폴더 열기는 산출물이 없으면 먼저 미리보기를 실행하도록 안내한다.
- 삭제는 빠른 작업과 분리해 추후 overflow 메뉴 후보로 둔다. 페이지/modal 상세 방식, 목록 보기 전환과 구체적인 문구·시각 요소는 아직 확정하지 않았다.
- 목록 상태 표시는 별도 종합 Site status를 만들지 않고 우선 배포 기록 존재 여부로 `미배포`/`배포됨`을 파생한다. 빌드 상태는 작업 중/실패 오류 피드백에 사용한다.
- 검증: Project/Site service와 site route 집중 테스트 11개, loopback preview runtime 테스트 2개 통과. 관련 JS syntax 검사와 `git diff --check` 통과. 사용자의 지시에 따라 UI smoke는 실행하지 않았다.
- 배포 직후 앱의 공개 URL 확인은 HTTP 404로 실패했지만, 로그에 표시된 같은 workers.dev 주소는 잠시 뒤 브라우저에서 정상 접속됐다. 전파 지연과 일치하는 관찰로 기록하며, 사용자가 현재 수정하지 말라고 했으므로 재시도나 확인 로직 변경은 보류한다.
- 사이트 관리 화면의 카드형 목업은 [사이트 관리 카드 목업](2026-10-02-site-management-grid-mockup.svg)에 있다. 사용자는 배포물/빌드물 중 어느 화면을 이미지로 쓸지 상태별로 달라질 수 있다고 보고, 그 세부 사항은 뒤로 미루고 이미지 영역만 먼저 두기로 했다. 카드에서 시작한 작업의 오류/설정 안내 위치와 전체 화면 오류 위치도 아직 정하지 않는다.
- 사이트 목록을 세로 행에서 grid 카드로 바꾸고, 각 Site 카드 위쪽에 스크린샷 영역을 예약했다. 후속 구현에서 이 영역을 template 기본 이미지와 빌드 캡처로 채운다. 카드는 사이트 이름, 로컬/배포 상태 배지, 그리고 사이트별 공유 메시지 영역으로 정보를 최소화한다. 메시지는 빌드·미리보기·배포 작업 중 상태, 완료 결과나 오류를 담고, 배포 성공 후에는 workers.dev와 연결된 custom domain 링크를 제공한다. 기존 설정·미리보기·폴더 열기·배포 action은 유지한다.
- 카드 구조 변경 당시 집중 검증은 JS syntax와 `git diff --check`로 한정했으며 UI smoke는 사용자의 지시에 따라 생략했다. UI 결과는 사용자가 직접 확인한다.
- 사용자는 `default` Project를 내부 Site 소속용으로만 유지하고 Project/프로젝트 관리 UI는 숨기기로 결정했다. 기존 `Project has domain` 제약과 프로젝트별 동일 도메인 규칙은 더 이상 사용자 흐름의 전제로 삼지 않는다. Site 관리 목업에서 프로젝트 설명/진입 버튼을 제거했다.
- 다음 Site 설정 slice의 논의용 화면은 [사이트 설정 흐름 목업](2026-10-02-site-settings-flow-mockup.svg)에 있다. 사용자는 Site 설정에 표시 이름과 custom domain 정보를 두기로 승인했다. Project를 사용자에게 숨기므로 도메인도 Project가 아닌 Site 속성으로 저장한다. 필드는 `hostname`(선택적 서브도메인)과 `domain`(기본 도메인)으로 분리하고, 전체 주소는 파생한다. 이번 구현은 로컬 설정 저장/표시까지이며 Cloudflare Worker에 도메인을 실제 연결하는 일은 후속 범위다.
- Site 설정을 목록 카드에서 열고 이름, 읽기 전용 템플릿, Cloudflare 사용자 도메인 연결을 제공한다. 계정의 모든 활성 Zone을 조회한 뒤 사용자가 도메인을 고르고 hostname을 입력한다. 이름은 `저장`으로 보관하며, hostname/domain은 명시적 `연결` 성공 후 binding metadata와 함께 저장한다. 조회·연결 오류는 도메인 설정 영역에 표시하고, `닫기`는 변경사항 확인 후 목록으로 돌아간다. `workers.dev` 공개 주소는 계속 사용할 수 있다.
- 사이트 설정에 현재 템플릿 이름과 버전을 읽기 전용으로 표시한다. 템플릿 교체 및 Astro 파일 덮어쓰기는 지원하지 않는다.
- 사용자 후속 승인에 따라 custom domain 연결을 추가했다. 설정에서 계정의 전체 활성 Zone을 조회하고 선택한 뒤 hostname을 입력해, 이미 배포된 Worker에 명시적으로 연결한다. 연결 성공 시 binding ID/hostname/Zone/연결 시각 및 hostname/domain을 `.bloggenius/site.json`에 보관한다. 이름 저장은 별도 동작이며 Cloudflare API를 호출하지 않는다. `workers.dev` URL은 계속 쓸 수 있다.
- 연결 시 Cloudflare는 Worker Custom Domain과 DNS/TLS 설정을 처리한다. Cloudflare 공식 권한 문서에 따르면 기존 Worker의 Editor 권한과 대상 Zone의 Workers Routes Write가 필요하며, 앱이 활성 Zone을 조회하기 위해 Zone Read도 요청한다. 앱의 OAuth scope는 현재 client의 `workers-scripts.edit`와 `zone.read workers-routes.write`를 요청한다. OAuth Client에 해당 권한을 추가한 뒤 사용자 재인증이 필요하다.
- 자동 테스트, Cloudflare 재인증, 실제 도메인 연결은 아직 하지 않았다. 사용자의 기존 지시에 따라 UI smoke는 생략한다. 다음 단계는 OAuth Client 권한 추가와 재연결 후, 도메인을 저장하고 Zone 조회 및 명시적 연결을 직접 검증하는 것이다.
- 사용자는 카드 이미지 자리에 템플릿 기본 스크린샷을 두고, 빌드 캡처는 기본 파일과 분리해 최신 파일 하나만 보관하기로 결정했다. `template.json`에 선택적 `preview_file`을 추가했다. Site 생성 시 기본 이미지는 `.bloggenius/template-preview.svg`로 복사되고, 빌드 캡처는 Electron 내장 Chromium으로 만든 `.bloggenius/build-preview.jpg`에 매번 덮어쓴다. `.bloggenius/site.json`에는 템플릿 이미지와 최신 캡처 정보만 별도로 보관한다.
- 빌드 결과를 캡처용 loopback 정적 서버에 로드하고, Electron `webContents.capturePage()`로 1200×675 JPEG를 만든다. 숨김 창은 sandbox/context isolation을 켜고 Node 통합과 새 창을 막으며 캡처 뒤 닫는다. 새 이미지 생성 또는 기록에 실패하면 Astro 빌드는 성공으로 유지하고 기존 이미지 포인터를 보존한다. 카드의 이미지 URL은 로컬 API가 현재 최신 캡처 또는 template 기본 이미지를 제공한다.
- 스크린샷은 템플릿 catalog/repository/runtime/site service/site route 집중 테스트로 검증한다. 실제 capture 창은 mock으로 대체한다. 사용자의 지시에 따라 UI smoke와 앱 수동 실행은 하지 않는다.
- 미리보기는 클릭 직후 팝업을 열어 빈 화면 대신 전체 빌드와 스크린샷 갱신 진행 상태를 보여준다. 빌드 완료 후 사이트 목록을 갱신하고 팝업을 preview URL로 이동하며, 실패하면 팝업 안에 오류를 표시한다. 사용자가 빌드 중 창을 닫아도 성공한 빌드가 오류로 표시되지 않도록 처리한다.
- 최종 집중 검증: site template/repository, Cloudflare deployer, project/site service, site/Cloudflare/project routes 31개 통과; Astro runtime loopback 테스트 3개 통과; 변경 JavaScript 문법 검사 및 `git diff --check` 통과. Browser smoke는 사용자의 지시에 따라 생략했다. 사용자는 앱에서 화면 표시와 실계정 Cloudflare 흐름을 직접 확인한다.
- 다음 단계의 품질 개선(미리보기 캡처 차이, 작업 오류 복구, 카드 상태 정확도 등)은 후속 FBR 범위로 넘긴다. 이 브랜치 단계는 기능 경로를 연결한 상태로 마감한다.
