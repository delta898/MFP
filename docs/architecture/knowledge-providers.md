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

## Current Sample Provider
- `trends + builtin_api + SerpApi`

## Built-in Naver Trends Provider

The desktop app exposes its licensed Trend Posting source through:

- `trends + builtin_api + naver_trend_posting`
- default provider id `naver-trends`
- normalized keyword/category/date/change metadata

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

Legacy array-returning `builtin_api` providers retain their existing item DTOs and gain the
snapshot envelope at the registry boundary. New `server_gateway` responses must pass strict Trends
or News validation before reaching a consumer. Gateway failures return an empty isolated provider
result with a stable code; other providers and owner memory continue.

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

Stage 4 intentionally registers no live server provider. Naver Trends continues through its
existing licensed Oracle gateway, and real News provider selection/activation belongs to Stage 5.

## Current Gap
- `mcp_tool` transport is still structural only and needs real implementation.
- `server_gateway` has no active upstream route until the Stage 5 News provider decision.
- Personalized relevance, diversity, and recency weighting remain consumer
  policy rather than provider behavior.
