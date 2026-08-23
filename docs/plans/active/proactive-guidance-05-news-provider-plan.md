# Proactive Guidance Stage 5: News Provider

## Status

- Phase: completed and user-approved on 2026-08-23
- Started: 2026-08-23
- Parent branch: `feature/proactive-guidance-main`
- Child branch: `feature/proactive-guidance-05-news-provider`
- Version: unchanged during feature work

## Goal

운영자가 관리하는 credential을 이용해 한국어 뉴스 검색 결과를 Knowledge Gateway에서
조회하고, vendor 응답을 엄격한 `news` Knowledge Snapshot으로 정규화한다. 이 단계는
뉴스를 추천 후보로 바꾸지 않는다. 뉴스 검색어 선정과 Recommendation Producer 연결은
Stage 6에서 수행한다.

## Confirmed Scope

- 첫 provider는 Naver Search News API를 사용한다.
- News provider는 Naver Developers의 `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`과
  `openapi.naver.com`만 사용한다. API HUB credential을 대체재로 사용하지 않는다.
- 기존 keyword-research는 `NAVER_API_HUB_CLIENT_ID`,
  `NAVER_API_HUB_CLIENT_SECRET`과 API HUB endpoint만 사용한다.
- 두 credential 체계 사이 자동 fallback은 허용하지 않는다.
- provider credential은 desktop config, 응답, 로그에 포함하지 않는다.
- Naver 검색 API의 필수 `query`에는 명시적인 topic만 전달한다.
- 빈 topic은 upstream 호출과 provider quota 소비 없이 빈 Snapshot으로 종료한다.
- 요청은 `sort=date`로 조회하고 최대 7일 이내 기사만 정규화한다.
- title/summary HTML 제거, HTTPS URL 선별, publisher 식별, published time 파싱,
  stable ID 생성과 URL/title 중복 제거를 수행한다.
- cache 15분, stale fallback 6시간, upstream timeout 10초를 적용한다.
- Naver Search 전체 일 한도를 다른 기능과 공유하므로 news gateway 자체 한도는
  보수적으로 일 5,000회로 시작한다.
- 기존 SerpApi Trends 코드와 사용자 key 방식은 이번 단계에서 변경하지 않는다.
- NewsAPI.org는 구현하지 않는다.

## Provider Decision

### Naver Search News

- 한국어 검색 품질과 국내 기사 coverage에 가장 적합하다.
- Search API 전체 한도는 일 25,000회이며 기존 운영 credential을 재사용할 수 있다.
- 검색어가 필수이고 별도 latest-headlines feed는 제공하지 않는다.
- `sort=date`는 주어진 검색어 안에서 최신순이라는 의미다.

### SerpApi

- 이번 단계에서 제외한다.
- 현재 코드는 Google Trends provider이며 뉴스 provider가 아니다.
- 추후 사용자 발급 key를 활용하는 별도 일감에서 다룬다.

### NewsAPI.org

- top-headlines와 article search를 제공하는 외부 aggregation 서비스다.
- 무료 plan은 개발/테스트 전용이고 24시간 지연 및 일 100회 제한이 있다.
- 운영 plan 비용과 한국어 중심 제품 적합성을 고려해 제외한다.

## Contract

Provider route:

```text
kind=news
purpose=content_ideas
operation=news_search
provider_id=naver-news
transport=server_gateway
```

Normalized item:

```text
id, title, summary, observed_at, url,
source, publisher, published_at
```

- `url`은 credential 없는 HTTPS URL만 허용한다.
- `publisher`는 Naver 응답에 별도 필드가 없으므로 원문 URL hostname에서 파생한다.
- 원문이 HTTP이고 Naver 기사 URL이 HTTPS라면 Naver URL을 노출 URL로 사용하되,
  publisher는 원문 hostname을 우선 사용한다.
- URL이 같거나 정규화한 제목이 같은 항목은 하나만 남긴다.
- 날짜가 없거나 파싱할 수 없거나 freshness window 밖인 항목은 버린다.

## Empty Topic Policy

Naver Search News의 `query`는 필수다. provider 계층에서 `뉴스`, `오늘`, `최신` 같은
임의 검색어를 넣으면 전체 최신 뉴스처럼 보이는 편향된 결과가 된다. 따라서 빈 topic은
정상적인 빈 Snapshot으로 처리한다.

Stage 6 Producer가 다음과 같은 명시적 근거에서 topic을 만든 뒤 이 provider를 사용한다.

- 사용자가 입력한 주제
- 현재 Trends keyword
- 검증된 사용자 관심 주제 또는 최근 글 entity

정말 검색어 없는 최신 헤드라인이 필요하면 향후 `latest_headlines` operation과 이를
공식 지원하는 provider를 별도로 추가한다.

## Failure and Cost Policy

- license와 subject rate limit은 Stage 4 gateway 정책을 그대로 사용한다.
- 정상 cache hit는 provider quota를 소비하지 않는다.
- 빈 topic은 provider quota와 upstream call을 소비하지 않는다.
- quota exhausted, backoff, timeout, invalid upstream response는 stale Snapshot을 우선한다.
- stale도 없으면 안전한 error code만 desktop에 반환한다.
- upstream body, request header와 secret은 저장하거나 기록하지 않는다.
- 안전한 provider error vocabulary로 인증, upstream rate limit, request rejection,
  invalid response와 timeout을 구분하되 응답 본문은 노출하지 않는다.

## Validation

- provider unit test
  - HTML/entity cleanup
  - published time과 7일 freshness
  - HTTPS URL 선택과 publisher hostname
  - stable IDs, URL/title dedupe, limit
  - 빈 topic 무호출
  - credential 누락과 upstream failure
- gateway structure test
  - route 등록과 server-only credential 경계
  - 빈 topic short-circuit가 quota보다 앞서는지 확인
- desktop registry test
  - `naver-news`가 `server_gateway` definition으로 등록되는지 확인
  - Stage 6 전에는 content idea 기본 routing에 자동 추가하지 않는지 확인
- full unit regression

## Deployment Boundary

로컬 구현과 테스트만으로 기존 설치의 동작은 바뀌지 않는다. 실제 provider 호출 전에는
다음 운영 작업이 필요하다.

1. `sql/supabase_knowledge_gateway.sql`을 linked Supabase project에 한 번 적용한다.
2. Naver Developers credential 쌍이 존재하고 Search API 권한이 활성화되어 있는지
   확인한다.
3. `knowledge-gateway` Edge Function을 배포한다.

운영 배포는 별도 사용자 승인 없이 수행하지 않는다.

## Local Verification Result

- Naver news provider and gateway route implemented
- desktop server-gateway definition registered without Stage 6 recommendation routing
- targeted provider/gateway/registry tests: 15 passed
- full unit regression: 623 passed, 0 failed
- `git diff --check`: clean
- linked Supabase SQL and Function deployment: complete
- live Naver Developers News search smoke test: `fresh` Snapshot, 5 normalized items
- live response confirmed provider identity, timestamps, publisher hostname and HTTPS URLs without
  exposing credential or raw upstream payload
