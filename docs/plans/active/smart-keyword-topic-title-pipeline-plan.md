# Smart Keyword, Topic, and Title Pipeline

## Status

- Phase: Supabase keyword backend implementation and deployment verification
- Runtime: BlogGenius JavaScript modules
- Credential model: BlogGenius-managed remote provider

## Goal

빠른 포스팅에서 `주제 + 키워드 + 선택 제목`을 입력받아 사용자가 검토할
키워드와 제목 후보를 제안한다. 제목 또는 추천 기능을 사용하지 않으면 기존
글쓰기 흐름을 그대로 유지한다.

## Product Flow

```text
주제/키워드/선택 제목
  -> 키워드 후보 확장
  -> 입력 키워드와 연관 후보의 검색량·최근 문서수 조회
  -> 지표 비교와 사용자 키워드 선택
  -> 선택한 키워드로 제목 3개 제안
  -> 사용자 선택
  -> 미리보기 생성 또는 바로 포스팅
```

빠른 포스팅은 사용자가 후보를 보고 선택하는 `review` 방식이다. 자동 포스팅은
같은 내부 계약을 사용하되 후속 단계에서 자동 선택 정책을 추가한다.

## Provider Boundary

제품 구조는 provider 이름보다 capability와 transport를 기준으로 유지한다.

```text
kind: keyword_research
transport: supabase_function
provider: BlogGenius Supabase
```

데스크톱 앱은 주제와 키워드를 기준으로 추천 계획을 만들고, Supabase Edge Function에서
정규화된 외부 관측값을 받는다. Search Ads/API HUB 자격증명과 HMAC 서명은 Edge Function
내부에만 둔다. 입력·연관 후보 구성, 경쟁도·기회 지수 계산과 표시 순서는
BlogGenius의 비즈니스 로직이 담당한다. 의미 적합성이나 대표 키워드를 자동 판단하지 않는다.
로컬 개발도 실제 Edge Function 계약을 사용한다. 네이버 API 직접 호출 fallback은
두지 않는다.

## Quota Policy

- 입력 키워드: BlogGenius 제품 정책 기본값 최대 3개
- 연관 후보: BlogGenius 제품 정책 기본값 총 8개
- 입력 키워드는 검색량과 무관하게 모두 측정한다.
- BlogGenius는 Search Ads 관측값의 중복과 입력 키워드만 제외해 연관 후보를 구성한다.
- 연관 후보 표는 최근 7일 기회 지수 순으로 표시하되 자동 추천하지 않는다.
- Edge Function은 입력 3개 또는 측정 후보 최대 11개에 대해 외부 API 관측값만 반환한다.
- Supabase Postgres는 키워드별 TTL cache와 라이선스별 rate limit을 제공한다.
- API HUB 일 25,000회 한도와 별도로 라이선스별 요청 한도를 둔다.

## Secret Policy

- 사용자는 네이버 API 자격증명을 입력하지 않는다.
- 자격증명을 `config.json`, UI, Git, Electron/ASAR 번들에 저장하지 않는다.
- Supabase runtime config RPC로 원문 자격증명을 데스크톱에 전달하지 않는다.
- 운영 네이버 자격증명은 Supabase Edge Function Secrets에서 동적으로 관리한다.
- Supabase Edge Function은 라이선스 검증, rate limit, cache와 네이버 API 호출을 담당한다.
- 키 교체는 Supabase secret 갱신만으로 처리한다.
- 데스크톱은 기존 라이선스와 HWID를 Edge Function 요청에 직접 사용한다.
- 응답, 오류, 로그에는 credential 또는 서명 헤더를 포함하지 않는다.

## Current Implementation

- `src/keyword-research/title-generator.js`: 제목 후보 최대 3개 생성
- `src/keyword-research/keyword-metrics-engine.js`: 후보 구성, 지표 계산과 표시 순서 정리
- `src/keyword-research/quick-publish-suggestion.js`: 빠른 포스팅 review DTO
- `src/keyword-research/supabase-client.js`: 라이선스 기반 Edge Function transport
- `supabase/functions/keyword-research/`: 인증, 보호 상한, cache와 네이버 관측값 수집
- `sql/supabase_keyword_research_backend.sql`: cache와 rate limit 저장 계약
- `/api/v1/blog/quick-publish/smart-suggestions`: UI-facing API
- 데스크톱은 추천 비즈니스 로직, Supabase transport와 제목 AI 생성을 담당한다.

## Next Steps

1. keyword research SQL 계약을 Supabase에 적용한다.
2. Supabase Secrets에 네이버 자격증명을 설정하고 Edge Function을 배포한다.
3. 실제 라이선스로 네이버 분석까지 end-to-end 확인한다.
4. 운영 호출량과 cache hit 비율을 관찰해 3/8 정책값을 조정한다.
5. 추천 모달 UI를 키워드와 제목 선택 중심으로 정리한다.

## Non-goals

- 사용자에게 Search Ads/API HUB 설정을 요구하지 않는다.
- 검색량만으로 글감의 가치를 결정하지 않는다.
- 검색 순위 또는 네이버 피드 노출을 보장하지 않는다.
- 운영 비밀키를 난독화해 데스크톱 앱에 포함하지 않는다.
