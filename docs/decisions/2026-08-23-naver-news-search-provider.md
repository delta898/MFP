# Naver News Search as the First News Provider

## Status

Accepted

## Context

Proactive Guidance needs current Korean news without requiring each desktop user to obtain an
operator credential. The Stage 4 Knowledge Gateway provides the security, cache, quota and failure
boundary but intentionally contains no upstream route.

The candidates considered for the first implementation were Naver Search News, SerpApi and
NewsAPI.org. Naver has the strongest Korean search fit, an existing operator credential path and a
Search API allowance shared with existing keyword research. SerpApi's current product integration
is a user-key Google Trends provider rather than a news provider. NewsAPI.org's free plan is not
usable in production and its production cost is not justified for the first Korean news lane.

Naver Search News requires a query and does not expose a general latest-headlines endpoint.
Pretending that a broad literal such as `뉴스` represents all current news would introduce an
unexplained editorial bias at the provider layer.

## Decision

Register `naver-news` as the first `news + server_gateway` provider for the `content_ideas`
purpose. The provider uses only the server-side Naver Developers credential pair and OpenAPI
endpoint. Keyword Research separately owns the NAVER API HUB credential pair and endpoint. The two
authentication systems never substitute for one another. The provider requests date-sorted search
results and returns only a strict News Knowledge Snapshot.

A blank topic is a successful but non-applicable query. It returns an empty Snapshot before
provider quota consumption and without an upstream call. Stage 6 Recommendation Producers own
topic selection from explicit input, Trends or validated owner relevance.

The existing SerpApi Trends integration is unchanged. User-key SerpApi evolution is a separate
future task. A true query-free news feed, if needed, will use a distinct `latest_headlines`
operation and a provider that explicitly supports it.

## Consequences

### Positive

- operator credentials never cross the gateway boundary;
- domestic news coverage can reuse the existing Naver Search application;
- provider output is current, attributable and independent of Naver's response shape;
- blank recommendations do not spend quota or fabricate a topic;
- future news search and latest-headlines semantics remain distinct.

### Negative

- news discovery cannot start without a justified topic;
- Naver does not return a publisher field, so hostname is used as the auditable publisher label;
- the conservative gateway cap must coexist with other consumers of the shared Naver Search
  daily allowance;
- real integration requires SQL, Function deployment and correctly provisioned Function Secrets.

## Rejected Alternatives

- Broad fallback query: not equivalent to latest news and creates unexplained bias.
- SerpApi as the default: its free allowance is too small and user-key support is separate work.
- NewsAPI.org: production plan cost and Korean-product fit are unsuitable for the first provider.
- Scraping a news portal homepage: unstable and outside the official provider contract.
