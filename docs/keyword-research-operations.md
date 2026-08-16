# Keyword Research Operations

## One-time Setup

### 1. Install Database Objects

Supabase Dashboard에서 프로젝트를 열고 `SQL Editor -> New query`로 이동한다.
`sql/supabase_keyword_research_backend.sql` 전체를 실행한다.

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
NAVER_CLIENT_ID
NAVER_CLIENT_SECRET
```

NAVER API HUB 자격증명을 사용하는 환경에서는 마지막 두 값 대신 다음 값을
사용할 수 있다.

```text
NAVER_API_HUB_CLIENT_ID
NAVER_API_HUB_CLIENT_SECRET
```

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
KEYWORD_MAX_RELATED_CANDIDATES=8
KEYWORD_DEFAULT_RELATED_CANDIDATES=8
KEYWORD_MIN_SEARCH_VOLUME=300
KEYWORD_RATE_LIMIT_PER_MINUTE=20
KEYWORD_SEARCHAD_CACHE_TTL_SECONDS=21600
KEYWORD_BLOG_CACHE_TTL_SECONDS=3600
KEYWORD_UPSTREAM_TIMEOUT_MS=10000
KEYWORD_BLOG_CONCURRENCY=3
```

연관 후보는 입력 키워드별 8개가 아니라 모든 입력 키워드를 합쳐 총 8개다.
secret과 정책값 변경은 함수 재배포 없이 적용된다.

## Verification

1. BlogGenius에서 주제와 키워드를 입력하고 `추천`을 누른다.
2. 추천 모달에 월간 검색량, 블로그 문서 수와 경쟁강도가 표시되는지 확인한다.
3. 같은 키워드를 다시 요청하고 `keyword_research_cache.updated_at`이 불필요하게
   갱신되지 않는지 확인한다.
4. Edge Function 로그에 credential, signature, license key가 출력되지 않는지
   확인한다.

장애가 발생해도 데스크톱은 검색 지표를 건너뛰고 입력 키워드 기반 AI 제목을
계속 추천해야 한다.

## Rotation

네이버 secret을 재발급한 경우 Supabase `Edge Functions -> Secrets`에서 해당
값만 교체한다. 앱 업데이트와 함수 재배포는 필요하지 않다.
