# Server-Managed SerpApi Collection Stage 3: Google News Collector

## Status

- Phase: completed and user-accepted
- Parent plan: `docs/plans/active/serpapi-collection-main-plan.md`
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-03-collector`
- Started: 2026-08-25
- User acceptance: 2026-08-25

## Objective

Supabase Edge Function에서만 BlogGenius 개발자 SerpApi credential을 사용하여 Google News
결과를 수집하고, Stage 1 contract로 정규화한 뒤 Stage 2 corpus RPC에 저장하는 server-only
collector를 만든다.

이번 단계에서는 provider 월간 budget과 Cron schedule을 활성화하지 않는다. 실제 SerpApi
호출이나 Supabase 배포 없이 fixture와 injected dependency로 provider/orchestration을 검증한다.

## Provider Boundary

The adapter is `news + external API + serpapi-google-news` but remains server-only. It never becomes
a desktop `builtin_api` provider and never accepts arbitrary SerpApi parameters.

Code-owned lane definitions map semantic lanes to fixed upstream parameters:

- `headlines_kr`: query-free Korean headlines
- `headlines_global`: query-free English/US headlines
- `technology`: fixed Korean technology/AI/robotics discovery query
- `business`: fixed Korean business/economy/startup discovery query
- `science`: fixed Korean science/research/space discovery query
- `culture_lifestyle`: fixed Korean culture/lifestyle/design discovery query
- `travel_local`: fixed Korean travel/region/festival discovery query

The request can choose only a lane. It cannot set engine, query, token, endpoint, locale, country,
cache mode, API key or response parser. SerpApi's exact-query cache remains enabled.

## Normalization Boundary

- Read only bounded `news_results` and nested `stories` candidates.
- Prefer the structured `iso_date`; reject missing, future or older-than-14-day publication times.
- Require a credential-free HTTPS article URL, title and publisher.
- Store a bounded snippet, not an article body or raw result.
- Deduplicate by canonical URL and normalized title within one collection.
- Pass every accepted candidate through the shared observation validator.
- Never return or log the upstream URL because it contains the SerpApi API key.

## Collector Service

The orchestration service receives injected provider and store dependencies:

1. validate the allowlisted collection request;
2. invoke the provider once;
3. persist accepted observations through `upsert_knowledge_observations`;
4. build and validate one terminal collection-run record;
5. persist it through `record_knowledge_collection_run`;
6. return sanitized aggregate counts only.

Provider/store failures are converted to bounded uppercase codes. Raw error messages, URLs and
responses do not enter the run record or public Function response. A run-record persistence failure
is fail-closed because otherwise operations would lose the audit boundary.

## Edge Function Boundary

- Function name: `serpapi-news-collector`
- Required secrets:
  - `SERPAPI_API_KEY`
  - `SERPAPI_COLLECTOR_SECRET`
  - existing Supabase URL/service-role secret
- Require POST and a matching internal collector secret.
- Accept only the Stage 1 collection request body.
- Return only success flag, run ID/status and aggregate counts.

Stage 4 will define how Supabase Cron obtains and sends the collector secret, apply atomic monthly
budget protection before upstream access, and add scheduling/backoff diagnostics.

## Acceptance Criteria

- Fixture tests prove lane mapping, query-free headlines and fixed focused queries.
- Accepted items pass the canonical observation and News Snapshot contracts.
- Invalid, duplicate, old and unsafe items are counted as rejected without leaking raw content.
- Store and provider failures create sanitized terminal run records when persistence is available.
- No desktop source or UI reads `SERPAPI_API_KEY` or calls the collector Function.
- No live network request, SQL application, Function deployment or Cron activation occurs.

## Validation

- Targeted provider, service, contract, corpus and security structure tests: 22 passed.
- Full unit regression suite: 778 passed.
- SerpApi network calls: 0.
- Supabase SQL application, secret change, Function deployment and Cron activation: 0.
