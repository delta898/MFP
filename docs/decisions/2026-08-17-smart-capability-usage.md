# Smart Capability Usage Limits

## Decision

AI-backed and high-cost exploration is tracked independently from post-publication quota.
The policy unit is a monthly capability session, not a button click.

## Model

- `license_plans.smart_usage_limits` stores monthly limits per capability.
- `license_plans.smart_usage_rules` stores the number of provider requests allowed
  in a session and its lifetime.
- `license_capability_usage_sessions` records a consumed monthly unit for a
  license, capability, KST calendar month, and session ID.
- `license_capability_usage_operations` makes each provider request idempotent
  through reserve, commit, and release states.

The client keeps and resends a session ID across closing and reopening a
recommendation surface. Supabase remains authoritative: it validates the plan,
month, session budget, and concurrent reservations. After an active flow is
exhausted, the client starts a new session only after the user explicitly
agrees to use another monthly unit.

`session`, request budget, provider calls, and reservation are implementation
terms and must not appear in end-user UI. The UI explains only whether another
result is included and whether continuing will use one more available use.

## Initial capabilities

| Capability | User-facing feature | Requests per session | Test | Free | Pro | Ultra |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| `content_idea` | 글감 추천 | 2 | 40 | 20 | 80 | 300 |
| `keyword_discovery` | 키워드 탐색 | 5 | 40 | 20 | 80 | 300 |
| `title_recommendation` | AI 제목 추천 | 2 | 40 | 20 | 80 | 300 |

The first successful request opens and consumes one session. Cached results,
selection, and failed provider calls do not consume a monthly unit. Monthly
periods reset at 00:00 Asia/Seoul on the first day of each month.

`license_plans.smart_usage_limits` and `license_plans.smart_usage_rules` are
the runtime source of truth. Values embedded in a migration only bootstrap or
update that server-owned policy; changing a plan limit does not require an app
release.

## Success and exhaustion policy

- A request is committed only when the user receives a usable result produced
  by an external provider call.
- Input validation failures, cache hits, provider failures, and responses with
  no usable result are released and do not consume a monthly unit.
- Once the included requests are exhausted, the UI preserves the current
  results and asks before continuing. The confirmation shows the expected
  monthly remaining-count change and states that a failed generation is not
  charged.
- Account/dashboard requests that began before a successful capability use
  cannot overwrite the newer remaining count when their responses arrive
  later. The client reconciles them using a monotonic local usage revision;
  the next fresh server read remains authoritative.
- After a recommendation response supplies its usage snapshot, that surface
  renders the snapshot directly instead of switching between unrelated account
  refresh responses. While a continued recommendation is pending, the last
  confirmed count remains visible with a processing label; success replaces it
  and failure leaves it unchanged.
- A successful commit is followed by a read of the canonical monthly status.
  The response keeps the committed flow's included-request count, but monthly
  `used` and `remaining` values come from the same status read used by the
  account surface. Status-read failure does not turn a successful provider
  result into a failure; the committed response remains the fallback.
- A partially degraded provider flow is successful when it still produces the
  usable feature result promised by the API contract.
- `SMART_USAGE_EXHAUSTED` is the stable API signal for a monthly limit. The UI
  blocks the action and exposes the existing plan/upgrade action instead of
  accepting raw plan configuration from the client.

## Execution idempotency and reconciliation

Quota idempotency and provider-execution idempotency are separate contracts.
The Supabase operation ledger guarantees that one `operation_id` is committed
at most once. The application runtime must also ensure that the same logical
operation does not invoke the external provider more than once.

- The client creates one `operation_id` per logical request and reuses it for
  transport retries.
- Concurrent requests with the same operation ID share the same in-flight
  execution. A completed result may be replayed from the runtime result cache.
- The reserve response must distinguish a newly authorized execution from an
  already reserved or committed operation. An idempotent reserve response is
  not authorization to call the provider again.
- If the provider succeeds but quota commit fails, the feature result remains
  successful and is returned to the user. The operation is recorded in a
  durable local reconciliation queue and commit is retried with the same
  capability, session ID, and operation ID.
- A commit failure must never be compensated with `release`; release is valid
  only before a usable provider result exists.
- After process restart, a duplicate operation without a replayable result is
  reported as already processing/already processed. It is not regenerated
  unless the prior reservation expires and the provider itself can safely
  accept the same idempotency key.

The implementation and rollout history for this contract is retained in
`docs/plans/archive/smart-capability-usage-hardening-plan.md`.

## Rationale

`license_usage_operations` and `licenses.usage_count` remain dedicated to
publication quota. Extending them would combine two unrelated counters and
make plan changes or future capability additions error-prone. The new tables
reuse the proven reservation lifecycle but have their own policy and history.
