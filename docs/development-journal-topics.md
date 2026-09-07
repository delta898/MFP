# 개발 과정에서 얻은 재사용 가능한 글감

데스크톱 애플리케이션과 연결형 백엔드를 개발하며 얻은 시행착오, 설계 판단과 기술 지식을
다른 프로젝트에도 적용할 수 있는 `주제 + 참고사항` 형태로 정리한다. 각 참고사항은 특정 제품의
개발 일지를 전제로 하지 않고, 그 자체만으로 AI가 문제의 배경과 해결 방향을 이해해 실용적인 글로
확장할 수 있도록 작성한다.

글을 만들 때에는 특정 구현을 정답처럼 소개하기보다 다음 흐름을 우선한다.

- 어떤 환경에서 문제가 발생하는가
- 처음에는 무엇을 오해하기 쉬운가
- 잘못 설계하면 어떤 위험이나 운영 비용이 생기는가
- 일반적으로 적용할 수 있는 해결 원칙과 구조는 무엇인가
- 선택지별 장단점과 도입 전 확인할 사항은 무엇인가

실제 secret, token, project 정보, 개인 데이터와 악용 가능한 운영 세부사항은 포함하지 않는다.
API 명칭, 지원 범위와 정책처럼 바뀔 수 있는 정보는 글을 작성하는 시점의 공식 문서로 다시
확인한다.

## 저장소와 인증 정보

### Secret 저장소만 믿으면 안 되는 이유: 반환 범위와 API 계약의 최소 권한 설계

**참고사항**

배포된 데스크톱 애플리케이션의 코드와 설정 파일은 사용자가 열어볼 수 있으므로 서버용 API key,
service role key와 외부 서비스의 장기 자격증명을 안전하게 숨길 수 없다. 이를 해결하기 위해
서버리스 함수나 백엔드 프록시의 Secret 저장소에 자격증명을 보관하는 경우가 많다. 그러나 Secret
저장소는 값을 서버 내부에서 보호할 뿐이다. 함수가 전체 설정을 응답하거나, 클라이언트가 임의의
URL·endpoint·query를 지정할 수 있게 하거나, 외부 API의 원본 응답을 그대로 전달하면 보호하던
권한을 다른 형태로 다시 노출하게 된다.

글에서는 `어디에 저장했는가`와 `어떤 기능까지 사용할 수 있게 했는가`를 별개의 보안 문제로
설명한다. 범용 프록시 하나를 만드는 대신 `뉴스 검색`, `상품 조회`처럼 사용자 기능 단위의 좁은
endpoint를 만들고, 서버가 호출할 외부 host와 path를 고정하며, 허용된 입력만 검증해야 한다.
응답 또한 화면에 필요한 필드만 새 객체로 구성해 provider의 내부 식별자, quota 정보와 디버그
데이터가 우연히 전달되지 않게 한다.

인증과 권한 확인, 요청 횟수 제한, timeout, 응답 크기 제한, cache, 감사 로그와 오류 형식도 API
계약의 일부다. 로그에는 secret, Authorization header와 원본 개인정보를 기록하지 않는다. 외부
서비스가 실패했을 때 다른 고권한 자격증명으로 조용히 우회하기보다 허용된 fallback만 사용하고,
권한 경계가 불명확하면 fail-closed하는 편이 안전하다. 핵심 교훈은 Secret 저장소가 최소 권한 API
설계를 대신하지 않으며, 안전성은 `저장 위치 + 호출 가능 범위 + 반환 범위 + 운영 통제`의 결합으로
만들어진다는 것이다.

### 설치형 데스크톱 OAuth에서 Client ID와 Client Secret을 이해하는 방법

**참고사항**

서버 애플리케이션은 운영자가 통제하는 환경에서 client secret을 보관할 수 있는 confidential
client다. 반면 설치형 데스크톱 애플리케이션은 실행 파일과 네트워크 요청을 사용자가 관찰할 수
있는 public client이므로, 설치 파일에 포함된 값을 진정한 비밀로 간주할 수 없다. 일부 OAuth
공급자가 설치형 앱에도 `client_secret`이라는 이름의 값을 발급하더라도, 이것만으로 복제된 앱을
신뢰하거나 사용자 토큰을 보호할 수 있다고 생각하면 안 된다. Client ID는 보통 애플리케이션을
식별하는 공개 값에 가깝다.

일반적인 설치형 앱은 시스템 브라우저에서 Authorization Code Flow를 시작하고 PKCE를 사용한다.
앱은 매 요청마다 무작위 `code_verifier`를 만들고 그 해시인 `code_challenge`를 인증 요청에 보내며,
인가 코드를 교환할 때 원래 verifier를 제시한다. 공격자가 redirect나 로그에서 인가 코드를
가로채도 verifier 없이는 토큰으로 바꾸기 어렵다. 여기에 정확한 redirect URI, loopback callback,
`state` 검증, 최소 scope, 짧은 인가 코드 유효시간과 OS 기본 브라우저 사용을 함께 적용한다.

Client 설정을 원격 DB에서 아무 클라이언트나 읽을 수 있게 제공하는 것은 PKCE와 별개의 노출
문제다. 공개되어도 되는 Client ID는 빌드 입력 또는 제한된 공개 설정으로 관리하고, 사용자별
refresh token은 OS keychain이나 적절히 보호된 사용자 저장소에 둔다. 설정 교체 시에는 기존 앱의
로그인 지속 여부, refresh token의 유효성, 새 redirect 등록, 사용자 재연결 필요성과 구버전 지원
기간을 함께 검토한다. 서버 프록시는 모든 OAuth에 무조건 필요한 것이 아니라, 서버만 수행해야
하는 고권한 작업이나 중앙 정책 집행이 필요한 경우에 선택한다는 점도 설명한다.

### Access Token과 Refresh Token으로 이해하는 OAuth 2.0 세션 수명주기

**참고사항**

Access token은 API를 호출할 때 제시하는 비교적 수명이 짧은 bearer credential이고, refresh token은
사용자가 매번 로그인하지 않아도 새 access token을 발급받게 해 주는 장기 자격증명이다. 둘을 모두
단순한 `API key`처럼 취급하면 만료 처리, 저장 위치와 연결 해제 정책을 잘못 설계하기 쉽다.

글에서는 사용자가 동의 화면에서 scope를 승인하고, 앱이 인가 코드를 토큰으로 교환하며, access
token 만료 전에 또는 401 응답 후 refresh를 시도하는 전체 흐름을 설명한다. Refresh token은 최초
동의, offline access 조건과 공급자 정책에 따라 매번 반환되지 않을 수 있으며, token rotation을
사용하는 공급자에서는 새 refresh token을 받았을 때 이전 값을 안전하게 교체해야 한다. Refresh가
거부되면 무한 재시도하지 말고 연결 만료 상태로 전환해 재인증을 요청한다.

Scope는 토큰이 행사할 수 있는 권한이므로 필요한 API 범위만 요청한다. 사용자별 토큰은 서버
공용 client 설정과 분리하고, 평문 로그·오류 응답·분석 도구에 남기지 않는다. 로그아웃 또는 연결
해제 시 로컬 값만 지우는 것과 공급자에게 token revoke를 요청하는 것의 차이도 구분한다. 여러
계정, 토큰 만료, 사용자의 권한 철회, 비밀번호 변경과 공급자 장애를 정상적인 상태 전이로 다루면
OAuth 오류를 예외적인 버그가 아니라 관리 가능한 세션 수명주기로 설계할 수 있다.

### 데스크톱 앱에 장기 API Key를 넣지 않고 단기 접근 토큰을 사용하는 구조

**참고사항**

데스크톱 앱이 사내 API나 유료 데이터 API를 직접 읽어야 할 때 서버의 장기 API key를 설치 파일에
넣는 방식은 간단하지만 안전하지 않다. 실행 파일에서 key가 추출되면 정식 앱이 허용받은 읽기
기능뿐 아니라 같은 key가 가진 관리·수집·export 권한까지 악용될 수 있고, key를 회전할 때 모든
설치본을 업데이트해야 할 수도 있다.

일반적인 대안은 token broker를 두는 것이다. 데스크톱 앱은 기존 사용자 세션, 라이선스 또는
기기 등록처럼 서버가 검증할 수 있는 자격을 broker에 제시한다. Broker는 자격과 사용 권한을
확인한 뒤 수명이 짧고 scope가 제한된 서명 토큰을 발급한다. 앱은 토큰을 디스크에 장기 보관하지
않고 메모리에서 제한적으로 재사용하며, 대상 API는 다음 항목을 모두 검증한다.

```text
Desktop application
  -> 사용자 또는 설치 자격 증명
Token broker
  -> 짧은 수명과 제한된 scope의 접근 토큰 발급
Desktop application
  -> Authorization: Bearer <short-lived token>
Protected API
  -> signature, issuer, audience, expiry, scope 검증 후 허용된 기능만 실행
```

JWT를 사용한다면 서명만 확인해서는 부족하다. `exp`·`nbf`, issuer, audience와 scope를 검증하고,
알고리즘과 key 선택 규칙을 서버가 제한해야 한다. 토큰 payload는 암호화된 비밀 공간이 아니므로
민감 정보를 넣지 않는다. Development에서 발급한 토큰이 Production에서 통과하지 않도록 환경별
issuer, audience와 signing key도 분리한다.

단기 토큰은 유출 가능성을 없애는 것이 아니라 피해 시간과 권한 범위를 줄인다. 토큰을 무제한
발급할 수 있는 signing key와 broker의 인증 우회는 개별 접근 토큰보다 더 큰 위험이므로 더 강하게
보호해야 한다. Rate limit, 발급 감사 로그, key rotation, clock skew, 재발급 폭주와 broker 장애 시
동작까지 다루면 단순한 JWT 소개가 아니라 운영 가능한 권한 위임 구조를 설명할 수 있다.

### 값의 민감도와 사용 범위를 함께 보고 저장 위치를 결정하는 법

**참고사항**

환경 설정을 준비할 때 이름에 `KEY`가 들어간 모든 값을 Secret으로 넣거나, 반대로 프런트엔드에
필요하다는 이유로 모두 공개 설정으로 처리하기 쉽다. 올바른 분류를 위해서는 두 축을 나눠야 한다.
`Repository`와 `Environment`는 값이 어느 저장소·배포 단계에서 사용되는지를 나타내고, `Secret`과
`Variable`은 노출되었을 때 보호가 필요한지를 나타낸다.

예를 들어 브라우저나 데스크톱 클라이언트에 포함되는 공개 API URL, OAuth Client ID와 제한된
publishable key는 공개되어도 권한 경계가 유지되도록 설계해야 하며 CI Variable 후보가 될 수 있다.
반면 DB password, service role key, 개인 access token, 배포용 PAT와 외부 provider의 서버 key는
노출만으로 권한을 행사할 수 있으므로 Secret이어야 한다. 사용자·업무 데이터는 CI 설정이 아니라
DB와 row-level access policy가 관리하고, 사용자별 OAuth token은 공용 빌드 Secret이 아니라 사용자
저장소가 관리한다. 개발자 PC의 비공개 빌드 입력은 Git에서 제외한 환경 파일이나 OS credential
store가 담당한다.

각 값에 대해 `누가 생성하는가`, `어디에서 소비하는가`, `클라이언트에 전달되는가`, `노출 시 가능한
행동은 무엇인가`, `회전 방법과 영향 범위는 무엇인가`, `로그에 나타날 수 있는가`를 표로 만들면
저장 위치가 명확해진다. 공개 client key는 공개되어도 안전하도록 서버의 RLS, scope, origin 정책과
rate limit이 받쳐줘야 하며, Secret 역시 과도한 권한을 갖지 않아야 한다. CI에서는 값의 원문을
출력하지 않은 채 존재와 형식만 사전검증하고, Production 값은 환경 승인과 최소 권한으로 제한한다.

### 이름이 비슷한 외부 API를 인증 계약과 사용 목적으로 구분하는 법

**참고사항**

한 회사가 `검색 API`라는 비슷한 이름으로 여러 제품을 제공하더라도 발급 체계, 인증 방식, quota와
지원 endpoint는 서로 다를 수 있다. 이를 하나의 설정이나 fallback key로 합치면 인증 오류를
반복하거나, 비용·요청 한도를 잘못 계산하거나, 한 기능의 장애가 다른 기능으로 번질 수 있다.

네이버 검색 생태계는 이 문제를 설명하기 좋은 사례다. 글을 작성하는 시점의 공식 문서를 다시
확인한다는 전제에서 다음처럼 구분할 수 있다.

- **Naver Developers Search OpenAPI**: Client ID와 Client Secret을 사용하며 Blog, News,
  Shopping 등의 콘텐츠 검색 endpoint를 제공한다.
- **Naver Search Ads API**: API Key, Secret Key와 Customer ID를 사용하고 요청 signature를
  요구하며, 광고 키워드의 검색량과 연관 후보 같은 지표를 다룬다.
- **NAVER API Hub Search API**: 위 두 제품과 별도의 발급·인증 계약을 가지며, API Hub가 제공하는
  검색 데이터 용도로 사용한다.

사용자 화면에서는 모두 `블로그 검색`이나 `키워드 분석`처럼 보일 수 있지만, 콘텐츠 문서를 찾는
검색과 키워드 수요·경쟁도를 계산하기 위한 데이터 수집은 목적이 다르다. 자격증명을 서로 fallback
하거나 이름이 비슷하다는 이유로 하나의 환경 변수에 저장하면 안 된다. API를 도입하기 전에
`공식 제품명 + 발급 콘솔 + 인증 방식 + base URL/endpoint + 사용 기능 + quota/비용 + 데이터 최신성
+ 장애 시 fallback` 표를 만들고, 코드와 Secret도 기능별 adapter 경계로 분리하는 방법을 설명한다.

## 외부 서비스와 미디어 연동

### Google Drive 공유 링크를 SNS API의 이미지 호스팅으로 사용할 수 있을까

**참고사항**

SNS 발행 API가 이미지 파일 업로드를 직접 받지 않고 공개 URL만 요구하면, 이미 Google 계정과
연결된 애플리케이션에서는 Google Drive를 임시 이미지 저장소로 활용하고 싶어진다. 이때
`브라우저에서 공유 링크가 열린다`는 사실만으로 SNS API도 이미지를 가져갈 수 있다고 판단하거나,
반대로 일반 Drive 공유 링크가 미리보기 화면을 보여준다는 이유만으로 Drive 전체를 사용할 수
없다고 단정하기 쉽다. 두 판단 모두 접근 권한과 미디어 전송 계약을 섞은 것이다.

Drive 권한은 파일 소유자와 애플리케이션만 업로드·수정·삭제할 수 있게 유지하면서, 해당 파일에
`type=anyone`, `role=reader` 권한을 추가해 익명 사용자에게 읽기만 허용할 수 있다. 애플리케이션이
직접 만든 파일만 다룬다면 전체 Drive 권한 대신 범위가 좁은 `drive.file` OAuth scope를 우선
검토한다. 다만 `webViewLink` 같은 일반 공유·미리보기 주소와 바이너리 파일의 브라우저 다운로드용
`webContentLink`는 용도가 다르다. SNS API가 요구하는 것은 로그인 화면이나 HTML 미리보기가 아니라
인증 없이 실제 이미지 바이트를 반환하는 HTTPS URL이다.

이 가설은 문서 해석만으로 확정하지 말고 최소한의 disposable PoC로 검증한다.

1. 대상 Google Cloud 프로젝트에서 Drive API가 활성화되어 있는지 확인한다.
2. 애플리케이션의 기존 OAuth 연결과 `drive.file` scope로 작은 임시 PNG 한 장을 업로드한다.
3. 그 파일에만 `anyone:reader` 권한을 적용한다.
4. Drive가 반환한 `webContentLink`를 인증 헤더와 로그인 쿠키 없이 요청한다.
5. HTTP 200, `Content-Type: image/*`, 충분한 응답 크기와 PNG/JPEG 같은 실제 파일 signature를
   함께 검사한다. 화면에 보인다는 사실이나 파일 확장자만 확인해서는 안 된다.
6. 최초 URL, redirect 유무와 최종 host를 기록하되 접근 token이나 민감한 query 값은 로그에
   남기지 않는다.
7. 성공과 실패에 관계없이 `finally` 성격의 정리 단계에서 임시 파일을 삭제한다.

실제 검증에서는 첫 요청이 HTTP 403으로 실패했다. OAuth 연결이나 scope 문제가 아니라 Google
Cloud 프로젝트에서 Drive API가 비활성화된 것이 원인이었다. API를 활성화한 뒤 같은 절차를 다시
실행하자 `anyone:reader` 적용과 익명 다운로드가 성공했고, 요청은 `drive.google.com`에서
`drive.usercontent.google.com`으로 이동한 뒤 HTTP 200, `image/png`와 유효한 PNG 바이트를 반환했다.
테스트 파일도 검증 직후 삭제되었다. 이 과정은 `Google 계정 연결 완료`와 `필요한 Google API
활성화 완료`가 서로 다른 준비 조건이라는 점도 보여준다.

그러나 이 결과가 곧 특정 SNS 발행 서비스와의 완전한 호환성을 의미하지는 않는다. 외부 서비스가
redirect를 따르는지, 최종 다운로드 주소를 안정적으로 처리하는지, 여러 이미지를 순서대로 가져가는지
실제 end-to-end 테스트가 남는다. 공급자가 `공개·직접·안정적인 URL`을 요구한다면 익명 요청뿐 아니라
redirect, content type, 파일 크기 제한, URL 수명과 예약 발행 시점까지의 가용성을 확인해야 한다.
글을 작성할 때에는 Google Drive와 연결 대상 SNS API의 최신 공식 문서를 다시 확인한다.

임시 파일의 수명주기도 핵심이다. 즉시 발행은 외부 서비스가 파일을 정상적으로 가져가고 발행 결과가
확정된 뒤 삭제할 수 있다. 예약·대기열 발행은 실제 발행 시점까지 파일을 유지해야 한다. Timeout처럼
성공 여부가 모호한 경우에는 곧바로 삭제하거나 같은 발행 요청을 반복하면 이미지 누락이나 중복
게시가 생길 수 있으므로, 결과를 재조회하고 정리 여부를 결정한다. 공개 기간에는 링크를 아는 누구나
파일을 읽을 수 있으므로 무작위 파일 ID를 접근 통제로 오해하지 않고, 최소 공개 시간·사용자 안내와
정리 실패 재시도도 함께 설계한다.

구현에서는 카드뉴스 생성과 저장소, SNS 발행을 한 덩어리로 묶지 않는다. `로컬 파일을 임시 공개
URL로 전환`, `외부 발행`, `결과 확정 후 정리`를 분리하면 Google Drive, WordPress 미디어,
Cloudflare R2나 전용 CDN을 상황에 따라 교체할 수 있다. Google Drive는 기존 사용자 계정과 좁은
권한을 재사용할 수 있다는 장점이 있지만 CDN을 목적으로 한 제품은 아니므로, 안정성·대량 처리·예약
보존이 중요해지면 객체 저장소와 비용, 개인정보, 운영 복잡도를 다시 비교한다.

**공식 문서 확인 대상**

- [Google Drive 파일·폴더 공유 권한](https://developers.google.com/workspace/drive/api/guides/manage-sharing)
- [Google Drive 파일의 `webViewLink`와 `webContentLink`](https://developers.google.com/workspace/drive/api/reference/rest/v3/files)
- [Google Drive 파일 다운로드](https://developers.google.com/workspace/drive/api/guides/manage-downloads)
- [Google Drive OAuth scope 선택](https://developers.google.com/workspace/drive/api/guides/api-specific-auth)
- [Buffer 미디어 URL 요구사항](https://developers.buffer.com/guides/hosting-media.html)

## 개발과 배포 환경

### GHCR에 Docker image를 보관하고 동일한 artifact를 환경별로 승격하는 방법

**참고사항**

Container registry는 소스 저장소나 실행 서버가 아니라, CI가 빌드한 Docker image를 보관하고
배포 대상이 가져갈 수 있게 하는 저장소다. GitHub에 소스와 CI가 있는 프로젝트에서는 GHCR
(GitHub Container Registry)을 사용해 테스트를 통과한 image를 Git commit, version tag와 digest에
연결할 수 있다. Development와 Production 서버가 각자 소스에서 image를 다시 빌드하지 않고 같은
digest를 내려받아 실행하면, 검증한 실행물과 배포한 실행물이 동일하다는 사실을 확인하기 쉽다.

글에서는 `source repository -> CI build/test -> image registry -> deployment target`의 역할을
구분한다. Tag는 사람이 읽기 쉽고 버전 운영에 편하지만 다른 image를 가리키도록 움직일 수 있다.
Digest는 image content에 의해 결정되는 immutable identity이므로 승격과 rollback의 정확한 기준이
된다. CI는 commit SHA와 version tag를 함께 기록하되 실제 배포 manifest에는 digest를 고정하고,
SBOM·취약점 검사·서명과 provenance를 연결하면 공급망 신뢰도를 높일 수 있다.

Docker Hub는 Docker 생태계 전반의 공개 배포와 발견에 강하고, GHCR은 GitHub repository, Actions,
Packages와 조직 권한을 함께 관리하기 편하다. Registry 선택 시 공개·비공개 범위, pull 권한,
보존 정책, 비용, multi-architecture image, rate limit과 서버의 인증 방법을 비교한다. Registry는
배포 승인, health check와 rollback을 대신하지 않으므로 동일 artifact 원칙과 운영 배포 절차를
함께 설계해야 한다.

### Local에서 Development를 거쳐 Production까지 DB 변경을 안전하게 승격하는 방법

**참고사항**

초기에는 필요한 SQL을 각 환경에 직접 실행해도 빠르게 보이지만, 시간이 지나면 어느 DB에 어떤
변경이 적용됐는지 재현하기 어렵고 운영 데이터에 검증되지 않은 변경을 적용할 위험이 커진다.
Local, 원격 Development와 Production의 역할을 분리하고 순서가 있는 canonical migration을 모든
환경의 단일 변경 이력으로 삼는 이유를 설명한다.

Feature branch에서는 빈 Local DB를 reset하고 migration과 비식별 seed가 처음부터 순서대로
적용되는지 확인한다. 통합 branch에서는 같은 migration과 server function을 Development에 배포해
원격 migration 이력, 함수 상태와 공개 smoke 결과를 검증한다. Production은 새로운 코드를 시험하는
장소가 아니라 Development에서 검증한 변경 묶음을 승인해 승격하는 대상이어야 한다.

이때 artifact와 fingerprint를 이용하면 `검증한 바로 그 변경인가`를 기계적으로 비교할 수 있다.
Artifact는 DB 복사본이 아니라 다음과 같은 배포 입력을 정규화한 JSON 명세다.

- 모든 migration의 version, 경로와 파일 내용 SHA-256
- 모든 server function과 shared module의 경로와 파일 내용 SHA-256
- 함수 이름과 인증 정책
- 환경별 manifest의 파일 내용 SHA-256
- 정확한 Git commit SHA

정렬과 직렬화 규칙을 고정한 artifact 전체의 SHA-256을 대표 fingerprint로 사용한다. SQL 한 글자,
함수 코드 한 줄, 인증 정책, manifest 또는 commit이 달라지면 fingerprint도 달라진다. Development
검증 결과에 fingerprint를 남기고 Release 후보에서 다시 계산한 값이 다르면 승격을 차단한다.
Fingerprint는 두 변경 묶음이 동일하다는 증거일 뿐 내용이 올바르다는 증거는 아니다. 올바름은
Local reset, 자동 테스트, Development smoke와 사용자 검증이 담당한다.

Production 적용 전에는 read-only schema audit, backup/PITR, 대상 project 식별자, 영향 범위,
중단 조건과 승인자를 확인한다. 일반적으로 schema migration을 먼저 적용하고 이에 의존하는 server
function을 배포하며, 완료 후 read-only smoke와 evidence를 남긴다. 장애가 발생하면 이미 적용된
migration 파일을 수정하거나 DB를 무리하게 과거로 되돌리기보다 새 migration으로 forward fix하는
편이 이력과 복구 가능성을 지키기 쉽다.

마지막으로 additive migration과 호환성을 구분한다. enum 또는 CHECK 범위를 넓히는 변경처럼 기존
클라이언트가 계속 동작하는 변경은 단계적 배포가 쉽다. 반면 기존 credential row나 column을
삭제하는 변경은 migration 문법이 단순해도 구버전 앱을 즉시 깨뜨릴 수 있다. 최소 지원 버전,
구버전 종료 정책, data backfill, rollback·복구 조건을 migration 설계와 함께 결정해야 한다.

## 디자인 시스템과 AI 협업

### 예쁜 화면보다 먼저 판단 체계를 만든 이유: Design Principle에서 Component Guide까지

**참고사항**

디자인 고도화를 색상, 서체와 둥근 모서리를 바꾸는 작업으로 시작하면 개별 화면은 그럴듯해져도
제품 전체에는 설명하기 어려운 예외가 쌓이기 쉽다. 같은 역할의 버튼이 화면마다 다르게 강조되고,
선택 상태와 keyboard focus가 비슷하게 보이며, 어떤 영역은 이유 없이 배경색이 채워지는 식이다.
사람과 AI가 함께 UI를 반복해서 개선하는 환경에서는 취향을 전달하는 style guide만으로 부족하다.
새로운 문제를 만날 때 같은 판단을 다시 내릴 수 있는 계층적인 기준이 필요하다.

글에서는 디자인 관련 문서의 역할을 다음처럼 구분한다.

1. **Product Experience Principles**는 제품이 지향할 경험과 판단 이유를 정의한다. 사용자의 목적을
   화면의 주인공으로 삼고, 시작은 단순하게 만들며, 시스템 상태와 작업의 연속성을 보존하고, 같은
   의미를 같은 방식으로 표현하는 것처럼 style이 바뀌어도 유지될 기준이다.
2. **Operational Guidelines**는 원칙을 반복 가능한 화면 결정으로 번역한다. 완료 행동의 위치와
   위계, secondary·danger action의 분리, 예외를 허용하는 조건처럼 실제 review에서 바로 사용할 수
   있는 규칙을 다룬다.
3. **Component and Pattern Guide**는 구현 과정에서 검증된 세부 계약을 축적한다. selected, hover와
   focus-visible의 차이, disabled와 hidden의 선택 기준, inline 안내와 tooltip의 역할, progressive
   disclosure의 summary, provider 종속 control, 복구 가능한 초기화 등이 여기에 속한다.
4. **Semantic Token 및 Style Contract**는 style이 변경할 수 있는 것과 소유하면 안 되는 것을
   구분한다. 색상, typography, radius, elevation과 density는 style pack이 바꿀 수 있지만 기능,
   DOM, action priority, 상태 전이, ARIA와 keyboard 순서는 공통 계약으로 유지한다.
5. **Style Pack**은 같은 계약 안에서 하나의 완결된 시각적 성격을 제공한다. 성격이 다른 두 번째
   style을 실제 화면에 연결하면 첫 style의 공통 규칙처럼 숨어 있던 raw color, spacing과 component
   결합을 발견할 수 있다.
6. **Development Record와 Validation Gate**는 어떤 문제를 관찰했고 어떤 대안을 검토했으며 왜 현재
   기준을 선택했는지 보존한다. 원칙 초안, compatibility 기반, 첫 정식 style, 두 번째 style 같은
   단계에서 자동 검증과 사용자 확인을 거쳐야 선언이 실제 제품 계약으로 발전한다.

구체적인 사례를 통해 `일관성`과 `획일성`의 차이를 설명한다. 모든 component를 같은 모양으로 만드는
것이 아니라 같은 의미에 같은 판단 규칙을 적용하는 것이 일관성이다. 예를 들어 인접한 선택으로
활성화할 수 있는 예약 field는 존재와 의존 관계를 보여주기 위해 disabled로 남길 수 있지만, 현재
작업과 완전히 무관해 복잡성만 늘리는 field는 숨길 수 있다. 항상 필요한 짧은 정보는 inline hint,
필요할 때만 확인할 긴 설명은 tooltip, control과 상태만으로 충분히 이해되는 내용은 시각적으로
생략한다. 특정 provider에서만 유효한 옵션은 그 provider가 선택된 동안만 활성화하되 사용자의
선호값은 지우지 않는다.

작은 불일치를 고치는 과정도 기준을 발전시키는 자료가 된다. Select와 disclosure 화살표의 우측
여백을 공통 trailing inset으로 맞추고, tooltip이 container에 잘리는 문제를 field별 위치
hard-coding이 아니라 가용 공간을 측정하는 collision-aware placement로 해결할 수 있다. 반대로 native
date/time picker 내부 UI처럼 운영체제와 브라우저가 소유하는 영역은 focus 접근성을 해치지 않는지
확인한 뒤 합리적인 예외로 기록한다. 시각 통일만을 위해 복잡한 custom widget을 다시 만드는 비용도
함께 비교한다.

AI와의 역할 분담도 다룬다. 사용자는 제품 방향, 실제 사용 중 느끼는 미묘한 위계와 예외의 타당성을
판단하고, coding agent는 관련 구조를 조사해 일회성 CSS 대신 공통 규칙을 구현하며 자동 검증과 문서를
갱신한다. `발견 -> 원인 조사 -> 기준 도출 -> 제한된 적용 -> 사용자 확인 -> canonical guide 승격`의
순환을 사용하면 작은 UI feedback이 제품 전체에서 재사용할 수 있는 설계 자산으로 남는다. 디자인
시스템의 완성도를 component 개수보다 새로운 화면에서도 일관된 결정을 재현할 수 있는지로 평가하는
관점을 제안한다.

### Codex 바이브 코딩에서 품질을 유지하며 불필요한 토큰과 사용량을 줄이는 방법

**참고사항**

Coding agent를 경제적으로 오래 사용하는 방법을 단순히 prompt 글자 수를 줄이는 요령으로 설명하면
핵심을 놓치기 쉽다. 짧지만 모호한 요청은 광범위한 탐색, 반복 질문, 잘못된 구현과 재작업을 만들 수
있다. 반대로 목표, 범위와 완료 조건을 조금 길게 적은 요청은 전체 작업량을 줄일 수 있다. 핵심은
모델에게 덜 생각하라고 요구하는 것이 아니라 이미 끝난 조사와 결정을 다시 생각하지 않게 하고,
현재 변경의 위험에 필요하지 않은 문맥·도구·검증을 소비하지 않게 만드는 것이다.

먼저 큰 프로젝트를 목표와 검증 경계가 분명한 stage로 나눈다. 각 stage에는 `사용자 필요`, `목표`,
`포함 범위`, `명시적 비범위`, `보존할 동작`, `목표 산출물`, `완료 조건`, `검증 수준`을 기록한다.
이렇게 하면 agent가 선의로 인접 기능까지 확장하거나 완료 기준을 추측하는 일을 줄일 수 있다. 기능
branch의 development record에는 중요한 결정, 실패한 접근, 교정 내용과 마지막 검증 결과를 남기고,
장기간 유효한 구조만 canonical architecture 문서로 승격한다. 프로젝트 전체에서 반복할 규칙은
`AGENTS.md` 같은 지침 파일에 두되, 너무 길거나 서로 충돌하는 지침은 오히려 매 작업의 input context와
판단 비용을 키울 수 있으므로 주기적으로 감사한다.

Thread를 오래 유지하면 요구사항과 결정뿐 아니라 탐색 출력, 긴 test log, 이미 해결된 오류와 오래된
대안도 함께 쌓인다. Stage나 review milestone이 끝났을 때 새 thread로 이동하고 전체 대화를 복사하는
대신 다음 정보만 인계한다.

- 현재 repository, branch와 working-tree 상태
- 완료된 범위와 아직 남은 범위
- 사용자가 확정한 중요한 결정과 명시적 비범위
- 관련 canonical 문서와 development record 경로
- 최근 focused test, browser smoke와 full regression 결과
- known issue, 다음 목표와 첫 착수 순서

새 thread의 agent는 이 인계문을 그대로 믿기보다 Git과 문서를 짧게 확인한 뒤 작업을 계속한다. 이
방식은 대화 기억을 버리는 것이 아니라 가치 있는 문맥을 저장소의 검증 가능한 상태로 압축하는
것이다. API 기반 agent workflow에서는 공식 compaction 기능을 검토할 수 있지만, 사람이 사용하는
Codex에서도 milestone별 요약과 새 thread 분리는 같은 목적의 실용적인 운영 방법이 된다.

탐색과 도구 출력도 필요한 부분만 남긴다. 먼저 file list와 `rg` 같은 targeted search로 후보를 좁힌
뒤 관련 구간을 읽고, 전체 파일·전체 로그를 매번 대화에 싣지 않는다. 명령 결과가 길다면 실패 이름,
원인과 다음 행동을 요약하고 원문은 repository 또는 test artifact에서 다시 확인할 수 있게 한다.
Agent에게도 진행 중에는 핵심 상태만, 완료 시에는 변경점·검증 결과·수동 확인 항목만 보고하도록
요청하면 구현 품질과 무관한 output token을 줄일 수 있다.

검증은 변경 위험에 맞춰 단계적으로 넓힌다. 작은 UI나 copy 수정마다 full suite를 반복하지 않고
구현 중에는 관련 focused contract를, 하나의 reviewable slice가 완성되면 browser smoke를, 사용자
확인과 merge 준비가 끝난 뒤 full regression을 수행한다. 테스트를 생략하는 것이 아니라 같은
증거를 변화 없이 반복 생성하지 않는 것이다. 실패가 나왔을 때만 관련 범위를 다시 좁혀 원인을
찾고, 수정 후 필요한 수준까지 재검증한다.

모델과 reasoning effort도 작업 난이도에 맞춘다. 단순한 위치 탐색, 반복 변환과 읽기 중심 요약은
빠르고 경제적인 모델 또는 낮은 reasoning으로 처리할 수 있고, 모호한 다단계 구현, architecture,
보안과 어려운 회귀 분석에는 더 강한 모델과 높은 reasoning을 사용한다. 높은 reasoning이 항상 더
좋다는 전제보다 실제 작업에서 품질 차이를 평가해 기본값을 정한다. 모델 이름, 제공 범위와 사용량
정책은 바뀔 수 있으므로 글 작성 시점의 공식 OpenAI 문서를 다시 확인한다.

하위 agent의 병렬 실행도 시간과 token을 구분해 판단한다. 독립적인 code mapping, 문서 조사, 보안과
test gap 검토처럼 결과를 요약해 합칠 수 있는 작업은 병렬화의 이점이 있다. 그러나 각 agent가 별도
context와 도구를 사용하므로 단일 agent보다 총 token 사용량이 늘 수 있고, 같은 파일을 여러 agent가
동시에 편집하면 충돌과 조정 비용까지 생긴다. 작업이 실제로 독립적이고 병렬 결과가 시간 또는 품질을
충분히 개선할 때만 사용하고, 범위가 작은 순차 수정에는 한 agent를 유지한다.

마지막으로 `토큰을 일정 비율 줄이면 사용 시간이 같은 비율로 늘어난다`거나 `prompt가 짧을수록 항상
저렴하다`고 단정하지 않는다. Codex와 구독형 제품의 실제 사용 한도는 선택한 모델, reasoning 수준,
기능, tool call, 병렬 agent와 시점별 정책의 영향을 받을 수 있다. 글의 초점은 보장할 수 없는 절감률이
아니라 `재탐색`, `재작업`, `불필요한 전체 검증`, `과도한 출력`, `중복 context`를 줄이면서 비슷한
품질의 근거와 검증을 유지하는 작업 설계에 둔다.

**공식 문서 확인 대상**

- [OpenAI 모델별 prompting 및 testing guidance](https://developers.openai.com/api/docs/guides/latest-model)
- [Codex 하위 agent, 모델과 reasoning 설정](https://learn.chatgpt.com/ko-KR/docs/agent-configuration/subagents)
- [OpenAI Responses compaction](https://developers.openai.com/api/docs/guides/compaction)
