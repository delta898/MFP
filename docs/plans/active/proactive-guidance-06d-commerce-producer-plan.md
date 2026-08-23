# Proactive Guidance 06d: Commerce Producer

## Status

- Phase: completed and user-approved on 2026-08-24
- Parent integration branch: `feature/proactive-guidance-main`
- Child branch: `feature/proactive-guidance-06d-commerce-producer`
- Version: unchanged during feature work

## Objective

신선한 Trends 관찰과 실제 commerce 맥락이 함께 존재할 때만
`commerce_opportunity` Candidate를 만든다. 검색 관심도를 구매 인기나 매출 가능성으로
과장하지 않으며, 근거가 부족하면 빈 결과를 정상 결과로 반환한다.

## Grounding Rule

후보 하나는 다음 두 조건을 모두 만족해야 한다.

1. 아직 만료되지 않은 정규화된 `trends` Knowledge item이 있다.
2. 같은 상품 또는 쇼핑 주제를 가리키는 commerce anchor가 있다.

이번 단계에서 인정하는 commerce anchor는 다음과 같다.

- 현재 요청에서 명시적으로 제공된 상품명과 shopping intent
- owner의 `shopping` domain 활동 중 `saved`, `selected`, `drafted`, `published` 단계의 상품명

일반 블로그 활동, 생성만 된 아이디어, Trends의 일반 카테고리와 단순 상품 추정
키워드는 commerce anchor로 인정하지 않는다. 현재 Trends의 `score`, `change_type`,
`change_amount`는 검색 관심 변화의 측정값일 뿐 구매량이나 판매량 근거가 아니다.

향후 provider가 판매량, 클릭, 전환이나 상품 랭킹처럼 정규화된 commerce measurement를
제공하면 별도 계약 변경을 거쳐 세 번째 anchor lane으로 추가한다. 이번 단계에서는 해당
데이터가 없으므로 추정 필드를 만들지 않는다.

## Input Contract

Producer는 다음의 이미 수집된 context만 읽는다.

- `owner_user_id`
- `knowledge`: canonical `trends` Knowledge Snapshot 목록
- `commerce_intent`
  - `intent`: `shopping_content`일 때만 명시적 commerce intent로 인정
  - `product`: 사용자가 현재 요청에서 제공한 구체적인 상품명
- `memory.owner_memory.activity.signals`
  - `domain=shopping`
  - stage는 `saved | selected | drafted | published`
  - subject와 event/artifact evidence가 모두 존재

Producer 내부에서 provider API를 호출하거나 vendor response를 파싱하지 않는다. Stage 5의
normalized Knowledge 경계를 그대로 사용한다.

## Matching Policy

commerce anchor와 Trends item은 보수적인 normalized product identity로 결합한다.

- Unicode 문자/숫자 기반 정규화 후 완전 일치
- 한쪽 identity가 다른 쪽을 포함하더라도, 짧거나 일반적인 단일 token이면 불일치
- 상품명에서 안전하게 추출한 유의미 token이 2개 이상 겹칠 때 일치
- `쇼핑`, `추천`, `인기`, `상품`, `세일`, `신제품` 같은 일반 token은 비교에서 제외
- fuzzy spelling, AI 분류, 대분류 category 일치만으로는 결합하지 않음

이 정책으로 누락 가능성을 허용하되 false positive commerce 추천을 우선 차단한다.

## Candidate Contract

- producer id: `commerce-opportunity-v1`
- kind: `commerce_opportunity`
- owner당 최대 3건
- 동일 normalized product identity는 한 건으로 dedupe
- TTL: Trends Snapshot의 유효기간을 넘지 않으며 최대 24시간
- handoff: `null`
  - Stage 8에서 recommendation id 기반 trusted capability/presentation handoff를 결정
- metadata에는 product identity, anchor lane, trend change 값처럼 비민감 설명 정보만 저장
- 가격, 판매량, 수익, 전환 가능성을 근거 없이 표현하지 않음

Evidence는 최소 두 건이다.

1. `knowledge / observed / weak`: Trends item과 provider provenance
2. `owner_activity / explicit|medium|strong`: 현재 명시 입력 또는 owner shopping activity

추천 문구는 “검색 관심 흐름과 사용자의 쇼핑 맥락이 함께 확인된 상품 콘텐츠 후보”라고
설명한다. “인기 상품”, “판매 급증”, “수익 기회”처럼 현재 근거로 입증할 수 없는 표현은
사용하지 않는다.

## Planned Structure

- `commerce-grounding.js`
  - explicit/owner commerce anchor 수집
  - product identity 정규화와 보수적 매칭
- `commerce-opportunity.js`
  - 신선한 Trends item 결합
  - evidence와 canonical Candidate 생성
- 각 모듈 unit test
- producer runtime 통합 test
- structure guard와 Stage 6/상위 계획 문서 갱신

Content Producer의 query plan이나 News 조회를 재사용하지 않는다. Commerce Producer는 News를
구매 근거로 간주하지 않으며 외부 호출도 추가하지 않는다.

## Test Matrix

- explicit `shopping_content` + matching fresh Trends -> 1 candidate
- owner shopping saved/published + matching fresh Trends -> candidate
- 일반 blog activity + Trends -> 0 candidates
- generated shopping signal + Trends -> 0 candidates
- Trends only -> 0 candidates
- explicit product only, Trends mismatch/missing/expired -> 0 candidates
- generic token/category-only overlap -> 0 candidates
- duplicate anchors/items -> deterministic single candidate
- owner mismatch, malformed Snapshot and unsafe metadata -> no leakage/failure isolation
- Candidate validator and full unit regression pass

## Out of Scope

- 정책 점수, entitlement, quota, cooldown과 노출 순위 (Stage 7)
- capability/action resolution과 side effect (Stage 8)
- 추천 센터 UI와 사용자 UI test (Stage 9)
- 판매량/전환/수익 측정 provider 추가
- AI를 이용한 상품 분류 또는 유사 상품 추론
- Supabase SQL/Edge Function 변경과 배포

## Review Gate

구현, 문서화와 unit test 완료 후 대표 candidate 및 empty case를 사용자에게 공유한다.
UI 변경이 없으므로 이번 child에서는 UI test를 요청하지 않는다. 사용자 승인 전에는 commit,
parent merge, branch delete 또는 push를 하지 않는다.

## Implementation Result

- `commerce-grounding.js`가 explicit/owner anchor 수집과 보수적 product identity matching을 담당한다.
- `commerce-opportunity.js`가 strict Trends Snapshot 검증, freshness, evidence, TTL과 canonical Candidate를 담당한다.
- matching 정책은 Candidate/evidence 생성과 분리되어 실제 결과의 누락률을 확인한 뒤 독립적으로 완화할 수 있다.
- malformed/expired Knowledge, owner 불일치와 근거 부족은 모두 정상적인 빈 결과로 격리된다.
- 집중 테스트 18건과 전체 unit regression 670건이 통과했다.
- UI, Supabase, provider API, capability handoff와 release version은 변경하지 않았다.
