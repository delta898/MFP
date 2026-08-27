# Keyword Research Operations

## One-time Setup

### 1. Install Database Objects

Supabase Dashboard에서 프로젝트를 열고 `SQL Editor -> New query`로 이동한다.
신규 환경은 `supabase/migrations/` 전체를 순서대로 적용한다. 키워드 탐색의 현재 정의는
`202608270010_keyword_research_backend.sql`과 `202608270011_keyword_research_weekly_documents.sql`에 있다.

성공 후 `Table Editor`에 다음 테이블이 보인다.

- `keyword_research_cache`
- `keyword_research_rate_limits`

SQL Editor에서 다음 함수가 존재하는지 확인한다.

- `consume_keyword_research_rate_limit`

### 2. Set Edge Function Secrets

`Edge Functions -> Secrets`에서 다음 값을 추가한다. 값은 이 문서, Git,
`config.json`, 앱 설정 또는 대화에 기록하지 않는다.

```text
NAVER_SEARCHAD_API_KEY
NAVER_SEARCHAD_SECRET_KEY
NAVER_SEARCHAD_CUSTOMER_ID
NAVER_API_HUB_CLIENT_ID
NAVER_API_HUB_CLIENT_SECRET
```

`NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`은 Naver Developers OpenAPI를 사용하는
다른 provider용이며 Keyword Research의 fallback으로 사용하지 않는다.

`KEYWORD_ACCESS_TOKEN_SECRET`은 필요하지 않다.

### 3. Deploy the Function

프로젝트 루트에서 실행한다.

```bash
supabase functions deploy keyword-research --no-verify-jwt
```

`--no-verify-jwt`를 사용해도 함수 내부의 `check_license_status`가
`licenseKey + HWID`를 검증한다. 앱의 Supabase publishable key는 secret이
아니며 네이버 자격증명은 함수 밖으로 반환되지 않는다.

## Optional Policy

기본 정책을 바꿀 때만 Edge Function Secrets에 추가한다.

```text
KEYWORD_MAX_INPUT_COUNT=3
KEYWORD_MAX_WEEKLY_DOCUMENT_KEYWORDS=11
KEYWORD_RATE_LIMIT_PER_MINUTE=20
KEYWORD_SEARCHAD_CACHE_TTL_SECONDS=21600
KEYWORD_WEEKLY_DOCUMENT_CACHE_TTL_SECONDS=3600
KEYWORD_WEEKLY_DOCUMENT_MAX_PAGES=3
KEYWORD_UPSTREAM_TIMEOUT_MS=10000
KEYWORD_BLOG_CONCURRENCY=3
```

현재 BlogGenius 제품 정책은 입력 3개와 연관 후보 총 8개를 측정한다. 입력 키워드는
검색량과 무관하게 모두 표에 표시하며, 연관 후보는 의미 적합성으로 자동 제외하지 않는다.
이는 사용자 선택을 돕기 위한 표시 정책이므로 데스크톱 코드가 관리한다. Edge 환경변수는
요청량과 외부 API 비용을 보호하는 상한만 관리하며, secret과 정책값 변경은 함수 재배포 없이 적용된다.

## Verification

1. BlogGenius에서 주제와 키워드를 입력하고 `추천`을 누른다.
2. 추천 모달에 입력 키워드 표기, 월간/주간 검색량, 최근 7일 신규 문서와 경쟁강도가 표시되는지 확인한다.
3. 같은 키워드를 다시 요청하고 `keyword_research_cache.updated_at`이 불필요하게
   갱신되지 않는지 확인한다.
4. Edge Function 로그에 credential, signature, license key가 출력되지 않는지
   확인한다.

장애가 발생해도 데스크톱은 검색 지표를 건너뛰고 입력 키워드 기반 AI 제목을
계속 추천해야 한다.

## Rotation

네이버 secret을 재발급한 경우 Supabase `Edge Functions -> Secrets`에서 해당
값만 교체한다. 앱 업데이트와 함수 재배포는 필요하지 않다.
