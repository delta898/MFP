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
- `mcp_tool`
- `internal_query`

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

## Current Gap
- `mcp_tool` transport is still structural only and needs real implementation.
- Personalized relevance, diversity, and recency weighting remain consumer
  policy rather than provider behavior.
