# Server-Managed External Knowledge Gateway

## Status

Accepted

## Context

BlogGenius needs current Trends and News knowledge for proactive recommendations. Requiring every
desktop user to issue provider keys makes the feature effectively unavailable, while packaging a
shared developer key exposes the credential and common quota. Existing Naver keyword research
already keeps developer credentials in a Supabase Edge Function, and Knowledge consumers already
separate `kind`, `transport` and provider instance config.

The current direct SerpApi Knowledge provider reads an API key from desktop config. Knowledge
results also lack one strict versioned snapshot/freshness contract and common server protection
policy.

## Decision

Introduce a `server_gateway` Knowledge transport backed by a fixed BlogGenius Supabase Edge
Function. The desktop submits only a bounded semantic kind, purpose and query plus existing
license/HWID authentication context. A code-owned server registry selects upstream providers and
owns all credentials, cache, subject rate limits, provider quota and failure backoff.

The gateway returns only validated, versioned Knowledge Snapshots. Raw provider responses,
credentials and arbitrary metadata do not cross the server boundary. External knowledge remains
`observed / weak` until an explicit user action creates stronger owner evidence.

Existing Naver Trends transport remains unchanged. Actual News provider selection was deferred so
the security and response contracts did not depend on one vendor; the follow-up decision selects
Naver News Search in `2026-08-23-naver-news-search-provider.md`. The direct user-key SerpApi Trends
provider remains separate and unchanged.

## Consequences

### Positive

- users do not need to issue external news/trends API keys;
- shared developer credentials never enter desktop packages or settings;
- provider choice can change without changing Recommendation consumers;
- cache, quota and backoff policies protect shared provider accounts consistently;
- one provider failure cannot block owner-memory or other Knowledge lanes.

### Negative

- the Supabase Function and backend SQL become an operational dependency;
- server/provider changes require a Function deployment even when the desktop is unchanged;
- persistent protection state adds tables, RPCs and cleanup responsibility;
- local tests cannot prove a real provider contract until Stage 5 deployment smoke tests.

## Rejected Alternatives

- User-issued API keys: low adoption and inconsistent support burden.
- Developer keys in desktop config or runtime config: extractable and unsafe for shared quota.
- A second Oracle Node gateway: duplicates deployment, token, DNS and monitoring infrastructure
  without a current workload that requires it.
- Reusing `builtin_api`: hides materially different credential, cache and failure semantics.
- Letting the desktop select arbitrary vendors or URLs: weakens the trusted execution boundary.
