# Cloudflare Static Assets 배포 PoC

이 PoC의 자동화 테스트는 Cloudflare Direct Upload 요청을 **mock 응답으로만** 확인한다. 별도의 live runner는 OAuth 인증 후 사용자 입력으로 명시적으로 게시를 확인해야만 쓰기 요청을 시작한다.

```sh
node --test prototypes/cloudflare-static-assets-deploy-poc/deploy-client.test.js
```

## 승인된 실계정 샘플 배포 확인

`run-live-deploy-check.js`는 별도 live 확인용이다. 사용자가 OAuth consent를 마친 뒤에도 계정의 workers.dev subdomain과 Worker 이름 충돌을 읽기 요청으로 먼저 확인한다. 새 Worker와 공개 HTML을 만들기 직전에 Worker 이름과 공개 URL을 보여주고, 터미널에서 정확히 `PUBLISH <worker-name>`을 입력해야 쓰기 요청을 시작한다. 다른 입력은 취소로 처리한다.

Cloudflare 비공개 OAuth client에 다음 scope가 허용된 상태에서 저장소 루트에서 실행한다.

```sh
CF_OAUTH_CLIENT_ID=your-private-client-id node prototypes/cloudflare-static-assets-deploy-poc/run-live-deploy-check.js
```

인증 주소는 시스템 브라우저에서 연다. 계정 membership이 여러 개면 출력된 안내에 따라 `CF_ACCOUNT_ID`를 지정해 다시 실행한다. 기본 Worker 이름은 랜덤하게 만든다. 충돌 확인용으로 `CF_WORKER_NAME`에 이름을 지정할 수도 있다.

성공하면 Worker와 `workers.dev` 공개 샘플 페이지가 계정에 남는다. 자동 삭제는 하지 않는다. 업로드/버전/배포 중 실패하면 이미 생성된 Worker나 업로드 리소스가 남을 수 있으며, 실패 단계와 Worker 이름을 터미널에 표시한다. 기존 Worker 이름이 발견되면 runner는 해당 Worker의 deployment 목록을 먼저 읽고, 배포가 전혀 없을 때만 재사용 후보로 제시한다. 기존 deployment가 있으면 쓰기를 중단한다. 재사용도 다시 정확한 `PUBLISH <worker-name>` 확인이 필요하다. 테스트용 Worker 제거는 Cloudflare Dashboard에서 사용자가 직접 확인한 뒤 처리한다.

## 검증하는 순서

1. `POST /accounts/{account_id}/workers/workers`로 Worker 리소스를 만든다. `workers.dev` 사용을 요청한다.
2. `POST /workers/scripts/{script_name}/assets-upload-session`에 경로별 hash/size manifest를 등록한다.
3. Cloudflare가 돌려준 bucket별 해시 파일을 `/workers/assets/upload?base64=true`로 전송한다. 이 업로드에는 OAuth access token 대신 업로드 session JWT를 쓴다.
4. `POST /workers/scripts/{script_name}/versions`로 assets binding을 포함한 multipart 새 버전을 올린다. 이 안정 API는 업로드만 하고 traffic은 바꾸지 않는다.
5. 별도의 `POST /workers/scripts/{script_name}/deployments`로 새 버전에 트래픽을 보낸다.
6. `GET /workers/scripts/{script_name}/deployments`로 배포를 조회한다. 응답 첫 항목이 현재 트래픽을 받는 최신 배포다.

Worker 생성 API는 Beta 경로를 사용한다. 버전 업로드는 안정 `workers/scripts/{script_name}/versions` multipart API를 사용한다. 별도 deployment API를 호출하기 전까지 공개 traffic은 바뀌지 않는다.

자산 업로드 세션 생성, Worker 생성, 버전 업로드, 배포는 모두 Cloudflare 원격 상태에 영향을 준다. mock 통과는 실제 API 동작을 증명하지 않는다. live runner는 계정과 Worker 상태를 먼저 조회하고, 각 쓰기 시도 전에 대상 이름/URL을 표시해 사용자의 명시적 확인을 받는다. 오류 메시지에는 Cloudflare 오류 코드와 HTTP 상태를 포함하되 token 값은 출력하지 않는다.

2026-10-02 승인된 실계정 검증에서 bucket 업로드가 처음에는 `HTTP 500 / -1`, SDK 방식 `body[hash]`에서는 `HTTP 202`와 completion JWT 부재로 진행되지 않았다. Cloudflare Workers for Platforms 가이드에 따라 필드명을 hash 자체로 바꾸자 업로드 JWT를 받아 완료됐다. 이어 version upload를 beta endpoint로 시도했을 때 `HTTP 415` (`Content-Type: application/json` 요구)가 발생해, 안정 `/workers/scripts/{name}/versions` multipart API로 바꿨다. 같은 미배포 Worker의 version 업로드와 100% 배포가 성공했고, 공개 workers.dev URL에서 HTTP 200과 샘플 본문을 확인했다. 테스트 Worker는 계정에 남아 있다. 로컬 배포/OAuth 집중 테스트 25개도 통과했다. 상세 기록은 [배포 PoC 개발 기록](../../../docs/plans/active/2026-10-02-cloudflare-static-assets-deploy-poc-development.md)을 참고한다.

## 권한과 사용자 계정 조건

- Cloudflare OAuth scope 목록을 read-only API로 조회해 ID와 표시 이름을 확인했다. 중복처럼 보이는 `Workers > Edit` 두 항목은 서로 다른 scope다: `workers-scripts.edit`는 **Workers Editor**, `workers-scripts.write`는 **Workers Scripts Write**다. Cloudflare UI가 둘 다 `Edit`로 축약해 표시한다. 실제 편집 단계에서 두 번째 `Edit`를 선택하면 다음 단계 요약에 `Workers Scripts Write`라고 표시되는 것도 확인했다.
- Worker 생성, 자산 업로드 세션, 버전 업로드, 배포 API Reference는 **Workers Scripts Write**를 허용 권한으로 적고 있으므로 배포 runner는 `workers-scripts.write`를 요청한다. 반면 최신 Workers 역할 문서는 기존 Worker 편집·배포에는 `Editor`, 새 Worker 생성에는 제품 범위 `Admin`이 필요하다고 설명한다. OAuth의 `workers-scripts.write`가 새 역할 모델에서 Worker 생성까지 허용하는지는 문서만으로 완전히 해소되지 않았으므로, 실제 쓰기 시도는 계속 명시적 게시 확인 뒤에만 허용한다.
- 기존 계정 연결 및 목록 조회는 `memberships.read workers-scripts.read`로 확인했다. `workers-scripts.write`를 OAuth client에 허용한 후 해당 scope까지 요청하는 동의 흐름도 통과했다. 실제 배포는 별도 게시 확인이 필요하다.
- `workers.dev` 주소는 계정에 subdomain이 준비되어 있어야 한다. Worker 이름도 hostname label 제약(최대 63자, 영문자/숫자/하이픈)을 따른다.
- 첫 실험은 새롭고 충돌하지 않는 Worker 이름과 사용자가 지정한 개발 계정만 대상으로 해야 한다. 기존 Worker를 교체하거나 정리하는 로직은 이 PoC 범위가 아니다.

## 공식 문서

- [Workers Static Assets Direct Upload](https://developers.cloudflare.com/workers/static-assets/direct-upload/)
- [Create Worker API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/methods/create/)
- [Create Worker Assets Upload Session API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/assets/subresources/upload/methods/create/)
- [Upload Worker Assets API](https://developers.cloudflare.com/api/resources/workers/subresources/assets/subresources/upload/methods/create/)
- [Create Worker Version API](https://developers.cloudflare.com/api/resources/workers/subresources/beta/subresources/workers/subresources/versions/methods/create/)
- [Upload Worker Version API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/versions/methods/create/)
- [Create Worker Deployment API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/create/)
- [List Worker Deployments API](https://developers.cloudflare.com/api/resources/workers/subresources/scripts/subresources/deployments/methods/list/)
- [Cloudflare OAuth client scopes](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/)
- [List OAuth Scopes API](https://developers.cloudflare.com/api/go/resources/iam/subresources/oauth_scopes/methods/list/)
- [Workers roles and permissions](https://developers.cloudflare.com/workers/authorization/workers/)
- [workers.dev routing](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
