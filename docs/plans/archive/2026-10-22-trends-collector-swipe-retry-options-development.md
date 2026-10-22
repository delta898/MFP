# Trends Collector Swipe and Retry Options

## Branch

- Branch: `codex/trends-collector-retry-debug-options`
- Start date: 2026-10-22
- Base/parent branch: `release/v0.7.0` (`1a259c25`)
- Status: Complete; merged into `release/v0.7.0` as `effed49d`

## User need and goal

The Production Trends collector uses Playwright to swipe through Naver Creator Advisor categories. Timing-sensitive swipes sometimes miss categories or keywords, leaving fewer than the expected 32 categories × 20 keywords (640 rows). The user wants to debug browser behavior and configure swipe pacing and bounded retries before registering reliable cron commands.

## Scope

- Add CLI controls to show/hide the browser, configure delay after swipes, and configure maximum completeness retries.
- Validate expected category and keyword counts before any API write; retry incomplete collection and fail closed if the final result remains incomplete.
- Keep a useful default for the current expected dataset (32 categories, 20 keywords each, 640 rows) while allowing test runs to override expectations.
- Document production command examples and tuning guidance.

## Non-goals

- Change Naver authentication or Supabase/API write contracts.
- Make real Production collection or publish data during implementation verification.
- Add cron installation or scheduling behavior.

## Current flow and design

- `commands/collect_production.sh` forwards arguments to `bin/collect.js`.
- CLI currently supports date, dry-run, and Production confirmation. Browser headless mode exists as `TRENDS_HEADLESS`; the shared Naver collector hard-codes a 400ms post-swipe wait.
- The Application/CLI collects once, builds one payload, then optionally confirms and writes it. A final completeness guard must run before confirmation/write.
- The shared collector owns browser launch and swipe timing (`shared/naver-trends-core/`); CLI parsing and collection retry orchestration belong to `apps/trends/trends-collector/bin/collect.js`.
- The carousel does not expose a direct category-targeted collection path. Each retry re-runs a full scan from the beginning and discards the previous attempt so category order and ranking stay from one consistent snapshot.
- Default verification uses 32 non-demographic categories with 20 unique keywords each. If retries are exhausted, the run fails before Production confirmation or API write.

## Decisions

- Preserve headless as the default; provide explicit `--headed` and `--headless` switches, with CLI taking precedence over `TRENDS_HEADLESS`.
- Preserve the current 400ms swipe settle default and make it adjustable.
- Interpret retry count as retries after the initial attempt (default 3, up to 4 total scans).
- Every retry resets collected data and starts the full carousel scan again; never merge rows across attempts.
- The user will perform multi-angle live collection tests and choose final cron tuning values.

## Implementation stages

1. Add CLI/env parsing and validated config for browser mode, swipe delay, expected category/keyword counts, and retries.
2. Pass swipe delay into the shared collector and expose collection completeness diagnostics.
3. Retry incomplete scans from a clean state and prevent writes after exhausted retries.
4. Update collector documentation and add focused tests for parsing, retry behavior, and fail-closed Production writes.

## Verification and handoff

- Run focused collector tests using mocks and shared collector contract checks; do not call Naver, AI, or Production services.
- Manual live browser/scrape behavior and final cron settings remain for the user to validate.
- No version bump or push was included. The user requested `[cmd]`, authorizing commit and parent merge.

## Implementation progress

- Added `--headed`/`--headless`, `--swipe-delay-ms`, `--max-retries`, `--expected-categories`, and `--keywords-per-category`, with validated CLI and cron environment settings.
- Wired swipe delay into the shared Naver collector; each retry starts a clean full scan, and only a complete final result can reach API confirmation/write.
- Added completeness diagnostics and dry-run support for inspecting incomplete collection results.
- Updated Production command help and collector usage documentation.
- `node --test apps/trends/trends-collector/bin/collect.test.js`: passed (18 tests).
- `node --test shared/naver-trends-core/index.test.js`: passed (6 tests).
- `bash -n apps/trends/trends-collector/commands/collect_production.sh` and `git diff --check`: passed.
- Production command `--help` output checked. No external Naver or API collection has been performed.
- User should tune with `--dry-run --headed` (where a GUI session exists), then select final values for cron. Set `--headed` only for interactive debugging; cron should remain headless.
- The branch was initially cut from `dev` at the shared base `512679a6`; after confirming the intended parent, it was rebased onto `release/v0.7.0` at `1a259c25` before merge.
- Fast-forward merge completed; the final feature commit is `effed49d`.
