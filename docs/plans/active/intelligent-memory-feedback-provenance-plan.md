# Intelligent Memory: Feedback Provenance

## Status

- Phase: implemented and locally verified
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-feedback-provenance`

## Goal

Retain existing suggestion/artifact feedback behavior while adding an explicit
owner lifecycle fact only when the target content domain is known. Feedback is
evidence about a target, not a generic final state for every confirmation.

## Mapping Boundary

The initial controlled artifact mapping is:

- `content_idea` -> `blog / feedback`;
- `topic` -> `blog / feedback`;
- `shopping_item` -> `shopping / feedback`.

Workflow, recovery, and next-action suggestions remain generic suggestion
feedback. They continue updating their existing preference keys but are not
misclassified as blog, shopping, or SNS activity. Generic confirmation approval
and rejection are also excluded.

## Evidence Contract

Lifecycle feedback preserves target artifact id/type, feedback polarity,
Telegram actor/conversation/message, and callback request id. Callback id is the
idempotency identity, so Telegram retries cannot increment the same feedback or
create duplicate lifecycle evidence.

The existing `artifact.helpful`, `artifact.not_helpful`, and `suggestion.*`
events remain the source for current preference projections. The new lifecycle
event is an additional explainable owner fact.

## Safety

- no historic feedback is reclassified;
- unknown artifact types create no lifecycle event;
- suggestion type is never guessed into a content domain;
- a memory failure does not change the Telegram callback response;
- existing preference behavior remains intact.

## Verification

- controlled artifact mapping and unknown-type rejection;
- target lookup preserves artifact id/title/type;
- callback ids are stable generic-event and lifecycle evidence identities;
- only content-qualified artifact feedback enters owner activity summary;
- full unit and release suites remain deferred to pre-release.

## Implementation Verification

- Controlled mapping classified content ideas/topics as blog and shopping items
  as shopping while rejecting a user-insight artifact.
- A Telegram callback mock retained callback, actor, conversation, message,
  target, polarity, and artifact-type provenance.
- The callback produced one `blog / feedback` lifecycle fact with stable
  callback evidence identity and preserved the existing generic artifact event.
- Suggestion and confirmation paths received no content-domain inference.
