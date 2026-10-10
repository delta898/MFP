# Cloudflare Workers OAuth 권한 실험과 현재 구성

## 목적과 범위

이 문서는 BlogGenius의 Cloudflare 사이트 생성·배포·custom domain 연결에 사용한 Workers 권한 실험을 한곳에서 정리한다. Cloudflare가 legacy `Workers Scripts Read/Write` 권한과 새 `Workers Editor/Admin` 역할을 함께 노출하거나 UI를 변경할 수 있으므로, scope ID·UI 이름·실제 동작을 구분해서 기록한다.

아래 결과는 2026-10-10 기준으로 확인했다. Cloudflare 계정의 OAuth scope catalog와 Dashboard UI는 달라질 수 있으므로 이후 Client를 만들 때 실제 표시와 API registry를 다시 확인한다.

## 용어

- **OAuth Client scope**: OAuth Client가 허용하는 scope ID의 목록이다. 앱은 그중 필요한 scope를 authorization 요청에 넣고 사용자가 동의한다. Client에 없는 scope를 요청하면 Cloudflare가 `invalid_scope`를 반환한다.
- **API Token 권한**: 한 API Token에 부여하는 별도 credential 권한이다. OAuth Client scope와 서로 추가되거나 공유되지 않는다. API Token에 Workers Scripts Read가 있어도 OAuth Client가 그 scope를 요청할 수 있게 되지는 않는다.
- **Workers role**: 현재 Cloudflare 문서의 역할 모델이다. `Editor`는 기존 Worker를 읽고 수정·배포하지만 생성·삭제하지 못한다. product-scope `Admin`은 Worker 생성·읽기·수정·배포·삭제를 포함한다.
- **UI 이름과 scope ID**: Dashboard의 `Edit` 같은 표시명만으로 권한을 식별하지 않는다. scope ID 및 Client 상세의 매핑을 확인한다.

## 실험 이력과 결과

### 1. Legacy Scripts Read/Write

2026-10-02의 Static Assets PoC에서 Cloudflare OAuth scope registry와 UI를 확인했다.

- `workers-scripts.read`는 Worker/subdomain/deployment 조회 등에 쓰이는 legacy read scope였다.
- `workers-scripts.write`는 Worker 생성, asset upload session, version upload, traffic deployment 등 write 동작에 사용됐다.
- `workers-scripts.edit`는 별개의 `Workers Editor` 권한이었다.
- 당시 Client 편집 UI에서는 `Workers` 아래 두 `Edit` 체크 항목이 보였다. Client 상세의 scope 요약을 확인해 첫 항목은 `workers-scripts.edit` / `Workers Editor`, 둘째 항목은 `workers-scripts.write` / `Workers Scripts Write`에 대응함을 확인했다. 라벨이 같아도 별도 권한이었다.
- `memberships.read workers-scripts.read workers-scripts.write`를 요청한 PKCE OAuth 인증이 성공했고, 실제 BlogGenius PoC에서 Worker 생성, 정적 asset 업로드, version 생성, 배포 및 공개 URL 확인까지 성공했다.

근거: [Static Assets 배포 PoC 기록](../plans/active/2026-10-02-cloudflare-static-assets-deploy-poc-development.md), [사이트 생성 기록](../plans/archive/2026-10-02-site-creation-development.md).

### 2. Workers Editor만 사용한 시도

후속 Client 설정 UI에서는 legacy `Workers Scripts Read/Write`를 찾을 수 없고 새 `Workers Editor` (`workers-scripts.edit`)만 제공되는 경우가 있었다. Editor와 Memberships Read만 요청한 새 Client로 BlogGenius에서 연결했을 때 조회 단계를 지나 Worker 생성 요청에서 Cloudflare가 거부했다.

이는 현재 Workers 역할 문서와 일치한다. Editor는 이미 존재하는 Worker를 수정·배포할 수 있지만 Worker를 생성하거나 삭제하지 못한다. 새 Worker 생성에는 product-scope Admin이 필요하다. 이 실패는 Editor 권한으로 기존 Worker를 재배포하는 동작까지 실패한다는 뜻은 아니다. 해당 경우는 별도로 검증하지 않았다.

근거: [Cloudflare Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/).

### 3. Workers Admin을 포함한 별도 Client

Cloudflare OAuth Dashboard에서 별도 비공개 테스트 Client를 만들고 다음 scope를 설정했다.

| Dashboard 표시 | OAuth scope ID | 확인 내용 |
| --- | --- | --- |
| Workers Admin | `workers-scripts.admin` | 새 Worker를 포함해 Workers 전반 관리 |
| Workers Editor | `workers-scripts.edit` | 테스트 Client에도 함께 설정 |
| Workers Routes Write | `workers-routes.write` | custom domain/route 연결에 필요 |
| DNS Read | `dns.read` | domain 연결 상태를 위한 조회 |
| Zone Read | `zone.read` | 대상 zone 조회 |
| Memberships Read | `memberships.read` | 사용자가 접근 가능한 계정 조회 |
| Offline Access | `offline_access` | refresh token을 받기 위한 protocol scope |

BlogGenius 기본 scope에는 이 새 Client가 허용하지 않는 `workers-scripts.read`가 포함되어 있었다. 로컬 `.env.oauth`에 Client ID만 바꾸고 scope override를 넣지 않은 첫 연결에서 다음 오류가 발생했다.

```text
invalid_scope: The OAuth 2.0 Client is not allowed to request scope 'workers-scripts.read'.
```

앱이 Client에 허용되지 않은 legacy scope까지 요청한 것이 원인이었다. `.env.oauth`에 `CLOUDFLARE_OAUTH_SCOPES`를 넣어 테스트 Client의 허용 목록과 정확히 맞추고 BlogGenius를 재시작한 뒤 재인증했다.

```dotenv
CLOUDFLARE_OAUTH_SCOPES="memberships.read workers-scripts.admin workers-scripts.edit workers-routes.write dns.read zone.read offline_access"
```

당시 사용자는 이 구성으로 BlogGenius에서 **사이트 생성, 배포, custom domain 연결, 사이트 삭제**까지 성공했다. 이후 별도 테스트 Client에서 Workers Admin만 사용하고 동일한 전체 흐름을 다시 성공했다고 확인했다. 따라서 앱 기본 scope에서는 Editor와 legacy Scripts Read/Write를 제거하고 Admin-only Workers 권한을 사용한다.

### 4. API Token과의 관계

Cloudflare 계정의 API Token 목록에 보이는 Workers 권한은 API Token 자체에만 적용된다. 사용자가 공유한 `Cloudflare Agent Token` summary에는 그 token에 Workers Scripts Read가 보였지만, 그것이 OAuth Client에 `workers-scripts.read`를 추가하거나 OAuth 동의를 확장하지는 않는다. OAuth 실패 원인도 API Token이 아니라 Client 허용 scope와 BlogGenius 요청 scope의 불일치였다.

BlogGenius의 이 흐름은 OAuth Client로 발급받은 access/refresh token을 사용한다. 별도 API Token은 OAuth Client 설정이나 OAuth environment 파일에 넣지 않는다.

## 현재 BlogGenius 구현 상태

- Development source run은 `.env.oauth.dev`, Production source run은 `.env.oauth.prod`의 `CLOUDFLARE_OAUTH_CLIENT_ID`를 읽는다. Packaged Production은 GitHub repository Secret `CLOUDFLARE_OAUTH_CLIENT_ID`를 build config로 받는다.
- scope override는 기본 목록에 합쳐지지 않고, 지정한 scope 전체를 authorization 요청에 사용한다. Client가 허용한 목록과 일치시켜야 한다.
- 기본 목록은 `memberships.read workers-scripts.admin workers-routes.write dns.read zone.read offline_access`다. 기본값은 `workers-scripts.edit`, `workers-scripts.read`, `workers-scripts.write`를 요청하지 않는다.
- OAuth scope는 공개 설정이므로 GitHub secret으로 저장하지 않는다. 실제 Client에 맞춘 예외가 필요할 때만 환경별 OAuth 파일에 `CLOUDFLARE_OAUTH_SCOPES`를 지정한다.
- Client Secret은 데스크톱 PKCE 앱에 필요하지 않으며 배포 앱에 포함하지 않는다.
- `/memberships` 결과는 계정 후보 목록이다. BlogGenius는 각 계정에 `GET /accounts/{id}/workers/scripts?per_page=1`을 보내 현재 OAuth access token으로 Worker 목록을 읽을 수 있는 계정만 Site Hosting 사용 가능 목록으로 반환한다. `403`은 해당 계정만 제외하고, 다른 API 오류는 권한 여부를 확인할 수 없는 상태로 처리해 배포를 막는다.
- 설정의 Cloudflare 화면은 위 검증을 통과한 계정의 목록만 표시한다. BlogGenius에서 Cloudflare 계정을 추가·삭제하는 동작은 제공하지 않으며, 허용 범위는 Cloudflare OAuth 재인증으로 바꾼다.
- Site 배포 때 접근 가능한 계정이 하나면 자동 선택한다. 여러 개면 사용자에게 선택을 받고, 계정 ID와 표시 이름을 Site의 `.bloggenius/site.json`에 `cloudflare_account`로 저장한다. 다음 배포는 저장된 계정만 사용한다. 기존 배포가 `deployment.worker_account_id`를 갖고 있으면 그 값을 기준으로 삼고, 저장된 계정과 다르면 오류로 중단한다. 기존 binding과 다른 계정으로 자동 이동하지 않는다.
- custom domain의 Zone 조회·연결·해제와 Worker 삭제/해지 검증도 해당 Site의 `deployment.worker_account_id`를 사용한다. 따라서 도메인 연결 때 별도의 계정 선택은 하지 않는다. 아직 배포하지 않은 Site는 Zone 조회를 시작할 수 없고, 배포 후 해당 계정의 Zone만 표시한다.
- Project 계정 설정 기능이 아직 없으므로 선택값은 Site마다 저장한다. Project 관리 UI가 생기면 계정 소유 범위를 다시 검토한다.

현재 구현 검증: `node --test src/site-hosting/cloudflare-connection.service.test.js scripts/project-environment.test.js` 통과 (8 tests). 실계정 full-flow 결과는 위 실험 3에 기록했다.

## 운영 시 주의점

1. Production OAuth Client는 Development Client와 분리한다. 공개 전환이 필요하면 Cloudflare의 Client URL 도메인 검증을 완료한다.
2. Production Client에는 Admin-only 실테스트에서 성공한 scope 목록을 반영한다.
3. `workers-scripts.admin`은 Worker 삭제를 포함한다. 동의 화면과 제품 안내에서 이 권한 범위를 명확히 설명한다.
4. Client의 scope 허용 목록 변경 후에도 기존에 발급한 연결 token이 새 동의를 반영하지 않을 수 있다. 권한이 바뀌면 BlogGenius에서 재인증하고 실제 동작으로 확인한다.
5. 필요한 경우 Cloudflare `GET /oauth/scopes` registry와 OAuth Client의 상세 scope summary를 모두 확인한다. UI의 중복/변경된 표시명만으로 scope ID를 추측하지 않는다.

Cloudflare 참고 자료:

- [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [Create an OAuth client](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)
- [OAuth Client API](https://developers.cloudflare.com/api/resources/iam/subresources/oauth_clients/)
- [List Worker Scripts API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/methods/list/)
