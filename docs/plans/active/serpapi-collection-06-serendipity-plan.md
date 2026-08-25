# Server-Managed SerpApi Collection Stage 6: Serendipity Integration

## Status

- Phase: completed and user-accepted
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-06-serendipity`
- Proposed: 2026-08-25
- Design accepted: 2026-08-25
- UI accepted: 2026-08-25

## Objective

기존 `뜻밖의 발견`에 저장형 SerpApi corpus를 실제 Knowledge source로 연결한다. Naver Trends,
Naver News와 검증된 사용자 기록을 제거하거나 한 source에 종속시키지 않고, 세 장의 발견 카드가
새로고침할 때마다 다양하고 근거 있게 회전하도록 한다. 생성형 AI는 사용하지 않는다.

## Proposed Design

### 1. Preserve the three-card source shape

현재 사용자가 확인한 안정적인 카드 구성은 다음과 같다.

1. 트렌드 소재 1장
2. 뉴스 소재 1장
3. 내 기록 소재 1장

SerpApi corpus를 네 번째 고정 카드로 추가하지 않는다. 뉴스 자리 안에서 다음 두 source를
새로운 발견마다 교대한다.

- 저장된 `serpapi-corpus`: query-free/cross-domain discovery
- `naver-news`: code-owned rotating discovery domain을 이용한 query search

한 source가 비어 있거나 실패하면 다른 뉴스 source로만 fallback한다. 세 장을 채우지 못할
때는 기존과 같이 사용 가능한 다른 source 후보가 빈 자리를 채운다.

### 2. Prefer one news source before fallback

- 기존 discovery news 노출 횟수의 짝/홀을 이용해 corpus와 Naver News 우선순위를 교대한다.
- 선호 source를 먼저 조회하고 유효한 후보가 없을 때만 다른 source를 조회한다.
- corpus가 정상인 refresh에서 사용되지 않을 Naver News 검색 세 건을 미리 호출하지 않는다.
- corpus API를 사용할 수 없는 배포 전/장애 상황에서도 기존 Naver News 발견은 유지된다.

이 선택은 사용자 프로필이 아니라 로컬 recommendation lifecycle의 source 노출 이력으로만
결정한다.

### 3. Pass recently shown corpus ids

- owner-scoped recommendation history에서 `discovery_news_transport=stored_corpus`인 후보의
  Knowledge evidence item id만 추출한다. Recommendation 계층은 provider 이름에 결합하지 않는다.
- 최대 100개의 최근 observation id를 Stage 5 `exclude_ids`에 전달한다.
- 서버에 별도 행동 프로필을 쓰지 않으며, 다른 owner의 id나 raw evidence를 전달하지 않는다.
- 기존 dedupe key 제외도 계속 적용해 card identity와 corpus item 양쪽에서 즉시 반복을 막는다.

### 4. Keep source contracts separate

Content Knowledge Collector는 결과를 명시적으로 분리한다.

- `trends`: 기존 canonical Trends Snapshot
- `news_queries`: 기존 Naver News query 결과
- `corpus_snapshots`: Stage 5 stored corpus Snapshot
- `serendipity_news_source`: 이번 평가에서 우선/실제 사용한 news source 진단

Corpus item을 가짜 Naver query 결과로 포장하지 않는다. Producer가 canonical News item에서
별도 corpus candidate를 만들고 기존 News evidence contract를 재사용한다.

### 5. Candidate copy and provenance

Corpus 카드의 후보 문구는 최신성을 과장하지 않는다. Corpus eligibility가 최대 14일이므로
`최신 뉴스` 대신 `뜻밖에 만난 뉴스 소재`처럼 표현한다.

- source label/hint: `뉴스 소재`
- evidence strength: external `observed / weak`
- provider/transport/url/publisher/published time 유지
- metadata news transport: `stored_corpus`; 실제 provider provenance는 evidence에만 유지
- handoff: 기존 `소재 적용하기`와 Quick Publish subject 전달 유지

명시적인 적용·관심 없음만 기존 Memory/recommendation lifecycle event가 된다. 조회 자체를 사용자
관심사로 승격하지 않는다.

### 6. Failure isolation and cost boundary

- Corpus 실패는 stable Knowledge diagnostic만 추가하고 전체 발견 refresh를 실패시키지 않는다.
- Naver News 실패도 기존 격리를 유지한다.
- 생성형 AI나 사용자 AI key/사용량을 소비하지 않는다.
- UI 새로고침은 저장 corpus 읽기 또는 Naver News 검색을 수행할 수 있지만 SerpApi upstream
  collection을 절대 시작하지 않는다.

## Validation

- source alternation and fallback tests
- recently shown corpus id extraction/bounds/owner scope tests
- corpus candidate provenance, copy, dedupe and handoff tests
- three-card source reservation/fill tests
- no-generative-AI and no-client-collector structural tests
- targeted Recommendation/Knowledge tests and full unit regression
- user UI test: three compact cards, labels/evidence/actions, repeated `새로운 발견`, failure fallback

실제 corpus 데이터가 없는 개발 환경에서는 Naver fallback UI를 확인한다. 실제 corpus 카드와
live rotation은 Stage 7 배포 검증에서 다시 확인한다.

## Implementation Result

- News 노출 offset의 짝/홀로 `stored_corpus`와 `query_news` 우선순위를 교대한다.
- 우선 source에 유효한 item이 있을 때 다른 source는 호출하지 않으며, 비거나 실패할 때만
  반대 source로 fallback한다.
- Corpus Snapshot은 별도 `corpus_snapshots`로 전달되고 Producer는 저장형 source라는 중립적
  의미만 안다. 실제 provider id는 canonical evidence에 보존된다.
- 최근 노출 corpus observation id는 owner-scoped persisted Candidate에서 최대 100개만 전달한다.
- Candidate dedupe 제외는 전체 과거 이력이 아니라 active 상태와 policy cooldown 안의 이력에만
  적용한다. 따라서 cooldown 이후에도 유효한 owner-history 소재는 다시 순환할 수 있다.
- Corpus 후보는 최신성을 주장하지 않고 기존 News evidence와 Quick Publish handoff를 재사용한다.
- 생성형 AI와 SerpApi upstream collection 호출은 추가하지 않았다.
- Targeted Recommendation/Knowledge/structure tests: 37 passed.
- Full unit regression: 814 passed, 0 failed.

## Acceptance Criteria

- Each refresh returns up to three diverse discoveries without requiring all four material sources.
- The news slot alternates stored corpus and Naver News across refresh history.
- An unavailable corpus does not remove the existing Naver News experience.
- Recently shown corpus observations are excluded without server-side owner profiling.
- Trends and owner-history source slots remain part of the normal composition.
- No generated AI call or SerpApi upstream call is introduced by recommendation refresh.
