# Cloudflare 데스크톱 OAuth PoC

## 브랜치와 상태

- 브랜치: `codex/cloudflare-oauth-poc`
- 시작일: 2026-10-01
- 기준/부모 브랜치: `codex/static-site-builder-main`
- 상태: Authorization Code + PKCE 및 `memberships.read` 실제 승인을 확인했고, OAuth Bearer token으로 계정 멤버십 목록을 읽는 데 성공했다.
- 부모 기능: [정적 사이트 빌더 메인 기능](../active/2026-10-01-static-site-builder-main-development.md)

## 사용자 요구와 목표

사용자 여정의 첫 단계인 “BlogGenius 데스크톱 앱에서 Cloudflare 계정 연결”을 검증한다. Cloudflare가 데스크톱 OAuth 흐름을 지원하는지, BlogGenius의 로컬 callback 및 PKCE 구조를 적용할 수 있는지 작은 PoC로 확인한다.

## 범위

- Cloudflare의 공식 OAuth 클라이언트 흐름을 조사하고, BlogGenius의 기존 Google OAuth 루프백 및 PKCE 구현과 프로토콜 요구사항을 비교한다.
- Authorization Code + PKCE(`S256`) 인증 주소 생성과 authorization code 교환을 검증하는 독립 PoC를 만든다. 단위 테스트는 네트워크 응답을 모의하며, 실제 앱 UI에 연결하지 않는다.
- Cloudflare 클라이언트 등록에 필요한 항목과 실제 계정에서 시험해야 하는 사항을 구분한다.
- 이 단계는 데스크톱 OAuth 인증과 연결된 Cloudflare 계정의 읽기 전용 목록 확인까지 다룬다. Static Assets 목록 조회, 배포, 배포 상태 확인은 이후 단계에서 다룬다.

## 명시적 비목표

- 사용자의 Cloudflare 계정에서 OAuth 클라이언트를 등록하거나 공개 전환, 수정하지 않는다.
- 실제 Cloudflare 사용자 토큰을 영구 저장하거나 출력하지 않는다. 실제 교환 시험 중 access token은 교환 성공을 확인하는 동안에만 프로세스 메모리에 일시 보관되며, 프로세스 종료 시 사라진다.
- Cloudflare 리소스를 생성·수정·삭제하거나 배포하지 않는다. 허용 범위 검증을 위한 계정 멤버십 목록 읽기만 수행한다.
- 제품 UI, 토큰 영속 저장, Static Assets 조회, API 클라이언트 의존성 또는 배포 동작을 추가하지 않는다.
- Cloudflare 문서상 되돌릴 수 없는 공개 클라이언트 전환을 하지 않는다.

## 구현 전 조사 결과

- Cloudflare는 Authorization Code + PKCE를 지원한다. 데스크톱, 모바일, 브라우저 앱은 `S256`을 사용하며 client secret이 필요하지 않다.
- Cloudflare는 authorization, token, revoke, user-info endpoint를 제공한다.
- OAuth 클라이언트는 해당 계정의 Super Administrator, Administrator 또는 OAuth Client Write 역할을 가진 계정 구성원이 등록해야 한다. 등록 시 redirect URI와 scope를 하나 이상 지정해야 한다.
- 새 OAuth 클라이언트는 비공개로 만들어지며, 소유 계정 구성원만 승인할 수 있다. 공개 클라이언트로 바꾸려면 게시자 도메인 검증이 필요하고, 공개 전환은 되돌릴 수 없다.
- Cloudflare OAuth 문서는 Google 방식의 별도 sandbox 또는 테스트 사용자 모드를 설명하지 않는다. 소유 계정 구성원만 쓸 비공개 클라이언트를 개발 및 테스트용으로 사용할 수 있다. 계정 리소스까지 테스트 환경으로 격리하려면 별도의 개발 Cloudflare 계정과 클라이언트를 사용할 수 있다. 이는 문서에 기술된 공개/비공개 동작을 바탕으로 한 해석이며, Cloudflare가 전용 sandbox를 제공한다는 뜻은 아니다.
- 비공개 third-party OAuth 클라이언트에서 고정 루프백 redirect `http://127.0.0.1:43127/oauth/callback`을 등록할 수 있었고, 실제 authorization code도 이 주소로 전달되었다. 동적 포트와 공개 클라이언트 동작은 아직 확인하지 않았다.
- Dashboard의 권한 선택 화면은 OAuth scope ID 대신 사람이 읽을 수 있는 권한 이름을 보여준다. 첫 요청은 `workers-platform.read`를 사용했고 Cloudflare가 `invalid_scope`로 거절했다. 이 클라이언트에서 Dashboard의 “Developer Platform → Workers → Read” 권한과 일치하지 않았다. 해당 권한은 “Workers Scripts Read”로 표시되며, `workers-scripts.read`를 요청하자 승인과 code 교환에 성공했다.
- 기존 BlogGenius Google OAuth는 루프백 callback, `state`, PKCE S256, 대기 요청 만료, 취소 처리를 이미 사용한다. 단, Google 전용 token 교환 방식과 scope 가정은 그대로 가져오면 안 된다.
- 목표 UX는 BlogGenius에서 연결을 누르고, 시스템 브라우저에서 Cloudflare 로그인 및 동의를 마친 뒤 완료 페이지를 확인하고 앱으로 돌아오는 흐름이다. 외부 브라우저를 자동으로 닫을 필요는 없다. 로컬 callback이 성공 여부를 전달한다.
- **인증 주소의 생성 과정(PoC에서 확인):** `beginAuthorization()`은 매 시도마다 새로운 암호학적 `state`와 PKCE verifier를 만들고, S256 challenge를 계산한다. 이를 등록된 Client ID, 고정 callback URI, 응답 유형, 요청 scope와 조합해 Cloudflare 인증 주소를 만든다. PoC 프로세스는 verifier와 state를 메모리에 보관하고, 생성된 인증 주소를 출력한다. 시스템 브라우저 시험에서는 `open <authorization-url>` 명령으로 macOS 기본 브라우저에서 열었다. Cloudflare는 일회용 code와 state를 같은 고정 callback URI로 돌려보낸다. 로컬 프로세스가 state를 검증하고 메모리에 보관한 verifier로 code를 교환한 뒤 완료 페이지를 반환한다. 즉, 인증 주소는 로그인 시도마다 앱/PoC가 생성한다. Cloudflare Dashboard에서 수동으로 만드는 주소가 아니며, 등록된 고정 callback URL과도 다른 주소다.
- Amade의 현재 CLI는 `wrangler login --device --browser=false`를 호출하고 Wrangler 인증 상태를 전용 Docker 볼륨에 저장한다. 이는 CLI/Wrangler의 device 로그인 흐름이며, BlogGenius가 자체 OAuth 클라이언트를 등록하고 운영하는 방식과 다르다. UX 참고로만 사용한다.
- Cloudflare는 third-party OAuth 클라이언트의 Device Authorization grant를 지원하지 않는다고 명시한다. 데스크톱 앱은 Authorization Code + PKCE를 사용해야 한다. Wrangler device 로그인과 BlogGenius 전용 OAuth 앱에서 지원되는 흐름을 혼동하지 않는다.
- 데스크톱 브라우저 연동에는 등록된 클라이언트와 redirect URI, 시스템 브라우저에서 인증 주소 열기, 루프백 또는 등록된 deep link callback, state/PKCE 검증, token 교환, 완료 페이지, 그리고 앱 UI가 성공 또는 취소를 감지하는 방법이 필요하다. 운영 토큰은 일반 파일이나 사이트 작업 디렉터리가 아니라 안전한 앱 저장소에 보관해야 한다.

## 쉬운 비유: 호텔 수영장 이용

OAuth 흐름을 “투숙객이 호텔의 수영장을 이용하는 과정”으로 설명할 수 있다. 이 비유는 역할을 쉽게 구분하기 위한 것으로, 실제 권한과 토큰의 동작을 문자 그대로 묘사하지는 않는다.

| OAuth 개념 | 호텔 비유 |
| --- | --- |
| 사용자 | 투숙객 |
| Cloudflare | 투숙객을 확인하고 수영장 출입을 관리하는 호텔 |
| BlogGenius | 이용 절차를 도와주는 컨시어지 |
| OAuth Client | 호텔에 등록된 컨시어지의 신분 정보. 이번 테스트 이름은 `bloggenius_test` |
| Scope | 허용 범위. OAuth 교환 시험에서는 Workers Scripts Read, 계정 조회 시험에서는 Memberships Read를 사용 |
| Authorization Code | 승인이 끝난 직후 호텔이 발급하는 짧은 시간 동안 유효한 교환용 인계표 |
| Access Token | 허용된 작업을 요청할 때 제시하는 이용 패스 |
| PKCE verifier | 인계표를 패스로 교환할 때 등록된 컨시어트임을 증명하는 임시 비밀값 |
| `state` | 브라우저에서 돌아온 응답이 현재 로그인 요청에 속하는지 확인하는 일회용 식별값 |
| Callback URI | OAuth 응답을 기다리는 로컬 만남 장소. 이번에는 `http://127.0.0.1:43127/oauth/callback` |
| Refresh Token | 발급되는 경우, access token이 만료된 뒤 새 패스를 요청할 때 쓰는 장기 교환 수단. 이번 시험에서는 발급되지 않음 |

실제 단계는 다음과 같다.

1. **BlogGenius를 Cloudflare에 등록한다.** 호텔은 `bloggenius_test`라는 컨시어트와 돌아올 주소(callback URI)를 미리 알아둔다.
2. **사용자가 BlogGenius에서 Cloudflare 연결을 시작한다.** BlogGenius는 새 `state`와 PKCE verifier를 만들고, verifier에 대응하는 challenge를 계산한다. 이 값들은 로그인 시도를 안전하게 연결하는 데 사용된다.
3. **시스템 브라우저가 Cloudflare로 이동한다.** BlogGenius가 매 시도마다 만든 인증 주소에는 Client ID, 등록된 callback URI, 요청 scope, `state`, PKCE challenge가 포함된다.
4. **사용자가 로그인하고 요청 권한을 승인한다.** Cloudflare는 사용자를 확인하고 BlogGenius가 요청한 권한을 보여준다. 사용자가 승인해야 계속된다. 최초 OAuth 교환 시험은 Workers Scripts Read였고, 계정 목록 조회 시험에서는 Memberships Read를 승인했다.
5. **Cloudflare가 callback으로 authorization code를 보낸다.** 이 코드는 access token 자체가 아니라, token 교환에 한 번 사용하는 짧은 수명의 인계표에 해당한다. Cloudflare는 함께 돌아온 `state`로 요청을 연결한다.
6. **BlogGenius가 `state`를 검증한다.** 저장해 둔 값과 다르면 현재 요청의 응답이 아니므로 거부한다.
7. **BlogGenius가 authorization code를 access token으로 교환한다.** BlogGenius는 code와 프로세스 메모리에 보관한 PKCE verifier를 Cloudflare에 보낸다. Cloudflare는 verifier가 맞는지 확인하고 access token을 반환한다. 데스크톱 앱은 client secret을 안전하게 숨길 수 없으므로 이 PoC는 secret 대신 PKCE를 사용한다.
8. **access token으로 허용된 범위의 작업을 한다.** 첫 시험에서는 Workers Scripts Read, 후속 시험에서는 Memberships Read 범위로 실제 API를 호출했다. 원격 쓰기나 배포는 수행하지 않았다. token 만료 뒤 갱신에 refresh token을 쓸 수 있지만, 시험에서는 발급되지 않았다.

OAuth 시스템 브라우저 인증, 로컬 code 교환, OAuth Bearer token으로 연결된 계정 멤버십 목록을 읽는 검증까지 완료했다. 토큰 값은 저장하지 않는다. Static Assets 조회와 배포는 이 단계에서 다루지 않는다.

참고한 공식 문서: [OAuth 클라이언트 만들기](https://developers.cloudflare.com/fundamentals/oauth/create-an-oauth-client/), [Cloudflare OAuth 연동](https://developers.cloudflare.com/fundamentals/oauth/integrate-with-cloudflare/), [애플리케이션 승인](https://developers.cloudflare.com/fundamentals/oauth/authorizing-an-application/).

## 제안한 PoC와 완료 기준

1. 순수 Node.js 모듈이 등록된 Client ID, 정확한 redirect URI, `response_type=code`, state, PKCE S256 challenge를 포함한 인증 주소를 만든다.
2. 모듈이 요청별 verifier/state를 메모리에 보관하고, 누락되거나 만료, 불일치, 재사용된 state를 거부한다.
3. Cloudflare의 공식 token endpoint로 code를 교환한다. 원래 redirect URI와 verifier를 보내고 client secret은 보내지 않는다.
4. 집중 테스트는 fetch를 모의해 검증한다. 이 테스트에서는 인증 정보, 브라우저 로그인, 네트워크 요청 또는 외부 변경이 필요하지 않다.
5. `127.0.0.1`에만 연결되는 수동 실사용 점검 도구를 제공한다. 토큰 값은 저장하거나 출력하지 않는다. 등록된 비공개 클라이언트와 최소 권한 scope로 실제 authorization-code 교환을 확인한다.
6. Cloudflare가 브라우저를 로컬 callback으로 돌려보내고, BlogGenius가 성공/실패를 감지하며, callback 페이지가 사용자에게 앱으로 돌아가도록 안내하는지 확인한다. 브라우저를 자동으로 닫을 필요는 없다.

## 실제 계정 검증 경계

실제 시험 전에 사용자가 Cloudflare에서 비공개 OAuth 클라이언트를 등록하고, 사용할 수 있는 루프백 redirect URI와 최소 scope를 선택해야 한다. Client ID와 설정 정보는 로컬에서만 입력한다. access token, refresh token, client secret 또는 API token을 채팅에 붙여넣도록 요청하지 않는다. 고정 callback 및 `workers-scripts.read` 시험은 완료했다. 동적 루프백 포트나 공개 클라이언트를 시험하게 되면 별도로 검증한다.

## 검증

- URL 매개변수, PKCE, state 일회성 처리, token 교환 요청 형식을 확인하는 집중 Node 테스트.
- `git diff --check`.
- 전체 테스트 스위트는 실행하지 않았다. 이 단계에서는 실제 OAuth 실사용 시험을 별도로 수행했다.

## 결과와 인계

- BlogGenius UI에 연결하지 않은 독립 Node.js OAuth PoC를 `prototypes/cloudflare-oauth-poc/`에 추가했다. 프로토콜 모듈은 호출자가 fetch를 제공하지 않는 한 실제 네트워크 요청을 보내지 않는다.
- 선택 실행 가능한 실사용 점검 도구를 추가했다. `127.0.0.1:43127`에서 callback 하나를 처리하고 code를 교환한 다음 토큰 메타데이터만 출력한다. 토큰 값은 저장하지 않는다. 로컬 환경에서 제공한 테스트 Client ID가 필요하다.
- PoC는 Cloudflare 인증 주소에 `state`와 PKCE S256을 넣고, 일회용 verifier를 프로세스 메모리에 보관한다. 잘못되었거나 만료, 재사용된 state를 거부하며, client secret 없이 문서에 지정된 token endpoint로 authorization code를 보낸다.
- OAuth 전용 단계 검증: 집중 Node 테스트 5개 통과 및 `git diff --check` 통과.
- Cloudflare 인증 프로토콜이 가능하며 BlogGenius Google OAuth의 일반적인 루프백/PKCE 구조와 호환됨을 확인했다. Google 전용 endpoint, scope, 토큰 저장 방식 또는 client secret 처리를 그대로 재사용하지 않는다.
- Amade의 실제 Cloudflare 로그인 방식을 확인했다: `wrangler login --device --browser=false`. CLI가 브라우저 주소와 코드를 표시하고 Docker 전용 볼륨에 Wrangler 상태를 저장한다. 이는 기억한 CLI 흐름과 일치하지만, third-party OAuth 앱의 Device Authorization 지원 여부를 뜻하지는 않는다.
- 데스크톱 UX는 브라우저 기반 Authorization Code + PKCE를 사용한다. 시스템 브라우저를 열고, 등록된 callback을 BlogGenius가 받고, 완료 페이지를 표시한 다음 사용자가 앱으로 돌아온다. 성공 신호는 브라우저 종료가 아니라 callback이다.
- 첫 번째 실제 인증 시도에서는 등록된 비공개 클라이언트와 redirect URI로 로컬 callback 서버를 정상적으로 시작했다. Cloudflare는 동의 화면을 표시하기 전 `invalid_scope`를 반환했다. 요청한 `workers-platform.read`는 Cloudflare OAuth 클라이언트 API 예제에서 가져왔지만 Dashboard에서 선택한 “Workers → Read” 권한과 일치하지 않았다.
- 실사용 도구의 기본 scope를 `workers-scripts.read`로 수정했다. Dashboard에서 “Workers Scripts Read”로 표시되는 권한이다. `CF_OAUTH_SCOPES` 환경 변수로 다른 scope도 지정할 수 있도록 했다.
- scope 수정 후 mock 집중 테스트 5개 통과. `git diff --check` 통과.
- 실제 검증에서 Cloudflare가 `workers-scripts.read`를 승인하고, 등록된 `http://127.0.0.1:43127/oauth/callback`으로 authorization code를 전달했다. 로컬 PKCE 교환에 성공했다. 서버는 bearer token 종류, `expiresInSeconds: 3599`, 승인 scope `workers-scripts.read`, refresh token 미발급만 보고했다. access token 값은 출력 또는 저장하지 않았으며, 프로세스가 끝나 로컬에 남아 있지 않다.
- 브라우저 동작 후속 확인: 인앱 브라우저에서는 수정된 요청이 code 교환에 성공해도 동의 탭이 “Authorizing...” 상태로 남았다. 다른 탭에 보인 것은 첫 시도의 오래된 `invalid_scope` callback이었다. 사용자는 앞선 과정 중 ChatGPT Chrome 확장 프로그램 설치 안내가 나타나 흐름이 중단됐다고 보고했다. 이후 macOS 시스템 브라우저에서 같은 클라이언트, callback, scope로 새 state를 사용해 다시 시도했다. 사용자는 “Cloudflare OAuth succeeded. You may close this page.” 완료 페이지를 확인했다. 로컬 서버에서도 code 교환 성공, 3599초 만료 정보, `workers-scripts.read`, refresh token 미발급을 확인했다. 고정 루프백 URI, PKCE 교환, 시스템 브라우저 완료 UX가 모두 검증됐다. 인앱 브라우저에서 보인 완료 상태는 실제 결과와 달랐다.
- Cloudflare에는 비공개 테스트 클라이언트의 승인 기록이 남아 있다. 사용자는 Profile → Access Management → Connected Applications에서 확인하거나 취소할 수 있다. 추가 Cloudflare API 호출은 하지 않았다.
- 미해결 질문: Cloudflare가 동적 루프백 포트 또는 공개 OAuth 클라이언트에서 같은 고정 callback을 허용하는지 여부. BlogGenius 배포에 필요할 때 별도로 검증한다.
- 배포 관련 미해결 사항: 비공개 OAuth 클라이언트는 소유 계정 구성원만 사용할 수 있다. 임의의 사용자를 지원하려면 Cloudflare 공개 클라이언트 요건과 게시자 도메인 검증이 필요하며, 공개 전환은 되돌릴 수 없다. 이번 PoC에서는 이를 진행하지 않았다.
- 이후 배포 기술 조사(사용자 결정 전): Cloudflare 공식 Node SDK는 Workers script, asset upload session, version, deployment API를 제공하며 SDK를 이용한 정적 자산 업로드 예제도 있다. Cloudflare는 직접 API 업로드를 고급 프로그래밍 방식으로 설명하고, 일반 개인 사용자는 Wrangler 사용을 권한다. BlogGenius는 프로그래밍 방식으로 연동하므로 Node SDK가 유력한 후보지만, 샘플 사이트 배포 PoC에서 SDK와 내장 Wrangler를 비교해야 한다. SDK가 지원하지 않는 endpoint만 REST gateway로 감싼다. OAuth access token이 SDK의 `apiToken` 인증 옵션에서 동작하는지도 계정/API PoC에서 검증한다.
- 다음 검증 단계의 공식 문서 조사(2026-10-02): `GET /accounts`의 Cloudflare API reference는 OAuth/API token 보안 방식과 허용 권한을 명시하지 않는다. 반면 `GET /memberships`는 사용자에게 연결된 계정을 반환하고 `Memberships Read`를 허용 권한으로 명시한다. 따라서 초기 계정 조회 PoC는 `/memberships`를 사용했다. Cloudflare OAuth 문서는 OAuth scope 이름이 API token permission 이름에 대응한다고 설명한다. 사용자가 클라이언트에 Memberships Read를 추가한 뒤 scope ID `memberships.read`와 OAuth Bearer token의 API 호출을 실제로 확인했다.

## 계정 목록 읽기 PoC

- 사용자 승인으로 OAuth token을 발급받은 뒤 Cloudflare `GET /memberships`를 호출해 계정 연결 목록을 읽는 검증을 추가했다. 이는 원격 계정 데이터를 조회하는 읽기 전용 호출이며 배포나 리소스 변경 API는 호출하지 않는다.
- 실사용 스크립트는 기본 요청 scope를 `memberships.read`로 바꾸고, 성공 시 계정 ID, 이름, 멤버십 상태만 출력한다. 토큰은 프로세스 메모리에서 요청에만 사용하고 출력하거나 파일에 저장하지 않는다.
- 모의 테스트는 Bearer 인증 헤더, 목록 응답, API 오류 및 오류 메시지에서 토큰 비노출을 확인한다. 집중 테스트 7개 통과, `git diff --check` 통과.
- 실제 검증(2026-10-02): 사용자가 비공개 OAuth 클라이언트에 **Memberships Read** 권한을 추가한 뒤 시스템 브라우저에서 새 PKCE 인증을 완료했다. OAuth 응답 scope는 `memberships.read`였고, access token의 Bearer 인증으로 `GET /memberships`가 성공해 멤버십 1건을 반환했다. 계정 이름과 ID는 개발 문서에 저장하지 않는다. 토큰은 저장하지 않았다.
- 실제 결과로 OAuth scope ID `memberships.read`, OAuth access token을 Cloudflare API Bearer 자격 증명으로 사용하는 방식, 그리고 `/memberships`를 통한 연결 계정 조회를 확인했다. 다음으로 Static Assets 목록 조회 API와 최소 읽기 권한을 조사한다. 배포 및 원격 변경은 아직 수행하지 않았다.

이해 예시
# OAuth 2.0 이해하기: 외부 세탁 대행 서비스 비유

OAuth(오픈 인가)는 **사용자가 비밀번호를 제3자 서비스에 직접 넘기지 않고, 특정 권한만 안전하게 부여하는 표준 규격**입니다.

---

## 1. 왜 OAuth가 필요한가? (Why & Needs)

* **배경:** 투숙객(사용자)은 외부 전문 세탁 업체(Client App)에 세탁을 맡기고 싶어 합니다. 이를 위해 세탁 업체는 투숙객의 방에 접근해 세탁물을 가져와야 합니다.
* **기존 방식의 문제 (Needs):**
  * 세탁 업체가 투숙객에게 *"호텔 마스터키(비밀번호)를 넘겨주시면 저희가 직접 들어가서 옷을 가져올게요"*라고 요구합니다.
  * **위험성:** 마스터키를 공유받은 세탁 업체가 방 안의 금고나 개인 물품에 접근할 수 있고, 키가 유출될 경우 호텔 계정 전체 보안이 위협받습니다.
* **OAuth의 해결책:**
  * 마스터키를 절대 공유하지 않고, **'세탁물 수거 전용 임시 출입증(Access Token)'**만 발급받아 세탁 업체에 전달합니다.

---

## 2. 비유와 실제 OAuth 개념 매핑 (Mapping)

| OAuth 핵심 개념 | 호텔 세탁 비유 | 실제 역할 및 설명 |
| :--- | :--- | :--- |
| **Resource Owner** (사용자) | **호텔 투숙객** | 자신의 데이터(세탁물/프로필) 주인이며, 접근 권한을 승인하는 주체 |
| **Client App** (제3자 서비스) | **외부 세탁 업체 App** | 사용자의 데이터에 접근해 서비스를 제공하고자 하는 외부 서비스 |
| **Authorization / Resource Server** | **호텔 프론트 데스크** | 사용자를 인증하고, 권한을 검증하여 자원 접근을 제어하는 서버 (예: Google, Kakao) |
| **Protected Resource** | **호텔 객실 내 세탁물** | 보호받고 있는 사용자의 실제 데이터 (예: Google Calendar, Drive, 사용자 프로필) |
| **Access Token** | **세탁 전용 일회성 QR키** | 특정 권한 및 유효기간을 가진 임시 자격 증명서 |

---

## 3. OAuth 상호작용 및 처리 절차 (Procedure)

세탁 업체(Client App)가 호텔 프론트(Authorization Server)와 협력하여 안전하게 세탁물에 접근하는 전체 연동 흐름입니다.

[투숙객 (User)] <---> [세탁 업체 App (Client)] <---> [호텔 프론트 (OAuth Server)]

1. **서비스 요청 (Request)**
   * 투숙객이 외부 세탁 앱에서 "호텔 객실 세탁물 수거 요청" 버튼을 누릅니다.

2. **프론트 데스크 연동 및 사용자 인증 (Authorization Request & Authentication)**
   * 세탁 앱이 투숙객을 호텔 프론트 데스크 웹페이지로 리다이렉트합니다.
   * 투숙객은 프론트 데스크 화면에서 **본인의 호텔 계정으로 직접 로그인**합니다. *(세탁 앱은 비밀번호를 전혀 알 수 없음)*

3. **권한 동의 (Consent)**
   * 프론트 데스크가 투숙객에게 묻습니다:
     > *"세탁 업체에게 **'101호 세탁물 수거 권한'**만 부여하시겠습니까?"*
   * 투숙객이 "동의" 버튼을 클릭합니다.

4. **승인 코드 전달 및 Access Token 발급 (Token Exchange)**
   * 프론트 데스크는 세탁 앱에게 **'세탁 전용 임시 QR키(Access Token)'**를 발급합니다.
   * 해당 QR키에는 **'101호 방문 제한'**, **'세탁물 수거만 허용'**, **'2시간 유효기간'** 등의 조건이 지정됩니다.

5. **자원 접근 및 서비스 제공 (Resource Access)**
   * 세탁 업체 직원이 프론트 데스크에 '임시 QR키'를 제시합니다.
   * 프론트 데스크가 QR키의 유효성 및 권한을 검증한 후 세탁물(Protected Resource) 수거를 허용합니다.

---

## 핵심 요약

Client App은 **"호텔 방(내 정보)에 직접 들어올 자격이 없지만, 내 요청으로 특정 작업만 대신해 주는 외부 업체"**입니다.

OAuth는 이 외부 업체에게 **방 열쇠(비밀번호)** 대신 **제한된 임시 출입증(Access Token)**을 발급해 주는 안전한 인가(Authorization) 메커니즘입니다.
