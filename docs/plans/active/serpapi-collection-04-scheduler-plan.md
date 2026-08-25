# Server-Managed SerpApi Collection Stage 4: Budget, Scheduling and Operations

## Status

- Phase: completed and user-accepted
- User acceptance: 2026-08-25
- Parent plan: `docs/plans/active/serpapi-collection-main-plan.md`
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-04-scheduler`
- Design accepted: 2026-08-25

## Objective

Stage 3 collector가 운영자 실수, Cron 중복, 동시 호출 또는 SerpApi account의 다른 사용 때문에
무료 한도를 넘지 않도록 server-only control plane을 추가한다. 수집은 사용자 요청과 독립적이며
생성형 AI를 호출하지 않는다.

이번 단계는 SQL, Function과 운영 절차를 구현하고 fixture/structure test로만 검증한다. 실제 SQL
적용, Secret 변경, Function 배포, Cron 활성화, Account API 및 Google News 호출은 Stage 7까지
하지 않는다.

## Accepted Cost Policy

- Local hard guard: any trailing 31 days contain at most 200 unique upstream reservations.
- SerpApi account guard: a search starts only while normalized `total_searches_left` is greater than
  the protected reserve of 50.
- Account API is checked before every search. Its call is free according to the provider contract.
- A DB-state, Account API or account-payload failure is fail-closed.
- Reservation occurs immediately before the search and is never released. A crash after reservation
  is conservatively counted because upstream billing is then ambiguous.
- Operation identity is idempotent. Replaying one Cron slot returns the existing reservation without
  consuming another unit.
- Denied, backoff and already-running calls do not consume the local budget.

This replaces the earlier calendar-month interpretation. SerpApi exposes a plan renewal date, so a
trailing 31-day local guard remains safe without assuming that the provider resets on day one.

## Execution Order

1. validate POST, internal secret, fixed request and bounded operation identity;
2. acquire one provider lease with a short expiry;
3. reject active provider backoff;
4. call and strictly normalize SerpApi Account API;
5. persist only bounded account diagnostics without account identity or credentials;
6. reject account remaining at or below 50;
7. atomically reserve one unique operation within the trailing-31-day 200 limit;
8. call Google News once and persist observations/run through Stage 3;
9. clear backoff on success or record sanitized failure/backoff state;
10. release the lease in a `finally` path.

## Backoff Policy

- configuration/authentication errors: 24 hours;
- provider rate limit: 24 hours and require a later Account API check;
- transient upstream/invalid response: exponential 1, 2, 4, 8 and at most 12 hours;
- local store/control-plane failures: fail closed, without inventing provider failure;
- no immediate automatic retry; the next scheduled slot may retry after backoff.

Only stable error codes, consecutive failure count and timestamps are persisted.

## Schedule

Supabase Cron uses UTC expressions while lane intent is documented in Asia/Seoul time.

| Korea time | UTC schedule | Lane |
| --- | --- | --- |
| 00:20 | `20 15 * * *` | `headlines_kr` |
| 06:20 | `20 21 * * *` | `headlines_global` |
| 09:20 | `20 0 * * *` | `headlines_kr` |
| 15:20 | `20 6 * * *` | `headlines_global` |
| 21:20 | `20 12 * * *` | rotating focused lane |

The focused lane rotates deterministically across `technology`, `business`, `science`,
`culture_lifestyle` and `travel_local` using the Korea calendar date. This is at most 155 scheduled
search reservations in any 31 days, leaving 45 units below the local hard limit.

Corpus cleanup runs separately once daily and consumes no SerpApi budget.

## Cron and Secret Boundary

- `pg_cron` schedules bounded SQL functions; `pg_net` performs the HTTP POST.
- Project URL and collector secret are read from Supabase Vault at invocation time.
- `SERPAPI_API_KEY` stays only in the Edge Function Secret store.
- Cron SQL stores secret names, never decrypted values.
- The Function may disable platform JWT verification only because it performs its own constant-time
  collector-secret verification before reading the body. The endpoint remains server-internal by
  contract and is never called by desktop code.
- A dynamic bounded `x-collector-operation-id` header identifies one schedule slot.

## Acceptance Criteria

- Concurrent reservations cannot exceed 200 in a trailing 31-day window.
- Duplicate operation IDs are idempotent and denied calls do not increase usage.
- Account payload normalization rejects raw/unknown/sensitive data and protects 50 searches.
- Lease, backoff and reservation failures stop before Google News fetch.
- Cron schedules exactly five collection slots per day and one cleanup slot.
- Function responses/logs contain aggregate counts and stable codes only.
- No desktop/UI code learns collector secrets, budget RPCs or upstream credentials.
- No live network request or Supabase mutation occurs during implementation validation.

## Stage 7 Deployment Runbook (Not Executed Here)

The production order is intentionally explicit because scheduling before every protection boundary
exists could spend provider quota.

1. Apply `sql/supabase_serpapi_observation_corpus.sql`.
2. Apply `sql/supabase_serpapi_collection_operations.sql`.
3. Create one strong random collector secret outside the repository.
4. Set `SERPAPI_API_KEY` and `SERPAPI_COLLECTOR_SECRET` as Edge Function Secrets using an operator
   environment file; never paste their values into a committed script.
5. Deploy `serpapi-news-collector` with its `verify_jwt = false` function configuration. Confirm an
   unauthenticated request still fails at the custom collector-secret check.
6. In Supabase Vault, create `serpapi_collection_project_url` and
   `serpapi_collection_collector_secret`. The latter must equal the Function Secret from step 4.
7. Perform one explicitly approved manual smoke invocation with a unique `kco_manual_*` operation
   ID and verify the Account diagnostic, one reservation, one run and normalized observations.
8. Apply `sql/supabase_serpapi_collection_cron.sql` last to activate five collection jobs and one
   cleanup job.
9. Verify `cron.job`, `cron.job_run_details`, Function logs and
   `read_knowledge_collection_operations('serpapi-google-news')` without displaying secrets.

Emergency stop: unschedule the five collection jobs first. Do not delete corpus or reservation rows;
they are needed to preserve the rolling budget and audit truth. Rotating the collector secret is the
second containment action if an invocation credential may have leaked.

References:

- Supabase scheduled Functions: https://supabase.com/docs/guides/functions/schedule-functions
- Supabase Vault: https://supabase.com/docs/guides/database/vault
- SerpApi Account API: https://serpapi.com/account-api

## Validation

- SerpApi-focused provider, orchestration, SQL/Cron and security tests: 43 passed.
- Full unit regression suite: 796 passed.
- `git diff --check`: passed.
- SerpApi Account/Google News network calls: 0.
- Supabase SQL application, Function deployment, Vault/Secret mutation and Cron activation: 0.
