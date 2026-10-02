# Project Site 생성 개발 기록

## 브랜치와 상태

- 브랜치: `codex/site-creation`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: Site 생성 slice 커밋 완료; Astro build/loopback preview 구현 완료; Cloudflare workers.dev 배포 통합 구현 및 focused 검증 진행 중
- 상위 기능 계획: [Static Site Builder](2026-10-01-static-site-builder-main-development.md)
- 선행 Project 관리 slice: [Project 목록·생성·상세](../archive/2026-10-02-site-management-page-development.md)

## 사용자 필요와 목표

Project에서 Site 종류(template)와 사용자가 알아볼 이름을 선택해 로컬 Site를 만든다. BlogGenius가 Astro를 실행해 로컬 build와 preview를 제공하고, 사용자가 원할 때 Cloudflare `workers.dev`로 배포한다. Site 생성과 로컬 build/preview는 Cloudflare 연결 없이 사용할 수 있어야 한다.

## 합의한 사용자 흐름과 범위

1. Project 상세에서 Site 목록을 바로 확인하고 `사이트 만들기`를 연다.
2. 사용 가능한 template을 선택한다.
3. Site를 구분할 이름을 입력한다.
4. Site 폴더와 기본 정보를 만들고 Project의 Site 목록에 표시한다.

Project는 이름만으로 생성한다. Site 생성은 template 종류와 표시 이름만 받는다. Domain, root 위치 변경 등 세부 설정은 실제로 필요해질 때 다룬다. 이번 PoC의 배포는 연결된 Cloudflare 계정 중 첫 번째 계정에 Site별 Static Assets Worker를 배포하고 `workers.dev` 주소로 확인하는 범위까지 포함한다. 계정 선택 UI, custom domain, 콘텐츠 저작, export/import는 범위에서 제외한다.

## 설계 원칙과 미확정 항목

- Project 표시 이름, Site 내부 ID, Site 표시 이름, 사용자 hostname, 배포 대상의 기술 이름은 역할이 다르므로 우선 서로 다른 개념으로 둔다. 같은 문자열을 재사용할 수 있는지는 편의상 구현 세부로 두고, 식별자 계약을 성급히 합치지 않는다.
- 배포 대상 이름은 Site ID에서 자동 생성해 재배포 시 같은 Worker를 갱신한다. 이번 PoC는 Cloudflare Workers Static Assets 구현에 한정하고 Cloudflare Worker라는 용어를 Site 개념이나 생성 입력으로 노출하지 않는다.
- Site의 `이름`과 선택 template이 요구하는 사이트 제목/title 설정이 중복될 수 있다. 화면에서 이름이 어떤 용도인지 구분하고, template 필수 입력이 있을 때만 추가 질문한다.
- 외부 template repository는 BlogGenius와 별도 소유다. 기존 template contract spike는 후보일 뿐 합의된 사양이 아니므로 근거 없이 표준으로 채택하지 않는다.
- 사용자 승인: 이번 흐름을 실물로 검증할 수 있게 BlogGenius 내부 `src/site-hosting/templates/minimal-homepage`에 새로 만든 간단한 임시 template 하나를 둔다. 이는 별도 template project의 canonical catalog/spec으로 채택하지 않으며, 외부 catalog가 준비되면 catalog 공급 경계를 확장/교체한다.
- 임시 Astro source는 Site 폴더의 최상위에 복사하고 BlogGenius metadata는 `.bloggenius/site.json`에 저장한다. manifest에는 안정적인 내부 Site ID, Project ID, 화면 표시 이름, template ID/version, 선택적 hostname, 생성/수정 시각을 기록한다.
- Site는 BlogGenius 관리 개념과 표준 Astro 프로젝트를 하나의 디렉터리에서 함께 보유한다. `.bloggenius/site.json`은 BG 전용이고, Astro 프로젝트 파일은 루트에 둔다. `node_modules`와 `dist`는 재생성 가능한 산출물로 본다. export/import가 구현되면 둘은 제외하고, `package.json`과 lock 파일로 복원한다.
- 현재 임시 template은 Astro 정적 홈페이지 한 페이지와 기본 `package.json`/`astro.config.mjs`로 제한한다. 일반 설정 언어, 변환 엔진, 사용자별 template 옵션은 만들지 않는다.
- Project root domain은 최대 하나라는 합의를 유지한다. Site hostname은 별도이며 custom domain 미설정이어도 Site 생성 가능하다. 이번 생성 흐름에서 hostname 입력이 실제 필요하지 않으면 Project의 Site 목록 이후 단계로 미룬다.

## 명시적 비목표

- 자유 형식 Astro site builder 제공
- Amade CLI/Docker 실행 또는 기존 Amade template 재사용
- 외부 template catalog/spec을 이 브랜치에서 새 표준으로 확정
- Cloudflare Project 계정 선택 UI와 custom domain 적용
- 기존 Site의 template 변경/upgrade/migration

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
- Site 목록 카드에서 빌드 및 미리보기를 호출하도록 연결했다. build 전 미리보기는 안내 오류를 반환하고, 성공 build 후 미리보기 서버는 기존 주소를 재사용한다. API에는 build 상태 조회와 미리보기 종료 경로도 제공한다.
- 관련 runtime/service/route focused 테스트 7개가 통과했다. 실제 loopback HTTP 응답, MIME type, traversal 차단, build 전 preview 차단을 검증했다. JS syntax check와 `git diff --check`도 통과했다. 사용자 요청대로 UI browser smoke는 실행하지 않았다.
- Cloudflare 배포 통합 구현: OAuth 요청에 Worker Scripts read/write scope를 포함하고, 연결된 계정 중 첫 계정으로 Static Assets 업로드/버전 생성/배포를 수행한다. Cloudflare가 새 deployment에 100% 트래픽을 연결했는지 조회하고 공개 URL의 HTTP 응답도 확인한다. 배포 결과 URL과 Worker/version/deployment ID를 Site metadata에 저장한다. Site 카드의 `배포` 동작 하나로 build와 publish를 수행하고, 배포 URL을 다시 열 수 있다.
- 배포 통합 focused 테스트 9개와 JS syntax/`git diff --check`가 통과했다. 기존 Astro runtime focused test 2개는 loopback listener에 sandbox 권한이 필요해 승인 후 별도로 재실행해 통과했다. UI browser smoke는 사용자의 지시에 따라 생략했다.
- 권한 실패 단계 표시 변경 후 `node --test src/site-hosting/cloudflare-static-assets-deployer.test.js` 4개 통과, 배포 모듈 syntax와 `git diff --check` 통과.
- 미완료: 사용자가 앱에서 새 OAuth client로 다시 연결한 뒤 첫 workers.dev 배포를 실행해 공개 결과를 확인한다. Workers Editor 권한이 배포 흐름의 목록 조회·기존 Worker 수정·신규 Worker 생성에 각각 충분한지는 실계정 결과로 판단한다. npm 12.2.0 audit 취약점 3건 및 라이선스 고지 방식은 출시 준비 시 재검토한다. 이번 단계의 변경사항은 아직 커밋하지 않았다.
