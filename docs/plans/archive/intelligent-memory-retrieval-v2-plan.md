# Intelligent Memory: Owner Retrieval Context v2

## Status

- Phase: implemented
- Integration branch: `codex/feature/intelligent-memory`
- Work branch: `codex/feature/intelligent-memory-retrieval-v2`

## Goal

Expose durable owner memory to agents and future services without confusing it
with one Telegram conversation's short-term history.

## Contract

Context packet schema version 2 retains all version 1 fields and adds
`owner_memory`:

- `owner_user_id`: durable installation-local owner;
- `activity`: owner activity stages across blog, shopping, and SNS;
- `topic_semantics`: frequency/recency summaries for keyword, category, platform;
- `recent_artifacts`: bounded cross-channel owner evidence;

Conversation fields continue to describe the current actor and conversation.
Owner fields describe durable cross-channel memory. Unknown explicit owners return
empty owner data and never broaden to global memory.

Collection-health auditing remains an explicit diagnostic rather than running
on every agent request. Each owner read is isolated so one unavailable projection does not remove the
remaining context. The packet is retrieval-only and must not be nested into a
new stored event.

## Deferred

- recommendation ranking and provider calls;
- prompt-specific context compression;
- account-to-local-owner linking;
- user-facing UI.
