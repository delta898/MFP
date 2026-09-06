# Proactive Guidance Stage 4: External Knowledge Gateway

## Status

- Phase: completed and user-accepted with follow-up quality backlog
- Design accepted: 2026-08-23
- Parent plan: `docs/plans/archive/proactive-guidance-main-plan.md`
- Parent branch: `feature/proactive-guidance-main`
- Work branch: `feature/proactive-guidance-04-external-knowledge-gateway`
- Started: 2026-08-23

## Objective

외부 Trends/News knowledge를 BlogGenius가 관리하는 server credential로 조회하고,
데스크톱에는 vendor credential이나 raw provider response를 전달하지 않는 공통 gateway
기반을 만든다. 라이선스 검증, cache, rate limit, provider quota, backoff와 stale fallback을
provider 호출보다 앞선 공통 정책으로 두고, 데스크톱 consumer는 정규화된 Knowledge
Snapshot만 사용한다.

Stage 4는 실제 유료 News provider를 선택하거나 활성화하지 않는다. Naver Search,
SerpApi 등의 품질·비용·약관 비교와 실제 News adapter는 Stage 5에서 수행한다.

## Existing Boundaries

### Safe server-managed precedents

- `keyword-research` Supabase Edge Function은 license key/HWID를 검증하고 Naver 개발자
  credential을 Function Secret에서만 사용한다.
- Naver Trends는 Supabase가 발급한 짧은 read token으로 Oracle `trends-api`를 호출한다.
- 두 경로 모두 desktop package에 operator credential을 포함하지 않는다.

### Current gap

- `trends + builtin_api + serpapi`는 desktop provider config의 `api_key`를 직접 읽는다.
- Knowledge Registry 결과는 사실상 snapshot envelope지만 version, freshness, expiry와
  item validation 계약이 없다.
- provider별 cache/rate/quota/backoff가 공통 경계가 아니라 개별 구현 책임이다.
- loose metadata가 raw vendor response나 과도한 payload를 consumer까지 운반할 수 있다.

## Target Flow

```text
Desktop Knowledge Registry
        ↓ server_gateway transport
Supabase knowledge-gateway Edge Function
        ↓
request validation + license/HWID validation
        ↓
subject rate limit → fresh cache
        ↓ cache miss
provider quota/backoff → server provider adapter
        ↓
strict Knowledge Snapshot validation → cache
        ↓
Desktop consumer / Recommendation evidence
```

Provider failure with an eligible stale snapshot returns bounded stale knowledge. Without stale
data it returns a stable error code. The desktop registry isolates that failure and continues with
other providers and owner memory.

## Transport Decision

Add `server_gateway` as a distinct Knowledge transport.

- `builtin_api`: desktop directly invokes a code-owned provider API adapter.
- `server_gateway`: desktop invokes the fixed BlogGenius Supabase function; server chooses the
  upstream provider and owns credentials/protection policy.
- `mcp_tool`: future external tool host.
- `internal_query`: local/internal data query.

`server_gateway` config may select only a code-owned operation/route. It cannot set function name,
base URL, header, credential, arbitrary provider URL or response parser.

## Request Contract

The desktop sends semantic intent rather than a vendor selection:

```js
{
  schema_version: 1,
  kind: 'trends' | 'news',
  purpose: 'content_ideas',
  query: {
    topic: '',
    locale: 'ko-KR',
    country: 'KR',
    limit: 10
  },
  licenseKey: 'resolved only at invocation',
  hwid: 'resolved only at invocation'
}
```

- `topic` is optional, whitespace-normalized and bounded.
- locale/country values are allowlisted/bounded literals, not provider params.
- limit is capped by desktop and server.
- no owner profile, action history, prompt, capability params or vendor name is sent.
- `licenseKey` and `hwid` are authentication context only and are not logged, cached or included
  in snapshot identity.

## Knowledge Snapshot Contract

The registry boundary returns an additive-compatible envelope:

```js
{
  schema_version: 1,
  snapshot_id: 'ks_<stable hash>',
  kind: 'trends' | 'news',
  provider_id: 'server-managed logical provider id',
  transport: 'server_gateway',
  freshness: 'fresh' | 'stale',
  observed_at: 'ISO-8601',
  expires_at: 'ISO-8601',
  items: []
}
```

Existing `{ provider_id, kind, transport, items }` consumers continue to work. Legacy array-returning
providers are normalized at the registry boundary. New gateway responses must pass strict snapshot
validation before they reach consumers.

### Common item fields

- stable bounded `id`
- `title`, `summary`
- `observed_at`
- optional HTTPS `url`
- optional `source` / `publisher`

### Trends fields

- `keyword`
- bounded `categories`
- `change_type`, optional `change_amount`
- optional normalized score

### News fields

- canonical HTTPS article URL
- publisher and published time
- bounded headline/summary

Arbitrary raw metadata, HTML bodies, request dumps, headers, credentials, full provider payloads
and unbounded arrays are rejected. External Knowledge becomes Recommendation evidence only as
`observed / weak` with provider and transport provenance.

## Server Protection Policy

Backend-only Postgres state:

- `knowledge_gateway_cache`
  - hashed normalized query key
  - validated snapshot payload
  - `expires_at`, `stale_until`
- `knowledge_gateway_rate_limits`
  - hashed license subject and bounded fixed window
- `knowledge_gateway_provider_usage`
  - provider operation quota windows; consumed only on an upstream attempt
- `knowledge_gateway_provider_state`
  - consecutive failures and `backoff_until`

All tables use RLS and service-role-only access. Atomic RPCs consume license/provider windows.
Edge instance memory is not treated as durable coordination state.

Processing order:

1. validate request shape and bounds;
2. verify license/HWID with `check_license_status`;
3. consume subject rate-limit window;
4. return fresh cache when present;
5. reject/open stale when provider is in backoff;
6. atomically consume provider quota;
7. invoke one code-owned provider adapter with timeout;
8. validate the complete snapshot before caching;
9. reset provider failure state and return fresh data;
10. on safe upstream failure, record backoff and return eligible stale data if available.

Cache write failure is fail-open after a valid upstream result. Rate-limit and provider quota state
failure is fail-closed because continuing would remove the cost-protection boundary.

## Failure Contract

Stable server error codes include:

- `INVALID_REQUEST`
- `LICENSE_NOT_ACTIVE`
- `LICENSE_UNAVAILABLE`
- `RATE_LIMITED`
- `RATE_LIMIT_UNAVAILABLE`
- `PROVIDER_QUOTA_EXHAUSTED`
- `PROVIDER_BACKOFF`
- `UPSTREAM_FAILED`
- `INVALID_UPSTREAM_RESPONSE`
- `NOT_CONFIGURED`

The desktop maps these to safe operational categories. Raw upstream messages, response bodies,
stack traces, provider keys and license identity never cross the boundary or enter logs.

## Stage 4 Compatibility

- Existing Naver Trends → Oracle `trends-api` remains active and unchanged.
- Existing configured SerpApi desktop provider remains readable in Stage 4; Stage 5 removes or
  migrates its direct credential route when the real provider decision is made.
- No `server_gateway` provider is enabled by default until a Stage 5 provider is deployed and
  operationally verified.
- No UI setting for developer credentials or provider choice is added.
- Content ideas, suggestions and keyword discovery keep their current response contracts.

## Proposed Code Boundary

```text
src/knowledge/contracts/snapshot.js
src/knowledge/server-gateway-client.js
src/knowledge/transports/server-gateway.js
src/knowledge/registry.js

supabase/functions/knowledge-gateway/index.ts
supabase/functions/_shared/knowledge-gateway-*.ts
supabase/migrations/202608270013_knowledge_gateway.sql
```

Pure desktop contract/policy helpers receive clocks and HTTP/function clients through dependency
injection. The Edge function keeps provider adapters in a server-only registry; remote request data
cannot construct executable routes.

## Implementation Order

1. Add strict snapshot normalization/validation with trends/news fixtures.
2. Make Knowledge Registry materialize compatible snapshots and isolate sanitized failures.
3. Add fixed Supabase `server_gateway` client/transport with authenticated server context.
4. Add backend tables/RPCs for cache, rate, quota and provider backoff.
5. Add Edge Function request/auth/protection orchestration and an empty code-owned provider registry.
6. Add structure/security tests and update canonical Knowledge architecture docs.
7. Run focused tests, full unit suite and browser regression.
8. Ask the user for existing content-idea/keyword-discovery UI regression testing.

## Accepted Decisions

1. Use the Supabase Edge Function topology rather than adding another Oracle service.
2. Add a distinct `server_gateway` transport.
3. Let the server choose vendors; desktop sends only semantic kind/purpose/query.
4. Introduce a versioned, bounded Knowledge Snapshot contract.
5. Use kind-specific item fields instead of an arbitrary metadata bag.
6. Persist cache/rate/quota/backoff protection in backend-only Postgres state.
7. Return stale data only within an explicit stale window and isolate provider failure.
8. Keep existing Naver Trends and direct SerpApi paths unchanged during Stage 4.
9. Do not add or call a real News provider until Stage 5.
10. Preserve current UI and consumer response compatibility.

The user accepted all ten decisions on 2026-08-23.

## Regression Finding: Recommendation Grounding

The first user regression test exposed a pre-existing recommendation correctness defect rather than
a gateway transport failure. Three `profile_seed` results were labeled `내 글쓰기 기반` although
their actual evidence was a saved Naver Trend, a recommendation-derived draft, and an ambiguous
movie keyword. The same run also showed that generated artifacts could crowd explicit negative
feedback out of the retrieval window.

The corrective design is recorded in
`docs/decisions/2026-08-23-recommendation-grounding-and-provenance.md`. Stage 4 is not considered
user-validated until the corrected evidence labels, grounded reasons, negative-feedback suppression
and ambiguous-keyword context pass another UI regression test. Existing memory data is retained.

The user accepted the corrected UI on 2026-08-23 as sufficient to complete Stage 4 while noting
that recommendation quality is not yet fully satisfactory. Remaining semantic quality, fallback
copy, source diversity and evidence-detail improvements are retained in `docs/backlog.md` rather
than expanding the gateway stage.

## Completion Gate

- [x] detailed design accepted and documented
- [x] snapshot contract and registry compatibility tests
- [x] desktop gateway transport/client tests
- [x] SQL protection contract and Edge Function implementation
- [x] security/structure tests
- [x] initial full unit suite (607/607) and browser regression (39 fixture requests)
- [x] recommendation grounding/provenance regression correction
- [x] corrected full unit suite (613/613) and browser regression (39 fixture requests)
- [x] user content-idea/keyword-discovery regression test
- [x] result sharing and commit/merge approval
