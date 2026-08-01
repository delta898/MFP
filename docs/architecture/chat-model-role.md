# Chat Model Role

## Purpose

Chat Model is a reusable text-model role for Telegram, Agent Memory, MCP support
work, and other frequent lightweight tasks. It is not a separate model kind:
both writing and Chat selections resolve through the `text` Model Catalog and the
same trusted transport registry.

## Configuration

`ai_settings.CHAT_MODEL` has two source modes:

```json
{
  "source": "writing",
  "selection": null
}
```

- `writing` resolves `TEXT_MODEL` at call time. It never copies the writing model
  or its API key, so later writing-model changes are followed automatically.
- `dedicated` resolves `selection` independently using the text catalog. The
  selection uses the same provider/code/API-key shape as `TEXT_MODEL`; direct
  models additionally retain their name and Base URL.

Legacy non-empty `{base_url, api_key, model}` settings normalize to a dedicated
direct selection. Empty legacy settings normalize to `writing`. The canonical
shape is persisted on the next settings save.

## Runtime Dispatch

`resolveChatModelSettings()` resolves the role. `callChatText()` then passes that
resolved config to the shared text dispatcher also used by `callWritingText()`.
Provider transports therefore behave identically in writing and Chat roles.

A failed dedicated Chat Model does not silently fall back to the writing model.
Changing provider implicitly could change cost, behavior, and data routing.

## Consumer Policy

- Telegram, Agent Memory, and MCP support work always use Chat Model.
- Naver comment drafts retain the writing/Chat task choice.
- SNS retains none/writing/Chat.
- Telegram has no additional model selector or model-setting capability.

Connection checks never generate content. When Chat uses the writing source, the
check resolves and checks the current writing model; otherwise it checks the
dedicated selection.
