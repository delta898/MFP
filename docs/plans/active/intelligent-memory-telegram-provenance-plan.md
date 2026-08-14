# Intelligent Memory: Telegram Provenance

## Status

- Phase: implemented and locally verified
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-telegram-provenance`

## Goal

Keep content domain, evidence stage, and transport provenance as independent
axes. Telegram is a channel adapter, not an activity domain. A Telegram request
that creates a Naver draft therefore remains `blog / drafted`, with Telegram
conversation and request identity retained as provenance.

## Provenance Contract

The common interaction provenance fields are `channel`, `actor_type`,
`actor_id`, `conversation_id`, `message_id`, `request_id`, and source write path.
The contract accepts runtime-context and snake/camel case inputs so existing
callers can migrate additively.

Missing channel identity no longer defaults saved UI or automation topics or
shopping items to Telegram. Those writes remain owner-scoped under the local
system channel while their detailed write path remains in the source field.

## Canonical Telegram Content Requests

The existing content request bundle already retains the original conversation,
message, user, channel, and request ids. Confirmation callbacks reconstruct
their execution context from that canonical request instead of treating the bot
confirmation message as the original user message.

Topic rows carry this memory-only provenance through the Sheet append boundary.
It is not added as a Sheet column. The resulting `content.topic.registered`
event and topic artifact preserve the request id, while the event links to the
original Telegram conversation/message and the durable local owner.

## Lifecycle Compatibility

Activity lifecycle normalization accepts the same provenance contract and
passes `message_id` to the event store. Existing UI and automation integrations
remain valid and keep their local/system defaults until their adapters provide
a richer context.

## Safety

- additive only; no existing event or artifact is rewritten;
- no inference of historic conversation/request identity;
- raw conversation does not become a blog preference by itself;
- missing provenance cannot fail the primary Sheet or publishing operation;
- canonical request ids provide stable execution identity where available.

## Remaining Audit

The next collection audit will separately address interactive messages that
currently bypass memory (commands/help) and inconsistent Agent outbound-message
recording. Notification-only Telegram messages should not be copied into the
conversation graph merely to create a complete transport transcript.

## Verification

- normalize runtime and legacy provenance shapes;
- preserve original Telegram message/request identity after confirmation;
- preserve compatibility for legacy `recordTopic(chatId, data)` callers;
- do not label owner-only UI/system topic writes as Telegram;
- pass activity `message_id` into the stored event;
- keep full unit and release suites for pre-release.

## Implementation Verification

- Syntax checks passed for the provenance contract, activity lifecycle, event
  store, register-topic capability, Telegram adapter, disabled store, and Sheet
  integration.
- A canonical request mock retained source message `101` and request
  `request-1` after confirmation message `999` initiated execution.
- Activity evidence propagated that original message and request identity.
- Legacy Telegram topic recording remained compatible.
- Owner-only topic and shopping writes used `local / SYSTEM` instead of a
  synthetic Telegram actor.
- Replaying the same Telegram channel/conversation/message/role identity reused
  one deterministic interaction-message event.
