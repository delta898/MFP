# Server-Managed SerpApi Collection Stage 7: Deployment Verification and Stabilization

## Status

- Phase: Cron activated; awaiting first scheduled-run observation
- Parent branch: `codex/feature/serpapi-collection-main`
- Work branch: `codex/feature/serpapi-collection-07-operations`
- Proposed: 2026-08-25
- Design accepted: 2026-08-25

## Objective

Stage 1~6에서 로컬 검증한 corpus schema, 비용 보호, collector, licensed read와 Serendipity
integration을 연결된 Supabase project에 안전한 순서로 배포하고 실제 한 번의 bounded smoke
collection으로 end-to-end 동작을 확인한다. Cron은 모든 보호 경계와 수동 검증이 통과한 뒤
마지막에 활성화한다.

Stage 7은 마지막 SerpApi collection 단계다. 성공 후 안정된 구조와 운영 절차를 canonical
문서로 승격하고 Stage 1~7 계획을 archive한다.

## Safety Gates

### 1. No implicit external mutation

- SQL 실행, Function 배포, Secret/Vault 변경, manual collection과 Cron 활성화는 각각 외부 상태를
  바꾸므로 실행 직전에 사용자에게 대상과 영향을 알린다.
- Secret 값은 채팅, command output, 로그, 문서 또는 Git에 표시하지 않는다.
- 연결된 project ref/name을 read-only preflight로 먼저 확인한다.
- live SerpApi Google News smoke는 로컬 rolling budget 1회를 영구 예약하고 provider allowance
  1회를 사용할 수 있으므로 별도 승인을 받은 뒤 한 번만 실행한다.

### 2. Fail closed before scheduling

다음 조건이 하나라도 충족되지 않으면 Cron SQL을 적용하지 않는다.

- corpus/operations SQL objects and service-role protections exist;
- collector and knowledge-gateway Functions are deployed;
- required Edge Function Secrets and Vault names exist;
- custom-secret rejection test succeeds;
- Account API guard reports a safe bounded status;
- one manual operation persists exactly one reservation and one sanitized terminal run;
- licensed corpus read returns a strict Snapshot without starting upstream collection.

## Deployment Sequence

### Phase A — Read-only preflight

1. Confirm current branch/worktree and linked Supabase project.
2. Run the focused SerpApi/Knowledge tests and full unit regression.
3. List deployed Functions and Secret names without reading values.
4. Check whether corpus/operations/Cron objects already exist, so idempotent reapplication does not
   hide an unexpected partial deployment.
5. Confirm no local or committed `SERPAPI_API_KEY` exists.

Expected result: a concrete delta list for the linked project, with no mutation.

Preflight result on 2026-08-25:

- linked project: `BlogPostingQuota` (`hocfjolcthvtgfaxjmse`);
- deployed `knowledge-gateway` predates the stored-corpus route and must be redeployed;
- `serpapi-news-collector` is not deployed;
- `SERPAPI_API_KEY` and `SERPAPI_COLLECTOR_SECRET` Secret names do not exist;
- corpus and collection-operations tables do not exist;
- no committed/local developer SerpApi key assignment was found;
- full unit regression: 814 passed, 0 failed.

### Phase B — Database foundations

Apply in this exact order:

1. `supabase/migrations/202608270015_serpapi_observation_corpus.sql`
2. `supabase/migrations/202608270014_serpapi_collection_operations.sql`

Do not apply `supabase/activation/serpapi_collection_cron.sql` yet. Verify tables, RLS, client revocations,
service-role-only RPCs and the 200-per-trailing-31-days budget constant after each script.

Applied and verified on 2026-08-25. The four corpus/control-plane tables exist with zero initial
rows. Each script committed as one transaction, so its schema, RLS, grants and RPC definitions were
applied atomically. A secondary remote schema dump was unavailable because local Docker is not
installed; the repository structure tests remain the grant/RLS definition verification.

### Phase C — Secrets and Functions

Required Edge Function Secrets:

- `SERPAPI_API_KEY`: BlogGenius developer SerpApi key;
- `SERPAPI_COLLECTOR_SECRET`: newly generated strong internal invocation secret.

Required Vault names:

- `serpapi_collection_project_url`: linked project Functions base URL;
- `serpapi_collection_collector_secret`: exactly the same collector secret used by the Function.

Deploy:

1. `serpapi-news-collector`
2. `knowledge-gateway`

The collector keeps `verify_jwt=false` only because it verifies the custom secret in constant time
before body parsing. `knowledge-gateway` preserves its existing licensed request boundary.

Verified on 2026-08-25:

- required Edge Function Secret names exist; values were not read;
- required Vault entries were created by the operator;
- `serpapi-news-collector` is ACTIVE at version 1 with platform JWT verification disabled;
- `knowledge-gateway` is ACTIVE at version 9 with platform JWT verification enabled;
- a request without the collector secret returned HTTP 401 / `UNAUTHORIZED` before live collection.

### Phase D — Negative and bounded live smoke

1. Call the collector without its custom secret and confirm rejection before Account/News access.
2. With explicit approval, invoke one `headlines_kr` manual operation using a unique
   `kco_manual_*` operation id.
3. Confirm the response contains sanitized aggregate counts only.
4. Verify the operation view reports:
   - safe Account API diagnostics;
   - one local budget reservation;
   - no active lease left behind;
   - no unexpected backoff.
5. Verify one sanitized collection run and normalized corpus observations; inspect counts and
   provenance, not raw payloads.
6. Repeat the same operation id only if idempotency needs live confirmation. It must not consume a
   second reservation or upstream search.
7. Call the licensed `purpose=serendipity` read and confirm a strict `news` Snapshot.

Verified on 2026-08-25:

- the approved `headlines_kr` manual operation consumed exactly one local reservation and returned
  six fetched, accepted and inserted observations with no rejection;
- one sanitized terminal run and six unexpired observations were persisted, and no active lease or
  provider backoff remained;
- the local trailing-window budget reports `1 / 200` used and `199` remaining;
- the first licensed read exposed a provider-identity mismatch: collection rows intentionally use
  the upstream observation identity `serpapi-google-news`, while the public Snapshot uses the
  logical provider identity `serpapi-corpus`;
- the corpus adapter was corrected to query the former and expose the latter, with a regression
  contract test, then `knowledge-gateway` was redeployed;
- the licensed app path now returns a strict fresh `news + server_gateway + serpapi-corpus`
  Snapshot containing all six stored observations;
- reading the corpus left the collection budget at `1 / 200`, proving that a user read does not
  start or reserve another upstream search.

### Phase E — Application verification

1. Restart BlogGenius against the deployed gateway.
2. Confirm the previous `recommendation_serendipity_corpus INVALID_REQUEST` warning disappears.
3. Use `새로운 발견` repeatedly and verify the News slot can rotate between stored corpus and
   query News while Trends and available owner history remain eligible.
4. Confirm corpus copy does not claim live freshness and evidence preserves provider, publisher,
   URL and timestamps.
5. Confirm no UI action invokes `serpapi-news-collector` and no generative AI usage occurs.

UI verification on 2026-08-25 exposed two policy/visibility issues before acceptance:

- all six smoke observations eventually entered the unbounded recently-shown exclusion set, so a
  healthy corpus returned zero and fell back to three Naver News queries;
- rotated Trends and owner-history candidates remained under the general 24-hour delivery cooldown,
  allowing News to fill all three cards after repeated explicit discovery requests;
- both News paths used the same `뉴스 소재` hint, so the public UI could not identify their origin.

The application now excludes only the three most recent corpus observations, relaxes only the
rotated cooldown for an explicit `새로운 발견` request, retains dismiss/completion cooldowns and
labels stored/query News as `발견 뉴스` / `네이버 뉴스`. Repeat UI verification then exposed that
the materializer reused a stable Recommendation id for a terminal rotated Candidate, so no new
actionable replacement could be persisted. Recommendation delivery identity now includes the
policy evaluation delivery key while Candidate identity and active dedupe protection remain stable.
The following verification exposed one more source-rotation defect: choosing the next News source
from the total delivered News-card count could repeat Naver News when a fallback batch contained
two Naver cards. The refresh service now reads the most recently delivered News transport instead;
query News candidates persist `query_news`, corpus candidates persist `stored_corpus`, and legacy
News candidates without transport metadata are treated as query News.
Direct API reproduction then showed `candidate_count=3` but `recommendation_count=0`: extensive UI
verification had reached the 100-item rolling daily materialization ceiling. That ceiling belongs
to automatic delivery, not an explicit AI-free `새로운 발견` request. Explicit discovery now
bypasses only the daily cap while retaining per-run/per-kind limits, active dedupe and explicit
dismiss/completion cooldowns. Refresh logging now separates newly persisted, deduplicated and
suppressed results so another policy block is visible without exposing content or provider data.
Repeat UI verification passed on 2026-08-25.

### Phase F — Cron activation and observation

Apply `supabase/activation/serpapi_collection_cron.sql` only after Phases A~E pass. Verify exactly these six
jobs exist:

- four daily headline jobs;
- one daily rotating focused-lane job;
- one daily cleanup job.

Inspect `cron.job`, recent `cron.job_run_details`, Function logs and
`read_knowledge_collection_operations('serpapi-google-news')`. Five collection slots per day use at
most 155 reservations in a 31-day window; the database hard limit remains 200 and the Account API
guard preserves a 50-search reserve.

Activated on 2026-08-25 at 19:40 KST through the linked `BlogPostingQuota` production project. The
four headline jobs, one rotating focused job and one cleanup job exist exactly once and all report
`active=true`. Activation itself started no collection run: operations remained at `1 / 200` used,
`199` remaining, with no provider backoff or failure. The first scheduled collection after
activation is the rotating focused slot at 21:20 KST; its Cron result, Function run and budget delta
still require observation before Stage 7 completion.

## Rollback and Emergency Stop

1. Unschedule the five collection jobs first; cleanup may remain if it is healthy.
2. Do not delete corpus, collection runs, reservations or provider state. They preserve retention,
   idempotency, audit and rolling-budget truth.
3. Rotate `SERPAPI_COLLECTOR_SECRET` and its Vault counterpart if the invocation secret may have
   leaked.
4. Disable or redeploy the collector only after scheduling is stopped.
5. A corpus-read failure is allowed to fall back to query News; it must not make Dashboard discovery
   unavailable.

## Documentation and Completion

- Add a canonical operations runbook containing deployment, monitoring, budget and emergency-stop
  commands without secrets.
- Update Knowledge and Memory architecture with verified production state.
- Record actual smoke counts and timestamps without article payloads or credentials.
- Archive the completed Stage 1~7 plans after user acceptance.
- Do not bump the application version in this feature stage.

## Acceptance Criteria

- Production contains the intended service-role-only corpus and control-plane objects.
- Only server Functions know the developer SerpApi credential.
- Exactly one approved live smoke reservation/search is consumed unless an idempotent replay is
  explicitly requested.
- Licensed corpus reads never trigger upstream SerpApi collection.
- Serendipity reads stored observations and preserves query-News fallback.
- Cron is activated last and remains bounded by both local and provider account guards.
- Secret values and raw provider responses never appear in output, logs, docs or Git.
- Unit/structure tests and post-deployment smoke verification pass before completion.
