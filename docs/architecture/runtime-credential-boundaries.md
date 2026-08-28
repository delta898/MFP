# Runtime Credential Boundaries

## Purpose

이 문서는 BlogGenius의 런타임 설정과 인증 정보를 값이 아니라 소유권과 소비 경로로 분류한다.
현재 노출 경로와 승인된 목표 경계를 함께 기록하며, 구현 진행 상태는
`docs/plans/active/runtime-credential-security-main-plan.md`에서 관리한다.

## Credential classes

| Class | Examples | Owner | Desktop policy |
| --- | --- | --- | --- |
| Public connection | Supabase URL, publishable key, environment | selected runtime profile | 사용 가능 |
| Public runtime setting | environment marker, bounded TTL | database/server config | allowlist key만 조회 가능 |
| Desktop app config | Google OAuth Client ID/Secret | generated dev/build config | 앱에 포함 가능 |
| User authorization | Google tokens, Naver browser session | each user device | 해당 장비에만 저장 |
| Provider credential | Naver Developers, SearchAd, SerpApi, Brevo | environment server secret store | 원문 접근 금지 |
| Operator credential | Supabase access token, DB password | operator/CI environment | 앱 접근 금지 |

Desktop OAuth Client Secret은 이름에 `secret`이 있어도 설치형 앱에서 비밀성을 보장할 수 없다.
따라서 server secret으로 위장해 Desktop에 내려주지 않고 generated app config로 명시적으로 취급한다.
반대로 provider credential은 공용 quota와 외부 효과를 가지므로 서버 경계 밖으로 내보내지 않는다.

## Current inventory

### Google OAuth

| Item | Current source | Consumer | Target |
| --- | --- | --- | --- |
| Client ID/Secret | ignored `.env.oauth` 또는 generated build config | `src/google-oauth.js` | 현재 구조 유지 |
| access/refresh token | ignored `config/google_oauth_tokens.json` | `src/google-oauth.js` | 파일 유지, 후속 Keychain 검토 |
| Sheets access token | token refresh 결과 | `src/utils.js` 및 Sheets 기능 | Desktop 직접 Google API 호출 유지 |

Google OAuth는 loopback callback과 PKCE를 사용한다. Edge Function이 Client Secret을 반환하거나
인증 code/token refresh를 대행하는 broker는 도입하지 않는다.
Desktop은 Google Client 설정을 Runtime Config RPC에서 조회하지 않는다.

### Naver user authorization

| Item | Current source | Consumer | Target |
| --- | --- | --- | --- |
| Browser storage state | ignored `config/naver_auth.json` | Naver login/publish browser flow | 사용자 PC 유지 |
| ID/password config | ignored user config/env | initial login helpers | 사용자 PC 유지 |

이 정보는 Naver Developers Search credential과 별개다.

### Naver Developers Search

| Feature | Current consumer | Current location | Target |
| --- | --- | --- | --- |
| External blog reference | `fetchNaverBlogTopPosts` | Desktop direct API | capability gateway |
| Shopping product recovery | `resolveViaShoppingSearchApi` | Desktop direct API | capability gateway |
| Recommendation news | Naver news Knowledge provider | Edge Function | 유지 |
| Single blog search helper | `fetchNaverBlogSearchResults` | no caller found | 제거 후보 |

외부 참고 검색은 검색 결과 URL만 서버에서 얻고 본문 수집과 글 작성은 Desktop이 수행한다. 쇼핑
fallback은 Desktop 추출이 부족할 때만 서버를 호출한다. 뉴스는 기존 versioned Knowledge Snapshot
계약을 유지한다.

### Keyword research

키워드 탐색은 다음 별도 provider credential을 사용한다.

- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_API_HUB_CLIENT_ID`
- `NAVER_API_HUB_CLIENT_SECRET`

이 계약을 Naver Developers Search의 `NAVER_CLIENT_ID/SECRET`과 합치지 않는다.

### Runtime Config database

`app_runtime_configs`는 server-side non-secret 설정에 계속 사용할 수 있다. 현재
`get_runtime_config`는 `anon` 실행 가능한 `SECURITY DEFINER` 함수이며 null/empty key 요청이 전체
활성 row를 반환할 수 있다. RLS가 table 직접 접근을 막더라도 이 RPC 반환값은 보호하지 못한다.

목표 RPC는 다음 조건을 모두 만족해야 한다.

- code-owned public allowlist가 존재한다.
- 요청 key가 반드시 하나 이상 있어야 한다.
- unknown 또는 disallowed key가 하나라도 있으면 fail closed한다.
- credential처럼 보이는 key 이름을 규칙으로 추측해서 허용하지 않는다.
- 반환값, 오류와 로그에 secret 원문이 포함되지 않는다.
- server-side SQL이 직접 읽는 non-secret TTL은 Desktop 공개 RPC와 별도로 유지할 수 있다.

## Trust boundaries

```text
User device
  - config/config.json
  - Google user token JSON
  - Naver browser storage state
  - generated Google OAuth app config
  - Supabase public connection

Supabase public boundary
  - publishable-key APIs
  - allowlisted public runtime settings
  - authenticated capability requests

Supabase trusted server boundary
  - Edge Function secrets
  - provider calls
  - license/access verification
  - rate limit/cache/backoff

Operator boundary
  - project access token
  - DB password
  - migration/function/secret deployment
```

어떤 실패도 더 높은 신뢰 경계의 값을 낮은 경계로 fallback해서 해결하지 않는다.

## Failure policy

- Google app config 누락: Google 연결만 unavailable로 표시하고 연결 방법을 안내한다.
- Google token refresh 실패: `reauth_required`로 전환하고 기존 설정을 삭제하지 않는다.
- 외부 참고 gateway 실패: 자동 외부 참고만 생략하고 수동 참고와 생성은 유지한다.
- 쇼핑 gateway 실패: 다른 상품을 대체하지 않고 사용자 상품명 또는 명시적 실패를 사용한다.
- 뉴스 provider 실패: 기존 Knowledge 부분 실패 계약을 유지한다.
- Runtime Config 실패: cache된 비민감값만 사용할 수 있으며 production credential로 fallback하지 않는다.

## Rotation policy

- Google Client 설정 교체는 개발 설정과 build input 변경 및 앱 업데이트로 수행한다.
- Google Client ID 변경 시 사용자 재연결 가능성을 명시한다.
- Naver/SearchAd/SerpApi 등 provider credential은 환경 Secret에서 회전한다.
- 노출 가능성이 있던 credential은 Desktop 전환 이후 기존 row를 삭제하고 회전한다.
- credential 값은 문서, migration, seed, CI artifact, diagnostic output에 기록하지 않는다.
