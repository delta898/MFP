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

| Capability | User-facing feature | Requests per session |
| --- | --- | --- |
| `content_idea` | 글감 추천 | 2 |
| `keyword_discovery` | 키워드 탐색 | 5 |
| `title_recommendation` | AI 제목 추천 | 2 |

The first successful request opens and consumes one session. Cached results,
selection, and failed provider calls do not consume a monthly unit. Monthly
periods reset at 00:00 Asia/Seoul on the first day of each month.

## Rationale

`license_usage_operations` and `licenses.usage_count` remain dedicated to
publication quota. Extending them would combine two unrelated counters and
make plan changes or future capability additions error-prone. The new tables
reuse the proven reservation lifecycle but have their own policy and history.
