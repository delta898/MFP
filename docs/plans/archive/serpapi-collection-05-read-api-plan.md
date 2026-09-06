# Server-Managed SerpApi Collection Stage 5: Licensed Corpus Read API

## Status

- Phase: completed and user-accepted
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-05-read-api`
- Proposed: 2026-08-25
- Design accepted: 2026-08-25
- User acceptance: 2026-08-25

## Objective

저장된 `serpapi-corpus` observation만 읽는 라이선스 보호 API를 제공한다. 데스크톱은
Supabase table이나 RPC를 직접 읽지 않고 기존 `server_gateway` transport를 통해 strict
News Knowledge Snapshot을 받는다. 이번 단계에서는 추천 생성이나 UI 노출을 바꾸지 않는다.

## Proposed Design

### 1. Reuse the licensed Knowledge Gateway

- 새 public Function을 만들지 않고 기존 `knowledge-gateway`에 `purpose=serendipity` route를
  추가한다.
- 기존 license/hwid 검증과 license별 gateway rate limit은 그대로 적용한다.
- `content_ideas`는 현재 Naver News upstream search route를 유지한다.
- `serendipity`는 저장 corpus 전용 route이며 사용자 요청으로 SerpApi upstream을 호출할 수
  없다.

### 2. Distinguish upstream and stored-corpus execution

Provider route contract에 실행 유형을 명시한다.

- `upstream`: cache, provider quota, backoff, timeout을 거쳐 외부 API를 호출한다.
- `stored_corpus`: service-role RPC로 이미 저장된 observation만 읽는다. upstream cache,
  provider quota와 provider backoff를 적용하지 않는다.

Gateway index는 provider id를 직접 분기하지 않고 route의 실행 유형을 따른다. Corpus RPC
오류는 fail-closed하며 raw database error나 저장 row를 응답에 노출하지 않는다.

### 3. Strict discovery request

`purpose=serendipity`는 다음 query만 허용한다.

- `lanes`: allowlisted lane 배열, 최대 7개
- `locales`: `ko-KR`, `en-US` 배열, 최대 2개
- `countries`: `KR`, `US` 배열, 최대 2개
- `exclude_ids`: 최근 표시한 observation id 배열, 최대 100개
- `limit`: 1~20, 기본 12

배열 값은 중복 제거하고 길이를 제한한다. `topic`, vendor query, engine, endpoint, token,
sort 또는 임의 SQL 조건은 이 purpose에서 거절한다. 빈 locale/country/lane 배열은 corpus
전체 allowlist를 의미하며, Stage 6의 기본 provider definition은 7개 lane과 두 locale/country를
명시해 폭넓은 발견을 요청한다.

### 4. Server-side diversity selection

- 기존 `read_knowledge_observations` RPC에서 최대 50개의 유효 후보를 읽는다.
- expired/future/invalid item을 다시 방어적으로 제외한다.
- URL과 normalized title 중복을 제거한다.
- lane round-robin과 publisher cap을 우선 적용해 한 source lane 또는 언론사 쏠림을 줄인다.
- 목표 개수를 채우지 못할 때만 publisher cap을 완화한다.
- 결과 순서는 동일 후보 집합에서 결정적이어야 한다. 새로운 발견 회전은 Stage 6이 전달할
  `exclude_ids`로 만든다. 서버가 사용자 행동 프로필을 별도 저장하지 않는다.

### 5. Provider-neutral Snapshot

응답은 기존 News Knowledge Snapshot schema version 1을 그대로 사용한다.

- `provider_id`: `serpapi-corpus`
- `transport`: `server_gateway`
- item id: corpus `observation_id`
- canonical fields: title, summary, URL, source, publisher, published/observed time
- snapshot expiry: 짧은 read TTL과 포함 item의 가장 이른 eligibility expiry 중 이른 값

Vendor raw payload, lane 내부 저장 row, API key, license/hwid, database error detail은 반환하지
않는다. Lane은 서버 선정 조건으로 사용하되 vendor-specific item field로 public DTO에 추가하지
않는다.

### 6. Dormant desktop registry definition

- `news / server_gateway / serpapi-corpus` provider definition을 추가한다.
- definition의 purpose는 `serendipity`이며 기본 lane/locale/country/limit을 가진다.
- `recommendation_serendipity_corpus` registry route에 연결하되 이번 단계에서는 어떤 producer나
  UI도 이 route를 호출하지 않는다.
- Stage 6에서 기존 Naver News, Naver Trends, owner history와 혼합할 때 이 route를 사용한다.

## Error Boundary

- invalid discovery query: `INVALID_REQUEST`
- inactive license: existing `LICENSE_NOT_ACTIVE`
- corpus RPC/read failure: sanitized `CORPUS_UNAVAILABLE`
- invalid stored row or generated snapshot: `INVALID_UPSTREAM_RESPONSE`
- license gateway rate limit: existing `RATE_LIMITED`

`CORPUS_UNAVAILABLE`은 upstream provider 장애로 기록하거나 SerpApi collection backoff를
변경하지 않는다.

## Validation

- request normalization tests for both `content_ideas` and `serendipity`
- corpus adapter tests for RPC mapping, diversity, exclusions, bounds and expiry
- gateway structure tests proving corpus reads bypass upstream call/quota/cache/backoff
- desktop provider/transport/registry tests proving the route is registered but unused by UI
- targeted tests, full unit regression and `git diff --check`
- no live Supabase read, Function deployment, SerpApi call or UI test in this stage

## Acceptance Criteria

- An active license can request a bounded provider-neutral Snapshot from stored observations.
- A desktop request cannot cause SerpApi collection or arbitrary provider queries.
- Recently shown ids and strict lane/locale/country filters are honored.
- Results prefer cross-lane and cross-publisher diversity.
- Existing Naver News `content_ideas` behavior remains unchanged.
- No current recommendation producer or UI calls the new route.

## Validation Result

- Broad targeted Knowledge/SerpApi tests: 70 passed, 0 failed.
- Final focused Stage 5 tests: 23 passed, 0 failed.
- Final full unit regression: 807 passed, 0 failed.
- No live Supabase read, Function deployment, SerpApi call or UI behavior change was performed.
