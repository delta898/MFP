# Server-Managed SerpApi Collection Stage 2: Corpus Store

## Status

- Phase: completed and user-accepted
- Parent plan: `docs/plans/active/serpapi-collection-main-plan.md`
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-02-corpus-store`
- Started: 2026-08-25
- User acceptance: 2026-08-25

## Objective

정규화된 외부 observation과 수집 실행 결과를 Supabase Postgres에 안전하게 보관하는
backend-only corpus를 만든다. 이 저장소는 gateway response cache가 아니며, 사용자별
profile이나 recommendation 결과를 저장하지 않는다.

이번 단계는 SQL schema/RPC와 계약 테스트만 구현한다. SerpApi network adapter, Function,
Cron, production SQL 적용과 BlogGenius 조회 연결은 후속 단계에 속한다.

## Schema Decision

### `knowledge_observations`

- provider-scoped stable observation identity
- canonical HTTPS URL and normalized News fields
- code-owned lane plus explicit locale/country provenance
- first/last observation times and rediscovery count
- active eligibility expiry bounded to 14 days
- no JSON payload, raw response, article body, user or license identity

The primary key is `(provider_id, observation_id)`. A provider-scoped canonical URL unique key
provides a second deduplication guard. Rediscovery refreshes bounded metadata and temporal fields
without replacing the stable identity or first observation time.

### `knowledge_collection_runs`

- one sanitized terminal record per collector invocation
- scheduled/manual trigger and succeeded/failed/skipped status
- aggregate fetched/accepted/inserted/refreshed/rejected counts
- bounded uppercase error code only
- no exception text, request dump, credential or owner identity

## RPC Boundary

All tables enable RLS, revoke `public`, `anon` and `authenticated`, and grant access only to
`service_role`. Security-definer RPCs also revoke public/client execution.

### `upsert_knowledge_observations`

- accepts one provider and a JSON array of at most 50 already-normalized observations;
- rejects unknown keys, duplicate IDs/URLs, mismatched providers and invalid bounds;
- atomically inserts new observations and refreshes existing observations;
- returns only inserted/refreshed aggregate counts.

### `record_knowledge_collection_run`

- accepts one strict terminal run object;
- rejects inconsistent counts and unsanitized errors;
- inserts one immutable run record.

### `read_knowledge_observations`

- service-role-only bounded read primitive for the later licensed API;
- filters provider, kind, lane, locale, country and expiry;
- accepts at most 100 recently-shown observation IDs to exclude;
- returns at most 50 normalized rows in deterministic recency order.

Stage 5 owns license validation, diversity sampling and public DTO/Snapshot construction. This RPC
does not create a public database read path.

### `cleanup_knowledge_observation_corpus`

- deletes observations only after expiry plus a bounded grace interval;
- deletes terminal run records after a bounded operational retention interval;
- returns aggregate deletion counts for Cron diagnostics.

## Locale Provenance Correction

Stage 1's initial observation example recorded a semantic lane but omitted explicit locale/country.
Stage 2 adds allowlisted `locale` and `country` fields before persistence exists. Consumers must not
infer actual upstream localization from a lane label such as `headlines_global`.

## Acceptance Criteria

- SQL is idempotent and transaction bounded.
- Observation/run tables have constraints, retention indexes, RLS and service-role-only grants.
- RPCs are security-definer, bounded and unavailable to client roles.
- Unknown/raw/sensitive fields cannot be silently accepted by batch upsert.
- Existing Knowledge gateway/cache SQL remains unchanged.
- Structure and contract tests pass without a live database or Supabase deployment.

## Implementation Notes

- SQL schema and RPCs: `sql/supabase_serpapi_observation_corpus.sql`
- Structure tests: `scripts/serpapi-corpus-store-structure.test.js`
- Observation contract now records explicit allowlisted `locale` and `country` provenance.
- Validation: 16 focused contract/store/Snapshot tests and all 766 unit tests passed on 2026-08-25.
- The SQL has not been applied to a local or production Supabase database in this stage.
