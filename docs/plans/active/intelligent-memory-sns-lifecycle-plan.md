# Intelligent Memory: SNS Lifecycle Integration

## Status

- Phase: implemented and locally verified
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-sns-lifecycle`

## Goal

Connect manual SNS publishing and RSS/Buffer distribution to the shared
owner-scoped lifecycle contract without changing Buffer reconciliation, Sheet
status, media cleanup, retry, or notification behavior.

SNS does not currently expose a remote draft stage, so this integration records
only explicit selection and confirmed publication.

## Manual Publishing Boundary

- After text, channels, image requirements, and per-service length limits are
  validated, one `sns/selected` event is recorded for the request.
- Each successful Buffer channel result records one `sns/published` event.
- The server request id identifies the selection operation.
- A Buffer post id is preferred as terminal evidence identity; channel/request
  identity is the fallback when Buffer confirms success without a post id.

## Automatic Distribution Boundary

- Rows excluded by source, channel, service policy, missing image, or formatting
  failure do not create selection evidence.
- Each formatted row entering Buffer processing records `sns/selected` using its
  stable delivery key.
- Direct Buffer success, recovered timeout success, and duplicate-confirmed
  success record `sns/published`.
- Terminal failures and unresolved timeouts do not create publication evidence.

## Provenance

Manual evidence preserves request, channel, service, Buffer status, external
link, and post id. Automatic evidence preserves entry key, Sheet row, delivery
key, source blog, channel, trigger, reconciliation, and duplicate-confirmation
state.

## Idempotency and Failure Policy

Automatic evidence ids are based on stable delivery keys, so polling and retry
cannot count the same delivery twice. Manual terminal events prefer the external
Buffer post id. The common best-effort recorder ensures GraphDB failure cannot
change an SNS publishing response.

## Verification

- `node --check` passed for the controller, manual service, distribution runner,
  API runtime, and UI server wiring.
- A manual partial-success mock recorded one selection and only the successful
  channel publication, using the request id and Buffer post id as evidence.
- An automatic distribution mock recorded selection for two eligible rows,
  publication for only the direct success, and no evidence for the skipped
  Instagram row.
- Reconciliation and duplicate-confirmation reuse the same confirmed-success
  branch as direct Buffer success; unresolved and terminal failures never enter
  that branch.
- Repeated automatic delivery keys reuse deterministic evidence ids.

Full unit and release suites remain part of pre-release validation.
