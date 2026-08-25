# Knowledge Providers

## Model
Knowledge providers are defined by three independent axes:
- `kind`
  - What knowledge is returned (`trends`, `weather`, `news`, ...)
- `transport`
  - How it is fetched (`builtin_api`, `mcp_tool`, `internal_query`)
- `config`
  - Instance-specific connection and routing data

## Current Structure
Configuration is expected under `knowledge.providers` and `knowledge.routing`.

A provider instance contains:
- `id`
- `kind`
- `transport`
- `enabled`
- `label`
- `config`

## Current Transport Contracts
- `builtin_api`
- `server_gateway`
- `mcp_tool`
- `internal_query`

`builtin_api` runs a code-owned provider adapter from the desktop process. `server_gateway`
invokes only the fixed BlogGenius Supabase `knowledge-gateway` function. Its definition may express
a semantic kind/purpose but cannot configure a function name, URL, credential, header or response
parser. The server selects the actual upstream provider and owns shared-account protection.

## Current Providers

- `trends + builtin_api + SerpApi` (optional user-key provider, disabled by default)
- `trends + builtin_api + naver_trend_posting`
- `news + server_gateway + naver-news`
- `news + server_gateway + serpapi-corpus`

## Built-in Naver Trends Provider

The desktop app exposes its licensed Trend Posting source through:

- `trends + builtin_api + naver_trend_posting`
- default provider id `naver-trends`
- strict canonical Trends Snapshot with normalized keyword/category/date/change fields

The provider reuses the existing access-token cache and remote client. It is a
knowledge read, not an owner-memory write. Returned items are labelled
`observed / weak`; only later user actions may become owner activity evidence.
An explicit provider definition with the default id can override or disable the
built-in default.

## Consumer Rule
Suggestion and content idea engines should consume normalized provider results and must not depend on vendor-specific response shapes.

## Knowledge Snapshot Boundary

The registry exposes versioned envelopes with:

- stable `snapshot_id`, `kind`, logical `provider_id` and `transport`;
- `fresh | stale` freshness with explicit observation and expiry times;
- at most 50 bounded kind-specific items;
- source/publisher provenance without credentials or raw provider responses.

The built-in Naver Trends provider and every `server_gateway` response pass strict Trends or News
Snapshot validation before reaching a consumer. Legacy array-returning providers, including the
currently separate user-key SerpApi path, retain their item DTO during transition and gain a
snapshot envelope at the registry boundary. New Recommendation Producers reject those legacy item
DTOs rather than parsing vendor fields; the existing content-idea lane keeps a bounded compatibility
reader. Gateway failures return an empty isolated provider result with a stable code; other providers
and owner memory continue.

External Knowledge is always `observed / weak`. Fetching, caching or displaying a snapshot does
not create owner activity or preference evidence.

## Server-Managed Gateway

The Supabase Edge Function validates request bounds and the existing license/HWID context, then
applies subject rate limiting, fresh cache, provider backoff and provider quota before an upstream
attempt. Valid results are cached in backend-only Postgres tables. An upstream failure may return
an explicitly bounded stale snapshot, otherwise it returns only a stable error code.

Provider credentials remain Function Secrets. Cache keys exclude license and hardware identity.
Postgres protection tables use RLS and are accessible only to `service_role`; Edge instance memory
is not coordination state.

The first live server route is `news + content_ideas -> naver-news`. It uses only Naver Developers
Function Secrets and the OpenAPI endpoint. Keyword Research separately uses NAVER API HUB Secrets;
the two authentication systems do not fall back to each other. The route returns date-sorted Naver
Search News results with a 15-minute cache and bounded stale fallback. A blank topic
short-circuits to an empty validated Snapshot before provider quota because Naver News Search does
not provide a query-free latest-headlines operation.

The desktop registers `naver-news` on the explicit `recommendation_content_news` route. The Stage 6
content collector selects at most one justified query from each of explicit input, validated owner
activity and canonical Trends, with a maximum of three News calls per evaluation. The existing
`content_ideas` route remains Trends-only, so current interactive recommendations do not silently
start spending News quota.

The server-managed `serpapi-corpus` route is different from an upstream gateway route. It uses
`purpose=serendipity` and reads only normalized, unexpired observations through a service-role RPC
after the same license and subject-rate checks. It bypasses upstream cache, provider quota and
provider backoff because a desktop read cannot initiate collection. The request accepts only
allowlisted lane/locale/country filters, at most 100 recently shown observation ids and a bounded
limit. The server performs deterministic lane/publisher diversity before returning the same strict
News Snapshot contract. The desktop definition is registered on
`recommendation_serendipity_corpus`; Recommendation and UI integration remain a separate stage.

## Current Gap
- `mcp_tool` transport is still structural only and needs real implementation.
- Personalized relevance, diversity, and recency weighting remain consumer
  policy rather than provider behavior.
