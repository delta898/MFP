# Server-Managed SerpApi Collection Stage 1: Contracts

## Status

- Phase: completed and user-accepted
- Design accepted: 2026-08-25
- User acceptance: 2026-08-25
- Parent plan: `docs/plans/active/serpapi-collection-main-plan.md`
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-01-contracts`
- Started: 2026-08-25

## Objective

외부 호출이나 DB 배포 전에 공용 SerpApi observation corpus의 의미와 경계를 고정한다.
후속 단계가 vendor raw response, 사용자별 upstream 호출, 무제한 축적 또는 AI 자동 호출을
다시 도입하지 못하도록 순수 contract/validator와 장기 결정 문서를 만든다.

## Proposed Decisions

### 1. Corpus item is an observation, not a recommendation

수집된 행은 외부 세계에서 관찰된 뉴스 재료다. 추천 title, score, CTA 또는 사용자
personalization을 저장하지 않는다. Recommendation Producer가 조회 시점에 기존 evidence와
정책을 사용해 recommendation을 만든다.

### 2. Collection lanes are code-owned semantic identifiers

초기 lane은 임의의 SerpApi parameter가 아니라 제한된 의미 식별자다.

- `headlines_kr`
- `headlines_global`
- `technology`
- `business`
- `science`
- `culture_lifestyle`
- `travel_local`

각 lane의 vendor query/token/locale mapping은 server-only collector registry가 소유한다.
Cron이나 DB row가 arbitrary query, URL 또는 response parser를 주입할 수 없다. 향후 운영 중
빈도 조정은 DB schedule/config로 가능하지만 executable provider mapping은 code-owned다.

### 3. Reuse Knowledge Snapshot for reads

새 discovery-feed envelope를 만들지 않고 기존 strict `news` Knowledge Snapshot을 확장 없이
재사용한다. 저장소 내부 필드는 read adapter가 canonical News item으로 변환한다. 이로써
Recommendation consumer가 SerpApi 전용 DTO를 알지 않게 한다.

수집 명령과 collection-run contract는 서버 내부 전용이며 Knowledge Snapshot과 분리한다.

### 4. Retention is bounded and operationally explicit

- active eligibility: last observed within 14 days
- read API also rejects future or expired observations
- cleanup removes expired rows after a short operational grace period
- first/last seen and observation count update on deduplicated rediscovery
- article body, HTML and raw response are never retained

Stage 4 may make a lane's eligibility shorter, but no lane may silently exceed the global maximum.

### 5. Rolling cost protection is server-authoritative

Every Google News network attempt passes an atomic provider/operation reservation ledger before
fetch. The fixed limit is 200 in every trailing 31-day window and cannot be raised by a desktop
request or Cron payload. Failed ledger access blocks the request. SerpApi Account API must also
report more than 50 searches remaining. It is an external account guard, while the database ledger
remains the concurrency authority.

### 6. Provenance survives every boundary

Every observation and read item retains provider, source, publisher, canonical URL, published time
and observed time. SerpApi observations enter Recommendation evidence as `observed / weak` and do
not become owner history until the user performs an explicit action already modeled by Memory.

### 7. No automatic AI use

Collection, normalization, deduplication, retention, diversity sampling and DTO conversion are
deterministic. AI may only be invoked later through an existing explicit user action and its normal
usage confirmation/accounting path.

## Proposed Contracts

### Collection request

```js
{
  schema_version: 1,
  lane: 'headlines_kr',
  trigger: 'scheduled' | 'manual'
}
```

The authenticated internal scheduler selects only an allowlisted lane. It cannot pass query,
engine, endpoint, API key, country, language or arbitrary vendor options.

### Normalized observation

```js
{
  schema_version: 1,
  observation_id: 'ko_<stable fingerprint>',
  kind: 'news',
  provider_id: 'serpapi-google-news',
  source: 'google-news',
  lane: 'headlines_kr',
  locale: 'ko-KR',
  country: 'KR',
  title: '...',
  summary: '...',
  url: 'https://...',
  publisher: '...',
  published_at: 'ISO-8601',
  observed_at: 'ISO-8601',
  expires_at: 'ISO-8601'
}
```

Required eligibility fields are title, canonical HTTPS URL, publisher, valid published time and
observation time. IDs derive from canonical URL, not title or vendor result position.

### Collection run result

```js
{
  schema_version: 1,
  run_id: 'kcr_<opaque id>',
  provider_id: 'serpapi-google-news',
  lane: 'headlines_kr',
  trigger: 'scheduled',
  status: 'succeeded' | 'failed' | 'skipped',
  attempted_upstream: true,
  fetched_count: 20,
  accepted_count: 14,
  inserted_count: 8,
  refreshed_count: 6,
  rejected_count: 6,
  error_code: '',
  started_at: 'ISO-8601',
  completed_at: 'ISO-8601'
}
```

Run records never contain API keys, raw response fragments, arbitrary exception messages, license
identity or user identity.

## Validation Work

Stage 1 implementation will add pure validators and fixtures for:

- allowlisted collection lanes and triggers;
- bounded normalized observations and canonical HTTPS URLs;
- timestamp ordering and 14-day maximum eligibility;
- stable sanitized collection-run status/error fields;
- rejection of raw metadata, credentials, owner identity and unbounded arrays;
- conversion fixtures compatible with the existing News Snapshot validator.

No SQL, Edge Function network call, scheduler or UI change belongs in this stage.

## Acceptance Criteria

- Main and Stage 1 plans reflect the agreed server-push/client-read model.
- Pure contracts reject vendor leakage and invalid retention/provenance.
- Existing Naver News and Knowledge Snapshot contracts remain compatible.
- Unit and structure tests pass without network or Supabase dependencies.
- The accepted long-lived decision is recorded before Stage 1 is committed.

## Implementation Notes

- Shared server contract: `supabase/functions/_shared/serpapi-collection-contract.ts`
- Unit contract tests: `scripts/serpapi-collection-contract.test.js`
- Long-lived decision: `docs/decisions/2026-08-25-server-managed-serpapi-corpus.md`
- Validation: 761 unit tests passed on 2026-08-25, including 11 focused collection/Snapshot tests.
