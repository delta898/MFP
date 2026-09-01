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
