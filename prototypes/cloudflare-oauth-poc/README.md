# Cloudflare 데스크톱 OAuth PoC

이 독립 Node.js PoC는 Cloudflare OAuth Authorization Code + PKCE 프로토콜의 기본 흐름을 확인한다. BlogGenius에 연결되어 있지 않으며, 호출자가 `fetch` 구현을 전달하지 않는 한 네트워크 요청을 보내지 않는다.

PoC는 Cloudflare 인증 주소를 만들고, 일회용 `state`와 PKCE verifier를 연결한다. 만료되거나 재사용된 `state`는 거부하고, client secret 없이 authorization code를 Cloudflare token endpoint와 교환한다. 집중 테스트에서는 네트워크 응답과 API 요청을 모의한다.

저장소 루트에서 집중 테스트를 실행한다.

```sh
node --test prototypes/cloudflare-oauth-poc/oauth-client.test.js
```

## 실제 Cloudflare OAuth 확인

비공개 Cloudflare OAuth 클라이언트에 다음 redirect URI를 등록해 실제 시험을 완료했다.

```text
http://127.0.0.1:43127/oauth/callback
```

테스트 클라이언트의 공개 Client ID로 다음 명령을 실행해 수동 확인을 시작할 수 있다.

```sh
CF_OAUTH_CLIENT_ID=your-client-id node prototypes/cloudflare-oauth-poc/run-live-check.js
```

스크립트는 `127.0.0.1:43127`에만 연결해 일회용 callback 하나를 처리한다. Cloudflare 인증 주소를 만들고 code를 한 번 교환한 뒤 `GET https://api.cloudflare.com/client/v4/memberships`를 호출해 연결된 계정 이름과 멤버십 상태를 요약한다. 계정 조회에는 읽기 요청만 사용하며, access token 및 refresh token 값은 출력하거나 저장하지 않는다.

기본 scope는 `memberships.read`이며 Cloudflare Dashboard의 **Memberships Read** 권한에 해당한다. OAuth 클라이언트에도 이 권한을 허용해야 한다. 등록된 클라이언트에서 다른 scope를 선택했다면 공백으로 구분해 `CF_OAUTH_SCOPES` 환경 변수에 지정한다. 이 scope로 실제 OAuth 승인 및 멤버십 목록 조회를 확인했다.

실제 인증을 시작하기 전에 redirect URI와 scope가 등록된 클라이언트 설정과 일치하는지 확인한다. Client ID는 공개 식별자이지만, access token, refresh token, client secret 또는 API token은 이 저장소나 채팅에 기록하지 않는다.

## Workers Static Assets 목록 확인

등록된 비공개 OAuth 클라이언트가 `Memberships Read`와 `Workers Scripts Read`를 허용하는지 확인한 뒤 다음 명령으로 읽기 전용 목록 조회를 시작한다.

```sh
CF_OAUTH_CLIENT_ID=your-client-id node prototypes/cloudflare-oauth-poc/run-static-assets-list-check.js
```

기본 요청 scope는 `memberships.read workers-scripts.read`다. 이 PoC는 먼저 승인된 account membership을 조회한 다음 `GET /accounts/{account_id}/workers/scripts`를 호출한다. 연결된 계정이 하나면 자동 선택하고, 여러 개면 임의로 고르지 않고 종료한다. 이 경우 membership 결과의 ID 중 하나를 지정해 다시 실행한다.

```sh
CF_OAUTH_CLIENT_ID=your-client-id CF_ACCOUNT_ID=32-character-account-id node prototypes/cloudflare-oauth-poc/run-static-assets-list-check.js
```

출력은 Worker script 수와 `has_assets: true`인 항목의 이름만 포함한다. Worker 생성·수정·삭제·배포는 수행하지 않는다.
