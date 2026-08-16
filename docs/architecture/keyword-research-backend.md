# Keyword Research Backend

## Purpose

키워드 분석 backend는 BlogGenius 데스크톱 패키지에 네이버 API 자격증명을
포함하지 않고 검색량, 연관 키워드, 블로그 문서 수를 제공한다. 별도 Gateway
서버 없이 Supabase Edge Function과 Postgres를 사용한다.

## Request Flow

```text
BlogGenius Desktop
  -> keyword-research Edge Function
       1. licenseKey + HWID 검증
       2. license subject별 rate limit 소비
       3. Postgres TTL cache 조회
       4. Search Ads와 Blog Search 호출
       5. 후보 점수 계산
  <- normalized keyword analysis
  -> Desktop AI title generation
```

데스크톱은 기존 Supabase publishable 연결을 사용한다. Edge Function은
`check_license_status` RPC로 전달된 라이선스를 검증하므로 별도 사용자 로그인,
Gateway JWT 또는 `KEYWORD_ACCESS_TOKEN_SECRET`이 필요하지 않다.

## Provider Contract

```text
kind: keyword_research
transport: supabase_function
provider: BlogGenius Supabase
```

`local_api` transport는 네이버 연동 진단을 위한 개발 환경변수 방식으로만
유지한다. 사용자는 `config.json`이나 설정 UI에서 transport와 credential을
변경할 수 없다.

## Server Policy

- `KEYWORD_MAX_INPUT_COUNT`: 입력 키워드 상한, 기본 3
- `KEYWORD_MAX_RELATED_CANDIDATES`: 모든 입력 키워드에서 합친 연관 후보 상한,
  기본 8
- `KEYWORD_DEFAULT_RELATED_CANDIDATES`: 요청 기본값, 기본 8
- `KEYWORD_MIN_SEARCH_VOLUME`: 블로그 문서 수 조회 전 검색량 하한, 기본 300
- `KEYWORD_RATE_LIMIT_PER_MINUTE`: 익명화된 라이선스별 분당 추천 수, 기본 20
- 입력 3개와 연관 후보 8개라면 Blog Search는 최대 11회다.

정책값은 Edge Function 환경변수로 관리하므로 데스크톱 업데이트 없이 변경할
수 있다. 클라이언트는 연관 후보 수를 낮춰 요청할 수 있지만 서버 상한보다
높일 수 없다.

## State

`sql/supabase_keyword_research_backend.sql`이 다음 backend-only 객체를 만든다.

- `keyword_research_cache`: Search Ads 6시간, Blog Search 1시간 TTL cache
- `keyword_research_rate_limits`: 익명화된 라이선스 subject의 고정 구간 사용량
- `consume_keyword_research_rate_limit`: 원자적 사용량 증가와 허용 여부 반환

두 테이블은 RLS를 사용하며 `service_role`만 접근한다. Edge Function instance
메모리는 재사용을 전제로 하지 않는다.

## Secrets

Supabase Edge Function Secrets에만 다음 값을 저장한다.

- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`
- 또는 `NAVER_API_HUB_CLIENT_ID` / `NAVER_API_HUB_CLIENT_SECRET`

secret은 Git, 앱 설정, 함수 응답과 로그에 기록하지 않는다. secret 변경은
Edge Function 재배포 없이 적용된다.

## Failure Behavior

- 비활성 라이선스: `401`
- 라이선스별 요청 초과: `429`
- rate-limit 저장소 장애: `503` fail-closed
- 네이버 timeout 또는 upstream 장애: `502`
- 검색 지표 분석이 실패해도 데스크톱 AI 제목 추천은 입력값으로 계속한다.

## Deployment Order

1. `sql/supabase_keyword_research_backend.sql` 적용
2. Supabase에 네이버 secret 설정
3. `keyword-research`를 `--no-verify-jwt`로 배포
4. 실제 라이선스로 함수 호출과 cache/rate-limit row 확인
