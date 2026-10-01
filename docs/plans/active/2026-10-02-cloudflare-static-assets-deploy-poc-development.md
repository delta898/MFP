# Cloudflare Static Assets 배포 PoC

## 브랜치와 상태

- 브랜치: `codex/cloudflare-static-assets-deploy-poc`
- 시작일: 2026-10-02
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: 승인된 샘플을 동일한 미배포 Worker에 성공적으로 배포했다. `workers.dev` 공개 URL에서 HTTP 200과 샘플 본문을 확인했다. 배포 전 multipart 필드 및 version API 경로를 Cloudflare 문서에 맞게 수정했다.
- 부모 기능: [정적 사이트 빌더 메인 기능](2026-10-01-static-site-builder-main-development.md)
- 선행 단계: [Cloudflare Static Assets 목록 조회 PoC](2026-10-02-cloudflare-static-assets-list-poc-development.md)

## 사용자 요구와 목표

Cloudflare Static Assets를 포함한 정적 사이트를 BlogGenius가 배포하고 상태를 확인할 수 있는지 시나리오 순서로 검증한다. 공식 API와 권한 경계를 확인하고 mock 기반 계약 검증 후, 사용자가 지정하고 승인한 단일 개발용 Worker에 실제 샘플 배포를 시도했다.

## 범위

- Cloudflare 공식 문서에서 자산 업로드 세션, 자산 전송, Worker 버전 생성, 배포, 배포 상태 조회 계약과 요구 scope를 확인하고 승인된 개발 계정에 공개 샘플을 게시한다.
- BlogGenius 프로토타입의 기존 OAuth/API 경계와 직접 REST 호출 적합성을 조사한다.
- 실제 요청을 모의하는 작고 독립적인 PoC 및 집중 테스트를 작성해 요청 순서, 응답 검증, 실패 경계를 확인한다.
- 실제 Cloudflare 배포 전 필요한 권한, 개발용 대상 선택, 실행 전 사용자 확인사항을 문서화한다.

## 명시적 비목표

- 사용자 승인 범위 밖의 Cloudflare 리소스를 만들거나 변경·삭제하지 않는다.
- 사용자 승인된 단일 샘플 이외의 Worker script/version/deployment를 만들지 않는다.
- `workers-scripts.write` 추가 이후 별도 승인 없이는 OAuth client scope를 더 변경하지 않는다.
- 운영 UI, 사이트 빌드, Astro 통합, 도메인 연결을 구현하지 않는다.
- Wrangler CLI를 BlogGenius에서 실행하거나 Docker/외부 개발 도구 종속성을 추가하지 않는다.

## 제안 설계와 경계

- 배포 흐름을 Cloudflare REST API의 개별 단계로 모델링하되, 각 네트워크 호출은 주입 가능한 HTTP transport 뒤에 둔다.
- 테스트는 fixture 기반 fetch mock으로 요청 경로, 메서드, 권한 헤더 전달, 응답 오류를 검증한다. 토큰·계정 ID·파일 내용은 로그나 문서에 남기지 않는다.
- 실제 API의 업로드 세션 생성부터 원격 변경으로 취급하고, mock 검증과 live 검증을 구분한다.
- 다운로드/업로드 도구 설치나 플랫폼별 네이티브 의존성을 BlogGenius에 추가하지 않는다.

## 구현 단계

1. 공식 API 문서와 OAuth scope 명칭, 업로드 데이터 형식, 배포 및 조회 응답을 확인한다.
2. 기존 프로토타입의 모듈 구조와 개발 기록/테스트 규칙을 확인한다.
3. 최소 모의 클라이언트와 집중 테스트를 구현한다.
4. 승인된 단일 샘플의 부분 성공을 안전하게 확인하고, 동일한 미배포 Worker에서 업로드를 재시도한다.
5. 전체 배포 또는 실패 결과를 확인하고 개발 기록과 부모 roadmap을 최신화한다.

## 결정과 변경 기록

- 사용자 승인(2026-10-02): Cloudflare 배포 lifecycle의 공식 계약 조사와 mock 기반 PoC를 진행한다. 이후 "이어 가봅시다" 지시에 따라 live 시험을 위한 준비를 계속한다. 실제 게시는 CLI에서 대상 URL을 보여준 뒤 정확한 Worker 이름을 포함한 확인 문구를 입력하기 전에는 시작하지 않는다.
- 이 PoC가 성공해도 Worker 이름 규칙, 기존 Worker 덮어쓰기, 실패한 업로드 정리, 재배포/롤백 정책은 자동으로 결정하지 않는다.
- Cloudflare 공식 Direct Upload 문서는 programmatic API를 고급 통합 방식으로 설명하고 일반 사용자에게는 Wrangler를 권장한다. BlogGenius는 사용자가 Wrangler/Docker를 설치하지 않아야 하므로, 제품 경계에서는 REST API 또는 공식 JS SDK를 앱 내부에서 쓰는 방식이 맞다. 이번 독립 PoC는 추가 패키지 없이 `fetch`로 HTTP 계약을 모의한다. 운영 구현 때 SDK 도입 여부와 Electron package 크기는 별도로 비교한다.
- 공식 흐름은 Worker 리소스 생성, 자산 manifest/session, bucket별 자산 업로드, Worker version 생성, traffic deployment로 나뉜다. Worker version은 `deploy=false`로 먼저 올리고 별도 deployment API를 호출해야 공개 트래픽 변경을 분리해 관찰할 수 있다.
- manifest 세션 JWT와 완료 JWT는 모두 Cloudflare API access token과 구분되는 단기 업로드 토큰이다. 문서는 각 토큰이 1시간 유효하다고 설명한다. 파일 업로드 API는 세션 JWT를 받고, 새 version에는 완료 JWT를 전달한다. 이를 로그·영구 저장에 남기지 않는다.
- API 문서에 적힌 권한은 `Workers Scripts Write`이며 scope registry에서 OAuth ID `workers-scripts.write`로 확인했다. 같은 UI의 다른 `Edit`는 `workers-scripts.edit` / `Workers Editor`다.
- 배포 목록 API는 첫 항목이 현재 트래픽을 받는 최신 배포라고 설명한다. 따라서 PoC의 조회는 배포 완료 응답만으로 성공 판정하지 않고 최신 deployment 결과를 읽도록 한다.
- `workers.dev` URL 사용은 계정에 subdomain이 준비되어야 하며 Worker별 subdomain 활성화도 필요하다. 이름이 DNS label 제약을 어기거나 account subdomain이 없으면 사용자 안내/선행 설정이 필요하다. custom domain은 이번 범위에서 제외한다.
- 최초 live 시도는 새 Worker 이름만 허용한다. 실패 후에는 Cloudflare Worker direct lookup으로 동일 이름의 Worker를 찾고 deployment가 전혀 없는 것을 확인한 경우에만 해당 Worker 재사용을 허용한다. 배포가 있으면 중단한다. orphan Worker 자동 삭제는 하지 않는다.
- 샘플 live 검증은 공개 `workers.dev` URL에 한 페이지를 게시하고 Worker를 계정에 남긴다. 자동 cleanup은 하지 않는다. Worker 생성 후 실패하면 Worker/업로드 데이터가 남을 수 있어 실패 단계와 Worker 이름을 안내하도록 runner를 구성한다.
- 2026-10-02 사용자 승인으로 `bg-static-poc-muq177g7-bde93a`를 계정 `…e03358`에 생성하고 공개 URL `https://bg-static-poc-muq177g7-bde93a.delta898.workers.dev/`에 샘플을 게시하는 live 검증을 시작했다. Worker 생성과 upload-session 단계는 통과했으나 첫 bucket asset upload가 `An unknown error has occurred. Please contact support` 오류로 실패했다. 버전 및 배포 요청은 보내지 않았다.
- Cloudflare Dashboard의 해당 Worker deployments 화면은 `No active deployment` 및 버전 이력 없음으로 확인했다. 따라서 현재 public URL은 샘플을 제공하지 않는다. Worker는 남겨두며 삭제하지 않는다.
- 업로드 형식은 Cloudflare 문서 간 표현이 달랐다. API Reference의 `body: map[string]` 및 curl 예제는 `body` 필드로 표현되고 TypeScript SDK는 `body[hash]` 형식으로 펼치지만, Workers for Platforms의 동일 upload API 가이드는 multipart 필드명을 hash 자체로 지정한다. `body[hash]` 요청은 HTTP 202와 completion JWT 없는 응답을 반환했다. hash 이름을 직접 필드로 보내자 업로드가 완료되어 JWT를 받고 이후 배포까지 성공했다. 이 개발 계정·단일 파일에서 확인된 결과이며, 공통 직렬화 규칙은 추가 검증이 필요하다.
- 오류 처리에서 Cloudflare error code가 빠지던 부분을 보완했다. 실패 뒤 Worker가 남는 경우에도 Worker direct lookup 및 배포 이력의 read-only 확인을 통과한 때만 재사용하는 제한적 복구 경로를 추가했다.
- 복구 경로는 이미 게시 승인을 받은 동일 Worker 이름만 대상으로 하며, 배포 이력이 하나라도 있으면 중단한다. 각 재시도 전에 deployments가 없는지 다시 확인하고 명시적 PUBLISH 확인을 받는다.
- 수정된 recovery runner는 기존 Worker direct lookup을 사용해 undeployed Worker도 찾는 것을 확인했다. 사용자가 게시 확인 문구를 입력한 복구 시도에서 asset upload `HTTP 500`, Cloudflare error code `-1`이 다시 발생했다. version upload와 traffic deployment 요청은 보내지 않았다.
- Cloudflare 공개 Workers SDK issue에 같은 `code: -1`이 보고됐지만, 재현 조건은 약 15 MB 이상 업로드다. 현재 PoC HTML은 매우 작아서 그 사례를 직접 원인으로 볼 수 없다. 재확인한 Cloudflare Status API에서는 `Workers Assets`가 operational로 표시됐다. 이는 전반적인 공개 장애가 보고되지 않았다는 뜻일 뿐, 계정/API별 문제를 배제하지 않는다.
- 2026-10-02: asset upload 응답 `HTTP 202`는 실패가 아니라 처리할 bucket이 더 남았다는 상태이며, 최종 bucket 처리 후 `HTTP 201`과 completion JWT가 반환된다. SDK 형태 재시도는 bucket upload가 계속 202를 반환해 version 단계에 도달하지 못했다. 응답 status, result field names, message codes 및 bucket 순번만 진단하도록 했다.
- 2026-10-02: Workers for Platforms 문서에 따라 multipart 필드 이름을 hash 자체로 바꾸자 asset upload가 completion JWT를 반환했다. 버전 요청은 beta `/workers/workers/{worker_id}/versions` API 대신 공식 Direct Upload 흐름과 맞는 안정 `/workers/scripts/{script_name}/versions` multipart API로 변경했다. 기존 beta API는 `Content-Type: application/json`을 요구해 `HTTP 415`를 반환했었다.
- 승인된 동일 Worker `bg-static-poc-muq177g7-bde93a`에서 asset session, asset upload, 안정 version upload, 100% traffic deployment, 최신 배포 조회를 통과했다. 공개 URL `https://bg-static-poc-muq177g7-bde93a.delta898.workers.dev/`에서 `HTTP 200` 및 `BlogGenius Cloudflare Static Assets PoC` 표시를 확인했다. 실제 요청 이후 Worker와 공개 sample은 Cloudflare 계정에 남겨뒀으며 자동 삭제하지 않는다.

## 공식 API 계약

| 단계 | HTTP 동작 | 권한/토큰 | 원격 영향 |
| --- | --- | --- | --- |
| Worker 준비 | `POST /accounts/{account_id}/workers/workers` | Workers Scripts Write | Worker 리소스 생성, workers.dev 활성 요청 |
| Manifest 등록 | `POST /workers/scripts/{script_name}/assets-upload-session` | Workers Scripts Write | 업로드 세션과 단기 JWT 생성 |
| 파일 전송 | `POST /workers/assets/upload?base64=true` | 업로드 세션 JWT | Worker 버전에 묶일 자산 업로드 |
| 버전 업로드 | `POST /workers/scripts/{script_name}/versions` (multipart) | Workers Scripts Write | 새 버전을 생성하나 traffic 배포는 하지 않음 |
| Traffic 배포 | `POST /workers/scripts/{script_name}/deployments` | Workers Scripts Write | 새 버전으로 traffic 변경 |
| 배포 조회 | `GET /workers/scripts/{script_name}/deployments` | Workers Scripts Read 또는 Write | 읽기 전용; 첫 항목이 현재 serving deployment |

## 구현 진행 기록

- Cloudflare Direct Upload 및 API Reference를 확인하고 위 계약을 독립 PoC README에 정리했다.
- API 요청을 주입 가능한 `fetch`로 보내는 PoC client를 작성했다. Worker 생성, assets upload session, bucket 업로드, deploy=false version upload, traffic 배포, deployment 조회를 지원하며 실계정 호출 runner는 두지 않았다.
- 업로드 단계에서는 Cloudflare가 요구하는 별도 session/completion JWT 흐름을 적용했다. 오류 처리에서 OAuth access token을 노출하지 않도록 했다.
- `node --test prototypes/cloudflare-static-assets-deploy-poc/deploy-client.test.js`: 11개 통과. `node --check`로 live runner와 client 구문을 확인했고, `git diff --check`를 통과했다.
- 기존 확인 단계에서는 membership 및 Worker 목록 read API를 호출했다. scope registry 진단에서는 `GET /oauth/scopes`만 추가 호출했다. 이번 승인 범위에서 OAuth client에 `workers-scripts.write` scope를 추가하고 동의까지 완료했다. Worker 생성/업로드/배포, `workers.dev` 상태 변경은 미수행이다.
- 사용자 요청 후 live runner를 추가했다. OAuth Authorization Code + PKCE, membership/account 선택, `workers.dev` 및 Worker name 충돌 사전 조회를 한 뒤 게시 계획을 출력한다. 실제 쓰기 요청은 사용자가 터미널에서 정확히 `PUBLISH <worker-name>`을 입력한 경우에만 시작한다.
- 사용자가 요청한 scope 확인을 위해 로컬 callback 진단기를 추가했다. 기존과 동일한 `memberships.read workers-scripts.read`로 인증 후 `GET /oauth/scopes`만 호출하고 Workers 관련 ID/name/category를 출력한다. access token은 저장하거나 출력하지 않는다.
- 실계정 scope registry에서 `workers-scripts.edit` = `Workers Editor`, `workers-scripts.write` = `Workers Scripts Write`를 확인했다. Cloudflare OAuth UI는 둘 다 `Edit`로 보이므로 레이블만으로는 서로 구분되지 않는다.
- 공식 Create Worker API Reference는 `Workers Scripts Write`를 허용 권한으로 기재하지만, 2026-09-15 Workers 역할 문서는 새 Worker 생성에 제품 범위 `Admin`을 요구한다고 한다. OAuth scope의 `workers-scripts.write`가 새 역할 모델에서 create를 허용하는지는 실계정에서 확인해야 한다.
- `node --check prototypes/cloudflare-oauth-poc/run-scope-diagnostic.js`를 통과했다. 시스템 Chrome에서 기존 read scope로 인증했고 `GET /oauth/scopes`가 성공했다. 계정 리소스나 OAuth client 설정은 변경하지 않았다.
- 최초 구현 시 집중 테스트 24개가 통과했다. 이후 SDK-format 진단 테스트가 추가되어 최종 집중 테스트 수는 25개다. live runner와 client의 `node --check`, `git diff --check`도 통과했다.
- 현재 Cloudflare OAuth client에 `workers-scripts.write`를 허용하고, 해당 scope를 포함한 Authorization Code + PKCE 요청이 성공했다. client의 두 번째 `Workers > Edit` 체크박스가 다음 단계 요약에서 `Workers Scripts Write`로 표시됨을 확인했다.

## 검증과 인계

- 변경된 모듈에 대응하는 가장 좁은 `node --test` 테스트와 `git diff --check`를 실행한다. 2026-10-02 진단 개선 후 배포/OAuth 집중 테스트 25개가 통과했다.
- 전체 테스트 스위트는 이 하위 기능의 기본 검증 범위가 아니다.
- 실제 Cloudflare 계정에 쓰기 요청을 보내는 검증은 명시적으로 선택된 개발용 대상과 그 단계의 별도 승인을 확인한 뒤 진행한다.
- `memberships.read workers-scripts.read workers-scripts.write` OAuth 요청 및 동의가 성공했다. 최초 live 요청은 새 Worker 생성을 허용했으나 asset upload가 실패했다.
- 동일 Worker 복구를 위해 Worker 목록 조회만으로는 미배포 Worker를 발견할 수 없다는 점을 확인했다. beta Worker direct lookup 및 deployment 조회를 사용하도록 바꾸었으며, 기존 deployment가 없는 동일 Worker만 복구 계획에 포함한다.
- OAuth client는 private 상태이며 `workers-scripts.write` scope를 허용한다. 실제 OAuth 동의 후 Worker 생성, 자산 업로드, 버전 생성, 배포, 공개 URL 확인까지 성공했다.
- Cloudflare API Reference는 해당 쓰기 권한을 허용하지만, 최신 Workers 역할 문서는 새 Worker 생성에 제품 범위 `Admin`이 필요하다고 설명한다. 실계정에서 OAuth `workers-scripts.write`로 Worker 생성은 성공했다.
- Live publish 전에 runner는 계정 membership, account `workers.dev` subdomain, Worker 이름 direct lookup을 읽기 전용으로 점검한다. 기존 Worker라면 deployments를 확인하고, 배포가 없는 경우에만 재사용을 표시한다. 사용자는 대상 URL과 동작을 확인하고 터미널에 정확한 확인 문구를 입력한다.
- 사용자가 정확한 Worker 및 URL을 확인하고 게시 문구를 입력해 최초 live write를 승인했다. Cloudflare는 Worker 생성을 허용했지만 자산 업로드에서 generic unknown error를 반환했고 버전/배포는 만들지 않았다.
- 같은 Worker의 현재 상태를 Cloudflare Dashboard에서 읽어 활성 배포가 없음을 확인했다. undeployed Worker를 재사용하는 복구 코드와 오류 code 포함 진단을 추가했고 focused tests 24개 및 syntax/diff 검사를 통과했다.
- Worker lookup에서 undeployed Worker가 기존 Worker 목록 API에 나타나지 않는 점을 발견해 direct name lookup으로 수정했다. 명시적 확인 문구 표시도 신규 생성/기존 재사용을 구분하도록 고쳤다. 승인된 동일 Worker 복구 시도는 Cloudflare `HTTP 500`, error code `-1`로 다시 중단되었다.
- 원격 상태: 승인된 Worker에 샘플 version이 배포됐고 100% traffic이 새 version으로 전환됐다. `workers.dev` 공개 URL에서 HTTP 200과 marker 본문을 확인했다. 테스트 Worker 및 샘플은 계정에 남아 있다.
- 검증: 배포/OAuth focused Node tests 25개 통과, client/live runner syntax 검사 및 `git diff --check` 통과. 실계정에서 upload session, multipart asset upload, 안정 version upload, traffic deployment, deployment lookup, public URL 응답까지 성공했다.
- 남은 검증: 이번 시험은 단일 파일의 작은 HTML 샘플에 한정된다. 다중 bucket 및 실제 Astro 빌드 산출물 업로드, 장기 상태 조회는 후속 PoC에서 검증한다.
