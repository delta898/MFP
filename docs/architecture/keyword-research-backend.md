# Keyword Research Backend

## Purpose

키워드 분석 backend는 BlogGenius 데스크톱 패키지에 네이버 API 자격증명을
포함하지 않고 검색량, 연관 키워드, 최근 7일 신규 블로그 문서 추정치를 제공한다. 별도 Gateway
서버 없이 Supabase Edge Function과 Postgres를 사용한다.

## Request Flow

```text
BlogGenius Desktop
  -> keyword-research Edge Function
       1. licenseKey + HWID 검증
       2. license subject별 rate limit 소비
       3. Postgres TTL cache 조회
       4. Search Ads 또는 Blog Search 호출
  <- raw normalized observations
  -> Desktop keyword metrics engine
       5. 입력 키워드와 연관 후보를 구분해 측정 대상 구성
       6. 경쟁도·기회 지수 계산과 표시 순서 정리
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

데스크톱은 네이버 API credential을 보유하지 않으며 추천 판단 로직은
BlogGenius 내부에 둔다. 사용자는
`config.json`이나 설정 UI에서 transport와 credential을 변경할 수 없다.

Gateway는 두 관측 연산만 제공한다.

- `search_ad`: 입력 키워드(상한 3개)의 Search Ads 원본 행을 정규화해 반환한다.
- `weekly_documents`: BlogGenius가 고른 측정 대상(상한 11개)의 최근 7일 신규
  블로그 문서 수를 반환한다.

두 응답에는 점수, 정렬 순서 또는 대표 키워드가 포함되지 않는다.

## Server Policy

- `KEYWORD_MAX_INPUT_COUNT`: 입력 키워드 상한, 기본 3
- `KEYWORD_MAX_WEEKLY_DOCUMENT_KEYWORDS`: 한 Gateway 요청의 Blog Search 측정 상한,
  기본 11. 보안·비용 보호용 상한이며 제품 후보 정책은 BlogGenius가 정한다.
- `KEYWORD_RATE_LIMIT_PER_MINUTE`: 익명화된 라이선스별 분당 Gateway 요청 수, 기본 20
- `KEYWORD_WEEKLY_DOCUMENT_MAX_PAGES`: 키워드별 최근 문서 조회 페이지 상한, 기본 3
- 월간 검색량은 `7 / 31`로 환산해 주간 검색 수요를 추정한다. Blog Search는
  `sort=date`로 최근 7일(`postdate`)을 세며, 3페이지(300건) 안에 끝나지 않으면
  `300+` 하한치로 표시한다.
- BlogGenius의 현재 제품 정책은 입력 3개와 연관 후보 최대 8개를 측정한다.
  Gateway 요청은 Search Ads 1회와 Blog Search 1회로 분리되며, Blog Search는
  키워드별 최대 3페이지를 조회한다. 일반적으로 오래된 문서를 만나면 즉시 중단한다.

Gateway 보호 정책은 Edge Function 환경변수로 관리한다. 연관 후보 수와 표의 표시 순서는
제품 비즈니스 로직이므로 BlogGenius 코드에서 관리한다.

## Presentation Policy

BlogGenius는 키워드의 의미 적합성을 추론하거나 대표 키워드를 자동 추천하지 않는다.
입력 키워드는 입력 순서 그대로 모두 표시하고, Search Ads가 반환한 연관 후보는 중복과
입력 키워드만 제외해 최대 8개를 측정한다. 연관 후보 표는 정확히 계산 가능한 최근 7일
기회 지수 내림차순으로 표시하며, 지수를 계산할 수 없는 항목은 뒤에 둔다. 최근 문서 수가
조회 상한에 도달하면 정확한 기회 지수 대신 `추정 주간 검색 수 / 관측 하한 문서 수`로
계산한 상한을 `N 이하`로 표시한다. 이 상한값은 정확값 정렬에는 사용하지 않는다. 사용자가
최대 3개를 선택해 AI 제목 추천에 사용한다.

## State

`supabase/migrations/202608270010_keyword_research_backend.sql`이 다음 backend-only 객체를 만든다.

- `keyword_research_cache`: Search Ads 6시간, 최근 7일 Blog Search 측정 1시간 TTL cache
- `keyword_research_rate_limits`: 익명화된 라이선스 subject의 고정 구간 사용량
- `consume_keyword_research_rate_limit`: 원자적 사용량 증가와 허용 여부 반환

두 테이블은 RLS를 사용하며 `service_role`만 접근한다. Edge Function instance
메모리는 재사용을 전제로 하지 않는다.

## Secrets

Supabase Edge Function Secrets에만 다음 값을 저장한다.

- `NAVER_SEARCHAD_API_KEY`
- `NAVER_SEARCHAD_SECRET_KEY`
- `NAVER_SEARCHAD_CUSTOMER_ID`
- `NAVER_API_HUB_CLIENT_ID` / `NAVER_API_HUB_CLIENT_SECRET`

Keyword Research는 API HUB credential만 사용한다. Naver Developers의
`NAVER_CLIENT_ID` / `NAVER_CLIENT_SECRET`으로 fallback하지 않는다.

secret은 Git, 앱 설정, 함수 응답과 로그에 기록하지 않는다. secret 변경은
Edge Function 재배포 없이 적용된다.

## Failure Behavior

- 비활성 라이선스: `401`
- 라이선스별 요청 초과: `429`
- rate-limit 저장소 장애: `503` fail-closed
- 네이버 timeout 또는 upstream 장애: `502`
- 검색 지표 분석이 실패해도 데스크톱 AI 제목 추천은 입력값으로 계속한다.

## Deployment Order

1. 신규 환경은 `supabase/migrations/` 전체를 순서대로 적용
2. Supabase에 네이버 secret 설정
3. `keyword-research`를 `--no-verify-jwt`로 배포
4. 실제 라이선스로 함수 호출과 cache/rate-limit row 확인
