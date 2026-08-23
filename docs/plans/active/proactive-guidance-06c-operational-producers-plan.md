# Proactive Guidance Stage 06c: Operational Producers

## Status

- Phase: completed and user-approved on 2026-08-24
- Parent: `feature/proactive-guidance-main`
- Branch: `feature/proactive-guidance-06c-operational-producers`
- Approved: 2026-08-24

## Goal

Turn sanitized configuration readiness, unresolved owner JobRun failures and pending confirmation
state into grounded `setup_guidance`, `recovery_action` and `workflow_hint` candidates. Producers
report facts and safe navigation only; later stages own policy, lifecycle and trusted execution.

## Architecture

```text
CONFIG readiness -----> operational state collector -----> setup-guidance-v1
owner JobRun history --> sanitized facts ------------+---> job-recovery-v1
pending confirmations -> counts/identity only -------+---> pending-workflow-v1
```

## Owner Job Boundary

- Job recovery uses owner-scoped history rather than one Telegram conversation.
- The existing `Owner -> Event -> Action -> JobRun` graph path is queried; no new relation or
  historical migration is required.
- Only `id`, `job_name`, `status`, `started_at` and `finished_at` leave the memory adapter.
- `result_json`, provider messages, exception text and request params never enter operational state.
- The latest terminal run per normalized job name wins. A newer successful run resolves an older
  failure and suppresses its recovery candidate.

## Operational State Contract

The collector emits a strict local read model containing:

- owner id and observation time;
- boolean readiness for essential config, Google Sheets, Naver Blog and WordPress;
- sanitized recent owner jobs;
- pending confirmation id, status and timestamps only;
- bounded stable diagnostic codes.

The collector may read an injected runtime config object but never copies config values. It may
consume current context as a fail-open fallback when an owner JobRun reader is unavailable.

## Producers

### setup-guidance-v1

- missing Google Sheets -> `settings.general`;
- no configured publishing platform -> `settings.blog`;
- Naver configured but WordPress missing -> optional multi-channel foundation guidance through
  `settings.wordpress`;
- at most three candidates, using only `system_state / observed` evidence;
- wording never promises advertising approval, revenue or business results.

### job-recovery-v1

- latest run per job name only;
- unresolved failure must be no older than 72 hours;
- at most three candidates ordered by newest failure;
- presentation-only handoff to `logs.system`;
- no automatic retry, error-body copy or capability execution.

### pending-workflow-v1

- one candidate summarizes one or more pending confirmations;
- confirmation params, previews and proposed values are excluded;
- no false approve/reject action is exposed before Stage 8;
- handoff remains `null` until the Recommendation Center has a trusted pending-action surface.

## Contract Additions

Add `settings.general` and `settings.blog` to the canonical presentation surface allowlist. Existing
surfaces and public DTO redaction remain unchanged.

## Compatibility

- The legacy suggestion adapter remains active for current UI/Telegram compatibility.
- New producers do not materialize recommendations or write lifecycle events in Stage 6.
- No visible UI or Telegram behavior changes in 06c.

## Tests

- owner-scoped JobRun query and context packet fallback;
- newer successful run suppresses an older failure;
- jobs from another owner cannot enter the packet;
- old failures, invalid names and non-failures are excluded;
- raw job result and confirmation details cannot escape;
- readiness collector exposes booleans only;
- setup copy and presentation surfaces are valid and do not promise revenue;
- each producer emits canonical candidates and remains independently runnable;
- structure guard blocks config imports, policy, lifecycle, UI and Telegram dependencies;
- full unit regression.

## Verification

- owner JobRun query and memory context tests passed;
- sanitized state collector and three producer contract tests passed;
- common producer runtime composition and structure guards passed;
- full unit regression: 658 passed;
- no visible UI surface changed, so user UI testing is not required for 06c.
