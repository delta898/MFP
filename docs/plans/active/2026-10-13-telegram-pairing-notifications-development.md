# Telegram Pairing and Publishing Notifications

- Branch: `codex/telegram-pairing-notification-audit`
- Base/parent branch: `dev`
- Start date: 2026-10-13
- Status: Implementation in progress

## User need

The user wants Telegram setup to avoid asking for a Chat ID, which is difficult to find, and wants confidence that Telegram notifications arrive for automatic blog and SNS publishing. This is a small follow-up feature after the v0.6.0 release, with Telegram as the agreed discussion scope.

## Goal and scope

- Design a safe, understandable Telegram pairing flow based on the configured Bot Token and a user-initiated `/start` message.
- Map the existing Telegram notification settings and delivery paths for manual publishing, blog automation, continuous publishing, and SNS distribution.
- Identify correctness gaps, notification semantics, logging, and a proportionate implementation slice for a follow-up release.
- Keep the design extensible while preserving distinct outbound notification and inbound command capabilities.

## Explicit non-goals

- Implement the agreed pairing flow and automatic-publishing notifications.
- Do not build a general multi-provider notification framework or redesign Telegram agent capabilities.
- Do not support Telegram groups/channels in the initial pairing proposal unless the user expands scope.
- Do not migrate existing saved credentials or revoke/recreate a user's Bot Token.
- Do not send real Telegram messages or change external accounts during automated verification without explicit approval.

## Initial findings

- Settings Beta currently stores Bot Token, Chat ID, and an outbound delivery flag under optional services; inbound command reception has a separate toggle under app external connections.
- `src/telegram-bot.service.js` owns long polling and rejects messages from chats other than the configured Chat ID. It also contains a `sendNotification` helper that requires the inbound bot instance to be running.
- `src/telegram-service.js` sends outbound notifications directly through the Bot API and is already used by some publishing paths without requiring inbound polling.
- Blog automation, continuous publishing, SNS distribution, and individual publish actions use different notification gates and message behavior. SNS distribution currently sends a Telegram alert for final failures; it does not send a success summary.
- Some individual blog publish success paths call the bot-instance notification helper. Since inbound polling is separately controlled, this path may silently skip a notification when inbound reception is disabled.
- Telegram supports `getUpdates` long polling or webhooks. The desktop app already uses polling; concurrent consumers using the same bot token can conflict. Pairing therefore needs a single polling owner and explicit request approval.
- OpenClaw's documented flow also requires a user to message the bot, then an owner to approve a pairing request/code; it does not eliminate the need to authorize a destination.

## Proposed design questions

1. Pairing supports private one-to-one chats first; group support may be considered later.
2. The user starts the bot using its `t.me` deep link and `/start` parameter, copies a short-lived pairing code from Telegram into BlogGenius, and confirms it. Chat ID stays internal.
3. The user explicitly requested that Telegram notifications apply to automated and periodic workflows, not manual blog/SNS/card-news publishing.

## User-confirmed notification direction

- Do not send Telegram messages for user-triggered manual blog posts, manual SNS posts, or manual card-news publishing.
- Send result notifications for automation and periodic publishing workflows.
- Use one summary per automatic blog run, including success and failure counts.
- For continuous publishing, report completed, failed, and needs-attention outcomes.
- For SNS automatic sharing, report the final batch outcome (success summary and final failures); do not alert for transient attempts that later succeed.
- A user pressing “run now” on an automation flow receives the same run summary because the operation is still an automatic workflow.
- Keep one-time manual publish actions silent.

## Planned stages

1. Replace Chat ID entry with Bot Token verification, a deep link to the identified bot, short-lived pairing code entry, and a test message. (Current implementation stage.)
2. Keep pairing polling exclusive and restore inbound command polling after pairing completes, is cancelled, or expires.
3. In a later stage, normalize Telegram notification events so manual publishing stays silent and automatic workflows get the agreed result summaries.
4. Add focused tests for pairing authorization/expiry and the notification event paths as each stage is implemented.
5. Run focused UI/API/runtime checks; request approval before broad test suites or any external Telegram send.

## Decisions and tradeoffs

- Keep inbound command reception and outbound notification delivery as separate capabilities. This preserves the existing settings model and prevents notification setup from implicitly enabling command execution.
- Prefer reusing the existing polling owner instead of adding a second Telegram update consumer. Telegram's polling and webhook update mechanisms are mutually exclusive for a bot token.
- Prefer owner-approved pairing over automatically binding the first chat that messages the bot, which could let an unintended user capture the notification destination.
- Pairing uses a short-lived code returned by the bot after the user opens the bot's `t.me` deep link and starts a private chat. The user enters the code in BlogGenius; the server stores Chat ID only after successful validation.
- Pairing is private-chat-only for the initial release. Groups may be considered later.
- Deep links use the verified bot username from `getMe`; users do not need to search for or manually identify their bot.
- Pairing update polling temporarily owns the token's single polling stream and must restore configured inbound polling after completion, cancellation, or timeout.

## Progress and verification

- 2026-10-13: Created this feature branch from `dev` at `3fda6740`.
- 2026-10-13: Inspected Telegram settings, polling, notification services, and automatic publishing call sites.
- 2026-10-13: User approved private-chat pairing with a code returned by the bot and a `t.me` deep link based on the verified bot username.
- 2026-10-13: Implemented the first pairing slice: Bot Token verification via `getMe`, private-chat deep link with a one-time `/start` payload, expiring code entry, internal Chat ID persistence, and a test-message attempt after pairing. Pairing checks for an existing webhook and does not replace it. The user confirmed the pairing flow works.
- 2026-10-13: Refined the Settings UI into two numbered steps: open the verified Telegram bot and start the chat, then enter the code and confirm. The Telegram link receives keyboard focus without scrolling after Bot Token verification; the code input removes spaces and normalizes letters to uppercase. User requested the action buttons align below the code input.
- 2026-10-13: Investigated slow cancellation. `node-telegram-bot-api` waits for the current `getUpdates` long poll to complete when `stopPolling()` is called without options; pairing polls with a 10-second timeout. Cancellation now aborts that active polling request, and the UI displays a short in-progress state while awaiting cancellation. Focused runtime, service, and route checks (27 tests) and browser UI smoke passed after the refinement.
- 2026-10-13: Moved Telegram result feedback beside its persistent status badge. The shared settings-card foundation now supports opt-in transient feedback; successful verification, pairing, and cancellation notices dismiss after 4.5 seconds, while progress and errors stay visible until the next result. Removed Telegram's bottom feedback/footer slot to eliminate its reserved whitespace. Other cards retain their existing behavior for later review and adoption. Added spacing between the pairing confirmation and cancel actions.
- 2026-10-13: Telegram/settings UI contract tests (14) and browser UI smoke passed after the inline-feedback change (500 fixture requests; two Google Fonts requests blocked by the harness). JavaScript syntax checks and `git diff --check` passed.
- Automatic notification event consolidation remains a subsequent stage.

## Final result

Pairing flow implementation is complete for the first stage; real Telegram UI acceptance and notification consolidation remain pending.
