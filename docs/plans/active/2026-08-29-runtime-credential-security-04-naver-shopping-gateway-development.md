# Runtime Credential Security Stage 4 Development Record

## Branch

- Branch: `feature/runtime-credential-security-04-naver-shopping-gateway`
- Started: `2026-08-29`
- Base/parent: `feature/runtime-credential-security-main`
- Status: implementation complete; Local contracts passed, Development deploy/smoke deferred to parent integration

## User Need and Goal

SmartStore·브랜드커넥트 URL에서 상품 정보를 충분히 추출하지 못했을 때 사용하는 Naver Shopping
Search fallback을 Desktop 직접 API 호출에서 서버 capability gateway로 이전한다. 잘못된 검색 첫
결과를 상품으로 채택하지 않고, 요청한 상품임을 확인할 수 있을 때만 보조 정보를 사용한다.

### Scope

- 기존 URL, HTML과 browser 추출은 Desktop에 유지
- 추출 결과가 부족하고 channel product number가 있을 때만 server gateway 호출
- Naver Developers Shopping Search credential을 Edge Function Secret 안에서만 사용
- product ID 또는 상품 URL 근거가 일치하는 결과만 반환
- 최소 상품명, 링크, 이미지, 판매처, 분류와 가격 정보만 정규화하여 반환
- provider 실패·불일치·빈 결과 시 기존 수동 상품명 fallback과 오류 흐름 보존

### Non-goals

- 쇼핑 URL scraping과 browser automation의 서버 이전
- Naver 쇼핑 상품 전체 검색 UI 제공
- 유사 상품 추천 또는 검색 첫 결과 대체
- Runtime Config의 Naver credential loader와 row 제거
- Production 배포나 credential 회전

## Proposed Design

```text
BlogGenius Desktop
  -> URL / HTML / browser extraction
  -> only when product data is insufficient
  -> shopping-product-gateway adapter
  -> knowledge-gateway
       kind=shopping_product
       purpose=product_recovery
  -> Naver Developers Shopping Search provider
```

요청은 `product_id`, 선택적인 사용자 입력 `product_name`, locale과 country만 허용한다. 서버는
product ID 또는 반환 URL에 포함된 동일한 product number로 exact match를 확인한다. `product_name`은
검색어를 보완할 수 있지만 일치 판정을 완화하지 않는다. 일치 결과가 없으면 빈 Snapshot을 반환하며
Desktop은 Naver API를 직접 재호출하지 않는다.

## Decisions and Tradeoffs

- 기존 `knowledge-gateway`의 license, rate limit, cache, quota와 backoff 경계를 재사용한다.
- 상품명만 비슷한 결과는 variant·판매처가 다른 상품일 수 있으므로 exact identity 근거로 인정하지
  않는다. 누락된 정보보다 잘못된 상품 정보가 더 위험하다는 판단이다.
- public 응답은 글 작성에 필요한 최소 정보만 포함하고 provider 원문과 credential은 반환하지 않는다.
- 이번 단계에서는 외부 참고와 Shopping의 마지막 Desktop 소비자가 모두 제거되더라도 구버전 지원과
  후속 Runtime Config hardening이 남아 있으므로 DB credential row를 삭제하지 않는다.

## Implementation Progress

- 현재 Desktop의 직접 `openapi.naver.com/v1/search/shop.json` 호출과 두 fallback 호출 지점을 확인했다.
- 기존 구현이 exact match를 찾지 못하면 검색 첫 결과를 사용하는 위험한 동작을 확인했다.
- Knowledge Gateway에 `shopping_product:product_recovery` route와 strict Snapshot field 계약을 추가했다.
- Naver Shopping Search provider가 product ID 또는 URL identity가 일치하는 결과만 선택하게 했다.
- 사용자 상품명은 두 번째 검색어로만 사용하고 identity 판정에는 사용하지 않게 했다.
- Desktop adapter를 추가하고 직접 credential/API 호출 및 중복 preview fallback을 제거했다.
- ordered migration, Supabase inventory와 release artifact 검증을 현행화했다.

## Result

- Desktop 쇼핑 fallback은 Naver Developers credential과 endpoint를 더 이상 알지 않는다.
- URL·HTML·browser 추출은 기존처럼 먼저 수행하며 정보가 부족할 때만 Gateway를 호출한다.
- exact match가 없으면 빈 결과를 사용하고, 기존처럼 검색 첫 결과로 다른 상품을 대체하지 않는다.
- Gateway 장애는 `null` fallback으로 축소되어 사용자 상품명 보완 또는 기존 명시적 실패 흐름이 계속된다.
- Runtime Config의 Naver credential loader와 DB row는 구버전 및 Stage 5 정리를 위해 유지한다.

## Verification

- provider exact product ID/link match, mismatch, empty와 upstream failure tests
- gateway request/response allowlist와 민감 정보 비포함 tests
- Desktop adapter failure 및 직접 provider fallback 부재 tests
- 쇼핑 preview와 실제 생성의 기존 fallback 회귀 tests
- Local migration/function bundle 및 전체 unit regression

검증 결과:

- focused provider, contract, Desktop와 shopping regression: 49 tests passed
- Local Supabase reset: 22 ordered migrations와 seed 적용 완료
- Local schema baseline: passed
- Local Edge Function runtime: all function entrypoints served successfully
- full unit regression: 1,047 tests passed
- `git diff --check`: passed

Development Supabase 배포와 실제 Naver provider smoke test는 parent feature 통합 검증 시 수행한다.

## Follow-up

- Stage 5 Runtime Config hardening과 legacy credential loader 제거
- Development 실제 provider smoke와 parent feature 통합 검증
