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

The client keeps and resends a session ID while a recommendation surface is
open. Supabase remains authoritative: it validates the plan, month, session
budget, and concurrent reservations.

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

The implementation and rollout work for this contract is tracked in
`docs/plans/active/smart-capability-usage-hardening-plan.md`.

## Rationale

`license_usage_operations` and `licenses.usage_count` remain dedicated to
publication quota. Extending them would combine two unrelated counters and
make plan changes or future capability additions error-prone. The new tables
reuse the proven reservation lifecycle but have their own policy and history.
