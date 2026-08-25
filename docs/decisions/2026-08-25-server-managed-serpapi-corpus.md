# Server-Managed SerpApi Observation Corpus

## Status

Accepted on 2026-08-25.

## Context

Naver News Search requires a query, while BlogGenius Serendipity also needs discovery material
outside a user's current interests and history. Calling SerpApi from each desktop request would
expose or proxy a shared developer credential, make cost grow with active users and make the UI
dependent on an external search response. Reusing short-lived gateway cache as a durable corpus
would also mix two different lifecycle and retention responsibilities.

SerpApi currently offers a small free monthly allowance. The product must obtain useful shared
coverage without treating that allowance as an invitation to perform unbounded or user-triggered
searches.

## Decision

Supabase periodically invokes a server-only SerpApi Google News collector using a Function Secret.
The collector accepts only code-owned semantic collection lanes, normalizes and deduplicates
results, and stores a bounded shared observation corpus. BlogGenius reads stored observations
through a licensed API; a desktop action never directly triggers the SerpApi upstream.

The corpus is separate from `knowledge_gateway_cache`. It stores only normalized title, bounded
snippet, canonical HTTPS URL, publisher, provider/source/lane, explicit locale/country and temporal
provenance. It does not store article bodies, raw responses, credentials or owner identity.
Eligibility is capped at 14 days and cleanup is an explicit server operation.

The server enforces a fixed limit of 200 unique upstream reservations in every trailing 31-day
window, below the published 250-search free allowance without assuming a first-of-month renewal.
Before reserving, the free Account API must also report more than 50 searches remaining. The local
ledger is atomic and provides concurrency control; either guard failing is fail-closed. Collection
and sampling are deterministic and do not invoke a generative AI model.

Stored observations remain external `observed / weak` evidence. Existing Memory events record
only later explicit user actions such as viewing, dismissing, applying, writing or publishing.
Naver News remains the query-based Korean news provider; the SerpApi corpus complements it with
query-free and cross-domain discovery.

The licensed read path reuses `knowledge-gateway` with a distinct `stored_corpus` execution type.
It keeps license and per-subject gateway rate protection but never applies upstream quota, cache or
backoff and never calls the collector. Requests contain only bounded discovery filters and recently
shown observation ids. The server returns a provider-neutral News Snapshot after deterministic
lane and publisher diversity selection.

## Consequences

### Positive

- one upstream result can serve many BlogGenius users;
- the developer key never enters desktop configuration or responses;
- UI latency and availability are independent of a live SerpApi request;
- cost is bounded independently of user count and click volume;
- Serendipity can draw from broader, non-personalized material;
- existing provider-neutral News Snapshot consumers remain reusable.

### Negative

- Supabase Cron, collector deployment, retention cleanup and quota monitoring become operational
  responsibilities;
- the corpus may be less current than a direct live request;
- shared collection lanes require quality monitoring to avoid category or publisher dominance;
- long-term display/storage conditions must be reviewed before retention or payload scope expands.

## Rejected Alternatives

- Desktop developer key: extractable and impossible to protect as a shared credential.
- User-triggered server proxy: hides the key but still makes cost scale with clicks and users.
- User-issued key: too much setup for a default discovery feature.
- Reusing gateway cache: cache identity and expiry do not model a diverse shared corpus.
- Automatically summarizing every collected item with AI: creates uncontrolled user or operator
  cost before the material has demonstrated value.
