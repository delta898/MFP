# Telegram Network Resilience Development

- Branch: `codex/telegram-network-resilience`
- Base branch: `dev`
- Start date: 2026-09-15
- Status: complete; verified and ready for integration

## User need and goal

Telegram Web and general BlogGenius networking work, but Node 24 Telegram Bot
API calls can fail with an opaque `EFATAL: AggregateError`. The application
must tolerate slow IPv4 plus unavailable IPv6, explain the real failure without
exposing credentials, and avoid stopping inbound polling after a burst of
unclassified errors.

## Confirmed evidence

- Default Axios/Node dual-stack requests reproduced `ETIMEDOUT` for Telegram
  IPv4 and `EHOSTUNREACH` for Telegram IPv6.
- IPv4-forced `getMe` and `getChat` both returned HTTP 200, proving the stored
  Bot Token and Chat ID are valid.
- Increasing the dual-stack family-attempt timeout from Node 24's 250ms default
  to 1000ms also succeeded.
- Existing logs discard nested `AggregateError.errors`, and one send path logs
  an empty message when an HTTP response exists without a body.

## Scope

1. Apply an early, bounded Node network-family attempt timeout while preserving
   both IPv4 and IPv6.
2. Add a shared Telegram network policy with safe error classification,
   credential-redacted diagnostics, and IPv4 fallback for retryable family
   selection failures.
3. Use the policy for outbound notification/connection checks and inbound bot
   polling requests.
4. Split connection verification into Bot Token, Chat ID/access, and test-message
   stages with actionable UI-safe results.
5. Add bounded polling backoff and accurate stop/recovery status instead of a
   rapid five-error burst with misleading token guidance.
6. Add focused unit/contract tests and update canonical operational docs.
7. Use the canonical `LISTEN_PORT` for every local UI API callback, keep binding
   addresses separate from loopback client destinations, and prevent raw local
   connection errors from reaching Telegram users.
8. Reject ambiguous legacy intent guesses and handle strict, standalone greetings
   as conversation instead of accidental status queries.

## Non-goals

- Forcing all BlogGenius, Chromium, or browser automation traffic to IPv4.
- Changing stored Telegram credentials or sending messages outside the explicit
  connection-test flow.
- Changing other provider behavior beyond the shared Node connection-attempt
  timeout.

## Design decisions and tradeoffs

- Preserve dual-stack globally; a longer family-attempt window avoids breaking
  IPv6-only/NAT64 environments.
- Scope IPv4 fallback to Telegram and only to connection-family failures. HTTP
  authentication, Chat ID, conflict, and rate-limit errors must not be retried
  as network-family failures.
- Never log request URLs because Telegram Bot API URLs contain the Bot Token.
- Logs may include error class, safe code, syscall, IP family/address, HTTP
  status, Telegram error code/description, retry delay, and attempt number.
- The UI receives corrective categories and safe messages, never raw credential
  material or unrestricted response bodies.

## Verification plan

- Network policy and error-sanitization unit tests, including nested
  `AggregateError` fixtures.
- Telegram notification and staged connection-test tests for network, token,
  Chat ID, rate-limit, and successful delivery paths.
- Inbound bot construction and polling error/backoff contract tests.
- Focused settings service/controller/UI contract tests.
- Relevant browser smoke after the UI-visible flow is complete.
- Full unit suite before merge, with explicit user approval.

## Progress and result

- Added an early runtime network policy that preserves dual-stack operation and
  increases Node's family-attempt timeout to a bounded 1500ms.
- Added Telegram-specific safe error classification, nested aggregate-error
  diagnostics, credential redaction, and IPv4 fallback for retryable network
  failures.
- Changed connection verification to check Bot Token, Chat ID access, and test
  message delivery in order, returning stage-specific corrective guidance.
- Changed inbound polling to use IPv4 compatibility, install listeners before
  polling starts, reset state after successful polls, and use bounded
  exponential retry delays before an accurate automatic stop.
- Exposed only the safe last inbound failure reason to Settings and updated both
  current and legacy connection-test feedback.
- Removed the undefined legacy `UI_SERVER_PORT` dependency from Telegram,
  Trends, and publishing callbacks. All internal requests now derive a loopback
  origin from `LISTEN_PORT`.
- Added strict greeting routing for messages such as `hihi`, removed the legacy
  parser rule that forced ambiguous text into the nearest action, and required
  an explicit supported query type before executing a data lookup.
- Replaced raw internal exception replies with stable user guidance while keeping
  error code, query type, and low-level cause in application logs.
- Updated startup and Settings architecture documentation.

## Automated verification

- JavaScript syntax checks passed for every changed runtime and UI module.
- Focused network, Telegram, Settings, startup, capability, and UI contracts: 57 passed,
  0 failed.
- Browser UI smoke: passed with 311 fixture requests.
- Full unit suite: 1,767 passed, 0 failed, 1 platform-specific Windows test
  skipped on macOS (1,768 total).
- `git diff --check`: passed.

## Remaining checks and risks

- A hands-on Windows check should confirm connection testing, safe error text,
  inbound polling recovery, and log output on the originally affected network.
- The user confirmed the corrected local Telegram flow behaves normally after
  restarting the application.
- No production Telegram message was sent as part of automated verification;
  message delivery remains covered by mocked tests and the user's explicit
  connection-test action.
