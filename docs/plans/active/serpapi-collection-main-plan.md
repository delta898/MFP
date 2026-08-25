# Server-Managed SerpApi Collection Main Plan

## Status

- Phase: Stage 7 Cron activated; awaiting first scheduled-run observation
- Design accepted: 2026-08-25
- Parent branch: `codex/feature/serpapi-collection-main`
- Started: 2026-08-25
- Related architecture:
  - `docs/architecture/knowledge-providers.md`
  - `docs/decisions/2026-08-23-server-managed-knowledge-gateway.md`
  - `docs/decisions/2026-08-23-naver-news-search-provider.md`

## Objective

BlogGenius 사용자의 요청마다 SerpApi를 호출하지 않는다. Supabase가 BlogGenius 개발자
credential로 Google News 재료를 정기 수집하고, 정규화·중복 제거한 bounded observation
corpus를 BlogGenius가 인증된 API로 조회하여 `뜻밖의 발견(Serendipity)`에 사용한다.

이 기능은 Naver News Search를 대체하지 않는다. Naver News는 정당한 검색 주제가 있는
한국 뉴스 검색을 담당하고, SerpApi corpus는 검색어 없는 주요 뉴스와 순환 분야에서
개인화 바깥의 발견 재료를 공급한다.

## Non-Goals

- 데스크톱이나 사용자 설정에 BlogGenius 개발자 SerpApi key를 전달하지 않는다.
- 사용자 화면 동작으로 SerpApi upstream 호출을 시작하지 않는다.
- 수집, 정규화, 선정에 생성형 AI를 자동 사용하지 않는다.
- 기사 전문, 원본 HTML, raw SerpApi response 또는 이미지를 장기 저장하지 않는다.
- 외부 observation을 사용자 선호나 owner activity로 간주하지 않는다.
- 기존 user-key SerpApi Trends provider를 이번 작업에서 마이그레이션하지 않는다.

## Target Flow

```text
Supabase Cron
    -> server-only collector Edge Function
    -> SerpApi Google News (developer key)
    -> strict normalization / deduplication
    -> bounded Supabase observation corpus

BlogGenius
    -> licensed read API
    -> diverse observations excluding recently shown IDs
    -> existing recommendation evidence / Serendipity policy
```

## Cost Boundary

The free allowance is treated as an upstream maximum, not as an operational target.

- SerpApi published free allowance: 250 successful uncached searches per month
- BlogGenius hard collection budget: 200 upstream reservations in every trailing 31-day window
- Initial planned consumption: at most 155 scheduled reservations in any 31 days
- Reserved margin: at least 45 attempts for operations, contract changes and safe retries
- The Account API must report more than 50 searches remaining before a local reservation is made.
- The local reservation ledger is the concurrency authority; Account API is the external account guard.
- A quota-state failure is fail-closed; it must never make an unmetered upstream request.
- Manual collection uses the same budget as scheduled collection.

An initial schedule may use four general/localized collections per day and one rotating focused
collection per day. Stage 4 owns the final schedule after live response quality is observed; the
schedule must not be encoded in desktop code.

## Data Boundary

The durable corpus is not `knowledge_gateway_cache`. Cache answers an identical request for a
short time; an observation corpus preserves normalized, attributable discovery material for
bounded reuse across users.

Candidate observation fields:

- stable fingerprint and canonical source URL
- provider/source identity
- title and bounded summary/snippet
- publisher
- published and observed timestamps
- locale, country and normalized collection lane
- first/last seen timestamps and observation count
- eligibility expiry, initially no longer than 14 days after observation

No owner/license/hardware identity belongs in a shared observation row. Collection runs keep
aggregate operational facts such as lane, status, new/duplicate counts and sanitized error code.

## Consumption Boundary

BlogGenius does not read corpus tables directly. A licensed server endpoint returns only a bounded,
strict Knowledge Snapshot or discovery response. Requests may include bounded recently-shown item
IDs so the server can avoid immediate repeats without persisting a server-side behavioral profile.

The current desktop recommendation lifecycle remains the source of per-owner shown/dismissed/
applied history. A returned SerpApi observation remains `observed / weak`; an explicit user action
may create a stronger owner event through the existing memory path.

## Delivery Stages

### Stage 1 — Contracts and durable decisions

- Work branch: `codex/feature/serpapi-collection-01-contracts`
- Define collection lanes, normalized observation/run contracts and error taxonomy.
- Define cost, credential, retention and provenance invariants.
- Add pure validators/fixtures without external calls or SQL deployment.
- Record the accepted long-lived architecture decision.

Status: completed and user-accepted on 2026-08-25.

### Stage 2 — Observation corpus persistence

- Work branch: `codex/feature/serpapi-collection-02-corpus-store`
- Add backend-only observation and collection-run tables.
- Add unique/deduplication keys, retention indexes, RLS and service-role-only grants.
- Add bounded upsert/read/cleanup RPCs and SQL contract tests.

Status: completed and user-accepted on 2026-08-25.

### Stage 3 — SerpApi Google News collector

- Work branch: `codex/feature/serpapi-collection-03-collector`
- Add a server-only provider adapter and developer-key secret boundary.
- Normalize Google News results without passing raw vendor payloads to storage.
- Record collection runs and safely deduplicate/upsert observations.
- Do not add scheduling or desktop consumption yet.

Status: completed and user-accepted on 2026-08-25. Targeted tests 22 and
the full 778-test unit regression suite pass without a live SerpApi call or Supabase deployment.

### Stage 4 — Budget, scheduling and operations

- Work branch: `codex/feature/serpapi-collection-04-scheduler`
- Add atomic trailing-31-day hard-budget accounting with a fixed limit of 200.
- Add Supabase Cron invocation and rotating collection-lane policy.
- Add cleanup, Account API diagnostics, backoff and sanitized operational logs.
- Document secret provisioning, SQL application and Edge Function deployment.

Status: completed and user-accepted on 2026-08-25. The local hard guard
uses a trailing 31-day window rather than assuming the provider renews on the first calendar day.
SerpApi-focused tests 43 and the full 796-test unit regression suite pass without live provider
calls, Supabase mutation, Function deployment or Cron activation.

### Stage 5 — Licensed corpus read API

- Work branch: `codex/feature/serpapi-collection-05-read-api`
- Add a licensed, bounded API that reads stored observations only.
- Support locale/lane bounds, diversity and recently-shown exclusions.
- Return strict provider-neutral knowledge/discovery DTOs.
- Add a desktop `server_gateway`/registry definition without changing UI behavior.

Status: completed and user-accepted on 2026-08-25. The route
reuses the licensed `knowledge-gateway` with a distinct stored-corpus execution type, strict
discovery filters, deterministic server-side diversity and a dormant desktop registry route.

### Stage 6 — Serendipity integration

- Work branch: `codex/feature/serpapi-collection-06-serendipity`
- Mix SerpApi corpus, Naver News, Naver Trends and validated owner history.
- Preserve source diversity and recent-item rotation.
- Keep recommendation grounding/provenance visible and preserve explicit user feedback.
- Request user UI testing before commit and parent merge.

Status: completed and user-accepted on 2026-08-25. The three-card policy preserves Trends and owner-history slots while
alternating the one news slot between stored corpus and query-based News, with
preferred-source-first fallback. Recommendation code uses provider-neutral source types while
canonical evidence retains the actual provider provenance.

### Stage 7 — Deployment verification and stabilization

- Work branch: `codex/feature/serpapi-collection-07-operations`
- Apply production SQL and deploy Functions/Cron only with explicit operator action.
- Run a bounded live smoke test and verify quota/run/corpus telemetry.
- Confirm no client-driven upstream calls and no secrets in responses/logs.
- Promote stable truth to architecture/operations docs and archive completed plans.

Status: in progress on 2026-08-25. Production foundations and Functions are deployed. One approved
manual search stored six observations against exactly one local budget reservation, and the
licensed corpus path returns all six without additional collection cost. Application verification
passed after source rotation and explicit-discovery policy stabilization. Six bounded Cron jobs are
active; first scheduled-run observation and final operations documentation remain.

## Branch and Review Routine

1. Every stage branches from `codex/feature/serpapi-collection-main`.
2. Design decisions are documented and shared before implementation expands their scope.
3. Code, docs and unit/structure tests are completed on the stage branch.
4. UI-affecting stages wait for user UI verification.
5. Commit, merge, deletion and push occur only when the user requests them.
6. The parent feature branch is merged to `dev` only after the complete feature is accepted.

## Accepted Stage 1 Decisions

- Collection lanes are fixed code-owned identifiers; scheduling frequency may be operational config.
- Corpus reads reuse the strict provider-neutral News Knowledge Snapshot contract.
- Fourteen days is the global maximum eligibility; later lane policy may shorten it.
- Collection runs persist aggregate collection facts; Account API remains separate diagnostics.
