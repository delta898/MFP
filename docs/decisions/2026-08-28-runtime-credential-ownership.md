# Runtime Credential Ownership

## Status

Accepted for staged implementation on 2026-08-28.

## Context

`app_runtime_configs`와 익명 호출 가능한 `get_runtime_config` RPC가 비민감 운영 설정뿐 아니라
Google OAuth Client Secret과 Naver Developers Client Secret을 Desktop에 반환할 수 있다. 테이블
RLS는 `SECURITY DEFINER` RPC가 반환하는 값을 보호하지 않는다.

Google과 Naver의 값은 이름이 비슷해도 같은 보안 모델을 갖지 않는다. Google OAuth는 설치형
Desktop 앱이 사용자 동의를 받아 직접 token을 교환·갱신한다. Naver Developers credential은 여러
사용자가 공유하는 검색 API quota를 사용한다. Google 사용자 token과 Naver browser session은 다시
provider credential이 아니라 사용자 장비의 인증 상태다.

## Decision

### Google OAuth remains device-direct

- Desktop App, loopback callback과 PKCE 흐름을 유지한다.
- Google OAuth Client ID/Secret은 Runtime Config DB에서 조회하지 않는다.
- 개발 실행에서는 ignored 환경/build input, 정식 앱에서는 generated build config로 공급한다.
- 설치형 앱 Client Secret은 배포 앱에서 추출 가능하다는 전제를 명시적으로 수용한다.
- Edge Function이 Client Secret을 Desktop에 반환하지 않는다.
- Edge Function OAuth broker도 도입하지 않는다.
- 사용자 access/refresh token은 우선 ignored JSON에 유지하고 OS Keychain 이전은 별도 feature로
  다룬다.

Client 설정 교체에는 앱 업데이트가 필요할 수 있다. 중앙 회전 편의보다 사용자 token이 서버를
통과하지 않고 Google 기능이 BlogGenius backend 장애에 종속되지 않는 것을 우선한다.

### Naver Developers credentials become server-only

- 외부 참고 블로그 검색과 쇼핑 상품 fallback의 Naver API 호출을 capability-scoped Edge Function
  경계로 옮긴다.
- 기존 Naver 뉴스 provider의 server-side credential 경계를 유지한다.
- Desktop은 검색어 또는 상품번호 같은 제한된 의미 입력만 전달하고 최소 검증 결과만 받는다.
- 범용 provider proxy, arbitrary URL, raw provider response와 credential 반환을 금지한다.
- gateway 실패 시 Desktop direct provider 호출로 fallback하지 않는다.

외부 참고 본문 수집과 쇼핑 URL/HTML/browser 분석은 Desktop에 유지한다. 즉 provider credential이
필요한 최소 호출만 server로 이동한다.

### Runtime Config becomes non-secret and allowlisted

- `app_runtime_configs`는 비민감 server/runtime 설정에 계속 사용할 수 있다.
- Desktop 공개 RPC는 code-owned allowlist key만 반환한다.
- null, empty, unknown 또는 전체 조회를 거부한다.
- Google/Naver credential 소비자가 전환된 뒤 legacy credential row와 loader를 제거한다.
- 노출 가능성이 있었던 provider credential은 승인된 Production cutover에서 회전한다.

### Search credential families remain separate

Naver SearchAd/API Hub credential은 키워드 탐색 backend의 별도 계약으로 유지한다.
Naver Developers Search credential과 이름, quota, provider adapter를 합치지 않는다.

## Consequences

### Positive

- provider shared secret과 quota가 Desktop package, DB 공개 RPC와 사용자 설정에 노출되지 않는다.
- Google 사용자 token은 장비에 머물며 Google 기능이 Edge Function 가용성에 종속되지 않는다.
- Naver credential을 앱 업데이트 없이 환경별로 회전할 수 있다.
- 외부 참고, 쇼핑, 뉴스가 기능별 입력·응답과 사용량 정책을 갖는다.
- Runtime Config의 공개 범위가 코드 계약으로 검증 가능해진다.

### Negative

- Naver 외부 참고와 쇼핑 fallback은 server gateway 가용성에 의존한다.
- Edge Function 호출, cache, rate limit과 운영 관측 책임이 늘어난다.
- Google Client 설정 변경은 앱 업데이트와 사용자 재연결을 요구할 수 있다.
- v0.3.0 Desktop의 legacy Runtime Config 소비 때문에 즉시 credential row를 제거할 수 없다.

## Rollout constraint

새 gateway와 Desktop 소비 경로를 먼저 배포·검증한다. 그 뒤 구버전 호환 정책을 승인하고 legacy
RPC 차단, credential row 삭제와 credential 회전을 수행한다. Production 변경은 feature 구현 승인에
포함되지 않는다.

## Rejected alternatives

### Return Google Client Secret from an Edge Function

Rejected because a value returned to Desktop is observable in network responses and memory. Moving the same
disclosure from a database RPC to an Edge Function does not make it secret.

### Use an Edge Function as a Google OAuth broker

Rejected for the current product because it makes token exchange and refresh depend on BlogGenius backend
availability and makes user refresh tokens cross a server boundary. Central secret rotation does not justify
that added privacy and operational responsibility for an installed application.

### Keep Naver credential in generated Desktop config

Rejected because the credential protects shared provider quota and can be rotated server-side. Unlike the
installed Google OAuth client setting, it does not need to enter the user device.

### Build one arbitrary Naver proxy

Rejected because an arbitrary endpoint/query proxy can be abused to consume provider quota and bypass product
capability controls. Blog reference, shopping lookup and news use bounded semantic contracts.
